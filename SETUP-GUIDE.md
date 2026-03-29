# 🏪 Garden City & Garden City SME Market SME centre - Complete Setup Guide

## 📦 What You Have

Two complete fullstack e-commerce platforms ready to deploy:
1. **garden-city-fullstack.zip** - Garden City eSME
2. **garden-city-fullstack.zip** - Garden City SME Market SME centre

Each package includes:
- ✅ Node.js/Express backend server
- ✅ SQLite database (auto-creates on first run)
- ✅ RESTful API with full CRUD operations
- ✅ Customer-facing frontend app
- ✅ Vendor backend dashboard
- ✅ Image upload system
- ✅ Complete documentation

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Extract the ZIP files
```bash
# Extract Garden City
unzip garden-city-fullstack.zip
cd garden-city-fullstack

# OR extract Garden City SME Market
unzip garden-city-fullstack.zip
cd garden-city-fullstack
```

### Step 2: Install Node.js dependencies
```bash
npm install
```

### Step 3: Start the server
```bash
npm start
```

### Step 4: Open in browser
- **Customer App**: http://localhost:3000 (Garden City) or http://localhost:3001 (Garden City SME Market)
- **Vendor Dashboard**: http://localhost:3000/backend.html or http://localhost:3001/backend.html

That's it! 🎉

---

## 📁 Project Structure

```
garden-city-fullstack/
├── server.js              # Backend API server
├── package.json           # Dependencies
├── .env                   # Configuration (PORT, etc.)
├── .gitignore            # Git ignore rules
├── README.md             # Detailed documentation
├── garden_city.db        # SQLite database (auto-created)
├── uploads/              # Product images (auto-created)
└── public/               # Frontend files
    ├── index.html        # Customer app
    └── backend.html      # Vendor dashboard
```

---

## 🔧 Configuration

### Garden City runs on PORT 3000
### Garden City SME Market runs on PORT 3001

**To change the port**, edit `.env` file:
```
PORT=3000
NODE_ENV=development
DATABASE_FILE=./garden_city.db
```

---

## 🗄️ Database Schema

### Tables Created Automatically:

**1. vendors**
- Store information (name, phone, location, category, etc.)

**2. products**
- Product listings with pricing, stock, descriptions
- Links to vendor

**3. product_images**
- Multiple images per product
- Primary image flag

**4. services**
- Service offerings with pricing and duration
- Links to vendor

---

## 🔌 API Endpoints

### Vendors
```
POST   /api/vendors           Create new vendor
GET    /api/vendors           Get all vendors
GET    /api/vendors/:id       Get specific vendor
PUT    /api/vendors/:id       Update vendor
DELETE /api/vendors/:id       Delete vendor
```

### Products
```
POST   /api/products                      Create product
POST   /api/products/:id/images           Upload images
GET    /api/products                      Get all products
GET    /api/products/:id                  Get specific product
GET    /api/vendors/:vendorId/products    Get vendor's products
PUT    /api/products/:id                  Update product
DELETE /api/products/:id                  Delete product
```

### Services
```
POST   /api/services                      Create service
GET    /api/services                      Get all services
GET    /api/vendors/:vendorId/services    Get vendor's services
DELETE /api/services/:id                  Delete service
```

### Stats
```
GET    /api/stats             Dashboard statistics
```

---

## 💻 Development

Run with auto-reload during development:
```bash
npm run dev
```

This uses nodemon to restart the server when you make changes.

---

## 🌐 Deployment Options

### Option 1: Deploy to Heroku (Easiest)

1. Install Heroku CLI
2. Login: `heroku login`
3. Create app: `heroku create garden-city-esme`
4. Add Postgres: `heroku addons:create heroku-postgresql:mini`
5. Update server.js to use Postgres instead of SQLite
6. Deploy: `git push heroku main`

### Option 2: Deploy to DigitalOcean/AWS

1. Create Ubuntu droplet/EC2 instance
2. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Upload your code
4. Install dependencies: `npm install`
5. Install PM2: `npm install -g pm2`
6. Start app: `pm2 start server.js --name "garden-city"`
7. Configure Nginx as reverse proxy

### Option 3: Deploy to Vercel/Netlify

1. Convert to serverless functions
2. Use external database (MongoDB Atlas, PlanetScale)
3. Deploy frontend as static site

---

## 🔒 Security Checklist for Production

Before going live, implement:

- [ ] Add user authentication (JWT, sessions)
- [ ] Add vendor authorization
- [ ] Use HTTPS (SSL certificate)
- [ ] Add rate limiting
- [ ] Validate all inputs
- [ ] Add CSRF protection
- [ ] Use PostgreSQL/MySQL instead of SQLite
- [ ] Add error logging (Winston, Sentry)
- [ ] Add backup system
- [ ] Implement image optimization
- [ ] Add CDN for images
- [ ] Set up monitoring

---

## 🧪 Testing

Test the API with curl:

```bash
# Create a vendor
curl -X POST http://localhost:3000/api/vendors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Store",
    "category": "Fashion",
    "phone": "+675 71234567",
    "location": "Level 1, Stall 10"
  }'

# Get all vendors
curl http://localhost:3000/api/vendors

# Get stats
curl http://localhost:3000/api/stats
```

---

## 🆘 Troubleshooting

### Problem: Port already in use
**Solution**: Change PORT in `.env` file

### Problem: npm install fails
**Solution**: Make sure Node.js v14+ is installed
```bash
node --version
npm --version
```

### Problem: Database locked error
**Solution**: SQLite only allows one write at a time. For production, use PostgreSQL.

### Problem: Images not uploading
**Solution**: Check uploads/ folder exists and has write permissions

### Problem: CORS errors
**Solution**: The server already has CORS enabled. Make sure you're accessing from correct domain.

---

## 📱 Mobile App Development

Want to create iOS/Android apps?

### Option 1: React Native
- Reuse the same backend API
- Build native mobile apps

### Option 2: Ionic/Capacitor
- Convert the HTML frontend to mobile app
- Uses web technologies

### Option 3: Flutter
- Build with Dart
- Use the REST API

---

## 🔄 Upgrading from localStorage to Database

The frontend currently uses localStorage. To connect to the database:

1. Replace localStorage calls with fetch() API calls
2. Example:
```javascript
// Old (localStorage)
localStorage.setItem('products', JSON.stringify(products));

// New (API)
fetch('http://localhost:3000/api/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(product)
})
.then(res => res.json())
.then(data => console.log('Saved!', data));
```

---

## 📞 Support

**Created by Deeps Systems**
- Website: https://www.dspng.tech
- Supporting SMEs and MSMEs in Papua New Guinea 🇵🇬

---

## 📄 License

MIT License - Free to use, modify, and distribute

---

## 🎯 Next Steps

1. ✅ Download and extract the ZIP files
2. ✅ Run `npm install`
3. ✅ Run `npm start`
4. ✅ Open http://localhost:3000
5. ⭐ Start adding products through the backend dashboard!
6. 🚀 Deploy to production when ready

**Questions?** Check README.md in each folder for more details.

**Happy selling! 🛍️**
