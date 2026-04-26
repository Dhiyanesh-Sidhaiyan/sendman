// Rebrand the local Electron.app for dev mode so the macOS dock + menu bar say "Sendman"
// instead of "Electron". The packaged build uses electron-builder which sets the bundle
// metadata correctly on its own — this script only fixes the developer experience.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_NAME = 'Sendman';

if (process.platform !== 'darwin') process.exit(0);

const electronAppPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'Electron.app');
const plistPath = path.join(electronAppPath, 'Contents', 'Info.plist');

if (!fs.existsSync(plistPath)) {
  console.log('[rename-dev-electron] Electron not installed yet, skipping');
  process.exit(0);
}

try {
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName ${APP_NAME}" "${plistPath}"`);
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName ${APP_NAME}" "${plistPath}"`);

  // Rename the Mach-O binary inside the bundle and update CFBundleExecutable
  // so the dock label / Cmd+Tab switcher use APP_NAME instead of "Electron".
  const macOSDir = path.join(electronAppPath, 'Contents', 'MacOS');
  const oldBin = path.join(macOSDir, 'Electron');
  const newBin = path.join(macOSDir, APP_NAME);
  if (fs.existsSync(oldBin) && !fs.existsSync(newBin)) {
    fs.renameSync(oldBin, newBin);
    execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable ${APP_NAME}" "${plistPath}"`);
  }

  // The `electron` launcher reads this file to find the binary; keep it in sync.
  const pathTxt = path.join(__dirname, '..', 'node_modules', 'electron', 'path.txt');
  if (fs.existsSync(pathTxt)) {
    fs.writeFileSync(pathTxt, `Electron.app/Contents/MacOS/${APP_NAME}`);
  }

  // Force LaunchServices to re-read the bundle metadata.
  try {
    execSync(
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${electronAppPath}"`
    );
  } catch {}
  execSync(`touch "${electronAppPath}"`);
  console.log(`[rename-dev-electron] Rebranded Electron.app -> ${APP_NAME}`);
} catch (e) {
  console.warn('[rename-dev-electron] Failed:', e.message);
}
