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
        subtitle: 'Review session details, route information, and environment status.'
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
            switchAdminSection(button.dataset.section || 'dashboard');
        });
    });

    document.getElementById('admin-console')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-action]');
        if (!button) return;

        const { adminAction, orderId = '' } = button.dataset;

        if (adminAction === 'view-order') {
            selectedOrderId = orderId;
            renderAdminViews();
            return;
        }

        if (adminAction === 'delete-order') {
            deleteOrder(orderId);
        }
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

    if (!isLoggedIn) {
        return;
    }

    document.getElementById('admin-user-name').textContent = adminUser.name;
    document.getElementById('admin-user-email').textContent = adminUser.email;
    document.getElementById('admin-user-role').textContent = formatRole(adminUser.role);
    document.getElementById('admin-user-avatar').textContent = getAvatarLetters(adminUser.name);
    document.getElementById('admin-hero-date').textContent = formatLongDate(new Date());

    switchAdminSection(activeSection);
    renderAdminViews();
}

function renderAdminViews() {
    const orders = loadBuyerNotifications();
    ensureSelectedOrder(orders);
    updateHeroSummary(orders);
    renderDashboard(products, orders);
    renderItemsPanel(products, orders);
    renderOrdersPanel(orders);
    renderAnalysisPanel(products, orders);
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
    const chip = document.getElementById('admin-hero-chip');
    if (!chip) return;

    const customerCount = getUniqueCustomersCount(orders);
    chip.textContent = `${orders.length} orders | ${customerCount} customers`;
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
        const sold = getSoldQuantityForProduct(product.name, orders);
        const revenue = getRevenueForProduct(product.name, orders);
        const images = Array.isArray(product.images) ? product.images.length : 1;
        const primaryImage = Array.isArray(product.images) && product.images.length ? product.images[0] : product.image;

        return `
            <article class="admin-item-card">
                <div class="admin-item-media">
                    <img src="${primaryImage}" alt="${escapeHtml(product.name)}">
                </div>
                <div class="admin-item-body">
                    <div class="admin-item-topline">
                        <span class="admin-pill">${escapeHtml(formatCategory(product.category))}</span>
                        <span class="admin-muted-text">${images} image${images === 1 ? '' : 's'}</span>
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

    if (details) {
        details.innerHTML = [
            ['Admin Name', adminUser?.name || '-'],
            ['Email', adminUser?.email || '-'],
            ['Access Role', formatRole(adminUser?.role || 'admin')],
            ['Session Source', adminSource === 'supabase' ? 'Supabase Admin' : 'Seeded Super Admin'],
            ['Orders Stored', orders.length.toString()],
            ['Storefront Route', '/']
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
            'Dashboard data comes from saved storefront checkout notifications.',
            'Phone values stay "Not provided" until the storefront starts collecting them.'
        ].map((note) => `<p class="admin-note">${escapeHtml(note)}</p>`).join('');
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
    const categoryByProductName = new Map(currentProducts.map((product) => [product.name, product.category]));
    const totals = new Map();

    orders.forEach((order) => {
        order.items.forEach((item) => {
            const category = categoryByProductName.get(item.name) || 'uncategorized';
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

function getSoldQuantityForProduct(productName, orders) {
    return orders.reduce((sum, order) => (
        sum + order.items
            .filter((item) => item.name === productName)
            .reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0)
    ), 0);
}

function getRevenueForProduct(productName, orders) {
    return orders.reduce((sum, order) => (
        sum + order.items
            .filter((item) => item.name === productName)
            .reduce((itemSum, item) => itemSum + (Number(item.price || 0) * Number(item.quantity || 0)), 0)
    ), 0);
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

function formatCategory(category) {
    if (!category) return 'Uncategorized';
    return category.charAt(0).toUpperCase() + category.slice(1);
}

function getFirstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'Admin';
}

function getAvatarLetters(name) {
    const parts = String(name || 'Admin').trim().split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('') || 'AD';
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
