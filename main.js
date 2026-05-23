const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

// ─────────────────────────────────────────────
// RUTAS PERSISTENTES
// ─────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'launcher_config.json');
const gameRoot = userDataPath;

if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

// ─────────────────────────────────────────────
// CONFIG — CARGA / GUARDADO / MIGRACIÓN
// ─────────────────────────────────────────────
function generateId() {
    return crypto.randomBytes(8).toString('hex');
}

function loadConfig() {
    if (!fs.existsSync(configPath)) {
        const id = generateId();
        const profileId = generateId();
        const defaultCfg = {
            accounts: [{ id, username: 'Jugador', skinPath: '' }],
            activeAccountId: id,
            profiles: [{
                id: profileId,
                name: 'Default',
                icon: '⛏️',
                versionId: '',
                gameDirectory: '',
                ram: '4',
                jvmArgs: '',
                mods: []
            }],
            activeProfileId: profileId,
            appVersion: '1.1.0',
            cosmetics: { keystrokes: false, dynamicFov: true, damageTilt: true }
        };
        fs.writeFileSync(configPath, JSON.stringify(defaultCfg, null, 2));
        return defaultCfg;
    }

    let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Migrar config antigua (sin cosmetics)
    if (!cfg.cosmetics) {
        cfg.cosmetics = { keystrokes: false, dynamicFov: true, damageTilt: true };
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    }

    // Migrar config antigua (con username/ram en raíz)
    if (!cfg.accounts) {
        const id = generateId();
        const profileId = generateId();
        cfg = {
            accounts: [{ id, username: cfg.username || 'Jugador', skinPath: cfg.skinPath || '' }],
            activeAccountId: id,
            profiles: [{
                id: profileId,
                name: 'Default',
                icon: '⛏️',
                versionId: '',
                gameDirectory: '',
                ram: cfg.ram || '4',
                jvmArgs: '',
                mods: []
            }],
            activeProfileId: profileId,
            appVersion: '1.1.0'
        };
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    }

    return cfg;
}

function saveConfig(cfg) {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
}

// ─────────────────────────────────────────────
// VENTANA PRINCIPAL
// ─────────────────────────────────────────────
function createWindow() {
    const win = new BrowserWindow({
        width: 960,
        height: 620,
        frame: false,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
        },
        backgroundColor: '#0a0a0a'
    });
    win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ─────────────────────────────────────────────
// IPC — VENTANA
// ─────────────────────────────────────────────
ipcMain.on('close-app', () => app.quit());
ipcMain.on('minimize-app', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('get-userdata-path', (e) => { e.returnValue = userDataPath; });

// ─────────────────────────────────────────────
// IPC — CONFIG GENERAL
// ─────────────────────────────────────────────
ipcMain.on('get-config', (e) => { e.returnValue = loadConfig(); });
ipcMain.on('save-config', (_, cfg) => saveConfig(cfg));
ipcMain.on('save-cosmetics', (_, cosmetics) => {
    const cfg = loadConfig();
    cfg.cosmetics = cosmetics;
    saveConfig(cfg);
});

// ─────────────────────────────────────────────
// IPC — CUENTAS
// ─────────────────────────────────────────────
ipcMain.on('get-accounts', (e) => {
    const cfg = loadConfig();
    e.returnValue = { accounts: cfg.accounts, activeAccountId: cfg.activeAccountId };
});

ipcMain.on('add-account', (e, { username }) => {
    const cfg = loadConfig();
    const id = generateId();
    cfg.accounts.push({ id, username: username.trim() || 'Jugador', skinPath: '' });
    if (!cfg.activeAccountId) cfg.activeAccountId = id;
    saveConfig(cfg);
    e.returnValue = cfg.accounts;
});

ipcMain.on('remove-account', (e, { id }) => {
    const cfg = loadConfig();
    cfg.accounts = cfg.accounts.filter(a => a.id !== id);
    if (cfg.activeAccountId === id) cfg.activeAccountId = cfg.accounts[0]?.id || '';
    saveConfig(cfg);
    e.returnValue = cfg.accounts;
});

ipcMain.on('set-active-account', (e, { id }) => {
    const cfg = loadConfig();
    cfg.activeAccountId = id;
    saveConfig(cfg);
    e.returnValue = true;
});

ipcMain.on('update-account-skin', (e, { id, skinPath }) => {
    const cfg = loadConfig();
    const acc = cfg.accounts.find(a => a.id === id);
    if (acc) acc.skinPath = skinPath;
    saveConfig(cfg);
    e.returnValue = true;
});

// ─────────────────────────────────────────────
// IPC — PERFILES
// ─────────────────────────────────────────────
ipcMain.on('get-profiles', (e) => {
    const cfg = loadConfig();
    e.returnValue = { profiles: cfg.profiles, activeProfileId: cfg.activeProfileId };
});

ipcMain.on('add-profile', (e, profileData) => {
    const cfg = loadConfig();
    const id = generateId();
    const profile = {
        id,
        name: profileData.name || 'Nuevo Perfil',
        icon: profileData.icon || '⛏️',
        versionId: profileData.versionId || '',
        gameDirectory: profileData.gameDirectory || '',
        ram: profileData.ram || '4',
        jvmArgs: profileData.jvmArgs || '',
        mods: []
    };
    cfg.profiles.push(profile);
    if (!cfg.activeProfileId) cfg.activeProfileId = id;
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('update-profile', (e, updatedProfile) => {
    const cfg = loadConfig();
    const idx = cfg.profiles.findIndex(p => p.id === updatedProfile.id);
    if (idx !== -1) cfg.profiles[idx] = { ...cfg.profiles[idx], ...updatedProfile };
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('remove-profile', (e, { id }) => {
    const cfg = loadConfig();
    cfg.profiles = cfg.profiles.filter(p => p.id !== id);
    if (cfg.activeProfileId === id) cfg.activeProfileId = cfg.profiles[0]?.id || '';
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('set-active-profile', (e, { id }) => {
    const cfg = loadConfig();
    cfg.activeProfileId = id;
    saveConfig(cfg);
    e.returnValue = true;
});

// ─────────────────────────────────────────────
// IPC — VERSIONES INSTALADAS
// ─────────────────────────────────────────────
ipcMain.on('get-installed-versions', (e) => {
    const versionsDir = path.join(gameRoot, 'versions');
    if (!fs.existsSync(versionsDir)) { e.returnValue = []; return; }
    const versions = fs.readdirSync(versionsDir, { withFileTypes: true })
        .filter(d => d.isDirectory()).map(d => d.name);
    e.returnValue = versions;
});

// ─────────────────────────────────────────────
// SKIN LOCAL SERVER
// ─────────────────────────────────────────────
const SKIN_SERVER_PORT = 34291;
let skinServer = null;

function startSkinServer() {
    if (skinServer) return;
    skinServer = http.createServer((req, res) => {
        if (req.url === '/' || req.url === '/api' || req.url === '') {
            const body = JSON.stringify({
                meta: {
                    serverName: 'VoidLauncher',
                    implementationName: 'LocalSkinServer',
                    implementationVersion: '1.0.0'
                },
                skinDomains: ['127.0.0.1', 'localhost'],
                'feature.non_email_login': true
            });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
            return res.end(body);
        }

        if (req.url.startsWith('/sessionserver/session/minecraft/profile/')) {
            const parts = req.url.split('/');
            const uuid = parts[parts.length - 1].split('?')[0].replace(/-/g, '');
            const cfg = loadConfig();
            const account = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
            const username = account?.username || 'Jugador';

            const texturePayload = {
                timestamp: Date.now(), profileId: uuid, profileName: username,
                textures: { SKIN: { url: `http://127.0.0.1:${SKIN_SERVER_PORT}/skin/${encodeURIComponent(username)}.png` } }
            };
            const profile = {
                id: uuid, name: username,
                properties: [{ name: 'textures', value: Buffer.from(JSON.stringify(texturePayload)).toString('base64') }]
            };
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            return res.end(JSON.stringify(profile));
        }

        if (req.url.startsWith('/skin/')) {
            const cfg = loadConfig();
            const account = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
            const skinFile = account?.skinPath ? path.resolve(account.skinPath) : null;
            if (!skinFile || !fs.existsSync(skinFile)) { res.writeHead(404); return res.end('Skin not found'); }
            const data = fs.readFileSync(skinFile);
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
            return res.end(data);
        }

        res.writeHead(404); res.end();
    });
    skinServer.on('error', err => console.error('[SKIN-SERVER] Error:', err));
    skinServer.listen(SKIN_SERVER_PORT, '127.0.0.1', () => {
        console.log(`[SKIN-SERVER] ONLINE en http://127.0.0.1:${SKIN_SERVER_PORT}`);
    });
}

ipcMain.handle('open-skin-dialog', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Seleccionar Skin',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('open-dir-dialog', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Seleccionar directorio del perfil',
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        title: 'Seleccionar carpeta de destino',
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});

// ─────────────────────────────────────────────
// UTILIDADES DE DESCARGA
// ─────────────────────────────────────────────
function fetchJSON(url, extraHeaders = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const get = (currentUrl) => {
            const mod = currentUrl.startsWith('https') ? https : http;
            const headers = { 'User-Agent': 'VoidLauncher/1.1', ...extraHeaders };
            const req = mod.get(currentUrl, { headers }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} en ${currentUrl}`));
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON inválido: ' + e.message)); }
                });
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout (${timeoutMs}ms) en ${currentUrl}`)); });
        };
        get(url);
    });
}

function downloadFile(url, destPath, onProgress, extraHeaders = {}, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const file = fs.createWriteStream(destPath);
        const get = (currentUrl) => {
            const mod = currentUrl.startsWith('https') ? https : http;
            const headers = { 'User-Agent': 'VoidLauncher/1.1', ...extraHeaders };
            const req = mod.get(currentUrl, { headers }, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    return downloadFile(res.headers.location, destPath, onProgress, extraHeaders).then(resolve).catch(reject);
                }
                const total = parseInt(res.headers['content-length'] || '0');
                let downloaded = 0;
                res.on('data', chunk => {
                    downloaded += chunk.length;
                    if (total > 0 && onProgress) onProgress(downloaded, total);
                });
                res.pipe(file);
                file.on('finish', () => file.close(resolve));
                file.on('error', reject);
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => { req.destroy(); file.close(); if (fs.existsSync(destPath)) fs.unlinkSync(destPath); reject(new Error(`Timeout (${timeoutMs}ms) en ${currentUrl}`)); });
        };
        get(url);
    });
}

// ─────────────────────────────────────────────
// MERGE VERSIONS (Fabric heredado)
// ─────────────────────────────────────────────
function mergeVersions(root, childId) {
    const childPath = path.join(root, 'versions', childId, `${childId}.json`);
    if (!fs.existsSync(childPath)) return childId;
    let childJson = JSON.parse(fs.readFileSync(childPath, 'utf8'));
    if (!childJson.inheritsFrom || childJson.isFlattened) return childId;

    const parentId = childJson.inheritsFrom;
    const parentPath = path.join(root, 'versions', parentId, `${parentId}.json`);
    if (!fs.existsSync(parentPath)) { console.warn(`[MERGE] Parent ${parentId} not found!`); return childId; }

    const parentJson = JSON.parse(fs.readFileSync(parentPath, 'utf8'));
    const fixLibrary = (lib) => {
        if (!lib.downloads?.artifact) {
            const parts = lib.name.split(':');
            if (parts.length >= 3) {
                const group = parts[0].replace(/\./g, '/');
                const name = parts[1]; const version = parts[2];
                const jarPath = `${group}/${name}/${version}/${name}-${version}.jar`;
                const baseUrl = lib.url || (lib.name.includes('fabricmc') || lib.name.includes('asm') ? 'https://maven.fabricmc.net/' : 'https://libraries.minecraft.net/');
                lib.downloads = lib.downloads || {};
                lib.downloads.artifact = { path: jarPath, url: baseUrl.endsWith('/') ? baseUrl + jarPath : baseUrl + '/' + jarPath, sha1: lib.sha1 || '', size: lib.size || 0 };
            }
        }
        return lib;
    };
    const flatJson = {
        ...parentJson, ...childJson, id: childId,
        libraries: [...(parentJson.libraries || []).map(fixLibrary), ...(childJson.libraries || []).map(fixLibrary)],
        arguments: {
            game: [...(parentJson.arguments?.game || []), ...(childJson.arguments?.game || [])],
            jvm: [...(parentJson.arguments?.jvm || []), ...(childJson.arguments?.jvm || [])]
        },
        isFlattened: true
    };
    fs.writeFileSync(childPath, JSON.stringify(flatJson, null, 2));
    return childId;
}

// ─────────────────────────────────────────────
// DETECCIÓN DE JAVA (ruta simple — usada en Forge)
// ─────────────────────────────────────────────
function detectJava() {
    const candidates = [
        process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java.exe'),
        'C:\\Program Files\\Java\\jdk-25\\bin\\java.exe',
        'C:\\Program Files\\Java\\jdk-24\\bin\\java.exe',
        'C:\\Program Files\\Java\\jdk-23\\bin\\java.exe',
        'C:\\Program Files\\Java\\jdk-21\\bin\\java.exe',
        'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe',
        'C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe',
    ].filter(Boolean);
    for (const p of candidates) { if (fs.existsSync(p)) return p; }
    try {
        const r = require('child_process').execSync('where java', { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0];
        if (r && fs.existsSync(r)) return r;
    } catch (e) { /* ignore */ }
    return 'java';
}

function getJavaVersion(javaPath) {
    try {
        const out = require('child_process').execSync(`"${javaPath}" -version 2>&1`, { encoding: 'utf8', timeout: 5000 });
        const m = out.match(/version "(\d+)"/);
        return m ? parseInt(m[1], 10) : 0;
    } catch (e) { return 0; }
}

function findBestJava() {
    const checked = new Set();
    const candidates = [];

    if (process.env.JAVA_HOME) {
        const p = path.join(process.env.JAVA_HOME, 'bin', 'java.exe');
        if (fs.existsSync(p)) { candidates.push(p); checked.add(p); }
    }
    for (const v of [25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]) {
        const p = `C:\\Program Files\\Java\\jdk-${v}\\bin\\java.exe`;
        if (!checked.has(p) && fs.existsSync(p)) { candidates.push(p); checked.add(p); }
    }
    const oraclePath = 'C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\java.exe';
    if (fs.existsSync(oraclePath)) candidates.push(oraclePath);
    try {
        const r = require('child_process').execSync('where java', { encoding: 'utf8', timeout: 3000 }).trim().split('\n')[0];
        if (r && fs.existsSync(r) && !checked.has(r)) candidates.push(r);
    } catch (e) { /* ignore */ }

    let bestPath = 'java', bestVersion = 0;
    for (const p of candidates) {
        const v = getJavaVersion(p);
        if (v > bestVersion) { bestVersion = v; bestPath = p; }
    }
    return { path: bestPath, version: bestVersion };
}

const JAVA_CACHE_DIR = path.join(userDataPath, 'java');

async function fetchAdoptiumJson(majorVersion) {
    const url = `https://api.adoptium.net/v3/assets/feature_releases/${majorVersion}/ga?architecture=x64&image_type=jre&os=windows&page=0&page_size=1`;
    return fetchJSON(url, {}, 15000);
}

async function downloadJava(majorVersion) {
    const cachedJava = path.join(JAVA_CACHE_DIR, `jre-${majorVersion}`, 'bin', 'java.exe');
    if (fs.existsSync(cachedJava)) return cachedJava;

    const data = await fetchAdoptiumJson(majorVersion);
    const binary = data?.[0]?.binaries?.[0];
    if (!binary?.package?.link) throw new Error(`No se encontró JRE ${majorVersion} para descargar`);

    const tmpDir = path.join(JAVA_CACHE_DIR, '.tmp');
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const zipPath = path.join(tmpDir, `jre-${majorVersion}.zip`);
    const extractDir = path.join(JAVA_CACHE_DIR, `jre-${majorVersion}`);

    console.log(`[JAVA] Descargando JRE ${majorVersion}...`);
    await downloadFile(binary.package.link, zipPath, null, {}, 120000);

    console.log(`[JAVA] Extrayendo JRE ${majorVersion}...`);
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(tmpDir, true);

    // Buscar la carpeta extraída (nombres dinámicos: jdk-25.0.1+12-jre / OpenJDK25-jre)
    const entries = fs.readdirSync(tmpDir).filter(e =>
        e.startsWith('jdk-') || e.startsWith('jre-') || e.startsWith('OpenJDK')
    );
    const extractedFolder = entries.find(e => fs.statSync(path.join(tmpDir, e)).isDirectory());
    if (!extractedFolder) throw new Error('No se pudo encontrar la carpeta extraída de Java');

    fs.renameSync(path.join(tmpDir, extractedFolder), extractDir);
    // Limpiar tmp
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });

    const javaExe = path.join(extractDir, 'bin', 'java.exe');
    if (!fs.existsSync(javaExe)) throw new Error('java.exe no encontrado tras extraer JRE');
    console.log(`[JAVA] JRE ${majorVersion} listo en: ${extractDir}`);
    return javaExe;
}

async function ensureJava(minMajorVersion = 25) {
    const best = findBestJava();
    if (best.version >= minMajorVersion) return best.path;

    console.log(`[JAVA] Se necesita Java ${minMajorVersion}+, encontrado: ${best.version || 'ninguno'}. Descargando...`);
    try {
        return await downloadJava(minMajorVersion);
    } catch (e) {
        console.error('[JAVA] Error descargando:', e.message);
        return best.path; // fallback
    }
}

// ─────────────────────────────────────────────
// IPC — LANZAR JUEGO (MULTI-INSTANCIA)
// ─────────────────────────────────────────────
let activeInstances = 0;

ipcMain.on('get-active-instances', (e) => { e.returnValue = activeInstances; });

ipcMain.on('launch-game', async (event, { profileId }) => {
    startSkinServer();
    try {
        const cfg = loadConfig();
        const profile = cfg.profiles.find(p => p.id === profileId) || cfg.profiles[0];
        const account = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];

        if (!profile || !profile.versionId) {
            event.reply('launch-status', { type: 'error', data: 'Perfil sin versión configurada' });
            return;
        }

        const version = profile.versionId;
        const username = account?.username || 'Jugador';
        const ram = profile.ram || '4';
        const javaPath = await ensureJava(25);

        // gameDirectory: primero el del perfil, si no, uno automático por perfil
        let gameDir = profile.gameDirectory;
        if (!gameDir || !fs.existsSync(gameDir)) {
            gameDir = path.join(userDataPath, 'profiles', profile.id);
            fs.mkdirSync(gameDir, { recursive: true });
        }

        mergeVersions(gameRoot, version);

        const cleanUsername = username.replace(/\s+/g, '_');
        const auth = await Authenticator.getAuth(cleanUsername);

        // Parsear JVM args del perfil
        const profileJvmArgs = profile.jvmArgs
            ? profile.jvmArgs.split(/\s+/).filter(Boolean)
            : [];

        const baseArgs = [
            '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled',
            '-XX:MaxGCPauseMillis=150', '-XX:+UnlockExperimentalVMOptions',
            '-XX:+UseStringDeduplication', '-XX:+DisableExplicitGC'
        ];

        const injectorPath = path.join(__dirname, 'authlib-injector.jar');
        const agentArgs = fs.existsSync(injectorPath)
            ? [`-javaagent:${injectorPath}=http://127.0.0.1:${SKIN_SERVER_PORT}`, '-Dauthlibinjector.noAuthServer=true']
            : [];

        const opts = {
            authorization: auth,
            root: gameRoot,
            gameDirectory: gameDir,
            javaPath,
            version: { number: version, type: 'release' },
            memory: { max: `${ram}G`, min: `${ram}G` },
            customArgs: [...baseArgs, ...profileJvmArgs, ...agentArgs]
        };

        // ── Aplicar cosméticos ──
        const cosmetics = cfg.cosmetics || { keystrokes: false, dynamicFov: true, damageTilt: true };

        // Dynamic FOV / Damage Tilt → options.txt
        const optPath = path.join(gameDir, 'options.txt');
        let optionsTxt = '';
        if (fs.existsSync(optPath)) {
            optionsTxt = fs.readFileSync(optPath, 'utf8');
        }
        const setOpt = (key, value) => {
            const re = new RegExp(`^${key}:[^\r\n]*`, 'm');
            const line = `${key}:${value}`;
            if (re.test(optionsTxt)) {
                optionsTxt = optionsTxt.replace(re, line);
            } else {
                optionsTxt += (optionsTxt ? '\r\n' : '') + line;
            }
        };
        if (!cosmetics.dynamicFov) setOpt('fovEffectScale', '0.0');
        if (!cosmetics.damageTilt) setOpt('damageTiltStrength', '0.0');
        fs.writeFileSync(optPath, optionsTxt, 'utf8');

        // Keystrokes mod (solo Fabric)
        if (cosmetics.keystrokes && version.includes('fabric')) {
            const modsDir = path.join(gameDir, 'mods');
            fs.mkdirSync(modsDir, { recursive: true });
            const keystrokesJar = path.join(__dirname, 'void-mod', 'build', 'libs', 'keystrokes-1.0.0.jar');
            if (fs.existsSync(keystrokesJar)) {
                const dest = path.join(modsDir, 'keystrokes-1.0.0.jar');
                fs.copyFileSync(keystrokesJar, dest);
                console.log('[COSMETICS] Keystrokes mod instalado');
            } else {
                console.log('[COSMETICS] keystrokes.jar no encontrado, saltando');
            }
        }

        // Crear una instancia nueva por lanzamiento (multi-instancia)
        const instanceLauncher = new Client();
        activeInstances++;
        event.reply('launch-status', { type: 'instances', data: activeInstances });

        instanceLauncher.launch(opts);
        instanceLauncher.on('debug', e => console.log('[DEBUG]', e));
        instanceLauncher.on('data', e => console.log('[DATA]', e));
        instanceLauncher.on('progress', e => event.reply('launch-status', { type: 'progress', data: e }));
        instanceLauncher.on('close', (code) => {
            activeInstances = Math.max(0, activeInstances - 1);
            console.log('[CLOSE] Instancia cerrada, activas:', activeInstances);
            const win = BrowserWindow.getAllWindows()[0];
            if (win && !win.isVisible()) win.show();
            event.reply('launch-status', { type: 'close', data: code, instances: activeInstances });
        });

        // Ocultar solo si no hay otras instancias corriendo
        if (activeInstances === 1) {
            const win = BrowserWindow.getAllWindows()[0];
            if (win) setTimeout(() => win.hide(), 3000);
        }

    } catch (err) {
        console.error('[LAUNCH ERROR]', err);
        activeInstances = Math.max(0, activeInstances - 1);
        event.reply('launch-status', { type: 'error', data: err.message });
    }
});

// ─────────────────────────────────────────────
// IPC — VERSIONES VANILLA
// ─────────────────────────────────────────────
ipcMain.handle('get-vanilla-versions', async () => {
    console.log('[MAIN] get-vanilla-versions called');
    try {
        const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        console.log('[MAIN] get-vanilla-versions OK, count:', manifest.versions.length);
        return manifest.versions.map(v => ({ id: v.id, type: v.type, url: v.url }));
    } catch (e) {
        console.error('[MAIN] get-vanilla-versions ERROR:', e.message);
        throw e;
    }
});

// ─────────────────────────────────────────────
// IPC — VERSIONES FABRIC
// ─────────────────────────────────────────────
ipcMain.handle('get-fabric-versions', async () => {
    console.log('[MAIN] get-fabric-versions called');
    try {
        const loaders = await fetchJSON('https://meta.fabricmc.net/v2/versions/loader');
        const result = loaders.filter(l => l.stable === true).map(l => l.version);
        console.log('[MAIN] get-fabric-versions OK, count:', result.length);
        return result;
    } catch (e) {
        console.error('[MAIN] get-fabric-versions ERROR:', e.message);
        throw e;
    }
});

// ─────────────────────────────────────────────
// IPC — VERSIONES FORGE
// ─────────────────────────────────────────────
ipcMain.handle('get-forge-versions', async (_, { mcVersion }) => {
    try {
        const data = await fetchJSON(`https://mc-versions-api.net/api/forge?version=${mcVersion}`);
        // La API devuelve { version: [...] } o array directamente
        const list = Array.isArray(data) ? data : (data.version || data.versions || []);
        return list.slice(0, 30).map(entry => {
            const forgeVer = typeof entry === 'string' ? entry : (entry.version || entry.id || String(entry));
            return forgeVer;
        });
    } catch (e) {
        console.error('[FORGE VERSIONS]', e.message);
        return [];
    }
});

// ─────────────────────────────────────────────
// IPC — INSTALAR VANILLA + FABRIC (existente)
// ─────────────────────────────────────────────
ipcMain.handle('install-version', async (event, { vanillaId, fabricVersion }) => {
    const rootPath = gameRoot;
    const send = (msg, percent) => event.sender.send('install-progress', { msg, percent });

    try {
        send(`Obteniendo metadatos de ${vanillaId}...`, 2);
        const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const versionEntry = manifest.versions.find(v => v.id === vanillaId);
        if (!versionEntry) throw new Error(`Versión ${vanillaId} no encontrada`);

        const versionJson = await fetchJSON(versionEntry.url);
        const versionDir = path.join(rootPath, 'versions', vanillaId);
        fs.mkdirSync(versionDir, { recursive: true });
        fs.writeFileSync(path.join(versionDir, `${vanillaId}.json`), JSON.stringify(versionJson, null, 2));
        send(`Metadatos de ${vanillaId} guardados`, 8);

        const clientJar = path.join(versionDir, `${vanillaId}.jar`);
        if (!fs.existsSync(clientJar)) {
            send(`Descargando ${vanillaId}.jar...`, 10);
            await downloadFile(versionJson.downloads.client.url, clientJar,
                (dl, total) => send(`Descargando JAR... ${Math.round(dl / total * 100)}%`, 10 + Math.round(dl / total * 30)));
        }
        send(`JAR de ${vanillaId} listo`, 40);

        send('Descargando librerías...', 42);
        const libs = versionJson.libraries || [];
        for (let i = 0; i < libs.length; i++) {
            const artifact = libs[i].downloads?.artifact;
            if (!artifact?.url) continue;
            const libPath = path.join(rootPath, 'libraries', artifact.path);
            if (!fs.existsSync(libPath)) await downloadFile(artifact.url, libPath, null);
            send(`Librerías: ${i + 1}/${libs.length}`, 42 + Math.round((i / libs.length) * 20));
        }
        send('Librerías listas', 62);

        if (fabricVersion) {
            await ensureFabricInstalled(vanillaId, fabricVersion, (m, p) => send(m, 64 + Math.round(p * 0.28)));
        }

        send('Descargando índice de assets...', 93);
        const assetIndex = versionJson.assetIndex;
        const assetIndexPath = path.join(rootPath, 'assets', 'indexes', `${assetIndex.id}.json`);
        if (!fs.existsSync(assetIndexPath)) await downloadFile(assetIndex.url, assetIndexPath, null);
        send('Instalación completa', 100);

        const finalId = fabricVersion ? `fabric-loader-${fabricVersion}-${vanillaId}` : vanillaId;
        return { success: true, versionId: finalId };

    } catch (err) {
        console.error('[INSTALL]', err);
        return { success: false, error: err.message };
    }
});

// ─────────────────────────────────────────────
// IPC — INSTALAR FORGE
// ─────────────────────────────────────────────
ipcMain.handle('install-forge', async (event, { mcVersion, forgeVersion }) => {
    const send = (msg, percent) => event.sender.send('install-progress', { msg, percent });

    try {
        const forgeId = `${mcVersion}-${forgeVersion}`;
        const installerUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/${forgeId}/forge-${forgeId}-installer.jar`;
        const installerPath = path.join(userDataPath, 'downloads', `forge-${forgeId}-installer.jar`);

        // 1. Primero asegurar que la versión vanilla base está instalada
        send(`Verificando vanilla ${mcVersion}...`, 5);
        const vanillaDir = path.join(gameRoot, 'versions', mcVersion);
        if (!fs.existsSync(path.join(vanillaDir, `${mcVersion}.json`))) {
            send(`Descargando vanilla ${mcVersion}...`, 8);
            const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest.json');
            const vEntry = manifest.versions.find(v => v.id === mcVersion);
            if (!vEntry) throw new Error(`Versión vanilla ${mcVersion} no encontrada`);
            const vJson = await fetchJSON(vEntry.url);
            fs.mkdirSync(vanillaDir, { recursive: true });
            fs.writeFileSync(path.join(vanillaDir, `${mcVersion}.json`), JSON.stringify(vJson, null, 2));
            if (!fs.existsSync(path.join(vanillaDir, `${mcVersion}.jar`))) {
                await downloadFile(vJson.downloads.client.url, path.join(vanillaDir, `${mcVersion}.jar`),
                    (dl, t) => send(`Vanilla JAR: ${Math.round(dl / t * 100)}%`, 8 + Math.round(dl / t * 20)));
            }
        }
        send('Vanilla lista', 28);

        // 2. Descargar Forge installer
        send(`Descargando Forge installer ${forgeVersion}...`, 30);
        await downloadFile(installerUrl, installerPath,
            (dl, t) => send(`Forge installer: ${Math.round(dl / t * 100)}%`, 30 + Math.round(dl / t * 30)));
        send('Forge installer descargado', 60);

        // 3. Ejecutar el installer con --installClient
        const javaPath = detectJava();
        send('Ejecutando Forge installer (puede tardar varios minutos)...', 62);

        await new Promise((resolve, reject) => {
            const proc = spawn(javaPath, ['-jar', installerPath, '--installClient', gameRoot], {
                cwd: gameRoot
            });

            proc.stdout.on('data', d => {
                const msg = d.toString().trim();
                if (msg) { console.log('[FORGE INSTALLER]', msg); send(msg.substring(0, 80), 65); }
            });
            proc.stderr.on('data', d => {
                const msg = d.toString().trim();
                if (msg) console.log('[FORGE STDERR]', msg);
            });
            proc.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(`Forge installer terminó con código ${code}`));
            });
            proc.on('error', reject);
        });

        // 4. Buscar la versión generada por el installer
        send('Buscando versión de Forge instalada...', 90);
        const versionsDir = path.join(gameRoot, 'versions');
        const allVersions = fs.readdirSync(versionsDir, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name);
        const forgeVersionId = allVersions.find(v =>
            v.toLowerCase().includes('forge') && v.includes(mcVersion)
        ) || `forge-${forgeId}`;

        // 5. Merge si hereda de la vanilla
        mergeVersions(gameRoot, forgeVersionId);

        send(`Forge instalado: ${forgeVersionId}`, 100);
        return { success: true, versionId: forgeVersionId };

    } catch (err) {
        console.error('[FORGE INSTALL ERROR]', err);
        return { success: false, error: err.message };
    }
});

// ─────────────────────────────────────────────
// IPC — MODS MODRINTH
// ─────────────────────────────────────────────
ipcMain.handle('search-mods', async (_, { query, loader, gameVersion, offset = 0 }) => {
    try {
        const facets = [['project_type:mod']];
        if (loader) facets.push([`categories:${loader}`]);
        if (gameVersion) facets.push([`versions:${gameVersion}`]);
        const facetsStr = encodeURIComponent(JSON.stringify(facets));
        const q = encodeURIComponent(query || '');
        const url = `https://api.modrinth.com/v2/search?query=${q}&facets=${facetsStr}&limit=20&offset=${offset}`;
        const data = await fetchJSON(url);
        return { hits: data.hits || [], total: data.total_hits || 0 };
    } catch (e) {
        return { hits: [], total: 0, error: e.message };
    }
});

ipcMain.handle('get-mod-versions', async (_, { projectId, loader, gameVersion }) => {
    try {
        let url = `https://api.modrinth.com/v2/project/${projectId}/version`;
        const params = [];
        if (loader) params.push(`loaders=["${loader}"]`);
        if (gameVersion) params.push(`game_versions=["${gameVersion}"]`);
        if (params.length) url += '?' + params.join('&');
        const versions = await fetchJSON(url);
        return versions.slice(0, 10);
    } catch (e) {
        return [];
    }
});

ipcMain.handle('install-mod', async (event, { profileId, modFile, modId, modName }) => {
    const send = (msg, percent) => event.sender.send('mod-install-progress', { msg, percent });
    try {
        const cfg = loadConfig();
        const profile = cfg.profiles.find(p => p.id === profileId);
        if (!profile) throw new Error('Perfil no encontrado');

        // Determinar directorio de mods del perfil
        let gameDir = profile.gameDirectory;
        if (!gameDir || !fs.existsSync(gameDir)) {
            gameDir = path.join(userDataPath, 'profiles', profile.id);
        }
        const modsDir = path.join(gameDir, 'mods');
        fs.mkdirSync(modsDir, { recursive: true });

        const destPath = path.join(modsDir, modFile.filename);
        send(`Descargando ${modName}...`, 10);
        await downloadFile(modFile.url, destPath,
            (dl, t) => send(`Descargando: ${Math.round(dl / t * 100)}%`, 10 + Math.round(dl / t * 85)));

        // Registrar en el perfil
        if (!profile.mods) profile.mods = [];
        profile.mods = profile.mods.filter(m => m.id !== modId); // evitar duplicados
        profile.mods.push({ id: modId, name: modName, filename: modFile.filename, path: destPath });
        saveConfig(cfg);

        send('Mod instalado', 100);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('remove-mod', (event, { profileId, modId }) => {
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    if (!profile) { event.returnValue = false; return; }

    const mod = profile.mods?.find(m => m.id === modId);
    if (mod?.path && fs.existsSync(mod.path)) {
        try { fs.unlinkSync(mod.path); } catch { }
    }
    profile.mods = (profile.mods || []).filter(m => m.id !== modId);
    saveConfig(cfg);
    event.returnValue = true;
});

ipcMain.on('get-profile-mods', (event, { profileId }) => {
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    event.returnValue = profile?.mods || [];
});

// ─────────────────────────────────────────────
// IPC — DEPENDENCIAS DE UN MOD
// ─────────────────────────────────────────────
ipcMain.handle('get-mod-dependencies', async (_, { versionId }) => {
    try {
        const ver = await fetchJSON(`https://api.modrinth.com/v2/version/${versionId}`);
        const required = (ver.dependencies || []).filter(d => d.dependency_type === 'required');
        if (!required.length) return [];

        // Obtener info de cada dependencia
        const deps = await Promise.all(required.map(async (dep) => {
            try {
                const proj = await fetchJSON(`https://api.modrinth.com/v2/project/${dep.project_id}`);
                return { project_id: dep.project_id, version_id: dep.version_id, name: proj.title, slug: proj.slug };
            } catch { return { project_id: dep.project_id, version_id: dep.version_id, name: dep.project_id, slug: dep.project_id }; }
        }));
        return deps;
    } catch { return []; }
});

// ─────────────────────────────────────────────
// IPC — BUSCAR MODPACKS (CURSEFORGE)
// ─────────────────────────────────────────────
ipcMain.handle('search-modpacks', async (_, { query, offset = 0 }) => {
    try {
        const params = {
            gameId: CURSEFORGE_GAME_ID,
            classId: 4471, // Modpacks
            index: offset || 0,
            pageSize: 20
        };
        if (query) params.searchFilter = query;
        params.sortField = 2; // Popularity
        params.sortOrder = 'desc';

        const data = await cfRequest('/mods/search', params);
        // Mapear hits de CF al formato esperado por el renderer (o adaptar renderer después)
        // Por ahora, devolvemos data.data tal cual y el renderer se encargará
        return { hits: data.data || [], total: data.pagination?.totalCount || 0 };
    } catch (e) {
        return { hits: [], total: 0, error: e.message };
    }
});

ipcMain.handle('get-modpack-versions', async (_, { projectId }) => {
    try {
        const data = await cfRequest(`/mods/${projectId}/files`);
        return data.data || [];
    } catch { return []; }
});

// ─────────────────────────────────────────────
// IPC — INSTALAR MODPACK (.mrpack o CurseForge ZIP)
// ─────────────────────────────────────────────
ipcMain.handle('install-modpack', async (event, { profileId, versionData, modpackName }) => {
    const send = (msg, percent) => event.sender.send('modpack-progress', { msg, percent });
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    if (!profile) return { success: false, error: 'Perfil no encontrado' };

    let gameDir = profile.gameDirectory;
    if (!gameDir || !fs.existsSync(gameDir)) {
        gameDir = path.join(userDataPath, 'profiles', profile.id);
        fs.mkdirSync(gameDir, { recursive: true });
    }
    const modsDir = path.join(gameDir, 'mods');
    fs.mkdirSync(modsDir, { recursive: true });

    try {
        const downloadUrl = versionData.downloadUrl || (versionData.files?.find(f => f.filename?.endsWith('.mrpack') || f.fileName?.endsWith('.zip'))?.url);
        if (!downloadUrl) throw new Error('No se encontró URL de descarga para el modpack');

        const tmpPath = path.join(userDataPath, 'downloads', `mp_${Date.now()}.zip`);
        send(`Descargando modpack ${modpackName}...`, 5);
        await downloadFile(downloadUrl, tmpPath,
            (dl, t) => send(`Descargando: ${Math.round(dl / t * 100)}%`, 5 + Math.round(dl / t * 20)),
            { 'x-api-key': CURSEFORGE_API_KEY });

        const zip = new AdmZip(tmpPath);
        const modrinthEntry = zip.getEntry('modrinth.index.json');
        const cfEntry = zip.getEntry('manifest.json');

        if (modrinthEntry) {
            // FLUJO MODRINTH (Existente simplificado/adaptado)
            return await handleModpackModrinth(zip, modrinthEntry, profileId, modpackName, send, tmpPath);
        } else if (cfEntry) {
            // FLUJO CURSEFORGE
            return await handleModpackCurseForge(zip, cfEntry, profileId, modpackName, send, tmpPath);
        } else {
            throw new Error('Formato de modpack no reconocido (falta manifest.json o modrinth.index.json)');
        }

    } catch (err) {
        console.error('[MODPACK ERROR]', err);
        return { success: false, error: err.message };
    }
});

async function handleModpackCurseForge(zip, manifestEntry, profileId, modpackName, send, tmpPath) {
    const manifest = JSON.parse(zip.readAsText(manifestEntry));
    const mcVersion = manifest.minecraft?.version;
    const loaderInfo = manifest.minecraft?.modLoaders?.[0];
    const loaderId = loaderInfo?.id || ''; // ej: forge-47.2.0 o fabric-0.14.22

    let loaderType = '';
    let loaderVersion = '';
    if (loaderId.includes('fabric')) { loaderType = 'fabric'; loaderVersion = loaderId.split('-')[1]; }
    else if (loaderId.includes('forge')) { loaderType = 'forge'; loaderVersion = loaderId.split('-')[1]; }
    else if (loaderId.includes('neoforge')) { loaderType = 'neoforge'; loaderVersion = loaderId.split('-')[1]; }

    send(`Instalando MC ${mcVersion} (${loaderType})...`, 30);
    let targetVersionId = mcVersion;

    // Asegurar versión base
    await ensureVanillaInstalled(mcVersion, (m, p) => send(m, 30 + Math.round(p * 0.1)));

    if (loaderType === 'fabric' && loaderVersion) {
        targetVersionId = `fabric-loader-${loaderVersion}-${mcVersion}`;
        // Lógica de instalación de fabric (simplificada o llamar a handler externo)
        // ... (reusar lógica de ensureFabricInstalled si existiera)
    }

    // Descargar archivos de CF
    const files = manifest.files || [];
    send(`Resolviendo URLs para ${files.length} mods...`, 45);

    // Los modpacks de CF suelen tener cientos de mods. Batching es ideal.
    // CF API V1 tiene POST /mods/files para obtener info masiva.
    // Pero como estamos usando GET simple, lo haremos en grupos si fuera necesario.
    // Por simplicidad, fetch masivo:
    const fileIds = files.map(f => f.fileID);
    const filesData = await cfRequest('/mods/files', { fileIds: fileIds.join(',') }); // CF v1 soporta esto en algunos endpoints, probemos GET /mods/files?fileIds=...
    const filesList = filesData.data || [];

    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    let installedCount = 0;

    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        if (!file.downloadUrl) continue;

        const filename = file.fileName || `mod_${file.id}.jar`;
        const dest = path.join(userDataPath, 'profiles', profileId, 'mods', filename);

        if (!fs.existsSync(dest)) {
            await downloadFile(file.downloadUrl, dest, null, { 'x-api-key': CURSEFORGE_API_KEY });
        }

        if (!profile.mods) profile.mods = [];
        profile.mods.push({ id: String(file.modId), name: filename, filename, path: dest, source: 'curseforge' });

        installedCount++;
        send(`Descargando mods: ${i + 1}/${filesList.length}`, 50 + Math.round((i / filesList.length) * 40));
    }

    // Overrides
    send('Aplicando overrides...', 95);
    const overridesDir = manifest.overrides || 'overrides';
    const entries = zip.getEntries();
    for (const e of entries) {
        if (e.entryName.startsWith(overridesDir + '/') && !e.isDirectory) {
            const relPath = e.entryName.substring(overridesDir.length + 1);
            const dest = path.join(userDataPath, 'profiles', profileId, relPath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, e.getData());
        }
    }

    profile.versionId = targetVersionId;
    saveConfig(cfg);
    try { fs.unlinkSync(tmpPath); } catch { }

    send('¡Listo!', 100);
    return { success: true, modsInstalled: installedCount, mcVersion, loaderType, versionId: targetVersionId };
}

async function handleModpackModrinth(zip, indexEntry, profileId, modpackName, send, tmpPath) {
    // Reutilizar la lógica que ya estaba (líneas 845-968 aprox del archivo original)
    // Para no duplicar demasiado código, mantendré la estructura pero movida aquí.
    const index = JSON.parse(zip.readAsText(indexEntry));
    const deps = index.dependencies || {};
    const mcVersion = deps.minecraft || '';
    const loaderType = deps['fabric-loader'] ? 'fabric' : (deps['forge'] ? 'forge' : '');
    const loaderVersion = deps['fabric-loader'] || deps['forge'] || '';

    await ensureVanillaInstalled(mcVersion, (m, p) => send(m, 30 + Math.round(p * 0.1)));

    const files = index.files || [];
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    let installed = 0;

    for (let i = 0; i < files.length; i++) {
        const entry = files[i];
        const dlUrl = entry.downloads?.[0];
        if (!dlUrl) continue;
        const filename = path.basename(entry.path);
        const dest = path.join(userDataPath, 'profiles', profileId, entry.path);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (!fs.existsSync(dest)) await downloadFile(dlUrl, dest, null);
        if (entry.path.startsWith('mods/')) {
            if (!profile.mods) profile.mods = [];
            profile.mods.push({ id: `mp_${i}`, name: filename, filename, path: dest });
        }
        installed++;
        send(`Descargando mods: ${i + 1}/${files.length}`, 50 + Math.round((i / files.length) * 40));
    }

    const entries = zip.getEntries();
    for (const e of entries) {
        if (e.entryName.startsWith('overrides/') && !e.isDirectory) {
            const relPath = e.entryName.substring(10);
            const dest = path.join(userDataPath, 'profiles', profileId, relPath);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, e.getData());
        }
    }

    saveConfig(cfg);
    try { fs.unlinkSync(tmpPath); } catch { }
    return { success: true, modsInstalled: installed, mcVersion, loaderType };
}

// Utilidad: asegurar que la versión vanilla está instalada (usada por modpacks)
async function ensureVanillaInstalled(mcVersion, onProgress) {
    const vanillaDir = path.join(gameRoot, 'versions', mcVersion);
    if (fs.existsSync(path.join(vanillaDir, `${mcVersion}.json`))) return;
    if (onProgress) onProgress(`Descargando vanilla ${mcVersion}...`, 0);
    const manifest = await fetchJSON('https://launchermeta.mojang.com/mc/game/version_manifest.json');
    const vEntry = manifest.versions.find(v => v.id === mcVersion);
    if (!vEntry) throw new Error(`Versión vanilla ${mcVersion} no encontrada`);
    const vJson = await fetchJSON(vEntry.url);
    fs.mkdirSync(vanillaDir, { recursive: true });
    fs.writeFileSync(path.join(vanillaDir, `${mcVersion}.json`), JSON.stringify(vJson, null, 2));
    if (!fs.existsSync(path.join(vanillaDir, `${mcVersion}.jar`))) {
        await downloadFile(vJson.downloads.client.url, path.join(vanillaDir, `${mcVersion}.jar`),
            (dl, t) => { if (onProgress) onProgress(`Vanilla JAR: ${Math.round(dl / t * 100)}%`, Math.round(dl / t * 100)); });
    }
    // Assets index
    const assetIndexPath = path.join(gameRoot, 'assets', 'indexes', `${vJson.assetIndex.id}.json`);
    if (!fs.existsSync(assetIndexPath))
        await downloadFile(vJson.assetIndex.url, assetIndexPath, null);
}

// ─────────────────────────────────────────────
// CURSEFORGE API v1
// ─────────────────────────────────────────────
const CURSEFORGE_API_URL = 'https://api.curseforge.com/v1';
const CURSEFORGE_GAME_ID = 432; // Minecraft
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '$2a$10$fVunHNo8wbeBbe.sU9/uU.U/9U9U9U9U9U9U9U9U9U9U9U9U9U9U9'; // Proxy placeholder

async function cfRequest(endpoint, params = {}) {
    let url = `${CURSEFORGE_API_URL}${endpoint}`;
    const query = new URLSearchParams(params).toString();
    if (query) url += `?${query}`;

    return fetchJSON(url, { 'x-api-key': CURSEFORGE_API_KEY });
}

ipcMain.handle('get-curseforge-categories', async () => {
    try {
        const data = await cfRequest('/categories', { gameId: CURSEFORGE_GAME_ID });
        return data.data || [];
    } catch { return []; }
});

ipcMain.handle('search-curseforge', async (_, { query, classId, offset, sortField, sortOrder, gameVersion, modLoaderType, categoryId }) => {
    try {
        const params = {
            gameId: CURSEFORGE_GAME_ID,
            classId: classId || 6, // 6 = Mods
            index: offset || 0,
            pageSize: 20
        };
        if (query) params.searchFilter = query;
        if (sortField) params.sortField = sortField;
        if (sortOrder !== undefined) params.sortOrder = sortOrder;
        if (gameVersion) params.gameVersion = gameVersion;
        if (modLoaderType) params.modLoaderType = modLoaderType;
        if (categoryId) params.categoryId = categoryId;

        const data = await cfRequest('/mods/search', params);
        return { hits: data.data || [], total: data.pagination?.totalCount || 0 };
    } catch (e) {
        return { hits: [], total: 0, error: e.message };
    }
});

ipcMain.handle('get-curseforge-files', async (_, { modId, gameVersion, modLoaderType }) => {
    try {
        const params = {};
        if (gameVersion) params.gameVersion = gameVersion;
        if (modLoaderType) params.modLoaderType = modLoaderType;

        const data = await cfRequest(`/mods/${modId}/files`, params);
        return data.data || [];
    } catch { return []; }
});

ipcMain.handle('install-curseforge-mod', async (event, { profileId, fileData, modName }) => {
    const send = (msg, percent) => event.sender.send('mod-install-progress', { msg, percent });
    try {
        const cfg = loadConfig();
        const profile = cfg.profiles.find(p => p.id === profileId);
        if (!profile) throw new Error('Perfil no encontrado');

        let gameDir = profile.gameDirectory;
        if (!gameDir || !fs.existsSync(gameDir)) {
            gameDir = path.join(userDataPath, 'profiles', profile.id);
        }
        const modsDir = path.join(gameDir, 'mods');
        fs.mkdirSync(modsDir, { recursive: true });

        const filename = fileData.fileName || fileData.displayName || `mod_${fileData.id}.jar`;
        const destPath = path.join(modsDir, filename);

        send(`Descargando ${modName}...`, 10);
        await downloadFile(fileData.downloadUrl, destPath,
            (dl, t) => send(`Descargando: ${Math.round(dl / t * 100)}%`, 10 + Math.round(dl / t * 85)),
            { 'x-api-key': CURSEFORGE_API_KEY });

        if (!profile.mods) profile.mods = [];
        profile.mods = profile.mods.filter(m => m.id !== String(fileData.modId));
        profile.mods.push({ id: String(fileData.modId), name: modName, filename, path: destPath, source: 'curseforge' });
        saveConfig(cfg);

        // Dependencias (opcional por ahora, CurseForge API devuelve dependencias en el objeto del archivo)
        send('Mod instalado', 100);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-curseforge-versions', async () => {
    try {
        const data = await cfRequest('/minecraft/version');
        return data.data || [];
    } catch { return []; }
});

async function ensureFabricInstalled(mcVersion, loaderVersion, onProgress) {
    const fabricId = `fabric-loader-${loaderVersion}-${mcVersion}`;
    const fabricDir = path.join(gameRoot, 'versions', fabricId);
    if (fs.existsSync(path.join(fabricDir, `${fabricId}.json`))) return fabricId;

    if (onProgress) onProgress(`Instalando Fabric ${loaderVersion}...`, 0);
    const fabricJsonUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`;
    const fabricJson = await fetchJSON(fabricJsonUrl);
    fs.mkdirSync(fabricDir, { recursive: true });
    fs.writeFileSync(path.join(fabricDir, `${fabricId}.json`), JSON.stringify(fabricJson, null, 2));

    const libs = fabricJson.libraries || [];
    for (let i = 0; i < libs.length; i++) {
        const lib = libs[i];
        if (!lib.name) continue;
        const parts = lib.name.split(':');
        const [g, n, v] = parts;
        const jarPath = `${g.replace(/\./g, '/')}/${n}/${v}/${n}-${v}.jar`;
        const libPath = path.join(gameRoot, 'libraries', jarPath);
        if (!fs.existsSync(libPath)) {
            const bu = lib.url || 'https://maven.fabricmc.net/';
            const url = bu.endsWith('/') ? bu + jarPath : bu + '/' + jarPath;
            try { await downloadFile(url, libPath, null); } catch { }
        }
        if (onProgress) onProgress(`Librerías Fabric: ${i + 1}/${libs.length}`, Math.round((i / libs.length) * 100));
    }
    return fabricId;
}

// [VOID-CLIENT ADDITION] IPC handlers for Client tab
function getActiveGameDir() {
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === cfg.activeProfileId) || cfg.profiles[0];
    if (!profile) return null;
    let gameDir = profile.gameDirectory;
    if (!gameDir || !fs.existsSync(gameDir)) {
        gameDir = path.join(userDataPath, 'profiles', profile.id);
    }
    return gameDir;
}

ipcMain.on('get-hud-config', (e) => {
    const gameDir = getActiveGameDir();
    if (!gameDir) { e.returnValue = { modules: {} }; return; }
    const configDir = path.join(gameDir, 'config');
    const hudCfgPath = path.join(configDir, 'void-client.json');
    if (fs.existsSync(hudCfgPath)) {
        try {
            e.returnValue = JSON.parse(fs.readFileSync(hudCfgPath, 'utf8'));
        } catch { e.returnValue = { modules: {} }; }
    } else {
        e.returnValue = { modules: {} };
    }
});

ipcMain.on('save-hud-config', (_, data) => {
    const gameDir = getActiveGameDir();
    if (!gameDir) return;
    const configDir = path.join(gameDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const hudCfgPath = path.join(configDir, 'void-client.json');
    let existing = { modules: {} };
    if (fs.existsSync(hudCfgPath)) {
        try { existing = JSON.parse(fs.readFileSync(hudCfgPath, 'utf8')); } catch {}
    }
    if (data.modules) {
        for (const [name, modData] of Object.entries(data.modules)) {
            if (!existing.modules[name]) existing.modules[name] = {};
            if (modData.visible !== undefined) existing.modules[name].visible = modData.visible;
        }
    }
    fs.writeFileSync(hudCfgPath, JSON.stringify(existing, null, 2));
});

ipcMain.on('write-options', (_, { key, value }) => {
    const gameDir = getActiveGameDir();
    if (!gameDir) return;
    const optPath = path.join(gameDir, 'options.txt');
    let optionsTxt = '';
    if (fs.existsSync(optPath)) {
        optionsTxt = fs.readFileSync(optPath, 'utf8');
    }
    const valStr = String(value);
    const re = new RegExp(`^${key}:[^\r\n]*`, 'm');
    const line = `${key}:${valStr}`;
    if (re.test(optionsTxt)) {
        optionsTxt = optionsTxt.replace(re, line);
    } else {
        optionsTxt += (optionsTxt ? '\r\n' : '') + line;
    }
    fs.writeFileSync(optPath, optionsTxt, 'utf8');
});

ipcMain.on('launch-module-editor', () => {
    const gameDir = getActiveGameDir();
    if (!gameDir) return;
    // For now, just log — launching in --editor mode is future scope
    console.log('[VOID-CLIENT] Module editor requested for', gameDir);
});
