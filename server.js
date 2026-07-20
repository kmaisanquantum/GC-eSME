require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production';
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting configuration for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Dynamic restricted CORS origin configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

// Global Middleware Stack
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP if frontend and backend are served together and need to load external cdn assets easily
}));
app.use(cors(corsOptions));
app.use('/api/', apiLimiter);
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(express.static('public'));

// Create uploads directory
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Database setup
const dbPath = process.env.DATABASE_FILE || './garden_city_sme.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to Garden City SME SQLite database at ' + dbPath);
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
        loyalty_rate REAL DEFAULT 1.0,
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

    // Create default admin if not exists with hashed password and env overrides
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    db.get('SELECT * FROM admins WHERE username = ?', [adminUsername], async (err, row) => {
      if (!row) {
        try {
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          db.run('INSERT INTO admins (username, password) VALUES (?, ?)', [adminUsername, hashedPassword], (insertErr) => {
            if (insertErr) {
              console.error('Error inserting admin user during database init:', insertErr);
            } else {
              console.log(`Default admin user '${adminUsername}' created successfully.`);
            }
          });
        } catch (hashErr) {
          console.error('Error hashing default admin password:', hashErr);
        }
      }
    });



    // Customer CRM Table
    db.run(`
      CREATE TABLE IF NOT EXISTS customer_crm (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        phone_number TEXT NOT NULL,
        full_name TEXT,
        total_spent REAL DEFAULT 0,
        last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor_id, phone_number),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Loyalty Points Table
    db.run(`
      CREATE TABLE IF NOT EXISTS loyalty_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        vendor_id INTEGER NOT NULL,
        current_points INTEGER DEFAULT 0,
        total_earned_points INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customer_crm(id) ON DELETE CASCADE,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Accounting Transactions table
    db.run(`
      CREATE TABLE IF NOT EXISTS accounting_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        gst REAL DEFAULT 0,
        swt REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Payments table
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        order_id INTEGER,
        amount REAL NOT NULL,
        method TEXT,
        status TEXT DEFAULT 'pending',
        transaction_ref TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      )
    `);

    // Add stock_threshold to products if not exists
    db.run("ALTER TABLE products ADD COLUMN stock_threshold INTEGER DEFAULT 5", (err) => {
        // Ignore error if column already exists
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

// JWT Authentication Middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Access token required' });
  }
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Token format must be Bearer <token>' });
  }
  const token = parts[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// ============== AUTH ROUTES ==============

// Vendor Registration
app.post('/api/auth/register', async (req, res) => {
  const { name, category, phone, location, description, facebook, password, email } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO vendors (name, category, phone, location, description, facebook, password, email, loyalty_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.run(sql, [name, category, phone, location, description, facebook, hashedPassword, email, req.body.loyalty_rate || 1.0], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const token = jwt.sign({ id: this.lastID, role: 'vendor', email }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ id: this.lastID, message: 'Vendor registered successfully', token });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Vendor Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM vendors WHERE email = ?', [email], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid email or password' });
    try {
      const isMatch = await bcrypt.compare(password, row.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });
      const token = jwt.sign({ id: row.id, role: 'vendor', email: row.email }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ message: 'Login successful', vendor: row, token });
    } catch (compareErr) {
      res.status(500).json({ error: compareErr.message });
    }
  });
});

// Social Authentication (Hardened social token verification)
app.post("/api/auth/social", async (req, res) => {
  const { provider, token, role } = req.body;

  if (!provider) {
    return res.status(400).json({ error: "Missing required social auth parameters" });
  }

  let id, email, name;

  if (provider === 'google') {
    if (!token) {
      return res.status(400).json({ error: "Missing required Google token" });
    }
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      id = payload['sub'];
      email = payload['email'];
      name = payload['name'];
    } catch (err) {
      return res.status(401).json({ error: "Invalid Google token" });
    }
  } else if (provider === 'facebook') {
    return res.status(400).json({ error: "Facebook authentication is not supported. Please use Google authentication." });
  } else {
    return res.status(400).json({ error: "Unsupported social provider" });
  }

  const table = role === 'vendor' ? 'vendors' : 'users';

  // Check if a social account already exists with this ID and provider
  db.get(`SELECT * FROM ${table} WHERE social_provider = ? AND social_id = ?`, [provider, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      const jwtToken = jwt.sign({ id: row.id, role: role, email: row.email }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ message: "Login successful", [role === 'vendor' ? 'vendor' : 'user']: row, token: jwtToken });
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
            const jwtToken = jwt.sign({ id: existingRow.id, role: role, email: existingRow.email }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ message: "Social account linked", [role === 'vendor' ? 'vendor' : 'user']: existingRow, token: jwtToken });
          });
        } else {
          // Create new record
          if (role === 'vendor') {
             const sql = "INSERT INTO vendors (name, email, social_provider, social_id, category, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id, 'General', 'Garden City SME', ''], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               const vendor = { id: this.lastID, name, email, social_provider: provider, social_id: id };
               const jwtToken = jwt.sign({ id: this.lastID, role: role, email }, JWT_SECRET, { expiresIn: '24h' });
               res.json({ message: "Social vendor account created", vendor, token: jwtToken });
             });
          } else {
             const sql = "INSERT INTO users (name, email, social_provider, social_id) VALUES (?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               const user = { id: this.lastID, name, email, social_provider: provider, social_id: id };
               const jwtToken = jwt.sign({ id: this.lastID, role: role, email }, JWT_SECRET, { expiresIn: '24h' });
               res.json({ message: "Social customer account created", user, token: jwtToken });
             });
          }
        }
      });
    }
  });
});

app.post("/api/auth/customer/register", async (req, res) => {
  const { name, email, phone, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)";
    db.run(sql, [name, email, phone, hashedPassword], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const token = jwt.sign({ id: this.lastID, role: 'customer', email }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ id: this.lastID, message: "Customer registered successfully", token });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Login
app.post("/api/auth/customer/login", (req, res) => {
  const { email, password } = req.body;
  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: "Invalid email or password" });
    try {
      const isMatch = await bcrypt.compare(password, row.password);
      if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });
      const token = jwt.sign({ id: row.id, role: 'customer', email: row.email }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ message: "Login successful", user: row, token });
    } catch (compareErr) {
      res.status(500).json({ error: compareErr.message });
    }
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

// Get vendor by ID with data minimization (safe columns only)
app.get('/api/vendors/:id', (req, res) => {
  db.get('SELECT id, name, loyalty_rate, category, phone, location, description, facebook, email, created_at, updated_at FROM vendors WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });
    res.json(row);
  });
});

// Get vendor me by ID (Protected & ownership verified)
app.get('/api/vendors/me/:id', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only read your own vendor profile' });
  }
  db.get('SELECT id, name, loyalty_rate, category, phone, location, description, facebook, email, created_at, updated_at FROM vendors WHERE id = ?', [targetId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });
    res.json(row);
  });
});

// Update vendor (Protected & ownership verified)
app.put('/api/vendors/:id', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own vendor profile' });
  }
  const { name, category, phone, location, description, facebook, email } = req.body;
  const sql = 'UPDATE vendors SET name=?, category=?, phone=?, location=?, description=?, facebook=?, email=?, updated_at=CURRENT_TIMESTAMP WHERE id=?';
  db.run(sql, [name, category, phone, location, description, facebook, email, targetId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Vendor updated successfully', changes: this.changes });
  });
});

// Delete vendor (Protected & ownership verified)
app.delete('/api/vendors/:id', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own vendor profile' });
  }
  db.run('DELETE FROM vendors WHERE id = ?', [targetId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Vendor deleted successfully', changes: this.changes });
  });
});

// ============== PRODUCT ROUTES ==============

// Create product (Protected & ownership verified)
app.post('/api/products', authMiddleware, (req, res) => {
  const { vendor_id, name, category, price, stock, description, status } = req.body;
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(vendor_id))) {
    return res.status(403).json({ error: 'Forbidden: You cannot create products for another vendor' });
  }
  const sql = 'INSERT INTO products (vendor_id, name, category, price, stock, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, name, category, price, stock || 0, description, status || 'active'], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Product created successfully' });
  });
});

// Upload product images (Protected & ownership verified)
app.post('/api/products/:id/images', authMiddleware, upload.array('images', 5), (req, res) => {
  const productId = req.params.id;

  const proceedWithUpload = () => {
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
  };

  if (req.user.role === 'admin') {
    proceedWithUpload();
  } else if (req.user.role === 'vendor') {
    db.get('SELECT vendor_id FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Product not found' });
      if (row.vendor_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: You do not own this product' });
      }
      proceedWithUpload();
    });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
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

// Delete product (Protected & ownership verified)
app.delete('/api/products/:id', authMiddleware, (req, res) => {
  const productId = req.params.id;
  if (req.user.role === 'admin') {
    db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Product deleted successfully', changes: this.changes });
    });
  } else if (req.user.role === 'vendor') {
    db.get('SELECT vendor_id FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Product not found' });
      if (row.vendor_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: You do not own this product' });
      }
      db.run('DELETE FROM products WHERE id = ?', [productId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Product deleted successfully', changes: this.changes });
      });
    });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// ============== SERVICE ROUTES ==============

// Create service (Protected & ownership verified)
app.post('/api/services', authMiddleware, upload.single('image'), (req, res) => {
  const { vendor_id, name, category, price, duration, description } = req.body;
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(vendor_id))) {
    return res.status(403).json({ error: 'Forbidden: You cannot create services for another vendor' });
  }
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

// Delete service (Protected & ownership verified)
app.delete('/api/services/:id', authMiddleware, (req, res) => {
  const serviceId = req.params.id;
  if (req.user.role === 'admin') {
    db.run('DELETE FROM services WHERE id = ?', [serviceId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Service deleted successfully', changes: this.changes });
    });
  } else if (req.user.role === 'vendor') {
    db.get('SELECT vendor_id FROM services WHERE id = ?', [serviceId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Service not found' });
      if (row.vendor_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: You do not own this service' });
      }
      db.run('DELETE FROM services WHERE id = ?', [serviceId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Service deleted successfully', changes: this.changes });
      });
    });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
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

// Get orders by vendor (Protected & tenant-scoped)
app.get('/api/vendors/:vendorId/orders', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(req.params.vendorId))) {
    return res.status(403).json({ error: 'Forbidden: You can only read your own orders' });
  }
  const vendorId = req.user.role === 'admin' ? parseInt(req.params.vendorId) : req.user.id;
  db.all('SELECT * FROM orders WHERE vendor_id = ? ORDER BY created_at DESC', [vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Update order status

// Update order status and trigger inventory/accounting automation
app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err || !order) return res.status(500).json({ error: 'Order not found' });

    db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      if (status === 'completed') {
        const items = JSON.parse(order.items);
        items.forEach(item => {
          // Decrement stock
          db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [item.quantity, item.id]);

          // Check stock threshold
          db.get('SELECT name, stock, stock_threshold FROM products WHERE id = ?', [item.id], (err, prod) => {
            if (prod && prod.stock <= prod.stock_threshold) {
              console.log(`ALERT: Stock for ${prod.name} is low (${prod.stock} left)`);
              // In real app, send email/SMS. Here we just log.
            }
          });
        });

        // Automatically create accounting entry if not already done via payment sync
        const date = new Date().toISOString().split('T')[0];
        const desc = `Completed Order #${orderId} for ${order.customer_name}`;
        const gst = order.total_price * 0.1; // 10% GST
        const swt = order.total_price * 0.02; // 2% SWT Simulation

        // Check if already reconciled to avoid duplicate
        db.get('SELECT id FROM accounting_transactions WHERE description LIKE ?', [`%Order #${orderId}%`], (err, trans) => {
           if (!trans) {
             db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt) VALUES (?, ?, ?, ?, ?, ?, ?)',
               [order.vendor_id, date, 'sale', order.total_price, desc, gst, swt]);
           }
        });
      }

             // Loyalty Points Logic
             db.get('SELECT loyalty_rate FROM vendors WHERE id = ?', [order.vendor_id], (err, vendor) => {
               const rate = vendor ? vendor.loyalty_rate : 1.0;
               const pointsEarned = Math.floor(order.total_price * rate);

               db.get('SELECT id FROM customer_crm WHERE vendor_id = ? AND phone_number = ?', [order.vendor_id, order.customer_phone], (err, customer) => {
                 if (!customer) {
                   db.run('INSERT INTO customer_crm (vendor_id, phone_number, full_name, total_spent) VALUES (?, ?, ?, ?)',
                     [order.vendor_id, order.customer_phone, order.customer_name, order.total_price], function(err) {
                       const customerId = this.lastID;
                       db.run('INSERT INTO loyalty_points (customer_id, vendor_id, current_points, total_earned_points) VALUES (?, ?, ?, ?)',
                         [customerId, order.vendor_id, pointsEarned, pointsEarned]);
                     });
                 } else {
                   db.run('UPDATE customer_crm SET total_spent = total_spent + ?, last_visit = CURRENT_TIMESTAMP WHERE id = ?',
                     [order.total_price, customer.id]);
                   db.get('SELECT id FROM loyalty_points WHERE customer_id = ? AND vendor_id = ?', [customer.id, order.vendor_id], (err, loyalty) => {
                     if (!loyalty) {
                       db.run('INSERT INTO loyalty_points (customer_id, vendor_id, current_points, total_earned_points) VALUES (?, ?, ?, ?)',
                         [customer.id, order.vendor_id, pointsEarned, pointsEarned]);
                     } else {
                       db.run('UPDATE loyalty_points SET current_points = current_points + ?, total_earned_points = total_earned_points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                         [pointsEarned, pointsEarned, loyalty.id]);
                     }
                   });
                 }
               });
             });

      res.json({ message: 'Order status updated successfully' });
    });
  });
});

// ============== ADMIN ROUTES ==============

// Admin Authentication and Protection Middleware
app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login' || req.originalUrl === '/api/admin/login') {
    return next();
  }
  authMiddleware(req, res, () => {
    if (req.user && req.user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
  });
});

// Admin Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(401).json({ error: 'Invalid admin credentials' });
    try {
      const isMatch = await bcrypt.compare(password, row.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid admin credentials' });
      const token = jwt.sign({ id: row.id, role: 'admin', username: row.username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ message: 'Admin logged in', admin: { id: row.id, username: row.username }, token });
    } catch (compareErr) {
      res.status(500).json({ error: compareErr.message });
    }
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


// ============== ACCOUNTING ROUTES ==============

// Get accounting transactions for a vendor (Protected & tenant-scoped)
app.get('/api/vendors/:vendorId/accounting', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(req.params.vendorId))) {
    return res.status(403).json({ error: 'Forbidden: You can only read your own accounting transactions' });
  }
  const vendorId = req.user.role === 'admin' ? parseInt(req.params.vendorId) : req.user.id;
  db.all('SELECT * FROM accounting_transactions WHERE vendor_id = ? ORDER BY date DESC', [vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create accounting transaction (Protected & tenant-scoped)
app.post('/api/accounting', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'vendor') {
    return res.status(403).json({ error: 'Forbidden: Vendors only' });
  }
  const { date, type, amount, description, gst, swt } = req.body;
  // Pull vendor_id from JWT token, not from body (unless admin overrides)
  const vendorId = req.user.role === 'admin' ? parseInt(req.body.vendor_id) : req.user.id;
  const sql = 'INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendorId, date, type, amount, description, gst || 0, swt || 0], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Transaction recorded successfully' });
  });
});

// Delete accounting transaction (Protected & ownership verified)
app.delete('/api/accounting/:id', authMiddleware, (req, res) => {
  const transId = req.params.id;
  if (req.user.role === 'admin') {
    db.run('DELETE FROM accounting_transactions WHERE id = ?', [transId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Transaction deleted successfully' });
    });
  } else if (req.user.role === 'vendor') {
    db.get('SELECT vendor_id FROM accounting_transactions WHERE id = ?', [transId], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Transaction not found' });
      if (row.vendor_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden: You do not own this transaction' });
      }
      db.run('DELETE FROM accounting_transactions WHERE id = ?', [transId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Transaction deleted successfully' });
      });
    });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// ============== PAYMENTS ROUTES ==============

// Initiate payment (Simulation)
app.post('/api/payments/initiate', (req, res) => {
  const { vendor_id, order_id, amount, method } = req.body;
  const transaction_ref = 'TXN-' + Date.now();
  const sql = 'INSERT INTO payments (vendor_id, order_id, amount, method, status, transaction_ref) VALUES (?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, order_id, amount, method, 'pending', transaction_ref], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    // Simulate successful mobile money response
    res.json({
      id: this.lastID,
      status: 'pending',
      message: 'Payment initiated. Please confirm on your mobile device.',
      transaction_ref
    });

    // Auto-complete after 2 seconds for simulation
    setTimeout(() => {
      db.run('UPDATE payments SET status = "completed" WHERE id = ?', [this.lastID]);

      // Auto-reconcile to accounting
      const date = new Date().toISOString().split('T')[0];
      const desc = `Payment for Order #${order_id} (Ref: ${transaction_ref})`;
      const gst = amount * 0.1; // 10% GST
      db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst) VALUES (?, ?, ?, ?, ?, ?)',
        [vendor_id, date, 'sale', amount, desc, gst]);
    }, 2000);
  });
});

// ============== BOT ROUTES ==============

app.post('/api/bot/command', (req, res) => {
  const { vendor_id, text } = req.body;
  if (!text) return res.status(400).json({ response: 'Please provide some text.' });
  const cmd = text.toLowerCase();

  if (cmd.startsWith('log sale')) {
    const amountStr = cmd.replace('log sale', '').trim();
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return res.status(400).json({ response: 'Sorry, I could not understand that amount. Use: log sale [amount]' });

    const date = new Date().toISOString().split('T')[0];
    db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst) VALUES (?, ?, ?, ?, ?, ?)',
      [vendor_id, date, 'sale', amount, 'Bot Entry', amount * 0.1], function(err) {
        if (err) return res.json({ response: 'Error logging sale: ' + err.message });
        res.json({ response: `Logged sale of K${amount.toFixed(2)} successfully!` });
      });
  } else if (cmd.includes('balance')) {
    db.all('SELECT type, amount FROM accounting_transactions WHERE vendor_id = ?', [vendor_id], (err, rows) => {
      if (err) return res.json({ response: 'Error fetching balance.' });
      const sales = rows.filter(r => r.type === 'sale').reduce((s, r) => s + r.amount, 0);
      const expenses = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      res.json({ response: `Your total sales: K${sales.toFixed(2)}\nTotal expenses: K${expenses.toFixed(2)}\nCurrent Profit: K${(sales - expenses).toFixed(2)}` });
    });
  } else {
    res.json({ response: 'Hello! I am your Garden City SME Assistant. You can say "log sale 50" or "show balance".' });
  }
});


// ============== LOYALTY & CRM ROUTES ==============

// Get CRM customers for a vendor (Protected & tenant-scoped)
app.get('/api/vendors/:vendorId/crm', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(req.params.vendorId))) {
    return res.status(403).json({ error: 'Forbidden: You can only read your own CRM data' });
  }
  const vendorId = req.user.role === 'admin' ? parseInt(req.params.vendorId) : req.user.id;
  const sql = `
    SELECT c.*, l.current_points, l.total_earned_points
    FROM customer_crm c
    LEFT JOIN loyalty_points l ON c.id = l.customer_id AND c.vendor_id = l.vendor_id
    WHERE c.vendor_id = ?
    ORDER BY c.last_visit DESC
  `;
  db.all(sql, [vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get loyalty points for a customer phone number at a specific vendor
app.get('/api/vendors/:vendorId/loyalty/:phone', (req, res) => {
  const sql = `
    SELECT l.current_points, l.total_earned_points, c.full_name
    FROM loyalty_points l
    JOIN customer_crm c ON l.customer_id = c.id
    WHERE l.vendor_id = ? AND c.phone_number = ?
  `;
  db.get(sql, [req.params.vendorId, req.params.phone], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || { current_points: 0, total_earned_points: 0 });
  });
});

// Mock endpoint for sending promotions (Protected & tenant-scoped)
app.post('/api/vendors/:vendorId/promotions', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(req.params.vendorId))) {
    return res.status(403).json({ error: 'Forbidden: You can only send promotions for your own store' });
  }
  const vendorId = req.user.role === 'admin' ? parseInt(req.params.vendorId) : req.user.id;
  const { customerIds, message, channel } = req.body;
  // In a real app, this would integrate with Twilio or WhatsApp Business API
  console.log(`Sending ${channel} promotion to ${customerIds.length} customers from vendor ${vendorId}: ${message}`);
  res.json({ message: `Promotion sent successfully to ${customerIds.length} customers via ${channel}!` });
});

// Start server
app.listen(PORT, () => {
  console.log(`Garden City SME API running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close(() => {
    console.log('Database connection closed');
    process.exit(0);
  });
});
