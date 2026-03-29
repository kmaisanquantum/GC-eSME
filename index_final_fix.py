import re

with open('public/index.html', 'r') as f:
    content = f.read()

# 1. Update customer registration labels
content = content.replace('<label class="form-label">Business Name</label>', '<label class="form-label">Your Name</label>')
content = content.replace('placeholder="My Awesome Shop"', 'placeholder="John Doe"')

# 2. Fix GSI initialization to be more robust and use custom button styling
# We'll hide the GSI button and trigger it from our own button
# But GSI doesn't like being triggered without user interaction on their own button.
# Let's just use the GSI button for Google and our button for Facebook.

social_btns_html = """
          <div class="social-btns">
            <div id="g_id_signin"></div>
            <button class="social-btn facebook-btn" onclick="socialLogin('facebook')">
              <svg style="width:18px;height:18px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.04C6.5 2.04 2 6.53 2 12.06C2 17.06 5.66 21.21 10.44 21.96V14.96H7.9V12.06H10.44V9.85C10.44 7.34 11.93 5.96 14.22 5.96C15.31 5.96 16.45 6.15 16.45 6.15V8.62H15.19C13.95 8.62 13.56 9.39 13.56 10.18V12.06H16.34L15.89 14.96H13.56V21.96A10 10 0 0 0 22 12.06C22 6.53 17.5 2.04 12 2.04Z" /></svg>
              Continue with Facebook
            </button>
          </div>
"""

# Replace the social-btns section
start_tag = '<div class="social-btns">'
end_tag = '</div>\n          \n          <p id="authToggleMsg"'
start_idx = content.find(start_tag)
end_idx = content.find(end_tag)

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + social_btns_html.strip() + "\n          " + content[end_idx:]

# 3. Update the handleSocialAuth function call to include 'role: customer'
content = content.replace("body: JSON.stringify({ provider, ...userData })", "body: JSON.stringify({ provider, role: 'customer', ...userData })")

with open('public/index.html', 'w') as f:
    f.write(content)
