const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const inquirer = require('inquirer');
const { Octokit } = require('@octokit/rest');

const GAME_FILES_DIR = path.join(__dirname, '..', 'game-files');
const MANIFEST_SCRIPT = path.join(__dirname, 'generate-manifest.js');
const MANIFEST_OUTPUT = path.join(__dirname, '..', 'dist', 'manifest.json');

async function runCommand(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
  } catch (error) {
    console.error(Command failed: );
    console.error(error.message);
    process.exit(1);
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return packageJson.version;
}

async function bumpVersion(type) {
  runCommand(\
pm version \);
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  return packageJson.version;
}

async function generateManifest() {
  console.log('Generating manifest...');
  runCommand(
ode \"\");
  
  // Read the generated manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_OUTPUT, 'utf8'));
  return manifest;
}

async function buildElectronApp() {
  console.log('Building Electron application...');
  runCommand('npm run build');
}

async function getGitHubReleaseAssets(tagName) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  });
  
  try {
    const { data: releases } = await octokit.repos.listReleases({
      owner: 'Upalaif200',
      repo: 'void-launcher'
    });
    
    const release = releases.find(r => r.tag_name === tagName);
    if (!release) {
      throw new Error(Release not found for tag );
    }
    
    return release.assets;
  } catch (error) {
    console.error('Failed to fetch GitHub release assets:', error.message);
    throw error;
  }
}

async function uploadAssetToRelease(tagName, filePath, label) {
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  });
  
  try {
    // First, check if asset already exists and delete it
    const assets = await getGitHubReleaseAssets(tagName);
    const existingAsset = assets.find(a => a.label === label || a.name === path.basename(filePath));
    
    if (existingAsset) {
      await octokit.repos.deleteReleaseAsset({
        owner: 'Upalaif200',
        repo: 'void-launcher',
        asset_id: existingAsset.id
      });
      console.log(Removed existing asset: );
    }
    
    // Upload new asset
    const fileSize = fs.statSync(filePath).size;
    console.log(Uploading  ( MB)...);
    
    const { data: asset } = await octokit.repos.uploadReleaseAsset({
      owner: 'Upalaif200',
      repo: 'void-launcher',
      tag_name: tagName,
      name: path.basename(filePath),
      label: label,
      data: fs.readFileSync(filePath)
    });
    
    console.log(Uploaded: );
    return asset;
  } catch (error) {
    console.error(Failed to upload asset :, error.message);
    throw error;
  }
}

async function createGitHubRelease(version, notes) {
  const tagName = \\;
  const octokit = new Octokit({
    auth: process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  });
  
  try {
    console.log(Creating GitHub release ...);
    
    const { data: release } = await octokit.repos.createRelease({
      owner: 'Upalaif200',
      repo: 'void-launcher',
      tag_name: tagName,
      target_commitish: 'master',
      name: tagName,
      body: notes,
      draft: false,
      prerelease: false
    });
    
    console.log(Release created: );
    return release;
  } catch (error) {
    console.error('Failed to create GitHub release:', error.message);
    throw error;
  }
}

async function main() {
  console.log('=== Void Launcher Release Script ===\\n');
  
  // Check for GH_TOKEN
  if (!process.env.GH_TOKEN && !process.env.GITHUB_TOKEN) {
    console.error('Error: GH_TOKEN or GITHUB_TOKEN environment variable is required');
    console.log('Please set your GitHub personal access token with repo scope');
    process.exit(1);
  }
  
  // Get current version
  let currentVersion = await getCurrentVersion();
  console.log(Current version: );
  
  // Ask for version bump type
  const { bumpType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'bumpType',
      message: 'Select version bump type:',
      choices: [
        { name: 'Patch (v1.0.9 → v1.0.10)', value: 'patch' },
        { name: 'Minor (v1.0.9 → v1.1.0)', value: 'minor' },
        { name: 'Major (v1.0.9 → v2.0.0)', value: 'major' },
        { name: 'Custom version', value: 'custom' }
      ]
    }
  ]);
  
  let newVersion = currentVersion;
  
  if (bumpType === 'custom') {
    const { customVersion } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customVersion',
        message: 'Enter new version (e.g., 1.0.10):',
        validate: input => {
          const valid = /^\\d+\\.\\d+\\.\\d+$/.test(input);
          return valid || 'Please enter a valid version number (e.g., 1.0.10)';
        }
      }
    ]);
    newVersion = customVersion;
  } else {
    // Bump version using npm
    newVersion = await bumpVersion(bumpType);
    console.log(Version bumped to: );
  }
  
  // Generate manifest
  const manifest = await generateManifest();
  const changedFiles = manifest.files.filter(f => f.action !== 'unchanged');
  console.log(Manifest generated with  changed files);
  
  // Build Electron app
  await buildElectronApp();
  
  // Create GitHub release
  const releaseNotes = Version  release\\n\\n +
    This release includes:\\n +
    - Updated Electron application\\n +
    - Manifest-based game file updates ( files changed)\\n +
    - Improved delta update system\\n\\n +
    Game file changes:\\n +
    changedFiles.map(f =>   - : ).join('\\n');
  
  const release = await createGitHubRelease(newVersion, releaseNotes);
  const tagName = \\;
  
  // Upload Electron installer
  const installerPath = path.join(__dirname, '..', 'dist', 'Void-Launcher-Setup-' + newVersion + '.exe');
  if (fs.existsSync(installerPath)) {
    await uploadAssetToRelease(tagName, installerPath, 'Void-Launcher-Setup-' + newVersion + '.exe');
  } else {
    console.warn(Installer not found at );
  }
  
  // Upload blockmap
  const blockmapPath = installerPath + '.blockmap';
  if (fs.existsSync(blockmapPath)) {
    await uploadAssetToRelease(tagName, blockmapPath, 'Void-Launcher-Setup-' + newVersion + '.exe.blockmap');
  }
  
  // Upload manifest.json
  await uploadAssetToRelease(tagName, MANIFEST_OUTPUT, 'manifest.json');
  
  // Upload individual changed game files (only the ones that were actually changed)
  const gameFilesToUpload = changedFiles.filter(f => f.action === 'add' || f.action === 'update');
  if (gameFilesToUpload.length > 0) {
    console.log(\\nUploading  changed game files...);
    for (const fileInfo of gameFilesToUpload) {
      const sourcePath = path.join(GAME_FILES_DIR, fileInfo.path);
      if (fs.existsSync(sourcePath)) {
        await uploadAssetToRelease(tagName, sourcePath, fileInfo.path);
      } else {
        console.warn(Source file not found: );
      }
    }
  }
  
  console.log(\\n=== Release  published successfully! ===\\n);
  console.log(Release URL: );
  console.log(\\nNext steps:);
  console.log(1. Test the update process on a test machine);
  console.log(2. Monitor GitHub release for any issues);
  console.log(3. Announce the release to users);
}

// Run the main function
main().catch(error => {
  console.error('Release process failed:', error);
  process.exit(1);
});
