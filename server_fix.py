import re

with open('server.js', 'r') as f:
    content = f.read()

# Update the social auth endpoint
social_auth_logic = """
app.post("/api/auth/social", (req, res) => {
  const { provider, name, email, id, token, role } = req.body;

  if (!id || !provider) {
    return res.status(400).json({ error: "Missing required social auth parameters" });
  }

  const table = role === 'vendor' ? 'vendors' : 'users';

  // Check if a social account already exists with this ID and provider
  db.get(`SELECT * FROM ${table} WHERE social_provider = ? AND social_id = ?`, [provider, id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      return res.json({ message: "Login successful", [role === 'vendor' ? 'vendor' : 'user']: row });
    } else {
      // Check if a user/vendor already exists with this email
      db.get(`SELECT * FROM ${table} WHERE email = ?`, [email], (err, existingRow) => {
        if (err) return res.status(500).json({ error: err.message });

        if (existingRow) {
          // Link social account to existing email record
          const updateSql = `UPDATE ${table} SET social_provider = ?, social_id = ? WHERE id = ?`;
          db.run(updateSql, [provider, id, existingRow.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            existingRow.social_provider = provider;
            existingRow.social_id = id;
            res.json({ message: "Social account linked", [role === 'vendor' ? 'vendor' : 'user']: existingRow });
          });
        } else {
          // Create new record
          if (role === 'vendor') {
             const sql = "INSERT INTO vendors (name, email, social_provider, social_id, category, location, phone) VALUES (?, ?, ?, ?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id, 'General', 'Garden City SME Market', ''], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               res.json({ message: "Social vendor account created", vendor: { id: this.lastID, name, email, social_provider: provider, social_id: id } });
             });
          } else {
             const sql = "INSERT INTO users (name, email, social_provider, social_id) VALUES (?, ?, ?, ?)";
             db.run(sql, [name, email, provider, id], function(err) {
               if (err) return res.status(500).json({ error: err.message });
               res.json({ message: "Social customer account created", user: { id: this.lastID, name, email, social_provider: provider, social_id: id } });
             });
          }
        }
      });
    }
  });
});
"""

# Find the start of the social auth endpoint
start_tag = 'app.post("/api/auth/social", (req, res) => {'
end_tag = '});' # Be careful with this one, need to find the correct closing brace

# Use a regex to match the whole block
pattern = re.compile(r'app\.post\("/api/auth/social".*?\}\);\s*\}\);\s*\}', re.DOTALL)
match = pattern.search(content)

if match:
    # Need to verify the end point properly.
    # The existing code was:
    # app.post("/api/auth/social", (req, res) => {
    #   ...
    #   db.get(..., (err, row) => {
    #     ...
    #     if (row) { ... }
    #     else {
    #       db.run(..., function(err) {
    #         ...
    #       });
    #     }
    #   });
    # });

    # Let's use a simpler string replacement for the start and end of the block
    start_idx = content.find(start_tag)
    # The block ends after the db.get callback and the app.post callback
    # I'll look for the next valid endpoint to find the end
    next_endpoint = 'app.post("/api/auth/customer/register"'
    end_idx = content.find(next_endpoint)

    if start_idx != -1 and end_idx != -1:
        new_content = content[:start_idx] + social_auth_logic.strip() + "\n\n" + content[end_idx:]
        with open('server.js', 'w') as f:
            f.write(new_content)
        print("Updated social auth in server.js")
    else:
        print("Could not find block indices")
else:
    print("Pattern not found in server.js")

# Also need to add social_provider and social_id columns to vendors table if not exists
# I'll update the initDatabase function
with open('server.js', 'r') as f:
    content = f.read()

# Update vendors table definition
old_vendors_sql = """      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        facebook TEXT,
        password TEXT,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )"""

new_vendors_sql = """      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        phone TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT,
        facebook TEXT,
        password TEXT,
        email TEXT,
        social_provider TEXT,
        social_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )"""

content = content.replace(old_vendors_sql, new_vendors_sql)
with open('server.js', 'w') as f:
    f.write(content)
