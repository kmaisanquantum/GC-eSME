import re

with open('public/index.html', 'r') as f:
    content = f.read()

# Look for the authModal section and remove the duplicates that appeared after it
# The duplication seems to start after the first modal-body ends.
# We want to keep one full authModal and remove everything until the next valid section (the nav bar)

pattern = re.compile(r'(<div id="authModal" class="modal">.*?</div>\s*</div>\s*</div>\s*</div>)', re.DOTALL)
match = pattern.search(content)

if match:
    full_modal = match.group(1)
    # The actual structure is:
    # <div id="authModal" class="modal">
    #   <div class="modal-content">
    #     <div class="modal-header">...</div>
    #     <div class="modal-body">...</div>
    #   </div>
    # </div>
    # Let's clean it up properly.

    clean_modal = """
  <div id="authModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle" style="color: var(--text-accent);">Sign In</h3>
        <button onclick="closeAuthModal()" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer;">&times;</button>
      </div>
      <div class="modal-body">
        <div id="authContent">
          <!-- Login Form -->
          <form id="loginForm">
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" id="loginEmail" class="form-input" placeholder="vendor@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="loginPassword" class="form-input" placeholder="••••••••" required>
            </div>
            <button type="submit" class="auth-btn" style="width:100%; padding: 12px;">Sign In</button>
          </form>

          <!-- Register Form -->
          <form id="registerForm" class="hidden">
            <div class="form-group">
              <label class="form-label">Business Name</label>
              <input type="text" id="regName" class="form-input" placeholder="My Awesome Shop" required>
            </div>
            <div class="form-group">
              <label class="form-label">Email Address</label>
              <input type="email" id="regEmail" class="form-input" placeholder="vendor@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label">Phone Number</label>
              <input type="tel" id="regPhone" class="form-input" placeholder="70000000" required>
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="regPassword" class="form-input" placeholder="••••••••" required>
            </div>
            <button type="submit" class="auth-btn" style="width:100%; padding: 12px;">Create Account</button>
          </form>

          <div style="margin: 1.5rem 0; display: flex; align-items: center; gap: 1rem; color: var(--text-muted); font-size: 0.8rem;">
            <div style="flex: 1; height: 1px; background: var(--border);"></div>
            <span>OR</span>
            <div style="flex: 1; height: 1px; background: var(--border);"></div>
          </div>

          <div class="social-btns">
            <!-- Google One Tap / GSI will be injected here or use a custom button -->
            <div id="g_id_signin"></div>
            <button class="social-btn facebook-btn" onclick="socialLogin('facebook')">Continue with Facebook</button>
          </div>

          <p id="authToggleMsg" style="text-align: center; margin-top: 1.5rem; font-size: 0.875rem; color: var(--text-muted);">
            Don't have an account? <a href="#" onclick="setAuthMode('register')" style="color: var(--text-accent);">Sign up here</a>
          </p>
        </div>
      </div>
    </div>
  </div>
"""
    # Replace the whole messy section including duplicates
    start_tag = '<div id="authModal" class="modal">'
    end_tag = '<nav class="nav">'

    start_idx = content.find(start_tag)
    end_idx = content.find(end_tag)

    if start_idx != -1 and end_idx != -1:
        new_content = content[:start_idx] + clean_modal + "\n  " + content[end_idx:]
        with open('public/index.html', 'w') as f:
            f.write(new_content)
        print("Successfully cleaned up index.html")
    else:
        print(f"Tags not found: start={start_idx}, end={end_idx}")
else:
    print("Pattern not found")
