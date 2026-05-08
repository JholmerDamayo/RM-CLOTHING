import {
    hasSupabaseConfig,
    restoreSupabaseUser,
    signInWithSupabase,
    signOutFromSupabase,
    signUpWithSupabase,
    verifySignupCodeWithSupabase
} from './supabase.js';

/**
 * Core Application Script for Elysian Luxe
 */

const AUTH_VIEW_COPY = {
    login: {
        heading: 'Login to Continue',
        message: 'Sign in to use cart, checkout, feedback, and inquiries.',
        showSwitch: true
    },
    register: {
        heading: 'Create Your Account',
        message: 'Create your customer account to unlock cart, checkout, feedback, and inquiries.',
        showSwitch: true
    },
    verify: {
        heading: 'Verify Your Email Code',
        message: 'Paste the 6-digit code we sent to your email to finish creating your account.',
        showSwitch: false
    }
};

const BUYER_NOTIFICATIONS_STORAGE_KEY = 'rm-clothing-buyer-notifications';

let cart = [];
let buyerNotifications = [];
let activeProductSelection = null;
let currentUser = null;
let currentSession = null;
let pendingAuthAction = null;
let pendingVerificationEmail = '';

document.addEventListener('DOMContentLoaded', () => {
    void initApp();
});

async function initApp() {
    buyerNotifications = loadBuyerNotifications();
    initAuthUI();

    if (window.renderProducts) window.renderProducts();

    initCartUI();
    initOrdersUI();
    initProductModal();
    initFilters();
    initContactForm();
    initFeedbackSystem();
    initSmoothScroll();
    updateCartUI();
    updateBuyerUI();
    renderAuthUI();

    if (!hasSupabaseConfig()) {
        console.warn('Supabase configuration is missing.');
        return;
    }

    try {
        const restored = await restoreSupabaseUser();
        if (restored) {
            currentSession = restored.session;
            currentUser = restored.currentUser;
            renderAuthUI();
        }
    } catch (error) {
        console.warn('Unable to restore the Supabase session.', error);
    }
}

function loadBuyerNotifications() {
    try {
        const raw = window.localStorage.getItem(BUYER_NOTIFICATIONS_STORAGE_KEY);
        const notifications = JSON.parse(raw || '[]');

        if (!Array.isArray(notifications)) {
            return [];
        }

        return notifications.map((notification) => ({
            ...notification,
            createdAt: notification.createdAt ? new Date(notification.createdAt) : new Date()
        }));
    } catch (error) {
        console.warn('Unable to load buyer notifications.', error);
        return [];
    }
}

function persistBuyerNotifications() {
    try {
        window.localStorage.setItem(BUYER_NOTIFICATIONS_STORAGE_KEY, JSON.stringify(buyerNotifications));
    } catch (error) {
        console.warn('Unable to save buyer notifications.', error);
    }
}

// AUTH SYSTEM
function initAuthUI() {
    const authBtn = document.getElementById('auth-btn');
    const closeBtn = document.getElementById('auth-modal-close');
    const backdrop = document.getElementById('auth-modal-backdrop');
    const backToLoginBtn = document.getElementById('auth-back-login');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const verifyForm = document.getElementById('auth-verify-form');

    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (isAuthenticated()) {
                void logoutUser();
                return;
            }

            pendingAuthAction = null;
            openAuthModal(null, 'login');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => closeAuthModal());
    }

    if (backdrop) {
        backdrop.addEventListener('click', () => closeAuthModal());
    }

    if (backToLoginBtn) {
        backToLoginBtn.addEventListener('click', () => {
            switchAuthView('login');
            setAuthFeedback('', '');
        });
    }

    initAuthValidation();

    document.querySelectorAll('.auth-switch-btn').forEach((button) => {
        button.addEventListener('click', () => {
            switchAuthView(button.dataset.authView || 'login');
        });
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!hasSupabaseConfig()) {
                setAuthFeedback('Supabase is not configured yet.', 'error');
                return;
            }

            const email = document.getElementById('auth-login-email')?.value.trim().toLowerCase();
            const password = document.getElementById('auth-login-password')?.value ?? '';
            const rememberMe = Boolean(document.getElementById('auth-login-remember')?.checked);

            const isEmailValid = validateLoginEmail();
            const isPasswordValid = validateLoginPassword();

            if (!isEmailValid || !isPasswordValid) {
                setAuthFeedback('Fix the login fields before continuing.', 'error');
                return;
            }

            setAuthFeedback('Signing you in...', '');

            try {
                const authResult = await signInWithSupabase({ email, password, rememberMe });
                currentSession = authResult.session;
                currentUser = authResult.currentUser;
                renderAuthUI();
                setAuthFeedback(`Welcome back, ${getFirstName(currentUser.name)}.`, 'success');
                finishAuthSuccess();
            } catch (error) {
                setAuthFeedback(error.message || 'Unable to sign in right now.', 'error');
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!hasSupabaseConfig()) {
                setAuthFeedback('Supabase is not configured yet.', 'error');
                return;
            }

            const name = document.getElementById('auth-register-name')?.value.trim() ?? '';
            const email = document.getElementById('auth-register-email')?.value.trim().toLowerCase() ?? '';
            const password = document.getElementById('auth-register-password')?.value ?? '';
            const confirmPassword = document.getElementById('auth-register-confirm')?.value ?? '';

            const isNameValid = validateRegisterName();
            const isEmailValid = validateRegisterEmail();
            const isPasswordValid = validateRegisterPassword();
            const isConfirmValid = validateRegisterConfirm();

            if (!isNameValid || !isEmailValid || !isPasswordValid || !isConfirmValid) {
                setAuthFeedback('Fix the create-account fields before continuing.', 'error');
                return;
            }

            setAuthFeedback('Creating your account...', '');

            try {
                const authResult = await signUpWithSupabase({ email, password, name });

                if (authResult.needsEmailConfirmation) {
                    pendingVerificationEmail = authResult.verificationEmail || email;
                    populateVerificationEmail();
                    switchAuthView('verify');
                    setAuthFeedback(
                        `We sent a 6-digit verification code to ${pendingVerificationEmail}. Paste it below to continue.`,
                        'success'
                    );
                    return;
                }

                currentSession = authResult.session;
                currentUser = authResult.currentUser;
                renderAuthUI();
                setAuthFeedback(`Account created. Welcome, ${getFirstName(currentUser.name)}.`, 'success');
                finishAuthSuccess();
            } catch (error) {
                setAuthFeedback(error.message || 'Unable to create the account right now.', 'error');
            }
        });
    }

    if (verifyForm) {
        verifyForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            if (!hasSupabaseConfig()) {
                setAuthFeedback('Supabase is not configured yet.', 'error');
                return;
            }

            const email = document.getElementById('auth-verify-email')?.value.trim().toLowerCase() || pendingVerificationEmail;
            const token = document.getElementById('auth-verify-code')?.value.trim() ?? '';

            if (!validateVerificationCode()) {
                setAuthFeedback('Enter the 6-digit email verification code.', 'error');
                return;
            }

            setAuthFeedback('Verifying your code...', '');

            try {
                const authResult = await verifySignupCodeWithSupabase({ email, token, rememberMe: true });
                currentSession = authResult.session;
                currentUser = authResult.currentUser;
                renderAuthUI();
                setAuthFeedback(`Email verified. Welcome, ${getFirstName(currentUser.name)}.`, 'success');
                finishAuthSuccess();
            } catch (error) {
                setAuthFeedback(error.message || 'The verification code is invalid or expired.', 'error');
            }
        });
    }
}

function isAuthenticated() {
    return Boolean(currentUser?.email && currentSession?.access_token);
}

function requireAuth(action, message) {
    if (isAuthenticated()) return true;

    pendingAuthAction = typeof action === 'function' ? action : null;
    openAuthModal(message, 'login');
    return false;
}

window.requireAuth = requireAuth;

function openAuthModal(message, view = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    switchAuthView(view, message || null);
    setAuthFeedback('', '');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
}

function closeAuthModal(options = {}) {
    const { keepPendingAction = false } = options;
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    syncBodyModalLock();

    if (!keepPendingAction) {
        pendingAuthAction = null;
    }
}

function switchAuthView(view, customMessage = null) {
    const normalizedView = AUTH_VIEW_COPY[view] ? view : 'login';
    const copy = AUTH_VIEW_COPY[normalizedView];
    const heading = document.getElementById('auth-modal-heading');
    const message = document.getElementById('auth-modal-message');
    const authSwitch = document.getElementById('auth-switch');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const verifyForm = document.getElementById('auth-verify-form');

    document.querySelectorAll('.auth-switch-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.authView === normalizedView);
    });

    if (authSwitch) {
        authSwitch.classList.toggle('is-hidden', !copy.showSwitch);
    }

    if (loginForm) loginForm.classList.toggle('active', normalizedView === 'login');
    if (registerForm) registerForm.classList.toggle('active', normalizedView === 'register');
    if (verifyForm) verifyForm.classList.toggle('active', normalizedView === 'verify');

    if (normalizedView === 'verify') {
        populateVerificationEmail();
    }

    if (heading) {
        heading.textContent = copy.heading;
    }

    if (message) {
        message.textContent = customMessage || copy.message;
    }

    clearAuthFieldMessages();
    setAuthFeedback('', '');
}

function populateVerificationEmail() {
    const emailInput = document.getElementById('auth-verify-email');
    if (emailInput) {
        emailInput.value = pendingVerificationEmail;
    }
}

function setAuthFeedback(message, state) {
    const feedback = document.getElementById('auth-feedback');
    if (!feedback) return;

    feedback.textContent = message;

    if (state) {
        feedback.dataset.state = state;
    } else {
        delete feedback.dataset.state;
    }
}

function setFieldMessage(id, message, state = '') {
    const fieldMessage = document.getElementById(id);
    if (!fieldMessage) return;

    fieldMessage.textContent = message;

    if (state) {
        fieldMessage.dataset.state = state;
    } else {
        delete fieldMessage.dataset.state;
    }
}

function clearAuthFieldMessages() {
    document.querySelectorAll('.auth-field-message').forEach((message) => {
        message.textContent = '';
        delete message.dataset.state;
    });
}

function initAuthValidation() {
    document.getElementById('auth-login-email')?.addEventListener('input', () => validateLoginEmail());
    document.getElementById('auth-login-password')?.addEventListener('input', () => validateLoginPassword());
    document.getElementById('auth-register-name')?.addEventListener('input', () => validateRegisterName());
    document.getElementById('auth-register-email')?.addEventListener('input', () => validateRegisterEmail());
    document.getElementById('auth-register-password')?.addEventListener('input', () => {
        validateRegisterPassword();
        validateRegisterConfirm();
    });
    document.getElementById('auth-register-confirm')?.addEventListener('input', () => validateRegisterConfirm());
    document.getElementById('auth-verify-code')?.addEventListener('input', () => validateVerificationCode());
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function evaluatePasswordStrength(password) {
    const hasMinLength = password.length >= 8;
    const hasLetter = /[A-Za-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    const isStrong = hasMinLength && hasLetter && hasNumber && hasSymbol;
    const isWeak = hasMinLength && hasLetter && ((hasNumber && !hasSymbol) || (!hasNumber && hasSymbol));
    const isAccepted = isStrong || isWeak;

    return {
        hasMinLength,
        hasLetter,
        hasNumber,
        hasSymbol,
        isStrong,
        isWeak,
        isAccepted
    };
}

function validateLoginEmail() {
    const value = document.getElementById('auth-login-email')?.value.trim() ?? '';

    if (!value) {
        setFieldMessage('auth-login-email-message', 'Email address is required.', 'error');
        return false;
    }

    if (!isValidEmail(value)) {
        setFieldMessage('auth-login-email-message', 'Enter a valid email address with @.', 'error');
        return false;
    }

    setFieldMessage('auth-login-email-message', '');
    return true;
}

function validateLoginPassword() {
    const value = document.getElementById('auth-login-password')?.value ?? '';

    if (!value) {
        setFieldMessage('auth-login-password-message', 'Password is required.', 'error');
        return false;
    }

    setFieldMessage('auth-login-password-message', '');
    return true;
}

function validateRegisterName() {
    const value = document.getElementById('auth-register-name')?.value.trim() ?? '';

    if (!value) {
        setFieldMessage('auth-register-name-message', 'Full name is required.', 'error');
        return false;
    }

    setFieldMessage('auth-register-name-message', '');
    return true;
}

function validateRegisterEmail() {
    const value = document.getElementById('auth-register-email')?.value.trim() ?? '';

    if (!value) {
        setFieldMessage('auth-register-email-message', 'Email address is required.', 'error');
        return false;
    }

    if (!isValidEmail(value)) {
        setFieldMessage('auth-register-email-message', 'Email address must include @ and a valid domain.', 'error');
        return false;
    }

    setFieldMessage('auth-register-email-message', 'Email address looks good.', 'success');
    return true;
}

function validateRegisterPassword() {
    const value = document.getElementById('auth-register-password')?.value ?? '';
    const strength = evaluatePasswordStrength(value);

    if (!value) {
        setFieldMessage('auth-register-password-message', 'Password is required.', 'error');
        return false;
    }

    if (!strength.hasMinLength) {
        setFieldMessage('auth-register-password-message', 'Password must be at least 8 characters.', 'error');
        return false;
    }

    if (!strength.hasLetter) {
        setFieldMessage('auth-register-password-message', 'Password must include at least one letter.', 'error');
        return false;
    }

    if (!strength.hasNumber && !strength.hasSymbol) {
        setFieldMessage('auth-register-password-message', 'Password must include a number or a symbol.', 'error');
        return false;
    }

    if (strength.isStrong) {
        setFieldMessage('auth-register-password-message', 'Strong password.', 'success');
        return true;
    }

    if (strength.isWeak) {
        const weakMessage = strength.hasNumber
            ? 'Weak password. Add a symbol to make it strong.'
            : 'Weak password. Add a number to make it strong.';
        setFieldMessage('auth-register-password-message', weakMessage, 'warning');
        return true;
    }

    setFieldMessage('auth-register-password-message', 'Password must include letters and more than one type of character.', 'error');
    return false;
}

function validateRegisterConfirm() {
    const password = document.getElementById('auth-register-password')?.value ?? '';
    const confirmPassword = document.getElementById('auth-register-confirm')?.value ?? '';

    if (!confirmPassword) {
        setFieldMessage('auth-register-confirm-message', 'Confirm password is required.', 'error');
        return false;
    }

    if (confirmPassword !== password) {
        setFieldMessage('auth-register-confirm-message', 'Passwords do not match.', 'error');
        return false;
    }

    setFieldMessage('auth-register-confirm-message', 'Passwords match.', 'success');
    return true;
}

function validateVerificationCode() {
    const value = document.getElementById('auth-verify-code')?.value.trim() ?? '';

    if (!value) {
        setFieldMessage('auth-verify-code-message', 'Verification code is required.', 'error');
        return false;
    }

    if (!/^\d{6}$/.test(value)) {
        setFieldMessage('auth-verify-code-message', 'Enter the 6-digit code sent to your email.', 'error');
        return false;
    }

    setFieldMessage('auth-verify-code-message', 'Verification code format looks good.', 'success');
    return true;
}

function finishAuthSuccess() {
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const verifyForm = document.getElementById('auth-verify-form');
    const rememberCheckbox = document.getElementById('auth-login-remember');

    window.setTimeout(() => {
        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();
        if (verifyForm) verifyForm.reset();
        if (rememberCheckbox) rememberCheckbox.checked = false;

        pendingVerificationEmail = '';
        switchAuthView('login');
        closeAuthModal({ keepPendingAction: true });
        runPendingAuthAction();
    }, 250);
}

function runPendingAuthAction() {
    const action = pendingAuthAction;
    pendingAuthAction = null;

    if (typeof action === 'function') {
        action();
    }
}

function renderAuthUI() {
    const authBtn = document.getElementById('auth-btn');
    const authLabel = authBtn?.querySelector('.auth-label');
    const shopBtn = document.getElementById('shop-btn');
    const cartBtn = document.getElementById('cart-btn');

    if (shopBtn) shopBtn.hidden = !isAuthenticated();
    if (cartBtn) cartBtn.hidden = !isAuthenticated();

    if (!authBtn || !authLabel) return;

    if (isAuthenticated()) {
        authLabel.textContent = 'Logout';
        authBtn.classList.add('logged-in');
        authBtn.setAttribute(
            'aria-label',
            currentUser.role === 'admin' ? `Logout admin ${currentUser.name}` : `Logout ${currentUser.name}`
        );
        authBtn.title = currentUser.role === 'admin'
            ? `Signed in as admin: ${currentUser.name}. Click to logout.`
            : `Signed in as ${currentUser.name}. Click to logout.`;
        return;
    }

    closeCartSidebar();
    closeOrdersSidebar();
    authLabel.textContent = 'Login';
    authBtn.classList.remove('logged-in');
    authBtn.setAttribute('aria-label', 'Login or create account');
    authBtn.title = 'Login or create account';
}

async function logoutUser() {
    const accessToken = currentSession?.access_token;

    currentUser = null;
    currentSession = null;
    pendingAuthAction = null;
    pendingVerificationEmail = '';

    try {
        await signOutFromSupabase(accessToken);
    } catch (error) {
        console.warn('Unable to fully sign out from Supabase.', error);
    }

    renderAuthUI();
    closeAuthModal();
}

function getFirstName(name = '') {
    return name.trim().split(/\s+/)[0] || 'Member';
}

function syncBodyModalLock() {
    const hasOpenModal = Boolean(document.querySelector('.product-modal.open, .auth-modal.open'));
    document.body.classList.toggle('modal-open', hasOpenModal);
}

// FEEDBACK SYSTEM
function initFeedbackSystem() {
    const stars = document.querySelectorAll('.star');
    const form = document.getElementById('feedback-form');
    const display = document.getElementById('recent-feedback');
    const submitBtn = document.getElementById('send-feedback');
    let selectedRating = 0;

    if (!form || !display || !submitBtn) return;

    submitBtn.addEventListener('click', (event) => {
        if (isAuthenticated()) return;

        event.preventDefault();
        requireAuth(() => form.requestSubmit(), 'Please log in first to send feedback.');
    });

    stars.forEach((star) => {
        star.addEventListener('mouseover', () => {
            const val = parseInt(star.dataset.value, 10);
            stars.forEach((entry) => {
                if (parseInt(entry.dataset.value, 10) <= val) entry.classList.add('hover');
            });
        });

        star.addEventListener('mouseout', () => {
            stars.forEach((entry) => entry.classList.remove('hover'));
        });

        star.addEventListener('click', () => {
            selectedRating = parseInt(star.dataset.value, 10);
            stars.forEach((entry) => {
                if (parseInt(entry.dataset.value, 10) <= selectedRating) {
                    entry.classList.add('selected');
                } else {
                    entry.classList.remove('selected');
                }
            });
        });
    });

    const sampleFeedback = [
        { rating: 5, text: 'Absolutely stunning pieces. The quality surpasses expectations.', date: 'MAY 04, 2026' },
        { rating: 4, text: 'Love the minimalistic approach. Shipping was exceptionally fast.', date: 'MAY 02, 2026' }
    ];

    function renderFeedbackItem(data) {
        const item = document.createElement('div');
        item.className = 'feedback-item';
        item.innerHTML = `
            <div class="item-rating">${'\u2605'.repeat(data.rating)}${'\u2606'.repeat(5 - data.rating)}</div>
            <p class="item-text">"${data.text}"</p>
            <div class="item-date">${data.date}</div>
        `;
        display.prepend(item);
    }

    sampleFeedback.forEach(renderFeedbackItem);

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!requireAuth(() => form.requestSubmit(), 'Please log in first to send feedback.')) {
            return;
        }

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

        submitBtn.textContent = 'Feedback Received';
        submitBtn.disabled = true;
        form.reset();
        selectedRating = 0;
        stars.forEach((entry) => entry.classList.remove('selected'));

        setTimeout(() => {
            submitBtn.textContent = 'Send Feedback';
            submitBtn.disabled = false;
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
    const prevImageBtn = document.getElementById('product-modal-gallery-prev');
    const nextImageBtn = document.getElementById('product-modal-gallery-next');
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

        if (!requireAuth(
            () => checkoutActiveSelection(),
            'Please log in first to checkout this item.'
        )) {
            return;
        }

        checkoutActiveSelection();
    });

    prevImageBtn?.addEventListener('click', () => changeProductModalImage(-1));
    nextImageBtn?.addEventListener('click', () => changeProductModalImage(1));

    sizeButtons.forEach((button) => {
        button.addEventListener('click', () => {
            if (!activeProductSelection) return;
            activeProductSelection.size = button.dataset.size;
            renderSizeSelection();
        });
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeAuthModal();
            closeProductModal();
            closeCartSidebar();
            closeOrdersSidebar();
            return;
        }

        if (!document.querySelector('.product-modal.open') || !activeProductSelection) return;

        if (event.key === 'ArrowLeft') {
            changeProductModalImage(-1);
        }

        if (event.key === 'ArrowRight') {
            changeProductModalImage(1);
        }
    });
}

function checkoutActiveSelection() {
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
}

window.openProductModal = function(productId, quantity = 1) {
    const product = findProduct(productId);
    const modal = document.getElementById('product-modal');

    if (!product || !modal) return;

    activeProductSelection = {
        productId,
        quantity: Math.max(1, quantity),
        size: 'S',
        currentImageIndex: 0
    };

    const title = document.getElementById('product-modal-title');
    const description = document.getElementById('product-modal-description');
    const price = document.getElementById('product-modal-price');
    const quantityLabel = document.getElementById('product-modal-quantity');

    renderProductModalImage();
    title.textContent = product.name;
    description.textContent = product.description;
    price.textContent = formatMoney(product.price);
    quantityLabel.textContent = `Quantity ${activeProductSelection.quantity}`;

    renderSizeSelection();

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    syncBodyModalLock();
};

function closeProductModal() {
    const modal = document.getElementById('product-modal');
    if (!modal) return;

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    activeProductSelection = null;
    syncBodyModalLock();
}

function renderSizeSelection() {
    document.querySelectorAll('.size-option').forEach((button) => {
        button.classList.toggle('selected', button.dataset.size === activeProductSelection?.size);
    });
}

function getProductImages(product) {
    if (!product) return [];

    if (Array.isArray(product.images) && product.images.length > 0) {
        return product.images;
    }

    return product.image ? [product.image] : [];
}

function getPrimaryProductImage(product) {
    return getProductImages(product)[0] || '';
}

function renderProductModalImage() {
    if (!activeProductSelection) return;

    const product = findProduct(activeProductSelection.productId);
    const image = document.getElementById('product-modal-image');
    const media = document.querySelector('.product-modal-media');
    const prevBtn = document.getElementById('product-modal-gallery-prev');
    const nextBtn = document.getElementById('product-modal-gallery-next');
    const status = document.getElementById('product-modal-gallery-status');

    if (!product || !image || !media || !prevBtn || !nextBtn || !status) return;

    const images = getProductImages(product);
    const lastIndex = Math.max(0, images.length - 1);
    const currentIndex = Math.min(activeProductSelection.currentImageIndex || 0, lastIndex);
    const hasMultipleImages = images.length > 1;

    activeProductSelection.currentImageIndex = currentIndex;
    image.src = images[currentIndex] || '';
    image.alt = hasMultipleImages
        ? `${product.name} image ${currentIndex + 1}`
        : product.name;

    media.classList.toggle('has-gallery', hasMultipleImages);
    prevBtn.hidden = !hasMultipleImages || currentIndex === 0;
    nextBtn.hidden = !hasMultipleImages || currentIndex === lastIndex;
    status.hidden = !hasMultipleImages;
    status.textContent = hasMultipleImages ? `${currentIndex + 1} / ${images.length}` : '';
}

function changeProductModalImage(direction) {
    if (!activeProductSelection) return;

    const product = findProduct(activeProductSelection.productId);
    const images = getProductImages(product);
    if (images.length <= 1) return;

    const nextIndex = activeProductSelection.currentImageIndex + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;

    activeProductSelection.currentImageIndex = nextIndex;
    renderProductModalImage();
}

// CART DATA
window.addToCart = function(productId, quantity = 1, size = 'S') {
    if (!requireAuth(
        () => window.addToCart(productId, quantity, size),
        'Please log in first to add items to your cart.'
    )) {
        return;
    }

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
        image: getPrimaryProductImage(product),
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
        cartTotal.textContent = formatMoney(0);
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
                <p style="font-size: 0.75rem; opacity: 0.6;">${formatMoney(item.price)} - Size ${item.size}</p>
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

    if (!requireAuth(
        () => handleCartCheckout(),
        'Please log in first to checkout your cart.'
    )) {
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
        customer: {
            name: currentUser?.name || 'Customer',
            email: currentUser?.email || 'No email provided',
            phone: currentUser?.phone || currentUser?.phoneNumber || 'Not provided'
        },
        items,
        totalItems,
        totalAmount,
        createdAt: new Date()
    });

    persistBuyerNotifications();
    updateBuyerUI();
}

function canCancelOrder(notification) {
    const createdAtTime = new Date(notification.createdAt).getTime();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
    return (Date.now() - createdAtTime) < twoDaysInMs;
}

window.cancelOrder = function(notificationId) {
    const target = buyerNotifications.find((notification) => notification.id === notificationId);
    if (!target) return;

    if (!canCancelOrder(target)) {
        updateBuyerUI();
        return;
    }

    buyerNotifications = buyerNotifications.filter((notification) => notification.id !== notificationId);
    persistBuyerNotifications();
    updateBuyerUI();
};

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
        const cancellable = canCancelOrder(notification);

        const itemsMarkup = notification.items.map((item) => `
            <div class="notification-item">
                <span>${item.name} - ${item.size}</span>
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
            <div class="notification-actions">
                <button class="order-action-btn checkout-state" type="button">
                    ${cancellable ? 'Checkout Active' : 'Checkout Continuing'}
                </button>
                <button
                    class="order-action-btn cancel-order"
                    type="button"
                    onclick="cancelOrder('${notification.id}')"
                    ${cancellable ? '' : 'disabled'}
                >
                    ${cancellable ? 'Cancel Order' : 'Cancel Locked'}
                </button>
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
    const submitBtn = form?.querySelector('.submit-btn');

    if (!form || !submitBtn) return;

    submitBtn.addEventListener('click', (event) => {
        if (isAuthenticated()) return;

        event.preventDefault();
        requireAuth(() => form.requestSubmit(), 'Please log in first to send an inquiry.');
    });

    form.addEventListener('submit', (event) => {
        event.preventDefault();

        if (!requireAuth(() => form.requestSubmit(), 'Please log in first to send an inquiry.')) {
            return;
        }

        const originalText = submitBtn.textContent;

        submitBtn.textContent = 'TRANSMITTING...';
        submitBtn.disabled = true;

        setTimeout(() => {
            submitBtn.textContent = 'RECEIVED WITH THANKS';
            submitBtn.style.background = '#d4af37';
            submitBtn.style.color = '#000';
            form.reset();

            setTimeout(() => {
                submitBtn.textContent = originalText;
                submitBtn.style.background = '';
                submitBtn.style.color = '';
                submitBtn.disabled = false;
            }, 3000);
        }, 1500);
    });
}

function initSmoothScroll() {
    const navbar = document.getElementById('navbar');

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            const targetSelector = anchor.getAttribute('href');
            if (!targetSelector || targetSelector === '#') return;

            const target = document.querySelector(targetSelector);
            if (!target) return;

            event.preventDefault();

            const startY = window.scrollY;
            const navOffset = (navbar?.offsetHeight || 88) + 18;
            const targetY = startY + target.getBoundingClientRect().top - navOffset;
            const duration = 950;
            const startTime = performance.now();

            function easeInOutCubic(progress) {
                return progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            }

            function animateScroll(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = easeInOutCubic(progress);
                const nextY = startY + ((targetY - startY) * eased);

                window.scrollTo(0, nextY);

                if (progress < 1) {
                    window.requestAnimationFrame(animateScroll);
                }
            }

            window.requestAnimationFrame(animateScroll);
        });
    });
}

function formatMoney(value) {
    return `\u20b1${value.toFixed(2)}`;
}

function formatTimestamp(date) {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: 'numeric',
        minute: '2-digit'
    }).toUpperCase();
}
