const fs = require('fs');

const translations = {
  en: {
    shop: "Shop",
    sell: "Sell",
    wifi: "Wi-Fi",
    accounts: "Accounts",
    revenue: "Revenue",
    expenses: "Expenses",
    profit: "Estimated Profit",
    manage_transactions: "Manage Transactions",
    cart: "Your Shopping Cart",
    checkout: "Complete Your Order",
    dashboard: "Vendor Dashboard",
    products: "Products",
    orders: "Orders",
    settings: "Settings",
    accounting: "Accounting",
    sign_out: "Sign Out",
    welcome: "Welcome to Garden City SME",
    low_stock: "Low Stock Alert"
  },
  tp: {
    shop: "Stoa",
    sell: "Salim",
    wifi: "Wai-Fai",
    accounts: "Buk Kibing",
    revenue: "Mani i kam insait",
    expenses: "Mani i go ausait",
    profit: "Seken mani",
    manage_transactions: "Lukautim mani",
    cart: "Beg bilong yu",
    checkout: "Baim olgeta",
    dashboard: "Dasbot bilong yu",
    products: "Ol samting",
    orders: "Ol oda",
    settings: "Seting",
    accounting: "Buk Kibing",
    sign_out: "Givim ap",
    welcome: "Wanbel long Garden City SME",
    low_stock: "Sot long ol samting"
  }
};

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace('const translations = ${JSON.stringify(translations)};', `const translations = ${JSON.stringify(translations)};`);
  fs.writeFileSync(filePath, content);
}

fixFile('public/index.html');
fixFile('public/backend.html');
