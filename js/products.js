const products = [
    {
        id: 1,
        name: "Spectral Silk Blouse",
        price: 320.00,
        category: "tshirts",
        image: "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?q=80&w=1976&auto=format&fit=crop",
        description: "Pure mulberry silk with a pearlescent finish."
    },
    {
        id: 2,
        name: "Golden Swirl Pants",
        price: 400.00,
        category: "pants",
        image: "/products/golden-swirl-pants-model.png",
        description: "Statement loose-fit pants with a bold gold, black, and cream swirl print."
    },
    {
        id: 3,
        name: "Minimalist Cashmere Coat",
        price: 890.00,
        category: "tshirts",
        image: "https://images.unsplash.com/photo-1539533113208-f6df8cc8b543?q=80&w=1974&auto=format&fit=crop",
        description: "Ethically sourced cashmere in midnight charcoal."
    },
    {
        id: 4,
        name: "Stanley Tumbler 600",
        price: 600.00,
        category: "accessories",
        image: "/products/stanley-tumbler-lifestyle.png",
        description: "Black Stanley tumbler showcased in-store with a clean matte finish and carry handle."
    }
];

function renderProducts(filter = 'all') {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    const filtered = filter === 'all' ? products : products.filter(p => p.category === filter);
    
    filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card 3d-effect';
        card.dataset.category = p.category;
        
        card.innerHTML = `
            <div class="card-inner">
                <div class="product-price-label">$${p.price.toFixed(2)}</div>
                <div class="image-wrapper">
                    <img src="${p.image}" alt="${p.name}">
                    <div class="image-overlay">
                        <button class="view-btn">Quick View</button>
                    </div>
                </div>
                <div class="product-info">
                    <h3>${p.name}</h3>
                    <div class="card-actions">
                        <div class="qty-control">
                            <button class="qty-btn minus" onclick="updateCardQty(this, -1)">-</button>
                            <span class="qty-val">1</span>
                            <button class="qty-btn plus" onclick="updateCardQty(this, 1)">+</button>
                        </div>
                        <button class="add-to-cart-btn" onclick="handleAddToCart(this, ${p.id})">Add to Cart</button>
                    </div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderTestimonials() {
    const track = document.getElementById('testimonial-track');
    if (!track) return;
    
    track.innerHTML = '';
    
    testimonials.forEach(t => {
        const slide = document.createElement('div');
        slide.className = 'testimonial-slide';
        slide.innerHTML = `
            <div class="testimonial-card">
                <div class="testimonial-avatar">
                    <img src="${t.avatar}" alt="${t.name}">
                </div>
                <div class="testimonial-content">
                    <p class="quote">"${t.text}"</p>
                    <div class="author">
                        <span class="name">${t.name}</span>
                        <span class="role">${t.role}</span>
                    </div>
                </div>
            </div>
        `;
        track.appendChild(slide);
    });
}

window.updateCardQty = function(btn, delta) {
    const qtyVal = btn.parentElement.querySelector('.qty-val');
    let current = parseInt(qtyVal.textContent);
    current = Math.max(1, current + delta);
    qtyVal.textContent = current;
};

window.handleAddToCart = function(btn, id) {
    const qtyVal = btn.parentElement.querySelector('.qty-val');
    const quantity = qtyVal ? parseInt(qtyVal.textContent) : 1;
    window.addToCart(id, quantity);
};

window.products = products;
window.renderProducts = renderProducts;
