import re

with open('public/index.html', 'r') as f:
    content = f.read()

# 1. Update socialLogin and handleGoogleCallback
# We need to add the callback function for GSI

script_update = """
    function handleGoogleCallback(response) {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      handleSocialAuth('google', {
        name: payload.name,
        email: payload.email,
        id: payload.sub,
        token: response.credential
      });
    }

    async function socialLogin(provider) {
      if (provider === 'google') {
        // GSI is handled via the button and One Tap, but we can trigger the prompt manually
        google.accounts.id.prompt();
        return;
      }
"""

# Replace the existing socialLogin function start
content = content.replace("async function socialLogin(provider) {\n      if (provider === 'google') {", script_update)

# 2. Initialize GSI
init_gsi = """
    function initGSI() {
      google.accounts.id.initialize({
        client_id: 'your-google-client-id.apps.googleusercontent.com', // To be replaced by server-side injection if possible, or just leave as placeholder
        callback: handleGoogleCallback
      });
      google.accounts.id.renderButton(
        document.getElementById("g_id_signin"),
        { theme: "outline", size: "large", width: "100%" }
      );
      google.accounts.id.prompt(); // also display the One Tap dialog
    }

    // Call initGSI after GSI library is loaded or in init
"""

# Find where to insert initGSI (before init)
content = content.replace("async function init() {", init_gsi + "\n    async function init() {\n      initGSI();")

with open('public/index.html', 'w') as f:
    f.write(content)
