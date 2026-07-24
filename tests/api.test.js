const request = require('supertest');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DB_FILE = './test_garden_city_sme.db';
const JWT_SECRET = 'super-secret-jwt-key-change-in-production';

// Set environment variables before requiring server
process.env.DATABASE_FILE = DB_FILE;
process.env.JWT_SECRET = JWT_SECRET;
process.env.NODE_ENV = 'test';
process.env.PORT = '5002';

// Delete existing test DB to ensure a clean slate
if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
}

// Import app
const app = require('../server');

// Helper to interact with the database directly during tests
function getDbConnection() {
  return new sqlite3.Database(DB_FILE);
}

describe('Garden City eSME Automated Test Suite', () => {
  let db;

  beforeAll((done) => {
    // Wait slightly to allow the server to initialize the database
    setTimeout(() => {
      db = getDbConnection();
      done();
    }, 1500);
  });

  afterAll((done) => {
    if (db) {
      db.close(() => {
        // Remove test DB file
        if (fs.existsSync(DB_FILE)) {
          fs.unlinkSync(DB_FILE);
        }
        done();
      });
    } else {
      if (fs.existsSync(DB_FILE)) {
        fs.unlinkSync(DB_FILE);
      }
      done();
    }
  });

  describe('JWT Expiry and Invalid Token Rejection', () => {
    it('should reject requests with missing authorization token', async () => {
      const response = await request(app)
        .get('/api/vendors/me/1');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access token required');
    });

    it('should reject requests with invalid/malformed token format', async () => {
      const response = await request(app)
        .get('/api/vendors/me/1')
        .set('Authorization', 'InvalidTokenStructure');
      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Token format must be Bearer <token>');
    });

    it('should reject requests with expired token', async () => {
      // Sign an expired token
      const expiredToken = jwt.sign(
        { id: 1, role: 'vendor', tenant_id: 1 },
        JWT_SECRET,
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .get('/api/vendors/me/1')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Invalid or expired token');
    });

    it('should reject requests with wrong tenant mismatch', async () => {
      const activeToken = jwt.sign(
        { id: 1, role: 'vendor', tenant_id: 2 }, // Tenant ID is 2
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/vendors/me/1')
        .set('Authorization', `Bearer ${activeToken}`)
        .set('X-Tenant', 'gc'); // Tenant ID 1 resolved by X-Tenant

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Forbidden: Tenant mismatch');
    });
  });

  describe('Admin Route Tenant Isolation', () => {
    let adminToken;
    let tenant1VendorId, tenant2VendorId;
    let tenant1ProductId, tenant2ProductId;
    let tenant1OrderId, tenant2OrderId;

    beforeAll((done) => {
      // Log in as default admin
      adminToken = jwt.sign({ id: 1, role: 'admin', username: 'admin' }, JWT_SECRET);

      // Seed data for Tenant 1 (id = 1) and Tenant 2 (id = 2)
      db.serialize(() => {
        // Insert Vendors
        db.run(
          "INSERT INTO vendors (name, category, phone, location, tenant_id, status) VALUES ('Vendor Tenant 1', 'Food', '12345', 'Loc 1', 1, 'active')",
          function (err) {
            if (err) console.error(err);
            tenant1VendorId = this.lastID;

            db.run(
              "INSERT INTO vendors (name, category, phone, location, tenant_id, status) VALUES ('Vendor Tenant 2', 'Clothing', '67890', 'Loc 2', 2, 'active')",
              function (err) {
                if (err) console.error(err);
                tenant2VendorId = this.lastID;

                // Insert Products
                db.run(
                  `INSERT INTO products (name, category, price, stock, tenant_id, vendor_id) VALUES ('Product T1', 'Food', 10.5, 100, 1, ${tenant1VendorId})`,
                  function (err) {
                    tenant1ProductId = this.lastID;

                    db.run(
                      `INSERT INTO products (name, category, price, stock, tenant_id, vendor_id) VALUES ('Product T2', 'Clothing', 25.0, 50, 2, ${tenant2VendorId})`,
                      function (err) {
                        tenant2ProductId = this.lastID;

                        // Insert Orders
                        db.run(
                          `INSERT INTO orders (tenant_id, vendor_id, customer_name, customer_phone, items, total_price, status) VALUES (1, ${tenant1VendorId}, 'Cust 1', '111', '[]', 10.5, 'completed')`,
                          function (err) {
                            tenant1OrderId = this.lastID;

                            db.run(
                              `INSERT INTO orders (tenant_id, vendor_id, customer_name, customer_phone, items, total_price, status) VALUES (2, ${tenant2VendorId}, 'Cust 2', '222', '[]', 25.0, 'completed')`,
                              function (err) {
                                tenant2OrderId = this.lastID;
                                done();
                              }
                            );
                          }
                        );
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    });

    it('should filter GET /api/admin/vendors by resolved req.tenantId', async () => {
      // Query as Admin scoped to Tenant 1
      const resT1 = await request(app)
        .get('/api/admin/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '1');

      expect(resT1.status).toBe(200);
      const vendorsT1 = resT1.body;
      expect(vendorsT1.every(v => v.tenant_id === 1)).toBe(true);
      expect(vendorsT1.some(v => v.id === tenant1VendorId)).toBe(true);
      expect(vendorsT1.some(v => v.id === tenant2VendorId)).toBe(false);

      // Query as Admin scoped to Tenant 2
      const resT2 = await request(app)
        .get('/api/admin/vendors')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '2');

      expect(resT2.status).toBe(200);
      const vendorsT2 = resT2.body;
      expect(vendorsT2.every(v => v.tenant_id === 2)).toBe(true);
      expect(vendorsT2.some(v => v.id === tenant2VendorId)).toBe(true);
      expect(vendorsT2.some(v => v.id === tenant1VendorId)).toBe(false);
    });

    it('should filter GET /api/admin/products by resolved req.tenantId', async () => {
      const resT1 = await request(app)
        .get('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '1');

      expect(resT1.status).toBe(200);
      expect(resT1.body.every(p => p.tenant_id === 1)).toBe(true);

      const resT2 = await request(app)
        .get('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '2');

      expect(resT2.status).toBe(200);
      expect(resT2.body.every(p => p.tenant_id === 2)).toBe(true);
    });

    it('should filter GET /api/admin/orders by resolved req.tenantId', async () => {
      const resT1 = await request(app)
        .get('/api/admin/orders')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '1');

      expect(resT1.status).toBe(200);
      expect(resT1.body.every(o => o.tenant_id === 1)).toBe(true);
    });

    it('should filter stats in GET /api/admin/stats by resolved req.tenantId', async () => {
      const resT1 = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '1');

      expect(resT1.status).toBe(200);
      expect(resT1.body.totalVendors).toBe(1);
      expect(resT1.body.totalProducts).toBe(1);
      expect(resT1.body.totalOrders).toBe(1);
      expect(resT1.body.totalRevenue).toBe(10.5);

      const resT2 = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '2');

      expect(resT2.status).toBe(200);
      expect(resT2.body.totalVendors).toBe(1);
      expect(resT2.body.totalRevenue).toBe(25.0);
    });

    it('should support super_admin role to perform unscoped cross-tenant admin operations', async () => {
      const superAdminToken = jwt.sign({ id: 99, role: 'super_admin', username: 'superadmin' }, JWT_SECRET);

      const res = await request(app)
        .get('/api/admin/vendors')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      // Should see vendors from both Tenant 1 and Tenant 2
      const allVendors = res.body;
      expect(allVendors.some(v => v.tenant_id === 1)).toBe(true);
      expect(allVendors.some(v => v.tenant_id === 2)).toBe(true);
    });

    it('should prevent an admin from deleting another tenant records (tenant isolation on DELETE)', async () => {
      // Admin of Tenant 1 tries to delete Tenant 2 product
      const res = await request(app)
        .delete(`/api/admin/products/${tenant2ProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '1');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Product not found');

      // Admin of Tenant 2 successfully deletes Tenant 2 product
      const resSuccess = await request(app)
        .delete(`/api/admin/products/${tenant2ProductId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Tenant', '2');

      expect(resSuccess.status).toBe(200);
      expect(resSuccess.body.message).toContain('Product deleted successfully');
    });
  });

  describe('Vendor Product Image Upload Ownership Checks', () => {
    let vendor1Token, vendor2Token;
    let product1Id, product2Id;

    beforeAll((done) => {
      vendor1Token = jwt.sign({ id: 101, role: 'vendor', tenant_id: 1 }, JWT_SECRET);
      vendor2Token = jwt.sign({ id: 102, role: 'vendor', tenant_id: 1 }, JWT_SECRET);

      db.serialize(() => {
        db.run(
          `INSERT INTO products (name, category, price, stock, tenant_id, vendor_id) VALUES ('P1', 'Category', 10, 5, 1, 101)`,
          function (err) {
            product1Id = this.lastID;
            db.run(
              `INSERT INTO products (name, category, price, stock, tenant_id, vendor_id) VALUES ('P2', 'Category', 20, 5, 1, 102)`,
              function (err) {
                product2Id = this.lastID;
                done();
              }
            );
          }
        );
      });
    });

    it('should reject product image upload if the vendor does not own the product', async () => {
      const buffer = Buffer.from('fake image content');
      const response = await request(app)
        .post(`/api/products/${product1Id}/images`)
        .set('Authorization', `Bearer ${vendor2Token}`)
        .attach('images', buffer, 'test.png');

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Forbidden: You do not own this product');
    });

    it('should reject upload if file is not an image (mime-type hardening)', async () => {
      const buffer = Buffer.from('plain text');
      const response = await request(app)
        .post(`/api/products/${product1Id}/images`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .attach('images', buffer, 'test.txt'); // plain text mimetype is mapped by supertest

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Only JPEG, PNG and WEBP images are allowed');
    });

    it('should accept product image upload if the vendor owns the product and mimetype is image/png', async () => {
      const buffer = Buffer.from('fake image content');
      const response = await request(app)
        .post(`/api/products/${product1Id}/images`)
        .set('Authorization', `Bearer ${vendor1Token}`)
        .attach('images', buffer, { filename: 'test.png', contentType: 'image/png' });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Images uploaded successfully');
    });
  });

  describe('Payment Webhook Idempotency + Signature Verification Path', () => {
    const webhookSecret = 'signing-key-123';
    let paymentId;
    const testRef = 'REF-TEST-999';

    beforeAll((done) => {
      process.env.PAYMENT_PROVIDER = 'bsp';
      process.env.PAYMENT_WEBHOOK_SECRET = webhookSecret;

      db.run(
        `INSERT INTO payments (tenant_id, vendor_id, amount, status, transaction_ref) VALUES (1, 101, 150.0, 'pending', '${testRef}')`,
        function (err) {
          paymentId = this.lastID;
          done();
        }
      );
    });

    afterAll(() => {
      process.env.PAYMENT_PROVIDER = 'mock';
    });

    it('should reject webhook requests with invalid or missing signature', async () => {
      const payload = { transaction_ref: testRef, status: 'completed', provider_txn_id: 'TXN-999' };
      const response = await request(app)
        .post('/api/payments/webhook')
        .send(payload);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid webhook signature');
    });

    it('should verify signature and process the webhook on first request, updating status', async () => {
      const payload = { transaction_ref: testRef, status: 'completed', provider_txn_id: 'TXN-999' };
      const rawBody = JSON.stringify(payload);

      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('signature', computedSignature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Payment successfully completed');

      // Verify DB state is updated
      const payment = await new Promise((resolve) => {
        db.get('SELECT * FROM payments WHERE id = ?', [paymentId], (err, row) => resolve(row));
      });
      expect(payment.status).toBe('completed');
      expect(payment.provider_txn_id).toBe('TXN-999');
    });

    it('should be idempotent: subsequent webhooks return processed message without reprocessing', async () => {
      const payload = { transaction_ref: testRef, status: 'completed', provider_txn_id: 'TXN-999' };
      const rawBody = JSON.stringify(payload);

      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      const response = await request(app)
        .post('/api/payments/webhook')
        .set('signature', computedSignature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Webhook already processed (idempotent)');
    });
  });
});
