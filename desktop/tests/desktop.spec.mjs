import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const executablePath = process.env.ATLAS_DESKTOP_EXECUTABLE || require('electron');
const desktop = fileURLToPath(new URL('../', import.meta.url));
let application, profile;
async function launch() {
  const args = [...(process.env.ATLAS_DESKTOP_EXECUTABLE ? [] : [desktop]), `--user-data-dir=${profile}`];
  // The Linux CI/container has no usable kernel sandbox; shipped apps keep
  // Electron's sandbox enabled. macOS tests exercise the default sandbox.
  if (process.platform === 'linux') args.unshift('--no-sandbox');
  application = await electron.launch({ executablePath, args, timeout:30000, env:{ ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS:'true' } });
  const page = await application.firstWindow();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(document.documentElement.dataset.atlasState||'{}').ready)).toBe(true);
  await expect(page.locator('#add-button')).toBeEnabled();
  return page;
}
test.beforeEach(async () => { profile = await mkdtemp(path.join(tmpdir(), 'atlas-desktop-test-')); });
test.afterEach(async () => {
  const current = application; application = null;
  if (current) {
    // A denied native popup can leave an automation target pending on macOS.
    // Bound fixture cleanup; the persistence test below separately requires a
    // graceful close and verifies that a clean restart retains the memory.
    const closing = current.close().catch(() => {});
    let timer;
    await Promise.race([closing, new Promise(resolve => {
      timer = setTimeout(() => { current.process()?.kill('SIGKILL'); resolve(); }, 8000);
    })]);
    clearTimeout(timer);
  }
  await rm(profile, { recursive:true, force:true });
});

test('abre os arquivos locais com estilos, IndexedDB e isolamento de Node', async () => {
  const page = await launch();
  await expect(page).toHaveURL('atlas://app/');
  expect(await page.evaluate(() => ({ node:typeof window.require, process:typeof window.process, secure:isSecureContext, background:getComputedStyle(document.body).backgroundColor }))).toEqual({ node:'undefined', process:'undefined', secure:true, background:'rgb(16, 28, 23)' });
  await expect(page.locator('.destination-card')).toHaveCount(5);
  await expect(page.locator('#install-app-button')).toBeHidden();
  await page.locator('[data-open-app-info]').first().click();
  await expect(page.locator('#install-instructions')).toContainText('Não é necessário manter o navegador ou o Terminal');
  expect(await page.evaluate(() => navigator.serviceWorker?.controller == null)).toBe(true);
  await expect(page.locator('script[src*="app-updates.js"]')).toHaveCount(0);
  await page.locator('#app-info-close').click();
  await page.screenshot({ path:path.join(desktop,'../test-results/atlas-desktop.png') });
});

test('uma memória persiste depois de encerrar e abrir novamente o aplicativo', async () => {
  let page = await launch();
  await page.locator('#add-button').click();
  await page.getByLabel('Nome do destino').fill('Memória no aplicativo');
  await page.getByLabel('Latitude', { exact:true }).fill('38.7223');
  await page.getByLabel('Longitude', { exact:true }).fill('-9.1393');
  await page.getByRole('button',{ name:'Salvar destino', exact:true }).click();
  await expect(page.locator('#editor-dialog')).toBeHidden();
  await expect(page.locator('#destination-list')).toContainText('Memória no aplicativo');
  await application.close(); application = null;
  page = await launch();
  await expect(page.locator('#destination-list')).toContainText('Memória no aplicativo');
});

test('exporta um backup real pelo download nativo', async () => {
  const page = await launch();
  const output = path.join(profile, 'backup.json');
  await application.evaluate(({ session }, output) => {
    globalThis.testDownloadState = 'waiting';
    session.defaultSession.once('will-download', (_event,item) => {
      item.setSavePath(output);
      item.once('done', (_event,state) => { globalThis.testDownloadState = state; });
    });
  }, output);
  await page.locator('#export-button').click();
  await expect.poll(() => application.evaluate(() => globalThis.testDownloadState)).toBe('completed');
  const backup = JSON.parse(await readFile(output,'utf8'));
  expect(backup.destinations).toHaveLength(5);
});

test('reabre offline sem servidor e produz links públicos utilizáveis', async () => {
  const page = await launch();
  await page.context().setOffline(true);
  try {
    await page.reload({waitUntil:'domcontentloaded'});
    await expect.poll(()=>page.evaluate(()=>JSON.parse(document.documentElement.dataset.atlasState||'{}').ready)).toBe(true);
    await expect(page.locator('#add-button')).toBeEnabled();
    await expect(page.locator('.destination-card')).toHaveCount(5);
    const url = await page.evaluate(async () => (await import('./src/sharing.js')).appLink('#/perfil/viajante'));
    expect(url).toBe('https://murilomelo22.github.io/atlas/#/perfil/viajante');
  } finally { await page.context().setOffline(false); }
});

test('recusa protocolos externos perigosos e leituras fora do pacote', async () => {
  const page = await launch();
  expect(await page.evaluate(async () => (await fetch('atlas://app/%2e%2e%2fpackage.json')).status)).toBe(404);
  await page.evaluate(() => window.open('file:///etc/passwd'));
  expect(application.windows()).toHaveLength(1);
  await expect(page).toHaveURL('atlas://app/');
});
