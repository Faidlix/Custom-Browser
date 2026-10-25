// 功能：建置 MV3 外掛及固定 ID。用法：npm run build；OAuth 選填 config.local.json 的 clientId。
import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { generateKeyPairSync, createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
let publicKey;
try { publicKey = JSON.parse(await readFile(new URL('extension-key.json', root), 'utf8')).publicKey; }
catch { publicKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' }).toString('base64'); await writeFile(new URL('extension-key.json', root), JSON.stringify({ publicKey }, null, 2)); }
let config = {};
try { config = JSON.parse(await readFile(new URL('config.local.json', root), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (config.clientId && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(config.clientId)) throw new Error('clientId 格式不正確');
const manifest = {
  manifest_version: 3, name: 'Custom Browser', version: '0.2.0', minimum_chrome_version: '116',
  description: '繁體中文 Arc 風格側欄、Spaces、圖片與 Google Drive 同步。', key: publicKey,
  permissions: ['sidePanel', 'tabs', 'storage', 'unlimitedStorage', 'identity', 'alarms'],
  host_permissions: ['https://www.googleapis.com/*'],
  action: { default_title: '開啟 Custom Browser' },
  background: { service_worker: 'background.js', type: 'module' },
  side_panel: { default_path: 'sidepanel.html' },
  commands: {
    '_execute_action': { suggested_key: { default: 'Alt+Shift+A' }, description: '開啟側欄' },
    'search': { suggested_key: { default: 'Alt+Shift+K' }, description: '開啟搜尋／指令列' },
    'next-space': { suggested_key: { default: 'Alt+Shift+S' }, description: '切換下一個 Space' }
  },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" }
};
if (config.clientId) manifest.oauth2 = { client_id: config.clientId, scopes: ['https://www.googleapis.com/auth/drive.file'] };
await writeFile(new URL('dist/manifest.json', root), JSON.stringify(manifest, null, 2));
await build({ entryPoints: ['src/background.ts', 'src/panel.ts', 'src/launch.ts'], outdir: 'dist', bundle: true, format: 'esm', target: 'chrome116', sourcemap: true });
for (const file of ['sidepanel.html', 'panel.css', 'launch.html']) await copyFile(new URL(`public/${file}`, root), new URL(`dist/${file}`, root));
const id = [...createHash('sha256').update(Buffer.from(publicKey, 'base64')).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
console.log(JSON.stringify({ extensionId: id, driveConfigured: !!config.clientId, output: 'dist' }, null, 2));
await writeFile(new URL('dist/build-info.json', root), JSON.stringify({ extensionId: id, driveConfigured: !!config.clientId, version: manifest.version }, null, 2));
