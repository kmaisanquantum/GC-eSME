const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Database setup
const db = new sqlite3.Database('./garden_city_sme.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to Garden City SME Market SQLite database');
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Vendors table
    db.run(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        facebook TEXT,
        password TEXT,
        email TEXT,
        social_provider TEXT,
        social_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Products table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Product images table
    db.run(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Services table
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        duration INTEGER DEFAULT 0,
        description TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Orders table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        items TEXT NOT NULL,
        total_price REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Admins table
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Users (Customers) table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        phone TEXT,
        password TEXT,
        social_provider TEXT,
        social_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin if not exists
    db.get('SELECT * FROM admins WHERE username = ?', ['admin'], (err, row) => {
      if (!row) {
        db.run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', 'admin123']);
      }
    });

    console.log('Database tables initialized');
  });
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// ============== AUTH ROUTES ==============

// Vendor Registration
app.post('/api/auth/register', (req, res) => {
  const { name, category, phone, location, description, facebook, password, email } = req.body;
  const sql = 'INSERT INTO vendors (name, category, phone, location, description, facebook, password, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [name, category, phone, location, description, facebook, password, email], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Vendor registered successfully' });
  });
});

// Vendor Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM vendors WHERE email = ? AND password = ?', [email, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ message: 'Login successful', vendor: row });
  });
});

// Social Authentication
// NOTE: For real production, verify tokens on server side using 'google-auth-library' or 'fb' Node.js SDK
app.post("/api/auth/social", (req, res) => {
  const { provider, name, email, id, token, role } = req.body;

  if (!id || !provider) {
    return res.status(400).json({ error: "Missing required social auth parameters" });
  }

  const table = role === 'vendor' ? 'vendors' : 'users';

  // Check if a social account already exists with this ID and provider
  db.get(`SELECT * FROM ${table} WHERE social_provider = ? AND social_id = ?`, [provider, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      return res.json({ message: "Login successful", [role === 'vendor' ? 'vendor' : 'user']: row });
    } else {
      // Check if a user/vendor already exists with this email
      db.get(`SELECT * FROM ${table} WHERE email = ?`, [email], (err, existingRow) => {
        if (err) return res.status(500).json({ error: err.message });

        if (existingRow) {
          // Link social account to existing email record
          const updateSql = `UPDATE ${table} SET social_provider = ?, social_id = ? WHERE id = ?`;
          db.run(updateSql, [provider, id, existingRow.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            existingRow.social_provider = provider;
            existingRow.social_id = id;
            res.json({ message: "Social account linked", [role === 'vendor' ? 'vendor' : 'user']: existingRow });
          });
        } else {
          // Create new record
          if (role === 'vendor') {
             const sql = "INSERT INTO vendors (name, email, social_provider, social_id, category, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id, 'General', 'Garden City SME Market', ''], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               res.json({ message: "Social vendor account created", vendor: { id: this.lastID, name, email, social_provider: provider, social_id: id } });
             });
          } else {
             const sql = "INSERT INTO users (name, email, social_provider, social_id) VALUES (?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               res.json({ message: "Social customer account created", user: { id: this.lastID, name, email, social_provider: provider, social_id: id } });
             });
          }
        }
      });
    }
  });
});

app.post("/api/auth/customer/register", (req, res) => {
  const { name, email, phone, password } = req.body;
  const sql = "INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)";
  db.run(sql, [name, email, phone, password], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: "Customer registered successfully" });
  });
});

// Customer Login
app.post("/api/auth/customer/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: "Invalid email or password" });
    res.json({ message: "Login successful", user: row });
  });
});

// ============== VENDOR ROUTES ==============

// Get all vendors
app.get('/api/vendors', (req, res) => {
  db.all('SELECT id, name, category, phone, location, description, facebook, email, created_at FROM vendors', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get vendor by ID
app.get('/api/vendors/:id', (req, res) => {
  db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });
    res.json(row);
  });
});

// Update vendor
app.put('/api/vendors/:id', (req, res) => {
  const { name, category, phone, location, description, facebook, email } = req.body;
  const sql = 'UPDATE vendors SET name=?, category=?, phone=?, location=?, description=?, facebook=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?';
  db.run(sql, [name, category, phone, location, description, facebook, email, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Vendor updated successfully', changes: this.changes });
  });
});

// Delete vendor
app.delete('/api/vendors/:id', (req, res) => {
  db.run('DELETE FROM vendors WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Vendor deleted successfully', changes: this.changes });
  });
});

// ============== PRODUCT ROUTES ==============

// Create product
app.post('/api/products', (req, res) => {
  const { vendor_id, name, category, price, stock, description, status } = req.body;
  const sql = 'INSERT INTO products (vendor_id, name, category, price, stock, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, name, category, price, stock || 0, description, status || 'active'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Product created successfully' });
  });
});

// Upload product images
app.post('/api/products/:id/images', upload.array('images', 5), (req, res) => {
  const productId = req.params.id;
  const files = req.files;
  if (!files || files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const sql = 'INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, ?)';
  let completed = 0;
  files.forEach((file, index) => {
    const imageUrl = `/uploads/${file.filename}`;
    const isPrimary = index === 0 ? 1 : 0;
    db.run(sql, [productId, imageUrl, isPrimary], (err) => {
      completed++;
      if (completed === files.length) res.json({ message: 'Images uploaded successfully', count: files.length });
    });
  });
});

// Get all products
app.get('/api/products', (req, res) => {
  const sql = 'SELECT p.*, GROUP_CONCAT(pi.image_url) as images, v.name as vendor_name, v.phone as vendor_phone, v.location as vendor_location FROM products p LEFT JOIN product_images pi ON p.id = pi.product_id LEFT JOIN vendors v ON p.vendor_id = v.id GROUP BY p.id ORDER BY p.created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const products = rows.map(row => ({ ...row, images: row.images ? row.images.split(',') : [] }));
    res.json(products);
  });
});

// Get products by vendor
app.get('/api/vendors/:vendorId/products', (req, res) => {
  const sql = 'SELECT p.*, GROUP_CONCAT(pi.image_url) as images FROM products p LEFT JOIN product_images pi ON p.id = pi.product_id WHERE p.vendor_id = ? GROUP BY p.id ORDER BY p.created_at DESC';
  db.all(sql, [req.params.vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const products = rows.map(row => ({ ...row, images: row.images ? row.images.split(',') : [] }));
    res.json(products);
  });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Product deleted successfully', changes: this.changes });
  });
});

// ============== SERVICE ROUTES ==============

// Create service
app.post('/api/services', upload.single('image'), (req, res) => {
  const { vendor_id, name, category, price, duration, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  const sql = 'INSERT INTO services (vendor_id, name, category, price, duration, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, name, category, price, duration || 0, description, imageUrl], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Service created successfully' });
  });
});

// Get all services
app.get('/api/services', (req, res) => {
  const sql = 'SELECT s.*, v.name as vendor_name, v.phone as vendor_phone, v.location as vendor_location FROM services s LEFT JOIN vendors v ON s.vendor_id = v.id ORDER BY s.created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Delete service
app.delete('/api/services/:id', (req, res) => {
  db.run('DELETE FROM services WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Service deleted successfully', changes: this.changes });
  });
});

// ============== ORDER ROUTES ==============

// Create order
app.post('/api/orders', (req, res) => {
  const { vendor_id, customer_name, customer_phone, items, total_price } = req.body;
  const sql = 'INSERT INTO orders (vendor_id, customer_name, customer_phone, items, total_price) VALUES (?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, customer_name, customer_phone, JSON.stringify(items), total_price], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Order created successfully' });
  });
});

// Get orders by vendor
app.get('/api/vendors/:vendorId/orders', (req, res) => {
  db.all('SELECT * FROM orders WHERE vendor_id = ? ORDER BY created_at DESC', [req.params.vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update order status
app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Order status updated successfully' });
  });
});

// ============== ADMIN ROUTES ==============

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ? AND password = ?', [username, password], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid admin credentials' });
    res.json({ message: 'Admin logged in', admin: { id: row.id, username: row.username } });
  });
});

// Admin Stats
app.get('/api/admin/stats', (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) as count FROM vendors', [], (err, row) => {
    stats.totalVendors = row.count;
    db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
      stats.totalProducts = row.count;
      db.get('SELECT COUNT(*) as count FROM orders', [], (err, row) => {
        stats.totalOrders = row.count;
        db.get('SELECT SUM(total_price) as total FROM orders WHERE status = "completed"', [], (err, row) => {
          stats.totalRevenue = row.total || 0;
          res.json(stats);
        });
      });
    });
  });
});

// Admin Vendors Management
app.get('/api/admin/vendors', (req, res) => {
  db.all('SELECT * FROM vendors ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin Products Management
app.get('/api/admin/products', (req, res) => {
  const sql = 'SELECT p.*, v.name as vendor_name FROM products p LEFT JOIN vendors v ON p.vendor_id = v.id ORDER BY p.created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin Orders Management
app.get('/api/admin/orders', (req, res) => {
  const sql = 'SELECT o.*, v.name as vendor_name FROM orders o LEFT JOIN vendors v ON o.vendor_id = v.id ORDER BY o.created_at DESC';
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Admin Delete Vendor
app.delete('/api/admin/vendors/:id', (req, res) => {
  db.run('DELETE FROM vendors WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Vendor deleted successfully' });
  });
});

// Admin Delete Product
app.delete('/api/admin/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Product deleted successfully' });
  });
});

// Admin Delete Order
app.delete('/api/admin/orders/:id', (req, res) => {
  db.run('DELETE FROM orders WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Order deleted successfully' });
  });
});

// ============== STATS ROUTES (Legacy/Common) ==============

app.get('/api/stats', (req, res) => {
  const stats = {};
  db.get('SELECT COUNT(*) as count FROM vendors', [], (err, row) => {
    stats.totalVendors = row.count;
    db.get('SELECT COUNT(*) as count FROM products', [], (err, row) => {
      stats.totalProducts = row.count;
      db.get('SELECT COUNT(*) as count FROM products WHERE status = "active"', [], (err, row) => {
        stats.activeProducts = row.count;
        db.get('SELECT COUNT(*) as count FROM services', [], (err, row) => {
          stats.totalServices = row.count;
          res.json(stats);
        });
      });
    });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Garden City SME Market SME centre API running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});
