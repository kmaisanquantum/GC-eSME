    // Sample product data
    const categories = ['All', 'Fashion', 'Catering', 'Tech', 'Beauty', 'Home & Living', 'Sports', 'Accessories'];

    // Extended sample products to look more like an ecommerce site
    const products = [
      { id: 1, name: 'Traditional Sepik Bilum', category: 'Fashion', price: 150.00, stall: 'Sepik Crafts', level: 1, rating: 4.8, reviews: 12, image: 'https://images.unsplash.com/photo-1590739225287-bd31519780c3?w=400&auto=format' },
      { id: 2, name: 'Local Coffee Beans (500g)', category: 'Catering', price: 45.00, stall: 'Goroka Brews', level: 1, rating: 4.9, reviews: 45, image: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&auto=format' },
      { id: 3, name: 'Smartphone Screen Repair', category: 'Tech', price: 120.00, stall: 'Phone Fixers', level: 2, rating: 4.5, reviews: 28, image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&auto=format' },
      { id: 4, name: 'Organic Coconut Oil', category: 'Beauty', price: 25.00, stall: 'Island Glow', level: 1, rating: 4.7, reviews: 19, image: 'https://images.unsplash.com/photo-1590439471364-192aa70c0b53?w=400&auto=format' },
      { id: 5, name: 'Hand-woven Floor Mat', category: 'Home & Living', price: 85.00, stall: 'Village Weavers', level: 1, rating: 4.6, reviews: 15, image: 'https://images.unsplash.com/photo-1575410223196-9f6f21c824f1?w=400&auto=format' },
      { id: 6, name: 'Custom Team Jersey', category: 'Sports', price: 65.00, stall: 'Active PNG', level: 2, rating: 4.4, reviews: 10, image: 'https://images.unsplash.com/photo-1580087444152-c2b6229f4434?w=400&auto=format' },
      { id: 7, name: 'Shell Necklace Set', category: 'Accessories', price: 35.00, stall: 'Coastal Gems', level: 1, rating: 4.8, reviews: 22, image: 'https://images.unsplash.com/photo-1596944210918-28522799335d?w=400&auto=format' },
      { id: 8, name: 'Leather Work Boots', category: 'Fashion', price: 280.00, stall: 'Rugged Wear', level: 2, rating: 4.7, reviews: 31, image: 'https://images.unsplash.com/photo-1520639889410-1df41d7b1868?w=400&auto=format' }
    ];

    let currentCategory = 'All';
    let cart = JSON.parse(localStorage.getItem('um_cart') || '[]');

    function init() {
      renderCategories();
      filterStalls();
      updateCartUI();
    }

    function renderCategories() {
      const container = document.getElementById('categories');
      container.innerHTML = categories.map(cat => `
        <button class="cat-btn ${cat === currentCategory ? 'active' : ''}" onclick="selectCategory('${cat}')">
          ${cat}
        </button>
      `).join('');
    }

    function selectCategory(cat) {
      currentCategory = cat;
      renderCategories();
      filterStalls();
    }

    function filterStalls() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const filtered = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search) ||
                              p.stall.toLowerCase().includes(search) ||
                              p.category.toLowerCase().includes(search);
        const matchesCat = currentCategory === 'All' || p.category === currentCategory;
        return matchesSearch && matchesCat;
      });

      const container = document.getElementById('stalls');
      document.getElementById('results').textContent = `${filtered.length} items found`;

      if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-muted);">No products found matching your search.</div>';
        return;
      }

      container.innerHTML = filtered.map(p => `
        <div class="card">
          <div class="card-img-container">
            <img src="${p.image}" class="card-img" alt="${p.name}" loading="lazy">
            ${p.rating > 4.7 ? '<span class="card-badge">Top Rated</span>' : ''}
          </div>
          <div class="card-content">
            <div class="card-category">${p.category} • ${p.stall}</div>
            <h3 class="card-name">${p.name}</h3>
            <div class="card-meta">
              <span>⭐ ${p.rating}</span>
              <span>(${p.reviews})</span>
              <span>• L${p.level}</span>
            </div>
            <div class="card-price">K${p.price.toFixed(2)}</div>
            <div class="card-actions">
              <button class="btn-cart" onclick="addToCart(${p.id})">
                <span>🛒</span> Add
              </button>
              <button class="btn-whatsapp" onclick="openWhatsApp('${p.stall}', '${p.name}')">
                <span>💬</span>
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }

    function addToCart(productId) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const existing = cart.find(item => item.id === productId);
        if (existing) {
          existing.quantity++;
        } else {
          cart.push({ ...product, quantity: 1 });
        }
        saveCart();
        updateCartUI();
        showNotification(`Added ${product.name} to cart`);
      }
    }

    function saveCart() {
      localStorage.setItem('um_cart', JSON.stringify(cart));
    }

    function updateCartUI() {
      const count = cart.reduce((sum, item) => sum + item.quantity, 0);
      document.getElementById('cartCount').textContent = count;

      const cartItemsContainer = document.getElementById('cartItems');
      if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 2rem;">Your cart is empty.</p>';
        document.getElementById('cartTotal').textContent = 'K0.00';
        return;
      }

      cartItemsContainer.innerHTML = cart.map(item => `
        <div class="cart-item">
          <img src="${item.image}" class="cart-item-img">
          <div class="cart-item-info">
            <h4>${item.name}</h4>
            <p>K${item.price.toFixed(2)} x ${item.quantity}</p>
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
             <button onclick="removeFromCart(${item.id})" style="background:none; border:none; color:#ef4444; cursor:pointer;">Remove</button>
          </div>
        </div>
      `).join('');

      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      document.getElementById('cartTotal').textContent = `K${total.toFixed(2)}`;
    }

    function removeFromCart(productId) {
      cart = cart.filter(item => item.id !== productId);
      saveCart();
      updateCartUI();
    }

    function toggleCart() {
      document.getElementById('cartModal').classList.toggle('show');
    }

    function openWhatsApp(stall, productName) {
      const msg = encodeURIComponent(`Hi ${stall}, I'm interested in "${productName}" I saw on Garden City SME Market SME centre!`);
      window.open(`https://wa.me/67570000000?text=${msg}`, '_blank');
    }

    function switchScreen(screenId) {
      document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
      document.getElementById(screenId).classList.remove('hidden');

      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
      event.target.closest('.nav-btn').classList.add('active');
    }

    function openAuthModal() { document.getElementById('authModal').classList.add('show'); }
    function closeAuthModal() { document.getElementById('authModal').classList.remove('show'); }

    function checkout() {
      if (cart.length === 0) return;
      alert('In a real app, this would lead to a payment gateway. Total: ' + document.getElementById('cartTotal').textContent);
    }

    function showNotification(msg) {
      // Simple toast
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:var(--bg-card); border:1px solid var(--primary); padding:12px 24px; border-radius:30px; z-index:1000; font-size:14px; box-shadow:0 4px 12px rgba(0,0,0,0.5);';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    // Initialize
    init();
