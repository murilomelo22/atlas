import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.webmanifest'), 'utf8'));
const files = ['index.html', 'styles.css', 'app.css', 'download.css', 'instalar.html', 'downloads', 'manifest.webmanifest', 'sw.js', 'config.js', 'src', 'vendor', 'assets', 'legal', 'ajuda.html'];
// Copy only explicit runtime assets. Tests, Git history, dependencies and
// deployment credentials never enter the distributable.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) await cp(path.join(root, file), path.join(output, file), { recursive: true });
for (const icon of manifest.icons) await readFile(path.join(output, icon.src));
await writeFile(path.join(output, 'version.json'), JSON.stringify({ version: '0.1.0', release: '24', format: 'pwa' }, null, 2) + '\n');
console.log(`Atlas 0.1.0 preparado em ${output}`);
