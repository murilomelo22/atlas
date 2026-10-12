import { test, expect } from '@playwright/test';
import { mockCloud, ALICE } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page) {
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com');
  await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function expire(page) {
  await page.evaluate(async () => { const s = await import('/src/session.js'); await s.writeSession({ ...await s.readSession(), expires_at: 1 }); });
}
for (const body of [{ code: 400, msg: 'Invalid Refresh Token: Refresh Token Not Found' }, { error_code: 'refresh_token_not_found', message: 'Session is invalid' }]) {
  test(`sessão inválida ${body.code || body.error_code} mantém dados pendentes, reabre e recupera na mesma conta`, async ({ page }) => {
    const cloud = await mockCloud(page); const remote = cloud.addPost('keep-local', 'Viagem pendente'); await ready(page); await login(page);
    await page.evaluate(async () => {
      const db = await import('/src/db.js'); const wish = await db.getWishlist();
      await db.saveWishlist({ items: [{ id: crypto.randomUUID(), name: 'Kyoto pendente', country: '', notes: '' }], is_public: false }, wish.localVersion);
      const post = (await db.getDestinations())[0]; post.notes = 'Notas locais ainda não enviadas'; await db.saveDestination(post, []);
    });
    let refreshes = 0;
    await page.route('**/auth/v1/token?grant_type=refresh_token', route => { refreshes++; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify(body) }); });
    await expire(page); await page.reload(); await expect(page.locator('#sync-status')).toContainText('sessão precisa ser renovada');
    const stored = await page.evaluate(async () => (await import('/src/session.js')).readSession());
    expect(stored.user.id).toBe(ALICE); expect(stored.needsLogin).toBe(true); expect(stored.access_token).toBeUndefined(); expect(stored.refresh_token).toBeUndefined();
    await page.reload(); await expect(page.locator('#sync-status')).toContainText('sessão precisa ser renovada'); expect(refreshes).toBe(1);
    await page.locator('#wishlist-button').click(); await expect(page.locator('#wishlist-items')).toContainText('Kyoto pendente');
    await page.locator('#wishlist-reconnect').click(); await expect(page.locator('#auth-email')).toHaveValue('alice@example.com');
    await page.locator('#auth-password').fill('incorrect'); await page.locator('#auth-submit').click(); await expect(page.locator('#auth-message')).toContainText('incorretos');
    await page.locator('#auth-email').fill('bob@example.com'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
    await expect(page.locator('#auth-message')).toContainText('mesma conta');
    const local = await page.evaluate(async () => { const db = await import('/src/db.js'); return { owner: db.currentAccountId(), wish: await db.getWishlist(), posts: await db.getDestinations() }; });
    expect(local.owner).toBe(ALICE); expect(local.wish.cloudDirty).toBe(true); expect(local.posts[0].notes).toBe('Notas locais ainda não enviadas');
    await page.locator('#auth-email').fill('alice@example.com'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
    await expect(page.locator('#auth-dialog')).not.toBeVisible(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
    expect(cloud.wishlists[0].items[0].name).toBe('Kyoto pendente'); expect(cloud.posts.find(p => p.id === remote.id).data.notes).toBe('Notas locais ainda não enviadas');
    expect((await page.evaluate(async () => (await import('/src/session.js')).readSession())).needsLogin).toBeUndefined();
  });
}
test('duas abas compartilham uma única renovação de token', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); await login(page);
  const second = await page.context().newPage(); await mockCloud(second); await second.goto('/'); await expect(second.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  let refreshes = 0;
  const rotate = async route => {
    refreshes++; await new Promise(resolve => setTimeout(resolve, 150));
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...cloud.session(), refresh_token: 'rotated-token' }) });
  };
  await page.route('**/auth/v1/token?grant_type=refresh_token', rotate); await second.route('**/auth/v1/token?grant_type=refresh_token', rotate);
  await expire(page);
  await Promise.all([page, second].map(tab => tab.evaluate(async () => (await import('/src/cloud.js')).restoreAuth())));
  await Promise.all([page, second].map(tab => tab.evaluate(async () => (await import('/src/cloud.js')).request('/rest/v1/profiles?select=id', { authenticated: true }))));
  expect(refreshes).toBe(1); await second.close();
});
test('falha temporária de renovação conserva credenciais e volta a sincronizar', async ({ page }) => {
  await mockCloud(page); await ready(page); await login(page); await expire(page);
  let failed = true;
  await page.route('**/auth/v1/token?grant_type=refresh_token', route => failed ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.fallback());
  await page.reload(); await expect(page.locator('#sync-status')).toContainText('indisponível');
  const stored = await page.evaluate(async () => (await import('/src/session.js')).readSession());
  expect(stored.needsLogin).toBeUndefined(); expect(stored.refresh_token).toBeTruthy();
  failed = false; await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
});

test('resposta atrasada de renovação não desfaz uma saída explícita', async ({ page }) => {
  const cloud = await mockCloud(page); cloud.addPost('private-post', 'Viagem privada'); await ready(page); await login(page);
  await page.locator('#account-button').click(); await expect(page.locator('#account-dialog')).toBeVisible();
  let release, started = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/auth/v1/token?grant_type=refresh_token', async route => { started = true; await gate; return route.fallback(); });
  await expire(page); await page.evaluate(async () => (await import('/src/cloud.js')).restoreAuth());
  const renewal = page.evaluate(async () => {
    try { await (await import('/src/cloud.js')).request('/rest/v1/profiles?select=id', { authenticated: true }); }
    catch (error) { return error.message; }
  });
  await expect.poll(() => started).toBe(true);
  await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible(); release();
  expect(await renewal).toContain('conta mudou');
  const result = await page.evaluate(async () => ({ user: (await import('/src/cloud.js')).currentUser(), stored: await (await import('/src/session.js')).readSession(), dbs: await indexedDB.databases() }));
  expect(result.user).toBeNull(); expect(result.stored).toBeUndefined(); expect(result.dbs.some(db => db.name === `atlas-pessoal-account-${ALICE}`)).toBe(false);
});
