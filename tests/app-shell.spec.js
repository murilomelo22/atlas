import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

async function localApp(page) {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = { url: '', publishableKey: '' };" }));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('#welcome-create')).toBeEnabled();
}

test('primeiro acesso cria uma memória real e não volta a interromper a coleção', async ({ page }) => {
  await localApp(page);
  await expect(page.locator('#first-access')).toBeVisible();
  await page.locator('#welcome-create').click();
  await expect(page.locator('#editor-dialog')).toBeVisible();
  await page.getByLabel('Nome do destino').fill('Minha primeira memória');
  await page.getByLabel('Latitude', { exact: true }).fill('38.7223');
  await page.getByLabel('Longitude', { exact: true }).fill('-9.1393');
  await page.getByRole('button', { name: 'Salvar destino', exact: true }).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await expect(page.locator('#destination-list')).toContainText('Minha primeira memória');
  await page.reload();
  await expect(page.locator('#add-button')).toBeEnabled();
  await expect(page.locator('#destination-list')).toContainText('Minha primeira memória');
  await expect(page.locator('#first-access')).toBeHidden();
});

test('boas-vindas respeita uma coleção anterior e pode ser revista pela ajuda', async ({ page }) => {
  await localApp(page);
  await page.evaluate(async () => {
    const { getDestinations, saveDestination } = await import('/src/db.js');
    const [sample] = await getDestinations();
    await saveDestination({ ...sample, id: 'existing-memory', example: false, name: 'Coleção anterior' }, []);
  });
  await page.reload();
  await expect(page.locator('#add-button')).toBeEnabled();
  await expect(page.locator('#first-access')).toBeHidden();
  await page.locator('[data-open-app-info]').first().click();
  await page.locator('#show-welcome').click();
  await expect(page.locator('#first-access')).toBeVisible();
  await page.locator('#welcome-dismiss').click();
  await expect(page.locator('#destination-list')).toContainText('Coleção anterior');
});

test('instalação sem prompt oferece instruções reais e mantém o navegador utilizável', async ({ page }) => {
  await localApp(page);
  await page.locator('#install-app-button').click();
  await expect(page.locator('#app-info-dialog')).toBeVisible();
  await expect(page.locator('#install-instructions')).toContainText(/Chrome|Safari/);
  await expect(page.locator('#install-native-button')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app-info-dialog')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('instalação cancelada pode ser retomada e a conclusão confirma o estado correto', async ({ page }) => {
  await localApp(page);
  async function offer(outcome) {
    await page.evaluate(outcome => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { window.installRequests = (window.installRequests || 0) + 1; };
      event.userChoice = Promise.resolve({ outcome });
      window.dispatchEvent(event);
    }, outcome);
  }
  await offer('dismissed');
  await page.locator('#install-app-button').click();
  expect(await page.evaluate(() => window.installRequests)).toBe(1);
  await expect(page.locator('#install-app-button')).toBeVisible();
  await offer('accepted');
  await page.locator('[data-open-app-info]').first().click();
  await expect(page.locator('#install-native-button')).toBeVisible();
  await page.locator('#install-native-button').click();
  await expect(page.locator('#install-status')).toContainText('Instalação solicitada');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#install-status')).toContainText('Atlas instalado');
  await expect(page.locator('#install-app-button')).toBeHidden();
  await page.locator('#app-info-close').click();
  await page.locator('[data-open-app-info]').first().click();
  await expect(page.locator('#install-instructions')).toContainText('já está aberto como aplicativo');
});

test('iPhone recebe instruções para adicionar à tela inicial', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1' }));
  await localApp(page);
  await page.locator('#install-app-button').click();
  await expect(page.locator('#install-instructions')).toContainText('No Safari');
  await expect(page.locator('#install-instructions')).toContainText('Adicionar à Tela de Início');
});

test('navegação móvel leva ao mapa, à coleção e aos roteiros sem esconder registros', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'A navegação inferior é específica do celular.');
  await localApp(page);
  await page.locator('#welcome-dismiss').click();
  await page.locator('[data-app-nav="memories"]').click();
  await expect(page.locator('#destinations-panel')).toBeInViewport();
  await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('[data-app-nav="map"]').click();
  await expect(page.locator('#map-area')).toBeInViewport();
  await page.locator('[data-app-nav="trips"]').click();
  await expect(page.locator('#trips-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('map-area').requestFullscreen = undefined);
  await page.locator('#clean-map-button').click();
  await expect(page.locator('.mobile-dock')).toBeHidden();
  await expect.poll(() => page.locator('#map-area').evaluate(area => Math.round(area.getBoundingClientRect().height) === innerHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

// A real HTTP origin (including failure at the server) exercises precaching,
// versioned imports, the installed start URL and hosting below a path prefix.
test('aplicativo instalado em subpasta reabre offline e preserva as memórias', async ({ page, context }) => {
  let disconnected = false;
  const root = new URL('../', import.meta.url);
  const server = createServer(async (request, response) => {
    if (disconnected) { request.socket.destroy(); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith('/pilot/')) { response.writeHead(404).end(); return; }
    const name = pathname.slice('/pilot/'.length) || 'index.html';
    try {
      const file = new URL(name, root);
      if (!file.href.startsWith(root.href)) { response.writeHead(403).end(); return; }
      const body = await readFile(file);
      const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/json';
      response.writeHead(200, { 'Content-Type': type }); response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/pilot/?source=installed`);
    await expect(page.locator('#add-button')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons).toHaveLength(3);
    await page.evaluate(async () => {
      const { getDestinations, saveDestination } = await import('./src/db.js');
      const [sample] = await getDestinations();
      await saveDestination({ ...sample, id: 'offline-witness', name: 'Memória para levar', example: false }, []);
    });
    disconnected = true; await context.setOffline(true); await page.reload();
    await expect(page.locator('#add-button')).toBeEnabled();
    await expect(page.locator('#destination-list')).toContainText('Memória para levar');
    await expect(page.locator('#app-connection-status')).toBeVisible();
    await page.locator('#install-app-button').click();
    await expect(page.locator('#app-info-dialog')).toBeVisible();
    expect(await page.locator('.app-info-brand img').evaluate(img => img.complete && img.naturalWidth === 192)).toBe(true);
  } finally {
    await context.setOffline(false);
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  }
});
