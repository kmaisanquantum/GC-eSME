# Garden City SME - Fullstack Application

A complete e-commerce platform for Garden City SME Mall vendors to manage products, services, and customer engagement.

## 🚀 Features

- **Vendor Management**: Complete vendor profile system
- **Product Management**: Add, edit, delete products with multiple images
- **Service Listings**: Manage services with pricing and duration
- **RESTful API**: Full CRUD operations for all resources
- **SQLite Database**: Lightweight, serverless database
- **Image Upload**: Support for product/service images
- **Mobile Responsive**: Works on all devices

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn

## 🔧 Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

3. **Open the applications:**
   - Frontend: Open `public/index.html` in your browser
   - Backend Dashboard: Open `public/backend.html`
   - API: http://localhost:3001/api

## 📁 Project Structure

```
garden-city-fullstack/
├── server.js              # Express server with API routes
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables
├── unity_mall.db         # SQLite database (auto-created)
├── uploads/               # Product/service images (auto-created)
├── public/                # Frontend files
│   ├── index.html         # Customer-facing app
│   └── backend.html       # Vendor dashboard
└── README.md             # This file
```

## 🔌 API Endpoints

### Vendors
- `POST /api/vendors` - Create vendor
- `GET /api/vendors` - Get all vendors
- `GET /api/vendors/:id` - Get vendor by ID
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor

### Products
- `POST /api/products` - Create product
- `POST /api/products/:id/images` - Upload product images
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get product by ID
- `GET /api/vendors/:vendorId/products` - Get products by vendor
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Services
- `POST /api/services` - Create service (with image upload)
- `GET /api/services` - Get all services
- `GET /api/vendors/:vendorId/services` - Get services by vendor
- `DELETE /api/services/:id` - Delete service

### Stats
- `GET /api/stats` - Get dashboard statistics

## 🗄️ Database Schema

### Vendors Table
- id, name, category, phone, location, description, facebook, email, timestamps

### Products Table
- id, vendor_id, name, category, price, stock, description, status, timestamps

### Product Images Table
- id, product_id, image_url, is_primary, created_at

### Services Table
- id, vendor_id, name, category, price, duration, description, image_url, timestamps

## 🎨 Frontend Integration

The frontend files use `fetch()` to communicate with the API:

```javascript
// Example: Fetch all products
fetch('http://localhost:3001/api/products')
  .then(response => response.json())
  .then(products => console.log(products));

// Example: Create a product
fetch('http://localhost:3001/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    vendor_id: 1,
    name: 'Product Name',
    category: 'Fashion',
    price: 99.99,
    stock: 10,
    description: 'Product description',
    status: 'active'
  })
})
.then(response => response.json())
.then(data => console.log(data));
```

## 🔒 Security Notes

For production deployment:
- Add authentication/authorization
- Use HTTPS
- Add rate limiting
- Validate all inputs
- Add CSRF protection
- Use environment variables for sensitive data
- Implement proper error handling

## 🌐 Deployment

### Deploy to Heroku:
1. Create Heroku app
2. Add Heroku Postgres addon (replace SQLite)
3. Push code: `git push heroku main`

### Deploy to DigitalOcean/AWS:
1. Set up Node.js server
2. Install PM2: `npm install -g pm2`
3. Start app: `pm2 start server.js`
4. Configure nginx as reverse proxy

## 📞 Support

Created by **Deeps Systems**
- Website: [https://www.dspng.tech](https://www.dspng.tech)
- Supporting local SMEs and MSMEs in Papua New Guinea
- Email: [wokman@dspng.tech](mailto:wokman@dspng.tech)
- Phone/Whatsapp: (675) 8300 99881
- Text: (675) 8300 9881

## 💳 Mobile-Money Payments & WhatsApp Marketing Integration

This platform supports live payment gateway processing and automated WhatsApp notifications.

### ⚙️ Extended Environment Variables
Ensure the following keys are added to your local, untracked `.env` file (never commit actual secrets):

```env
# Mobile-Money Payments Configuration
PAYMENT_PROVIDER=mock                     # Supported: bsp | micash | cellmoni | mock
PAYMENT_API_BASE_URL=https://api.bsp.com # Target routing base URL for payment provider
PAYMENT_API_KEY=merchant-api-key         # Merchant/API credentials
PAYMENT_API_SECRET=merchant-api-secret   # Merchant/API credentials secret
PAYMENT_WEBHOOK_SECRET=webhook-secret    # Cryptographic signature confirmation key

# Live WhatsApp Messaging Configuration
WHATSAPP_PROVIDER=mock                    # Supported: meta | twilio | mock
WHATSAPP_API_TOKEN=your-meta-api-token    # Standard Meta WhatsApp Cloud API credentials
WHATSAPP_PHONE_NUMBER_ID=your-phone-id    # Standard Meta WhatsApp Cloud API phone ID

# Twilio WhatsApp Configuration (Fallback if WHATSAPP_PROVIDER=twilio)
TWILIO_ACCOUNT_SID=twilio-acc-sid         # Twilio account SID
TWILIO_AUTH_TOKEN=twilio-auth-token       # Twilio authentication token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 # Twilio WhatsApp sender number
```

### ⚓ Inbound Merchant Webhook Target URL
The exact path for payments provider callback/webhook processing is:
`POST http://<your-domain>/api/payments/webhook`

- **Webhook Security:** Webhook payloads are strictly verified utilizing standard hash-based cryptographic signature comparisons (`X-Signature` or `X-BSP-Signature` headers) with timing-safe operations via `crypto.timingSafeEqual()`.
- **Idempotency:** Webhook requests guarantee idempotency, ensuring that transitions for completed or failed operations prevent duplicate accounting reconciliation runs.

### 💬 WhatsApp Campaigns & Setup Criteria
1. **Meta WhatsApp Cloud API Setup:**
   - Register a developer account on Meta for Developers portal.
   - Set up WhatsApp Business Platform and obtain the Permanent access token (`WHATSAPP_API_TOKEN`) and Phone Number ID (`WHATSAPP_PHONE_NUMBER_ID`).
   - Register templates to utilize live marketing broadcasts.
2. **Twilio WhatsApp Setup:**
   - Sign up on Twilio and configure WhatsApp Sandbox or Production sender.
   - Use standard Account SID and Auth Token, and configure your sender number (`TWILIO_WHATSAPP_FROM`).

## 📄 License

MIT License - Free to use and modify
