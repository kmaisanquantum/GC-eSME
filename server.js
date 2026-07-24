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
const providerAdapter = require('./payments/providerAdapter');
const whatsappAdapter = require('./messaging/whatsappAdapter');

const app = express();
const PORT = process.env.PORT || 3001;

const GST_RATE = parseFloat(process.env.GST_RATE) || 0.1;
const SWT_RATE = parseFloat(process.env.SWT_RATE) || 0.02;

// Rate limiting configuration for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, please try again shortly.' });
  }
});

// Dynamic restricted CORS origin configuration
const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const defaultOrigins = [
  'https://gc.dspng.tech',
  'https://unity.dspng.tech',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002'
];
const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultOrigins;

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

// Tenant Resolver Middleware
function tenantResolver(req, res, next) {
  const host = req.get('host') || '';
  const fallbackParam = req.query.tenant || req.get('X-Tenant') || req.get('x-tenant');

  if (fallbackParam) {
    const query = 'SELECT id FROM tenants WHERE slug = ? OR id = ?';
    db.get(query, [fallbackParam, fallbackParam], (err, row) => {
      if (row) {
        req.tenantId = row.id;
        return next();
      }
      resolveByHost();
    });
  } else {
    resolveByHost();
  }

  function resolveByHost() {
    const hostname = host.split(':')[0];
    db.get('SELECT id FROM tenants WHERE domain = ? OR slug = ?', [hostname, hostname], (err, row) => {
      if (row) {
        req.tenantId = row.id;
        return next();
      }
      req.tenantId = 1; // Default fallback to gc
      next();
    });
  }
}

app.use('/api', tenantResolver);

// GET /api/tenant/branding (Public, tenant-resolved)
app.get('/api/tenant/branding', (req, res) => {
  const tenantId = req.tenantId || 1;
  const gcDefaultBranding = {
    primaryColor: '#ca8a04',
    primaryHover: '#a16207',
    themeColor: '#ca8a04',
    appName: 'Garden City SME'
  };

  db.get('SELECT id, slug, name, domain, branding_json FROM tenants WHERE id = ?', [tenantId], (err, row) => {
    if (err || !row) {
      return res.json({
        id: 1,
        slug: 'gc',
        name: 'Garden City',
        domain: 'gc.dspng.tech',
        branding: gcDefaultBranding
      });
    }

    let branding = {};
    try {
      if (row.branding_json) {
        branding = JSON.parse(row.branding_json);
      } else {
        branding = gcDefaultBranding;
      }
    } catch (e) {
      branding = gcDefaultBranding;
    }

    res.json({
      id: row.id,
      slug: row.slug,
      name: row.name,
      domain: row.domain,
      branding: branding
    });
  });
});

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

function slugify(text) {
  if (!text) return 'business';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
}

function randomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return suffix;
}

function getUniqueSlug(name, tenantId, callback) {
  const baseSlug = slugify(name);
  const suffix = randomSuffix();
  const slug = `${baseSlug}-${suffix}`;

  // Check uniqueness within the tenant
  db.get('SELECT id FROM vendors WHERE tenant_id = ? AND slug = ?', [tenantId, slug], (err, row) => {
    if (err) {
      return callback(err);
    }
    if (row) {
      // Collision! Try again recursively.
      return getUniqueSlug(name, tenantId, callback);
    }
    // Unique slug found
    callback(null, slug);
  });
}

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Tenants table
    db.run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE,
        name TEXT,
        domain TEXT,
        branding_json TEXT,
        config_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed default tenants with branding info
    const gcBranding = JSON.stringify({
      primaryColor: '#ca8a04',
      primaryHover: '#a16207',
      themeColor: '#ca8a04',
      appName: 'Garden City SME'
    });
    const unityBranding = JSON.stringify({
      primaryColor: '#0f766e',
      primaryHover: '#0d9488',
      themeColor: '#0f766e',
      appName: 'Unity Mall SME Centre'
    });
    db.run(`INSERT OR IGNORE INTO tenants (id, slug, name, domain, branding_json) VALUES (1, 'gc', 'Garden City', 'gc.dspng.tech', ?)`, [gcBranding]);
    db.run(`INSERT OR IGNORE INTO tenants (id, slug, name, domain, branding_json) VALUES (2, 'unity', 'Unity Mall', 'unity.dspng.tech', ?)`, [unityBranding]);

    // Idempotent UPDATEs so it doesn't overwrite later edits, only targeting NULL or empty values
    db.run(`UPDATE tenants SET branding_json = ? WHERE id = 1 AND branding_json IS NULL`, [gcBranding]);
    db.run(`UPDATE tenants SET branding_json = ? WHERE id = 2 AND branding_json IS NULL`, [unityBranding]);

    // Vendors table
    db.run(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
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
        owner_name TEXT,
        slug TEXT,
        logo_url TEXT,
        cover_url TEXT,
        opening_hours TEXT,
        landmark TEXT,
        floor_section TEXT,
        status TEXT DEFAULT 'draft',
        onboarding_step INTEGER DEFAULT 0,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      )
    `);

    // Products table
    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
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
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        duration INTEGER DEFAULT 0,
        description TEXT,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      )
    `);

    // Orders table
    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        items TEXT NOT NULL,
        total_price REAL NOT NULL,
        cogs REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
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
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        phone_number TEXT NOT NULL,
        full_name TEXT,
        total_spent REAL DEFAULT 0,
        last_visit DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendor_id, phone_number),
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
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
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        category TEXT,
        gst REAL DEFAULT 0,
        swt REAL DEFAULT 0,
        order_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      )
    `);

    // Payments table
    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        vendor_id INTEGER NOT NULL,
        order_id INTEGER,
        amount REAL NOT NULL,
        method TEXT,
        status TEXT DEFAULT 'pending',
        transaction_ref TEXT,
        provider TEXT,
        provider_txn_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
      )
    `);

    // Migrations for payments table columns if missing
    db.run("ALTER TABLE payments ADD COLUMN provider TEXT", (err) => {
      // Ignore if column already exists
    });
    db.run("ALTER TABLE payments ADD COLUMN provider_txn_id TEXT", (err) => {
      // Ignore if column already exists
    });

    // Guarded migrations for tenant_id in existing tables
    const tablesToAlter = [
      'vendors', 'products', 'services', 'orders',
      'customer_crm', 'accounting_transactions', 'payments'
    ];
    tablesToAlter.forEach((table) => {
      db.run(`ALTER TABLE ${table} ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL`, (err) => {
        // Run update query regardless, to backfill any NULL tenant_ids to Garden City tenant (ID 1)
        db.run(`UPDATE ${table} SET tenant_id = 1 WHERE tenant_id IS NULL`);
      });
    });

    // Migrations for profit/COGS and expense category columns
    db.run("ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0", (err) => {
      // Ignore if column already exists
    });

    // Migrations for vendors onboarding columns
    const vendorColumnsToAlter = [
      { name: 'owner_name', type: 'TEXT' },
      { name: 'slug', type: 'TEXT' },
      { name: 'logo_url', type: 'TEXT' },
      { name: 'cover_url', type: 'TEXT' },
      { name: 'opening_hours', type: 'TEXT' },
      { name: 'landmark', type: 'TEXT' },
      { name: 'floor_section', type: 'TEXT' },
      { name: 'status', type: 'TEXT DEFAULT \'draft\'' },
      { name: 'onboarding_step', type: 'INTEGER DEFAULT 0' },
      { name: 'published_at', type: 'DATETIME' }
    ];
    vendorColumnsToAlter.forEach((col) => {
      db.run(`ALTER TABLE vendors ADD COLUMN ${col.name} ${col.type}`, (err) => {
        // Ignore if column already exists
      });
    });

    // Idempotent backfill of status and onboarding_step for any pre-existing vendors
    db.run(`UPDATE vendors SET status = 'draft' WHERE status IS NULL`);
    db.run(`UPDATE vendors SET onboarding_step = 0 WHERE onboarding_step IS NULL`);
    db.run("ALTER TABLE orders ADD COLUMN cogs REAL DEFAULT 0", (err) => {
      // Ignore if column already exists
    });
    db.run("ALTER TABLE accounting_transactions ADD COLUMN category TEXT", (err) => {
      // Ignore if column already exists
    });
    db.run("ALTER TABLE accounting_transactions ADD COLUMN order_id INTEGER", (err) => {
      // Ignore if column already exists
    });

    // Promotion logs table
    db.run(`
      CREATE TABLE IF NOT EXISTS promotion_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    `);

    // Add stock_threshold to products if not exists
    db.run("ALTER TABLE products ADD COLUMN stock_threshold INTEGER DEFAULT 5", (err) => {
        // Ignore error if column already exists
    });

    // Backfill slugs for any existing vendors lacking one
    db.all(`SELECT id, name, tenant_id FROM vendors WHERE slug IS NULL OR slug = ''`, [], (err, rows) => {
      if (err) {
        console.error('Error querying vendors for slug backfill:', err);
        return;
      }
      if (rows && rows.length > 0) {
        console.log(`Backfilling slugs for ${rows.length} vendors...`);
        const updateSlug = (index) => {
          if (index >= rows.length) {
            console.log('Slug backfill complete.');
            return;
          }
          const row = rows[index];
          getUniqueSlug(row.name, row.tenant_id || 1, (err, slug) => {
            if (err) {
              console.error(`Error generating slug for vendor ID ${row.id}:`, err);
              updateSlug(index + 1);
              return;
            }
            db.run(`UPDATE vendors SET slug = ? WHERE id = ?`, [slug, row.id], (updateErr) => {
              if (updateErr) {
                console.error(`Error updating slug for vendor ID ${row.id}:`, updateErr);
              }
              updateSlug(index + 1);
            });
          });
        };
        updateSlug(0);
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
    // A non-admin user/vendor token's tenant_id must match the resolved tenantId
    if (req.user.role !== 'admin' && req.user.tenant_id && parseInt(req.user.tenant_id) !== parseInt(req.tenantId)) {
      return res.status(403).json({ error: 'Forbidden: Tenant mismatch' });
    }
    next();
  });
}

// ============== AUTH ROUTES ==============

// Vendor Registration
app.post('/api/auth/register', async (req, res) => {
  const { name, category, phone, location, description, facebook, password, email } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const tenantId = req.tenantId || 1;
    getUniqueSlug(name, tenantId, (err, slug) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const sql = 'INSERT INTO vendors (name, category, phone, location, description, facebook, password, email, loyalty_rate, tenant_id, slug, status, onboarding_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
      db.run(sql, [name, category, phone, location, description, facebook, hashedPassword, email, req.body.loyalty_rate || 1.0, tenantId, slug, 'draft', 0], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        const token = jwt.sign({ id: this.lastID, role: 'vendor', email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ id: this.lastID, message: 'Vendor registered successfully', token });
      });
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
      const token = jwt.sign({ id: row.id, role: 'vendor', email: row.email, tenant_id: row.tenant_id }, JWT_SECRET, { expiresIn: '24h' });
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
      const jwtToken = jwt.sign({ id: row.id, role: role, email: row.email, tenant_id: row.tenant_id }, JWT_SECRET, { expiresIn: '24h' });
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
            const jwtToken = jwt.sign({ id: existingRow.id, role: role, email: existingRow.email, tenant_id: existingRow.tenant_id }, JWT_SECRET, { expiresIn: '24h' });
            res.json({ message: "Social account linked", [role === 'vendor' ? 'vendor' : 'user']: existingRow, token: jwtToken });
          });
        } else {
          // Create new record
          const tenantId = req.tenantId || 1;
          if (role === 'vendor') {
             getUniqueSlug(name, tenantId, (err, slug) => {
               if (err) return res.status(500).json({ error: err.message });
               const sql = "INSERT INTO vendors (name, email, social_provider, social_id, category, location, phone, tenant_id, slug, status, onboarding_step) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
               db.run(sql, [name, email, provider, id, 'General', 'Garden City SME', '', tenantId, slug, 'draft', 0], function(err) {
                 if (err) return res.status(500).json({ error: err.message });
                 const vendor = { id: this.lastID, name, email, social_provider: provider, social_id: id, tenant_id: tenantId, slug, status: 'draft', onboarding_step: 0 };
                 const jwtToken = jwt.sign({ id: this.lastID, role: role, email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' });
                 res.json({ message: "Social vendor account created", vendor, token: jwtToken });
               });
             });
          } else {
             const sql = "INSERT INTO users (name, email, social_provider, social_id) VALUES (?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               const user = { id: this.lastID, name, email, social_provider: provider, social_id: id };
               const jwtToken = jwt.sign({ id: this.lastID, role: role, email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' });
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
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: "Missing required fields (name, email, phone, password)" });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)";
    db.run(sql, [name, email, phone, hashedPassword], function(err) {
      if (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: "Email address is already registered" });
        }
        return res.status(500).json({ error: err.message });
      }
      const tenantId = req.tenantId || 1;
      const token = jwt.sign({ id: this.lastID, role: 'customer', email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' });
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
      const tenantId = req.tenantId || 1;
      const token = jwt.sign({ id: row.id, role: 'customer', email: row.email, tenant_id: tenantId }, JWT_SECRET, { expiresIn: '24h' });
      res.json({ message: "Login successful", user: row, token });
    } catch (compareErr) {
      res.status(500).json({ error: compareErr.message });
    }
  });
});

// ============== PUBLIC DISCOVERY ROUTES ==============

// GET /api/businesses (Public discovery list)
app.get('/api/businesses', (req, res) => {
  const tenantId = req.tenantId || 1;
  const sql = `
    SELECT
      v.id,
      v.name,
      v.slug,
      v.logo_url,
      v.category,
      v.location,
      v.description,
      (SELECT COUNT(*) FROM products p WHERE p.vendor_id = v.id AND p.tenant_id = ?) as product_count,
      (SELECT COUNT(*) FROM services s WHERE s.vendor_id = v.id AND s.tenant_id = ?) as service_count
    FROM vendors v
    WHERE v.status = 'published' AND v.tenant_id = ?
    ORDER BY v.name ASC
  `;
  db.all(sql, [tenantId, tenantId, tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET /api/businesses/:slug (Single public business profile)
app.get('/api/businesses/:slug', (req, res) => {
  const tenantId = req.tenantId || 1;
  const slug = req.params.slug;

  const vendorSql = `
    SELECT id, name, slug, logo_url, cover_url, category, phone, email, facebook, location, landmark, floor_section, opening_hours, description
    FROM vendors
    WHERE slug = ? AND tenant_id = ? AND status = 'published'
  `;

  db.get(vendorSql, [slug, tenantId], (err, vendor) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!vendor) return res.status(404).json({ error: 'Business not found or is not published' });

    // Fetch products
    const productsSql = `
      SELECT p.*, GROUP_CONCAT(pi.image_url) as images
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE p.vendor_id = ? AND p.tenant_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    db.all(productsSql, [vendor.id, tenantId], (err, productRows) => {
      if (err) return res.status(500).json({ error: err.message });

      const products = productRows.map(row => ({
        ...row,
        images: row.images ? row.images.split(',') : []
      }));

      // Fetch services
      const servicesSql = `
        SELECT *
        FROM services
        WHERE vendor_id = ? AND tenant_id = ?
        ORDER BY created_at DESC
      `;
      db.all(servicesSql, [vendor.id, tenantId], (err, services) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          business: vendor,
          products: products,
          services: services
        });
      });
    });
  });
});

// ============== VENDOR ROUTES ==============

// Get all vendors
app.get('/api/vendors', (req, res) => {
  db.all('SELECT id, name, category, phone, location, description, facebook, email, created_at FROM vendors WHERE tenant_id = ?', [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get vendor by ID with data minimization (safe columns only)
app.get('/api/vendors/:id', (req, res) => {
  db.get('SELECT id, name, loyalty_rate, category, phone, location, description, facebook, email, owner_name, slug, logo_url, cover_url, opening_hours, landmark, floor_section, status, onboarding_step, published_at, created_at, updated_at FROM vendors WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId], (err, row) => {
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
  db.get('SELECT id, name, loyalty_rate, category, phone, location, description, facebook, email, owner_name, slug, logo_url, cover_url, opening_hours, landmark, floor_section, status, onboarding_step, published_at, created_at, updated_at FROM vendors WHERE id = ? AND tenant_id = ?', [targetId, req.tenantId], (err, row) => {
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

// PATCH /api/vendors/:id/onboarding
app.patch('/api/vendors/:id/onboarding', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own vendor profile' });
  }

  const allowedFields = [
    'name', 'owner_name', 'category', 'description', 'phone', 'email',
    'facebook', 'location', 'landmark', 'floor_section', 'opening_hours',
    'logo_url', 'cover_url', 'onboarding_step'
  ];

  const updates = [];
  const params = [];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      if (field === 'opening_hours' && typeof req.body[field] === 'object') {
        params.push(JSON.stringify(req.body[field]));
      } else {
        params.push(req.body[field]);
      }
    }
  });

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  const sql = `UPDATE vendors SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`;
  params.push(targetId, req.tenantId);

  db.run(sql, params, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Onboarding progress saved successfully' });
  });
});

// POST /api/vendors/:id/publish
app.post('/api/vendors/:id/publish', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only publish your own profile' });
  }

  db.get('SELECT name, category, phone FROM vendors WHERE id = ? AND tenant_id = ?', [targetId, req.tenantId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });

    const missing = [];
    if (!row.name || row.name.trim() === '') missing.push('business name');
    if (!row.category || row.category.trim() === '') missing.push('category');
    if (!row.phone || row.phone.trim() === '') missing.push('contact number (phone)');

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Unable to publish. The following required information is missing: ' + missing.join(', ') + '.'
      });
    }

    db.run('UPDATE vendors SET status = ?, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?', ['published', targetId, req.tenantId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Vendor published successfully' });
    });
  });
});

// GET /api/vendors/:id/completion
app.get('/api/vendors/:id/completion', authMiddleware, (req, res) => {
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== targetId)) {
    return res.status(403).json({ error: 'Forbidden: You can only check completion for your own profile' });
  }

  db.get('SELECT description, logo_url, cover_url, opening_hours FROM vendors WHERE id = ? AND tenant_id = ?', [targetId, req.tenantId], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Vendor not found' });

    // Query product count
    db.get('SELECT COUNT(*) as count FROM products WHERE vendor_id = ?', [targetId], (err, pRow) => {
      if (err) return res.status(500).json({ error: err.message });

      // Query service count
      db.get('SELECT COUNT(*) as count FROM services WHERE vendor_id = ?', [targetId], (err, sRow) => {
        if (err) return res.status(500).json({ error: err.message });

        const missing = [];
        let score = 0;

        if (row.description && row.description.trim() !== '') {
          score += 20;
        } else {
          missing.push('description');
        }

        if (row.logo_url && row.logo_url.trim() !== '') {
          score += 20;
        } else {
          missing.push('logo');
        }

        if (row.cover_url && row.cover_url.trim() !== '') {
          score += 20;
        } else {
          missing.push('photo');
        }

        const totalItems = (pRow ? pRow.count : 0) + (sRow ? sRow.count : 0);
        if (totalItems > 0) {
          score += 20;
        } else {
          missing.push('product/service');
        }

        if (row.opening_hours && row.opening_hours.trim() !== '' && row.opening_hours !== '{}') {
          score += 20;
        } else {
          missing.push('opening hours');
        }

        res.json({
          percentage: score,
          missing: missing
        });
      });
    });
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

// GET /api/vendors/:vendorId/dashboard (Protected, tenant + owner scoped)
app.get('/api/vendors/:vendorId/dashboard', authMiddleware, (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== vendorId)) {
    return res.status(403).json({ error: 'Forbidden: You can only view your own dashboard' });
  }

  const todayDate = new Date().toISOString().split('T')[0];
  const todayStartStr = todayDate + ' 00:00:00';

  // We can fetch today's sales and COGS
  const salesQuery = `
    SELECT SUM(total_price) AS today_sales, SUM(cogs) AS today_cogs
    FROM orders
    WHERE vendor_id = ? AND status = 'completed' AND created_at >= ?
  `;

  // We can fetch today's expenses
  const expensesQuery = `
    SELECT SUM(amount) AS today_expenses
    FROM accounting_transactions
    WHERE vendor_id = ? AND type = 'expense' AND date = ?
  `;

  // Fetch inventory value
  const inventoryQuery = `
    SELECT SUM(stock * cost_price) AS inventory_value
    FROM products
    WHERE vendor_id = ?
  `;

  // Fetch low stock items
  const lowStockQuery = `
    SELECT id, name, stock, stock_threshold
    FROM products
    WHERE vendor_id = ? AND stock <= stock_threshold
  `;

  // Fetch completed orders to calculate best-selling and slow-moving in JS
  const ordersQuery = `
    SELECT items
    FROM orders
    WHERE vendor_id = ? AND status = 'completed'
  `;

  // Fetch all products to match with sales
  const productsQuery = `
    SELECT id, name, stock, cost_price, price
    FROM products
    WHERE vendor_id = ?
  `;

  db.get(salesQuery, [vendorId, todayStartStr], (err, salesRow) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(expensesQuery, [vendorId, todayDate], (err, expensesRow) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get(inventoryQuery, [vendorId], (err, invRow) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(lowStockQuery, [vendorId], (err, lowStockRows) => {
          if (err) return res.status(500).json({ error: err.message });

          db.all(ordersQuery, [vendorId], (err, orderRows) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(productsQuery, [vendorId], (err, productRows) => {
              if (err) return res.status(500).json({ error: err.message });

              // Calculate sales quantities in JS
              const productSales = {};
              orderRows.forEach(order => {
                try {
                  const items = JSON.parse(order.items);
                  items.forEach(item => {
                    productSales[item.id] = (productSales[item.id] || 0) + (item.quantity || 0);
                  });
                } catch (e) {}
              });

              // Map sales quantities back to products
              const productsWithSales = productRows.map(p => ({
                id: p.id,
                name: p.name,
                stock: p.stock,
                cost_price: p.cost_price,
                price: p.price,
                quantity_sold: productSales[p.id] || 0
              }));

              // Best selling: sort descending by quantity_sold
              const bestSelling = [...productsWithSales]
                .filter(p => p.quantity_sold > 0)
                .sort((a, b) => b.quantity_sold - a.quantity_sold)
                .slice(0, 5);

              // Slow moving: sort ascending by quantity_sold (include products with 0 sales)
              const slowMoving = [...productsWithSales]
                .sort((a, b) => a.quantity_sold - b.quantity_sold)
                .slice(0, 5);

              const todaySales = salesRow ? (salesRow.today_sales || 0) : 0;
              const todayCOGS = salesRow ? (salesRow.today_cogs || 0) : 0;
              const todayExpenses = expensesRow ? (expensesRow.today_expenses || 0) : 0;

              const grossProfit = todaySales - todayCOGS;
              const netProfit = grossProfit - todayExpenses;

              res.json({
                today_sales: todaySales,
                today_expenses: todayExpenses,
                today_cogs: todayCOGS,
                estimated_gross_profit: grossProfit,
                estimated_net_profit: netProfit,
                inventory_value: invRow ? (invRow.inventory_value || 0) : 0,
                best_selling_products: bestSelling,
                slow_moving_products: slowMoving,
                low_stock_items: lowStockRows
              });
            });
          });
        });
      });
    });
  });
});

// ============== PRODUCT ROUTES ==============

// Create product (Protected & ownership verified)
app.post('/api/products', authMiddleware, (req, res) => {
  const { vendor_id, name, category, price, cost_price, stock, description, status } = req.body;
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(vendor_id))) {
    return res.status(403).json({ error: 'Forbidden: You cannot create products for another vendor' });
  }
  const tenantId = req.tenantId || 1;
  const sql = 'INSERT INTO products (vendor_id, name, category, price, cost_price, stock, description, status, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, name, category, price, cost_price || 0, stock || 0, description, status || 'active', tenantId], function(err) {
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
  const sql = 'SELECT p.*, GROUP_CONCAT(pi.image_url) as images, v.name as vendor_name, v.phone as vendor_phone, v.location as vendor_location, v.slug as vendor_slug FROM products p LEFT JOIN product_images pi ON p.id = pi.product_id LEFT JOIN vendors v ON p.vendor_id = v.id WHERE p.tenant_id = ? GROUP BY p.id ORDER BY p.created_at DESC';
  db.all(sql, [req.tenantId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const products = rows.map(row => ({ ...row, images: row.images ? row.images.split(',') : [] }));
    res.json(products);
  });
});

// Get products by vendor
app.get('/api/vendors/:vendorId/products', (req, res) => {
  const sql = 'SELECT p.*, GROUP_CONCAT(pi.image_url) as images FROM products p LEFT JOIN product_images pi ON p.id = pi.product_id WHERE p.vendor_id = ? AND p.tenant_id = ? GROUP BY p.id ORDER BY p.created_at DESC';
  db.all(sql, [req.params.vendorId, req.tenantId], (err, rows) => {
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
  const tenantId = req.tenantId || 1;
  const sql = 'INSERT INTO services (vendor_id, name, category, price, duration, description, image_url, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, name, category, price, duration || 0, description, imageUrl, tenantId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Service created successfully' });
  });
});

// Get all services
app.get('/api/services', (req, res) => {
  const sql = 'SELECT s.*, v.name as vendor_name, v.phone as vendor_phone, v.location as vendor_location FROM services s LEFT JOIN vendors v ON s.vendor_id = v.id WHERE s.tenant_id = ? ORDER BY s.created_at DESC';
  db.all(sql, [req.tenantId], (err, rows) => {
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

// Create order (Protected & tenant-validated)
app.post('/api/orders', authMiddleware, (req, res) => {
  const { vendor_id, customer_name, customer_phone, items, total_price } = req.body;

  // Validate that vendor_id belongs to the resolved tenant
  db.get('SELECT tenant_id FROM vendors WHERE id = ?', [vendor_id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(400).json({ error: 'Vendor not found' });

    if (parseInt(row.tenant_id) !== parseInt(req.tenantId)) {
      return res.status(403).json({ error: 'Forbidden: Vendor does not belong to the active tenant' });
    }

    const tenantId = req.tenantId || 1;
    const sql = 'INSERT INTO orders (vendor_id, customer_name, customer_phone, items, total_price, tenant_id) VALUES (?, ?, ?, ?, ?, ?)';
    db.run(sql, [vendor_id, customer_name, customer_phone, JSON.stringify(items), total_price, tenantId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Order created successfully' });
    });
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

// Update order status and trigger inventory/accounting automation with atomic SQLite transaction
app.put('/api/orders/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;

  db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, order) => {
    if (err || !order) return res.status(500).json({ error: 'Order not found' });

    // Verify ownership: vendor must own order's vendor_id or be admin
    if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== order.vendor_id)) {
      return res.status(403).json({ error: 'Forbidden: You do not own this order' });
    }

    // We only perform the full transaction-backed logic if status is being updated to 'completed'
    if (status !== 'completed') {
      // Normal update
      db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        return res.json({ message: 'Order status updated successfully' });
      });
      return;
    }

    // Wrap the entire completion sequence in an SQLite transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      const rollback = (errMsg) => {
        db.run('ROLLBACK', () => {
          res.status(500).json({ error: errMsg });
        });
      };

      // 1. Update order status to 'completed'
      db.run('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], function(err) {
        if (err) return rollback('Failed to update order status: ' + err.message);

        // 2. Fetch all products in the order items to compute COGS and decrement stock
        const items = JSON.parse(order.items);
        let cogs = 0;
        let productsProcessed = 0;

        if (items.length === 0) {
          return proceedWithLoyaltyAndAccounting(0);
        }

        items.forEach(item => {
          db.get('SELECT price, cost_price, name, stock, stock_threshold FROM products WHERE id = ?', [item.id], (err, prod) => {
            if (err) return rollback('Failed to query product: ' + err.message);

            const costPrice = prod ? prod.cost_price : 0;
            cogs += (item.quantity * costPrice);

            // Decrement stock
            db.run('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [item.quantity, item.id], (err) => {
              if (err) return rollback('Failed to update stock: ' + err.message);

              // Log stock threshold alerts
              if (prod) {
                const currentStock = prod.stock - item.quantity;
                if (currentStock <= prod.stock_threshold) {
                  console.log(`ALERT: Stock for ${prod.name} is low (${currentStock} left)`);
                }
              }

              productsProcessed++;
              if (productsProcessed === items.length) {
                // Update the order with computed COGS
                db.run('UPDATE orders SET cogs = ? WHERE id = ?', [cogs, orderId], (err) => {
                  if (err) return rollback('Failed to update COGS: ' + err.message);
                  proceedWithLoyaltyAndAccounting(cogs);
                });
              }
            });
          });
        });

        function proceedWithLoyaltyAndAccounting(finalCogs) {
          // 3. Automatically create accounting entry if not already done via payment sync
          const date = new Date().toISOString().split('T')[0];
          const desc = `Completed Order #${orderId} for ${order.customer_name}`;
          const gst = order.total_price * GST_RATE;
          const swt = order.total_price * SWT_RATE;

          db.get('SELECT id FROM accounting_transactions WHERE order_id = ?', [orderId], (err, trans) => {
            if (err) return rollback('Failed to check existing transaction: ' + err.message);

            const insertAccounting = (cb) => {
              if (!trans) {
                db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt, tenant_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [order.vendor_id, date, 'sale', order.total_price, desc, gst, swt, order.tenant_id, orderId], (err) => {
                    if (err) return rollback('Failed to record sale: ' + err.message);
                    cb();
                  });
              } else {
                cb();
              }
            };

            insertAccounting(() => {
              // 4. Loyalty Points Logic
              db.get('SELECT loyalty_rate FROM vendors WHERE id = ?', [order.vendor_id], (err, vendor) => {
                if (err) return rollback('Failed to query vendor: ' + err.message);
                const rate = vendor ? vendor.loyalty_rate : 1.0;
                const pointsEarned = Math.floor(order.total_price * rate);

                db.get('SELECT id FROM customer_crm WHERE vendor_id = ? AND phone_number = ?', [order.vendor_id, order.customer_phone], (err, customer) => {
                  if (err) return rollback('Failed to query customer CRM: ' + err.message);

                  if (!customer) {
                    db.run('INSERT INTO customer_crm (vendor_id, phone_number, full_name, total_spent, tenant_id) VALUES (?, ?, ?, ?, ?)',
                      [order.vendor_id, order.customer_phone, order.customer_name, order.total_price, order.tenant_id], function(err) {
                        if (err) return rollback('Failed to create customer CRM record: ' + err.message);
                        const customerId = this.lastID;
                        db.run('INSERT INTO loyalty_points (customer_id, vendor_id, current_points, total_earned_points) VALUES (?, ?, ?, ?)',
                          [customerId, order.vendor_id, pointsEarned, pointsEarned], (err) => {
                            if (err) return rollback('Failed to create loyalty points record: ' + err.message);
                            finishTransaction();
                          });
                      });
                  } else {
                    db.run('UPDATE customer_crm SET total_spent = total_spent + ?, last_visit = CURRENT_TIMESTAMP WHERE id = ?',
                      [order.total_price, customer.id], (err) => {
                        if (err) return rollback('Failed to update customer CRM: ' + err.message);

                        db.get('SELECT id FROM loyalty_points WHERE customer_id = ? AND vendor_id = ?', [customer.id, order.vendor_id], (err, loyalty) => {
                          if (err) return rollback('Failed to query loyalty points: ' + err.message);

                          if (!loyalty) {
                            db.run('INSERT INTO loyalty_points (customer_id, vendor_id, current_points, total_earned_points) VALUES (?, ?, ?, ?)',
                              [customer.id, order.vendor_id, pointsEarned, pointsEarned], (err) => {
                                if (err) return rollback('Failed to create loyalty record: ' + err.message);
                                finishTransaction();
                              });
                          } else {
                            db.run('UPDATE loyalty_points SET current_points = current_points + ?, total_earned_points = total_earned_points + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                              [pointsEarned, pointsEarned, loyalty.id], (err) => {
                                if (err) return rollback('Failed to update loyalty points: ' + err.message);
                                finishTransaction();
                              });
                          }
                        });
                      });
                  }
                });
              });
            });
          });
        }

        function finishTransaction() {
          db.run('COMMIT', (err) => {
            if (err) return rollback('Failed to commit transaction: ' + err.message);
            res.json({ message: 'Order status updated successfully' });
          });
        }
      });
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

// Create vendor expense transaction (Protected & tenant + owner scoped)
app.post('/api/vendors/:vendorId/expenses', authMiddleware, (req, res) => {
  const vendorId = parseInt(req.params.vendorId);
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== vendorId)) {
    return res.status(403).json({ error: 'Forbidden: You can only record expenses for your own store' });
  }

  const { date, amount, description, category, gst, swt } = req.body;

  // Validate category
  const allowedCategories = ['rent', 'transport', 'stock', 'utilities', 'wages', 'marketing', 'other'];
  if (category && !allowedCategories.includes(category.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid expense category. Must be one of: ' + allowedCategories.join(', ') });
  }

  const tenantId = req.tenantId || 1;
  const sql = 'INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, category, gst, swt, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendorId, date || new Date().toISOString().split('T')[0], 'expense', amount, description, category ? category.toLowerCase() : 'other', gst || 0, swt || 0, tenantId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Expense recorded successfully' });
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

// Initiate payment (Protected & tenant-scoped)
app.post('/api/payments/initiate', authMiddleware, (req, res) => {
  const { vendor_id, order_id, amount, method, phone: bodyPhone, customer_phone } = req.body;

  if (!vendor_id || !order_id || !amount || !method) {
    return res.status(400).json({ error: 'Missing required parameters: vendor_id, order_id, amount, method' });
  }

  // If vendor, they can only initiate for themselves
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(vendor_id))) {
    return res.status(403).json({ error: 'Forbidden: You cannot initiate payments for another vendor' });
  }

  const transaction_ref = 'TXN-' + Date.now();

  db.get('SELECT customer_phone FROM orders WHERE id = ?', [order_id], async (err, orderRow) => {
    const phone = bodyPhone || customer_phone || (orderRow ? orderRow.customer_phone : '70000000');

    // Insert records onto local tracking table initializing status explicitly as 'pending'
    const sql = 'INSERT INTO payments (vendor_id, order_id, amount, method, status, transaction_ref, provider, provider_txn_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const provider = process.env.PAYMENT_PROVIDER || 'mock';

    db.run(sql, [vendor_id, order_id, amount, method, 'pending', transaction_ref, provider, null], async function(insertErr) {
      if (insertErr) return res.status(500).json({ error: insertErr.message });
      const recordId = this.lastID;

      try {
        // Fire the outbound payload via providerAdapter.initiateCharge()
        const chargeResult = await providerAdapter.initiateCharge({
          amount: parseFloat(amount),
          phone,
          reference: transaction_ref,
          orderId: order_id
        });

        // Append the returned transaction identity trace safely onto the row record
        const updateSql = 'UPDATE payments SET provider_txn_id = ? WHERE id = ?';
        db.run(updateSql, [chargeResult.provider_txn_id, recordId], (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          // Return the transaction tracking profile
          res.json({
            id: recordId,
            status: 'pending',
            message: chargeResult.message || 'Payment initiated successfully.',
            transaction_ref: transaction_ref,
            provider_txn_id: chargeResult.provider_txn_id,
            provider
          });
        });
      } catch (chargeErr) {
        // Mask raw integration stack traces inside try/catch matrices
        console.error('[CHARGE ERROR]', chargeErr);
        res.status(500).json({ error: 'Failed to initiate charge with the payment provider. Please try again later.' });
      }
    });
  });
});

// Asynchronous Reconciling Webhook Hook Engine
app.post('/api/payments/webhook', (req, res) => {
  if (!providerAdapter.verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const { transaction_ref, status, provider_txn_id } = req.body;

  if (!transaction_ref) {
    return res.status(400).json({ error: 'Missing transaction_ref in webhook body' });
  }

  // Look up matching payment log entry
  db.get('SELECT * FROM payments WHERE transaction_ref = ?', [transaction_ref], (err, payment) => {
    if (err) return res.status(500).json({ error: 'Internal database query error.' });
    if (!payment) return res.status(404).json({ error: 'Payment record not found' });

    // Idempotency check: guarantee already completed or failed transitions drop out immediately
    if (payment.status === 'completed' || payment.status === 'failed') {
      return res.json({ message: 'Webhook already processed (idempotent)', payment_id: payment.id });
    }

    const isSuccess = status === 'completed' || status === 'success' || status === 'SUCCESS';
    const newStatus = isSuccess ? 'completed' : 'failed';

    if (newStatus === 'completed') {
      // Update payment status and provider transaction ID
      db.run('UPDATE payments SET status = "completed", provider_txn_id = ? WHERE id = ?', [provider_txn_id || payment.provider_txn_id, payment.id], function(updateErr) {
        if (updateErr) return res.status(500).json({ error: 'Failed to update payment status.' });

        // Auto-reconcile to accounting - create exactly one transaction row inside accounting_transactions ledger
        const date = new Date().toISOString().split('T')[0];
        const desc = `Payment for Order #${payment.order_id} (Ref: ${transaction_ref})`;
        const amount = payment.amount;
        const gst = amount * GST_RATE;
        const swt = amount * SWT_RATE;

        db.get('SELECT id FROM accounting_transactions WHERE order_id = ?', [payment.order_id], (err, trans) => {
          if (err) {
            console.error('[LEDGER CHECK ERROR]', err.message);
            return res.status(500).json({ error: 'Database ledger check failed.' });
          }
          if (trans) {
            return res.json({ message: 'Payment successfully completed and ledger already reconciled', payment_id: payment.id });
          }

          db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt, tenant_id, order_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [payment.vendor_id, date, 'sale', amount, desc, gst, swt, payment.tenant_id, payment.order_id], function(ledgerErr) {
              if (ledgerErr) {
                console.error('[LEDGER RECONCILIATION ERROR] Webhook failed to write ledger row:', ledgerErr.message);
                return res.status(500).json({ error: 'Database transaction ledger write failed.' });
              }
              res.json({ message: 'Payment successfully completed and ledger reconciled', payment_id: payment.id });
            });
        });
      });
    } else {
      db.run('UPDATE payments SET status = "failed", provider_txn_id = ? WHERE id = ?', [provider_txn_id || payment.provider_txn_id, payment.id], function(updateErr) {
        if (updateErr) return res.status(500).json({ error: 'Failed to update payment status to failed.' });
        res.json({ message: 'Payment failed and marked', payment_id: payment.id });
      });
    }
  });
});

// Tenant-Scoped Payment Status Enforcer Endpoint
app.get('/api/payments/:id/status', authMiddleware, (req, res) => {
  const paymentId = req.params.id;
  db.get('SELECT * FROM payments WHERE id = ?', [paymentId], (err, payment) => {
    if (err) return res.status(500).json({ error: 'Internal database query error.' });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    // Validate that a vendor can access only their own related transaction statuses
    if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== payment.vendor_id)) {
      return res.status(403).json({ error: 'Forbidden: You cannot access status for this payment' });
    }

    res.json({
      id: payment.id,
      vendor_id: payment.vendor_id,
      order_id: payment.order_id,
      amount: payment.amount,
      status: payment.status,
      transaction_ref: payment.transaction_ref,
      provider: payment.provider,
      provider_txn_id: payment.provider_txn_id,
      created_at: payment.created_at
    });
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

// Real targeted promotions API endpoint with WhatsApp dispatcher and audit logging (Protected & tenant-scoped)
app.post('/api/vendors/:vendorId/promotions', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin' && (req.user.role !== 'vendor' || req.user.id !== parseInt(req.params.vendorId))) {
    return res.status(403).json({ error: 'Forbidden: You can only send promotions for your own store' });
  }

  const vendorId = req.user.role === 'admin' ? parseInt(req.params.vendorId) : req.user.id;
  const { customerIds, message, channel } = req.body;

  if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid customerIds array' });
  }
  if (!message) {
    return res.status(400).json({ error: 'Missing message content' });
  }

  // Pull target customer mobile details dynamically relative to parsed customerIds and vendor scope
  const placeholders = customerIds.map(() => '?').join(',');
  const sql = `SELECT id, phone_number, full_name FROM customer_crm WHERE vendor_id = ? AND id IN (${placeholders})`;

  db.all(sql, [vendorId, ...customerIds], async (err, customers) => {
    if (err) return res.status(500).json({ error: 'Internal database query error.' });
    if (!customers || customers.length === 0) {
      return res.status(400).json({ error: 'No matching customers found inside this vendor\'s CRM scope.' });
    }

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    // Iterate and dispatch notification templates asynchronously per recipient
    for (const customer of customers) {
      let deliveryStatus = 'failed';
      try {
        const dispatchResult = await whatsappAdapter.sendMessage({
          to: customer.phone_number,
          body: message
        });

        if (dispatchResult.status === 'sent') {
          deliveryStatus = 'sent';
          successCount++;
        } else {
          failureCount++;
        }
      } catch (sendErr) {
        // Individual exceptions handled gracefully per recipient so single failure does not halt the batch
        console.error(`[CAMPAIGN ERROR] Failed to send promotion to ${customer.phone_number}:`, sendErr.message);
        failureCount++;
      }

      // Log details into promotion_logs table for deliverability auditing
      db.run(
        'INSERT INTO promotion_logs (vendor_id, customer_id, message, channel, status) VALUES (?, ?, ?, ?, ?)',
        [vendorId, customer.id, message, channel || 'WhatsApp', deliveryStatus],
        (logErr) => {
          if (logErr) {
            console.error('[CAMPAIGN AUDIT ERROR] Failed to write audit promotion log:', logErr.message);
          }
        }
      );

      results.push({
        customer_id: customer.id,
        phone: customer.phone_number,
        status: deliveryStatus
      });
    }

    // Return aggregated telemetry summary mapping counts back to client
    res.json({
      message: `Campaign execution complete. Sent: ${successCount}, Failed: ${failureCount}.`,
      telemetry: {
        total_targets: customers.length,
        successful_dispatches: successCount,
        failed_dispatches: failureCount
      },
      details: results
    });
  });
});

// Catch-all 404 for unmatched API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global JSON-returning error handling middleware
app.use((err, req, res, next) => {
  console.error('[GLOBAL ERROR HANDLER]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
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
