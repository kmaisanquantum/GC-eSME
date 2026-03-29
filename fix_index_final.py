with open('public/index.html', 'r') as f:
    content = f.read()

content = content.replace('          </div>\n          </div>\n          \n          <p id="authToggleMsg"', '          </div>\n          \n          <p id="authToggleMsg"')

with open('public/index.html', 'w') as f:
    f.write(content)
