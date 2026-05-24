'use strict';
/* ═══════════════════════════════════════════════
   VOID LAUNCHER — RENDERER v1.1
   ═══════════════════════════════════════════════ */
const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const skinview3d = require('skinview3d');
const os = require('os');

// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────
let cfg = ipcRenderer.sendSync('get-config');
let editingProfileId = null;   // null = crear nuevo

// ─────────────────────────────────────────────
// SKIN VIEWER 3D
// ─────────────────────────────────────────────
const skinContainer = document.getElementById('skin-container');
const activeAccount = () => cfg.accounts.find(a => a.id === cfg.activeAccountId) || cfg.accounts[0];
const activeProfile = () => cfg.profiles.find(p => p.id === cfg.activeProfileId) || cfg.profiles[0];

const skinViewer = new skinview3d.SkinViewer({
    canvas: document.createElement('canvas'),
    width: 220, height: 340,
    skin: 'https://mineskin.org/textures/8/a/8a39f041217642ac9719e7f256247f1f.png'
});
skinContainer.appendChild(skinViewer.canvas);
skinViewer.animation = new skinview3d.IdleAnimation();
skinViewer.controls.enableZoom = false;

function reloadSkin() {
    const acc = activeAccount();
    if (acc?.skinPath && fs.existsSync(acc.skinPath)) {
        skinViewer.loadSkin(`file://${acc.skinPath}`);
    }
}
reloadSkin();

// ─────────────────────────────────────────────
// ROUTER DE VISTAS
// ─────────────────────────────────────────────
function navigate(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    // Acciones al entrar en cada vista
    if (viewId === 'view-main') refreshMainView();
    if (viewId === 'view-accounts') renderAccountsList();
    if (viewId === 'view-profiles') { renderProfilesList(); closeEditPanel(); }
    if (viewId === 'view-mods') refreshModsView();
    if (viewId === 'view-install') initInstallView();
}

document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
});
document.querySelectorAll('.icon-action-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
});

// ─────────────────────────────────────────────
// VENTANA
// ─────────────────────────────────────────────
document.getElementById('close-btn').addEventListener('click', () => ipcRenderer.send('close-app'));
document.getElementById('minimize-btn').addEventListener('click', () => ipcRenderer.send('minimize-app'));

// ─────────────────────────────────────────────
// VISTA PRINCIPAL
// ─────────────────────────────────────────────
function refreshMainView() {
    cfg = ipcRenderer.sendSync('get-config');
    const acc = activeAccount();
    const prof = activeProfile();

    document.getElementById('main-account-name').textContent = acc?.username || 'Sin cuenta';
    document.getElementById('main-profile-name').textContent = prof?.name || 'Sin perfil';
    document.getElementById('main-profile-icon').textContent = prof?.icon || '⛏️';
    document.getElementById('main-profile-version').textContent = prof?.versionId || '─';

    const ram = prof?.ram || '4';
    document.getElementById('ram-slider').value = ram;
    document.getElementById('ram-value').textContent = ram;

    document.getElementById('main-welcome').textContent = `HOLA, ${(acc?.username || 'JUGADOR').toUpperCase()}`;

    // Cargar estado de cosméticos
    loadCosmeticsState();
}

function loadCosmeticsState() {
    const c = cfg.cosmetics || { keystrokes: false, dynamicFov: true, damageTilt: true };
    document.getElementById('toggle-keystrokes').checked = c.keystrokes;
    document.getElementById('toggle-dynamic-fov').checked = c.dynamicFov;
    document.getElementById('toggle-damage-tilt').checked = c.damageTilt;
}

function saveCosmeticsState() {
    const cosmetics = {
        keystrokes: document.getElementById('toggle-keystrokes').checked,
        dynamicFov: document.getElementById('toggle-dynamic-fov').checked,
        damageTilt: document.getElementById('toggle-damage-tilt').checked
    };
    ipcRenderer.send('save-cosmetics', cosmetics);
}

document.getElementById('toggle-keystrokes').addEventListener('change', saveCosmeticsState);
document.getElementById('toggle-dynamic-fov').addEventListener('change', saveCosmeticsState);
document.getElementById('toggle-damage-tilt').addEventListener('change', saveCosmeticsState);

const ramSlider = document.getElementById('ram-slider');
ramSlider.addEventListener('input', (e) => {
    document.getElementById('ram-value').textContent = e.target.value;
    cfg = ipcRenderer.sendSync('get-config');
    const prof = cfg.profiles.find(p => p.id === cfg.activeProfileId);
    if (prof) {
        prof.ram = e.target.value;
        ipcRenderer.sendSync('update-profile', prof);
        cfg = ipcRenderer.sendSync('get-config');
    }
});

// Dynamic RAM max (total system RAM - 1GB for OS)
const totalRamGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
const maxRam = Math.max(2, totalRamGB - 1);
if (ramSlider) {
    ramSlider.max = maxRam;
    if (parseInt(ramSlider.value) > maxRam) {
        ramSlider.value = String(maxRam);
        document.getElementById('ram-value').textContent = String(maxRam);
    }
}

// Play
const playBtn = document.getElementById('play-btn');
const launchStatusBox = document.getElementById('launch-status-box');
const launchStatusText = document.getElementById('launch-status-text');
const launchProgressFill = document.getElementById('launch-progress-fill');

playBtn.addEventListener('click', () => {
    cfg = ipcRenderer.sendSync('get-config');
    const prof = activeProfile();
    if (!prof?.versionId) {
        alert('El perfil activo no tiene una versión configurada.\nVe a Perfiles → edita el perfil y elige una versión.');
        return;
    }
    playBtn.disabled = true;
    playBtn.textContent = '⏳ INICIANDO...';
    launchStatusBox.style.display = 'block';
    launchStatusText.textContent = 'Preparando lanzamiento...';
    ipcRenderer.send('launch-game', { profileId: prof.id });
});

ipcRenderer.on('launch-status', (_, { type, data, instances }) => {
    if (type === 'progress') {
        const pct = data.total ? Math.round((data.task / data.total) * 100) : 0;
        launchStatusText.textContent = data.stage || 'Cargando...';
        launchProgressFill.style.width = `${pct}%`;
    } else if (type === 'instances') {
        updateInstanceBadge(data);
    } else if (type === 'close') {
        playBtn.disabled = false;
        playBtn.textContent = '▶ JUGAR';
        launchStatusBox.style.display = 'none';
        launchProgressFill.style.width = '0%';
        updateInstanceBadge(instances || 0);
    } else if (type === 'error') {
        playBtn.disabled = false;
        playBtn.textContent = '▶ JUGAR';
        launchStatusText.textContent = `❌ ${data}`;
    }
});

function updateInstanceBadge(count) {
    const badge = document.getElementById('instance-badge');
    const countEl = document.getElementById('instance-count');
    countEl.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
}

// Skin buttons
document.getElementById('skin-btn').addEventListener('click', async () => {
    const filePath = await ipcRenderer.invoke('open-skin-dialog');
    if (!filePath) return;
    skinViewer.loadSkin(`file://${filePath}`);
    const acc = activeAccount();
    if (acc) ipcRenderer.sendSync('update-account-skin', { id: acc.id, skinPath: filePath });
    cfg = ipcRenderer.sendSync('get-config');
});
document.getElementById('noveskin-btn').addEventListener('click', () => {
    shell.openExternal('https://minecraft.novaskin.me/skins');
});

// ─────────────────────────────────────────────
// VISTA: CUENTAS
// ─────────────────────────────────────────────
function renderAccountsList() {
    cfg = ipcRenderer.sendSync('get-config');
    const grid = document.getElementById('accounts-list');
    grid.innerHTML = '';

    cfg.accounts.forEach(acc => {
        const isActive = acc.id === cfg.activeAccountId;
        const card = document.createElement('div');
        card.className = `acct-card${isActive ? ' is-active' : ''}`;
        card.innerHTML = `
            <div class="acct-card-top">
                <span class="acct-emoji">👤</span>
                <span class="acct-name">${escHtml(acc.username)}</span>
                ${isActive ? '<span class="acct-badge">ACTIVA</span>' : ''}
            </div>
            <div class="acct-actions">
                ${!isActive ? `<button class="secondary-btn" onclick="selectAccount('${acc.id}')">Activar</button>` : ''}
                <button class="secondary-btn uninstall-btn" onclick="removeAccount('${acc.id}')">🗑</button>
            </div>`;
        grid.appendChild(card);
    });
}

document.getElementById('add-account-btn').addEventListener('click', () => {
    const input = document.getElementById('new-account-input');
    const name = input.value.trim();
    if (!name) return;
    ipcRenderer.sendSync('add-account', { username: name });
    input.value = '';
    cfg = ipcRenderer.sendSync('get-config');
    renderAccountsList();
    refreshMainView();
});

window.selectAccount = (id) => {
    ipcRenderer.sendSync('set-active-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderAccountsList();
    refreshMainView();
    reloadSkin();
};
window.removeAccount = (id) => {
    if (cfg.accounts.length <= 1) { alert('Debes tener al menos una cuenta.'); return; }
    if (!confirm('¿Eliminar esta cuenta?')) return;
    ipcRenderer.sendSync('remove-account', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderAccountsList();
    refreshMainView();
};

// ─────────────────────────────────────────────
// VISTA: PERFILES
// ─────────────────────────────────────────────
function renderProfilesList() {
    cfg = ipcRenderer.sendSync('get-config');
    const grid = document.getElementById('profiles-list');
    grid.innerHTML = '';

    cfg.profiles.forEach(prof => {
        const isActive = prof.id === cfg.activeProfileId;
        const card = document.createElement('div');
        card.className = `profile-card${isActive ? ' is-active' : ''}`;
        card.innerHTML = `
            <div class="profile-card-icon">${prof.icon || '⛏️'}</div>
            <div class="profile-card-name">${escHtml(prof.name)}</div>
            <div class="profile-card-version">${escHtml(prof.versionId || 'Sin versión')}</div>
            <div class="profile-card-actions" style="margin-top:6px;">
                ${!isActive ? `<button class="secondary-btn" onclick="selectProfile('${prof.id}')">Activar</button>` : '<span style="font-size:10px;color:var(--accent);">✓ Activo</span>'}
                <button class="secondary-btn" onclick="openEditProfile('${prof.id}')">✏️</button>
                <button class="secondary-btn uninstall-btn" onclick="removeProfile('${prof.id}')">🗑</button>
            </div>`;
        grid.appendChild(card);
    });
}

document.getElementById('new-profile-btn').addEventListener('click', () => openEditProfile(null));

function openEditProfile(profileId) {
    editingProfileId = profileId;
    const panel = document.getElementById('profile-edit-panel');
    const title = document.getElementById('profile-edit-title');

    // Cargar versiones instaladas
    const versions = ipcRenderer.sendSync('get-installed-versions');
    const vsel = document.getElementById('edit-version');
    vsel.innerHTML = '<option value="">─ Sin versión ─</option>';
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        vsel.appendChild(opt);
    });

    if (profileId) {
        const prof = cfg.profiles.find(p => p.id === profileId);
        title.textContent = 'Editar Perfil';
        document.getElementById('edit-icon').value = prof.icon || '⛏️';
        document.getElementById('edit-name').value = prof.name || '';
        document.getElementById('edit-ram').value = prof.ram || '4';
        document.getElementById('edit-gamedir').value = prof.gameDirectory || '';
        document.getElementById('edit-jvmargs').value = prof.jvmArgs || '';
        vsel.value = prof.versionId || '';
    } else {
        title.textContent = 'Nuevo Perfil';
        document.getElementById('edit-icon').value = '⛏️';
        document.getElementById('edit-name').value = '';
        document.getElementById('edit-ram').value = '4';
        document.getElementById('edit-gamedir').value = '';
        document.getElementById('edit-jvmargs').value = '';
        vsel.value = '';
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
}

function closeEditPanel() {
    document.getElementById('profile-edit-panel').style.display = 'none';
    editingProfileId = null;
}

document.getElementById('cancel-edit-btn').addEventListener('click', closeEditPanel);

document.getElementById('save-profile-btn').addEventListener('click', () => {
    const data = {
        icon: document.getElementById('edit-icon').value || '⛏️',
        name: document.getElementById('edit-name').value.trim() || 'Perfil',
        versionId: document.getElementById('edit-version').value,
        ram: document.getElementById('edit-ram').value,
        gameDirectory: document.getElementById('edit-gamedir').value,
        jvmArgs: document.getElementById('edit-jvmargs').value.trim()
    };

    if (editingProfileId) {
        ipcRenderer.sendSync('update-profile', { id: editingProfileId, ...data });
    } else {
        ipcRenderer.sendSync('add-profile', data);
    }
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    closeEditPanel();
    refreshMainView();
});

document.getElementById('browse-gamedir-btn').addEventListener('click', async () => {
    const dir = await ipcRenderer.invoke('open-dir-dialog');
    if (dir) document.getElementById('edit-gamedir').value = dir;
});

// Emoji presets
document.querySelectorAll('.emoji-opt').forEach(el => {
    el.addEventListener('click', () => {
        document.getElementById('edit-icon').value = el.dataset.emoji;
    });
});

window.selectProfile = (id) => {
    ipcRenderer.sendSync('set-active-profile', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    refreshMainView();
};
window.openEditProfile = openEditProfile;
window.removeProfile = (id) => {
    if (cfg.profiles.length <= 1) { alert('Debes tener al menos un perfil.'); return; }
    if (!confirm('¿Eliminar este perfil?')) return;
    ipcRenderer.sendSync('remove-profile', { id });
    cfg = ipcRenderer.sendSync('get-config');
    renderProfilesList();
    refreshMainView();
};

// ─────────────────────────────────────────────
// CURSEFORGE — WEBVIEW
// ─────────────────────────────────────────────
let cfWebview = null;
let cfWebviewReady = false;

const cfCategoryUrls = {
    6: 'https://www.curseforge.com/minecraft/mc-mods',
    4471: 'https://www.curseforge.com/minecraft/modpacks',
    6552: 'https://www.curseforge.com/minecraft/shaders',
    4472: 'https://www.curseforge.com/minecraft/bukkit-plugins',
    4559: 'https://www.curseforge.com/minecraft/addons',
    1: 'https://www.curseforge.com/minecraft/worlds',
    12: 'https://www.curseforge.com/minecraft/texture-packs',
    4546: 'https://www.curseforge.com/minecraft/customization',
    4980: 'https://www.curseforge.com/minecraft/data-packs',
};

function refreshModsView() {
    cfg = ipcRenderer.sendSync('get-config');
    const prof = activeProfile();
    const label = document.getElementById('mods-profile-label');
    if (label) label.textContent = prof?.name || '─';
    initWebview();
    loadFolderSettings();
}

function initWebview() {
    const el = document.getElementById('cf-webview');
    if (!el) return;
    cfWebview = el;
    if (cfWebviewReady) return;
    cfWebviewReady = true;

    cfWebview.addEventListener('did-finish-load', () => {
        setupDownloadInterceptor();
    });
}

function setupDownloadInterceptor() {
    try {
        const wc = cfWebview.getWebContents();
        if (!wc || !wc.session) return;
        wc.session.removeAllListeners('will-download');
        wc.session.on('will-download', (event, item) => {
            const categoryId = parseInt(document.getElementById('cf-browse-by')?.value || '6');
            const folder = getCategoryFolder(categoryId);
            const filename = item.getFilename();
            const savePath = path.join(folder, filename);
            item.setSavePath(savePath);
            console.log('[CF] Download ->', savePath);

            item.on('done', (event, state) => {
                if (state === 'completed') {
                    console.log('[CF] Download complete:', filename);
                    shell.showItemInFolder(savePath);
                } else {
                    console.error('[CF] Download failed:', state);
                }
            });
        });
    } catch (e) {
        console.error('[CF] Download interceptor error:', e);
    }
}

function navigateCf() {
    const categoryId = parseInt(document.getElementById('cf-browse-by')?.value || '6');
    const baseUrl = cfCategoryUrls[categoryId] || cfCategoryUrls[6];

    const params = new URLSearchParams();
    params.set('page', '1');
    params.set('pageSize', '20');

    const sortMap = { '1': 'relevancy', '2': 'popularity', '3': 'updated', '4': 'name', '5': 'total+downloads' };
    const sortField = document.getElementById('cf-sort-by')?.value || '1';
    params.set('sortBy', sortMap[sortField] || 'relevancy');

    const gameVersion = document.getElementById('cf-game-version')?.value;
    if (gameVersion) params.set('gameVersion', gameVersion);

    const checkedLoaders = document.querySelectorAll('.cf-loader-check:checked');
    if (checkedLoaders.length > 0) {
        const loaderVals = Array.from(checkedLoaders).map(cb => cb.value).join(',');
        params.set('modLoaderType', loaderVals);
    }

    const url = baseUrl + '?' + params.toString();
    if (cfWebview) cfWebview.src = url;
}

// ── Folder settings ──
function loadFolderSettings() {
    ['mods', 'resourcepacks', 'saves'].forEach(key => {
        const input = document.getElementById(`cf-folder-${key}`);
        if (!input) return;
        const folderConfig = cfg.cfFolders || {};
        input.value = folderConfig[key] || getDefaultFolder(key);
    });
}

function getDefaultFolder(key) {
    const base = ipcRenderer.sendSync('get-userdata-path');
    const map = { mods: 'mods', resourcepacks: 'resourcepacks', saves: 'saves' };
    return path.join(base, map[key] || key);
}

function getCategoryFolder(categoryId) {
    const folderConfig = cfg.cfFolders || {};
    const keyMap = {
        6: 'mods', 4471: 'modpacks', 6552: 'shaderpacks',
        4472: 'plugins', 4559: 'addons', 1: 'saves',
        12: 'resourcepacks', 4546: 'customization', 4980: 'datapacks',
    };
    const key = keyMap[categoryId] || 'mods';
    return folderConfig[key] || getDefaultFolder(key);
}

window.browseFolder = async (key) => {
    const folder = await ipcRenderer.invoke('select-folder');
    if (!folder) return;
    cfg.cfFolders = cfg.cfFolders || {};
    cfg.cfFolders[key] = folder;
    ipcRenderer.sendSync('save-config', cfg);
    cfg = ipcRenderer.sendSync('get-config');
    const input = document.getElementById(`cf-folder-${key}`);
    if (input) input.value = folder;
};

// ── Event listeners for CF navigation ──
document.getElementById('cf-browse-by')?.addEventListener('change', navigateCf);
document.getElementById('cf-game-version')?.addEventListener('change', navigateCf);
document.getElementById('cf-sort-by')?.addEventListener('change', navigateCf);
document.querySelectorAll('.cf-loader-check').forEach(cb => cb.addEventListener('change', navigateCf));

// ─────────────────────────────────────────────
// MODPACKS — BÚSQUEDA E INSTALACIÓN
// ─────────────────────────────────────────────
let modpackSearchOffset = 0;
let modpackSearchTotal = 0;

{
    const el = document.getElementById('modpack-search-btn');
    if (el) el.addEventListener('click', () => doModpackSearch(true));
}
{
    const el = document.getElementById('modpack-search-input');
    if (el) el.addEventListener('keydown', e => {
        if (e.key === 'Enter') doModpackSearch(true);
    });
}
{
    const el = document.getElementById('modpack-load-more-btn');
    if (el) el.addEventListener('click', () => doModpackSearch(false));
}

async function doModpackSearch(reset = false) {
    if (reset) modpackSearchOffset = 0;
    const query = document.getElementById('modpack-search-input')?.value?.trim() ?? '';
    const btn = document.getElementById('modpack-search-btn');
    if (!btn) return;
    btn.textContent = '⏳'; btn.disabled = true;

    const result = await ipcRenderer.invoke('search-modpacks', { query, offset: modpackSearchOffset });
    btn.textContent = '🔍 Buscar'; btn.disabled = false;

    modpackSearchTotal = result.total;
    const grid = document.getElementById('modpack-results-grid');
    if (reset) grid.innerHTML = '';

    if (!result.hits?.length) {
        if (reset) grid.innerHTML = '<div class="empty-state">Sin modpacks en CurseForge</div>';
        document.getElementById('modpack-load-more-row').style.display = 'none';
        return;
    }

    result.hits.forEach(pack => {
        const card = buildModpackCard(pack);
        grid.appendChild(card);
    });

    modpackSearchOffset += result.hits.length;
    document.getElementById('modpack-load-more-row').style.display =
        modpackSearchOffset < modpackSearchTotal ? 'block' : 'none';
}

function buildModpackCard(pack) {
    const card = document.createElement('div');
    card.className = 'mod-card';
    const categories = (pack.categories || []).slice(0, 2);
    const tagsHtml = [
        '<span class="mod-tag modpack">CurseForge Pack</span>',
        ...categories.map(c => `<span class="mod-tag">${escHtml(c.name)}</span>`)
    ].join('');

    const iconUrl = pack.logo?.thumbnailUrl || pack.logo?.url;
    const iconHtml = iconUrl
        ? `<img src="${iconUrl}" alt="" onerror="this.parentElement.textContent='📦'">`
        : '📦';

    const author = pack.authors?.[0]?.name || '─';
    const downloads = pack.downloadCount ? `⬇ ${formatNum(pack.downloadCount)}` : '';

    card.innerHTML = `
        <div class="mod-icon">${iconHtml}</div>
        <div class="mod-info">
            <div class="mod-name">${escHtml(pack.name)}</div>
            <div class="mod-author">por ${escHtml(author)} ${downloads}</div>
            <div class="mod-desc">${escHtml(pack.summary || '')}</div>
            <div class="mod-meta">${tagsHtml}</div>
            <div class="mod-actions">
                <button class="secondary-btn install-btn"
                    onclick="openModpackVersions('${pack.id}','${escAttr(pack.name)}')">
                    📦 Ver versiones
                </button>
            </div>
        </div>`;
    return card;
}

async function openModpackVersions(projectId, modpackName) {
    const modal = document.getElementById('modpack-version-modal');
    document.getElementById('modal-modpack-name').textContent = `📦 ${modpackName}`;
    const list = document.getElementById('modal-modpack-versions-list');
    list.innerHTML = '<div style="color:var(--text2);font-size:12px;padding:10px;">Buscando packs en CurseForge...</div>';
    modal.style.display = 'flex';

    const versions = await ipcRenderer.invoke('get-modpack-versions', { projectId });
    list.innerHTML = '';

    if (!versions.length) {
        list.innerHTML = '<div style="color:var(--text2);padding:10px;">Sin versiones disponibles en CurseForge</div>';
        return;
    }

    // Solo ZIPs
    const valid = versions.filter(v => v.fileName?.endsWith('.zip'));

    valid.forEach(v => {
        const btn = document.createElement('button');
        btn.className = 'modal-version-btn';
        const mcVers = (v.gameVersions || []).slice(0, 3).join(', ');
        const date = new Date(v.fileDate).toLocaleDateString();
        btn.innerHTML = `
            <strong>${escHtml(v.displayName || v.fileName)}</strong>
            <span style="font-size:10px;color:var(--text2);margin-left:8px;">MC ${mcVers} · ${date}</span>`;
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.addEventListener('click', () => {
            modal.style.display = 'none';
            doInstallModpack(modpackName, v);
        });
        list.appendChild(btn);
    });
}
window.openModpackVersions = openModpackVersions;

document.getElementById('modpack-modal-close-btn').addEventListener('click', () => {
    document.getElementById('modpack-version-modal').style.display = 'none';
});

async function doInstallModpack(modpackName, versionData) {
    const prof = activeProfile();
    if (!prof) { alert('No hay perfil activo'); return; }

    const progressBox = document.getElementById('modpack-progress-box');
    const progressText = document.getElementById('modpack-progress-text');
    const progressFill = document.getElementById('modpack-progress-fill');
    const stepDetail = document.getElementById('modpack-step-detail');

    progressBox.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Iniciando instalación del modpack...';
    stepDetail.textContent = '';

    ipcRenderer.removeAllListeners('modpack-progress');
    ipcRenderer.on('modpack-progress', (_, { msg, percent }) => {
        progressText.textContent = msg;
        progressFill.style.width = `${percent}%`;
        stepDetail.textContent = msg.length > 60 ? msg.substring(0, 60) + '…' : '';
    });

    const result = await ipcRenderer.invoke('install-modpack', {
        profileId: prof.id,
        modpackName,
        versionData
    });

    if (result.success) {
        cfg = ipcRenderer.sendSync('get-config');
        progressText.textContent = `✅ ${modpackName} instalado — ${result.modsInstalled} mods, MC ${result.mcVersion}, loader: ${result.loaderType || 'vanilla'}`;
        progressFill.style.width = '100%';
        refreshMainView();
        alert(`✅ Modpack "${modpackName}" instalado con éxito.\n\n• ${result.modsInstalled} mods descargados\n• MC ${result.mcVersion}\n• Loader: ${result.loaderType || 'vanilla'}\n\nLa versión del perfil activo fue actualizada automáticamente.`);
    } else {
        progressText.textContent = `❌ Error: ${result.error}`;
    }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function extractMcVersion(id) {
    if (!id) return '';
    const match = id.match(/(\d+\.\d+(\.\d+)?)/);
    return match ? match[1] : '';
}
function formatNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
    return String(n);
}
function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
navigate('view-main');


let allVanillaVersions = [];
let allFabricVersions = [];

function initInstallView() {
    console.log('[INSTALL] initInstallView called');
    loadInstallVersions().catch(err => console.error('[INSTALL] Error:', err));
}

async function loadInstallVersions() {
    const sel = document.getElementById('vanilla-select');
    const forgeSel = document.getElementById('forge-mc-select');
    console.log('[INSTALL] loadInstallVersions, cached vanilla:', allVanillaVersions.length, 'fabric:', allFabricVersions.length);

    if (allVanillaVersions.length === 0) {
        sel.innerHTML = '<option value="">⏳ Cargando...</option>';
        console.log('[INSTALL] Fetching vanilla versions...');
        try {
            allVanillaVersions = await ipcRenderer.invoke('get-vanilla-versions');
            console.log('[INSTALL] Vanilla versions loaded:', allVanillaVersions ? allVanillaVersions.length : 'null');
            if (!allVanillaVersions || !allVanillaVersions.length) {
                throw new Error('API de Mojang devolvió lista vacía');
            }
            fillVanillaSelect();
            forgeSel.innerHTML = '';
            allVanillaVersions.filter(v => v.type === 'release').forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id; opt.textContent = v.id;
                forgeSel.appendChild(opt);
            });
        } catch (err) {
            console.error('[INSTALL] Vanilla error:', err);
            sel.innerHTML = '<option value="">Error: ' + (err.message || 'desconocido') + '</option>';
        }
    }

    if (allFabricVersions.length === 0) {
        const fsel = document.getElementById('fabric-select');
        try {
            console.log('[INSTALL] Fetching Fabric versions...');
            const raw = await ipcRenderer.invoke('get-fabric-versions');
            console.log('[INSTALL] Fabric versions received:', raw ? raw.length : 'null');
            allFabricVersions = Array.isArray(raw) ? raw : [];
            fsel.innerHTML = '';
            if (allFabricVersions.length === 0) {
                fsel.innerHTML = '<option value="">Sin versiones de Fabric</option>';
            } else {
                allFabricVersions.slice(0, 20).forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v; opt.textContent = 'Fabric Loader ' + v;
                    fsel.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('[INSTALL] Fabric error:', err);
            fsel.innerHTML = '<option value="">Error al cargar Fabric</option>';
        }
    }
    console.log('[INSTALL] loadInstallVersions complete');
}

document.getElementById('install-type').addEventListener('change', fillVanillaSelect);
function fillVanillaSelect() {
    const sel = document.getElementById('vanilla-select');
    if (!allVanillaVersions || !allVanillaVersions.length) {
        sel.innerHTML = '<option value="">⏳ Cargando...</option>';
        return;
    }
    const tipo = document.getElementById('install-type').value;
    const filtered = tipo === 'release'
        ? allVanillaVersions.filter(v => v.type === 'release')
        : allVanillaVersions;
    sel.innerHTML = '';
    filtered.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.id + (v.type !== 'release' ? ' (' + v.type + ')' : '');
        sel.appendChild(opt);
    });
}

document.getElementById('fabric-toggle').addEventListener('change', e => {
    document.getElementById('fabric-group').style.display = e.target.checked ? 'block' : 'none';
});

const installStatusBox = document.getElementById('install-status-box');
const installStatusText = document.getElementById('install-status-text');
const installProgressFill = document.getElementById('install-progress-fill');

document.getElementById('do-install-btn').addEventListener('click', async () => {
    const vanillaId = document.getElementById('vanilla-select').value;
    if (!vanillaId) { alert('Selecciona una versión de Minecraft'); return; }
    const fabricToggle = document.getElementById('fabric-toggle');
    const fabricVersion = fabricToggle.checked ? document.getElementById('fabric-select').value : null;

    const btn = document.getElementById('do-install-btn');
    btn.disabled = true; btn.textContent = '⏳ Instalando...';
    installStatusBox.style.display = 'block';

    const result = await ipcRenderer.invoke('install-version', { vanillaId, fabricVersion });
    btn.disabled = false; btn.textContent = '⬇ INSTALAR';

    if (result.success) {
        installStatusText.textContent = `✅ Instalado: ${result.versionId}`;
        installProgressFill.style.width = '100%';
    } else {
        installStatusText.textContent = `❌ Error: ${result.error}`;
    }
});

ipcRenderer.on('install-progress', (_, { msg, percent }) => {
    installStatusText.textContent = msg;
    installProgressFill.style.width = `${percent}%`;
    // También para Forge
    const gt = document.getElementById('forge-status-text');
    const gf = document.getElementById('forge-progress-fill');
    if (gt) gt.textContent = msg;
    if (gf) gf.style.width = `${percent}%`;
});

// ── Forge ──
async function loadForgeVanillaVersions() {
    // Ya se puebla en loadVanillaVersionsIfNeeded
}

document.getElementById('forge-mc-select').addEventListener('change', async function () {
    const mcVer = this.value;
    if (!mcVer) return;
    const fvsel = document.getElementById('forge-version-select');
    fvsel.innerHTML = '<option value="">⏳ Cargando versiones de Forge...</option>';
    const versions = await ipcRenderer.invoke('get-forge-versions', { mcVersion: mcVer });
    fvsel.innerHTML = '';
    if (!versions.length) {
        fvsel.innerHTML = '<option value="">Sin versiones de Forge disponibles</option>';
        return;
    }
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = `Forge ${v}`;
        fvsel.appendChild(opt);
    });
});

const forgeStatusBox = document.getElementById('forge-status-box');
const forgeStatusText = document.getElementById('forge-status-text');
const forgeProgressFill = document.getElementById('forge-progress-fill');

document.getElementById('do-forge-install-btn').addEventListener('click', async () => {
    const mcVersion = document.getElementById('forge-mc-select').value;
    const forgeVersion = document.getElementById('forge-version-select').value;
    if (!mcVersion) { alert('Selecciona una versión de Minecraft'); return; }
    if (!forgeVersion) { alert('Selecciona una versión de Forge'); return; }

    const btn = document.getElementById('do-forge-install-btn');
    btn.disabled = true; btn.textContent = '⏳ Instalando Forge...';
    forgeStatusBox.style.display = 'block';
    forgeProgressFill.style.width = '0%';

    const result = await ipcRenderer.invoke('install-forge', { mcVersion, forgeVersion });
    btn.disabled = false; btn.textContent = '⚒️ INSTALAR FORGE';

    if (result.success) {
        forgeStatusText.textContent = `✅ Forge instalado: ${result.versionId}`;
        forgeProgressFill.style.width = '100%';
        alert(`✅ Forge instalado correctamente.\nVersionId: ${result.versionId}\n\nAhora puedes asignarlo a un perfil.`);
    } else {
        forgeStatusText.textContent = `❌ Error: ${result.error}`;
    }
});

ipcRenderer.on('install-progress', (_, { msg, percent }) => {
    // Actualizar whichever status box is visible
    [
        [installStatusText, installProgressFill, installStatusBox],
        [forgeStatusText, forgeProgressFill, forgeStatusBox]
    ].forEach(([txt, fill, box]) => {
        if (txt && fill) { txt.textContent = msg; fill.style.width = `${percent}%`; }
    });
});
// ─────────────────────────────────────────────
// CONTROL DE SCROLL Y "VOLVER ARRIBA"
// ─────────────────────────────────────────────
const cfScrollContainer = document.querySelector('.cf-layout > .cf-main');
const cfBackToTop = document.getElementById('cf-back-to-top');

if (cfScrollContainer) {
    cfScrollContainer.addEventListener('scroll', () => {
        if (cfBackToTop) {
            cfBackToTop.style.display = cfScrollContainer.scrollTop > 300 ? 'flex' : 'none';
        }
    });
}

if (cfBackToTop) {
    cfBackToTop.addEventListener('click', () => {
        cfScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

// [VOID-CLIENT ADDITION] Client tab - Module Manager
const clientModulesContainer = document.getElementById('client-modules-list');

function refreshClientModules() {
    if (!clientModulesContainer) return;
    const hudCfg = ipcRenderer.sendSync('get-hud-config');
    clientModulesContainer.innerHTML = '';
    if (!hudCfg || !hudCfg.modules) return;
    for (const [name, data] of Object.entries(hudCfg.modules)) {
        const card = document.createElement('div');
        card.className = 'client-module-card';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = data.visible !== false;
        toggle.dataset.name = name;
        const label = document.createElement('span');
        label.className = 'mod-name';
        label.textContent = name.replace('Module', '');
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        const c = data.color || 0xFFFFFFFF;
        swatch.style.background = '#' + (c & 0x00FFFFFF).toString(16).padStart(6, '0');
        swatch.title = 'Color: 0x' + c.toString(16).toUpperCase();
        card.appendChild(toggle);
        card.appendChild(label);
        card.appendChild(swatch);
        clientModulesContainer.appendChild(card);
    }
}

document.getElementById('client-save-modules')?.addEventListener('click', () => {
    const cards = clientModulesContainer.querySelectorAll('.client-module-card');
    const modules = {};
    cards.forEach(card => {
        const toggle = card.querySelector('input[type="checkbox"]');
        const name = toggle.dataset.name;
        modules[name] = { visible: toggle.checked };
    });
    ipcRenderer.send('save-hud-config', { modules });
});

document.getElementById('client-open-editor')?.addEventListener('click', () => {
    ipcRenderer.send('launch-module-editor');
});

// [VOID-CLIENT ADDITION] Client tab - Performance Tweaks
function setupTweak(id, key, getVal) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
        const val = getVal ? getVal(el) : el.checked;
        ipcRenderer.send('write-options', { key, value: val });
    });
    el.addEventListener('input', () => {
        if (id === 'tweak-render-distance') document.getElementById('tweak-rd-value').textContent = el.value;
        if (id === 'tweak-max-fps') document.getElementById('tweak-fps-value').textContent = el.value;
    });
}

setupTweak('tweak-smooth-lighting', 'smoothLighting');
setupTweak('tweak-vsync', 'enableVsync');
setupTweak('tweak-fullscreen', 'fullscreen');
setupTweak('tweak-entity-shadows', 'entityShadows');
setupTweak('tweak-gui-scale', 'guiScale', el => parseInt(el.value));
setupTweak('tweak-render-distance', 'renderDistance', el => parseInt(el.value));
setupTweak('tweak-max-fps', 'maxFps', el => parseInt(el.value));

// Navigate to client view - refresh modules + cosmetics on enter
const origNavigate = navigate;
navigate = function(viewId) {
    origNavigate(viewId);
    if (viewId === 'view-client') {
        refreshClientModules();
        loadCosmeticsState();
    }
};
