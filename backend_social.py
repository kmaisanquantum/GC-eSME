import re

with open('public/backend.html', 'r') as f:
    content = f.read()

# 1. Add GSI and FB scripts to head
head_scripts = """
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>
"""
content = content.replace('</head>', head_scripts + '\n</head>')

# 2. Add social login buttons to auth card
social_html = """
        <div style="margin: 1.5rem 0; display: flex; align-items: center; gap: 1rem; color: var(--text-muted); font-size: 0.8rem;">
          <div style="flex: 1; height: 1px; background: var(--border);"></div>
          <span>OR</span>
          <div style="flex: 1; height: 1px; background: var(--border);"></div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div id="g_id_signin"></div>
          <button type="button" class="btn" onclick="socialLogin('facebook')" style="background: #1877f2; color: #fff; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" /></svg>
            Continue with Facebook
          </button>
        </div>
"""

# Insert social_html after the loginForm button and before toggleAuthMode
content = content.replace('<button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Sign In</button>', '<button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Sign In</button>' + social_html)

# 3. Add social login logic to script
social_js = """
    function handleGoogleCallback(response) {
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      handleSocialAuth('google', {
        name: payload.name,
        email: payload.email,
        id: payload.sub,
        token: response.credential
      });
    }

    function initGSI() {
      window.google.accounts.id.initialize({
        client_id: 'your-google-client-id.apps.googleusercontent.com',
        callback: handleGoogleCallback
      });
      window.google.accounts.id.renderButton(
        document.getElementById("g_id_signin"),
        { theme: "outline", size: "large", width: "100%" }
      );
    }

    async function socialLogin(provider) {
      if (provider === 'google') {
        window.google.accounts.id.prompt();
      } else if (provider === 'facebook') {
        FB.login(function(response) {
          if (response.authResponse) {
            FB.api('/me', {fields: 'name,email'}, function(userData) {
              handleSocialAuth(provider, {
                name: userData.name,
                email: userData.email,
                id: userData.id,
                token: response.authResponse.accessToken
              });
            });
          }
        }, {scope: 'public_profile,email'});
      }
    }

    async function handleSocialAuth(provider, userData) {
      try {
        const res = await fetch(`${API_URL}/auth/social`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, role: 'vendor', ...userData })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        localStorage.setItem('um_vendor', JSON.stringify(data.vendor));
        currentVendor = data.vendor;
        alert(`Logged in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`);
        showDashboard();
      } catch (err) {
        alert(err.message);
      }
    }

    window.fbAsyncInit = function() {
      FB.init({
        appId      : 'your-facebook-app-id',
        cookie     : true,
        xfbml      : true,
        version    : 'v18.0'
      });
    };
"""

# Insert social_js at the beginning of script tag
content = content.replace('<script>', '<script>\n' + social_js)

# Call initGSI in init
content = content.replace('function init() {', 'function init() {\n      initGSI();')

with open('public/backend.html', 'w') as f:
    f.write(content)
