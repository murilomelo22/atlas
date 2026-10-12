import { test, expect } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = {url:'', publishableKey:''};" }));
  await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.evaluate(async () => {
    const db = await import('/src/db.js'), canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 60;
    canvas.getContext('2d').fillRect(0, 0, 80, 60); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    await db.saveDestination({ id: 'review', name: 'Paris avaliada', lat: 48.85, lng: 2.35, kind: 'trip', rating: 5, notes: 'Uma viagem incrível <img src=x onerror=alert(1)>', tags: [], photoIds: ['review-photo'], coverId: 'review-photo', visits: [{ id: 'visit', manualDays: 4, arrival: '', departure: '' }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, [{ id: 'review-photo', destinationId: 'review', blob, thumbnail: blob, caption: 'Memória em Paris' }]);
  });
  await page.reload(); await expect(page.locator('.destination-card')).toHaveCount(6);
});
test('avaliação e fotos abrem no mapa limpo; a galeria mantém tela cheia e teclado', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Use fallback')); });
  await page.locator('#clean-map-button').click(); await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  await expect(page.locator('.clean-place-rating')).toHaveAttribute('aria-label', 'Minha avaliação: 5 de 5');
  await expect(page.locator('.clean-place-notes')).toContainText('<img src=x'); await expect(page.locator('.clean-place-notes img')).toHaveCount(0);
  await expect(page.locator('.clean-place-thumbnail img')).toBeVisible(); await page.getByRole('button', { name: 'Abrir memória 1 de Paris avaliada' }).click();
  await expect(page.locator('#gallery-dialog')).toBeVisible(); await expect(page.locator('#gallery-dialog img')).toBeVisible();
  expect(await page.locator('#gallery-dialog').evaluate(element => element.parentElement.id)).toBe('map-area');
  await page.keyboard.press('Escape'); await expect(page.locator('#gallery-dialog')).not.toBeVisible(); await expect(page.locator('#map-area')).toHaveClass(/is-focused/);
  await page.locator('#clean-map-close').click(); expect(await page.locator('#gallery-dialog').evaluate(element => element.parentElement.tagName)).toBe('BODY');
  expect(errors).toEqual([]);
});
test('galeria de uma memória funciona dentro da tela cheia nativa', async ({ page }) => {
  test.skip(!await page.evaluate(() => document.fullscreenEnabled), 'Native fullscreen unavailable');
  await page.locator('#clean-map-button').click(); await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area');
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click(); await page.getByRole('button', { name: 'Abrir memória 1 de Paris avaliada' }).click();
  await expect(page.locator('#gallery-dialog img')).toBeVisible(); await page.locator('[data-gallery-close]').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area'); await page.locator('#clean-map-close').click();
});
test('grupos de lugares usam um ícone de memórias, com quantidade acessível', async ({ page }) => {
  await expect(page.locator('.atlas-cluster')).toHaveCount(1);
  await expect(page.locator('.cluster-memory svg')).toBeVisible(); await expect(page.locator('.cluster-memory')).toHaveAttribute('aria-label', /lugares próximos/);
  expect((await page.locator('.cluster-memory').textContent()).trim()).toBe('');
});
