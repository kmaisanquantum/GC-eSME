const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// The automation_patch.js incorrectly appended extra braces/code
content = content.replace(/res\.json\(\{ message: 'Order status updated successfully' \}\);\n    \}\);\n  \}\);\n\}\);\n\n    res\.json\(\{ message: 'Order status updated successfully' \}\);\n  \}\);\n\}\);/m,
    "res.json({ message: 'Order status updated successfully' });\n    });\n  });\n});");

fs.writeFileSync('server.js', content);
