const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, Notification, globalShortcut } = require('electron');
const path = require('path');
const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const child_process = require('child_process');
const readline = require('readline');
const AdmZip = require('adm-zip');
const { autoUpdater } = require('electron-updater');
const SocialDB = require('./social-db');
const SocialManager = require('./social-manager');
const NotificationManager = require('./notification-manager');
const P2PEngine = require('./p2p-engine');
const P2PBridge = require('./p2p-bridge');
const { encryptAndSave, loadAndDecrypt, deleteFile } = require('./src/secure-storage');
const { sanitizeString, sanitizeBoolean, sanitizeId, sanitizePath, sanitizePayload } = require('./src/validate-ipc');
const { verifyAppIntegrity, verifyAppOrigin } = require('./src/integrity');

// ── Environment ──
try { require('dotenv').config(); } catch (_) { /* dotenv optional */ }

const REQUIRED_ENV = ['DATABASE_URL'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('[Security] Missing required environment variables:', missing.join(', '));
  process.exit(1);
}

// Consume sensitive env vars into local scope, then wipe from process.env
// so renderer (with nodeIntegration) cannot access them
const NEON_DB_URL = process.env.DATABASE_URL;
const CURSEFORGE_API_KEY = process.env.CURSEFORGE_API_KEY || '$2a$10$fVunHNo8wbeBbe.sU9/uU.U/9U9U9U9U9U9U9U9U9U9U9U9U9U9U9';
delete process.env.DATABASE_URL;
delete process.env.CURSEFORGE_API_KEY;

process.on('uncaughtException', (err) => {
  console.error('[CRASH] uncaughtException:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH] unhandledRejection en:', promise, 'razón:', reason);
});


// ─────────────────────────────────────────────
// RUTAS PERSISTENTES
// ─────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'launcher_config.json');
const gameRoot = userDataPath;

fs.mkdirSync(userDataPath, { recursive: true });

// ─────────────────────────────────────────────
// CONFIG — CARGA / GUARDADO / MIGRACIÓN
// ─────────────────────────────────────────────
let configCache = null;

function generateId() {
    return crypto.randomBytes(8).toString('hex');
}

function loadConfig() {
    if (configCache) return configCache;
    const raw = loadAndDecrypt(configPath);
    if (raw) {
        let cfg = raw;
        if (!cfg.cosmetics) cfg.cosmetics = { keystrokes: false, dynamicFov: true, damageTilt: true };
        if (!cfg.accounts) {
            const id = generateId();
            const profileId = generateId();
            cfg = {
                accounts: [{ id, username: cfg.username || 'Jugador', skinPath: cfg.skinPath || '' }],
                activeAccountId: id,
                profiles: [{
                    id: profileId, name: 'Default', icon: '⛏️', versionId: '',
                    gameDirectory: '', ram: cfg.ram || '4', jvmArgs: '', mods: []
                }],
                activeProfileId: profileId, appVersion: '1.1.0', skinLibrary: [],
                minimizeToTray: true, suppressUpdateNotifications: false
            };
        }
        if (!cfg.skinLibrary) cfg.skinLibrary = [];
        if (cfg.minimizeToTray === undefined) cfg.minimizeToTray = true;
        if (cfg.suppressUpdateNotifications === undefined) cfg.suppressUpdateNotifications = false;
        configCache = cfg;
        return cfg;
    }

    const id = generateId();
    const profileId = generateId();
    configCache = {
        accounts: [{ id, username: 'Jugador', skinPath: '' }],
        activeAccountId: id,
        profiles: [{
            id: profileId, name: 'Default', icon: '⛏️', versionId: '',
            gameDirectory: '', ram: '4', jvmArgs: '', mods: []
        }],
        activeProfileId: profileId, appVersion: '1.1.0',
        cosmetics: { keystrokes: false, dynamicFov: true, damageTilt: true },
        skinLibrary: [], minimizeToTray: true, suppressUpdateNotifications: false
    };
    encryptAndSave(configPath, configCache);
    return configCache;
}

function saveConfig(cfg) {
    configCache = cfg;
    encryptAndSave(configPath, cfg);
}

function invalidateConfig() {
    configCache = null;
}

let tray = null;
let mainWindow = null;
let socialDb = null;
let socialManager = null;
let socialPollInterval = null;
let notificationManager = null;
global.activeInstancesCount = 0;
const activeProcesses = new Map(); // userId → { proc, state, version, presenceInterval }
const activeBridges = new Map(); // sessionId → { engine, bridge }

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
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#0a0a0a'
    });
    win.loadFile('index.html');
    return win;
}

// ─────────────────────────────────────────────
// TRAY / BACKGROUND
// ─────────────────────────────────────────────
function setupTray(win) {
    try {
        const iconPath = path.join(__dirname, 'build', 'icon.png');
        if (!fs.existsSync(iconPath)) return;
        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Mostrar/Ocultar',
                click: () => { if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } }
            },
            { type: 'separator' },
            { label: 'Salir', click: () => { tray = null; app.quit(); } }
        ]);
        tray.setToolTip('Void Launcher');
        tray.setContextMenu(contextMenu);
        tray.on('double-click', () => { win.show(); win.focus(); });
        console.log('[TRAY] Icono creado');
    } catch (e) { console.error('[TRAY] Error:', e); }
}

// ── Neon connection — from environment ──
// NEON_DB_URL declared at top of file (env section)

// Session persistence
function getSessionPath() {
    return path.join(userDataPath, 'session.json');
}
function saveSession(session) {
    encryptAndSave(getSessionPath(), session);
}
function loadSession() {
    return loadAndDecrypt(getSessionPath());
}
function deleteSession() {
    deleteFile(getSessionPath());
}

// ─────────────────────────────────────────────
// SOCIAL MANAGER — CLOUD DB (Neon)
// ─────────────────────────────────────────────
function startSocialManager(connectionString) {
    try {
        socialDb = new SocialDB();
        const res = socialDb.connect(connectionString);
        if (!res.success) { console.error('[SOCIAL] Connection error:', res.error); return false; }

        // Run schema migration
        socialDb.migrateSchema().catch(e => console.warn('[SOCIAL] Schema migration:', e.message));

        // Clean up expired guest accounts
        socialDb.deleteExpiredGuests().then(rows => {
            if (rows.length > 0) console.log('[SOCIAL] Expired guests cleaned:', rows.length);
        }).catch(e => console.error('[SOCIAL] Guest cleanup error:', e));
        // Periodic guest cleanup every hour
        setInterval(() => {
            socialDb.deleteExpiredGuests().catch(() => {});
        }, 3600000);

        notificationManager = new NotificationManager();
        socialManager = new SocialManager();
        socialManager.db = socialDb; // share the same DB instance
        socialManager.startHeartbeat();
        socialManager.startPolling((event) => {
            if (event.type === 'pending-requests') {
                broadcastSocialState();
            }
            if (event.type === 'game-invites') {
                broadcastSocialState();
                for (const inv of event.data) {
                    if (notificationManager) {
                        notificationManager.show('invitation:new', {
                            fromUsername: inv.from_username,
                            worldName: inv.world_name || 'jugar'
                        });
                    }
                }
            }
        });
        startSocialPolling(socialManager);
        console.log('[SOCIAL] Cloud social manager iniciado');
        return true;
    } catch (e) { console.error('[SOCIAL] Init error:', e); return false; }
}

function stopSocialManager() {
    if (socialManager) { socialManager.stop(); socialManager = null; }
    if (socialPollInterval) { clearInterval(socialPollInterval); socialPollInterval = null; }
    if (socialDb) { socialDb.close(); socialDb = null; }
}

function broadcastSocialState() {
    if (!socialManager || !socialManager.isLoggedIn() || !mainWindow) return;
    (async () => {
        try {
            const userId = socialManager.getUserId();
            const friends = await socialManager.listFriends();
            const pendingReqs = await socialManager.getPendingRequests();
            const conversations = await socialManager.getConversations();

            // Query user_presence for friends to get actual game status
            const friendIds = friends.map(f => f.id);
            let presenceRows = [];
            if (friendIds.length > 0 && socialDb && socialDb.connected) {
                try {
                    const res = await socialDb.query(
                        `SELECT up.user_id, up.status AS game_status, up.server_ip, up.version
                         FROM user_presence up
                         WHERE up.user_id = ANY($1::int[])`,
                        [friendIds]
                    );
                    presenceRows = res.rows;
                } catch (e) { /* user_presence table may not exist */ }
            }
            const presenceMap = {};
            for (const row of presenceRows) {
                presenceMap[row.user_id] = row;
            }

            // Build structure for renderer
            const friendsList = friends.map(f => f.username);
            const presence = {};
            const unread = {};
            const conversations_list = [];
            for (const f of friends) {
                let version = undefined;
                let serverName = undefined;
                if (f.custom_status && f.custom_status.includes('|')) {
                    const [v, m] = f.custom_status.split('|');
                    version = v;
                    serverName = m === 'multiplayer' ? 'Multijugador' : 'Singleplayer';
                } else if (f.custom_status) {
                    serverName = f.custom_status || undefined;
                    version = undefined;
                }

                // Override with game presence from user_presence if user_status doesn't have game info
                const gp = presenceMap[f.id];
                let status = f.status || 'offline';
                if (gp && gp.game_status !== 'OFFLINE' && status === 'online') {
                    status = gp.game_status === 'MULTIPLAYER' ? 'playing_multiplayer' :
                             gp.game_status === 'SINGLEPLAYER' ? 'playing_singleplayer' : status;
                    if (status !== 'online') {
                        version = gp.version || version;
                        serverName = gp.server_ip || serverName;
                    }
                }

                presence[f.username] = { status, serverName, version };

                const conv = conversations.find(c => c.other_users && c.other_users.some(u => u.id === f.id));
                if (conv) {
                    unread[f.username] = conv.unread_count || 0;
                    conversations_list.push({
                        username: f.username,
                        last_message: conv.last_message || '',
                        last_message_at: conv.last_message_at ? conv.last_message_at.toISOString() : null
                    });
                } else {
                    unread[f.username] = 0;
                }
            }
            const pendingList = pendingReqs.map(r => ({ from: r.username, id: r.id, type: 'friend' }));
            try {
                const gameInvites = await socialManager.getPendingGameInvites();
                for (const inv of gameInvites) {
                    pendingList.push({ from: inv.from_username, id: inv.id, type: 'game-invite', worldName: inv.world_name, serverIp: inv.server_ip });
                }
            } catch (e) { /* game_invitations table may not exist yet */ }

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('social-update', { friends: friendsList, presence, pending: pendingList, unread, conversations: conversations_list });
                mainWindow.webContents.send('social-connected');
            }
        } catch (e) { console.error('[SOCIAL] broadcast error:', e); }
    })();
}

function startSocialPolling(manager) {
    if (socialPollInterval) clearInterval(socialPollInterval);
    socialPollInterval = setInterval(() => {
        if (manager && manager.isLoggedIn()) {
            broadcastSocialState();
        }
    }, 2000);
}

// ── Presence System (stub for B, wired by A) ──
async function updatePresence(userId, status, serverIp, version) {
    if (!socialDb || !socialDb.connected) return;
    try {
        await socialDb.query(`CREATE TABLE IF NOT EXISTS user_presence (
            user_id   INTEGER PRIMARY KEY,
            status    TEXT NOT NULL DEFAULT 'OFFLINE',
            server_ip TEXT,
            version   TEXT,
            last_seen TIMESTAMPTZ DEFAULT NOW()
        )`);
        await socialDb.query(
            `INSERT INTO user_presence (user_id, status, server_ip, version, last_seen)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               status = EXCLUDED.status,
               server_ip = COALESCE(EXCLUDED.server_ip, user_presence.server_ip),
               version = COALESCE(EXCLUDED.version, user_presence.version),
               last_seen = NOW()`,
            [userId, status, serverIp || null, version || null]
        );
    } catch (e) {
        console.warn('[PRESENCE] update error:', e.message);
    }
}

function emitMinecraftState(userId, status, ip, version) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send('minecraft-state-change', { userId, status, ip, version });
    updatePresence(userId, status, ip, version);
    if (status === 'OFFLINE') {
        updateSocialGameStatus('online', null, null);
        const entry = activeProcesses.get(userId);
        if (entry) {
            if (entry.presenceInterval) clearInterval(entry.presenceInterval);
            activeProcesses.delete(userId);
        }
    } else if (status === 'MULTIPLAYER') {
        updateSocialGameStatus('playing_multiplayer', version, 'multiplayer');
    } else if (status === 'SINGLEPLAYER') {
        updateSocialGameStatus('playing_singleplayer', version, 'singleplayer');
    }
}

// ── Process Monitor ──
ipcMain.handle('launch-minecraft', async (_, { jarPath, version, username, jvmArgs }) => {
    jarPath = sanitizePath(jarPath); version = sanitizeString(version, 50); username = sanitizeString(username, 50); jvmArgs = sanitizeString(jvmArgs, 1000);
    const userId = socialManager?.getUserId() || 'default';
    if (activeProcesses.has(userId)) {
        return { success: false, error: 'Ya hay un proceso activo para este usuario' };
    }

    const ram = '2';
    const javaArgs = [
        `-Xmx${ram}G`, `-Xms512M`,
        ...(jvmArgs ? jvmArgs.split(/\s+/).filter(Boolean) : []),
        '-jar', jarPath
    ];

    try {
        const proc = child_process.spawn('java', javaArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: false
        });

        const entry = { proc, state: 'STARTING', version, serverIp: null, presenceInterval: null };
        activeProcesses.set(userId, entry);

        const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

        rl.on('line', (line) => {
            console.log('[MC-OUT]', line);
            if (line.includes('Connecting to ')) {
                const ipMatch = line.match(/Connecting to\s+(\S+)/);
                const ip = ipMatch ? ipMatch[1] : null;
                entry.state = 'MULTIPLAYER';
                entry.serverIp = ip;
                emitMinecraftState(userId, 'MULTIPLAYER', ip, version);
            } else if (line.includes('Loading world')) {
                entry.state = 'SINGLEPLAYER';
                entry.serverIp = null;
                emitMinecraftState(userId, 'SINGLEPLAYER', null, version);
            }
        });

        proc.stderr.on('data', (data) => {
            console.log('[MC-ERR]', data.toString());
        });

        proc.on('close', (code) => {
            console.log('[MC] Process closed with code', code);
            const e = activeProcesses.get(userId);
            if (e && e.presenceInterval) clearInterval(e.presenceInterval);
            activeProcesses.delete(userId);
            emitMinecraftState(userId, 'OFFLINE', null, null);
        });

        // Start presence heartbeat (System B — every 30s)
        entry.presenceInterval = setInterval(() => {
            const e = activeProcesses.get(userId);
            if (e) updatePresence(userId, e.state, e.serverIp, version);
        }, 30000);

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('launch-minecraft-with-server', async (_, { jarPath, ip, version, username }) => {
    jarPath = sanitizePath(jarPath); ip = sanitizeString(ip, 100); version = sanitizeString(version, 50); username = sanitizeString(username, 50);
    const userId = socialManager?.getUserId() || 'default';
    if (activeProcesses.has(userId)) {
        return { success: false, error: 'Ya hay un proceso activo' };
    }

    const resolvedJar = jarPath || 'minecraft_client.jar';
    const resolvedUser = username || 'Jugador';
    const javaArgs = ['-Xmx2G', '-Xms512M', '-jar', resolvedJar, '--server', ip, '--username', resolvedUser];

    try {
        const proc = child_process.spawn('java', javaArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: false
        });

        const entry = { proc, state: 'STARTING', version, serverIp: ip, presenceInterval: null };
        activeProcesses.set(userId, entry);

        const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });

        rl.on('line', (line) => {
            console.log('[MC-E]', line);
            if (line.includes('Connecting to ')) {
                entry.state = 'MULTIPLAYER';
                emitMinecraftState(userId, 'MULTIPLAYER', ip, version);
            } else if (line.includes('Loading world')) {
                entry.state = 'SINGLEPLAYER';
                emitMinecraftState(userId, 'SINGLEPLAYER', null, version);
            }
        });

        proc.stderr.on('data', (data) => console.log('[MC-E-ERR]', data.toString()));

        proc.on('close', (code) => {
            console.log('[MC-E] Closed with code', code);
            const e = activeProcesses.get(userId);
            if (e && e.presenceInterval) clearInterval(e.presenceInterval);
            activeProcesses.delete(userId);
            emitMinecraftState(userId, 'OFFLINE', null, null);
        });

        entry.presenceInterval = setInterval(() => {
            const e = activeProcesses.get(userId);
            if (e) updatePresence(userId, e.state, e.serverIp, version);
        }, 30000);

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('stop-minecraft', async (_) => {
    try {
        const userId = socialManager?.getUserId() || 'default';
        const entry = activeProcesses.get(userId);
        if (!entry) return { success: false, error: 'No hay proceso activo' };
        entry.proc.kill('SIGTERM');
        return { success: true };
    } catch (e) {
        console.error('[SISTEMA A] stop-minecraft:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('update-presence', async (_, { status, serverIp, version }) => {
    status = sanitizeString(status, 50); serverIp = sanitizeString(serverIp, 100); version = sanitizeString(version, 50);
    try {
        const userId = socialManager?.getUserId();
        if (!userId) return { success: false, error: 'No hay sesión' };
        await updatePresence(userId, status, serverIp, version);
        return { success: true };
    } catch (e) {
        console.error('[SISTEMA B] update-presence:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-friends-presence', async (_, { friendIds }) => {
    if (!Array.isArray(friendIds)) return [];
    if (!socialDb || !socialDb.connected) return [];
    try {
        const res = await socialDb.query(
            `SELECT up.*, u.username FROM user_presence up
             JOIN users u ON u.id = up.user_id
             WHERE up.user_id = ANY($1::int[])`,
            [friendIds]
        );
        return res.rows;
    } catch (e) {
        console.warn('[PRESENCE] get-friends-presence error:', e.message);
        return [];
    }
});

// ── Host Server + Playit Tunnel (System D) ──
let serverProcess = null;      // { proc, minecraftDir }
let tunnelProcess = null;      // { proc, retries }
let tunnelRetries = 0;
const MAX_TUNNEL_RETRIES = 3;

async function ensureOnlineModeFalse(minecraftDir) {
    const propsPath = path.join(minecraftDir, 'server.properties');
    let props = '';
    if (fs.existsSync(propsPath)) {
        props = fs.readFileSync(propsPath, 'utf8');
    }
    if (props.includes('online-mode=true')) {
        props = props.replace(/online-mode=true/g, 'online-mode=false');
    } else if (!props.includes('online-mode')) {
        props += '\nonline-mode=false\n';
    }
    fs.writeFileSync(propsPath, props, 'utf8');
}

ipcMain.handle('start-local-server', async (_, { serverJarPath, minecraftDir }) => {
    serverJarPath = sanitizePath(serverJarPath); minecraftDir = sanitizePath(minecraftDir);
    if (serverProcess) {
        return { success: false, error: 'El servidor ya está corriendo' };
    }

    try {
        fs.mkdirSync(minecraftDir, { recursive: true });
        await ensureOnlineModeFalse(minecraftDir);

        // Start server
        const proc = child_process.spawn('java', ['-Xmx4G', '-Xms4G', '-jar', serverJarPath, 'nogui'], {
            cwd: minecraftDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: false
        });
        serverProcess = { proc, minecraftDir };

        const srvRl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
        srvRl.on('line', (line) => {
            console.log('[SERVER]', line);
            parseServerLine(line);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server-log', { line });
            }
        });

        proc.stderr.on('data', (d) => console.log('[SERVER-ERR]', d.toString()));

        proc.on('close', (code) => {
            console.log('[SERVER] Closed with code', code);
            serverProcess = null;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('server-log', { line: `[Servidor] Cerrado (código ${code})` });
            }
        });

        // Start playit tunnel
        startTunnel();

        return { success: true };
    } catch (err) {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('admin-toast', { msg: 'Error al iniciar servidor: ' + err.message, type: 'error' });
        }
        return { success: false, error: err.message };
    }
});

function startTunnel() {
    if (tunnelProcess) {
        tunnelProcess.proc.kill('SIGTERM');
        tunnelProcess = null;
    }

    const tunProc = child_process.spawn('playit-cli', [], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });
    tunnelProcess = { proc: tunProc, retries: tunnelRetries };

    const tunRl = readline.createInterface({ input: tunProc.stdout, crlfDelay: Infinity });
    tunRl.on('line', (line) => {
        console.log('[TUNNEL]', line);
        const match = line.match(/([a-z0-9\-]+\.playit\.gg)/i);
        if (match) {
            const ip = match[1];
            console.log('[TUNNEL] IP detectada:', ip);
            tunnelRetries = 0;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tunnel-ip-ready', { ip });
            }
        }
    });

    tunProc.stderr.on('data', (d) => console.log('[TUNNEL-ERR]', d.toString()));

    tunProc.on('close', (code) => {
        console.log('[TUNNEL] Closed with code', code);
        tunnelProcess = null;
        if (code !== 0 && tunnelRetries < MAX_TUNNEL_RETRIES) {
            tunnelRetries++;
            console.log(`[TUNNEL] Reintento ${tunnelRetries}/${MAX_TUNNEL_RETRIES}`);
            setTimeout(() => startTunnel(), 2000);
        } else if (code !== 0) {
            console.log('[TUNNEL] Reintentos agotados');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('tunnel-failed', {});
                const nm = notificationManager;
                if (nm) nm.show('default', { body: 'No se pudo establecer el túnel playit. Revisa tu conexión.' });
            }
        }
    });
}

ipcMain.handle('stop-local-server', async () => {
    try {
        if (tunnelProcess) {
            tunnelProcess.proc.kill('SIGTERM');
            tunnelProcess = null;
        }
        tunnelRetries = 0;
        if (serverProcess) {
            serverProcess.proc.kill('SIGTERM');
            serverProcess = null;
        }
        return { success: true };
    } catch (e) {
        console.error('[SISTEMA D] stop-local-server:', e);
        return { success: false, error: e.message };
    }
});

function updateSocialGameStatus(status, version, server) {
    if (socialManager && socialManager.isLoggedIn()) {
        const customStatus = version ? `${version}|${server || `singleplayer`}` : (server || '');
        socialManager.db.updateStatus(socialManager.getUserId(), status, customStatus).catch(() => {});
    }
}

// ── Social Overlay Window ──
// IMPORTANTE: usar .hide()/.show() en lugar de .close()/.destroy()
// El overlay persiste en memoria durante toda la sesión de la app.
let overlayWindow = null;
let adminWindow = null;
let serverStartTime = null;
let playerSessions = new Map();
let serverLogBuffer = [];
let chatMessageCount = 0;
let maxPlayerCount = 0;

function createOverlayWindow() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.focus();
        return;
    }
    overlayWindow = new BrowserWindow({
        width: 340,
        height: 480,
        frame: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
        },
        backgroundColor: '#0f0f0f'
    });
    overlayWindow.loadFile('social-overlay.html');

    overlayWindow.on('closed', () => {
        overlayWindow = null;
    });
    overlayWindow.once('ready-to-show', () => {
        overlayWindow.showInactive();
    });
}

function showOverlay() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.show();
        overlayWindow.focus();
        console.log('[OVERLAY] show');
    } else {
        createOverlayWindow();
        console.log('[OVERLAY] created via showOverlay');
    }
}

function hideOverlay() {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
        console.log('[OVERLAY] hide');
    }
}

function toggleOverlay() {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
        hideOverlay();
    } else {
        showOverlay();
    }
}

function createAdminWindow() {
    if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.show(); adminWindow.focus(); return; }
    adminWindow = new BrowserWindow({
        width: 860, height: 600, minWidth: 700, minHeight: 450,
        title: 'Administración del Servidor',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, preload: path.join(__dirname, 'preload.js') },
        backgroundColor: '#0d1117', show: false
    });
    adminWindow.loadFile('server-admin.html');
    adminWindow.once('ready-to-show', () => adminWindow.show());
    adminWindow.on('closed', () => { adminWindow = null; });
}

function openAdminWindow() {
    if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.show(); adminWindow.focus(); return; }
    createAdminWindow();
}

function broadcastToAdmin(channel, data) {
    if (adminWindow && !adminWindow.isDestroyed()) adminWindow.webContents.send(channel, data);
}

function parseServerLine(line) {
    serverLogBuffer.push({ ts: Date.now(), text: line });
    if (serverLogBuffer.length > 500) serverLogBuffer.shift();
    if (line.includes('Done') && line.includes('For help')) {
        serverStartTime = serverStartTime || Date.now();
        openAdminWindow();
        broadcastToAdmin('admin-server-ready', { startTime: serverStartTime });
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.webContents.send('admin-toast', { msg: 'Servidor iniciado — Ventana admin abierta', type: 'success' });
        }
    }
    const joinMatch = line.match(/]: (\w+) joined the game/);
    if (joinMatch) {
        const username = joinMatch[1];
        const prev = playerSessions.get(username);
        playerSessions.set(username, { joinTime: Date.now(), totalMs: prev?.totalMs || 0, online: true });
        const onlinePlayers = Array.from(playerSessions.values()).filter(p => p.online).length;
        if (onlinePlayers > maxPlayerCount) maxPlayerCount = onlinePlayers;
        broadcastToAdmin('admin-player-join', { username, ts: Date.now() });
    }
    const leaveMatch = line.match(/]: (\w+) left the game/);
    if (leaveMatch) {
        const username = leaveMatch[1];
        const session = playerSessions.get(username);
        if (session) {
            const sessionMs = Date.now() - session.joinTime;
            playerSessions.set(username, { joinTime: null, totalMs: session.totalMs + sessionMs, online: false });
        }
        broadcastToAdmin('admin-player-leave', { username, ts: Date.now() });
    }
    const chatMatch = line.match(/]: <(\w+)> (.+)/);
    if (chatMatch) {
        chatMessageCount++;
        broadcastToAdmin('admin-chat', { username: chatMatch[1], message: chatMatch[2], ts: Date.now() });
    }
    broadcastToAdmin('admin-log', { text: line, ts: Date.now() });
}

// ── Single-instance lock ──
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
    for (const w of wins) { w.show(); w.focus(); }
});

app.whenReady().then(() => {
    // ── Integrity & origin check ──
    const integrity = verifyAppIntegrity();
    if (!integrity.pass) {
        console.error('[SECURITY] Integridad comprometida:', integrity.errors.join('; '));
    }
    const origin = verifyAppOrigin();
    if (!origin.pass) {
        console.error('[SECURITY] Origen no reconocido:', process.execPath);
    }

    // ── Content Security Policy ──
    const { session } = require('electron');
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        if (details.url.startsWith('file://') || details.url.startsWith('chrome-extension://')) {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [
                        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; font-src 'self' data:"
                    ]
                }
            });
        } else {
            callback({ responseHeaders: details.responseHeaders });
        }
    });

    mainWindow = createWindow();
    setupTray(mainWindow);
    startSocialManager(NEON_DB_URL);

    // Global shortcut overlay
    try {
        const registered = globalShortcut.register('Ctrl+Shift+X', () => {
            toggleOverlay();
        });
        if (!registered) console.error('[OVERLAY] Failed to register shortcut');
    } catch (e) {
        console.error('[OVERLAY] Shortcut error:', e.message);
    }
    // Try to restore saved session on next tick
    setImmediate(async () => {
        const session = loadSession();
        if (session && session.token && socialDb && socialDb.connected) {
            try {
                const valid = await socialDb.getSession(session.token);
                    if (valid && mainWindow && !mainWindow.isDestroyed()) {
                        socialManager.activeSession = { token: valid.token, user_id: valid.user_id };
                        socialManager.activeUserId = valid.user_id;
                        await socialDb.updateStatus(valid.user_id, 'online', '');
                        socialManager.startHeartbeat();
                        socialManager.startPolling((event) => {
                            if (event.type === 'pending-requests' || event.type === 'game-invites') broadcastSocialState();
                        });
                        startSocialPolling(socialManager);
                        mainWindow.webContents.send('session-restored', { username: valid.username });
                    }
                } catch (e) {
                    console.error('[SOCIAL] Auto-restore error:', e);
                    deleteSession();
                }
            }
        });
    autoUpdater.logger = console;
    if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
    const win = () => BrowserWindow.getFocusedWindow() || mainWindow;

    autoUpdater.on('update-available', (info) => {
        const cfg = loadConfig();
        if (cfg.suppressUpdateNotifications) {
            console.log('[UPDATER] Update suppressed by config');
            return;
        }
        // Send update info with formatted size
        const updateInfo = {
            ...info,
            releaseNotes: info.releaseNotes || '',
            size: info.fileSize ? `${(info.fileSize / 1048576).toFixed(1)} MB` : 'Unknown size'
        };
        win()?.webContents.send('update-available', updateInfo);
    });
    autoUpdater.on('update-not-available', () => {
        win()?.webContents.send('update-not-available');
        console.log('[UPDATER] No update available');
    });
    autoUpdater.on('download-progress', (prog) => {
        // Send progress with percentage and formatted bytes
        const progressInfo = {
            ...prog,
            percent: prog.percent || 0,
            transferred: `${(prog.transferred / 1048576).toFixed(1)} MB`,
            total: `${(prog.total / 1048576).toFixed(1)} MB`,
            speed: `${(prog.bytesPerSecond / 1048576).toFixed(1)} MB/s`
        };
        win()?.webContents.send('update-progress', progressInfo);
    });
    autoUpdater.on('update-downloaded', () => {
        win()?.webContents.send('update-downloaded');
    });

    // Mod updater setup
    const { modUpdater } = require("./mod-updater");

    // Check for mod updates on startup
    modUpdater.checkAndApplyUpdates((progress) => {
        win()?.webContents.send("mod-update-progress", progress);
    }).then(result => {
        if (result.success) {
            console.log("[ModUpdater] Update check completed:", result.message);
            win()?.webContents.send("mod-update-status", { success: true, message: result.message });
        } else {
            console.error("[ModUpdater] Update check failed:", result.message);
            win()?.webContents.send("mod-update-status", { success: false, message: result.message });
        }
    });


    ipcMain.on('start-update', async () => {
        try {
            await autoUpdater.downloadUpdate();
        } catch (e) {
            console.error('[UPDATER] Download error:', e);
            win()?.webContents.send('update-error', String(e));
        }
    });

    ipcMain.on('install-update', () => {
        autoUpdater.quitAndInstall(false, true);
    });

    autoUpdater.checkForUpdates().catch(e => console.error('[UPDATER] Check error:', e));
});
app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    stopSocialManager();
    // Kill all active Minecraft processes
    for (const [userId, entry] of activeProcesses) {
        if (entry.presenceInterval) clearInterval(entry.presenceInterval);
        updatePresence(userId, 'OFFLINE', null, null).catch(() => {});
        entry.proc.kill('SIGTERM');
    }
    activeProcesses.clear();
    if (tray) { tray.destroy(); tray = null; }
});

app.on('window-all-closed', () => {
    if (tray && loadConfig().minimizeToTray) {
        // Keep running in tray
    } else {
        if (process.platform !== 'darwin') app.quit();
    }
});

// ─────────────────────────────────────────────
// IPC — VENTANA
// ─────────────────────────────────────────────
ipcMain.on('close-app', () => {
    const cfg = loadConfig();
    if (cfg.minimizeToTray && tray) {
        BrowserWindow.getFocusedWindow()?.hide();
    } else {
        app.quit();
    }
});
ipcMain.on('minimize-app', () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.on('get-userdata-path', (e) => { e.returnValue = userDataPath; });
ipcMain.on('get-app-version', (e) => { e.returnValue = app.getVersion(); });

// ─────────────────────────────────────────────
// IPC — CONFIG GENERAL
// ─────────────────────────────────────────────
ipcMain.on('get-config', (e) => { e.returnValue = loadConfig(); });
ipcMain.on('save-config', (_, cfg) => {
    if (!cfg || typeof cfg !== 'object') return;
    saveConfig(cfg);
});
ipcMain.on('set-config-key', (e, { key, value }) => {
    key = sanitizeString(key, 50);
    const cfg = loadConfig();
    cfg[key] = value;
    saveConfig(cfg);
    e.returnValue = true;
});
ipcMain.on('save-cosmetics', (_, cosmetics) => {
    if (!cosmetics || typeof cosmetics !== 'object') return;
    const cfg = loadConfig();
    cfg.cosmetics = cosmetics;
    saveConfig(cfg);
});

// ─────────────────────────────────────────────
// IPC — NICKNAMES
// ─────────────────────────────────────────────
ipcMain.on('get-accounts', (e) => {
    const cfg = loadConfig();
    e.returnValue = { accounts: cfg.accounts, activeAccountId: cfg.activeAccountId };
});

ipcMain.on('add-account', (e, { username }) => {
    username = sanitizeString(username, 50);
    const cfg = loadConfig();
    const id = generateId();
    cfg.accounts.push({ id, username: username.trim() || 'Jugador', skinPath: '' });
    if (!cfg.activeAccountId) cfg.activeAccountId = id;
    saveConfig(cfg);
    e.returnValue = cfg.accounts;
});

ipcMain.on('remove-account', (e, { id }) => {
    id = sanitizeId(id);
    const cfg = loadConfig();
    cfg.accounts = cfg.accounts.filter(a => a.id !== id);
    if (cfg.activeAccountId === id) cfg.activeAccountId = cfg.accounts[0]?.id || '';
    saveConfig(cfg);
    e.returnValue = cfg.accounts;
});

ipcMain.on('set-active-account', (e, { id }) => {
    id = sanitizeId(id);
    const cfg = loadConfig();
    cfg.activeAccountId = id;
    saveConfig(cfg);
    e.returnValue = true;
});

ipcMain.on('update-account-skin', (e, { id, skinPath }) => {
    id = sanitizeId(id); skinPath = sanitizePath(skinPath);
    const cfg = loadConfig();
    const acc = cfg.accounts.find(a => a.id === id);
    if (acc) acc.skinPath = skinPath;
    saveConfig(cfg);
    e.returnValue = true;
});

// ─────────────────────────────────────────────
// IPC — SKIN LIBRARY
// ─────────────────────────────────────────────
ipcMain.on('get-skin-library', (e) => {
    const cfg = loadConfig();
    e.returnValue = cfg.skinLibrary || [];
});

ipcMain.on('add-skin-to-library', (e, { name, source, skinPath }) => {
    name = sanitizeString(name, 100); source = sanitizeString(source, 50); skinPath = sanitizePath(skinPath);
    const cfg = loadConfig();
    const id = generateId();
    if (!cfg.skinLibrary) cfg.skinLibrary = [];
    cfg.skinLibrary.push({ id, name: name || 'Skin', source: source || 'local', path: skinPath, isActive: false });
    saveConfig(cfg);
    e.returnValue = cfg.skinLibrary;
});

ipcMain.on('remove-skin-from-library', (e, { id }) => {
    id = sanitizeId(id);
    const cfg = loadConfig();
    if (cfg.skinLibrary) cfg.skinLibrary = cfg.skinLibrary.filter(s => s.id !== id);
    saveConfig(cfg);
    e.returnValue = true;
});

ipcMain.on('apply-skin-from-library', (e, { skinId, accountId }) => {
    skinId = sanitizeId(skinId); accountId = sanitizeId(accountId);
    const cfg = loadConfig();
    const skin = cfg.skinLibrary?.find(s => s.id === skinId);
    if (!skin || !skin.path) { e.returnValue = false; return; }
    const acc = cfg.accounts.find(a => a.id === accountId);
    if (acc) acc.skinPath = skin.path;
    cfg.skinLibrary.forEach(s => s.isActive = s.id === skinId);
    saveConfig(cfg);
    e.returnValue = true;
});

ipcMain.handle('save-skin-file', async (_, { data }) => {
    try {
        if (typeof data !== 'string') return false;
        const skinsDir = path.join(userDataPath, 'skins');
        fs.mkdirSync(skinsDir, { recursive: true });
        const destPath = path.join(skinsDir, `editor_${Date.now()}.png`);
        const buf = Buffer.from(data);
        fs.writeFileSync(destPath, buf);

        const cfg = loadConfig();
        if (!cfg.skinLibrary) cfg.skinLibrary = [];
        cfg.skinLibrary.push({ id: generateId(), name: 'Editor ' + new Date().toLocaleDateString(), source: 'local', path: destPath, isActive: false });
        saveConfig(cfg);
        return true;
    } catch (err) {
        console.error('[SAVE-SKIN] Error:', err);
        return false;
    }
});

ipcMain.handle('download-nova-skin', async (_, { name, url }) => {
    try {
        name = sanitizeString(name, 100);
        if (typeof url !== 'string' || !url.startsWith('http')) return { success: false, error: 'URL inválida' };
        const skinsDir = path.join(userDataPath, 'skins');
        fs.mkdirSync(skinsDir, { recursive: true });
        const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'skin';
        const destPath = path.join(skinsDir, `${safeName}_${Date.now()}.png`);
        const httpsMod = url.startsWith('https') ? https : http;
        await new Promise((resolve, reject) => {
            httpsMod.get(url, (res) => {
                if (res.statusCode >= 300 && res.headers.location) {
                    httpsMod.get(res.headers.location, (r2) => {
                        const file = fs.createWriteStream(destPath);
                        r2.pipe(file);
                        file.on('finish', () => { file.close(); resolve(); });
                    }).on('error', reject);
                    return;
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
            }).on('error', reject);
        });
        return { success: true, path: destPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ─────────────────────────────────────────────
// IPC — SOCIAL CLOUD (Neon)
// ─────────────────────────────────────────────
ipcMain.on('social-is-connected', (e) => {
    e.returnValue = !!(socialManager && socialManager.isLoggedIn());
});

// ── Auth ──
ipcMain.handle('social-register', async (_, { username, password }) => {
    username = sanitizeString(username, 50); password = sanitizeString(password, 128);
    if (!socialManager) return { success: false, error: 'DB no conectada' };
    const result = await socialManager.signup(username, password);
    if (result.success && result.session) {
        saveSession({ token: result.session.token, userId: result.user.id, username: result.user.username });
    }
    return result;
});

ipcMain.handle('social-signin', async (_, { username, password }) => {
    username = sanitizeString(username, 50); password = sanitizeString(password, 128);
    if (!socialManager) return { success: false, error: 'DB no conectada' };
    const result = await socialManager.signin(username, password);
    if (result.success && result.session) {
        saveSession({ token: result.session.token, userId: result.user.id, username: result.user.username });
    }
    return result;
});

ipcMain.handle('social-create-guest', async () => {
    if (!socialManager) return { success: false, error: 'DB no conectada' };
    const result = await socialManager.createGuest();
    if (result.success && result.session) {
        saveSession({ token: result.session.token, userId: result.user.id, username: result.user.username });
    }
    return result;
});

ipcMain.handle('social-signout', async () => {
    if (!socialManager) return { success: false, error: 'Social no iniciado' };
    if (socialManager.isLoggedIn()) {
        const profile = await socialManager.getProfile();
        if (profile && profile.is_guest) {
            await socialManager.deleteAccount();
            deleteSession();
            return { success: true };
        }
    }
    const result = await socialManager.signout();
    if (result.success) deleteSession();
    return result;
});

ipcMain.handle('social-signout-with-delete', async () => {
    if (!socialManager) return { success: false, error: 'Social no iniciado' };
    try {
        const result = await socialManager.deleteAccount();
        if (result.success) deleteSession();
        return result;
    } catch (e) {
        console.error('[SOCIAL] Delete account error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('social-delete-account', async () => {
    if (!socialManager) return { success: false, error: 'Social no iniciado' };
    return await socialManager.deleteAccount();
});

// ── Session persistence ──
ipcMain.handle('social-restore-session', async () => {
    const saved = loadSession();
    if (!saved || !saved.token || !socialManager) return null;
    try {
        const session = await socialDb.getSession(saved.token);
        if (!session) { deleteSession(); return null; }
        socialManager.activeSession = { token: session.token, user_id: session.user_id };
        socialManager.activeUserId = session.user_id;
        await socialDb.updateStatus(session.user_id, 'online', '');
        socialManager.startHeartbeat();
        socialManager.startPolling((event) => {
            if (event.type === 'pending-requests' || event.type === 'game-invites') broadcastSocialState();
        });
        startSocialPolling(socialManager);
        return { username: session.username, userId: session.user_id };
    } catch (e) {
        console.error('[SOCIAL] Restore session error:', e);
        deleteSession();
        return null;
    }
});

ipcMain.on('social-get-session', (e) => {
    e.returnValue = loadSession();
});

ipcMain.on('social-is-logged-in', (e) => {
    e.returnValue = !!(socialManager && socialManager.isLoggedIn());
});
ipcMain.handle('social-get-account', async () => {
    try {
        if (!socialManager) return null;
        return await socialManager.getProfile();
    } catch (e) {
        console.error('[SOCIAL] get-account error:', e);
        return null;
    }
});

ipcMain.handle('social-get-user-by-username', async (_, { username }) => {
    username = sanitizeString(username, 50);
    try {
        if (!socialManager) return null;
        return await socialManager.getUserByUsername(username);
    } catch (e) {
        console.error('[SOCIAL] get-user-by-username error:', e);
        return null;
    }
});

// ── Friends ──
ipcMain.handle('social-send-friend-request', async (_, { toUser }) => {
    toUser = sanitizeString(toUser, 50);
    try {
        if (!socialManager) return { success: false, error: 'Social no iniciado' };
        return await socialManager.sendFriendRequest(toUser);
    } catch (e) {
        console.error('[SOCIAL] send-friend-request error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('social-accept-friend', async (_, { fromUser }) => {
    fromUser = sanitizeString(fromUser, 50);
    try {
        if (!socialManager) return;
        const pending = await socialManager.getPendingRequests();
        const req = pending.find(r => r.username === fromUser);
        if (req) await socialManager.acceptFriendRequest(req.id);
    } catch (e) {
        console.error('[SOCIAL] accept-friend error:', e);
    }
});

ipcMain.handle('social-reject-friend', async (_, { fromUser }) => {
    fromUser = sanitizeString(fromUser, 50);
    try {
        if (!socialManager) return;
        const pending = await socialManager.getPendingRequests();
        const req = pending.find(r => r.username === fromUser);
        if (req) await socialManager.rejectFriendRequest(req.id);
    } catch (e) {
        console.error('[SOCIAL] reject-friend error:', e);
    }
});

ipcMain.handle('social-remove-friend', async (_, { friendUser }) => {
    friendUser = sanitizeString(friendUser, 50);
    try {
        if (!socialManager) return;
        const friends = await socialManager.listFriends();
        const friend = friends.find(f => f.username === friendUser);
        if (friend) {
            await socialManager.removeFriend(friend.id);
            setTimeout(() => broadcastSocialState(), 100);
        }
    } catch (e) {
        console.error('[SOCIAL] remove-friend error:', e);
    }
});

ipcMain.handle('social-list-friends', async () => {
    try {
        if (!socialManager) return [];
        return await socialManager.listFriends();
    } catch (e) {
        console.error('[SOCIAL] list-friends error:', e);
        return [];
    }
});

ipcMain.handle('social-search-users', async (_, { query }) => {
    query = sanitizeString(query, 100);
    if (!socialManager || !query || query.length < 1) return [];
    try {
        return await socialDb.searchUsers(query, 10);
    } catch { return []; }
});

ipcMain.handle('social-get-pending-requests', async () => {
    try {
        if (!socialManager) return [];
        return await socialManager.getPendingRequests();
    } catch (e) {
        console.error('[SOCIAL] get-pending-requests error:', e);
        return [];
    }
});

// ── Messages ──
ipcMain.handle('social-get-messages', async (_, { withUser }) => {
    withUser = sanitizeString(withUser, 50);
    if (!socialManager) return [];
    try {
        const target = await socialManager.getUserByUsername(withUser);
        if (!target) return [];
        const convId = await socialManager.getOrCreateConversation(target.id);
        if (!convId) return [];
        await socialManager.markRead(convId);
        const msgs = await socialManager.getMessages(convId);
        return msgs.map(m => ({
            id: m.id,
            from_user: m.sender_name,
            content: m.content,
            created_at: m.created_at
        }));
    } catch (e) {
        console.error('[SOCIAL] get-messages error:', e);
        return [];
    }
});

ipcMain.handle('social-send-message', async (_, { toUser, content }) => {
    toUser = sanitizeString(toUser, 50); content = sanitizeString(content, 5000);
    if (!socialManager) return null;
    try {
        const target = await socialManager.getUserByUsername(toUser);
        if (!target) return null;
        const convId = await socialManager.getOrCreateConversation(target.id);
        if (!convId) return null;
        return await socialManager.sendMessage(convId, content);
    } catch (e) {
        console.error('[SOCIAL] send-message error:', e);
        return null;
    }
});

// ── Notifications ──
ipcMain.handle('show-notification', (_, { type, data }) => {
    type = sanitizeString(type, 50);
    if (notificationManager) {
        notificationManager.show(type, data);
    }
});

ipcMain.handle('send-game-invite', async (event, { toUser }) => {
    toUser = sanitizeString(toUser, 50);
    try {
        if (!event.sender || event.sender.isDestroyed()) return { success: false };
        if (!socialManager || !socialManager.isLoggedIn()) return { success: false };
        const profile = await socialManager.getProfile();
        if (!profile) return { success: false, error: 'No profile' };
        const userId = socialManager.activeUserId;

        let serverIp = null;
        let p2pSessionId = null;

        try {
            const res = await socialDb.query(
                'SELECT COALESCE(status, \'OFFLINE\') AS status, server_ip FROM user_presence WHERE user_id = $1',
                [userId]
            );
            const row = res.rows[0] || { status: 'OFFLINE', server_ip: null };
            if (row.status === 'MULTIPLAYER') {
                if (row.server_ip && row.server_ip.startsWith('p2p:')) {
                    p2pSessionId = row.server_ip.replace('p2p:', '');
                } else {
                    serverIp = row.server_ip;
                }
            } else {
                const sessionId = `p2p_${Date.now()}_${userId}_${toUser}`;
                p2pSessionId = sessionId;
            }
        } catch (_) { /* presence table may not exist */ }

        if (p2pSessionId) {
            try {
                const guestInfo = await socialManager.getUserByUsername(toUser);
                const guestId = guestInfo?.id || '0';
                await socialDb.query(
                    `INSERT INTO p2p_sessions (session_id, host_user_id, guest_user_id, mc_port, status)
                     VALUES ($1, $2, $3, 25565, 'PENDING')
                     ON CONFLICT (session_id) DO NOTHING`,
                    [p2pSessionId, userId, guestId]
                );
            } catch (_) {}
        }

        await socialDb.sendGameInvite(userId, toUser, 'su mundo', serverIp, p2pSessionId);
        return { success: true, serverIp, p2pSessionId };
    } catch (e) {
        console.error('[SISTEMA C] send-game-invite:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.on('close-overlay', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
        console.log('[OVERLAY] hide via IPC');
    }
});

ipcMain.on('toggle-overlay', () => {
    toggleOverlay();
});

ipcMain.on('focus-main-window', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
    }
});

ipcMain.on('overlay-open-chat', (event, username) => {
    username = sanitizeString(username, 50);
    if (event.sender && event.sender.isDestroyed()) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('overlay-open-chat', username);
    }
});

ipcMain.handle('get-social-state', async () => {
    if (!socialManager || !socialManager.isLoggedIn()) return null;
    try {
        const profile = await socialManager.getProfile();
        const friends = await socialManager.listFriends();
        const socialDb = socialManager.db;
        const connected = !!(socialDb?.connected && socialDb?.pool);
        let pending = [];
        let gameInvites = [];
        try {
            const requests = await socialManager.getPendingRequests();
            pending = (requests || []).map(r => ({ from: r.from || r.from_username }));
        } catch (_) { /* requests table may not exist */ }
        try {
            const invites = await socialManager.getPendingGameInvites();
            gameInvites = (invites || []).map(inv => ({
                id: inv.id,
                from: inv.from_username,
                worldName: inv.world_name || 'jugar',
                serverIp: inv.server_ip,
                p2pSessionId: inv.p2p_session_id,
                createdAt: inv.created_at
            }));
        } catch (_) { /* game_invitations table may not exist */ }

        // Query user_presence for friends to get actual game status
        const friendIds = friends.map(f => f.id);
        let presenceRows = [];
        if (friendIds.length > 0 && socialDb && socialDb.connected) {
            try {
                const res = await socialDb.query(
                    `SELECT up.user_id, up.status AS game_status, up.server_ip, up.version
                     FROM user_presence up
                     WHERE up.user_id = ANY($1::int[])`,
                    [friendIds]
                );
                presenceRows = res.rows;
            } catch (e) { /* user_presence table may not exist */ }
        }
        const presenceMap = {};
        for (const row of presenceRows) {
            presenceMap[row.user_id] = row;
        }

        return {
            myUsername: profile?.username || '',
            connected,
            friends: friends.map(f => {
                let status = f.status || 'offline';
                let serverName = f.custom_status || undefined;
                let version = f.custom_status?.includes('|') ? f.custom_status.split('|')[0] : undefined;

                const gp = presenceMap[f.id];
                if (gp && gp.game_status !== 'OFFLINE' && status === 'online') {
                    status = gp.game_status === 'MULTIPLAYER' ? 'playing_multiplayer' :
                             gp.game_status === 'SINGLEPLAYER' ? 'playing_singleplayer' : status;
                    if (status !== 'online') {
                        version = gp.version || version;
                        serverName = gp.server_ip || serverName;
                    }
                }

                return {
                    username: f.username,
                    status,
                    serverName,
                    version,
                };
            }),
            pending,
            gameInvites
        };
    } catch (e) {
        console.error('[SOCIAL] get-social-state error:', e);
        return null;
    }
});

// ── Status / Misc ──
ipcMain.handle('social-accept-game-invite', async (_, { inviteId }) => {
    inviteId = sanitizeId(inviteId);
    if (!socialManager || !socialManager.isLoggedIn()) return { success: false };
    try {
        const result = await socialManager.acceptGameInvite(inviteId);
        broadcastSocialState();
        if (result && result.p2p_session_id) {
            const profile = await socialManager.getProfile();
            const username = profile?.username || '';
            const gameJar = getActiveGameDir() ? path.join(getActiveGameDir(), 'versions', '1.21.1', '1.21.1.jar') : '';
            if (gameJar && fs.existsSync(gameJar)) {
                setImmediate(() => {
                    const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
                    if (win) {
                        win.webContents.send('p2p-auto-join', {
                            sessionId: result.p2p_session_id,
                            jarPath: gameJar,
                            username
                        });
                    }
                });
            }
        }
        return { success: true, p2p_session_id: result?.p2p_session_id };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('social-reject-game-invite', async (_, { inviteId }) => {
    inviteId = sanitizeId(inviteId);
    if (!socialManager || !socialManager.isLoggedIn()) return { success: false };
    try {
        await socialManager.rejectGameInvite(inviteId);
        broadcastSocialState();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ── Admin Window IPC ──
ipcMain.handle('admin-get-initial-state', async () => {
    const onlinePlayers = Array.from(playerSessions.values()).filter(p => p.online).length;
    return {
        logs: serverLogBuffer,
        players: Object.fromEntries(playerSessions),
        startTime: serverStartTime,
        uptime: serverStartTime ? Date.now() - serverStartTime : 0,
        maxPlayers: maxPlayerCount,
        chatCount: chatMessageCount
    };
});

ipcMain.handle('admin-send-command', async (_, { command }) => {
    command = sanitizeString(command, 500);
    if (serverProcess) {
        serverProcess.proc.stdin.write(command + '\n');
        broadcastToAdmin('admin-log', { text: '> ' + command, ts: Date.now() });
        return { success: true };
    }
    return { success: false, error: 'Servidor no activo' };
});

ipcMain.handle('admin-open-window', async () => {
    openAdminWindow();
    broadcastToAdmin('admin-server-ready', { startTime: Date.now() });
    for (let i = 0; i < 3; i++) {
        setTimeout(() => broadcastToAdmin('admin-log', { text: 'Bienvenido a la consola del servidor', ts: Date.now() }), i * 500);
    }
    return { success: true };
});

ipcMain.handle('admin-get-player-stats', async () => {
    const stats = {};
    for (const [username, session] of playerSessions) {
        const total = session.online ? session.totalMs + (Date.now() - session.joinTime) : session.totalMs;
        stats[username] = { ...session, currentSessionMs: session.online ? Date.now() - session.joinTime : 0, totalMs: total };
    }
    return stats;
});

ipcMain.handle('admin-close-server', async () => {
    try {
        if (tunnelProcess) { tunnelProcess.proc.kill('SIGTERM'); tunnelProcess = null; }
        tunnelRetries = 0;
        if (serverProcess) { serverProcess.proc.kill('SIGTERM'); serverProcess = null; }
        if (adminWindow && !adminWindow.isDestroyed()) { adminWindow.close(); adminWindow = null; }
        serverLogBuffer = [];
        playerSessions.clear();
        serverStartTime = null;
        chatMessageCount = 0;
        maxPlayerCount = 0;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('social-get-friend-status', async (_, { friendUsername }) => {
    friendUsername = sanitizeString(friendUsername, 50);
    try {
        if (!socialManager) return null;
        const target = await socialManager.getUserByUsername(friendUsername);
        if (!target) return null;
        return await socialManager.getFriendStatus(target.id);
    } catch (e) {
        console.error('[SOCIAL] get-friend-status error:', e);
        return null;
    }
});

ipcMain.handle('social-list-online-friends', async () => {
    if (!socialManager) return [];
    return await socialManager.listFriends();
});

ipcMain.on('social-retry', () => {
    stopSocialManager();
    startSocialManager(NEON_DB_URL);
});

ipcMain.on('set-minimize-to-tray', (e, { value }) => {
    value = sanitizeBoolean(value);
    const cfg = loadConfig();
    cfg.minimizeToTray = value;
    saveConfig(cfg);
    e.returnValue = true;
});

ipcMain.on('set-suppress-updates', (e, { value }) => {
    value = sanitizeBoolean(value);
    const cfg = loadConfig();
    cfg.suppressUpdateNotifications = value;
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
    if (!profileData || typeof profileData !== 'object') { e.returnValue = null; return; }
    const cfg = loadConfig();
    const id = generateId();
    const profile = {
        id,
        name: String(profileData.name || 'Nueva Versión').slice(0, 100),
        icon: String(profileData.icon || '⛏️').slice(0, 10),
        versionId: String(profileData.versionId || '').slice(0, 50),
        gameDirectory: String(profileData.gameDirectory || '').slice(0, 500),
        ram: String(profileData.ram || '4').slice(0, 10),
        jvmArgs: String(profileData.jvmArgs || '').slice(0, 1000),
        mods: []
    };
    cfg.profiles.push(profile);
    if (!cfg.activeProfileId) cfg.activeProfileId = id;
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('update-profile', (e, updatedProfile) => {
    if (!updatedProfile || typeof updatedProfile !== 'object') { e.returnValue = null; return; }
    const cfg = loadConfig();
    const idx = cfg.profiles.findIndex(p => p.id === sanitizeId(updatedProfile.id));
    if (idx !== -1) cfg.profiles[idx] = { ...cfg.profiles[idx], ...updatedProfile };
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('remove-profile', (e, { id }) => {
    id = sanitizeId(id);
    const cfg = loadConfig();
    cfg.profiles = cfg.profiles.filter(p => p.id !== id);
    if (cfg.activeProfileId === id) cfg.activeProfileId = cfg.profiles[0]?.id || '';
    saveConfig(cfg);
    e.returnValue = cfg.profiles;
});

ipcMain.on('set-active-profile', (e, { id }) => {
    id = sanitizeId(id);
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

            const account_ = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
            const skinFile_ = account_?.skinPath ? path.resolve(account_.skinPath) : null;
            const textures = {};
            if (skinFile_ && fs.existsSync(skinFile_)) {
                textures.SKIN = { url: `http://127.0.0.1:${SKIN_SERVER_PORT}/skin/${encodeURIComponent(username)}.png` };
            }
            const texturePayload = {
                timestamp: Date.now(), profileId: uuid, profileName: username,
                textures: textures
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

let _javaCache = null;
function findBestJava() {
    if (_javaCache) return _javaCache;
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
    _javaCache = { path: bestPath, version: bestVersion };
    return _javaCache;
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
    profileId = sanitizeId(profileId);
    startSkinServer();
    try {
        const cfg = loadConfig();
        const profile = cfg.profiles.find(p => p.id === profileId) || cfg.profiles[0];
        const account = cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];

        if (!profile || !profile.versionId) {
            event.reply('launch-status', { type: 'error', data: 'Versión sin Minecraft configurado' });
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
            const keystrokesJar = app.isPackaged
                ? path.join(process.resourcesPath, 'mods', 'keystrokes-1.0.0.jar')
                : path.join(__dirname, 'void-mod', 'build', 'libs', 'keystrokes-1.0.0.jar');
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
        global.activeInstancesCount = activeInstances;
        event.reply('launch-status', { type: 'instances', data: activeInstances });

        updateSocialGameStatus('playing_singleplayer', profile.versionId || version, null);

        const uid = socialManager?.getUserId();
        if (uid) {
            activeProcesses.set(uid, { state: 'SINGLEPLAYER', version: profile.versionId || version, serverIp: null, presenceInterval: null });
            emitMinecraftState(uid, 'SINGLEPLAYER', null, profile.versionId || version);
        }

        instanceLauncher.launch(opts);
        instanceLauncher.on('debug', e => console.log('[DEBUG]', e));
        instanceLauncher.on('data', e => {
            console.log('[DATA]', e);
            const lanMatch = e.match(/Started serving on (\d+)/);
            if (lanMatch && overlayWindow && !overlayWindow.isDestroyed()) {
                overlayWindow.webContents.send('admin-toast', { msg: 'Mundo LAN detectado — Puerto ' + lanMatch[1], type: 'info' });
            }
        });
        instanceLauncher.on('progress', e => event.reply('launch-status', { type: 'progress', data: e }));
        instanceLauncher.on('close', (code) => {
            setTimeout(() => {
                updateSocialGameStatus('online', null, null);
                if (uid) {
                    activeProcesses.delete(uid);
                    emitMinecraftState(uid, 'OFFLINE', null, null);
                }
            }, 2000);
            activeInstances = Math.max(0, activeInstances - 1);
            global.activeInstancesCount = activeInstances;
            console.log('[CLOSE] Instancia cerrada, activas:', activeInstances);
            const win = BrowserWindow.getAllWindows()[0];
            if (win) { win.show(); win.focus(); }
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
    mcVersion = sanitizeString(mcVersion, 50);
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
    vanillaId = sanitizeString(vanillaId, 50); fabricVersion = sanitizeString(fabricVersion, 50);
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
    mcVersion = sanitizeString(mcVersion, 50); forgeVersion = sanitizeString(forgeVersion, 50);
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
    query = sanitizeString(query, 100); loader = sanitizeString(loader, 50); gameVersion = sanitizeString(gameVersion, 20); offset = typeof offset === 'number' ? offset : 0;
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
    projectId = sanitizeString(projectId, 100); loader = sanitizeString(loader, 50); gameVersion = sanitizeString(gameVersion, 20);
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
    profileId = sanitizeId(profileId); modId = sanitizeString(modId, 100); modName = sanitizeString(modName, 200);
    if (!modFile || typeof modFile !== 'object') return { success: false, error: 'Datos de mod inválidos' };
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
    profileId = sanitizeId(profileId); modId = sanitizeString(modId, 100);
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
    profileId = sanitizeId(profileId);
    const cfg = loadConfig();
    const profile = cfg.profiles.find(p => p.id === profileId);
    event.returnValue = profile?.mods || [];
});

// ─────────────────────────────────────────────
// IPC — DEPENDENCIAS DE UN MOD
// ─────────────────────────────────────────────
ipcMain.handle('get-mod-dependencies', async (_, { versionId }) => {
    versionId = sanitizeString(versionId, 100);
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
    query = sanitizeString(query, 100); offset = typeof offset === 'number' ? offset : 0;
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
    profileId = sanitizeId(profileId); modpackName = sanitizeString(modpackName, 200);
    if (!versionData || typeof versionData !== 'object') return { success: false, error: 'Datos de versión inválidos' };
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
// CURSEFORGE_API_KEY declared at top of file (env section)

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
    query = sanitizeString(query, 200); gameVersion = sanitizeString(gameVersion, 20); modLoaderType = typeof modLoaderType === 'number' ? modLoaderType : undefined; categoryId = sanitizeString(categoryId, 50);
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
    modId = typeof modId === 'number' ? modId : parseInt(String(modId), 10) || 0; gameVersion = sanitizeString(gameVersion, 20); modLoaderType = typeof modLoaderType === 'number' ? modLoaderType : undefined;
    try {
        const params = {};
        if (gameVersion) params.gameVersion = gameVersion;
        if (modLoaderType) params.modLoaderType = modLoaderType;

        const data = await cfRequest(`/mods/${modId}/files`, params);
        return data.data || [];
    } catch { return []; }
});

ipcMain.handle('install-curseforge-mod', async (event, { profileId, fileData, modName }) => {
    profileId = sanitizeId(profileId); modName = sanitizeString(modName, 200);
    if (!fileData || typeof fileData !== 'object') return { success: false, error: 'Datos de mod inválidos' };
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
    if (!data || typeof data !== 'object') return;
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
    key = sanitizeString(key, 100);
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
    console.log('[VOID-CLIENT] Module editor requested for', gameDir);
});

// ─────────────────────────────────────────────
// P2P — PEER-TO-PEER MULTIPLAYER
// ─────────────────────────────────────────────

async function findFreePort(start = 25565) {
    const maxAttempts = 10;
    for (let port = start; port < start + maxAttempts; port++) {
        try {
            await new Promise((resolve, reject) => {
                const srv = require('net').createServer();
                srv.on('error', reject);
                srv.listen(port, '127.0.0.1', () => {
                    srv.close(() => resolve());
                });
            });
            return port;
        } catch (_) { /* port in use, try next */ }
    }
    return start + maxAttempts;
}

const _p2pEngineCache = new Map(); // sessionId → P2PEngine for reuse

ipcMain.handle('p2p-start-hosting', async (_, { sessionId, guestUserId, mcPort, userId }) => {
    sessionId = sanitizeString(sessionId, 100); guestUserId = typeof guestUserId === 'number' ? guestUserId : 0; mcPort = typeof mcPort === 'number' ? mcPort : 25565; userId = typeof userId === 'number' ? userId : 0;
    try {
        if (!activeProcesses.has(userId)) {
            return { success: false, error: 'Inicia el servidor primero' };
        }
        const pool = socialDb?.pool;
        if (!pool) return { success: false, error: 'DB no conectada' };

        const engine = new P2PEngine(pool);
        _p2pEngineCache.set(sessionId, engine);

        engine.on('channel-open', async (sid, dc) => {
            const bridge = new P2PBridge();
            const port = mcPort || 25565;
            await bridge.startHostBridge(dc, port);
            activeBridges.set(sid, { engine, bridge });

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('p2p-status', { stage: 'CONNECTED', sessionId: sid });
            }
            openAdminWindow();
            broadcastToAdmin('admin-server-ready', { startTime: serverStartTime || Date.now() });
        });

        engine.on('channel-closed', (sid) => {
            const entry = activeBridges.get(sid);
            if (entry) { entry.bridge?.stop(); activeBridges.delete(sid); }
            _p2pEngineCache.delete(sid);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('p2p-status', { stage: 'DISCONNECTED', sessionId: sid });
            }
        });

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('p2p-status', { stage: 'SIGNALING', sessionId });
        }

        await engine.createOffer(sessionId, userId, guestUserId, mcPort || 25565);

        if (socialDb) {
            try {
                const version = '1.21.1';
                await socialDb.query(
                    `UPDATE user_presence SET status = 'MULTIPLAYER', server_ip = $2, version = $3, last_seen = NOW() WHERE user_id = $1`,
                    [userId, `p2p:${sessionId}`, version]
                );
            } catch (_) {}
        }

        engine.waitForAnswer(sessionId, 60000).catch(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('p2p-status', { stage: 'TIMEOUT', sessionId });
            }
        });

        return { success: true };
    } catch (e) {
        console.error('[P2P] start-hosting error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('p2p-join-session', async (_, { sessionId, userId, jarPath, username }) => {
    sessionId = sanitizeString(sessionId, 100); userId = typeof userId === 'number' ? userId : 0; jarPath = sanitizePath(jarPath); username = sanitizeString(username, 50);
    try {
        const pool = socialDb?.pool;
        if (!pool) return { success: false, error: 'DB no conectada' };

        const engine = new P2PEngine(pool);
        _p2pEngineCache.set(sessionId, engine);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('p2p-status', { stage: 'SIGNALING', sessionId });
        }

        await engine.createAnswer(sessionId, userId);

        engine.pollHostCandidates(sessionId, (candidate) => {
            // candidates auto-forwarded via addRemoteCandidate in engine
        });

        engine.on('channel-open', async (sid, dc) => {
            const bridge = new P2PBridge();
            const proxyPort = await findFreePort(25565);
            await bridge.startGuestBridge(dc, proxyPort);
            activeBridges.set(sid, { engine, bridge });

            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('p2p-status', { stage: 'CONNECTED', proxyPort, sessionId: sid });
            }

            const javaInfo = findBestJava();
            const javaPath = javaInfo?.path || 'java';
            const gameDir = getActiveGameDir() || path.join(process.env.APPDATA, '.void-launcher');
            const args = [
                `-Djava.library.path=${path.join(gameDir, 'versions', '1.21.1', 'natives')}`,
                '-cp', jarPath,
                'net.minecraft.client.main.Main',
                '--username', username,
                '--server', `127.0.0.1:${proxyPort}`,
            ];

            const mc = child_process.spawn(javaPath, args, { stdio: 'pipe' });
            mc.stdout.on('data', (d) => process.stdout.write(d));
            mc.stderr.on('data', (d) => process.stderr.write(d));
            mc.on('exit', () => {
                bridge.stop();
                engine.closeSession(sid).catch(() => {});
                activeBridges.delete(sid);
                _p2pEngineCache.delete(sid);
            });
        });

        engine.on('channel-closed', (sid) => {
            const entry = activeBridges.get(sid);
            if (entry) { entry.bridge?.stop(); activeBridges.delete(sid); }
            _p2pEngineCache.delete(sid);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('p2p-status', { stage: 'DISCONNECTED', sessionId: sid });
            }
        });

        return { success: true };
    } catch (e) {
        console.error('[P2P] join-session error:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('p2p-stop-hosting', async (_, { sessionId }) => {
    sessionId = sanitizeString(sessionId, 100);
    try {
        const entry = activeBridges.get(sessionId);
        if (entry) {
            entry.bridge?.stop();
            await entry.engine.closeSession(sessionId);
            activeBridges.delete(sessionId);
        }
        const engine = _p2pEngineCache.get(sessionId);
        if (engine) {
            await engine.closeSession(sessionId);
            _p2pEngineCache.delete(sessionId);
        }
        return { success: true };
    } catch (e) {
        console.error('[P2P] stop-hosting error:', e);
        return { success: false, error: e.message };
    }
});

// Cleanup P2P on quit
const origQuit = app.quit;
app.on('before-quit', () => {
    for (const [sid, entry] of activeBridges) {
        try { entry.bridge?.stop(); } catch (_) {}
        try { entry.engine?.closeSession(sid); } catch (_) {}
    }
    activeBridges.clear();
    _p2pEngineCache.clear();
    try { require('node-datachannel').cleanup(); } catch (_) {}
});
