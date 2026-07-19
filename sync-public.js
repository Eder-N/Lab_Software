const fs = require("fs");
const path = require("path");

const root = __dirname;
const publicDir = path.join(root, "public");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "supabase-config.js",
  "price-lists.css",
  "price-lists.js",
  "proof-flow.css",
  "proof-flow.js",
  "finance-enhancements.js",
];

fs.mkdirSync(publicDir, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  const target = path.join(publicDir, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, target);
    console.log(`Sincronizado: ${file}`);
  }
}
