import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Fix the messy handleGoogleCallback/socialLogin section again
# I seem to have left some debris from previous attempts

# Start of the messy part
start_marker = "function handleGoogleCallback(response) {"
# The part I want to keep
clean_section = """
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

# Find the end of handleSocialAuth
end_marker = "// Call checkUserSession on init"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + clean_section.strip() + "\n\n    " + content[end_idx:]

with open('public/index.html', 'w') as f:
    f.write(content)
