import { test, expect } from '@playwright/test';
import { mockTrips } from './trips-fixture.js';
test.use({ serviceWorkers: 'block' });
test('backup sem wish list sincroniza viagens quando a nova migração ainda não foi instalada', async ({ page }) => {
  const cloud = await mockTrips(page);
  await page.route('https://atlas-tests.supabase.co/rest/v1/wishlists?**', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205' }) }));
  await page.route('**/rpc/atlas_save_wishlist', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202' }) }));
  await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup).not.toHaveProperty('wishlist');
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click(); await expect(page.locator('#auth-dialog')).not.toBeVisible(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  await page.locator('#import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect.poll(() => cloud.posts.length).toBe(5); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.wishlists).toHaveLength(0);
  expect(cloud.requests.some(r => r.path.endsWith('/atlas_save_wishlist'))).toBe(false);
});
