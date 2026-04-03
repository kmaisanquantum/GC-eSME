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

const translationSnippet = `
    const translations = \${JSON.stringify(translations)};
    let currentLang = localStorage.getItem('um_lang') || 'en';

    function toggleLanguage() {
      currentLang = currentLang === 'en' ? 'tp' : 'en';
      localStorage.setItem('um_lang', currentLang);
      applyTranslations();
    }

    function applyTranslations() {
      const t = translations[currentLang];
      document.querySelectorAll('[data-t]').forEach(el => {
        const key = el.getAttribute('data-t');
        if (t[key]) el.textContent = t[key];
      });
      const toggleBtn = document.getElementById('langToggle');
      if (toggleBtn) toggleBtn.textContent = currentLang === 'en' ? '🇵🇳 Tok Pisin' : '🇬🇧 English';
    }
`;

function patchFile(filePath, isBackend) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Add Language Toggle to Header/Sidebar
  const toggleBtnHtml = '<button id="langToggle" onclick="toggleLanguage()" class="btn" style="padding: 4px 10px; font-size: 0.75rem; background: rgba(255,255,255,0.1); border: 1px solid var(--border); color: var(--text-accent); margin: 0 10px;">🇵🇳 Tok Pisin</button>';

  if (isBackend) {
    content = content.replace('<div id="vendorStoreName"', toggleBtnHtml + '<div id="vendorStoreName"');
  } else {
    content = content.replace('<div class="header-actions">', '<div class="header-actions">' + toggleBtnHtml);
  }

  // Add data-t attributes to key elements
  content = content.replace(/<div>Shop<\/div>/, '<div data-t="shop">Shop</div>');
  content = content.replace(/<div>Sell<\/div>/, '<div data-t="sell">Sell</div>');
  content = content.replace(/<div>Wi-Fi<\/div>/, '<div data-t="wifi">Wi-Fi</div>');
  content = content.replace(/<div>Accounts<\/div>/, '<div data-t="accounts">Accounts</div>');
  content = content.replace(/<div class="acc-label">Revenue<\/div>/g, '<div class="acc-label" data-t="revenue">Revenue</div>');
  content = content.replace(/<div class="acc-label">Expenses<\/div>/g, '<div class="acc-label" data-t="expenses">Expenses</div>');
  content = content.replace(/<div class="acc-label">Estimated Profit<\/div>/g, '<div class="acc-label" data-t="profit">Estimated Profit</div>');

  // Insert translation logic
  content = content.replace('init();', translationSnippet + '\n    applyTranslations();\n    init();');

  fs.writeFileSync(filePath, content);
}

patchFile('public/index.html', false);
patchFile('public/backend.html', true);
