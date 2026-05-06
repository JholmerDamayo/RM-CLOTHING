/**
 * Core Application Script for Elysian Luxe
 */

let cart = [];

document.addEventListener('DOMContentLoaded', () => {
    // Initial content render
    if (window.renderProducts) window.renderProducts();

    initCartUI();
    initFilters();
    initContactForm();
    initFeedbackSystem();
});

// FEEDBACK SYSTEM
function initFeedbackSystem() {
    const stars = document.querySelectorAll('.star');
    const form = document.getElementById('feedback-form');
    const display = document.getElementById('recent-feedback');
    let selectedRating = 0;

    // Star interaction
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

    // Initial feedback display
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

    // Form submission
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const comment = document.getElementById('feedback-comment').value;

        if (selectedRating === 0) {
            alert('Please select a rating.');
            return;
        }

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();

        const newFeedback = {
            rating: selectedRating,
            text: comment,
            date: dateStr
        };

        // Render immediately
        renderFeedbackItem(newFeedback);

        // Success state
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

// CART LOGIC
function initCartUI() {
    const cartBtn = document.getElementById('cart-btn');
    const closeCart = document.getElementById('close-cart');
    const sidebar = document.getElementById('cart-sidebar');

    cartBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
    });

    closeCart.addEventListener('click', () => {
        sidebar.classList.remove('open');
    });
}

window.addToCart = function(productId, quantity = 1) {
    const product = window.products.find((p) => p.id === productId);
    if (!product) return;

    // Ensure quantity is at least 1
    const validatedQty = Math.max(1, quantity);

    // Check if item already in cart
    const existing = cart.find((item) => item.id === productId);
    if (existing) {
        existing.quantity += validatedQty;
    } else {
        cart.push({ ...product, quantity: validatedQty });
    }

    updateCartUI();

    // Visual feedback
    const sidebar = document.getElementById('cart-sidebar');
    sidebar.classList.add('open');
};

function updateCartUI() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.querySelector('.cart-count');
    const cartTotal = document.getElementById('cart-total');

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
                <p style="font-size: 0.8rem; opacity: 0.6;">$${item.price.toFixed(2)}</p>
                <div style="display: flex; align-items: center; gap: 1rem; margin-top: 5px;">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)">-</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
                </div>
                <button onclick="requestRemove(this, ${item.id})" style="background: transparent; border: none; font-size: 0.65rem; color: #ff4444; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; padding: 5px 0; margin-top: 5px;">Remove</button>
            </div>
            <button onclick="requestRemove(this, ${item.id})" style="background: transparent; border: none; font-size: 1.2rem; cursor: pointer; opacity: 0.3;">&times;</button>
        `;
        cartItemsContainer.appendChild(itemEl);
    });

    cartCount.textContent = itemCount.toString();
    cartTotal.textContent = `$${total.toFixed(2)}`;
}

window.changeQty = function(id, delta) {
    const item = cart.find((i) => i.id === id);
    if (!item) return;

    // Prevent quantity from going below 1
    const newQty = item.quantity + delta;
    if (newQty >= 1) {
        item.quantity = newQty;
    }
    updateCartUI();
};

window.requestRemove = function(btn, id) {
    const itemEl = btn.closest('.cart-item');
    itemEl.classList.add('removing');
    setTimeout(() => {
        removeFromCart(id);
    }, 400);
};

window.removeFromCart = function(id) {
    cart = cart.filter((i) => i.id !== id);
    updateCartUI();
};

function removeFromCart(id) {
    window.removeFromCart(id);
}

// FILTERS
function initFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            // UI
            filterBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');

            // Logic
            const filter = btn.dataset.filter;
            window.renderProducts(filter);

            // Re-init scroll reveals for new items
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

        // Simulate API call
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

// Smoothing jumpy scroll on some browsers
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
