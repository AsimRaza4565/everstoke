import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const fontDir = path.resolve('image-tools/fonts');
const localAppData = process.env.LOCALAPPDATA;
const userFontDir = path.join(localAppData, 'Microsoft', 'Windows', 'Fonts');

if (!fs.existsSync(userFontDir)) {
  fs.mkdirSync(userFontDir, { recursive: true });
}

const files = fs.readdirSync(fontDir).filter(f => f.endsWith('.ttf') || f.endsWith('.woff') || f.endsWith('.otf'));

for (const file of files) {
  const src = path.join(fontDir, file);
  const dest = path.join(userFontDir, file);
  try {
    fs.copyFileSync(src, dest);
    // Add registry entry in HKCU
    const fontTitle = path.basename(file, path.extname(file)) + ' (TrueType)';
    execSync(`reg add "HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Fonts" /v "${fontTitle}" /t REG_SZ /d "${dest}" /f`, { stdio: 'ignore' });
    console.log(`✓ Installed and registered ${file}`);
  } catch (err) {
    console.warn(`Failed ${file}:`, err.message);
  }
}
console.log('Font registration complete.');
