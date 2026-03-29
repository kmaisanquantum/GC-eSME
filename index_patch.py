import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Replace the messy handleGoogleCallback/socialLogin section one last time with a solid version
clean_scripts = """
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
        google.accounts.id.prompt();
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
        const res = await fetch('/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, ...userData })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        localStorage.setItem('um_user', JSON.stringify(data.user));
        alert(`Logged in with ${provider.charAt(0).toUpperCase() + provider.slice(1)}!`);
        closeAuthModal();
        checkUserSession();
      } catch (err) {
        alert(err.message);
      }
    }
"""

# The markers
start_marker = "function handleGoogleCallback(response) {"
end_marker = "// Call checkUserSession on init"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + clean_scripts.strip() + "\n\n    " + content[end_idx:]
    with open('public/index.html', 'w') as f:
        f.write(new_content)
    print("Fixed scripts")

# Also fix the initGSI to use window.google
content = open('public/index.html').read()
content = content.replace("google.accounts.id", "window.google.accounts.id")
with open('public/index.html', 'w') as f:
    f.write(content)
