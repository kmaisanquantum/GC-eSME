const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Vercel compatibility: use /tmp for writable directories and database
const IS_VERCEL = process.env.VERCEL === '1';
const UPLOADS_DIR = IS_VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
const DATABASE_PATH = IS_VERCEL ? path.join('/tmp', 'garden_city.db') : path.join(__dirname, 'garden_city.db');

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static('public'));

// Create uploads directory
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Error creating uploads directory:', err);
}

// Database setup
const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to Garden City SQLite database at', DATABASE_PATH);
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
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
      email TEXT,
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

  console.log('Database tables initialized');
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ============== VENDOR ROUTES ==============

// Create vendor
app.post('/api/vendors', (req, res) => {
  const { name, category, phone, location, description, facebook, email } = req.body;
  
  const sql = `INSERT INTO vendors (name, category, phone, location, description, facebook, email) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [name, category, phone, location, description, facebook, email], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Vendor created successfully' });
  });
});

// Get all vendors
app.get('/api/vendors', (req, res) => {
  db.all('SELECT * FROM vendors ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get vendor by ID
app.get('/api/vendors/:id', (req, res) => {
  db.get('SELECT * FROM vendors WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    res.json(row);
  });
});

// Update vendor
app.put('/api/vendors/:id', (req, res) => {
  const { name, category, phone, location, description, facebook, email } = req.body;
  
  const sql = `UPDATE vendors 
               SET name=?, category=?, phone=?, location=?, description=?, facebook=?, email=?, updated_at=CURRENT_TIMESTAMP 
               WHERE id=?`;
  
  db.run(sql, [name, category, phone, location, description, facebook, email, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Vendor updated successfully', changes: this.changes });
  });
});

// Delete vendor
app.delete('/api/vendors/:id', (req, res) => {
  db.run('DELETE FROM vendors WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Vendor deleted successfully', changes: this.changes });
  });
});

// ============== PRODUCT ROUTES ==============

// Create product
app.post('/api/products', (req, res) => {
  const { vendor_id, name, category, price, stock, description, status } = req.body;
  
  const sql = `INSERT INTO products (vendor_id, name, category, price, stock, description, status) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [vendor_id, name, category, price, stock || 0, description, status || 'active'], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Product created successfully' });
  });
});

// Upload product images
app.post('/api/products/:id/images', upload.array('images', 5), (req, res) => {
  const productId = req.params.id;
  const files = req.files;
  
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  
  const sql = `INSERT INTO product_images (product_id, image_url, is_primary) VALUES (?, ?, ?)`;
  let completed = 0;
  
  files.forEach((file, index) => {
    const imageUrl = `/uploads/${file.filename}`;
    const isPrimary = index === 0 ? 1 : 0;
    
    db.run(sql, [productId, imageUrl, isPrimary], (err) => {
      if (err) {
        console.error('Error saving image:', err);
      }
      completed++;
      
      if (completed === files.length) {
        res.json({ message: 'Images uploaded successfully', count: files.length });
      }
    });
  });
});

// Get all products with images
app.get('/api/products', (req, res) => {
  const sql = `
    SELECT p.*, 
           GROUP_CONCAT(pi.image_url) as images,
           v.name as vendor_name,
           v.phone as vendor_phone,
           v.location as vendor_location
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    LEFT JOIN vendors v ON p.vendor_id = v.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Parse images string into array
    const products = rows.map(row => ({
      ...row,
      images: row.images ? row.images.split(',') : []
    }));
    
    res.json(products);
  });
});

// Get products by vendor
app.get('/api/vendors/:vendorId/products', (req, res) => {
  const sql = `
    SELECT p.*, GROUP_CONCAT(pi.image_url) as images
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.vendor_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `;
  
  db.all(sql, [req.params.vendorId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const products = rows.map(row => ({
      ...row,
      images: row.images ? row.images.split(',') : []
    }));
    
    res.json(products);
  });
});

// Get product by ID
app.get('/api/products/:id', (req, res) => {
  const sql = `
    SELECT p.*, GROUP_CONCAT(pi.image_url) as images
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id
    WHERE p.id = ?
    GROUP BY p.id
  `;
  
  db.get(sql, [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const product = {
      ...row,
      images: row.images ? row.images.split(',') : []
    };
    
    res.json(product);
  });
});

// Update product
app.put('/api/products/:id', (req, res) => {
  const { name, category, price, stock, description, status } = req.body;
  
  const sql = `UPDATE products 
               SET name=?, category=?, price=?, stock=?, description=?, status=?, updated_at=CURRENT_TIMESTAMP 
               WHERE id=?`;
  
  db.run(sql, [name, category, price, stock, description, status, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Product updated successfully', changes: this.changes });
  });
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Product deleted successfully', changes: this.changes });
  });
});

// ============== SERVICE ROUTES ==============

// Create service
app.post('/api/services', upload.single('image'), (req, res) => {
  const { vendor_id, name, category, price, duration, description } = req.body;
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
  
  const sql = `INSERT INTO services (vendor_id, name, category, price, duration, description, image_url) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [vendor_id, name, category, price, duration || 0, description, imageUrl], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, message: 'Service created successfully' });
  });
});

// Get all services
app.get('/api/services', (req, res) => {
  const sql = `
    SELECT s.*,
           v.name as vendor_name,
           v.phone as vendor_phone,
           v.location as vendor_location
    FROM services s
    LEFT JOIN vendors v ON s.vendor_id = v.id
    ORDER BY s.created_at DESC
  `;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Get services by vendor
app.get('/api/vendors/:vendorId/services', (req, res) => {
  db.all('SELECT * FROM services WHERE vendor_id = ? ORDER BY created_at DESC', [req.params.vendorId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Delete service
app.delete('/api/services/:id', (req, res) => {
  db.run('DELETE FROM services WHERE id = ?', [req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Service deleted successfully', changes: this.changes });
  });
});

// ============== STATS ROUTES ==============

// Get dashboard stats
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
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Garden City eSME API running on http://localhost:${PORT}`);
    console.log(`API Documentation: http://localhost:${PORT}/api`);
  });
}

module.exports = app;

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    }
    console.log('Database connection closed');
    process.exit(0);
  });
});
