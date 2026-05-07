import {
    hasSupabaseConfig,
    restoreSupabaseUser,
    signInWithSupabase,
    signOutFromSupabase
} from './supabase.js';
import { products } from './products.js';

const BUYER_NOTIFICATIONS_STORAGE_KEY = 'rm-clothing-buyer-notifications';
const ADMIN_LOCAL_SESSION_KEY = 'rm-clothing-admin-console-session';
const ADMIN_LOCAL_MODE_KEY = 'rm-clothing-admin-console-mode';
const ADMIN_SECTIONS = {
    dashboard: {
        kicker: 'Dashboard',
        title: 'Store Overview',
        subtitle: 'Track the live state of RM Clothing in one place.'
    },
    products: {
        kicker: 'Products',
        title: 'Catalog Management',
        subtitle: 'Review the current storefront products and category balance.'
    },
    orders: {
        kicker: 'Orders',
        title: 'Order Monitoring',
        subtitle: 'Check buyer checkouts captured by the storefront.'
    },
    analysis: {
        kicker: 'Analysis',
        title: 'Store Performance',
        subtitle: 'See product movement, category revenue, and order patterns.'
    },
    settings: {
        kicker: 'Settings',
        title: 'Admin Settings',
        subtitle: 'Review admin access details and console status.'
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
        if (restored?.currentUser?.role === 'admin') {
            adminUser = normalizeSupabaseAdmin(restored.currentUser);
            adminSession = restored.session;
            adminSource = 'supabase';
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

    document.getElementById('admin-signout-btn')?.addEventListener('click', () => {
        void logoutAdmin();
    });

    document.getElementById('admin-open-storefront')?.addEventListener('click', openStorefront);
    document.getElementById('admin-open-storefront-auth')?.addEventListener('click', openStorefront);

    document.querySelectorAll('.admin-nav-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const section = button.dataset.section || 'dashboard';
            switchAdminSection(section);
        });
    });

    window.addEventListener('storage', (event) => {
        if (event.key === BUYER_NOTIFICATIONS_STORAGE_KEY && adminUser) {
            renderAdminViews();
        }
    });
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

    if (hasSupabaseConfig()) {
        try {
            const authResult = await signInWithSupabase({ email, password, rememberMe });

            if (authResult.currentUser?.role === 'admin') {
                adminUser = normalizeSupabaseAdmin(authResult.currentUser);
                adminSession = authResult.session;
                adminSource = 'supabase';
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
    if (adminSource === 'supabase' && adminSession?.access_token) {
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
    renderAdminState();
}

function renderAdminState() {
    const authScreen = document.getElementById('admin-auth-screen');
    const consoleShell = document.getElementById('admin-console');

    if (!authScreen || !consoleShell) return;

    const isLoggedIn = Boolean(adminUser);
    authScreen.hidden = isLoggedIn;
    consoleShell.hidden = !isLoggedIn;

    if (!isLoggedIn) {
        return;
    }

    document.getElementById('admin-user-name').textContent = adminUser.name;
    document.getElementById('admin-user-email').textContent = adminUser.email;
    document.getElementById('admin-user-role').textContent = formatRole(adminUser.role);

    switchAdminSection(activeSection);
    renderAdminViews();
}

function renderAdminViews() {
    const orders = loadBuyerNotifications();
    renderDashboard(products, orders);
    renderProductsPanel(products);
    renderOrdersPanel(orders);
    renderAnalysisPanel(products, orders);
    renderSettingsPanel();
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

function renderDashboard(currentProducts, orders) {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const activeOrders = orders.filter((order) => canCancelOrder(order)).length;
    const categories = summarizeCatalogCategories(currentProducts);

    renderStatGrid('admin-dashboard-stats', [
        { label: 'Live Products', value: currentProducts.length.toString(), detail: 'Currently listed on the storefront' },
        { label: 'Total Orders', value: orders.length.toString(), detail: 'Stored buyer checkout notifications' },
        { label: 'Revenue', value: formatMoney(totalRevenue), detail: 'Combined total from recorded checkouts' },
        { label: 'Active Orders', value: activeOrders.toString(), detail: 'Still within the order cancellation window' }
    ]);

    renderOrderCards('admin-dashboard-orders', orders.slice(0, 4), 'No orders yet. Customer checkouts will appear here.');

    const categoriesContainer = document.getElementById('admin-dashboard-categories');
    if (!categoriesContainer) return;

    if (categories.length === 0) {
        categoriesContainer.innerHTML = '<p class="admin-empty-state">No product categories available.</p>';
        return;
    }

    categoriesContainer.innerHTML = categories.map((item) => `
        <div class="admin-inline-row">
            <span>${formatCategory(item.category)}</span>
            <strong>${item.count} product${item.count === 1 ? '' : 's'}</strong>
        </div>
    `).join('');
}

function renderProductsPanel(currentProducts) {
    const container = document.getElementById('admin-products-grid');
    if (!container) return;

    container.innerHTML = currentProducts.map((product) => {
        const imageCount = Array.isArray(product.images) && product.images.length > 0 ? product.images.length : 1;
        const primaryImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : product.image;

        return `
            <article class="admin-product-card">
                <img src="${primaryImage}" alt="${product.name}">
                <div class="admin-product-body">
                    <div class="admin-product-meta">
                        <span class="admin-tag">${formatCategory(product.category)}</span>
                        <span class="admin-tag admin-tag-light">${imageCount} image${imageCount === 1 ? '' : 's'}</span>
                    </div>
                    <h3>${product.name}</h3>
                    <p>${product.description}</p>
                    <div class="admin-inline-row">
                        <strong>${formatMoney(product.price)}</strong>
                        <span>Product ID ${product.id}</span>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function renderOrdersPanel(orders) {
    renderOrderCards('admin-orders-list', orders, 'No orders yet. Once buyers checkout, their notifications will appear here.');
}

function renderAnalysisPanel(currentProducts, orders) {
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const averageOrderValue = orders.length ? totalRevenue / orders.length : 0;
    const bestSeller = getBestSeller(orders);
    const totalUnits = orders.reduce((sum, order) => sum + Number(order.totalItems || 0), 0);

    renderStatGrid('admin-analysis-stats', [
        { label: 'Best Seller', value: bestSeller?.name || 'No sales yet', detail: bestSeller ? `${bestSeller.quantity} units sold` : 'Waiting for first checkout' },
        { label: 'Units Sold', value: totalUnits.toString(), detail: 'Total quantity across all recorded orders' },
        { label: 'Average Order', value: formatMoney(averageOrderValue), detail: 'Revenue divided by total orders' },
        { label: 'Catalog Spread', value: `${new Set(currentProducts.map((product) => product.category)).size}`, detail: 'Distinct product categories live now' }
    ]);

    const bestSellerContainer = document.getElementById('admin-best-sellers');
    if (bestSellerContainer) {
        const leaderboard = getBestSellers(orders);
        bestSellerContainer.innerHTML = leaderboard.length
            ? leaderboard.map((item, index) => `
                <div class="admin-inline-row">
                    <span>${index + 1}. ${item.name}</span>
                    <strong>${item.quantity} sold</strong>
                </div>
            `).join('')
            : '<p class="admin-empty-state">No sales data yet.</p>';
    }

    const categoryContainer = document.getElementById('admin-category-analysis');
    if (categoryContainer) {
        const rows = getCategoryRevenueBreakdown(currentProducts, orders);
        categoryContainer.innerHTML = rows.length
            ? rows.map((row) => `
                <div class="admin-inline-row">
                    <span>${formatCategory(row.category)}</span>
                    <strong>${formatMoney(row.revenue)}</strong>
                </div>
            `).join('')
            : '<p class="admin-empty-state">No category revenue to analyze yet.</p>';
    }
}

function renderSettingsPanel() {
    const details = document.getElementById('admin-settings-details');
    const notes = document.getElementById('admin-settings-notes');

    if (details) {
        details.innerHTML = [
            ['Admin Name', adminUser?.name || '-'],
            ['Email', adminUser?.email || '-'],
            ['Access Role', formatRole(adminUser?.role || 'admin')],
            ['Session Source', adminSource === 'supabase' ? 'Supabase Admin' : 'Seeded Super Admin'],
            ['Storefront Route', '/']
        ].map(([label, value]) => `
            <div class="admin-detail-row">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `).join('');
    }

    if (notes) {
        notes.innerHTML = [
            `Admin login route: /admin/`,
            `Supabase config: ${hasSupabaseConfig() ? 'Connected' : 'Not configured'}`,
            `Seeded super admin email: ${SEEDED_SUPER_ADMIN.email}`,
            'Dashboard and analysis use saved storefront checkout notifications.'
        ].map((note) => `<p class="admin-note">${note}</p>`).join('');
    }
}

function renderStatGrid(containerId, stats) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = stats.map((stat) => `
        <article class="admin-stat-card">
            <span class="admin-stat-label">${stat.label}</span>
            <strong class="admin-stat-value">${stat.value}</strong>
            <p class="admin-stat-detail">${stat.detail}</p>
        </article>
    `).join('');
}

function renderOrderCards(containerId, orders, emptyMessage) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!orders.length) {
        container.innerHTML = `<p class="admin-empty-state">${emptyMessage}</p>`;
        return;
    }

    container.innerHTML = orders.map((order) => {
        const itemsMarkup = (order.items || []).map((item) => `
            <div class="admin-inline-row admin-inline-row-muted">
                <span>${item.name} - ${item.size}</span>
                <span>Qty ${item.quantity}</span>
            </div>
        `).join('');

        return `
            <article class="admin-order-card">
                <div class="admin-order-head">
                    <div>
                        <h4>Order ${order.id.slice(0, 8)}</h4>
                        <span>${formatTimestamp(order.createdAt)}</span>
                    </div>
                    <span class="admin-order-status ${canCancelOrder(order) ? 'is-active' : 'is-locked'}">
                        ${canCancelOrder(order) ? 'Active' : 'Locked'}
                    </span>
                </div>
                <div class="admin-order-items">${itemsMarkup}</div>
                <div class="admin-inline-row">
                    <strong>${order.totalItems} item${order.totalItems === 1 ? '' : 's'}</strong>
                    <strong>${formatMoney(Number(order.totalAmount || 0))}</strong>
                </div>
            </article>
        `;
    }).join('');
}

function loadBuyerNotifications() {
    try {
        const raw = window.localStorage.getItem(BUYER_NOTIFICATIONS_STORAGE_KEY);
        const notifications = JSON.parse(raw || '[]');

        if (!Array.isArray(notifications)) {
            return [];
        }

        return notifications
            .map((notification) => ({
                ...notification,
                createdAt: notification.createdAt ? new Date(notification.createdAt) : new Date()
            }))
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    } catch (error) {
        console.warn('Unable to load storefront notifications for admin.', error);
        return [];
    }
}

function getBestSeller(orders) {
    return getBestSellers(orders)[0] || null;
}

function getBestSellers(orders) {
    const totals = new Map();

    orders.forEach((order) => {
        (order.items || []).forEach((item) => {
            const current = totals.get(item.name) || { name: item.name, quantity: 0 };
            current.quantity += Number(item.quantity || 0);
            totals.set(item.name, current);
        });
    });

    return [...totals.values()].sort((left, right) => right.quantity - left.quantity).slice(0, 5);
}

function getCategoryRevenueBreakdown(currentProducts, orders) {
    const categoryByProductName = new Map(currentProducts.map((product) => [product.name, product.category]));
    const totals = new Map();

    orders.forEach((order) => {
        (order.items || []).forEach((item) => {
            const category = categoryByProductName.get(item.name) || 'uncategorized';
            const revenue = Number(item.price || 0) * Number(item.quantity || 0);
            totals.set(category, (totals.get(category) || 0) + revenue);
        });
    });

    return [...totals.entries()]
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((left, right) => right.revenue - left.revenue);
}

function summarizeCatalogCategories(currentProducts) {
    const counts = new Map();

    currentProducts.forEach((product) => {
        counts.set(product.category, (counts.get(product.category) || 0) + 1);
    });

    return [...counts.entries()].map(([category, count]) => ({ category, count }));
}

function canCancelOrder(order) {
    const createdAtTime = new Date(order.createdAt).getTime();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return (Date.now() - createdAtTime) < twoDaysInMs;
}

function normalizeSupabaseAdmin(currentUser) {
    return {
        ...currentUser,
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
        adminSource = 'seeded';
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

function formatMoney(value) {
    return `\u20b1${Number(value || 0).toFixed(2)}`;
}

function formatTimestamp(date) {
    return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    }).toUpperCase();
}

function formatRole(role) {
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin') return 'Admin';
    return 'User';
}

function formatCategory(category) {
    if (!category) return 'Uncategorized';
    return category.charAt(0).toUpperCase() + category.slice(1);
}

function getFirstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'Admin';
}

function openStorefront() {
    window.location.href = '../';
}
