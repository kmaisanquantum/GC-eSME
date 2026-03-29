import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Replace the messy socialLogin and handleSocialAuth functions
new_scripts = """
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
        return;
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
        return;
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

# Find the start of the messy section
start_marker = "function handleGoogleCallback(response) {"
# Find the end of handleSocialAuth
end_marker = "// Call checkUserSession on init"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + new_scripts.strip() + "\n\n    " + content[end_idx:]
    with open('public/index.html', 'w') as f:
        f.write(new_content)
    print("Successfully fixed social auth scripts")
else:
    print(f"Markers not found: start={start_idx}, end={end_idx}")

# Also replace the placeholder CLIENT_ID if possible, but I'll leave it for now as it's a template.
