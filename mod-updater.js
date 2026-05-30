
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ModUpdater {
  constructor() {
    this.updateChecks = 0;
    this.lastCheckTime = 0;
    this.CHECK_INTERVAL = 60 * 60 * 1000;
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000;
  }

  async fetchJSON(url, options = {}) {
    const { timeoutMs = 15000, extraHeaders = {} } = options;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await this._fetchJSONInternal(url, { timeoutMs, extraHeaders });
      } catch (err) {
        if (attempt === this.MAX_RETRIES - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, attempt)));
      }
    }
  }

  _fetchJSONInternal(url, options) {
    return new Promise((resolve, reject) => {
      const { timeoutMs, extraHeaders } = options;
      const get = (currentUrl) => {
        const mod = currentUrl.startsWith('https') ? https : http;
        const headers = { 'User-Agent': 'VoidLauncher/1.1', ...extraHeaders };
        const req = mod.get(currentUrl, { headers }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error('HTTP ' + res.statusCode + ' en ' + currentUrl));
          }
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('JSON invalido: ' + e.message)); }
          });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout (' + timeoutMs + 'ms) en ' + currentUrl)); });
      };
      get(url);
    });
  }

  async downloadFile(url, destPath, onProgress, options = {}) {
    const { timeoutMs = 60000, extraHeaders = {} } = options;
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        return await this._downloadFileInternal(url, destPath, onProgress, { timeoutMs, extraHeaders });
      } catch (err) {
        if (attempt === this.MAX_RETRIES - 1) throw err;
        if (fs.existsSync(destPath)) {
          try { fs.unlinkSync(destPath); } catch (e) {}
        }
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, attempt)));
      }
    }
  }

  _downloadFileInternal(url, destPath, onProgress, options) {
    return new Promise((resolve, reject) => {
      const { timeoutMs, extraHeaders } = options;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);
      const get = (currentUrl) => {
        const mod = currentUrl.startsWith('https') ? https : http;
        const headers = { 'User-Agent': 'VoidLauncher/1.1', ...extraHeaders };
        const req = mod.get(currentUrl, { headers }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close();
            if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
            return this.downloadFile(res.headers.location, destPath, onProgress, options).then(resolve).catch(reject);
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
        req.setTimeout(timeoutMs, () => { req.destroy(); file.close(); if (fs.existsSync(destPath)) fs.unlinkSync(destPath); reject(new Error('Timeout (' + timeoutMs + 'ms) en ' + currentUrl)); });
      };
      get(url);
    });
  }

  getAppDataDir() {
    return process.env.APPDATA || (process.platform === 'darwin' ?
      process.env.HOME + '/Library/Application Support' :
      process.env.HOME + '/.local/share');
  }

  getLocalManifestPath() {
    return path.join(this.getAppDataDir(), 'void-launcher', 'manifest-local.json');
  }

  async loadLocalManifest() {
    const manifestPath = this.getLocalManifestPath();
    try {
      if (fs.existsSync(manifestPath)) {
        const data = fs.readFileSync(manifestPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn('[ModUpdater] Could not load local manifest:', err.message);
    }
    return {};
  }

  saveLocalManifest(manifest) {
    const manifestPath = this.getLocalManifestPath();
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  async fetchLatestManifest() {
    try {
      const releaseData = await this.fetchJSON(
        'https://api.github.com/repos/Upalaif200/void-launcher/releases/latest',
        { timeoutMs: 10000 }
      );
      const manifestAsset = releaseData.assets.find(asset => asset.name === 'manifest.json');
      if (!manifestAsset) {
        throw new Error('manifest.json not found in latest release');
      }
      const manifestData = await this.fetchJSON(manifestAsset.browser_download_url, {
        timeoutMs: 15000
      });
      return manifestData;
    } catch (err) {
      throw new Error('Failed to fetch latest manifest: ' + err.message);
    }
  }

  async checkForUpdates() {
    this.updateChecks++;
    this.lastCheckTime = Date.now();
    try {
      console.log('[ModUpdater] Checking for updates...');
      const remoteManifest = await this.fetchLatestManifest();
      const localManifest = await this.loadLocalManifest();
      const updates = {
        version: remoteManifest.version,
        generated: remoteManifest.generated,
        baseUrl: remoteManifest.baseUrl,
        files: [],
        totalSize: 0
      };
      const localFilesMap = new Map();
      (localManifest.files || []).forEach(file => {
        localFilesMap.set(file.path, file);
      });
      for (const remoteFile of remoteManifest.files || []) {
        const localFile = localFilesMap.get(remoteFile.path);
        if (!localFile) {
          updates.files.push({ ...remoteFile, action: 'add' });
          updates.totalSize += remoteFile.size;
        } else if (localFile.sha256 !== remoteFile.sha256) {
          updates.files.push({ ...remoteFile, action: 'update' });
          updates.totalSize += remoteFile.size;
        }
      }
      for (const localFile of localManifest.files || []) {
        const remoteFile = remoteManifest.files.find(f => f.path === localFile.path);
        if (!remoteFile) {
          updates.files.push({ path: localFile.path, sha256: null, size: 0, action: 'delete' });
        }
      }
      if (updates.files.length === 0) {
        console.log('[ModUpdater] No updates available');
        return { ...updates, hasUpdate: false };
      }
      console.log('[ModUpdater] Update available: ' + updates.files.length + ' files to process');
      return { ...updates, hasUpdate: true };
    } catch (err) {
      console.error('[ModUpdater] Update check failed:', err.message);
      throw err;
    }
  }

  async applyUpdates(updateInfo, onProgress) {
    if (!updateInfo.hasUpdate || updateInfo.files.length === 0) {
      return { success: true, message: 'No updates to apply', filesProcessed: 0 };
    }
    const appDataDir = this.getAppDataDir();
    const voidLauncherDir = path.join(appDataDir, 'void-launcher');
    const processedFiles = [];
    let failedFiles = 0;

    console.log('[ModUpdater] Starting update process for ' + updateInfo.files.length + ' files');

    for (const fileInfo of updateInfo.files) {
      try {
        const filePath = path.join(voidLauncherDir, fileInfo.path);
        switch (fileInfo.action) {
          case 'add':
          case 'update':
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            await this.downloadFile(
              updateInfo.baseUrl + (fileInfo.assetName || fileInfo.path),
              filePath,
              (downloaded, total) => {
                if (onProgress) {
                  onProgress({ ...fileInfo, downloaded, total, percent: Math.round((downloaded / total) * 100) });
                }
              },
              { timeoutMs: 60000 }
            );
            processedFiles.push({ path: fileInfo.path, action: fileInfo.action, size: fileInfo.size });
            break;
          case 'delete':
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              processedFiles.push({ path: fileInfo.path, action: 'delete', size: 0 });
            }
            break;
        }
      } catch (err) {
        console.error('[ModUpdater] Failed to process file ' + fileInfo.path + ':', err.message);
        failedFiles++;
        if (fileInfo.action === 'add' || fileInfo.action === 'update') {
          const filePath = path.join(voidLauncherDir, fileInfo.path);
          if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) {}
          }
        }
      }
    }

    if (failedFiles === 0) {
      this.saveLocalManifest({
        version: updateInfo.version,
        generated: updateInfo.generated,
        files: updateInfo.files.map(f => ({ path: f.path, sha256: f.sha256, size: f.size }))
      });
      console.log('[ModUpdater] Update completed successfully: ' + processedFiles.length + ' files processed');
      return {
        success: true,
        message: 'Updated ' + processedFiles.length + ' files',
        filesProcessed: processedFiles.length,
        totalSize: updateInfo.totalSize
      };
    } else {
      console.error('[ModUpdater] Update completed with ' + failedFiles + ' failures');
      return {
        success: false,
        message: 'Updated ' + processedFiles.length + ' files with ' + failedFiles + ' errors',
        filesProcessed: processedFiles.length,
        failedFiles: failedFiles
      };
    }
  }

  shouldCheckForUpdates() {
    const now = Date.now();
    return (now - this.lastCheckTime) > this.CHECK_INTERVAL || this.lastCheckTime === 0;
  }

  async checkAndApplyUpdates(onProgress) {
    if (!this.shouldCheckForUpdates()) {
      return { success: true, message: 'Update check skipped (too soon)', skipped: true };
    }
    try {
      const updateInfo = await this.checkForUpdates();
      if (!updateInfo.hasUpdate) {
        return { success: true, message: 'No updates available', upToDate: true };
      }
      const result = await this.applyUpdates(updateInfo, onProgress);
      return result;
    } catch (err) {
      console.error('[ModUpdater] Check and apply failed:', err.message);
      return { success: false, message: 'Update check failed: ' + err.message, error: err.message };
    }
  }
}

const modUpdater = new ModUpdater();
module.exports = { modUpdater };
