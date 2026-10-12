import { test, expect } from '@playwright/test';
import { mockTrips } from './trips-fixture.js';
test.use({ serviceWorkers: 'block' });
async function login(page) {
  await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com');
  await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function saveWish(page) {
  await page.locator('#wishlist-button').click(); await page.locator('#wishlist-name').fill('Kyoto');
  await page.locator('#wishlist-entry-save').click(); await page.locator('#wishlist-save').click();
}
test('HTTP 400/400 revela a mensagem sem enviar novamente e preserva a lista pendente', async ({ page }) => {
  const cloud = await mockTrips(page); await login(page);
  let failed = true, writes = 0;
  await page.route('**/rpc/atlas_save_wishlist', route => {
    if (!failed) return route.fallback();
    writes++; return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, message: 'connection acquisition timeout' }) });
  });
  await saveWish(page); await expect(page.locator('#sync-status')).toContainText('não concluiu a operação a tempo');
  await expect(page.locator('#wishlist-diagnostic')).toBeVisible(); await page.locator('#wishlist-diagnostic summary').click();
  await expect(page.locator('#wishlist-diagnostic pre')).toContainText('connection acquisition timeout');
  await expect(page.locator('#wishlist-diagnostic pre')).toContainText('POST /rest/v1/rpc/atlas_save_wishlist');
  await expect(page.locator('#wishlist-diagnostic pre')).toContainText('HTTP 400 · 400');
  const local = await page.evaluate(async () => (await import('/src/db.js')).getWishlist());
  expect(local.cloudDirty).toBe(true); expect(local.items[0].name).toBe('Kyoto'); expect(cloud.wishlists).toHaveLength(0);
  await page.waitForTimeout(1500); expect(writes).toBe(1);
  await page.locator('#wishlist-close').click(); await page.locator('#account-button').click();
  await page.locator('#account-sync-diagnostic summary').click(); await expect(page.locator('#account-sync-diagnostic pre')).toContainText('connection acquisition timeout');
  failed = false; await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  await expect(page.locator('#account-sync-diagnostic')).not.toBeVisible(); expect(cloud.wishlists[0].items[0].name).toBe('Kyoto');
});
test('diagnóstico aceita texto de gateway e mantém HTML e credenciais fora da apresentação', async ({ page }) => {
  await mockTrips(page); await login(page);
  await page.route('**/rpc/atlas_save_wishlist', route => route.fulfill({ status: 400, contentType: 'text/plain', body: '<img src=x onerror=alert(1)> gateway error Bearer private-token sb_secret_hidden alice@example.com https://example.com/?token=hidden eyJabc.abcdef.signature' }));
  await saveWish(page); await expect(page.locator('#wishlist-diagnostic')).toBeVisible(); await page.locator('#wishlist-diagnostic summary').click();
  const pre = page.locator('#wishlist-diagnostic pre'); await expect(pre).toContainText('gateway error');
  await expect(pre).not.toContainText('private-token'); await expect(pre).not.toContainText('sb_secret_hidden');
  await expect(pre).not.toContainText('alice@example.com'); await expect(pre).not.toContainText('token=hidden'); await expect(pre).not.toContainText('eyJabc');
  await expect(pre.locator('img')).toHaveCount(0);
});
