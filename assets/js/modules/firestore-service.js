import { db } from "../firebase-config.js";
import { getCurrentUser } from "./auth-service.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { isAdminUser } from "./admin-config.js";

function requireCurrentUser() {
    const user = getCurrentUser();

    if (!user) {
        throw new Error('AUTH_REQUIRED');
    }

    return user;
}

function requireAdminUser() {
    const user = requireCurrentUser();

    if (!isAdminUser(user)) {
        throw new Error('ADMIN_REQUIRED');
    }

    return user;
}

function buildRatingMap(ratingSnapshots) {
    const ratingMap = new Map();

    ratingSnapshots.forEach((documentSnapshot) => {
        const rating = documentSnapshot.data();
        const productId = rating.productId;
        const value = Math.max(1, Math.min(Number(rating.value) || 0, 5));

        if (!productId || !value) {
            return;
        }

        const currentEntry = ratingMap.get(productId) || {
            total: 0,
            count: 0
        };

        currentEntry.total += value;
        currentEntry.count += 1;
        ratingMap.set(productId, currentEntry);
    });

    return ratingMap;
}

function buildUserRatingMap(ratingSnapshots, userId) {
    const userRatingMap = new Map();

    if (!userId) {
        return userRatingMap;
    }

    ratingSnapshots.forEach((documentSnapshot) => {
        const rating = documentSnapshot.data();

        if (rating.userId === userId && rating.productId) {
            userRatingMap.set(rating.productId, Math.max(1, Math.min(Number(rating.value) || 0, 5)));
        }
    });

    return userRatingMap;
}

function normalizeProduct(documentSnapshot, ratingMap = new Map(), userRatingMap = new Map()) {
    const product = documentSnapshot.data();
    const ratingEntry = ratingMap.get(documentSnapshot.id);
    const ratingAverage = ratingEntry ? Number((ratingEntry.total / ratingEntry.count).toFixed(1)) : 0;
    const ratingsCount = ratingEntry ? ratingEntry.count : 0;
    const userRating = userRatingMap.get(documentSnapshot.id) || 0;

    return {
        id: documentSnapshot.id,
        ...product,
        category: product.category || 'Товар',
        description: product.description || '',
        image: product.image || '',
        price: Number(product.price) || 0,
        ratingAverage,
        ratingsCount,
        userRating
    };
}

async function readProfile() {
    try {
        const user = getCurrentUser();

        if (!user) {
            return {};
        }

        const profileSnapshot = await getDoc(doc(db, 'profiles', user.uid));

        if (!profileSnapshot.exists()) {
            return {
                email: user.email || ''
            };
        }

        return {
            email: user.email || '',
            ...profileSnapshot.data()
        };
    } catch (error) {
        console.error('Помилка читання профілю з Firestore:', error);
        return {};
    }
}

async function saveProfile(profile) {
    const user = requireCurrentUser();
    await setDoc(doc(db, 'profiles', user.uid), {
        ...profile,
        userId: user.uid
    });
}

async function readOrders() {
    try {
        const user = getCurrentUser();

        if (!user) {
            return [];
        }

        const ordersSnapshot = await getDocs(query(collection(db, 'orders'), where('userId', '==', user.uid)));

        return ordersSnapshot.docs
            .map((documentSnapshot) => {
                const order = documentSnapshot.data();

                return {
                    ...order,
                    id: order.id || documentSnapshot.id,
                    createdAtMs: Number(order.createdAtMs) || Date.parse(order.createdAt) || 0
                };
            })
            .sort((leftOrder, rightOrder) => rightOrder.createdAtMs - leftOrder.createdAtMs);
    } catch (error) {
        console.error('Помилка читання замовлень з Firestore:', error);
        return [];
    }
}

async function readAllOrders() {
    requireAdminUser();

    const ordersSnapshot = await getDocs(collection(db, 'orders'));

    return ordersSnapshot.docs
        .map((documentSnapshot) => {
            const order = documentSnapshot.data();

            return {
                ...order,
                id: order.id || documentSnapshot.id,
                createdAtMs: Number(order.createdAtMs) || Date.parse(order.createdAt) || 0
            };
        })
        .sort((leftOrder, rightOrder) => rightOrder.createdAtMs - leftOrder.createdAtMs);
}

async function saveOrder(order) {
    const user = requireCurrentUser();
    await setDoc(doc(db, 'orders', order.id), {
        ...order,
        userId: user.uid
    });
}

async function updateOrderStatus(orderId, status) {
    const adminUser = requireAdminUser();

    await updateDoc(doc(db, 'orders', orderId), {
        status,
        confirmedAt: new Date().toISOString(),
        confirmedBy: adminUser.email || adminUser.uid
    });
}

async function readUserCart() {
    try {
        const user = getCurrentUser();

        if (!user) {
            return [];
        }

        const cartSnapshot = await getDoc(doc(db, 'carts', user.uid));

        if (!cartSnapshot.exists()) {
            return [];
        }

        const cartData = cartSnapshot.data();
        return Array.isArray(cartData.items) ? cartData.items : [];
    } catch (error) {
        console.error('Помилка читання кошика з Firestore:', error);
        return [];
    }
}

async function saveUserCart(items) {
    const user = requireCurrentUser();
    await setDoc(doc(db, 'carts', user.uid), {
        userId: user.uid,
        items,
        updatedAt: new Date().toISOString()
    });
}

async function readProducts() {
    try {
        const user = getCurrentUser();
        const [productsSnapshot, ratingsSnapshot] = await Promise.all([
            getDocs(collection(db, 'products')),
            getDocs(collection(db, 'productRatings'))
        ]);
        const ratingMap = buildRatingMap(ratingsSnapshot.docs);
        const userRatingMap = buildUserRatingMap(ratingsSnapshot.docs, user?.uid || '');

        return productsSnapshot.docs
            .map((documentSnapshot) => normalizeProduct(documentSnapshot, ratingMap, userRatingMap))
            .sort((leftProduct, rightProduct) => {
                if (leftProduct.category !== rightProduct.category) {
                    return leftProduct.category.localeCompare(rightProduct.category, 'uk');
                }

                return leftProduct.name.localeCompare(rightProduct.name, 'uk');
            });
    } catch (error) {
        console.error('Помилка читання товарів з Firestore:', error);
        return [];
    }
}

async function createProduct(product) {
    requireAdminUser();

    const preparedProduct = {
        name: product.name,
        category: product.category,
        description: product.description,
        image: product.image,
        price: Number(product.price) || 0,
        createdAt: new Date().toISOString()
    };

    const productReference = await addDoc(collection(db, 'products'), preparedProduct);
    const productSnapshot = await getDoc(productReference);

    return normalizeProduct(productSnapshot);
}

async function updateProduct(productId, product) {
    requireAdminUser();

    await setDoc(doc(db, 'products', productId), {
        name: product.name,
        category: product.category,
        description: product.description,
        image: product.image,
        price: Number(product.price) || 0,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    const productSnapshot = await getDoc(doc(db, 'products', productId));
    const ratingsSnapshot = await getDocs(query(collection(db, 'productRatings'), where('productId', '==', productId)));
    const ratingMap = buildRatingMap(ratingsSnapshot.docs);
    return normalizeProduct(productSnapshot, ratingMap);
}

async function saveProductRating(productId, value) {
    const user = requireCurrentUser();
    const ratingValue = Math.max(1, Math.min(Number(value) || 0, 5));
    const ratingId = `${productId}_${user.uid}`;

    await setDoc(doc(db, 'productRatings', ratingId), {
        productId,
        userId: user.uid,
        userEmail: user.email || '',
        value: ratingValue,
        updatedAt: new Date().toISOString()
    });

    const ratingsSnapshot = await getDocs(query(collection(db, 'productRatings'), where('productId', '==', productId)));
    const ratingMap = buildRatingMap(ratingsSnapshot.docs);
    const ratingEntry = ratingMap.get(productId);

    return {
        ratingAverage: ratingEntry ? Number((ratingEntry.total / ratingEntry.count).toFixed(1)) : 0,
        ratingsCount: ratingEntry ? ratingEntry.count : 0,
        userRating: ratingValue
    };
}

export {
    createProduct,
    readAllOrders,
    readProducts,
    readOrders,
    readProfile,
    readUserCart,
    saveOrder,
    saveProductRating,
    saveProfile,
    saveUserCart,
    updateOrderStatus,
    updateProduct
};