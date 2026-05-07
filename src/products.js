export const products = [
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

export function renderProducts(filter = 'all') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    grid.innerHTML = '';

    const filtered = filter === 'all' ? products : products.filter((product) => product.category === filter);

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

window.products = products;
window.renderProducts = renderProducts;
