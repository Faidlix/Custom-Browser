// 功能：打包已建置的外掛並輸出 SHA-256。用法：npm run package；先由 build 產生 dist。
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';
const files = {};
for (const file of await readdir('dist')) if (!file.endsWith('.map')) files[file] = new Uint8Array(await readFile(`dist/${file}`));
const zip = zipSync(files);
const { version } = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
const name = `Custom-Browser-${version}.zip`;
await mkdir('artifacts', { recursive: true });
await writeFile(`artifacts/${name}`, zip);
const hash = createHash('sha256').update(zip).digest('hex');
await writeFile('artifacts/SHA256.txt', `${hash}  ${name}\n`);
console.log(hash);
