const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const svg = `<svg width="256" height="256" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="9,2.5 15.5,9 9,15.5 2.5,9" stroke="#8844ee" stroke-width="1.2" fill="none" opacity="0.7"/>
  <polygon points="9,5.5 12.5,9 9,12.5 5.5,9" stroke="#c8a8ff" stroke-width="1" fill="none" opacity="0.85"/>
  <line x1="2.5" y1="9" x2="5.5" y2="9" stroke="#8844ee" stroke-width="0.8" opacity="0.5"/>
  <line x1="15.5" y1="9" x2="12.5" y2="9" stroke="#8844ee" stroke-width="0.8" opacity="0.5"/>
  <line x1="9" y1="2.5" x2="9" y2="5.5" stroke="#8844ee" stroke-width="0.8" opacity="0.5"/>
  <line x1="9" y1="15.5" x2="9" y2="12.5" stroke="#8844ee" stroke-width="0.8" opacity="0.5"/>
  <line x1="2.5" y1="9" x2="9" y2="2.5" stroke="#6633cc" stroke-width="0.6" opacity="0.35"/>
  <line x1="2.5" y1="9" x2="9" y2="15.5" stroke="#6633cc" stroke-width="0.6" opacity="0.35"/>
  <line x1="15.5" y1="9" x2="9" y2="2.5" stroke="#6633cc" stroke-width="0.6" opacity="0.35"/>
  <line x1="15.5" y1="9" x2="9" y2="15.5" stroke="#6633cc" stroke-width="0.6" opacity="0.35"/>
  <circle cx="9" cy="2.5" r="1" fill="#a055ff" opacity="0.6"/>
  <circle cx="15.5" cy="9" r="1" fill="#a055ff" opacity="0.6"/>
  <circle cx="9" cy="15.5" r="1" fill="#a055ff" opacity="0.6"/>
  <circle cx="2.5" cy="9" r="1" fill="#a055ff" opacity="0.6"/>
</svg>`;

async function main() {
  const buildDir = path.join(__dirname, '..', 'build');
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });

  const pngBuffer = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  fs.writeFileSync(path.join(buildDir, 'icon.png'), pngBuffer);
  console.log('PNG created: build/icon.png (' + pngBuffer.length + ' bytes)');

  const icoBuffer = await pngToIco([pngBuffer]);
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
  console.log('ICO created: build/icon.ico (' + icoBuffer.length + ' bytes)');
}

main().catch(e => { console.error(e); process.exit(1); });
