const fs = require('fs');
let content = fs.readFileSync('public/backend.html', 'utf8');

// Add Chart.js and jsPDF to the top of the body
const headScripts = `
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
`;
content = content.replace('<body>', '<body>' + headScripts);

// Replace the Accounting Summary with a Chart-enabled version
const chartHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
        <div class="card" style="padding: 1.5rem; background: var(--bg-card);">
          <h3 style="color: var(--text-accent); margin-bottom: 1rem;">📈 SME Financial Summary</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; text-align: center;">
            <div>
              <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Total Sales</div>
              <div id="accTotalSales" style="color: var(--success); font-size: 1.25rem; font-weight: 700;">K0.00</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Total Expenses</div>
              <div id="accTotalExpenses" style="color: #ef4444; font-size: 1.25rem; font-weight: 700;">K0.00</div>
            </div>
            <div>
              <div style="color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">Net Profit</div>
              <div id="accNetProfit" style="color: var(--primary); font-size: 1.25rem; font-weight: 700;">K0.00</div>
            </div>
          </div>
          <div style="margin-top: 1.5rem;">
            <button onclick="exportLendingReport()" class="btn btn-primary" style="width: 100%; font-size: 0.875rem;">📄 Export Micro-Lending Readiness Report (6 Mo)</button>
          </div>
        </div>
        <div class="card" style="padding: 1.5rem; background: var(--bg-card);">
           <h3 style="color: var(--text-accent); margin-bottom: 1rem;">📊 Revenue vs. Expenses</h3>
           <canvas id="businessHealthChart" height="200"></canvas>
        </div>
      </div>
`;

content = content.replace(/<div id="tab-accounts" class="tab-content hidden">([\s\S]*?)<div class="card">[\s\S]*?<h3 class="card-title">➕ Record Transaction/,
    '<div id="tab-accounts" class="tab-content hidden">' + chartHtml + '<div class="card"><h3 class="card-title">➕ Record Transaction');

// Replace updateAccountingUI to include charts and jsPDF
const newUpdateAccountingUI = `
    let businessChart = null;

    async function updateAccountingUI() {
      if (!currentVendor) return;

      try {
        const res = await fetch(\`\${API_URL}/vendors/\${currentVendor.id}/accounting\`);
        const transactions = await res.json();

        const totalSales = transactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const netProfit = totalSales - totalExpenses;

        document.getElementById('accTotalSales').textContent = \`K\${totalSales.toFixed(2)}\`;
        document.getElementById('accTotalExpenses').textContent = \`K\${totalExpenses.toFixed(2)}\`;
        const netProfitEl = document.getElementById('accNetProfit');
        netProfitEl.textContent = \`K\${netProfit.toFixed(2)}\`;
        netProfitEl.style.color = netProfit >= 0 ? 'var(--success)' : '#ef4444';

        const tbody = document.getElementById('accTransactionBody');
        tbody.innerHTML = transactions.map((t, index) => \`
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 12px 0;">\${new Date(t.date).toLocaleDateString()}</td>
            <td>\${t.description}</td>
            <td style="text-align: right; color: \${t.type === 'sale' ? 'var(--success)' : '#ef4444'};">
              \${t.type === 'sale' ? '+' : '-'}K\${parseFloat(t.amount).toFixed(2)}
            </td>
            <td style="text-align: center;">
               <button onclick="deleteTransaction(\${t.id})" style="background:none; border:none; color:#ef4444; cursor:pointer;">×</button>
            </td>
          </tr>
        \`).join('') || '<tr><td colspan="4" style="text-align:center; padding:2rem;">No transactions recorded.</td></tr>';

        renderBusinessChart(totalSales, totalExpenses);
      } catch (err) {
        console.error('Failed to load accounting data:', err);
      }
    }

    function renderBusinessChart(sales, expenses) {
      const ctx = document.getElementById('businessHealthChart').getContext('2d');
      if (businessChart) businessChart.destroy();

      businessChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Revenue', 'Expenses'],
          datasets: [{
            label: 'Amount (K)',
            data: [sales, expenses],
            backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(239, 68, 68, 0.6)'],
            borderColor: ['#10b981', '#ef4444'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } } }
        }
      });
    }

    async function exportLendingReport() {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();

      const res = await fetch(\`\${API_URL}/vendors/\${currentVendor.id}/accounting\`);
      const transactions = await res.json();

      const totalSales = transactions.filter(t => t.type === 'sale').reduce((sum, t) => sum + parseFloat(t.amount), 0);
      const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount), 0);

      doc.setFontSize(22);
      doc.text("Micro-Lending Readiness Report", 20, 20);
      doc.setFontSize(12);
      doc.text(\`Vendor: \${currentVendor.name}\`, 20, 30);
      doc.text(\`Date Generated: \${new Date().toLocaleDateString()}\`, 20, 37);

      doc.setLineWidth(0.5);
      doc.line(20, 42, 190, 42);

      doc.setFontSize(14);
      doc.text("Business Health Summary", 20, 52);
      doc.setFontSize(12);
      doc.text(\`Total Revenue (Last 6 Months): K\${totalSales.toFixed(2)}\`, 20, 62);
      doc.text(\`Total Expenses (Last 6 Months): K\${totalExpenses.toFixed(2)}\`, 20, 70);
      doc.text(\`Net Profit: K\${(totalSales - totalExpenses).toFixed(2)}\`, 20, 78);

      doc.text("Recent Transactions", 20, 95);
      let y = 105;
      transactions.slice(0, 10).forEach(t => {
         doc.text(\`\${t.date}: \${t.description.substring(0, 30)} - K\${parseFloat(t.amount).toFixed(2)} (\${t.type})\`, 20, y);
         y += 8;
      });

      doc.save(\\"Lending_Readiness_Report_\${currentVendor.name.replace(/\\s/g, '_')}.pdf\\");
      alert('Report exported successfully!');
    }
`;

content = content.replace(/function updateAccountingUI\(\) \{([\s\S]*?)function addTransaction/, newUpdateAccountingUI + '\n\n    async function addTransaction');

// Update addTransaction and deleteTransaction to use API
const newAddTransaction = `
    async function addTransaction(e) {
      e.preventDefault();
      const payload = {
        vendor_id: currentVendor.id,
        date: document.getElementById('accDate').value,
        type: document.getElementById('accType').value,
        amount: document.getElementById('accAmount').value,
        description: document.getElementById('accDesc').value,
        gst: document.getElementById('accAmount').value * 0.1 // 10% GST
      };

      try {
        const res = await fetch(\`\${API_URL}/accounting\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        await res.json();
        updateAccountingUI();
        e.target.reset();
        alert('Transaction recorded successfully');
      } catch (err) {
        alert('Failed to record transaction');
      }
    }

    async function deleteTransaction(id) {
      if (confirm('Delete this transaction?')) {
        try {
          await fetch(\`\${API_URL}/accounting/\${id}\`, { method: 'DELETE' });
          updateAccountingUI();
        } catch (err) {
          alert('Failed to delete transaction');
        }
      }
    }
`;

content = content.replace(/async function addTransaction\(e\) \{([\s\S]*?)function deleteTransaction\(index\) \{([\s\S]*?)function saveAccounting\(\) \{([\s\S]*?)\}/, newAddTransaction);

fs.writeFileSync('public/backend.html', content);
