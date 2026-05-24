const fs = require('fs');
const path = require('path');

function copyRecursiveSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursiveSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

exports.default = async function (context) {
  const appDir = path.join(context.appOutDir, 'resources', 'app');
  const src = path.join(__dirname, '..', 'node_modules', 'three', 'examples', 'jsm');
  const dest = path.join(appDir, 'node_modules', 'three', 'examples', 'jsm');
  if (!fs.existsSync(src)) {
    console.warn('[after-pack] three/examples/jsm not found in source');
    return;
  }
  copyRecursiveSync(src, dest);
  console.log('[after-pack] Copied three/examples/jsm → packaged app');
};
