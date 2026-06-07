const { safeStorage } = require('electron');
const fs = require('fs');

let _safeAvailable = null;
function isSafeAvailable() {
  if (_safeAvailable !== null) return _safeAvailable;
  try {
    _safeAvailable = !!(safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable());
    if (!_safeAvailable) console.warn('[SecureStorage] safeStorage no disponible — usando texto plano');
  } catch {
    _safeAvailable = false;
    console.warn('[SecureStorage] safeStorage error — usando texto plano');
  }
  return _safeAvailable;
}

function encryptAndSave(filePath, data) {
  try {
    const json = JSON.stringify(data);
    if (isSafeAvailable()) {
      const encrypted = safeStorage.encryptString(json);
      fs.writeFileSync(filePath, encrypted);
    } else {
      fs.writeFileSync(filePath, json, 'utf8');
    }
  } catch (err) {
    console.error('[SecureStorage] Error encryptAndSave:', err.message);
    throw err;
  }
}

function loadAndDecrypt(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath);
    if (isSafeAvailable()) {
      const json = safeStorage.decryptString(raw);
      return JSON.parse(json);
    }
    try {
      const parsed = JSON.parse(raw.toString('utf8'));
      return parsed;
    } catch {
      return null;
    }
  } catch (err) {
    console.warn('[SecureStorage] Error loadAndDecrypt, puede ser formato antiguo:', err.message);
    return null;
  }
}

function deleteFile(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

module.exports = { encryptAndSave, loadAndDecrypt, deleteFile };
