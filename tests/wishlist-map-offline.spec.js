import { test, expect } from '@playwright/test';

test('wish list e cartografia reabrem offline com o novo módulo no cache', async ({ page, context }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = { url: '', publishableKey: '' };" }));
  await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('#wishlist-button').click(); await page.locator('#wishlist-name').fill('Kyoto offline');
  await page.locator('#wishlist-status').selectOption('planning'); await page.locator('#wishlist-notes').fill('Minha vontade continua aqui sem internet.');
  await page.locator('#wishlist-coordinates summary').click(); await page.locator('#wishlist-lat').fill('35'); await page.locator('#wishlist-lng').fill('135');
  await page.locator('#wishlist-entry-save').click(); await page.locator('#wishlist-save').click();
  await expect(page.locator('#wishlist-message')).toContainText('salva neste navegador'); await page.locator('#wishlist-close').click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  expect(await page.evaluate(async () => Boolean(await caches.match(new URL('./src/wishlist-map.js', location.href))))).toBe(true);
  await context.setOffline(true); await page.reload();
  await expect(page.locator('#wishlist-button')).toBeEnabled(); await page.locator('#wishlist-button').click();
  await expect(page.locator('#wishlist-map .wishlist-marker')).toHaveCount(1);
  await expect(page.locator('#wishlist-items')).toContainText('Planejando');
  await expect(page.locator('#wishlist-items')).toContainText('Minha vontade continua aqui sem internet.');
  expect(errors).toEqual([]);
});
