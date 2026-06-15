import {
    readProducts,
    readOrders,
    readProfile,
    readUserCart,
    saveOrder,
    saveProductRating,
    saveProfile,
    saveUserCart
} from "./modules/firestore-service.js";
import {
    getCurrentUser,
    loginWithEmail,
    logoutUser,
    observeAuthState,
    registerWithEmail,
    waitForAuthReady
} from "./modules/auth-service.js";
import { isAdminCredentials, isAdminUser } from "./modules/admin-config.js";

const CART_STORAGE_KEY = 'superclothing-cart';
const CART_ITEM_LIMIT = 10;
const WHOLESALE_MESSAGE = 'Для оптових замовлень дзвоніть нам за номером у розділі контаки';
let cartState = [];

function readCartFromStorage() {
    try {
        const rawCart = localStorage.getItem(CART_STORAGE_KEY);
        const parsedCart = rawCart ? JSON.parse(rawCart) : [];
        return Array.isArray(parsedCart) ? parsedCart : [];
    } catch (error) {
        return [];
    }
}

function readCart() {
    return Array.isArray(cartState) ? cartState : [];
}

function writeCartToStorage(cart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

async function saveCart(cart) {
    cartState = Array.isArray(cart)
        ? cart.map((item) => ({
            ...item,
            qty: Math.min(Math.max(Number(item.qty) || 1, 1), CART_ITEM_LIMIT)
        }))
        : [];

    if (getCurrentUser()) {
        await saveUserCart(cartState);
    } else {
        writeCartToStorage(cartState);
    }

    updateCartIndicators(cart);
}

function mergeCartItems(primaryCart, secondaryCart) {
    const mergedCart = primaryCart.map((item) => ({ ...item }));

    secondaryCart.forEach((incomingItem) => {
        const existingItem = mergedCart.find((item) => item.name === incomingItem.name && item.price === incomingItem.price && item.size === incomingItem.size);

        if (existingItem) {
            existingItem.qty = Math.min(existingItem.qty + incomingItem.qty, CART_ITEM_LIMIT);
            return;
        }

        mergedCart.push({
            ...incomingItem,
            qty: Math.min(Math.max(Number(incomingItem.qty) || 1, 1), CART_ITEM_LIMIT)
        });
    });

    return mergedCart;
}

async function syncCartState() {
    const user = getCurrentUser();

    if (!user) {
        cartState = readCartFromStorage();
        updateCartIndicators(cartState);
        renderCartPage();
        return;
    }

    const localCart = readCartFromStorage();
    const remoteCart = await readUserCart();
    const nextCart = remoteCart.length > 0 ? mergeCartItems(remoteCart, localCart) : localCart;

    cartState = nextCart;
    await saveUserCart(nextCart);
    writeCartToStorage([]);
    updateCartIndicators(cartState);
    renderCartPage();
}

function getCartTotalItems(cart) {
    return cart.reduce((total, item) => total + item.qty, 0);
}

function getCartTotalPrice(cart) {
    return cart.reduce((total, item) => total + Number(item.price) * item.qty, 0);
}

function formatPrice(value) {
    return `${Number(value).toLocaleString('uk-UA')} грн`;
}

function formatOrderDate(isoDate) {
    const date = new Date(isoDate);
    return date.toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatPhoneNumber(value) {
    const digitsOnly = value.replace(/\D/g, '');
    let normalizedDigits = digitsOnly;

    if (normalizedDigits.startsWith('380')) {
        normalizedDigits = normalizedDigits.slice(3);
    } else if (normalizedDigits.startsWith('80')) {
        normalizedDigits = normalizedDigits.slice(2);
    } else if (normalizedDigits.startsWith('0')) {
        normalizedDigits = normalizedDigits.slice(1);
    }

    const nationalDigits = normalizedDigits.slice(0, 9);
    const parts = [];

    if (nationalDigits.length > 0) {
        parts.push(nationalDigits.slice(0, 2));
    }

    if (nationalDigits.length > 2) {
        parts.push(nationalDigits.slice(2, 5));
    }

    if (nationalDigits.length > 5) {
        parts.push(nationalDigits.slice(5, 7));
    }

    if (nationalDigits.length > 7) {
        parts.push(nationalDigits.slice(7, 9));
    }

    return ['+380', ...parts.filter(Boolean)].join(' ').trim();
}

function isValidPhoneNumber(value) {
    return /^\+380 \d{2} \d{3} \d{2} \d{2}$/.test(value.trim());
}

function attachPhoneFormatter(input) {
    if (!input) {
        return;
    }

    input.addEventListener('focus', () => {
        if (!input.value.trim()) {
            input.value = '+380';
        }
    });

    input.addEventListener('input', () => {
        input.value = formatPhoneNumber(input.value);
    });
}

function updateCartIndicators(cart = readCart()) {
    const cartCountElements = document.querySelectorAll('[data-cart-count]');
    const totalItems = getCartTotalItems(cart);

    cartCountElements.forEach((element) => {
        element.textContent = String(totalItems);
    });
}

function showModal(message) {
    if (document.getElementById('custom-modal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'custom-modal';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100vw';
    modal.style.height = '100vh';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.padding = '20px';
    modal.style.zIndex = '9999';

    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.padding = '30px 40px';
    box.style.borderRadius = '16px';
    box.style.textAlign = 'center';
    box.style.fontSize = '1.1rem';
    box.style.maxWidth = '420px';
    box.style.width = '100%';

    const messageText = document.createElement('p');
    messageText.textContent = message;
    messageText.style.marginBottom = '1rem';
    box.appendChild(messageText);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.innerText = 'OK';
    closeBtn.onclick = () => modal.remove();
    box.appendChild(closeBtn);

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.remove();
        }
    });

    modal.appendChild(box);
    document.body.appendChild(modal);
}

function getAuthErrorMessage(error) {
    if (!error?.code) {
        return 'Не вдалося виконати авторизацію. Спробуйте ще раз.';
    }

    if (error.code === 'auth/email-already-in-use') {
        return 'Користувач з таким email вже існує.';
    }

    if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        return 'Невірний email або пароль.';
    }

    if (error.code === 'auth/weak-password') {
        return 'Пароль має містити щонайменше 6 символів.';
    }

    if (error.code === 'auth/invalid-email') {
        return 'Вкажіть коректний email.';
    }

    return 'Не вдалося виконати авторизацію. Спробуйте ще раз.';
}

async function addToCart(product) {
    const cart = readCart();
    const existing = cart.find((item) => item.name === product.name && item.price === product.price && item.size === product.size);

    if (existing) {
        if (existing.qty >= CART_ITEM_LIMIT) {
            showModal(WHOLESALE_MESSAGE);
            return;
        }

        existing.qty += 1;
    } else {
        cart.push({ ...product, qty: 1 });
    }

    await saveCart(cart);
    showModal('Товар додано до кошика.');
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function getProductCategory(productCard) {
    const datasetCategory = productCard.dataset.category;

    if (datasetCategory) {
        return datasetCategory;
    }

    const productName = productCard.querySelector('.p-name')?.innerText.trim().toLowerCase() || '';
    const sectionId = productCard.closest('section')?.id || '';

    if (/кепка|окуляри|сумочка|ремінь|браслет/.test(productName)) {
        return 'Аксесуари';
    }

    if (/куртка|пальто/.test(productName)) {
        return 'Одяг';
    }

    if (/кросівки|туфлі/.test(productName)) {
        return 'Взуття';
    }

    if (sectionId === 'clothes') {
        return 'Одяг';
    }

    if (sectionId === 'accessories') {
        return 'Аксесуари';
    }

    if (sectionId === 'shoes' || sectionId === 'recommend') {
        return 'Взуття';
    }

    return 'Товар';
}

function getProductDescription(name, category) {
    if (category === 'Взуття') {
        return `${name} для щоденного носіння з комфортною посадкою, виразним силуетом і сучасною стилістикою.`;
    }

    if (category === 'Одяг') {
        return `${name} з акцентом на комфорт, силует і практичність для повсякденного гардероба.`;
    }

    return `${name} як завершальний акцент образу, який легко поєднується з базовими речами та сезонними новинками.`;
}

function getSizeOptions(name, category) {
    if (category === 'Взуття' || /кросівки|туфлі/i.test(name)) {
        return ['36', '37', '38', '39', '40', '41', '42', '43'];
    }

    if (category === 'Одяг' || /куртка|пальто/i.test(name)) {
        return ['S', 'M', 'L', 'XL'];
    }

    if (/ремінь/i.test(name)) {
        return ['85', '90', '95', '100'];
    }

    return ['Універсальний'];
}

function getProductData(productCard) {
    const name = productCard.querySelector('.p-name')?.innerText.trim() || 'Товар';
    const priceValue = productCard.querySelector('.p-price')?.innerText.replace(/[^\d]/g, '') || '0';
    const image = productCard.querySelector('img')?.getAttribute('src') || '';
    const category = getProductCategory(productCard);
    const productId = productCard.dataset.productId || '';
    const ratingAverage = Number(productCard.dataset.ratingAverage || 0);
    const ratingsCount = Number(productCard.dataset.ratingsCount || 0);
    const userRating = Number(productCard.dataset.userRating || 0);
    let sizes = getSizeOptions(name, category);

    if (productCard.dataset.sizes) {
        try {
            const parsedSizes = JSON.parse(productCard.dataset.sizes);
            if (Array.isArray(parsedSizes) && parsedSizes.length > 0) {
                sizes = parsedSizes;
            }
        } catch (error) {
            console.error('Помилка читання розмірів товару:', error);
        }
    }

    return {
        productId,
        name,
        price: Number(priceValue),
        image,
        category,
        description: productCard.dataset.description || getProductDescription(name, category),
        sizes,
        ratingAverage,
        ratingsCount,
        userRating
    };
}

function renderRatingValue(ratingAverage = 0) {
    const safeRating = Math.max(0, Math.min(Number(ratingAverage) || 0, 5));
    return `<span class="product-rating"><i class="fas fa-star"></i> ${safeRating.toFixed(1)}</span>`;
}

function renderRatingCount(ratingsCount = 0) {
    return `<span class="product-rating-count">(${Number(ratingsCount) || 0})</span>`;
}

function renderRatingSummary(ratingAverage = 0, ratingsCount = 0) {
    return `<span class="product-modal-rating-value"><i class="fas fa-star"></i> ${Number(ratingAverage || 0).toFixed(1)} · ${ratingsCount} оцінок</span>`;
}

function renderUserRatingSummary(userRating = 0) {
    if (!userRating) {
        return '<span class="product-modal-user-rating">Ви ще не оцінили цей товар.</span>';
    }

    return `<span class="product-modal-user-rating">Ваша оцінка: <strong>${userRating}</strong></span>`;
}

function buildProductCard(product) {
    const category = product.category || 'Товар';
    const description = product.description || getProductDescription(product.name, category);
    const sizes = Array.isArray(product.sizes) && product.sizes.length > 0
        ? product.sizes
        : getSizeOptions(product.name, category);

    return `
        <div class="product text-center col-md-4 col-sm-12"
            data-product-id="${escapeHtml(product.id || '')}"
            data-category="${escapeHtml(category)}"
            data-description="${escapeHtml(description)}"
            data-rating-average="${Number(product.ratingAverage || 0)}"
            data-ratings-count="${Number(product.ratingsCount || 0)}"
            data-user-rating="${Number(product.userRating || 0)}"
            data-sizes='${escapeHtml(JSON.stringify(sizes))}'>
            <img class="img-fluid mb-3" src="${escapeHtml(product.image || '')}" alt="${escapeHtml(product.name)}">
            <div class="star">${renderRatingValue(product.ratingAverage || 0)} ${renderRatingCount(product.ratingsCount || 0)}</div>
            <h5 class="p-name">${escapeHtml(product.name)}</h5>
            <h4 class="p-price">${formatPrice(product.price)}</h4>
            <button class="buy-btn">Купити зараз</button>
        </div>
    `;
}

function renderProductSection(containerId, products, emptyText) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    if (products.length === 0) {
        container.innerHTML = `<div class="empty-state"><h4>Товари відсутні</h4><p>${escapeHtml(emptyText)}</p></div>`;
        return;
    }

    container.innerHTML = products.map((product) => buildProductCard(product)).join('');
}

async function renderCatalogPage() {
    const recommendContainer = document.getElementById('recommend-products');
    const clothesContainer = document.getElementById('clothes-products');
    const accessoriesContainer = document.getElementById('accessories-products');
    const shoesContainer = document.getElementById('shoes-products');

    if (!recommendContainer && !clothesContainer && !accessoriesContainer && !shoesContainer) {
        return;
    }

    const products = await readProducts();
    const recommendedProducts = [...products]
        .sort((leftProduct, rightProduct) => {
            const ratingDifference = Number(rightProduct.ratingAverage || 0) - Number(leftProduct.ratingAverage || 0);

            if (ratingDifference !== 0) {
                return ratingDifference;
            }

            const ratingsCountDifference = Number(rightProduct.ratingsCount || 0) - Number(leftProduct.ratingsCount || 0);

            if (ratingsCountDifference !== 0) {
                return ratingsCountDifference;
            }

            return String(leftProduct.name || '').localeCompare(String(rightProduct.name || ''), 'uk');
        })
        .slice(0, 6);

    renderProductSection(
        'recommend-products',
        recommendedProducts,
        'Незабаром тут зʼявляться найпопулярніші позиції.'
    );
    renderProductSection(
        'clothes-products',
        products.filter((product) => product.category === 'Одяг'),
        'У цій категорії товарів поки немає.'
    );
    renderProductSection(
        'accessories-products',
        products.filter((product) => product.category === 'Аксесуари'),
        'У цій категорії товарів поки немає.'
    );
    renderProductSection(
        'shoes-products',
        products.filter((product) => product.category === 'Взуття'),
        'У цій категорії товарів поки немає.'
    );

    attachProductHandlers();
}

function ensureProductModal() {
    let modalOverlay = document.getElementById('product-modal-overlay');

    if (modalOverlay) {
        return modalOverlay;
    }

    modalOverlay = document.createElement('div');
    modalOverlay.id = 'product-modal-overlay';
    modalOverlay.className = 'product-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
            <button type="button" class="product-modal-close" id="product-modal-close" aria-label="Закрити">&times;</button>
            <div class="product-modal-content">
                <div>
                    <img id="product-modal-image" class="product-modal-image" src="" alt="Фото товару">
                </div>
                <div>
                    <span id="product-modal-category" class="product-modal-category"></span>
                    <h2 id="product-modal-title" class="product-modal-title"></h2>
                    <div id="product-modal-price" class="product-modal-price"></div>
                    <p id="product-modal-description" class="product-modal-description"></p>
                    <div class="size-picker-title">Оберіть розмір</div>
                    <div id="product-size-options" class="size-options"></div>
                    <div id="product-modal-meta" class="product-modal-meta"></div>
                    <div class="product-modal-rating-block">
                        <div id="product-modal-rating-value" class="product-modal-rating-value"></div>
                        <div id="product-modal-user-rating" class="product-modal-user-rating"></div>
                        <div id="product-modal-rating-actions" class="product-modal-rating-actions"></div>
                    </div>
                    <div class="product-modal-actions">
                        <button type="button" id="product-modal-add">Додати в кошик</button>
                    </div>
                    <div id="product-modal-status" class="product-modal-status"></div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            modalOverlay.classList.remove('is-open');
        }
    });

    document.getElementById('product-modal-close').onclick = () => {
        modalOverlay.classList.remove('is-open');
    };

    return modalOverlay;
}

function openProductModal(product) {
    const modalOverlay = ensureProductModal();
    const modalImage = document.getElementById('product-modal-image');
    const modalCategory = document.getElementById('product-modal-category');
    const modalTitle = document.getElementById('product-modal-title');
    const modalPrice = document.getElementById('product-modal-price');
    const modalDescription = document.getElementById('product-modal-description');
    const sizeOptionsContainer = document.getElementById('product-size-options');
    const modalMeta = document.getElementById('product-modal-meta');
    const modalRatingValue = document.getElementById('product-modal-rating-value');
    const modalUserRating = document.getElementById('product-modal-user-rating');
    const modalRatingActions = document.getElementById('product-modal-rating-actions');
    const modalStatus = document.getElementById('product-modal-status');
    const addButton = document.getElementById('product-modal-add');

    modalImage.src = product.image;
    modalImage.alt = product.name;
    modalCategory.textContent = product.category;
    modalTitle.textContent = product.name;
    modalPrice.textContent = formatPrice(product.price);
    modalDescription.textContent = product.description;
    modalMeta.textContent = `Категорія: ${product.category}`;
    modalRatingValue.innerHTML = renderRatingSummary(product.ratingAverage || 0, product.ratingsCount || 0);
    modalUserRating.innerHTML = renderUserRatingSummary(product.userRating || 0);
    modalRatingActions.innerHTML = '';
    modalStatus.textContent = '';
    sizeOptionsContainer.innerHTML = '';

    let selectedSize = product.sizes[0] || '';

    product.sizes.forEach((size, index) => {
        const sizeButton = document.createElement('button');
        sizeButton.type = 'button';
        sizeButton.className = `size-option${index === 0 ? ' is-active' : ''}`;
        sizeButton.textContent = size;
        sizeButton.onclick = () => {
            selectedSize = size;
            sizeOptionsContainer.querySelectorAll('.size-option').forEach((button) => {
                button.classList.remove('is-active');
            });
            sizeButton.classList.add('is-active');
            modalStatus.textContent = `Обраний розмір: ${size}`;
        };
        sizeOptionsContainer.appendChild(sizeButton);
    });

    [1, 2, 3, 4, 5].forEach((value) => {
        const ratingButton = document.createElement('button');
        ratingButton.type = 'button';
        ratingButton.className = `size-option rating-option${Number(product.userRating || 0) === value ? ' is-active' : ''}`;
        ratingButton.textContent = `${value}★`;
        ratingButton.onclick = async () => {
            if (!getCurrentUser()) {
                modalStatus.textContent = 'Щоб залишити оцінку, увійдіть у свій профіль.';
                return;
            }

            if (!product.productId) {
                modalStatus.textContent = 'Не вдалося визначити товар для оцінювання.';
                return;
            }

            if (Number(product.userRating || 0) === value) {
                modalStatus.textContent = 'Ця оцінка вже збережена для цього товару.';
                return;
            }

            modalStatus.textContent = 'Зберігаємо оцінку...';

            try {
                const ratingResult = await saveProductRating(product.productId, value);
                product.ratingAverage = ratingResult.ratingAverage;
                product.ratingsCount = ratingResult.ratingsCount;
                product.userRating = ratingResult.userRating;
                modalRatingValue.innerHTML = renderRatingSummary(ratingResult.ratingAverage || 0, ratingResult.ratingsCount || 0);
                modalUserRating.innerHTML = renderUserRatingSummary(ratingResult.userRating || 0);
                modalRatingActions.querySelectorAll('.rating-option').forEach((button, index) => {
                    button.classList.toggle('is-active', index + 1 === ratingResult.userRating);
                });
                modalStatus.textContent = 'Дякуємо, вашу оцінку збережено.';
                await renderCatalogPage();
            } catch (error) {
                console.error('Помилка збереження оцінки:', error);
                modalStatus.textContent = 'Не вдалося зберегти оцінку. Спробуйте ще раз.';
            }
        };
        modalRatingActions.appendChild(ratingButton);
    });

    addButton.onclick = () => {
        addToCart({
            name: product.name,
            price: product.price,
            size: selectedSize
        }).then(() => {
            modalOverlay.classList.remove('is-open');
        }).catch((error) => {
            console.error('Помилка додавання в кошик:', error);
            modalStatus.textContent = 'Не вдалося додати товар у кошик.';
        });
    };

    modalOverlay.classList.add('is-open');
}

async function removeCartItem(index) {
    const cart = readCart();
    cart.splice(index, 1);
    await saveCart(cart);
    renderCartPage();
}

async function changeCartQuantity(index, delta) {
    const cart = readCart();
    const item = cart[index];

    if (!item) {
        return;
    }

    if (delta > 0 && item.qty >= CART_ITEM_LIMIT) {
        showModal(WHOLESALE_MESSAGE);
        return;
    }

    item.qty += delta;

    if (item.qty <= 0) {
        cart.splice(index, 1);
    }

    await saveCart(cart);
    renderCartPage();
}

function attachProductHandlers() {
    document.querySelectorAll('.product').forEach((productCard) => {
        productCard.addEventListener('click', () => {
            openProductModal(getProductData(productCard));
        });
    });

    document.querySelectorAll('.buy-btn').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const productCard = button.closest('.product');

            if (!productCard) {
                return;
            }

            openProductModal(getProductData(productCard));
        });
    });
}

function attachSmoothScroll() {
    document.querySelectorAll('a.nav-link[href^="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href');
            const target = href ? document.querySelector(href) : null;

            if (!target) {
                return;
            }

            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
        });
    });

    document.querySelectorAll('button.scroll-btn[data-scroll-to]').forEach((button) => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-scroll-to');
            const section = targetId ? document.getElementById(targetId) : null;

            if (section) {
                section.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function renderCartPage() {
    const cartContainer = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const cartStatus = document.getElementById('cart-status');
    const checkoutCard = document.getElementById('checkout-card');
    const openCheckoutButton = document.getElementById('open-checkout-btn');

    if (!cartContainer || !cartTotal || !cartStatus) {
        return;
    }

    const cart = readCart();
    cartContainer.innerHTML = '';

    if (cart.length === 0) {
        cartContainer.innerHTML = '<div class="empty-state"><h4>Кошик порожній</h4><p>Додайте товари з головної сторінки, і вони зʼявляться тут.</p></div>';
        cartTotal.textContent = formatPrice(0);
        cartStatus.textContent = 'У кошику поки немає товарів.';
        if (checkoutCard) {
            checkoutCard.classList.add('d-none');
        }
        if (openCheckoutButton) {
            openCheckoutButton.disabled = true;
        }
        return;
    }

    if (openCheckoutButton) {
        openCheckoutButton.disabled = false;
    }

    cart.forEach((item, index) => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div>
                <h5>${item.name}</h5>
                <p class="status-text mb-0">${formatPrice(item.price)} за одиницю</p>
                <p class="status-text mb-0">Розмір: ${item.size || 'Не вказано'}</p>
            </div>
            <div>
                <button type="button" class="btn btn-sm btn-outline-dark me-2" data-action="decrease" data-index="${index}">-</button>
                <span>Кількість: ${item.qty}</span>
                <button type="button" class="btn btn-sm btn-outline-dark ms-2" data-action="increase" data-index="${index}">+</button>
            </div>
            <div class="text-md-end">
                <p class="mb-2"><strong>${formatPrice(item.price * item.qty)}</strong></p>
                <button type="button" class="btn btn-sm btn-danger" data-action="remove" data-index="${index}">Видалити</button>
            </div>
        `;
        cartContainer.appendChild(cartItem);
    });

    cartTotal.textContent = formatPrice(getCartTotalPrice(cart));
    cartStatus.textContent = `У кошику ${getCartTotalItems(cart)} товар(ів).`;

    cartContainer.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', async () => {
            const index = Number(button.getAttribute('data-index'));
            const action = button.getAttribute('data-action');

            if (action === 'increase') {
                await changeCartQuantity(index, 1);
            }

            if (action === 'decrease') {
                await changeCartQuantity(index, -1);
            }

            if (action === 'remove') {
                await removeCartItem(index);
            }
        });
    });
}

async function initCheckoutForm() {
    const checkoutForm = document.getElementById('checkout-form');
    const checkoutStatus = document.getElementById('checkout-status');
    const checkoutCard = document.getElementById('checkout-card');
    const openCheckoutButton = document.getElementById('open-checkout-btn');
    const closeCheckoutButton = document.getElementById('close-checkout-btn');

    if (!checkoutForm) {
        return;
    }

    if (checkoutCard && openCheckoutButton) {
        openCheckoutButton.onclick = () => {
            if (readCart().length === 0) {
                checkoutStatus.textContent = 'Спочатку додайте товари в кошик.';
                return;
            }

            checkoutCard.classList.remove('d-none');
            checkoutStatus.textContent = '';
        };
    }

    if (checkoutCard && closeCheckoutButton) {
        closeCheckoutButton.onclick = () => {
            checkoutCard.classList.add('d-none');
            checkoutStatus.textContent = '';
        };
    }

    const profile = await readProfile();
    const nameInput = document.getElementById('checkout-name');
    const surnameInput = document.getElementById('checkout-surname');
    const phoneInput = document.getElementById('checkout-phone');
    const emailInput = document.getElementById('checkout-email');
    const cityInput = document.getElementById('checkout-city');
    const deliveryInput = document.getElementById('checkout-delivery');
    const addressInput = document.getElementById('checkout-address');
    const paymentInput = document.getElementById('checkout-payment');
    const cardPaymentFields = document.getElementById('checkout-card-payment-fields');
    const cardNumberInput = document.getElementById('checkout-card-number');
    const cardExpiryInput = document.getElementById('checkout-card-expiry');
    const cardCvvInput = document.getElementById('checkout-card-cvv');
    const commentInput = document.getElementById('checkout-comment');

    attachPhoneFormatter(phoneInput);

    const toggleCardPaymentFields = () => {
        const isCardPayment = paymentInput.value === 'Оплата карткою онлайн';

        cardPaymentFields?.classList.toggle('d-none', !isCardPayment);

        if (cardNumberInput) {
            cardNumberInput.required = isCardPayment;
            if (!isCardPayment) {
                cardNumberInput.value = '';
            }
        }

        if (cardExpiryInput) {
            cardExpiryInput.required = isCardPayment;
            if (!isCardPayment) {
                cardExpiryInput.value = '';
            }
        }

        if (cardCvvInput) {
            cardCvvInput.required = isCardPayment;
            if (!isCardPayment) {
                cardCvvInput.value = '';
            }
        }
    };

    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', () => {
            const digitsOnly = cardNumberInput.value.replace(/\D/g, '').slice(0, 16);
            const formattedValue = digitsOnly.replace(/(.{4})/g, '$1 ').trim();
            cardNumberInput.value = formattedValue;
        });
    }

    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', () => {
            const digitsOnly = cardExpiryInput.value.replace(/\D/g, '').slice(0, 4);

            if (digitsOnly.length <= 2) {
                cardExpiryInput.value = digitsOnly;
                return;
            }

            cardExpiryInput.value = `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
        });
    }

    if (cardCvvInput) {
        cardCvvInput.addEventListener('input', () => {
            cardCvvInput.value = cardCvvInput.value.replace(/\D/g, '').slice(0, 3);
        });
    }

    paymentInput?.addEventListener('change', toggleCardPaymentFields);
    toggleCardPaymentFields();

    const fillCheckoutProfile = async () => {
        const profile = await readProfile();

        nameInput.value = profile.name || '';
        surnameInput.value = profile.surname || '';
        phoneInput.value = profile.phone || '';
        emailInput.value = profile.email || '';
        cityInput.value = profile.city || '';
        addressInput.value = profile.address || '';
    };

    await fillCheckoutProfile();
    observeAuthState(async () => {
        await fillCheckoutProfile();
    });

    checkoutForm.onsubmit = async (event) => {
        event.preventDefault();

        const cart = readCart();

        if (cart.length === 0) {
            checkoutStatus.textContent = 'Спочатку додайте товари в кошик.';
            return;
        }

        if (!getCurrentUser()) {
            checkoutStatus.textContent = 'Щоб оформити замовлення і зберегти його в профілі, увійдіть через сторінку профілю.';
            return;
        }

        phoneInput.value = formatPhoneNumber(phoneInput.value);

        if (!isValidPhoneNumber(phoneInput.value)) {
            checkoutStatus.textContent = 'Вкажіть номер телефону у форматі +380 XX XXX XX XX.';
            return;
        }

        if (paymentInput.value === 'Оплата карткою онлайн') {
            const normalizedCardNumber = (cardNumberInput?.value || '').replace(/\s+/g, '');
            const normalizedCardExpiry = (cardExpiryInput?.value || '').trim();
            const normalizedCardCvv = (cardCvvInput?.value || '').trim();

            if (!/^\d{16}$/.test(normalizedCardNumber) || !/^\d{2}\/\d{2}$/.test(normalizedCardExpiry) || !/^\d{3}$/.test(normalizedCardCvv)) {
                checkoutStatus.textContent = 'Заповніть коректні банківські дані для оплати карткою.';
                return;
            }
        }

        const createdAtMs = Date.now();
        const order = {
            id: `SC-${createdAtMs}`,
            createdAt: new Date(createdAtMs).toISOString(),
            createdAtMs,
            customer: {
                name: nameInput.value.trim(),
                surname: surnameInput.value.trim(),
                phone: phoneInput.value.trim(),
                email: emailInput.value.trim(),
                city: cityInput.value.trim(),
                delivery: deliveryInput.value,
                address: addressInput.value.trim(),
                payment: paymentInput.value,
                cardLast4: paymentInput.value === 'Оплата карткою онлайн'
                    ? (cardNumberInput?.value || '').replace(/\s+/g, '').slice(-4)
                    : '',
                comment: commentInput.value.trim()
            },
            items: cart,
            total: getCartTotalPrice(cart),
            status: 'Прийнято'
        };

        try {
            await saveOrder(order);

            await saveProfile({
                name: nameInput.value.trim(),
                surname: surnameInput.value.trim(),
                email: emailInput.value.trim(),
                phone: phoneInput.value.trim(),
                city: cityInput.value.trim(),
                address: addressInput.value.trim()
            });

            await saveCart([]);
            renderCartPage();
            checkoutForm.reset();
            if (checkoutCard) {
                checkoutCard.classList.add('d-none');
            }
            nameInput.value = order.customer.name;
            surnameInput.value = order.customer.surname;
            phoneInput.value = order.customer.phone;
            emailInput.value = order.customer.email;
            cityInput.value = order.customer.city;
            addressInput.value = order.customer.address;
            checkoutStatus.textContent = 'Замовлення оформлено. Дякуємо за покупку.';
            showModal('Замовлення успішно оформлено.');
        } catch (error) {
            console.error('Помилка оформлення замовлення:', error);
            checkoutStatus.textContent = error?.message === 'AUTH_REQUIRED'
                ? 'Щоб оформити замовлення, увійдіть через сторінку профілю.'
                : 'Не вдалося зберегти замовлення в базі. Спробуйте ще раз.';
        }
    };
}

async function initProfilePage() {
    const authForm = document.getElementById('auth-form');
    const adminLoginForm = document.getElementById('admin-login-form');
    const footerAdminToggle = document.getElementById('footer-admin-toggle');
    const authGuestPanel = document.getElementById('auth-guest-panel');
    const adminLoginPanel = document.getElementById('admin-login-panel');
    const authUserPanel = document.getElementById('auth-user-panel');
    const authUserEmail = document.getElementById('auth-user-email');
    const authStatus = document.getElementById('auth-status');
    const adminLoginStatus = document.getElementById('admin-login-status');
    const authEmailInput = document.getElementById('auth-email');
    const authPasswordInput = document.getElementById('auth-password');
    const adminEmailInput = document.getElementById('admin-login-email');
    const adminPasswordInput = document.getElementById('admin-login-password');
    const registerButton = document.getElementById('register-btn');
    const logoutButton = document.getElementById('logout-btn');
    const privateContent = document.getElementById('profile-private-content');
    const profileForm = document.getElementById('profile-form');
    const ordersList = document.getElementById('profile-orders-list');
    const summaryName = document.getElementById('profile-summary-name');
    const summaryEmail = document.getElementById('profile-summary-email');
    const summaryPhone = document.getElementById('profile-summary-phone');
    const summaryCity = document.getElementById('profile-summary-city');
    const summaryAddress = document.getElementById('profile-summary-address');
    const formPanel = document.getElementById('profile-form-panel');
    const editButton = document.getElementById('edit-profile-btn');
    const closeButton = document.getElementById('close-profile-form');

    if (!authForm || !profileForm) {
        return;
    }

    const nameInput = document.getElementById('profile-name');
    const surnameInput = document.getElementById('profile-surname');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');
    const cityInput = document.getElementById('profile-city');
    const addressInput = document.getElementById('profile-address');

    attachPhoneFormatter(phoneInput);

    const applyProfileData = (profile) => {
        nameInput.value = profile.name || '';
        surnameInput.value = profile.surname || '';
        emailInput.value = profile.email || '';
        phoneInput.value = profile.phone || '';
        cityInput.value = profile.city || '';
        addressInput.value = profile.address || '';

        if (summaryName) {
            const fullName = [profile.name, profile.surname].filter(Boolean).join(' ');
            summaryName.textContent = fullName || 'Не вказано';
        }

        if (summaryEmail) {
            summaryEmail.textContent = profile.email || 'Не вказано';
        }

        if (summaryPhone) {
            summaryPhone.textContent = profile.phone || 'Не вказано';
        }

        if (summaryCity) {
            summaryCity.textContent = profile.city || 'Не вказано';
        }

        if (summaryAddress) {
            summaryAddress.textContent = profile.address || 'Не вказано';
        }
    };

    const showSignedOutState = () => {
        authGuestPanel?.classList.remove('d-none');
        adminLoginPanel?.classList.add('d-none');
        authUserPanel?.classList.add('d-none');
        privateContent?.classList.add('d-none');
        authPasswordInput.value = '';
        if (adminPasswordInput) {
            adminPasswordInput.value = '';
        }
        applyProfileData({});

        if (formPanel && editButton) {
            formPanel.classList.add('d-none');
            editButton.classList.remove('d-none');
        }

        if (ordersList) {
            ordersList.innerHTML = '<div class="empty-state"><h4>Потрібен вхід</h4><p>Увійдіть або зареєструйтеся, щоб переглядати свої замовлення.</p></div>';
        }
    };

    const showSignedInState = async (user) => {
        if (isAdminUser(user)) {
            window.location.href = 'admin.html';
            return;
        }

        authGuestPanel?.classList.add('d-none');
        adminLoginPanel?.classList.add('d-none');
        authUserPanel?.classList.remove('d-none');
        privateContent?.classList.remove('d-none');

        if (authUserEmail) {
            authUserEmail.textContent = user.email || 'Користувач';
        }

        const profile = await readProfile();
        applyProfileData(profile);
        await renderProfileOrders();
    };

    if (formPanel && editButton && closeButton) {
        editButton.onclick = () => {
            formPanel.classList.remove('d-none');
            editButton.classList.add('d-none');
        };

        closeButton.onclick = () => {
            formPanel.classList.add('d-none');
            editButton.classList.remove('d-none');
        };
    }

    authForm.onsubmit = async (event) => {
        event.preventDefault();
        authStatus.textContent = 'Виконується вхід...';

        try {
            await loginWithEmail(authEmailInput.value.trim(), authPasswordInput.value);
            authStatus.textContent = '';
        } catch (error) {
            console.error('Помилка входу:', error);
            authStatus.textContent = getAuthErrorMessage(error);
        }
    };

    if (registerButton) {
        registerButton.onclick = async () => {
            authStatus.textContent = 'Створюється акаунт...';

            try {
                await registerWithEmail(authEmailInput.value.trim(), authPasswordInput.value);
                authStatus.textContent = '';
            } catch (error) {
                console.error('Помилка реєстрації:', error);
                authStatus.textContent = getAuthErrorMessage(error);
            }
        };
    }

    if (adminLoginForm && adminEmailInput && adminPasswordInput && adminLoginStatus) {
        adminLoginForm.onsubmit = async (event) => {
            event.preventDefault();

            const email = adminEmailInput.value.trim();
            const password = adminPasswordInput.value;

            if (!isAdminCredentials(email, password)) {
                adminLoginStatus.textContent = 'Невірний логін або пароль адміністратора.';
                return;
            }

            adminLoginStatus.textContent = 'Виконується вхід адміністратора...';

            try {
                await loginWithEmail(email, password);
                adminLoginStatus.textContent = '';
                window.location.href = 'admin.html';
            } catch (error) {
                console.error('Помилка входу адміністратора:', error);
                adminLoginStatus.textContent = getAuthErrorMessage(error);
            }
        };
    }

    if (footerAdminToggle && adminLoginPanel) {
        footerAdminToggle.onclick = () => {
            adminLoginPanel.classList.toggle('d-none');
            if (!adminLoginPanel.classList.contains('d-none')) {
                adminLoginPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                adminEmailInput?.focus();
            }
        };
    }

    if (logoutButton) {
        logoutButton.onclick = async () => {
            await logoutUser();
        };
    }

    profileForm.onsubmit = async (event) => {
        event.preventDefault();

        phoneInput.value = formatPhoneNumber(phoneInput.value);

        if (!isValidPhoneNumber(phoneInput.value)) {
            showModal('Вкажіть номер телефону у форматі +380 XX XXX XX XX.');
            return;
        }

        const nextProfile = {
            name: nameInput.value.trim(),
            surname: surnameInput.value.trim(),
            email: emailInput.value.trim(),
            phone: phoneInput.value.trim(),
            city: cityInput.value.trim(),
            address: addressInput.value.trim()
        };

        await saveProfile(nextProfile);
        applyProfileData(nextProfile);

        if (formPanel && editButton) {
            formPanel.classList.add('d-none');
            editButton.classList.remove('d-none');
        }

        showModal('Профіль збережено.');
    };

    observeAuthState(async (user) => {
        if (user) {
            authStatus.textContent = '';
            if (adminLoginStatus) {
                adminLoginStatus.textContent = '';
            }
            await showSignedInState(user);
        } else {
            showSignedOutState();
        }
    });
}

async function renderProfileOrders() {
    const ordersList = document.getElementById('profile-orders-list');

    if (!ordersList) {
        return;
    }

    if (!getCurrentUser()) {
        ordersList.innerHTML = '<div class="empty-state"><h4>Потрібен вхід</h4><p>Увійдіть або зареєструйтеся, щоб переглядати свої замовлення.</p></div>';
        return;
    }

    const orders = await readOrders();

    if (orders.length === 0) {
        ordersList.innerHTML = '<div class="empty-state"><h4>Замовлень поки немає</h4><p>Після оформлення в кошику вони зʼявляться тут.</p></div>';
        return;
    }

    ordersList.innerHTML = orders.map((order) => {
        const fullName = `${order.customer.name} ${order.customer.surname}`.trim();
        const itemsMarkup = order.items.map((item) => `<p>${item.name} · ${item.size || 'Без розміру'} · ${item.qty} шт. · ${formatPrice(item.price * item.qty)}</p>`).join('');

        return `
            <div class="order-item">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div>
                        <h5 class="mb-1">Замовлення ${order.id}</h5>
                        <p class="status-text mb-0">${formatOrderDate(order.createdAt)}</p>
                    </div>
                    <div class="text-md-end">
                        <p class="mb-1"><strong>${formatPrice(order.total)}</strong></p>
                        <p class="status-text mb-0">Статус: ${order.status}</p>
                    </div>
                </div>
                <div class="order-meta">
                    <p class="mb-0"><strong>Одержувач:</strong> ${fullName}</p>
                    <p class="mb-0"><strong>Телефон:</strong> ${order.customer.phone}</p>
                    <p class="mb-0"><strong>Email:</strong> ${order.customer.email}</p>
                    <p class="mb-0"><strong>Місто:</strong> ${order.customer.city}</p>
                    <p class="mb-0"><strong>Доставка:</strong> ${order.customer.delivery}</p>
                    <p class="mb-0"><strong>Оплата:</strong> ${order.customer.payment}</p>
                    <p class="mb-0"><strong>Адреса:</strong> ${order.customer.address}</p>
                    <p class="mb-0"><strong>Коментар:</strong> ${order.customer.comment || 'Без коментаря'}</p>
                </div>
                <div class="order-products">
                    <p class="mb-2"><strong>Склад замовлення</strong></p>
                    ${itemsMarkup}
                </div>
            </div>
        `;
    }).join('');
}

function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    document.querySelectorAll('[data-page-link]').forEach((link) => {
        const targetPage = link.getAttribute('data-page-link');
        if (targetPage === currentPage) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    cartState = readCartFromStorage();
    updateCartIndicators();
    setActiveNavLink();
    attachSmoothScroll();
    await renderCatalogPage();
    await waitForAuthReady();
    observeAuthState(async () => {
        await syncCartState();
    });
    renderCartPage();
    await initCheckoutForm();
    await initProfilePage();
});