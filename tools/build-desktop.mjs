import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.join(root, 'desktop/app');
await rm(destination, { recursive:true, force:true });
await mkdir(destination, { recursive:true });
for (const name of ['styles.css','app.css','config.js','src','vendor','assets']) {
  await cp(path.join(root, name), path.join(destination, name), { recursive:true });
}
let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace('<html lang="pt-BR">', '<html lang="pt-BR" data-atlas-desktop="true">');
html = html.replace(/^.*<script[^>]+src="\.\/src\/app-updates\.js[^\n]+\n/m, '');
html = html.replace(/^.*<link[^>]+href="\.\/download\.css[^\n]+\n/m, '');
html = html.replace(/^.*<div class="app-download">[^\n]+\n/m, '');
html = html.replace(/<button type="button" data-app-update class="text-button">Atualizar site<\/button>/g, '<a href="https://github.com/murilomelo22/atlas/releases" target="_blank" rel="noopener noreferrer" class="text-button">Ver atualizações</a>');
html = html.replace('Atlas 0.1 · acesso antecipado', 'Atlas 0.1.1 · aplicativo para Mac');
html = html.replace('0.1 <span>ACESSO ANTECIPADO', '0.1.1 <span>ACESSO ANTECIPADO');
html = html.replace('revisitado · 0.1</title>', 'revisitado · 0.1.1</title>');
await writeFile(path.join(destination, 'index.html'), html);
await mkdir(path.join(root, 'desktop/assets'), { recursive:true });
await cp(path.join(root, 'assets/icon-512.png'), path.join(root, 'desktop/assets/icon.png'));
console.log('Atlas desktop preparado: arquivos locais, sem servidor HTTP ou dependência de Python.');
