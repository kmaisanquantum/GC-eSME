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
- Website: https://www.dspng.tech
- Supporting local SMEs and MSMEs in Papua New Guinea

## 📄 License

MIT License - Free to use and modify
