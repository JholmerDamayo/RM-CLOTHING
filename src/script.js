/**
 * Core Application Script for Elysian Luxe
 */

let cart = [];
let buyerNotifications = [];
let activeProductSelection = null;

document.addEventListener('DOMContentLoaded', () => {
    if (window.renderProducts) window.renderProducts();

    initCartUI();
    initOrdersUI();
    initProductModal();
    initContactForm();
    initFeedbackSystem();
    initSmoothScroll();
    updateCartUI();
    updateBuyerUI();
});

// FEEDBACK SYSTEM
function initFeedbackSystem() {
    const stars = document.querySelectorAll('.star');
    const form = document.getElementById('feedback-form');
    const display = document.getElementById('recent-feedback');
    let selectedRating = 0;

    if (!form || !display) return;

    stars.forEach((star) => {
        star.addEventListener('mouseover', () => {
            const val = parseInt(star.dataset.value);
            stars.forEach((s) => {
                if (parseInt(s.dataset.value) <= val) s.classList.add('hover');
            });
        });

        star.addEventListener('mouseout', () => {
            stars.forEach((s) => s.classList.remove('hover'));
        });

        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.value);
            stars.forEach((s) => {
                if (parseInt(s.dataset.value) <= selectedRating) {
                    s.classList.add('selected');
                } else {
                    s.classList.remove('selected');
                }
            });
        });
    });

    const sampleFeedback = [
        { rating: 5, text: "Absolutely stunning pieces. The quality surpasses expectations.", date: "MAY 04, 2026" },
        { rating: 4, text: "Love the minimalistic approach. Shipping was exceptionally fast.", date: "MAY 02, 2026" }
    ];

    function renderFeedbackItem(data) {
        const item = document.createElement('div');
        item.className = 'feedback-item';
        item.innerHTML = `
            <div class="item-rating">${'★'.repeat(data.rating)}${'☆'.repeat(5 - data.rating)}</div>
            <p class="item-text">"${data.text}"</p>
            <div class="item-date">${data.date}</div>
        `;
        display.prepend(item);
    }

    sampleFeedback.forEach(renderFeedbackItem);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const comment = document.getElementById('feedback-comment').value;

        if (selectedRating === 0) {
            alert('Please select a rating.');
            return;
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            month: 'short',
            day: '2-digit',
            year: 'numeric'
        }).toUpperCase();

        renderFeedbackItem({
            rating: selectedRating,
            text: comment,
            date: dateStr
        });

        const btn = document.getElementById('send-feedback');
        btn.textContent = 'Feedback Received';
        btn.disabled = true;
        form.reset();
        selectedRating = 0;
        stars.forEach((s) => s.classList.remove('selected'));

        setTimeout(() => {
            btn.textContent = 'Send Feedback';
            btn.disabled = false;
        }, 3000);
    });
}

// CART UI
function initCartUI() {
    const cartBtn = document.getElementById('cart-btn');
    const closeCart = document.getElementById('close-cart');
    const sidebar = document.getElementById('cart-sidebar');
    const checkoutBtn = document.getElementById('cart-checkout-btn');

    if (!cartBtn || !closeCart || !sidebar || !checkoutBtn) return;

    cartBtn.addEventListener('click', () => {
        closeOrdersSidebar();
        sidebar.classList.add('open');
    });

    closeCart.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });

    checkoutBtn.addEventListener('click', () => {
        handleCartCheckout();
    });
}

function openCartSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) sidebar.classList.add('open');
}

function closeCartSidebar() {
    const sidebar = document.getElementById('cart-sidebar');
    if (sidebar) sidebar.classList.remove('open');
}

// BUYER NOTIFICATIONS UI
function initOrdersUI() {
    const shopBtn = document.getElementById('shop-btn');
    const closeOrders = document.getElementById('close-orders');
    const ordersSidebar = document.getElementById('orders-sidebar');

    if (!shopBtn || !closeOrders || !ordersSidebar) return;

    shopBtn.addEventListener('click', () => {
        closeCartSidebar();
        ordersSidebar.classList.add('open');
    });

    closeOrders.addEventListener('click', () => {
        ordersSidebar.classList.remove('open');
    });
}

function openOrdersSidebar() {
    const ordersSidebar = document.getElementById('orders-sidebar');
    if (ordersSidebar) ordersSidebar.classList.add('open');
}

function closeOrdersSidebar() {
    const ordersSidebar = document.getElementById('orders-sidebar');
    if (ordersSidebar) ordersSidebar.classList.remove('open');
}

// PRODUCT MODAL
function initProductModal() {
    const closeBtn = document.getElementById('product-modal-close');
    const backdrop = document.getElementById('product-modal-backdrop');
    const addCartBtn = document.getElementById('modal-add-cart-btn');
    const checkoutBtn = document.getElementById('modal-checkout-btn');
    const sizeButtons = document.querySelectorAll('.size-option');

    if (!closeBtn || !backdrop || !addCartBtn || !checkoutBtn) return;

    closeBtn.addEventListener('click', closeProductModal);
    backdrop.addEventListener('click', closeProductModal);

    addCartBtn.addEventListener('click', () => {
        if (!activeProductSelection) return;
        const { productId, quantity, size } = activeProductSelection;
        window.addToCart(productId, quantity, size);
        closeProductModal();
    });

    checkoutBtn.addEventListener('click', () => {
        if (!activeProductSelection) return;
        const item = buildLineItem(
            activeProductSelection.productId,
            activeProductSelection.quantity,
            activeProductSelection.size
        );

        if (!item) return;

        createBuyerNotification([item]);
        closeProductModal();
        closeCartSidebar();
        openOrdersSidebar();
    });

    sizeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!activeProductSelection) return;
            activeProductSelection.size = button.dataset.size;
            renderSizeSelection();
        });
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeProductModal();
            closeCartSidebar();
            closeOrdersSidebar();
        }
    });
}

window.openProductModal = function(productId, quantity = 1) {
    const product = findProduct(productId);
    const modal = document.getElementById('product-modal');

    if (!product || !modal) return;

    activeProductSelection = {
        productId,
        quantity: Math.max(1, quantity),
        size: 'S'
    };

    const image = document.getElementById('product-modal-image');
    const title = document.getElementById('product-modal-title');
    const description = document.getElementById('product-modal-description');
    const price = document.getElementById('product-modal-price');
    const quantityLabel = document.getElementById('product-modal-quantity');

    image.src = product.image;
    image.alt = product.name;
    title.textContent = product.name;
    description.textContent = product.description;
    price.textContent = formatMoney(product.price);
    quantityLabel.textContent = `Quantity ${activeProductSelection.quantity}`;

    renderSizeSelection();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
};

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    activeProductSelection = null;
}

function renderSizeSelection() {
    document.querySelectorAll('.size-option').forEach((button) => {
        button.classList.toggle('selected', button.dataset.size === activeProductSelection?.size);
    });
}

// CART DATA
window.addToCart = function(productId, quantity = 1, size = 'S') {
    const item = buildLineItem(productId, quantity, size);
    if (!item) return;

    const existing = cart.find((cartItem) => cartItem.cartKey === item.cartKey);
    if (existing) {
        existing.quantity += item.quantity;
    } else {
        cart.push(item);
    }

    updateCartUI();
    closeOrdersSidebar();
    openCartSidebar();
};

function buildLineItem(productId, quantity, size) {
    const product = findProduct(productId);
    if (!product) return null;

    return {
        id: product.id,
        cartKey: `${product.id}-${size}`,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: Math.max(1, quantity),
        size
    };
}

function findProduct(productId) {
    return (window.products || []).find((product) => product.id === productId);
}

function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.querySelector('.cart-count');
    const cartTotal = document.getElementById('cart-total');

    if (!cartItemsContainer || !cartCount || !cartTotal) return;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-msg">Your cart is empty.</p>';
        cartCount.textContent = '0';
        cartTotal.textContent = '$0.00';
        return;
    }

    let total = 0;
    let itemCount = 0;

    cartItemsContainer.innerHTML = '';
    cart.forEach((item) => {
        total += item.price * item.quantity;
        itemCount += item.quantity;

        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.style.display = 'flex';
        itemEl.style.gap = '1rem';
        itemEl.style.marginBottom = '1.5rem';
        itemEl.style.alignItems = 'center';

        itemEl.innerHTML = `
            <img src="${item.image}" alt="${item.name}" style="width: 70px; height: 90px; object-fit: cover;">
            <div style="flex-grow: 1;">
                <h4 style="font-size: 0.9rem; font-family: 'Playfair Display';">${item.name}</h4>
                <p style="font-size: 0.75rem; opacity: 0.6;">${formatMoney(item.price)} · Size ${item.size}</p>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 5px;">
                    <button class="qty-btn" onclick="changeQty('${item.cartKey}', -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" onclick="changeQty('${item.cartKey}', 1)">+</button>
                </div>
                <button onclick="requestRemove(this, '${item.cartKey}')" style="background: transparent; border: none; font-size: 0.65rem; color: #ff4444; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; padding: 5px 0; margin-top: 5px;">Remove</button>
            </div>
            <button onclick="requestRemove(this, '${item.cartKey}')" style="background: transparent; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.3;">&times;</button>
        `;
        cartItemsContainer.appendChild(itemEl);
    });

    cartCount.textContent = itemCount.toString();
    cartTotal.textContent = formatMoney(total);
}

window.changeQty = function(cartKey, delta) {
    const item = cart.find((cartItem) => cartItem.cartKey === cartKey);
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty >= 1) {
        item.quantity = newQty;
        updateCartUI();
    }
};

window.requestRemove = function(btn, cartKey) {
    const itemEl = btn.closest('.cart-item');
    if (!itemEl) {
        removeFromCart(cartKey);
        return;
    }

    itemEl.classList.add('removing');
    setTimeout(() => {
        removeFromCart(cartKey);
    }, 400);
};

function removeFromCart(cartKey) {
    cart = cart.filter((item) => item.cartKey !== cartKey);
    updateCartUI();
}

function handleCartCheckout() {
    if (cart.length === 0) {
        alert('Your cart is empty.');
        return;
    }

    const checkoutItems = cart.map((item) => ({ ...item }));
    createBuyerNotification(checkoutItems);
    cart = [];
    updateCartUI();
    closeCartSidebar();
    openOrdersSidebar();
}

// BUYER NOTIFICATIONS DATA
function createBuyerNotification(items) {
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    buyerNotifications.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        items,
        totalItems,
        totalAmount,
        createdAt: new Date()
    });

    updateBuyerUI();
}

function updateBuyerUI() {
    const shopCount = document.querySelector('.shop-count');
    const list = document.getElementById('buyer-notifications');

    if (!shopCount || !list) return;

    shopCount.textContent = buyerNotifications.length.toString();

    if (buyerNotifications.length === 0) {
        list.innerHTML = '<p class="empty-msg">No buyer notifications yet.</p>';
        return;
    }

    list.innerHTML = '';

    buyerNotifications.forEach((notification) => {
        const card = document.createElement('article');
        card.className = 'notification-card';

        const itemsMarkup = notification.items.map((item) => `
            <div class="notification-item">
                <span>${item.name} · ${item.size}</span>
                <span>Qty ${item.quantity}</span>
            </div>
        `).join('');

        card.innerHTML = `
            <h4>Buyer Checkout Received</h4>
            <span class="notification-time">${formatTimestamp(notification.createdAt)}</span>
            <div class="notification-list">${itemsMarkup}</div>
            <div class="notification-summary">
                <span>${notification.totalItems} item${notification.totalItems > 1 ? 's' : ''}</span>
                <span>${formatMoney(notification.totalAmount)}</span>
            </div>
        `;

        list.appendChild(card);
    });
}

// FILTERS
function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterBtns.forEach((button) => button.classList.remove('active'));
            btn.classList.add('active');

            if (window.renderProducts) {
                window.renderProducts(btn.dataset.filter);
            }

            if (window.initScrollRevel) window.initScrollRevel();
        });
    });
}

// FORM HANDLING
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const btn = form.querySelector('.submit-btn');
        const originalText = btn.textContent;

        btn.textContent = 'TRANSMITTING...';
        btn.disabled = true;

        setTimeout(() => {
            btn.textContent = 'RECEIVED WITH THANKS';
            btn.style.background = '#d4af37';
            btn.style.color = '#000';
            form.reset();

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.style.color = '';
                btn.disabled = false;
            }, 3000);
        }, 1500);
    });
}

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
}

function formatMoney(value) {
    return `$${value.toFixed(2)}`;
}

function formatTimestamp(date) {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    }).toUpperCase();
}
