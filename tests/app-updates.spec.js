import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Real HTTP responses are essential here: Playwright routing disables the
// browser HTTP cache and would hide the stale transitive-module regression.
async function releaseServer({ modern = false } = {}) {
  const state = { modern, assets: 1, version: '17', fail: null, offline: false };
  const worker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const oldWorker = `const CACHE='atlas-pessoal-legacy';
    const FILES=['./','./index.html','./styles.css','./src/main.js','./src/map.js'];
    self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
    self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
    self.addEventListener('fetch',e=>{if(new URL(e.request.url).origin!==self.location.origin)return;
      e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request)));});`;
  const server = createServer(async (req, res) => {
    // Disconnect the origin too: Chromium may report navigator.onLine=true
    // after a navigation and keep service-worker networking outside CDP's
    // offline emulation. A real failed origin guarantees a cache-only read.
    if (state.offline) { req.socket.destroy(); return; }
    const path = new URL(req.url, 'http://localhost').pathname.slice('/atlas/'.length);
    try {
      if (path === state.fail) { res.writeHead(503); res.end('Publication incomplete'); return; }
      let body, type = 'text/javascript', cache = 'public, max-age=86400';
      if (!path || path === 'index.html') {
        type = 'text/html'; cache = 'no-store';
        const query = state.modern ? `?v=${state.version}` : '';
        body = `<!doctype html><html><head><meta charset="utf-8"><meta name="atlas-version" content="${state.version}">
          <link rel="stylesheet" href="./styles.css${query}">
          ${state.modern ? `<script type="module" src="./src/app-updates.js${query}"></script>` : '<script>navigator.serviceWorker.register("./sw.js")</script>'}
          <script type="module" src="./src/main.js${query}"></script></head><body>
          <p id="places"></p><footer><small id="version">${state.version}</small><button data-app-update>Atualizar site</button><p id="app-update-status" hidden></p></footer>
          <section id="app-update-banner" hidden>Nova versão disponível <button data-app-update>Atualizar agora</button></section>
          <dialog><form method="dialog"><input aria-label="Notas da viagem"><button>Fechar formulário</button></form></dialog></body></html>`;
      } else if (path === 'sw.js') { cache = 'no-store'; body = state.modern ? worker.replace(/const VERSION = '[^']+';/, `const VERSION = '${state.version}';`) : oldWorker; }
      else if (path === 'styles.css') { type = 'text/css'; body = `[hidden]{display:none!important} #places{color:${state.assets === 1 ? 'rgb(200, 0, 0)' : 'rgb(0, 120, 0)'}}`; }
      else if (path === 'src/main.js') body = "import { render } from './map.js'; render();";
      else if (path === 'src/map.js') body = `export function render(){document.getElementById('places').textContent=${JSON.stringify(state.assets === 1 ? 'Marcadores antigos' : 'Memórias, avaliações e fotos')};}`;
      else { body = await readFile(new URL(`../${path}`, import.meta.url)); type = path.endsWith('.css') ? 'text/css' : path.endsWith('.json') || path.endsWith('.geojson') ? 'application/json' : path.endsWith('.png') ? 'image/png' : 'text/javascript'; }
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache }); res.end(body);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}/atlas/`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
async function activeVersion(page) {
  return page.evaluate(async () => {
    if (!navigator.serviceWorker.controller) return null;
    const channel = new MessageChannel();
    return new Promise(resolve => { const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, 1000); channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); resolve(event.data.version); }; navigator.serviceWorker.controller.postMessage({ type: 'ATLAS_VERSION' }, [channel.port2]); });
  });
}
async function seedMemories(page) {
  await page.evaluate(async () => {
    localStorage.setItem('session-witness', 'existing-session');
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('atlas-update-test', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('memories');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, transaction = db.transaction('memories', 'readwrite'); transaction.objectStore('memories').put({ name: 'Minha viagem', notes: 'Edição aguardando sincronização', dirty: true, photo: new Blob(['foto original'], { type: 'image/jpeg' }) }, 'paris'); transaction.oncomplete = () => { db.close(); resolve(); }; };
    });
  });
}
async function memories(page) {
  return page.evaluate(async () => {
    const record = await new Promise(resolve => { const open = indexedDB.open('atlas-update-test'); open.onsuccess = () => { const db = open.result, request = db.transaction('memories').objectStore('memories').get('paris'); request.onsuccess = () => { db.close(); resolve(request.result); }; }; });
    return { ...record, photo: await record.photo.text(), session: localStorage.getItem('session-witness') };
  });
}

test('atualiza módulos presos no cache HTTP, preserva dados e rota e reabre offline com URLs versionadas', async ({ page, context }) => {
  const release = await releaseServer();
  try {
    await page.goto(release.url); await expect(page.locator('#places')).toHaveText('Marcadores antigos');
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await seedMemories(page); const saved = await memories(page);
    release.state.assets = 2;
    await page.reload();
    // Reproduce the old behavior with a warm browser cache, before applying the fix.
    await expect(page.locator('#places')).toHaveText('Marcadores antigos');
    await expect(page.locator('#places')).toHaveCSS('color', 'rgb(200, 0, 0)');
    release.state.modern = true;
    await page.goto(`${release.url}?atlas-update=17#/roteiro/minha-trip`);
    await expect.poll(() => activeVersion(page)).toBe('17');
    await expect(page.locator('#app-update-banner')).toBeVisible();
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    await expect(page).toHaveURL(/atlas-update=\d{10,}#\/roteiro\/minha-trip$/);
    await expect(page.locator('#places')).toHaveText('Memórias, avaliações e fotos');
    await expect(page.locator('#places')).toHaveCSS('color', 'rgb(0, 120, 0)');
    expect(await memories(page)).toEqual(saved);
    release.state.offline = true; await context.setOffline(true); await page.reload();
    await expect(page.locator('#places')).toHaveText('Memórias, avaliações e fotos');
    await expect(page.locator('#places')).toHaveCSS('color', 'rgb(0, 120, 0)');
    expect(await memories(page)).toEqual(saved);
    await expect.poll(() => page.locator('[data-app-update]').first().evaluate(button => typeof button.onclick)).toBe('function');
    const offlineURL = page.url();
    await page.getByRole('button', { name: 'Atualizar site' }).click();
    await expect(page.locator('#app-update-status')).toContainText(/Conecte-se à internet|Suas memórias continuam salvas/);
    expect(page.url()).toBe(offlineURL);
  } finally { await release.close(); }
});

test('uma atualização que chega durante uma edição avisa e espera sem recarregar nem descartar o formulário', async ({ page }) => {
  const release = await releaseServer({ modern: true });
  try {
    await page.goto(release.url); await expect.poll(() => activeVersion(page)).toBe('17');
    await page.evaluate(() => document.querySelector('dialog').showModal());
    await page.getByLabel('Notas da viagem').fill('Ainda estou escrevendo minha avaliação');
    const url = page.url(); release.state.version = '18'; release.state.assets = 2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await expect.poll(() => activeVersion(page)).toBe('18');
    await expect(page.locator('#app-update-banner')).toBeVisible();
    await expect(page.getByLabel('Notas da viagem')).toHaveValue('Ainda estou escrevendo minha avaliação');
    expect(page.url()).toBe(url);
    await page.locator('[data-app-update]').first().evaluate(button => button.click());
    await expect(page.locator('#app-update-status')).toContainText('Salve ou feche');
    expect(page.url()).toBe(url);
    await page.getByRole('button', { name: 'Fechar formulário' }).click();
    await page.getByRole('button', { name: 'Atualizar agora' }).click();
    await expect(page.locator('#version')).toHaveText('18');
    await expect(page.locator('#places')).toHaveText('Memórias, avaliações e fotos');
  } finally { await release.close(); }
});

test('uma publicação incompleta mantém a versão offline anterior e os dados locais', async ({ page, context }) => {
  const release = await releaseServer({ modern: true });
  try {
    await page.goto(release.url); await expect.poll(() => activeVersion(page)).toBe('17');
    await seedMemories(page); const saved = await memories(page), url = page.url();
    release.state.version = '18'; release.state.assets = 2; release.state.fail = 'src/trip-photo-picker.js';
    await page.getByRole('button', { name: 'Atualizar site' }).click();
    await expect(page.locator('#app-update-status')).toContainText('Suas memórias continuam salvas');
    await expect(page.getByRole('button', { name: 'Atualizar site' })).toBeEnabled();
    expect(page.url()).toBe(url); expect(await activeVersion(page)).toBe('17'); expect(await memories(page)).toEqual(saved);
    release.state.offline = true; await context.setOffline(true); await page.reload();
    await expect(page.locator('#version')).toHaveText('17');
    await expect(page.locator('#places')).toHaveText('Marcadores antigos');
    expect(await memories(page)).toEqual(saved);
  } finally { await release.close(); }
});
