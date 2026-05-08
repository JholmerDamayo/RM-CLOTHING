export const CUSTOM_PRODUCTS_STORAGE_KEY = 'rm-clothing-custom-products';
export const PRODUCT_OVERRIDES_STORAGE_KEY = 'rm-clothing-product-overrides';
export const DELETED_PRODUCTS_STORAGE_KEY = 'rm-clothing-deleted-products';
export const PRODUCT_STORAGE_KEYS = [
    CUSTOM_PRODUCTS_STORAGE_KEY,
    PRODUCT_OVERRIDES_STORAGE_KEY,
    DELETED_PRODUCTS_STORAGE_KEY
];

const BASE_PRODUCTS = [
    {
        id: 1,
        name: 'World Series',
        price: 320.0,
        category: 'tshirts',
        image: '/products/world-series-shirt.png',
        images: [
            '/products/world-series-shirt.png'
        ],
        description: 'Black RM Clothing tee with the World Series Champions graphic.'
    },
    {
        id: 2,
        name: 'Evisu Brush Tee',
        price: 400.0,
        category: 'tshirts',
        image: '/products/evisu-brush-tee-model.png',
        images: [
            '/products/evisu-brush-tee-model.png',
            '/products/evisu-brush-tee-shirt.png'
        ],
        description: 'Black Evisu tee with the signature brush-style chest graphic.'
    },
    {
        id: 3,
        name: 'Golden Swirl Pants',
        price: 400.0,
        category: 'pants',
        image: '/products/golden-swirl-pants-model.png',
        images: [
            '/products/golden-swirl-pants-model.png',
            '/products/golden-swirl-pants-set.png'
        ],
        description: 'Statement loose-fit pants with a bold gold, black, and cream swirl print.'
    },
    {
        id: 4,
        name: 'Stanley Tumbler',
        price: 600.0,
        category: 'accessories',
        image: '/products/stanley-tumbler-lifestyle.png',
        images: [
            '/products/stanley-tumbler-lifestyle.png',
            '/products/stanley-tumbler-detail.png'
        ],
        description: 'Black Stanley tumbler showcased in-store with a clean matte finish and carry handle.'
    }
];

export const products = BASE_PRODUCTS;

function getBrowserStorage() {
    return typeof window !== 'undefined' ? window.localStorage : null;
}

function normalizeStoredProduct(product, index) {
    const primaryImage = String(product?.image || product?.images?.[0] || '').trim();
    const secondaryImage = String(product?.images?.[1] || '').trim();

    if (!primaryImage) {
        return null;
    }

    const images = [primaryImage, secondaryImage].filter(Boolean);

    return {
        id: Number(product?.id) || (Date.now() + index),
        name: String(product?.name || `Custom Item ${index + 1}`).trim(),
        price: Number(product?.price || 0),
        category: normalizeCategory(product?.category),
        image: primaryImage,
        images,
        description: String(product?.description || 'Custom storefront item.').trim()
    };
}

function readStoredProducts() {
    const storage = getBrowserStorage();
    if (!storage) return [];

    try {
        const parsed = JSON.parse(storage.getItem(CUSTOM_PRODUCTS_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .map((product, index) => normalizeStoredProduct(product, index))
            .filter(Boolean);
    } catch (error) {
        console.warn('Unable to load custom products.', error);
        return [];
    }
}

function writeStoredProducts(nextProducts) {
    const storage = getBrowserStorage();
    if (!storage) return;

    try {
        storage.setItem(CUSTOM_PRODUCTS_STORAGE_KEY, JSON.stringify(nextProducts));
    } catch (error) {
        console.warn('Unable to save custom products.', error);
    }
}

function readJsonArray(storageKey) {
    const storage = getBrowserStorage();
    if (!storage) return [];

    try {
        const parsed = JSON.parse(storage.getItem(storageKey) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(`Unable to read ${storageKey}.`, error);
        return [];
    }
}

function writeJsonArray(storageKey, value) {
    const storage = getBrowserStorage();
    if (!storage) return;

    try {
        storage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to save ${storageKey}.`, error);
    }
}

function readProductOverrides() {
    return readJsonArray(PRODUCT_OVERRIDES_STORAGE_KEY)
        .map((product, index) => normalizeStoredProduct(product, index))
        .filter(Boolean);
}

function writeProductOverrides(nextProducts) {
    writeJsonArray(PRODUCT_OVERRIDES_STORAGE_KEY, nextProducts);
}

function readDeletedProductIds() {
    return readJsonArray(DELETED_PRODUCTS_STORAGE_KEY)
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
}

function writeDeletedProductIds(nextIds) {
    writeJsonArray(DELETED_PRODUCTS_STORAGE_KEY, [...new Set(nextIds.map((id) => Number(id)).filter(Number.isFinite))]);
}

function normalizeCategory(category) {
    const value = String(category || 'tshirts').trim().toLowerCase();
    if (value === 'pants' || value === 'accessories' || value === 'tshirts') {
        return value;
    }

    return 'tshirts';
}

function syncWindowProducts() {
    if (typeof window !== 'undefined') {
        window.products = getProducts();
    }
}

export function getProducts() {
    const deletedIds = new Set(readDeletedProductIds());
    const overridesById = new Map(readProductOverrides().map((product) => [product.id, product]));

    return [...BASE_PRODUCTS, ...readStoredProducts()]
        .filter((product) => !deletedIds.has(product.id))
        .map((product) => ({
            ...product,
            ...(overridesById.get(product.id) || {})
        }))
        .map((product) => normalizeStoredProduct(product, 0))
        .filter(Boolean);
}

export function addCustomProduct(productInput) {
    const storedProducts = readStoredProducts();
    const primaryImage = String(productInput?.image || '').trim();
    const secondaryImage = String(productInput?.imageAlt || '').trim();

    const product = normalizeStoredProduct({
        id: Date.now(),
        name: String(productInput?.name || '').trim(),
        price: Number(productInput?.price || 0),
        category: productInput?.category,
        image: primaryImage,
        images: [primaryImage, secondaryImage].filter(Boolean),
        description: String(productInput?.description || '').trim()
    }, storedProducts.length);

    if (!product) {
        throw new Error('A primary image is required.');
    }

    writeStoredProducts([...storedProducts, product]);
    syncWindowProducts();

    return product;
}

export function updateProduct(productId, productInput) {
    const normalizedId = Number(productId);
    const currentProduct = getProducts().find((product) => product.id === normalizedId);

    if (!currentProduct) {
        throw new Error('This product could not be found.');
    }

    const incomingImages = Array.isArray(productInput?.images)
        ? productInput.images.map((image) => String(image || '').trim()).filter(Boolean)
        : currentProduct.images;
    const primaryImage = incomingImages[0] || String(productInput?.image || currentProduct.image || '').trim();
    const secondaryImage = incomingImages[1] || '';

    const nextProduct = normalizeStoredProduct({
        ...currentProduct,
        ...productInput,
        id: normalizedId,
        image: primaryImage,
        images: [primaryImage, secondaryImage].filter(Boolean)
    }, 0);

    if (!nextProduct) {
        throw new Error('At least one product image is required.');
    }

    const nextOverrides = readProductOverrides().filter((product) => product.id !== normalizedId);
    writeProductOverrides([...nextOverrides, nextProduct]);
    writeDeletedProductIds(readDeletedProductIds().filter((id) => id !== normalizedId));
    syncWindowProducts();

    return nextProduct;
}

export function deleteProduct(productId) {
    const normalizedId = Number(productId);
    const currentProduct = getProducts().find((product) => product.id === normalizedId);

    if (!currentProduct) {
        throw new Error('This product could not be found.');
    }

    const nextOverrides = readProductOverrides().filter((product) => product.id !== normalizedId);
    writeProductOverrides(nextOverrides);

    const isBaseProduct = BASE_PRODUCTS.some((product) => product.id === normalizedId);

    if (isBaseProduct) {
        writeDeletedProductIds([...readDeletedProductIds(), normalizedId]);
    } else {
        const nextCustomProducts = readStoredProducts().filter((product) => product.id !== normalizedId);
        writeStoredProducts(nextCustomProducts);
    }

    syncWindowProducts();

    return currentProduct;
}

function getActiveSearchTerm(fallback = '') {
    if (typeof document === 'undefined') return fallback;
    const input = document.getElementById('collection-search-input');
    return typeof fallback === 'string' && fallback.length > 0
        ? fallback
        : (input?.value.trim() || '');
}

export function renderProducts(filter = 'all', searchTerm = '') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    syncWindowProducts();
    grid.innerHTML = '';

    const normalizedFilter = String(filter || 'all').toLowerCase();
    const normalizedSearch = getActiveSearchTerm(searchTerm).toLowerCase();
    const catalog = getProducts();
    const filtered = catalog.filter((product) => {
        const matchesCategory = normalizedFilter === 'all' || product.category === normalizedFilter;
        if (!matchesCategory) return false;

        if (!normalizedSearch) return true;

        return [
            product.name,
            product.description,
            product.category
        ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    if (!filtered.length) {
        grid.innerHTML = '<p class="empty-msg">No products match your search right now.</p>';
        return;
    }

    filtered.forEach((product) => {
        const primaryImage = Array.isArray(product.images) && product.images.length > 0
            ? product.images[0]
            : product.image;
        const card = document.createElement('div');
        card.className = 'product-card 3d-effect';
        card.dataset.category = product.category;

        card.innerHTML = `
            <div class="card-inner">
                <div class="product-price-label">&#8369;${product.price.toFixed(2)}</div>
                <div class="image-wrapper">
                    <img src="${primaryImage}" alt="${product.name}">
                    <div class="image-overlay">
                        <button class="view-btn" onclick="openProductModal(${product.id}, getCardQuantity(this))">Quick View</button>
                    </div>
                </div>
                <div class="product-info">
                    <h3>${product.name}</h3>
                    <div class="card-actions">
                        <div class="qty-control">
                            <button class="qty-btn minus" onclick="updateCardQty(this, -1)">-</button>
                            <span class="qty-val">1</span>
                            <button class="qty-btn plus" onclick="updateCardQty(this, 1)">+</button>
                        </div>
                        <button class="add-to-cart-btn" onclick="handleAddToCart(this, ${product.id})">Add to Cart</button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.updateCardQty = function(btn, delta) {
    const qtyVal = btn.parentElement.querySelector('.qty-val');
    let current = parseInt(qtyVal.textContent);
    current = Math.max(1, current + delta);
    qtyVal.textContent = current;
};

window.handleAddToCart = function(btn, id) {
    const quantity = window.getCardQuantity(btn);
    if (typeof window.requireAuth === 'function' && !window.requireAuth(
        () => window.openProductModal(id, quantity),
        'Please log in first to add items to your cart.'
    )) {
        return;
    }
    window.openProductModal(id, quantity);
};

window.getCardQuantity = function(triggerElement) {
    const card = triggerElement.closest('.product-card');
    const qtyVal = card ? card.querySelector('.qty-val') : null;
    return qtyVal ? parseInt(qtyVal.textContent) : 1;
};

syncWindowProducts();
window.renderProducts = renderProducts;
