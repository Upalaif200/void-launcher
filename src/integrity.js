'use strict';

const fs = require('fs');
const path = require('path');

function verifyAppIntegrity() {
    const errors = [];
    const baseDir = path.dirname(require.main?.filename || __dirname);

    const checks = [
        { name: 'main.js', minSize: 50000 },
        { name: 'renderer.js', minSize: 5000 },
        { name: 'preload.js', minSize: 50 },
        { name: 'index.html', minSize: 1000 },
        { name: 'style.css', minSize: 100 },
    ];

    for (const c of checks) {
        const fp = path.join(baseDir, c.name);
        if (!fs.existsSync(fp)) {
            errors.push(c.name + ': no encontrado');
            continue;
        }
        const size = fs.statSync(fp).size;
        if (size < c.minSize) {
            errors.push(c.name + ': tamaño insuficiente (' + size + ' B, esperado >' + c.minSize + ')');
        }
    }

    return { pass: errors.length === 0, errors };
}

function verifyAppOrigin() {
    const exePath = process.execPath.toLowerCase();
    const cwd = process.cwd().toLowerCase();
    const mainFile = (require.main?.filename || '').toLowerCase();

    const known = [
        'program files\\void launcher',
        'program files (x86)\\void launcher',
        'dist\\win-unpacked',
        'launch',         // dev folder
    ];

    const match = known.some(k => exePath.includes(k) || cwd.includes(k) || mainFile.includes(k));
    if (match) return { pass: true };

    const isDev = !require('electron')?.app?.isPackaged;
    return { pass: isDev, dev: isDev };
}

module.exports = { verifyAppIntegrity, verifyAppOrigin };
