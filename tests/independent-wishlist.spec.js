import { test, expect } from '@playwright/test';
import { mockCloud } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
async function login(page) {
  await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com');
  await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function addWish(page) {
  await page.locator('#wishlist-button').click(); await page.locator('#wishlist-name').fill('Kyoto independente');
  await page.locator('#wishlist-entry-save').click(); await page.locator('#wishlist-save').click();
}
test('wish list confirma envio antes de uma leitura de fotos exceder o limite e não repete o timeout', async ({ page }) => {
  const cloud = await mockCloud(page); const post = cloud.addPost('slow-photo-post', 'Viagem preservada'); await login(page);
  await page.evaluate(async () => { const db = await import('/src/db.js'); const destination = (await db.getDestinations())[0]; destination.notes = 'Alteração pendente'; await db.saveDestination(destination, []); });
  await page.clock.install(); let reads = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('https://atlas-tests.supabase.co/rest/v1/photos?**', async route => { reads++; await gate; try { await route.fallback(); } catch {} });
  await addWish(page); await page.clock.runFor(1100); await expect.poll(() => reads).toBe(1);
  await expect(page.locator('#wishlist-message')).toHaveText('Wish list salva na sua conta.');
  expect(cloud.wishlists[0].items[0].name).toBe('Kyoto independente'); expect(cloud.posts[0].data.notes).toBe('');
  await page.clock.runFor(21000);
  await expect(page.locator('#sync-status')).toContainText('Wish list salva na sua conta. Falha ao sincronizar as viagens');
  await expect(page.locator('#sync-status')).toContainText('não respondeu a tempo');
  await page.clock.runFor(3000); expect(reads).toBe(1);
  const local = await page.evaluate(async () => { const db = await import('/src/db.js'); return { wish: await db.getWishlist(), post: (await db.getDestinations())[0] }; });
  expect(local.wish.cloudDirty).toBe(false); expect(local.post.cloudDirty).toBe(true); expect(local.post.notes).toBe('Alteração pendente');
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click(); release();
  await page.locator('#sync-button').click(); await page.clock.runFor(2000); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  expect(cloud.posts.find(p => p.id === post.id).data.notes).toBe('Alteração pendente');
});
test('destino novo não consulta fotos existentes e conflito de criação preserva a nuvem', async ({ page }) => {
  const cloud = await mockCloud(page); await login(page);
  const result = await page.evaluate(async () => {
    const db = await import('/src/db.js'), api = await import('/src/cloud.js');
    const destination = db.sanitizeDestination({ id: 'new-no-photos', name: 'Nova memória', lat: 0, lng: 0, visits: [], tags: [], notes: '', rating: 0 });
    await db.saveDestination(destination, []); return api.saveCloudDestination(destination, []);
  });
  expect(result.revision).toBeTruthy(); expect(cloud.requests.some(r => r.path === '/rest/v1/photos')).toBe(false);
  cloud.posts[0].data.notes = 'Conteúdo preservado na nuvem';
  const error = await page.evaluate(async () => {
    const db = await import('/src/db.js'), api = await import('/src/cloud.js'); const d = (await db.getDestinations())[0];
    try { await api.saveCloudDestination(d, []); } catch (error) { return error.code; }
  });
  expect(error).toBe('conflict'); expect(cloud.posts[0].data.notes).toBe('Conteúdo preservado na nuvem');
});
