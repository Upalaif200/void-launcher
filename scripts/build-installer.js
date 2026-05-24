const { build } = require('electron-builder');
const path = require('path');
const fs = require('fs');

async function main() {
  const distDir = path.join(__dirname, '..', 'dist');
  const winDir = path.join(distDir, 'win-unpacked');

  if (fs.existsSync(winDir)) {
    fs.rmSync(winDir, { recursive: true, force: true });
  }

  await build({
    config: {
      appId: 'com.voidlauncher.app',
      productName: 'Void-Launcher',
      directories: { output: 'dist' },
      electronDist: 'node_modules/electron/dist',
      win: { target: 'nsis', icon: 'build/icon.ico' },
      nsis: {
        oneClick: true,
        perMachine: false,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: 'Void-Launcher',
        installerIcon: 'build/icon.ico',
        uninstallerIcon: 'build/icon.ico'
      },
      files: [
        'main.js', 'background.js', 'skin3d.js', 'renderer.js',
        'index.html', 'style.css', 'package.json',
        'node_modules/**/*', 'assets/**/*',
        'build/icon.png', 'build/icon.ico'
      ],
      extraResources: [
        'authlib-injector.jar',
        { from: 'void-mod/build/libs/', to: 'mods/', filter: ['keystrokes-1.0.0.jar'] }
      ],
      publish: ['github']
    },
    projectDir: path.join(__dirname, '..')
  });
}

main().catch(e => { console.error(e); process.exit(1); });
