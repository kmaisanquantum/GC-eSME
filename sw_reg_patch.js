const fs = require('fs');

function patch(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const swScript = `
    // Register Service Worker for Offline Sync
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('Service Worker registered with scope:', registration.scope);
          })
          .catch((error) => {
            console.error('Service Worker registration failed:', error);
          });
      });
    }
`;
  if (!content.includes('navigator.serviceWorker.register')) {
    content = content.replace('init();', swScript + '\n    init();');
    fs.writeFileSync(filePath, content);
  }
}

patch('public/index.html');
patch('public/backend.html');
