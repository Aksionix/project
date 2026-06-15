import {
    createProduct,
    readAllOrders,
    readProducts,
    updateOrderStatus,
    updateProduct
} from "./modules/firestore-service.js";
import {
    getCurrentUser,
    logoutUser,
    observeAuthState,
    waitForAuthReady
} from "./modules/auth-service.js";
import { isAdminUser } from "./modules/admin-config.js";

let adminOrders = [];
let adminProducts = [];
let activeAdminView = 'catalog';

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

function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'admin.html';

    document.querySelectorAll('[data-page-link]').forEach((link) => {
        link.classList.toggle('active', link.getAttribute('data-page-link') === currentPage);
    });
}

function showGuardState() {
    document.getElementById('admin-guard-card')?.classList.remove('d-none');
    document.getElementById('admin-dashboard')?.classList.add('d-none');
}

function showDashboardState(user) {
    document.getElementById('admin-guard-card')?.classList.add('d-none');
    document.getElementById('admin-dashboard')?.classList.remove('d-none');

    const adminEmail = document.getElementById('admin-email');
    if (adminEmail) {
        adminEmail.textContent = user.email || 'Адміністратор';
    }
}

function setAdminView(view) {
    activeAdminView = view === 'orders' ? 'orders' : 'catalog';

    document.getElementById('admin-catalog-section')?.classList.toggle('d-none', activeAdminView !== 'catalog');
    document.getElementById('admin-orders-section')?.classList.toggle('d-none', activeAdminView !== 'orders');

    document.querySelectorAll('[data-admin-view]').forEach((button) => {
        button.classList.toggle('is-active', button.getAttribute('data-admin-view') === activeAdminView);
    });
}

function fillProductForm(product = null) {
    const form = document.getElementById('admin-product-form');
    if (!form) {
        return;
    }

    document.getElementById('admin-product-id').value = product?.id || '';
    document.getElementById('admin-product-name').value = product?.name || '';
    document.getElementById('admin-product-category').value = product?.category || '';
    document.getElementById('admin-product-price').value = product?.price ?? '';
    document.getElementById('admin-product-image').value = product?.image || '';
    document.getElementById('admin-product-description').value = product?.description || '';

    const submitButton = document.getElementById('admin-product-submit');
    if (submitButton) {
        submitButton.textContent = product ? 'Оновити товар' : 'Зберегти товар';
    }
}

function renderOrders() {
    const ordersList = document.getElementById('admin-orders-list');

    if (!ordersList) {
        return;
    }

    if (adminOrders.length === 0) {
        ordersList.innerHTML = '<div class="empty-state"><h4>Замовлень поки немає</h4><p>Коли користувачі оформлять покупки, вони зʼявляться тут.</p></div>';
        return;
    }

    ordersList.innerHTML = adminOrders.map((order) => {
        const fullName = `${order.customer?.name || ''} ${order.customer?.surname || ''}`.trim() || 'Не вказано';
        const itemsMarkup = Array.isArray(order.items)
            ? order.items.map((item) => `<p>${item.name} · ${item.size || 'Без розміру'} · ${item.qty} шт. · ${formatPrice(item.price * item.qty)}</p>`).join('')
            : '<p>Склад замовлення недоступний.</p>';
        const isConfirmed = order.status === 'Підтверджено';

        return `
            <div class="order-item">
                <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div>
                        <h5 class="mb-1">Замовлення ${order.id}</h5>
                        <p class="status-text mb-0">${formatOrderDate(order.createdAt)}</p>
                    </div>
                    <div class="text-md-end">
                        <p class="mb-1"><strong>${formatPrice(order.total)}</strong></p>
                        <p class="status-text mb-2">Статус: ${order.status || 'Прийнято'}</p>
                        <button type="button" class="btn btn-dark btn-sm" data-order-confirm="${order.id}"${isConfirmed ? ' disabled' : ''}>${isConfirmed ? 'Підтверджено' : 'Підтвердити замовлення'}</button>
                    </div>
                </div>
                <div class="order-meta">
                    <p class="mb-0"><strong>Одержувач:</strong> ${fullName}</p>
                    <p class="mb-0"><strong>Телефон:</strong> ${order.customer?.phone || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Email:</strong> ${order.customer?.email || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Місто:</strong> ${order.customer?.city || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Доставка:</strong> ${order.customer?.delivery || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Оплата:</strong> ${order.customer?.payment || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Адреса:</strong> ${order.customer?.address || 'Не вказано'}</p>
                    <p class="mb-0"><strong>Коментар:</strong> ${order.customer?.comment || 'Без коментаря'}</p>
                </div>
                <div class="order-products">
                    <p class="mb-2"><strong>Склад замовлення</strong></p>
                    ${itemsMarkup}
                </div>
            </div>
        `;
    }).join('');

    ordersList.querySelectorAll('[data-order-confirm]').forEach((button) => {
        button.addEventListener('click', async () => {
            const orderId = button.getAttribute('data-order-confirm');
            if (!orderId) {
                return;
            }

            button.disabled = true;

            try {
                await updateOrderStatus(orderId, 'Підтверджено');
                adminOrders = adminOrders.map((order) => order.id === orderId
                    ? {
                        ...order,
                        status: 'Підтверджено'
                    }
                    : order);
                renderOrders();
            } catch (error) {
                console.error('Помилка підтвердження замовлення:', error);
                button.disabled = false;
            }
        });
    });
}

function renderProducts() {
    const productsList = document.getElementById('admin-products-list');

    if (!productsList) {
        return;
    }

    if (adminProducts.length === 0) {
        productsList.innerHTML = '<div class="empty-state"><h4>Каталог порожній</h4><p>Додайте перший товар через форму вище.</p></div>';
        return;
    }

    productsList.innerHTML = adminProducts.map((product) => `
        <article class="profile-info-box admin-product-card">
            <img src="${product.image}" alt="${product.name}" class="admin-product-image">
            <div>
                <p class="status-text mb-1">${product.category}</p>
                <h5 class="mb-2">${product.name}</h5>
                <p class="mb-2">${product.description}</p>
                <p class="mb-1"><strong>Ціна:</strong> ${formatPrice(product.price)}</p>
                <p class="mb-2"><strong>Оцінка:</strong> <i class="fas fa-star"></i> ${Number(product.ratingAverage || 0).toFixed(1)}</p>
                <button type="button" class="btn btn-outline-dark btn-sm" data-product-edit="${product.id}">Редагувати</button>
            </div>
        </article>
    `).join('');

    productsList.querySelectorAll('[data-product-edit]').forEach((button) => {
        button.addEventListener('click', () => {
            const productId = button.getAttribute('data-product-edit');
            const product = adminProducts.find((item) => item.id === productId);

            if (product) {
                fillProductForm(product);
                document.getElementById('admin-product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

async function loadAdminData() {
    [adminOrders, adminProducts] = await Promise.all([
        readAllOrders(),
        readProducts()
    ]);

    renderOrders();
    renderProducts();
}

function initProductForm() {
    const form = document.getElementById('admin-product-form');
    const resetButton = document.getElementById('admin-product-reset');
    const statusElement = document.getElementById('admin-product-status');

    if (!form) {
        return;
    }

    fillProductForm();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const productId = document.getElementById('admin-product-id').value;
        const payload = {
            name: document.getElementById('admin-product-name').value.trim(),
            category: document.getElementById('admin-product-category').value,
            price: Number(document.getElementById('admin-product-price').value),
            image: document.getElementById('admin-product-image').value.trim(),
            description: document.getElementById('admin-product-description').value.trim()
        };

        statusElement.textContent = productId ? 'Оновлюємо товар...' : 'Додаємо товар...';

        try {
            const savedProduct = productId
                ? await updateProduct(productId, payload)
                : await createProduct(payload);

            const existingIndex = adminProducts.findIndex((item) => item.id === savedProduct.id);

            if (existingIndex >= 0) {
                adminProducts.splice(existingIndex, 1, savedProduct);
            } else {
                adminProducts.unshift(savedProduct);
            }

            adminProducts.sort((leftProduct, rightProduct) => leftProduct.name.localeCompare(rightProduct.name, 'uk'));
            renderProducts();
            fillProductForm();
            statusElement.textContent = productId ? 'Товар оновлено.' : 'Новий товар додано.';
        } catch (error) {
            console.error('Помилка збереження товару:', error);
            statusElement.textContent = 'Не вдалося зберегти товар. Перевірте права доступу та спробуйте ще раз.';
        }
    });

    resetButton?.addEventListener('click', () => {
        fillProductForm();
        statusElement.textContent = '';
    });
}

function initLogout() {
    document.getElementById('admin-logout-btn')?.addEventListener('click', async () => {
        await logoutUser();
        window.location.href = 'profile.html';
    });
}

function initAdminViewSwitch() {
    document.querySelectorAll('[data-admin-view]').forEach((button) => {
        button.addEventListener('click', () => {
            const nextView = button.getAttribute('data-admin-view') || 'catalog';
            setAdminView(nextView);
        });
    });

    setAdminView(activeAdminView);
}

document.addEventListener('DOMContentLoaded', async () => {
    setActiveNavLink();
    initLogout();
    initAdminViewSwitch();
    initProductForm();

    await waitForAuthReady();

    observeAuthState(async (user) => {
        if (!user || !isAdminUser(user)) {
            showGuardState();
            return;
        }

        showDashboardState(user);
        await loadAdminData();
    });

    const currentUser = getCurrentUser();
    if (!currentUser || !isAdminUser(currentUser)) {
        showGuardState();
    }
});
