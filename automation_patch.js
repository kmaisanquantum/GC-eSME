const fs = require('fs');

// Backend Automation: Decrement stock and check threshold in order completion
let serverContent = fs.readFileSync('server.js', 'utf8');
const orderCompletionLogic = `
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
              console.log(\`ALERT: Stock for \${prod.name} is low (\${prod.stock} left)\`);
              // In real app, send email/SMS. Here we just log.
            }
          });
        });

        // Automatically create accounting entry if not already done via payment sync
        const date = new Date().toISOString().split('T')[0];
        const desc = \`Completed Order #\${orderId} for \${order.customer_name}\`;
        const gst = order.total_price * 0.1; // 10% GST
        const swt = order.total_price * 0.02; // 2% SWT Simulation

        // Check if already reconciled to avoid duplicate
        db.get('SELECT id FROM accounting_transactions WHERE description LIKE ?', [\`%Order #\${orderId}%\`], (err, trans) => {
           if (!trans) {
             db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt) VALUES (?, ?, ?, ?, ?, ?, ?)',
               [order.vendor_id, date, 'sale', order.total_price, desc, gst, swt]);
           }
        });
      }
      res.json({ message: 'Order status updated successfully' });
    });
  });
});
`;

serverContent = serverContent.replace(/app\.put\('\/api\/orders\/:id\/status'[\s\S]*?\}\);/, orderCompletionLogic);
fs.writeFileSync('server.js', serverContent);

// Frontend: Add GST/SWT display and Inventory Alerts
let backendContent = fs.readFileSync('public/backend.html', 'utf8');

// Update accounting table headers and rendering for Tax
backendContent = backendContent.replace('<th>Amount</th>', '<th>Amount</th><th style="text-align: right;">GST (10%)</th><th style="text-align: right;">SWT (2%)</th>');
backendContent = backendContent.replace(/<td style="text-align: right; color: [\s\S]*?<\/td>/, `
            <td style="text-align: right; color: \${t.type === 'sale' ? 'var(--success)' : '#ef4444'}; font-weight: 600;">
              \${t.type === 'sale' ? '+' : '-'}K\${parseFloat(t.amount).toFixed(2)}
            </td>
            <td style="text-align: right; color: var(--text-muted); font-size: 0.75rem;">K\${parseFloat(t.gst || 0).toFixed(2)}</td>
            <td style="text-align: right; color: var(--text-muted); font-size: 0.75rem;">K\${parseFloat(t.swt || 0).toFixed(2)}</td>
`);

// Update addTransaction to include SWT simulation
backendContent = backendContent.replace('gst: document.getElementById(\'accAmount\').value * 0.1 // 10% GST', `
        gst: document.getElementById('accAmount').value * 0.1, // 10% GST
        swt: document.getElementById('accType').value === 'sale' ? document.getElementById('accAmount').value * 0.02 : 0 // 2% SWT
`);

// Add low stock alert to loadStoreData
const stockAlertSnippet = `
        // Inventory Alerts
        const lowStock = products.filter(p => p.stock <= (p.stock_threshold || 5));
        const alertBox = document.getElementById('inventoryAlerts');
        if (lowStock.length > 0) {
          alertBox.innerHTML = lowStock.map(p => \`
            <div style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid #ef4444; padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
              <span>⚠️ <strong>\${p.name}</strong> is low on stock (\${p.stock} left)</span>
              <button onclick="switchTab('products')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer;">Restock</button>
            </div>
          \`).join('');
          alertBox.classList.remove('hidden');
        } else {
          alertBox.classList.add('hidden');
        }
`;

backendContent = backendContent.replace('document.getElementById(\'statProducts\').textContent = products.length;',
    'document.getElementById(\'statProducts\').textContent = products.length;\n' + stockAlertSnippet);

// Insert alert box container in Overview tab
backendContent = backendContent.replace('<div class="stats-grid">', '<div id="inventoryAlerts" class="hidden" style="margin-bottom: 1.5rem;"></div>\n      <div class="stats-grid">');

fs.writeFileSync('public/backend.html', backendContent);
