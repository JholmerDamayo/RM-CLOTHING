/**
 * Interactive Effects for Elysian Luxe
 */

document.addEventListener('DOMContentLoaded', () => {
    initLoader();
    initScrollRevel();
    initNavbar();
    initParallax();
});

function initLoader() {
    const loader = document.getElementById('loader');
    const body = document.body;

    // Simulate loading assets
    window.addEventListener('load', () => {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                body.classList.remove('loading');
            }, 800);
        }, 1500);
    });
}

function initScrollRevel() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    const elementsToReveal = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    elementsToReveal.forEach((el) => revealObserver.observe(el));
}

function initNavbar() {
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
            navbar.classList.remove('transparent');
        } else {
            navbar.classList.remove('scrolled');
            navbar.classList.add('transparent');
        }
    });
}

function initParallax() {
    const banner = document.querySelector('.banner-img');

    window.addEventListener('scroll', () => {
        const scrolled = window.scrollY;
        if (scrolled < window.innerHeight) {
            banner.style.transform = `translateY(${scrolled * 0.4}px) scale(${1 + scrolled * 0.0005})`;
        }
    });

    // Create background floating blobs
    const blob = document.createElement('div');
    blob.className = 'bg-blob';
    document.body.appendChild(blob);
}

// Mobile Menu
const menuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.createElement('div');
mobileMenu.className = 'mobile-menu';
mobileMenu.innerHTML = `
    <a href="#home">Home</a>
    <a href="#products">Products</a>
    <a href="#about">About</a>
    <a href="#contact">Contact</a>
    <a href="#feedback">Feedback</a>
`;
document.body.appendChild(mobileMenu);

menuBtn.addEventListener('click', () => {
    document.body.classList.toggle('menu-active');
    mobileMenu.classList.toggle('active');
});

mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
        document.body.classList.remove('menu-active');
        mobileMenu.classList.remove('active');
    });
});

window.initScrollRevel = initScrollRevel;
