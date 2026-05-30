
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GAME_FILES_DIR = path.join(__dirname, '..', 'game-files');
const MANIFEST_OUTPUT = path.join(__dirname, '..', 'dist', 'manifest.json');
const LOCAL_MANIFEST = path.join(process.env.APPDATA || process.env.HOME, 'void-launcher', 'manifest-local.json');

// Source directories to scan
const SOURCE_DIRS = [
  { src: path.join(GAME_FILES_DIR, 'mods'), dest: 'mods' },
  { src: path.join(GAME_FILES_DIR, 'config'), dest: 'config' }
];

// Individual files to include
const INDIVIDUAL_FILES = [
  { src: path.join(GAME_FILES_DIR, 'options.txt'), dest: 'options.txt' }
];

/**
 * Calculate SHA256 hash of a file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - SHA256 hash as hex string
 */
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Get file size in bytes
 * @param {string} filePath - Path to the file
 * @returns {Promise<number>} - File size in bytes
 */
function getFileSize(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stats) => {
      if (err) reject(err);
      else resolve(stats.size);
    });
  });
}

/**
 * Load local manifest if it exists
 * @returns {Promise<Object>} - Local manifest or empty object
 */
async function loadLocalManifest() {
  try {
    if (fs.existsSync(LOCAL_MANIFEST)) {
      const data = fs.readFileSync(LOCAL_MANIFEST, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Could not load local manifest:', err.message);
  }
  return {};
}

/**
 * Save local manifest
 * @param {Object} manifest - Manifest to save
 */
function saveLocalManifest(manifest) {
  const dir = path.dirname(LOCAL_MANIFEST);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LOCAL_MANIFEST, JSON.stringify(manifest, null, 2));
}

/**
 * Generate manifest for game files
 * @returns {Promise<Object>} - Generated manifest
 */
async function generateManifest() {
  console.log('Scanning game files for manifest generation...');
  
  const localManifest = await loadLocalManifest();
  const manifest = {
    version: require('../package.json').version,
    generated: new Date().toISOString(),
    baseUrl: `https://github.com/Upalaif200/void-launcher/releases/download/v${require('../package.json').version}/`,
    files: []
  };

  // Process source directories
  for (const { src, dest } of SOURCE_DIRS) {
    if (!fs.existsSync(src)) {
      console.warn(`Source directory does not exist: ${src}`);
      continue;
    }

    const files = fs.readdirSync(src);
    for (const file of files) {
      const filePath = path.join(src, file);
      const relativePath = path.join(dest, file).replace(/\\/g, '/');
      
      try {
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          const hash = await getFileHash(filePath);
            const size = stats.size;
          
          // Check if file changed - on first run, treat all as 'add'
          const localFileInfo = localManifest.files?.find(f => f.path === relativePath);
          let action;
          if (!localManifest.files || localManifest.files.length === 0) {
            // First run - no previous manifest
            action = 'add';
          } else {
            action = localFileInfo && localFileInfo.sha256 === hash ? 'unchanged' : 'update';
          }
          
          manifest.files.push({
            path: relativePath,
            sha256: hash,
            size: size,
            action: action
          });
        }
      } catch (err) {
        console.error("Error processing file:", err.message);
      }
    }
  }

  // Process individual files
  for (const { src, dest } of INDIVIDUAL_FILES) {
    if (!fs.existsSync(src)) {
      console.warn("Source file does not exist:");
      continue;
    }

    try {
      const hash = await getFileHash(src);
      const stats = fs.statSync(src);
      const size = stats.size;
      
      // Check if file changed - on first run, treat all as 'add'
      const localFileInfo = localManifest.files?.find(f => f.path === dest);
      let action;
      if (!localManifest.files || localManifest.files.length === 0) {
        // First run - no previous manifest
        action = 'add';
      } else {
        action = localFileInfo && localFileInfo.sha256 === hash ? 'unchanged' : 'update';
      }
      
      manifest.files.push({
        path: dest,
        sha256: hash,
        size: size,
        action: action
      });
    } catch (err) {
      console.error("Error processing file:", err.message);
    }
  }

  // Filter out unchanged files for delta manifest
  manifest.files = manifest.files.filter(f => f.action !== 'unchanged');
  
  // Add delete actions for files that existed before but no longer do
  const localFiles = localManifest.files || [];
  for (const localFile of localFiles) {
    const existsInSource = SOURCE_DIRS.some(({ src, dest }) => {
      if (!localFile.path.startsWith(dest + '/')) return false;
      const relativePath = localFile.path.slice(dest.length + 1);
      return fs.existsSync(path.join(src, relativePath));
    }) || INDIVIDUAL_FILES.some(({ src, dest }) => {
      return localFile.path === dest && fs.existsSync(src);
    });
    
    if (!existsInSource) {
      manifest.files.push({
        path: localFile.path,
        sha256: null,
        size: 0,
        action: 'delete'
      });
    }
  }

  // Sort files by path for consistent output
  manifest.files.sort((a, b) => a.path.localeCompare(b.path));
  
  return manifest;
}

// Main execution
generateManifest()
  .then(manifest => {
    // Ensure output directory exists
    const outputDir = path.dirname(MANIFEST_OUTPUT);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Write manifest
    fs.writeFileSync(MANIFEST_OUTPUT, JSON.stringify(manifest, null, 2));
    
    // Also save as local manifest for next comparison
    saveLocalManifest(manifest);
    
    console.log(`Manifest generated successfully: ${MANIFEST_OUTPUT}`);
    console.log(`Found ${manifest.files.length} files to update:`);
    manifest.files.forEach(file => {
      console.log(`  ${file.action}: ${file.path} (${file.size} bytes)`);
    });
  })
  .catch(err => {
    console.error('Failed to generate manifest:', err);
    process.exit(1);
  });
