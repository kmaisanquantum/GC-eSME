const fs = require('fs');
let content = fs.readFileSync('public/backend.html', 'utf8');

const botHtml = `
      <div class="card" style="padding: 1.5rem; background: var(--bg-card); margin-top: 1rem;">
        <h3 style="color: var(--text-accent); margin-bottom: 1rem;">💬 WhatsApp-Style Assistant</h3>
        <div id="botChat" style="height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 10px; font-size: 0.85rem;">
          <div style="background: var(--primary); color: white; padding: 6px 12px; border-radius: 12px 12px 12px 0; margin-bottom: 8px; width: fit-content; max-width: 80%;">
             Hello! I'm your Garden City SME Assistant. How can I help?
          </div>
        </div>
        <form id="botForm" style="display: flex; gap: 8px;">
          <input type="text" id="botInput" class="input" placeholder="e.g. log sale 50" style="flex: 1; height: 40px;">
          <button type="submit" class="btn btn-primary" style="padding: 0 20px;">Send</button>
        </form>
      </div>
`;

content = content.replace(/<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div id="tab-overview" class="tab-content">/,
    '</div></div></div>' + botHtml + '</div><div id="tab-overview" class="tab-content">');

const botScript = `
    document.getElementById('botForm').onsubmit = async (e) => {
      e.preventDefault();
      const input = document.getElementById('botInput');
      const text = input.value;
      if (!text) return;

      const chat = document.getElementById('botChat');
      chat.innerHTML += \`<div style="background: rgba(255,255,255,0.1); color: white; padding: 6px 12px; border-radius: 12px 12px 0 12px; margin-bottom: 8px; margin-left: auto; width: fit-content; max-width: 80%;">\${text}</div>\`;
      input.value = '';
      chat.scrollTop = chat.scrollHeight;

      try {
        const res = await fetch(\`\${API_URL}/bot/command\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendor_id: currentVendor.id, text })
        });
        const data = await res.json();
        chat.innerHTML += \`<div style="background: var(--primary); color: white; padding: 6px 12px; border-radius: 12px 12px 12px 0; margin-bottom: 8px; width: fit-content; max-width: 80%;">\${data.response}</div>\`;
        chat.scrollTop = chat.scrollHeight;
        if (text.toLowerCase().includes('log sale')) updateAccountingUI();
      } catch (err) {
        chat.innerHTML += \`<div style="background: #ef4444; color: white; padding: 6px 12px; border-radius: 12px 12px 12px 0; margin-bottom: 8px; width: fit-content; max-width: 80%;">Error communicating with bot.</div>\`;
      }
    };
`;

content = content.replace('init();', botScript + '\n    init();');
fs.writeFileSync('public/backend.html', content);
