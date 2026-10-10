import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockTrips } from './trips-fixture.js';
import { ALICE, BOB } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page, email = 'alice@example.com') {
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill(email); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function logout(page) {
  if (await page.locator('#wishlist-dialog').isVisible()) await page.locator('#wishlist-close').click();
  await page.locator('#account-button').click(); await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
}
async function open(page) { await page.locator('#wishlist-button').click(); await expect(page.locator('#wishlist-dialog')).toBeVisible(); }
async function add(page, name = 'Kyoto', country = 'Japão', notes = 'Conhecer os templos') {
  await page.locator('#wishlist-name').fill(name); await page.locator('#wishlist-country').fill(country); await page.locator('#wishlist-notes').fill(notes); await page.locator('#wishlist-entry-save').click();
  await expect(page.locator('#wishlist-items')).toContainText(name);
}
async function save(page, cloud = false) {
  await page.locator('#wishlist-save').click(); await expect(page.locator('#wishlist-draft-state')).not.toContainText('Alterações no formulário');
  if (cloud) { await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); await expect(page.locator('#wishlist-message')).toHaveText('Wish list salva na sua conta.'); }
}
const item = (name = 'Kyoto') => ({ id: randomUUID(), name, country: 'Japão', notes: 'Templos' });

test('wish list local privada, edição e remoção persistem sem alterar viagens ou estatísticas', async ({ page }) => {
  await mockTrips(page); await ready(page); await open(page); await expect(page.locator('#wishlist-visibility')).toHaveValue('private'); await expect(page.locator('#wishlist-visibility')).toBeDisabled();
  await add(page); await save(page); await page.locator('#wishlist-close').click(); await expect(page.locator('.destination-card')).toHaveCount(5); await expect(page.locator('#stat-days')).toHaveText('15'); await expect(page.locator('#stat-countries')).toHaveText('1');
  await page.reload(); await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(1); await page.getByRole('button', { name: 'Editar lugar Kyoto' }).click(); await page.locator('#wishlist-name').fill('Kyoto e Osaka'); await page.locator('#wishlist-entry-save').click(); await save(page);
  await page.getByRole('button', { name: 'Remover lugar Kyoto e Osaka' }).click(); await save(page); await page.locator('#wishlist-close').click(); await page.reload(); await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(0);
});

test('privada por padrão, publica no perfil e desaparece ao voltar a privada', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await page.locator('#account-button').click(); await page.locator('#profile-wishlist').click(); await add(page); await save(page, true); expect(cloud.wishlists[0].is_public).toBe(false);
  await page.locator('#wishlist-close').click(); await page.goto('/#/perfil/alice'); await expect(page.locator('#public-profile-header')).toBeVisible(); await expect(page.locator('.profile-wishlist')).toHaveCount(0);
  await page.locator('#home-atlas').click(); await open(page); await page.locator('#wishlist-visibility').selectOption('public'); await save(page, true); await page.locator('#wishlist-close').click();
  await page.goto('/#/perfil/alice'); await expect(page.getByRole('region', { name: 'Wish list pública' })).toContainText('Kyoto'); await expect(page.locator('.destination-card')).toHaveCount(0); await expect(page.locator('#stat-countries')).toHaveText('0');
  await page.locator('#home-atlas').click(); await open(page); await page.locator('#wishlist-visibility').selectOption('private'); await save(page, true); await page.locator('#wishlist-close').click(); await logout(page);
  await page.goto('/#/perfil/alice'); await expect(page.locator('#public-profile-header')).toBeVisible(); await expect(page.locator('.profile-wishlist')).toHaveCount(0); expect(cloud.wishlists[0].items[0].name).toBe('Kyoto');
});

test('visitante vê wish list pública sem edição; notas escapadas e perfil privado oculta tudo', async ({ page }) => {
  const cloud = await mockTrips(page); cloud.wishlists.push({ owner_id: ALICE, items: [item('Kyoto <img src=x onerror="alert(1)">')], is_public: true, revision: randomUUID() });
  await page.goto('/#/perfil/alice'); await expect(page.locator('.profile-wishlist')).toContainText('<img src=x onerror="alert(1)">'); await expect(page.locator('.profile-wishlist img')).toHaveCount(0); await expect(page.locator('.profile-wishlist button')).toHaveCount(0); await expect(page.locator('#wishlist-button')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  cloud.profiles[0].is_public = false; await page.reload(); await expect(page.locator('#public-profile-header')).not.toBeVisible(); await expect(page.locator('.profile-wishlist')).toHaveCount(0);
});

test('wish lists e formulários ficam isolados entre contas e são limpos ao sair', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await open(page); await add(page, 'Lugar privado de Alice'); await save(page, true); await logout(page);
  await expect(page.locator('#wishlist-items')).toBeEmpty(); await expect(page.locator('#wishlist-name')).toHaveValue(''); expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === `atlas-pessoal-account-${ALICE}`)).toBe(false);
  await login(page, 'bob@example.com'); await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(0); await add(page, 'Desejo de Bruno'); await save(page, true); expect(cloud.wishlists).toHaveLength(2); expect(cloud.wishlists.find(w => w.owner_id === BOB).items[0].name).toBe('Desejo de Bruno');
  await logout(page); await login(page); await open(page); await expect(page.locator('#wishlist-items')).toContainText('Lugar privado de Alice'); await expect(page.locator('#wishlist-items')).not.toContainText('Desejo de Bruno');
});

test('migração ausente preserva wish list, e sincroniza após instalar SQL', async ({ page }) => {
  const cloud = await mockTrips(page); let missing = true;
  await page.route('https://atlas-tests.supabase.co/rest/v1/wishlists?**', r => missing ? r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205' }) }) : r.fallback());
  await page.route('**/rpc/atlas_save_wishlist', r => missing ? r.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) }) : r.fallback());
  await ready(page); await login(page); await open(page); await add(page); await save(page); await expect(page.locator('#sync-status')).toContainText('wishlist.sql'); expect(cloud.wishlists).toHaveLength(0);
  await page.reload(); await open(page); await expect(page.locator('#wishlist-items')).toContainText('Kyoto'); missing = false; await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists[0].items).toHaveLength(1);
});

test('backup e migração local preservam a lista sem duplicar e sem publicar', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await open(page); await add(page); await save(page); await page.locator('#wishlist-close').click();
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup.wishlist.items).toHaveLength(1); backup.wishlist.is_public = true;
  for (let i = 0; i < 2; i++) { await page.locator('#import-input').setInputFiles({ name: 'wishlist.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await expect(page.locator('#toast')).toContainText('sem duplicação'); }
  await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(1); await expect(page.locator('#wishlist-visibility')).toHaveValue('private'); await page.locator('#wishlist-close').click(); await login(page); await page.locator('#account-button').click();
  await page.locator('#migrate-button').click(); await page.locator('#confirm-ok').click(); await expect.poll(() => cloud.wishlists.length).toBe(1); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists[0].is_public).toBe(false); expect(cloud.wishlists[0].items).toHaveLength(1);
});

test('conflito entre dispositivos mantém alterações locais e exige escolha explícita', async ({ page }) => {
  const cloud = await mockTrips(page); cloud.wishlists.push({ owner_id: ALICE, items: [item()], is_public: false, revision: randomUUID() }); await ready(page); await login(page); await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(1);
  cloud.wishlists[0].items.push(item('Osaka remota')); cloud.wishlists[0].revision = randomUUID(); await add(page, 'Sapporo local'); await save(page); await expect(page.locator('#sync-status')).toContainText('outro dispositivo');
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup.wishlist.items.map(i => i.name)).toContain('Sapporo local'); expect(cloud.wishlists[0].items.map(i => i.name)).not.toContain('Sapporo local');
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#cloud-reload-button').click(); await page.locator('#confirm-ok').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); await page.getByRole('button', { name: 'Fechar perfil' }).click(); await open(page); await expect(page.locator('#wishlist-items')).toContainText('Osaka remota'); await expect(page.locator('#wishlist-items')).not.toContainText('Sapporo local');
});

test('envio com resposta perdida pode ser repetido sem duplicar a lista', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); let lost = true;
  await page.route('**/rpc/atlas_save_wishlist', async route => {
    if (!lost) return route.fallback(); lost = false;
    const body = route.request().postDataJSON(); cloud.wishlists.push({ owner_id: ALICE, items: body.p_items, is_public: body.p_public, revision: randomUUID() }); await route.abort();
  });
  await open(page); await add(page); await save(page); await expect(page.locator('#sync-status')).toContainText('Sem conexão'); await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists).toHaveLength(1); expect(cloud.wishlists[0].items).toHaveLength(1);
});

test('edições offline permanecem na conta e enviam ao recuperar a conexão', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); cloud.failed = true;
  await open(page); await add(page, 'Desejo offline'); await save(page); await expect(page.locator('#sync-status')).toContainText('Sem conexão'); expect(cloud.wishlists).toHaveLength(0);
  await page.reload(); await open(page); await expect(page.locator('#wishlist-items')).toContainText('Desejo offline'); cloud.failed = false;
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists[0].items[0].name).toBe('Desejo offline');
});

test('limite, rascunho não aplicado e backup inválido não perdem a lista existente', async ({ page }) => {
  await mockTrips(page); await ready(page); await open(page); await page.locator('#wishlist-name').fill('   '); await page.locator('#wishlist-entry-save').click(); await expect(page.locator('#wishlist-message')).toContainText('Informe um lugar');
  await page.locator('#wishlist-name').fill('Kyoto'); await page.locator('#wishlist-save').click(); await expect(page.locator('#wishlist-message')).toContainText('Adicionar à lista'); await expect(page.locator('[data-wish-id]')).toHaveCount(0);
  await page.locator('#wishlist-entry-save').click(); await save(page); await page.locator('#wishlist-close').click();
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); backup.destinations[0].name = 'Não deve importar'; backup.wishlist.items[0].id = 'bad-id';
  await page.locator('#import-input').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await expect(page.locator('#toast')).toContainText('identificadores inválidos'); await expect(page.getByRole('button', { name: 'Abrir destino Não deve importar' })).toHaveCount(0);
  await page.evaluate(async () => { const db = await import('/src/db.js'); const w = await db.getWishlist(); await db.saveWishlist({ is_public: false, items: Array.from({ length: 200 }, (_, i) => ({ id: crypto.randomUUID(), name: `Lugar ${i}`, country: '', notes: '' })) }, w.localVersion); });
  await open(page); await expect(page.locator('[data-wish-id]')).toHaveCount(200); await page.locator('#wishlist-name').fill('Acima do limite'); await page.locator('#wishlist-entry-save').click(); await expect(page.locator('#wishlist-message')).toContainText('200 lugares'); await expect(page.locator('[data-wish-id]')).toHaveCount(200);
});

test('edição durante envio conserva mudanças locais e usa a revisão confirmada no próximo envio', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page);
  let release; const gate = new Promise(resolve => { release = resolve; }); let pending = false;
  await page.route('**/rpc/atlas_save_wishlist', async route => { if (pending) return route.fallback(); pending = true; await gate; return route.fallback(); });
  await open(page); await add(page, 'Primeiro desejo'); await save(page); await expect.poll(() => pending).toBe(true);
  await add(page, 'Segundo desejo'); await save(page); release(); await expect.poll(() => cloud.wishlists.length).toBe(1); await expect(page.locator('#sync-status')).toHaveText('Há alterações locais aguardando sincronização.');
  expect(cloud.wishlists[0].items).toHaveLength(1); const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup.wishlist.items).toHaveLength(2);
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists[0].items).toHaveLength(2);
});
