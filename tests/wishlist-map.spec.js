import { test, expect } from '@playwright/test';
import { mockTrips } from './trips-fixture.js';

test.use({ serviceWorkers: 'block' });
const row = page => page.locator('#wishlist-items [data-wish-id]');
async function open(page) {
  await page.locator('#wishlist-button').click();
  await expect(page.locator('#wishlist-dialog')).toBeVisible();
}
async function save(page) {
  await page.locator('#wishlist-save').click();
  await expect(page.locator('#wishlist-draft-state')).not.toContainText('Alterações no formulário');
}
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }

test('busca localiza um desejo; mapa, etapas, notas e backup persistem sem mudar memórias', async ({ page }) => {
  await mockTrips(page); await ready(page);
  await page.route('https://nominatim.openstreetmap.org/**', route => route.fulfill({ json: [{ lat: '35.0116', lon: '135.7681', display_name: 'Kyoto, Japão' }] }));
  await open(page); await page.locator('#wishlist-search').fill('Kyoto');
  await page.getByRole('button', { name: 'Kyoto, Japão', exact: true }).click();
  await expect(page.locator('#wishlist-name')).toHaveValue('Kyoto');
  await expect(page.locator('#wishlist-country')).toHaveValue('Japão');
  await page.locator('#wishlist-notes').fill('Ver o pôr do sol · indicação da Ana');
  await page.locator('#wishlist-status').selectOption('planning');
  await page.locator('#wishlist-entry-save').click();
  await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
  await expect(row(page)).toContainText('Planejando'); await save(page);
  await page.locator('#wishlist-view-list').click(); await expect(page.locator('#wishlist-map-panel')).toBeHidden();
  await page.getByRole('button', { name: 'Ver Kyoto no mapa' }).click();
  await expect(page.locator('#wishlist-map-panel')).toBeVisible();
  await expect(page.locator('.wishlist-place-popup')).toContainText('indicação da Ana');
  await page.getByRole('button', { name: 'Marcar como visitado Kyoto' }).click();
  await page.locator('#wishlist-filter').selectOption('planning'); await expect(row(page)).toHaveCount(0);
  await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(0);
  await page.locator('#wishlist-filter').selectOption('visited'); await expect(row(page)).toContainText('Já visitei'); await save(page);
  await page.locator('#wishlist-close').click();
  await expect(page.locator('.destination-card')).toHaveCount(5); await expect(page.locator('#stat-days')).toHaveText('15');
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup());
  expect(backup.wishlist.items[0]).toMatchObject({ status: 'visited', location: { lat: 35.0116, lng: 135.7681 } });
  await page.reload(); await open(page);
  await expect(row(page)).toContainText('Já visitei'); await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
  await expect(page.locator('#wishlist-map-summary')).toContainText('1 no mapa · 0 sem localização');
  await page.locator('#wishlist-close').click();
  await page.locator('#import-input').setInputFiles({ name: 'wishlist-map.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('#toast')).toContainText('sem duplicação'); await open(page);
  await expect(row(page)).toHaveCount(1); await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
});

test('lugares antigos continuam editáveis; coordenadas podem ser adicionadas e removidas offline', async ({ page, context }) => {
  await mockTrips(page); await ready(page);
  await page.evaluate(async () => {
    const db = await import('/src/db.js'); await db.saveWishlist({ is_public: false, items: [{ id: crypto.randomUUID(), name: 'Desejo antigo', country: '', notes: 'Preservar minha nota' }] }, null);
  });
  await open(page); await expect(row(page)).toContainText('Sem localização');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Editar lugar Desejo antigo' }).click();
  await page.locator('#wishlist-coordinates summary').click();
  await page.locator('#wishlist-lat').fill('0'); await page.locator('#wishlist-lng').fill('0');
  await page.locator('#wishlist-entry-save').click(); await save(page);
  await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
  await page.getByRole('button', { name: 'Editar lugar Desejo antigo' }).click();
  await page.locator('#wishlist-coordinates summary').click();
  await page.locator('#wishlist-location-clear').click(); await page.locator('#wishlist-entry-save').click(); await save(page);
  await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(0);
  await expect(row(page)).toContainText('Preservar minha nota');
  await expect(page.locator('#wishlist-map-summary')).toContainText('0 no mapa · 1 sem localização');
  const saved = await page.evaluate(async () => (await import('/src/db.js')).getWishlist());
  expect(saved.items[0]).not.toHaveProperty('location');
  await context.setOffline(false);
});

test('clique no mapa, agrupamento, busca sem rede e rascunhos não aplicados', async ({ page }) => {
  await mockTrips(page); await ready(page); await open(page);
  await page.locator('#wishlist-map').click({ position: { x: 120, y: 130 } });
  await expect(page.locator('#wishlist-location-hint')).toContainText('Localização:');
  await page.locator('#wishlist-save').click(); await expect(page.locator('#wishlist-message')).toContainText('Adicionar à lista');
  await page.locator('#wishlist-name').fill('Lugar no mapa'); await page.locator('#wishlist-entry-save').click(); await save(page);
  await page.locator('#wishlist-close').click();
  await page.evaluate(async () => {
    const db = await import('/src/db.js'), saved = await db.getWishlist();
    await db.saveWishlist({ ...saved, items: [...saved.items, ...['Templo', 'Café'].map(name => ({ id: crypto.randomUUID(), name, country: 'Japão', notes: '', location: { lat: 35.01, lng: 135.76 } }))] }, saved.localVersion);
  });
  await open(page); await expect(page.locator('#wishlist-map .wishlist-cluster')).toHaveCount(1);
  await page.locator('#wishlist-search').fill('Busca indisponível'); await expect(page.locator('#wishlist-search-status')).toContainText('indisponível');
  await page.locator('#wishlist-search').fill('');
  await page.getByRole('button', { name: 'Editar lugar Café', exact: true }).click();
  await page.locator('#wishlist-name').fill('Não guardar'); await page.locator('#wishlist-close').click();
  await open(page); await expect(row(page)).toHaveCount(3); await expect(row(page).filter({ hasText: 'Não guardar' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('conta sincroniza coordenadas e etapas e limpa o mapa ao sair', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page);
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); await open(page);
  await page.locator('#wishlist-name').fill('Kyoto privado'); await page.locator('#wishlist-status').selectOption('planning');
  await page.locator('#wishlist-coordinates summary').click(); await page.locator('#wishlist-lat').fill('35'); await page.locator('#wishlist-lng').fill('135');
  await page.locator('#wishlist-entry-save').click(); await save(page); await expect(page.locator('#wishlist-message')).toHaveText('Wish list salva na sua conta.');
  expect(cloud.wishlists[0].items[0]).toMatchObject({ status: 'planning', location: { lat: 35, lng: 135 } }); expect(cloud.wishlists[0].is_public).toBe(false);
  await page.reload(); await open(page); await expect(row(page)).toContainText('Planejando'); await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#logout-button').click();
  await expect(page.locator('#login-button')).toBeVisible(); await open(page); await expect(row(page)).toHaveCount(0); await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(0);
});
