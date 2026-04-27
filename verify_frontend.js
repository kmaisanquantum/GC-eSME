
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Helper to wait and screenshot
  const screenshot = async (name) => {
    await page.screenshot({ path: `screenshot-${name}.png` });
    console.log(`Saved screenshot: screenshot-${name}.png`);
  };

  try {
    console.log('Navigating to Vendor Dashboard...');
    await page.goto('http://localhost:3000/backend.html');

    // Register/Login a vendor
    await page.fill('#rName', 'Verification Store');
    await page.fill('#rCategory', 'Test');
    await page.fill('#rPhone', '99999999');
    await page.fill('#rLocation', 'Cloud');
    await page.fill('#rPassword', 'password');
    await page.click('#registerForm button[type="submit"]');

    await page.waitForTimeout(2000);
    await screenshot('vendor-dashboard');

    // Check for CRM tab
    const crmTab = await page.$('#nav-crm');
    if (crmTab) {
      console.log('CRM tab found.');
      await crmTab.click();
      await page.waitForTimeout(1000);
      await screenshot('vendor-crm-tab');
    } else {
      console.error('CRM tab NOT found!');
    }

    // Check settings for loyalty rate
    await page.click('#nav-settings');
    await page.waitForTimeout(1000);
    await screenshot('vendor-settings-loyalty');

    // Navigate to Customer App
    console.log('Navigating to Customer App...');
    await page.goto('http://localhost:3000/index.html');
    await page.waitForTimeout(1000);
    await screenshot('customer-app');

    // Add item to cart and open checkout
    // This part is tricky without items, but we can check if elements exist
    const loyaltyDisplay = await page.$('#loyaltyDisplay');
    if (loyaltyDisplay) {
      console.log('Loyalty display element found in customer app.');
    } else {
      console.error('Loyalty display element NOT found in customer app!');
    }

  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await browser.close();
  }
})();
