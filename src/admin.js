import {
    hasSupabaseConfig,
    restoreSupabaseUser,
    signInWithSupabase,
    signOutFromSupabase
} from './supabase.js';
import {
    PRODUCT_STORAGE_KEYS,
    addCustomProduct,
    deleteProduct,
    getProducts,
    updateProduct
} from './products.js';

const BUYER_NOTIFICATIONS_STORAGE_KEY = 'rm-clothing-buyer-notifications';
const ADMIN_LOCAL_SESSION_KEY = 'rm-clothing-admin-console-session';
const ADMIN_LOCAL_MODE_KEY = 'rm-clothing-admin-console-mode';
const ADMIN_ACCESS_LIST_STORAGE_KEY = 'rm-clothing-admin-access-list';
const ADMIN_ACCESS_REQUESTS_STORAGE_KEY = 'rm-clothing-admin-access-requests';
const DEFAULT_ADMIN_AVATAR_URL = 'https://scontent-mnl1-2.xx.fbcdn.net/v/t39.30808-6/688293196_122100700785295875_5834459644778230756_n.jpg?_nc_cat=105&ccb=1-7&_nc_sid=1d70fc&_nc_eui2=AeGrTZf6B_9abE9ISQJzyNtG-vbx7DaVTTT69vHsNpVNNAP4T_XN6BEWu04aMVNQBMW6SVOCBedyi6K3s7NM0t65&_nc_ohc=2arVinEpVjIQ7kNvwH--YuB&_nc_oc=AdoRv5cXl-QuWt6yW4FanoqWQ3xOmk73bBsTMEO5AKgZ3XioeyZth4Gkk6-Ym9CVLTM&_nc_zt=23&_nc_ht=scontent-mnl1-2.xx&_nc_gid=TGYzw9MkmfkGnSzRkPDSfQ&_nc_ss=7b2a8&oh=00_Af5GVJA9y_U62XcEN7MZr2tJ5pFaNiWuW7WE4gVmbK76aw&oe=6A009234';
const ALLOWED_ITEM_IMAGE_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_ITEM_IMAGES = 2;
const ADMIN_SECTIONS = {
    dashboard: {
        kicker: 'Dashboard',
        title: 'Store Command Center',
        subtitle: 'Track customers, item movement, and order activity in one clean admin workspace.'
    },
    items: {
        kicker: 'Items',
        title: 'Item Catalog Overview',
        subtitle: 'Review the live storefront lineup and how each item is performing.'
    },
    orders: {
        kicker: 'Orders',
        title: 'Customer Orders',
        subtitle: 'Monitor every recorded checkout and manage the order feed from one place.'
    },
    analysis: {
        kicker: 'Analysis',
        title: 'Sales Analysis',
        subtitle: 'Read best sellers, category revenue, and repeat customer activity at a glance.'
    },
    settings: {
        kicker: 'Settings',
        title: 'Admin Settings',
        subtitle: 'Review session details, add admins, and manage admin join requests.'
    }
};
const SEEDED_SUPER_ADMIN = {
    email: 'damayojholmer@gmail.com',
    password: '112345',
    name: 'Jholmer Damayo',
    role: 'super_admin'
};

let adminUser = null;
let adminSession = null;
let adminSource = '';
let activeSection = 'dashboard';
let selectedOrderId = '';
let editingProductId = null;
let editingProductImages = [];

document.addEventListener('DOMContentLoaded', () => {
    void initAdminApp();
});

async function initAdminApp() {
    initAdminEvents();
    restoreLocalAdminSession();

    if (adminUser) {
        renderAdminState();
        return;
    }

    if (!hasSupabaseConfig()) {
        renderAdminState();
        return;
    }

    try {
        const restored = await restoreSupabaseUser();
        const approvedAdmin = getApprovedAdminByEmail(restored?.currentUser?.email);

        if (restored?.currentUser?.role === 'admin' || approvedAdmin) {
            adminUser = normalizeSupabaseAdmin(restored.currentUser, approvedAdmin);
            adminSession = restored.session;
            adminSource = approvedAdmin ? 'local-access' : 'supabase';
        }
    } catch (error) {
        console.warn('Unable to restore admin session.', error);
    }

    renderAdminState();
}

function initAdminEvents() {
    document.getElementById('admin-login-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        void handleAdminLogin();
    });
    document.getElementById('admin-request-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        handleAdminAccessRequest();
    });
    document.getElementById('admin-add-admin-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        handleAddAdmin();
    });
    document.getElementById('admin-item-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        handleAddItem();
    });
    document.getElementById('admin-edit-item-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        handleEditItemSubmit();
    });

    document.getElementById('admin-signout-btn')?.addEventListener('click', () => {
        void logoutAdmin();
    });

    document.getElementById('admin-open-storefront')?.addEventListener('click', openStorefront);
    document.getElementById('admin-open-storefront-auth')?.addEventListener('click', openStorefront);
    document.getElementById('admin-toggle-request-form')?.addEventListener('click', toggleAdminRequestForm);
    document.getElementById('admin-toggle-item-form')?.addEventListener('click', toggleAdminItemForm);

    document.querySelectorAll('.admin-nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
            switchAdminSection(button.dataset.section || 'dashboard');
        });
    });

    initAdminItemModal();

    document.getElementById('admin-console')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-action]');
        if (!button) return;

        const { adminAction, orderId = '', requestId = '', productId = '' } = button.dataset;

        if (adminAction === 'view-order') {
            selectedOrderId = orderId;
            renderAdminViews();
            return;
        }

        if (adminAction === 'delete-order') {
            deleteOrder(orderId);
            return;
        }

        if (adminAction === 'approve-access-request') {
            approveAdminAccessRequest(requestId);
            return;
        }

        if (adminAction === 'reject-access-request') {
            rejectAdminAccessRequest(requestId);
            return;
        }

        if (adminAction === 'toggle-item-menu') {
            toggleItemMenu(productId);
            return;
        }

        if (adminAction === 'edit-item') {
            closeItemMenus();
            openEditItemModal(productId);
            return;
        }

        if (adminAction === 'delete-item') {
            closeItemMenus();
            handleDeleteItem(productId);
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.admin-item-menu')) {
            closeItemMenus();
        }
    });

    window.addEventListener('storage', (event) => {
        if (
            adminUser &&
            [
                BUYER_NOTIFICATIONS_STORAGE_KEY,
                ADMIN_ACCESS_LIST_STORAGE_KEY,
                ADMIN_ACCESS_REQUESTS_STORAGE_KEY
            ].includes(event.key)
        ) {
            renderAdminViews();
        }

        if (adminUser && PRODUCT_STORAGE_KEYS.includes(event.key)) {
            renderAdminViews();
        }
    });
}

function initAdminItemModal() {
    document.getElementById('admin-add-item-modal-close')?.addEventListener('click', () => {
        closeAddItemModal();
    });
    document.getElementById('admin-add-item-modal-backdrop')?.addEventListener('click', () => {
        closeAddItemModal();
    });
    document.getElementById('admin-add-item-back')?.addEventListener('click', () => {
        closeAddItemModal();
    });
    document.getElementById('admin-item-modal-close')?.addEventListener('click', () => {
        closeAdminItemModal();
    });
    document.getElementById('admin-item-modal-backdrop')?.addEventListener('click', () => {
        closeAdminItemModal();
    });
    document.getElementById('admin-edit-item-upload')?.addEventListener('change', (event) => {
        void handleEditItemUpload(event);
    });
    document.getElementById('admin-edit-item-images')?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('[data-remove-image-index]');
        if (!removeButton) return;

        removeEditItemImage(Number(removeButton.dataset.removeImageIndex));
    });

    window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        closeItemMenus();
        closeAddItemModal();
        closeAdminItemModal();
    });
}

function openAddItemModal() {
    const modal = document.getElementById('admin-add-item-modal');
    const form = document.getElementById('admin-item-form');
    const firstInput = document.getElementById('admin-item-name');

    if (!modal || !form || !firstInput) return;

    form.reset();
    setAddItemFeedback('', '');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    syncAdminModalLock();
    firstInput.focus();
}

function closeAddItemModal() {
    const modal = document.getElementById('admin-add-item-modal');
    const form = document.getElementById('admin-item-form');

    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setAddItemFeedback('', '');
    form?.reset();
    syncAdminModalLock();
}

function openEditItemModal(productId) {
    const product = findCatalogProduct(productId);
    const modal = document.getElementById('admin-item-modal');
    const nameInput = document.getElementById('admin-edit-item-name');
    const priceInput = document.getElementById('admin-edit-item-price');

    if (!product || !modal || !nameInput || !priceInput) return;

    editingProductId = product.id;
    editingProductImages = getProductImages(product).slice(0, MAX_ITEM_IMAGES);
    nameInput.value = product.name;
    priceInput.value = String(Number(product.price || 0));
    setEditItemFeedback('', '');
    renderEditItemImages();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    syncAdminModalLock();
    nameInput.focus();
    nameInput.select();
}

function closeAdminItemModal() {
    const modal = document.getElementById('admin-item-modal');
    const form = document.getElementById('admin-edit-item-form');
    const uploadInput = document.getElementById('admin-edit-item-upload');

    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    syncAdminModalLock();

    editingProductId = null;
    editingProductImages = [];
    setEditItemFeedback('', '');
    form?.reset();

    if (uploadInput) {
        uploadInput.value = '';
    }
}

function syncAdminModalLock() {
    const hasOpenModal = Boolean(document.querySelector('.admin-item-modal.open'));
    document.body.classList.toggle('admin-modal-open', hasOpenModal);
}

function renderEditItemImages() {
    const container = document.getElementById('admin-edit-item-images');
    if (!container) return;

    if (!editingProductImages.length) {
        container.innerHTML = `
            <div class="admin-edit-item-empty">
                <strong>No image selected</strong>
                <span>Upload a PNG or JPEG so this product keeps its storefront preview.</span>
            </div>
        `;
        return;
    }

    container.innerHTML = editingProductImages.map((image, index) => `
        <article class="admin-edit-item-image-card ${index === 0 ? 'is-primary' : ''}">
            <button
                class="admin-edit-item-image-remove"
                type="button"
                data-remove-image-index="${index}"
                aria-label="Remove product image ${index + 1}"
            >
                &times;
            </button>
            <img src="${escapeHtml(image)}" alt="Product image ${index + 1}">
            <div class="admin-edit-item-image-meta">
                <strong>${index === 0 ? 'Primary Image' : `Image ${index + 1}`}</strong>
            </div>
        </article>
    `).join('');
}

async function handleEditItemUpload(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];

    if (!file) return;

    if (!ALLOWED_ITEM_IMAGE_TYPES.has(file.type)) {
        setEditItemFeedback('Only PNG and JPEG images are allowed here.', 'error');
        input.value = '';
        return;
    }

    if (editingProductImages.length >= MAX_ITEM_IMAGES) {
        setEditItemFeedback(`You can keep up to ${MAX_ITEM_IMAGES} product images in this editor.`, 'error');
        input.value = '';
        return;
    }

    try {
        const imageSource = await readFileAsDataUrl(file);
        editingProductImages = [...editingProductImages, imageSource];
        renderEditItemImages();
        setEditItemFeedback(`${file.name} is ready to save.`, 'success');
    } catch (error) {
        setEditItemFeedback(error.message || 'Unable to read that image file right now.', 'error');
    } finally {
        input.value = '';
    }
}

function removeEditItemImage(index) {
    if (!Number.isInteger(index) || index < 0 || index >= editingProductImages.length) return;

    editingProductImages = editingProductImages.filter((_, imageIndex) => imageIndex !== index);
    renderEditItemImages();

    if (!editingProductImages.length) {
        setEditItemFeedback('Upload a new PNG or JPEG before saving this item.', 'error');
        return;
    }

    setEditItemFeedback('Image removed. Save the product when you are ready.', '');
}

function handleEditItemSubmit() {
    const name = document.getElementById('admin-edit-item-name')?.value.trim() ?? '';
    const price = Number(document.getElementById('admin-edit-item-price')?.value ?? 0);

    if (!editingProductId) {
        setEditItemFeedback('Pick a product to edit first.', 'error');
        return;
    }

    if (!name) {
        setEditItemFeedback('Item name is required.', 'error');
        return;
    }

    if (!Number.isFinite(price) || price < 0) {
        setEditItemFeedback('Enter a valid item price.', 'error');
        return;
    }

    if (!editingProductImages.length) {
        setEditItemFeedback('Add at least one PNG or JPEG image before saving.', 'error');
        return;
    }

    try {
        const updatedProduct = updateProduct(editingProductId, {
            name,
            price,
            images: editingProductImages
        });

        renderAdminViews();
        setInlineFeedback('admin-item-feedback', `${updatedProduct.name} was updated successfully.`, 'success');
        closeAdminItemModal();
    } catch (error) {
        setEditItemFeedback(error.message || 'Unable to save the item right now.', 'error');
    }
}

function handleDeleteItem(productId) {
    const product = findCatalogProduct(productId);
    if (!product) return;

    const confirmed = window.confirm(`Delete "${product.name}" from the item catalog?`);
    if (!confirmed) return;

    try {
        deleteProduct(product.id);

        if (editingProductId === product.id) {
            closeAdminItemModal();
        }

        renderAdminViews();
        setInlineFeedback('admin-item-feedback', `${product.name} was removed from the catalog.`, 'success');
    } catch (error) {
        setInlineFeedback('admin-item-feedback', error.message || 'Unable to delete the item right now.', 'error');
    }
}

function toggleItemMenu(productId) {
    const target = document.querySelector(`.admin-item-menu[data-product-id="${Number(productId)}"]`);
    const shouldOpen = Boolean(target && !target.classList.contains('is-open'));

    closeItemMenus();

    if (shouldOpen) {
        target.classList.add('is-open');
    }
}

function closeItemMenus() {
    document.querySelectorAll('.admin-item-menu.is-open').forEach((menu) => {
        menu.classList.remove('is-open');
    });
}

function findCatalogProduct(productId) {
    const normalizedId = Number(productId);
    return getProducts().find((product) => product.id === normalizedId) || null;
}

async function readFileAsDataUrl(file) {
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const result = String(reader.result || '').trim();
            if (!result) {
                reject(new Error('The selected image is empty.'));
                return;
            }

            resolve(result);
        };

        reader.onerror = () => {
            reject(new Error('Unable to read the selected image.'));
        };

        reader.readAsDataURL(file);
    });
}

function setEditItemFeedback(message, state = '') {
    const feedback = document.getElementById('admin-edit-item-feedback');
    if (!feedback) return;

    feedback.textContent = message;

    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

function setAddItemFeedback(message, state = '') {
    const feedback = document.getElementById('admin-add-item-feedback');
    if (!feedback) return;

    feedback.textContent = message;

    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

async function handleAdminLogin() {
    const email = document.getElementById('admin-login-email')?.value.trim().toLowerCase() ?? '';
    const password = document.getElementById('admin-login-password')?.value ?? '';
    const rememberMe = Boolean(document.getElementById('admin-login-remember')?.checked);

    const isEmailValid = validateAdminEmail();
    const isPasswordValid = validateAdminPassword();

    if (!isEmailValid || !isPasswordValid) {
        setAdminFeedback('Fix the login fields before continuing.', 'error');
        return;
    }

    setAdminFeedback('Signing you in...', '');

    const isSeededSuperAdmin = email === SEEDED_SUPER_ADMIN.email && password === SEEDED_SUPER_ADMIN.password;
    const approvedAdmin = getApprovedAdminByEmail(email);

    if (hasSupabaseConfig()) {
        try {
            const authResult = await signInWithSupabase({ email, password, rememberMe });

            if (authResult.currentUser?.role === 'admin' || approvedAdmin) {
                adminUser = normalizeSupabaseAdmin(authResult.currentUser, approvedAdmin);
                adminSession = authResult.session;
                adminSource = approvedAdmin ? 'local-access' : 'supabase';
                clearLocalAdminSession();
                finishAdminLogin(`Welcome back, ${getFirstName(adminUser.name)}.`);
                return;
            }

            await signOutFromSupabase(authResult.session?.access_token);

            if (!isSeededSuperAdmin) {
                setAdminFeedback('This account exists, but it does not have admin access.', 'error');
                return;
            }
        } catch (error) {
            if (!isSeededSuperAdmin) {
                setAdminFeedback(error.message || 'Unable to sign in right now.', 'error');
                return;
            }
        }
    } else if (!isSeededSuperAdmin) {
        setAdminFeedback('Supabase is not configured, so only the seeded super admin can log in here.', 'error');
        return;
    }

    if (isSeededSuperAdmin) {
        adminUser = createSeededSuperAdmin();
        adminSession = null;
        adminSource = 'seeded';
        saveLocalAdminSession(adminUser, rememberMe);
        finishAdminLogin(`Welcome back, ${getFirstName(adminUser.name)}.`);
        return;
    }

    setAdminFeedback('Unable to sign in right now.', 'error');
}

function finishAdminLogin(message) {
    setAdminFeedback(message, 'success');
    renderAdminState();

    window.setTimeout(() => {
        document.getElementById('admin-login-form')?.reset();
        clearAdminFieldMessages();
        setAdminFeedback('', '');
    }, 200);
}

async function logoutAdmin() {
    if (adminSession?.access_token) {
        try {
            await signOutFromSupabase(adminSession.access_token);
        } catch (error) {
            console.warn('Unable to fully sign out the admin.', error);
        }
    }

    clearLocalAdminSession();
    adminUser = null;
    adminSession = null;
    adminSource = '';
    selectedOrderId = '';
    renderAdminState();
}

function renderAdminState() {
    const authScreen = document.getElementById('admin-auth-screen');
    const consoleShell = document.getElementById('admin-console');

    if (!authScreen || !consoleShell) return;

    const isLoggedIn = Boolean(adminUser);
    authScreen.hidden = isLoggedIn;
    consoleShell.hidden = !isLoggedIn;
    document.body.classList.toggle('admin-console-active', isLoggedIn);

    if (!isLoggedIn) {
        return;
    }

    document.getElementById('admin-user-name').textContent = adminUser.name;
    document.getElementById('admin-user-avatar').src = getAdminAvatarUrl(adminUser);
    document.getElementById('admin-hero-date').textContent = formatLongDate(new Date());

    switchAdminSection(activeSection);
    renderAdminViews();
}

function renderAdminViews() {
    const currentProducts = getProducts();
    const orders = loadBuyerNotifications();
    ensureSelectedOrder(orders);
    renderDashboard(currentProducts, orders);
    renderItemsPanel(currentProducts, orders);
    renderOrdersPanel(orders);
    renderAnalysisPanel(currentProducts, orders);
    renderSettingsPanel(orders);
}

function switchAdminSection(section) {
    const nextSection = ADMIN_SECTIONS[section] ? section : 'dashboard';
    activeSection = nextSection;

    document.querySelectorAll('.admin-nav-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.section === nextSection);
    });

    document.querySelectorAll('.admin-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.panel === nextSection);
    });

    const copy = ADMIN_SECTIONS[nextSection];
    document.getElementById('admin-page-kicker').textContent = copy.kicker;
    document.getElementById('admin-page-title').textContent = copy.title;
    document.getElementById('admin-page-subtitle').textContent = copy.subtitle;
}

function updateHeroSummary(orders) {
    return orders;
}

function renderDashboard(currentProducts, orders) {
    const totalSales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const uniqueCustomers = getUniqueCustomersCount(orders);

    renderMetricGrid('admin-dashboard-stats', [
        {
            label: 'Total Items',
            value: currentProducts.length.toString(),
            detail: 'Live products currently listed on the storefront'
        },
        {
            label: 'Total Sales',
            value: formatMoney(totalSales),
            detail: 'Combined sales value from recorded customer checkouts'
        },
        {
            label: 'Customer',
            value: uniqueCustomers.toString(),
            detail: 'Unique customers captured from successful checkouts'
        }
    ]);

    const customerCount = document.getElementById('admin-customer-count');
    if (customerCount) {
        customerCount.textContent = `${uniqueCustomers} customer${uniqueCustomers === 1 ? '' : 's'}`;
    }

    const body = document.getElementById('admin-dashboard-customers');
    if (!body) return;

    if (!orders.length) {
        body.innerHTML = `<tr><td colspan="7" class="admin-empty-row">No customer purchases yet.</td></tr>`;
        renderOrderDetail(null);
        return;
    }

    body.innerHTML = orders.map((order) => {
        const customer = order.customer;
        return `
            <tr class="${order.id === selectedOrderId ? 'is-selected' : ''}">
                <td>
                    <div class="admin-table-primary">
                        <strong>${escapeHtml(customer.name)}</strong>
                        <span>${escapeHtml(formatTimestamp(order.createdAt))}</span>
                    </div>
                </td>
                <td>${escapeHtml(customer.email)}</td>
                <td>${escapeHtml(customer.phone)}</td>
                <td>${escapeHtml(formatOrderItemsLabel(order))}</td>
                <td>${order.totalItems}</td>
                <td>
                    <button class="admin-inline-btn" type="button" data-admin-action="view-order" data-order-id="${order.id}">
                        View
                    </button>
                </td>
                <td>
                    <button class="admin-icon-btn admin-icon-btn-danger" type="button" data-admin-action="delete-order" data-order-id="${order.id}" aria-label="Delete order">
                        ${trashIconMarkup()}
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderOrderDetail(getSelectedOrder(orders));
}

function renderItemsPanel(currentProducts, orders) {
    const container = document.getElementById('admin-items-grid');
    if (!container) return;

    container.innerHTML = currentProducts.map((product) => {
        const sold = getSoldQuantityForProduct(product, orders);
        const revenue = getRevenueForProduct(product, orders);
        const images = getProductImages(product);
        const primaryImage = images[0] || '';

        return `
            <article class="admin-item-card">
                <div class="admin-item-menu" data-product-id="${product.id}">
                    <button
                        class="admin-item-menu-trigger"
                        type="button"
                        data-admin-action="toggle-item-menu"
                        data-product-id="${product.id}"
                        aria-label="Open item actions for ${escapeHtml(product.name)}"
                    >
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>
                    <div class="admin-item-menu-sheet">
                        <button class="admin-item-menu-action" type="button" data-admin-action="edit-item" data-product-id="${product.id}">
                            Edit
                        </button>
                        <button class="admin-item-menu-action is-danger" type="button" data-admin-action="delete-item" data-product-id="${product.id}">
                            Delete
                        </button>
                    </div>
                </div>
                <div class="admin-item-media">
                    <img src="${escapeHtml(primaryImage)}" alt="${escapeHtml(product.name)}">
                </div>
                <div class="admin-item-body">
                    <div class="admin-item-topline">
                        <span class="admin-pill">${escapeHtml(formatCategory(product.category))}</span>
                        <span class="admin-muted-text">${images.length} image${images.length === 1 ? '' : 's'}</span>
                    </div>
                    <h3>${escapeHtml(product.name)}</h3>
                    <p>${escapeHtml(product.description)}</p>
                    <div class="admin-item-metrics">
                        <div>
                            <span>Price</span>
                            <strong>${formatMoney(product.price)}</strong>
                        </div>
                        <div>
                            <span>Sold</span>
                            <strong>${sold}</strong>
                        </div>
                        <div>
                            <span>Revenue</span>
                            <strong>${formatMoney(revenue)}</strong>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderOrdersPanel(orders) {
    const table = document.getElementById('admin-orders-table');
    const summary = document.getElementById('admin-orders-summary');

    if (table) {
        if (!orders.length) {
            table.innerHTML = `<tr><td colspan="7" class="admin-empty-row">No orders captured yet.</td></tr>`;
        } else {
            table.innerHTML = orders.map((order) => `
                <tr class="${order.id === selectedOrderId ? 'is-selected' : ''}">
                    <td>#${escapeHtml(order.id.slice(0, 8))}</td>
                    <td>${escapeHtml(order.customer.name)}</td>
                    <td>${formatMoney(order.totalAmount)}</td>
                    <td>
                        <span class="admin-status ${canCancelOrder(order) ? 'is-active' : 'is-locked'}">
                            ${canCancelOrder(order) ? 'Active' : 'Locked'}
                        </span>
                    </td>
                    <td>${escapeHtml(formatTimestamp(order.createdAt))}</td>
                    <td>
                        <button class="admin-inline-btn" type="button" data-admin-action="view-order" data-order-id="${order.id}">
                            View
                        </button>
                    </td>
                    <td>
                        <button class="admin-icon-btn admin-icon-btn-danger" type="button" data-admin-action="delete-order" data-order-id="${order.id}" aria-label="Delete order">
                            ${trashIconMarkup()}
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    }

    if (summary) {
        const activeOrders = orders.filter((order) => canCancelOrder(order)).length;
        const totalUnits = orders.reduce((sum, order) => sum + Number(order.totalItems || 0), 0);
        const sales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

        summary.innerHTML = renderStackRows([
            ['Recorded Orders', orders.length.toString()],
            ['Active Orders', activeOrders.toString()],
            ['Units Purchased', totalUnits.toString()],
            ['Sales Logged', formatMoney(sales)]
        ], 'No order activity yet.');
    }
}

function renderAnalysisPanel(currentProducts, orders) {
    const totalSales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const totalUnits = orders.reduce((sum, order) => sum + Number(order.totalItems || 0), 0);
    const averageOrderValue = orders.length ? totalSales / orders.length : 0;
    const bestSeller = getBestSeller(orders);

    renderMetricGrid('admin-analysis-stats', [
        {
            label: 'Best Seller',
            value: bestSeller?.name || 'No sales yet',
            detail: bestSeller ? `${bestSeller.quantity} units sold` : 'Waiting for the first completed checkout'
        },
        {
            label: 'Units Sold',
            value: totalUnits.toString(),
            detail: 'Total quantity across all stored customer orders'
        },
        {
            label: 'Average Order',
            value: formatMoney(averageOrderValue),
            detail: 'Average sales value across all logged orders'
        },
        {
            label: 'Catalog Spread',
            value: `${new Set(currentProducts.map((product) => product.category)).size}`,
            detail: 'Distinct product categories active in the catalog'
        }
    ]);

    const bestSellers = getBestSellers(orders).map((item, index) => [
        `${index + 1}. ${item.name}`,
        `${item.quantity} sold`
    ]);
    document.getElementById('admin-best-sellers').innerHTML = renderStackRows(bestSellers, 'No product sales to rank yet.');

    const categoryRows = getCategoryRevenueBreakdown(currentProducts, orders).map((row) => [
        formatCategory(row.category),
        formatMoney(row.revenue)
    ]);
    document.getElementById('admin-category-analysis').innerHTML = renderStackRows(categoryRows, 'No category revenue to analyze yet.');

    const customerRows = getTopCustomers(orders).map((customer) => [
        customer.name,
        `${customer.orders} order${customer.orders === 1 ? '' : 's'}`
    ]);
    document.getElementById('admin-customer-analysis').innerHTML = renderStackRows(customerRows, 'No customer activity yet.');
}

function renderSettingsPanel(orders) {
    const details = document.getElementById('admin-settings-details');
    const notes = document.getElementById('admin-settings-notes');
    const adminList = document.getElementById('admin-admin-list');
    const requestList = document.getElementById('admin-access-requests');
    const approvedAdmins = getApprovedAdmins();
    const accessRequests = getAdminAccessRequests();

    if (details) {
        details.innerHTML = [
            ['Admin Name', adminUser?.name || '-'],
            ['Email', adminUser?.email || '-'],
            ['Access Role', formatRole(adminUser?.role || 'admin')],
            ['Session Source', formatAdminSource(adminSource)],
            ['Orders Stored', orders.length.toString()],
            ['Approved Admins', approvedAdmins.length.toString()]
        ].map(([label, value]) => `
            <div class="admin-detail-row">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `).join('');
    }

    if (notes) {
        notes.innerHTML = [
            `Admin login route: /admin/`,
            `Supabase config: ${hasSupabaseConfig() ? 'Connected' : 'Not configured'}`,
            `Seeded super admin email: ${SEEDED_SUPER_ADMIN.email}`,
            `Pending join requests: ${accessRequests.length}`,
            'Dashboard data comes from saved storefront checkout notifications.',
            'Phone values stay "Not provided" until the storefront starts collecting them.',
            'Locally approved admins still need a valid customer account password to sign in.'
        ].map((note) => `<p class="admin-note">${escapeHtml(note)}</p>`).join('');
    }

    if (adminList) {
        adminList.innerHTML = renderAdminDirectory(approvedAdmins);
    }

    if (requestList) {
        requestList.innerHTML = renderAdminRequests(accessRequests);
    }
}

function renderMetricGrid(containerId, stats) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = stats.map((stat, index) => `
        <article class="admin-metric-card admin-metric-tone-${(index % 4) + 1}">
            <div class="admin-metric-topline">
                <span class="admin-metric-icon">${stat.label.charAt(0)}</span>
            </div>
            <span class="admin-metric-label">${escapeHtml(stat.label)}</span>
            <strong class="admin-metric-value">${escapeHtml(stat.value)}</strong>
            <p class="admin-metric-detail">${escapeHtml(stat.detail)}</p>
        </article>
    `).join('');
}

function renderOrderDetail(order) {
    const container = document.getElementById('admin-order-detail');
    if (!container) return;

    if (!order) {
        container.innerHTML = `<p class="admin-empty-state">Select a customer order to preview its full details.</p>`;
        return;
    }

    const itemsMarkup = order.items.length
        ? order.items.map((item) => `
            <div class="admin-line-item">
                <div>
                    <strong>${escapeHtml(item.name)}</strong>
                    <span>Size ${escapeHtml(item.size || 'N/A')}</span>
                </div>
                <div class="admin-line-item-meta">
                    <span>Qty ${Number(item.quantity || 0)}</span>
                    <strong>${formatMoney(Number(item.price || 0) * Number(item.quantity || 0))}</strong>
                </div>
            </div>
        `).join('')
        : `<p class="admin-empty-state">No line items saved for this order.</p>`;

    container.innerHTML = `
        <div class="admin-order-preview">
            <div class="admin-order-preview-head">
                <div>
                    <p class="admin-preview-kicker">Order #${escapeHtml(order.id.slice(0, 8))}</p>
                    <h4>${escapeHtml(order.customer.name)}</h4>
                </div>
                <span class="admin-status ${canCancelOrder(order) ? 'is-active' : 'is-locked'}">
                    ${canCancelOrder(order) ? 'Active' : 'Locked'}
                </span>
            </div>

            <div class="admin-order-preview-grid">
                <div>
                    <span class="admin-label">Email</span>
                    <strong>${escapeHtml(order.customer.email)}</strong>
                </div>
                <div>
                    <span class="admin-label">Phone</span>
                    <strong>${escapeHtml(order.customer.phone)}</strong>
                </div>
                <div>
                    <span class="admin-label">Items</span>
                    <strong>${order.totalItems}</strong>
                </div>
                <div>
                    <span class="admin-label">Total</span>
                    <strong>${formatMoney(order.totalAmount)}</strong>
                </div>
            </div>

            <div class="admin-order-line-list">${itemsMarkup}</div>
        </div>
    `;
}

function loadBuyerNotifications() {
    try {
        const raw = window.localStorage.getItem(BUYER_NOTIFICATIONS_STORAGE_KEY);
        const notifications = JSON.parse(raw || '[]');

        if (!Array.isArray(notifications)) {
            return [];
        }

        return notifications
            .map((notification, index) => normalizeOrder(notification, index))
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    } catch (error) {
        console.warn('Unable to load storefront notifications for admin.', error);
        return [];
    }
}

function normalizeOrder(notification, index) {
    const items = Array.isArray(notification.items) ? notification.items : [];
    const derivedTotalItems = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const derivedTotalAmount = items.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0);
    const customer = notification.customer || {};
    const fallbackEmail = customer.email || notification.customerEmail || notification.email || 'No email provided';
    const fallbackName = customer.name || notification.customerName || notification.name || (fallbackEmail !== 'No email provided' ? fallbackEmail : `Customer ${index + 1}`);

    return {
        ...notification,
        id: notification.id || `${Date.now()}-${index}`,
        customer: {
            name: String(fallbackName || 'Walk-in Customer'),
            email: String(fallbackEmail || 'No email provided'),
            phone: String(customer.phone || notification.customerPhone || notification.phone || 'Not provided')
        },
        items,
        totalItems: Number(notification.totalItems || derivedTotalItems),
        totalAmount: Number(notification.totalAmount || derivedTotalAmount),
        createdAt: notification.createdAt ? new Date(notification.createdAt) : new Date()
    };
}

function saveBuyerNotifications(orders) {
    try {
        window.localStorage.setItem(BUYER_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(orders));
    } catch (error) {
        console.warn('Unable to save storefront notifications from admin.', error);
    }
}

function deleteOrder(orderId) {
    const orders = loadBuyerNotifications();
    const target = orders.find((order) => order.id === orderId);
    if (!target) return;

    const confirmed = window.confirm(`Delete order from ${target.customer.name}?`);
    if (!confirmed) return;

    const nextOrders = orders.filter((order) => order.id !== orderId);
    saveBuyerNotifications(nextOrders);
    selectedOrderId = nextOrders[0]?.id || '';
    renderAdminViews();
}

function toggleAdminRequestForm() {
    const form = document.getElementById('admin-request-form');
    if (!form) return;

    form.hidden = !form.hidden;
}

function toggleAdminItemForm() {
    openAddItemModal();
}

function handleAdminAccessRequest() {
    const name = document.getElementById('admin-request-name')?.value.trim() ?? '';
    const email = document.getElementById('admin-request-email')?.value.trim().toLowerCase() ?? '';
    const reason = document.getElementById('admin-request-reason')?.value.trim() ?? '';

    if (!name || !isValidEmail(email) || !reason) {
        setInlineFeedback('admin-request-feedback', 'Complete your name, email, and reason before sending the request.', 'error');
        return;
    }

    createAdminAccessRequest({ name, email, reason });
    document.getElementById('admin-request-form')?.reset();
    document.getElementById('admin-request-form')?.setAttribute('hidden', '');
    setInlineFeedback('admin-request-feedback', 'Your admin access request was sent for review.', 'success');
}

function handleAddAdmin() {
    const name = document.getElementById('admin-access-name')?.value.trim() ?? '';
    const email = document.getElementById('admin-access-email')?.value.trim().toLowerCase() ?? '';

    if (!name || !isValidEmail(email)) {
        setInlineFeedback('admin-admin-feedback', 'Enter a valid admin name and email address.', 'error');
        return;
    }

    saveApprovedAdmin({ name, email, source: 'manual' });
    clearRequestByEmail(email);
    document.getElementById('admin-add-admin-form')?.reset();
    setInlineFeedback('admin-admin-feedback', `${name} can now use this admin console after signing in.`, 'success');
    renderAdminViews();
}

function handleAddItem() {
    const name = document.getElementById('admin-item-name')?.value.trim() ?? '';
    const price = Number(document.getElementById('admin-item-price')?.value ?? 0);
    const category = document.getElementById('admin-item-category')?.value ?? 'tshirts';
    const image = document.getElementById('admin-item-image')?.value.trim() ?? '';
    const imageAlt = document.getElementById('admin-item-image-alt')?.value.trim() ?? '';
    const description = document.getElementById('admin-item-description')?.value.trim() ?? '';

    if (!name || !description || !image || !Number.isFinite(price) || price < 0) {
        setAddItemFeedback('Fill in the item name, price, image, and description before saving.', 'error');
        return;
    }

    try {
        addCustomProduct({ name, price, category, image, imageAlt, description });
        setAddItemFeedback(`${name} was added successfully. Opening the storefront collection...`, 'success');
        setInlineFeedback('admin-item-feedback', `${name} was added to the catalog.`, 'success');
        renderAdminViews();
        window.setTimeout(() => {
            closeAddItemModal();
            openStorefrontCollection(category);
        }, 240);
    } catch (error) {
        setAddItemFeedback(error.message || 'Unable to save the item right now.', 'error');
    }
}

function approveAdminAccessRequest(requestId) {
    const request = getAdminAccessRequests().find((entry) => entry.id === requestId);
    if (!request) return;

    saveApprovedAdmin({
        name: request.name,
        email: request.email,
        source: 'request'
    });
    removeAdminAccessRequest(requestId);
    setInlineFeedback('admin-admin-feedback', `${request.name} was added as an admin.`, 'success');
    renderAdminViews();
}

function rejectAdminAccessRequest(requestId) {
    const request = getAdminAccessRequests().find((entry) => entry.id === requestId);
    if (!request) return;

    removeAdminAccessRequest(requestId);
    setInlineFeedback('admin-admin-feedback', `${request.name}'s request was removed.`, 'success');
    renderAdminViews();
}

function ensureSelectedOrder(orders) {
    if (!orders.length) {
        selectedOrderId = '';
        return;
    }

    const selectedExists = orders.some((order) => order.id === selectedOrderId);
    if (!selectedExists) {
        selectedOrderId = orders[0].id;
    }
}

function getSelectedOrder(orders) {
    return orders.find((order) => order.id === selectedOrderId) || null;
}

function getBestSeller(orders) {
    return getBestSellers(orders)[0] || null;
}

function getBestSellers(orders) {
    const totals = new Map();

    orders.forEach((order) => {
        order.items.forEach((item) => {
            const current = totals.get(item.name) || { name: item.name, quantity: 0 };
            current.quantity += Number(item.quantity || 0);
            totals.set(item.name, current);
        });
    });

    return [...totals.values()].sort((left, right) => right.quantity - left.quantity).slice(0, 5);
}

function getCategoryRevenueBreakdown(currentProducts, orders) {
    const categoryByProductId = new Map(currentProducts.map((product) => [product.id, product.category]));
    const categoryByProductName = new Map(currentProducts.map((product) => [product.name, product.category]));
    const totals = new Map();

    orders.forEach((order) => {
        order.items.forEach((item) => {
            const category = categoryByProductId.get(Number(item.id)) || categoryByProductName.get(item.name) || 'uncategorized';
            const revenue = Number(item.price || 0) * Number(item.quantity || 0);
            totals.set(category, (totals.get(category) || 0) + revenue);
        });
    });

    return [...totals.entries()]
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((left, right) => right.revenue - left.revenue);
}

function getTopCustomers(orders) {
    const totals = new Map();

    orders.forEach((order) => {
        const key = order.customer.email !== 'No email provided'
            ? order.customer.email.toLowerCase()
            : order.customer.name.toLowerCase();
        const current = totals.get(key) || {
            name: order.customer.name,
            orders: 0
        };
        current.orders += 1;
        totals.set(key, current);
    });

    return [...totals.values()].sort((left, right) => right.orders - left.orders).slice(0, 5);
}

function getUniqueCustomersCount(orders) {
    return new Set(orders.map((order) => {
        if (order.customer.email !== 'No email provided') {
            return order.customer.email.toLowerCase();
        }

        return order.customer.name.toLowerCase();
    })).size;
}

function getSoldQuantityForProduct(product, orders) {
    return orders.reduce((sum, order) => (
        sum + order.items
            .filter((item) => Number(item.id) === product.id || item.name === product.name)
            .reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0)
    ), 0);
}

function getRevenueForProduct(product, orders) {
    return orders.reduce((sum, order) => (
        sum + order.items
            .filter((item) => Number(item.id) === product.id || item.name === product.name)
            .reduce((itemSum, item) => itemSum + (Number(item.price || 0) * Number(item.quantity || 0)), 0)
    ), 0);
}

function getProductImages(product) {
    if (!product) return [];

    if (Array.isArray(product.images) && product.images.length) {
        return product.images.filter(Boolean);
    }

    return product.image ? [product.image] : [];
}

function formatOrderItemsLabel(order) {
    const names = order.items.map((item) => item.name);
    if (!names.length) return 'No items';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function renderStackRows(rows, emptyMessage) {
    if (!rows.length) {
        return `<p class="admin-empty-state">${escapeHtml(emptyMessage)}</p>`;
    }

    return rows.map(([label, value]) => `
        <div class="admin-stack-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join('');
}

function renderAdminDirectory(admins) {
    if (!admins.length) {
        return '<p class="admin-empty-state">No extra admins added yet.</p>';
    }

    return admins.map((admin) => `
        <div class="admin-stack-row">
            <div class="admin-stack-row-copy">
                <span>${escapeHtml(admin.name)}</span>
                <p>${escapeHtml(admin.email)}</p>
            </div>
            <strong>${escapeHtml(admin.source === 'request' ? 'Approved Request' : 'Manual Add')}</strong>
        </div>
    `).join('');
}

function renderAdminRequests(requests) {
    if (!requests.length) {
        return '<p class="admin-empty-state">No pending admin join requests.</p>';
    }

    return requests.map((request) => `
        <div class="admin-stack-row">
            <div class="admin-stack-row-copy">
                <span>${escapeHtml(request.name)}</span>
                <p>${escapeHtml(request.email)}</p>
                <p>${escapeHtml(request.reason)}</p>
            </div>
            <div class="admin-stack-row-actions">
                <button
                    class="admin-inline-btn"
                    type="button"
                    data-admin-action="approve-access-request"
                    data-request-id="${request.id}"
                >
                    Approve
                </button>
                <button
                    class="admin-icon-btn admin-icon-btn-danger"
                    type="button"
                    data-admin-action="reject-access-request"
                    data-request-id="${request.id}"
                    aria-label="Remove access request"
                >
                    ${trashIconMarkup()}
                </button>
            </div>
        </div>
    `).join('');
}

function canCancelOrder(order) {
    const createdAtTime = new Date(order.createdAt).getTime();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return (Date.now() - createdAtTime) < twoDaysInMs;
}

function normalizeSupabaseAdmin(currentUser, approvedAdmin = null) {
    return {
        ...currentUser,
        name: approvedAdmin?.name || currentUser.name,
        role: currentUser.email === SEEDED_SUPER_ADMIN.email ? 'super_admin' : 'admin'
    };
}

function createSeededSuperAdmin() {
    return {
        id: 'seeded-super-admin',
        email: SEEDED_SUPER_ADMIN.email,
        name: SEEDED_SUPER_ADMIN.name,
        role: SEEDED_SUPER_ADMIN.role
    };
}

function restoreLocalAdminSession() {
    try {
        const mode = window.localStorage.getItem(ADMIN_LOCAL_MODE_KEY) || 'local';
        const localValue = window.localStorage.getItem(ADMIN_LOCAL_SESSION_KEY);
        const sessionValue = window.sessionStorage.getItem(ADMIN_LOCAL_SESSION_KEY);
        const raw = mode === 'session' ? (sessionValue || localValue) : (localValue || sessionValue);
        const parsed = JSON.parse(raw || 'null');

        if (!parsed?.email) {
            return;
        }

        adminUser = parsed;
        adminSession = null;
        adminSource = parsed.source || 'seeded';
    } catch (error) {
        console.warn('Unable to restore local admin session.', error);
    }
}

function saveLocalAdminSession(user, rememberMe) {
    const mode = rememberMe ? 'local' : 'session';

    clearLocalAdminSession();
    getAdminSessionStorage(mode).setItem(ADMIN_LOCAL_SESSION_KEY, JSON.stringify(user));
    window.localStorage.setItem(ADMIN_LOCAL_MODE_KEY, mode);
}

function clearLocalAdminSession() {
    window.localStorage.removeItem(ADMIN_LOCAL_SESSION_KEY);
    window.sessionStorage.removeItem(ADMIN_LOCAL_SESSION_KEY);
    window.localStorage.removeItem(ADMIN_LOCAL_MODE_KEY);
}

function getAdminSessionStorage(mode = 'local') {
    return mode === 'session' ? window.sessionStorage : window.localStorage;
}

function getApprovedAdmins() {
    return readJsonArray(ADMIN_ACCESS_LIST_STORAGE_KEY)
        .map((entry, index) => normalizeAdminEntry(entry, index))
        .filter(Boolean);
}

function getApprovedAdminByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return null;

    return getApprovedAdmins().find((entry) => entry.email === normalizedEmail) || null;
}

function saveApprovedAdmin(admin) {
    const existing = getApprovedAdmins();
    const normalizedEmail = String(admin.email || '').trim().toLowerCase();
    const nextEntry = normalizeAdminEntry({
        id: existing.find((entry) => entry.email === normalizedEmail)?.id || `admin-${Date.now()}`,
        name: admin.name,
        email: normalizedEmail,
        source: admin.source || 'manual',
        createdAt: new Date().toISOString()
    }, existing.length);

    const filtered = existing.filter((entry) => entry.email !== normalizedEmail);
    writeJsonArray(ADMIN_ACCESS_LIST_STORAGE_KEY, [...filtered, nextEntry]);
}

function getAdminAccessRequests() {
    return readJsonArray(ADMIN_ACCESS_REQUESTS_STORAGE_KEY)
        .map((entry, index) => normalizeAdminAccessRequest(entry, index))
        .filter(Boolean);
}

function createAdminAccessRequest(request) {
    const existing = getAdminAccessRequests();
    const normalizedEmail = String(request.email || '').trim().toLowerCase();
    const nextRequest = normalizeAdminAccessRequest({
        id: existing.find((entry) => entry.email === normalizedEmail)?.id || `request-${Date.now()}`,
        name: request.name,
        email: normalizedEmail,
        reason: request.reason,
        createdAt: new Date().toISOString()
    }, existing.length);

    const filtered = existing.filter((entry) => entry.email !== normalizedEmail);
    writeJsonArray(ADMIN_ACCESS_REQUESTS_STORAGE_KEY, [...filtered, nextRequest]);
}

function removeAdminAccessRequest(requestId) {
    const nextRequests = getAdminAccessRequests().filter((entry) => entry.id !== requestId);
    writeJsonArray(ADMIN_ACCESS_REQUESTS_STORAGE_KEY, nextRequests);
}

function clearRequestByEmail(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const nextRequests = getAdminAccessRequests().filter((entry) => entry.email !== normalizedEmail);
    writeJsonArray(ADMIN_ACCESS_REQUESTS_STORAGE_KEY, nextRequests);
}

function readJsonArray(storageKey) {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Unable to read ${storageKey}.`, error);
        return [];
    }
}

function writeJsonArray(storageKey, value) {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to save ${storageKey}.`, error);
    }
}

function normalizeAdminEntry(entry, index) {
    const email = String(entry?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
        return null;
    }

    return {
        id: String(entry?.id || `admin-${index}`),
        name: String(entry?.name || email).trim(),
        email,
        source: entry?.source === 'request' ? 'request' : 'manual',
        createdAt: entry?.createdAt || new Date().toISOString()
    };
}

function normalizeAdminAccessRequest(entry, index) {
    const email = String(entry?.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
        return null;
    }

    return {
        id: String(entry?.id || `request-${index}`),
        name: String(entry?.name || email).trim(),
        email,
        reason: String(entry?.reason || 'No reason provided.').trim(),
        createdAt: entry?.createdAt || new Date().toISOString()
    };
}

function validateAdminEmail() {
    const value = document.getElementById('admin-login-email')?.value.trim() ?? '';

    if (!value) {
        setAdminFieldMessage('admin-login-email-message', 'Email address is required.', 'error');
        return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        setAdminFieldMessage('admin-login-email-message', 'Enter a valid email address with @.', 'error');
        return false;
    }

    setAdminFieldMessage('admin-login-email-message', '');
    return true;
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function validateAdminPassword() {
    const value = document.getElementById('admin-login-password')?.value ?? '';

    if (!value) {
        setAdminFieldMessage('admin-login-password-message', 'Password is required.', 'error');
        return false;
    }

    setAdminFieldMessage('admin-login-password-message', '');
    return true;
}

function setAdminFeedback(message, state) {
    const feedback = document.getElementById('admin-auth-feedback');
    if (!feedback) return;

    feedback.textContent = message;
    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

function setAdminFieldMessage(id, message, state = '') {
    const fieldMessage = document.getElementById(id);
    if (!fieldMessage) return;

    fieldMessage.textContent = message;
    if (state) {
        fieldMessage.dataset.state = state;
    } else {
        delete fieldMessage.dataset.state;
    }
}

function clearAdminFieldMessages() {
    setAdminFieldMessage('admin-login-email-message', '');
    setAdminFieldMessage('admin-login-password-message', '');
}

function setInlineFeedback(id, message, state = '') {
    const feedback = document.getElementById(id);
    if (!feedback) return;

    feedback.textContent = message;
    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

function formatMoney(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatTimestamp(date) {
    return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatLongDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatRole(role) {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin') return 'Admin';
    return 'User';
}

function formatAdminSource(source) {
    if (source === 'supabase') return 'Supabase Admin';
    if (source === 'local-access') return 'Locally Approved Admin';
    return 'Seeded Super Admin';
}

function formatCategory(category) {
    if (!category) return 'Uncategorized';
    return category.charAt(0).toUpperCase() + category.slice(1);
}

function getFirstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'Admin';
}

function getAdminAvatarUrl(user) {
    return user?.avatarUrl || DEFAULT_ADMIN_AVATAR_URL;
}

function trashIconMarkup() {
    return `
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Zm-1 12h12a2 2 0 0 0 2-2V8H4v12a2 2 0 0 0 2 2Z"></path>
        </svg>
    `;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function openStorefront() {
    window.location.href = '../';
}

function openStorefrontCollection(category = 'all') {
    const normalizedCategory = String(category || 'all').trim().toLowerCase();
    const params = new URLSearchParams();

    if (normalizedCategory && normalizedCategory !== 'all') {
        params.set('category', normalizedCategory);
    }

    const query = params.toString();
    window.location.href = `../${query ? `?${query}` : ''}#products`;
}
