// PWA Install and Fallback Logic for Garden City SME
(function() {
  window.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('pwa-install-btn');
    let deferredPrompt = null;

    if (!installBtn) return;

    // Detect environment
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isFirefox = /Firefox|FxiOS/i.test(ua);
    const isSamsung = /SamsungBrowser/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Always show the install button unless already in standalone mode
    if (!isStandalone) {
      installBtn.classList.remove('hidden');
    }

    // Capture the native Chromium install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      // Ensure button is visible when prompt is ready
      if (!isStandalone) {
        installBtn.classList.remove('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      deferredPrompt = null;
      console.log('PWA was installed successfully');
    });

    installBtn.addEventListener('click', () => {
      const currentStandalone = window.matchMedia('(display-mode: standalone)').matches;
      if (currentStandalone) {
        alert("Garden City SME is already running as an installed application!");
        return;
      }

      // iOS Safari fallback
      if (isIOS) {
        alert("To install Garden City SME on your iOS device:\n\n1. Tap the Share icon (at the bottom/top of Safari).\n2. Scroll down and tap 'Add to Home Screen'.");
        return;
      }

      // No native prompt available fallback
      if (!deferredPrompt) {
        if (isFirefox) {
          if (isAndroid) {
            alert("To install Garden City SME on Firefox for Android:\n\n1. Open the browser menu (three dots ⋮ icon next to the address bar).\n2. Tap 'Install' or 'Add to Home screen'.\n\nFor the best app experience, you can also open this website in Google Chrome to install it with one click, or download the direct Android installer (APK) from our site.");
          } else {
            if (confirm("Firefox on desktop does not support installing Progressive Web Apps (PWAs) natively.\n\nTo install the app, we recommend opening this website in Google Chrome, Microsoft Edge, or Safari.\n\nWould you like to download our direct Android installer (APK) instead?")) {
              window.location.href = "/downloads/garden-city-sme.apk";
            }
          }
        } else if (isSamsung) {
          alert("To install using Samsung Internet:\n\n1. Tap the menu icon (three horizontal lines ☰ at the bottom right).\n2. Tap 'Add page to' -> 'Home screen', or tap the Install (+) icon in the address bar.");
        } else if (isAndroid) {
          alert("To install Garden City SME on your Android device:\n\n1. Open your browser menu (usually three dots ⋮ at the top right).\n2. Tap 'Install app' or 'Add to Home screen'.\n\nAlternatively, you can download the direct Android installer (APK) from our site.");
        } else {
          alert("To install Garden City SME:\n\nClick the install icon in your browser's address bar (URL bar), or open the browser menu and select 'Install' or 'Add to Home screen'.");
        }
        return;
      }

      // Trigger native Chromium prompt
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;
        installBtn.classList.add('hidden');
      });
    });
  });
})();
