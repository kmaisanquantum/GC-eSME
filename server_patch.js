const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Add tables to initDatabase
const dbInitNewTables = `
    // Accounting Transactions table
    db.run(\`
      CREATE TABLE IF NOT EXISTS accounting_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        gst REAL DEFAULT 0,
        swt REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      )
    \`);

    // Payments table
    db.run(\`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL,
        order_id INTEGER,
        amount REAL NOT NULL,
        method TEXT,
        status TEXT DEFAULT 'pending',
        transaction_ref TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
      )
    \`);

    // Add stock_threshold to products if not exists
    db.run("ALTER TABLE products ADD COLUMN stock_threshold INTEGER DEFAULT 5", (err) => {
        // Ignore error if column already exists
    });
`;

content = content.replace('console.log(\'Database tables initialized\');', dbInitNewTables + '\n    console.log(\'Database tables initialized\');');

// Add new API routes before app.listen
const newRoutes = `
// ============== ACCOUNTING ROUTES ==============

// Get accounting transactions for a vendor
app.get('/api/vendors/:vendorId/accounting', (req, res) => {
  db.all('SELECT * FROM accounting_transactions WHERE vendor_id = ? ORDER BY date DESC', [req.params.vendorId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create accounting transaction
app.post('/api/accounting', (req, res) => {
  const { vendor_id, date, type, amount, description, gst, swt } = req.body;
  const sql = 'INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst, swt) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, date, type, amount, description, gst || 0, swt || 0], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Transaction recorded successfully' });
  });
});

// Delete accounting transaction
app.delete('/api/accounting/:id', (req, res) => {
  db.run('DELETE FROM accounting_transactions WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Transaction deleted successfully' });
  });
});

// ============== PAYMENTS ROUTES ==============

// Initiate payment (Simulation)
app.post('/api/payments/initiate', (req, res) => {
  const { vendor_id, order_id, amount, method } = req.body;
  const transaction_ref = 'TXN-' + Date.now();
  const sql = 'INSERT INTO payments (vendor_id, order_id, amount, method, status, transaction_ref) VALUES (?, ?, ?, ?, ?, ?)';
  db.run(sql, [vendor_id, order_id, amount, method, 'pending', transaction_ref], function(err) {
    if (err) return res.status(500).json({ error: err.message });

    // Simulate successful mobile money response
    res.json({
      id: this.lastID,
      status: 'pending',
      message: 'Payment initiated. Please confirm on your mobile device.',
      transaction_ref
    });

    // Auto-complete after 2 seconds for simulation
    setTimeout(() => {
      db.run('UPDATE payments SET status = "completed" WHERE id = ?', [this.lastID]);

      // Auto-reconcile to accounting
      const date = new Date().toISOString().split('T')[0];
      const desc = \`Payment for Order #\${order_id} (Ref: \${transaction_ref})\`;
      const gst = amount * 0.1; // 10% GST
      db.run('INSERT INTO accounting_transactions (vendor_id, date, type, amount, description, gst) VALUES (?, ?, ?, ?, ?, ?)',
        [vendor_id, date, 'sale', amount, desc, gst]);
    }, 2000);
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
        res.json({ response: \`Logged sale of K\${amount.toFixed(2)} successfully!\` });
      });
  } else if (cmd.includes('balance')) {
    db.all('SELECT type, amount FROM accounting_transactions WHERE vendor_id = ?', [vendor_id], (err, rows) => {
      if (err) return res.json({ response: 'Error fetching balance.' });
      const sales = rows.filter(r => r.type === 'sale').reduce((s, r) => s + r.amount, 0);
      const expenses = rows.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      res.json({ response: \`Your total sales: K\${sales.toFixed(2)}\\nTotal expenses: K\${expenses.toFixed(2)}\\nCurrent Profit: K\${(sales - expenses).toFixed(2)}\` });
    });
  } else {
    res.json({ response: 'Hello! I am your Garden City SME Assistant. You can say "log sale 50" or "show balance".' });
  }
});
`;

content = content.replace('// Start server', newRoutes + '\n// Start server');

fs.writeFileSync('server.js', content);
