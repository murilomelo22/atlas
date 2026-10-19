import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = { url: '', publishableKey: '' };" }));
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.evaluate(async () => {
    const { saveDestination } = await import('/src/db.js');
    const { countryAt } = await import('/src/geography.js');
    await saveDestination({ id: 'sp', name: 'São Paulo visitada', kind: 'trip', lat: -23.55, lng: -46.63,
      ...countryAt(-23.55, -46.63), notes: '', rating: 4, tags: [], photoIds: [], coverId: null,
      visits: [{ arrival: '2024-01-01', departure: '2024-01-03' }], createdAt: '2024-01-01T12:00:00Z' }, []);
  });
  await page.reload();
  await expect(page.locator('.destination-card')).toHaveCount(6);
});

test('UFs aparecem ao aproximar o Brasil, acompanham o tema e somem na visão mundial', async ({ page }) => {
  const states = page.locator('#map path[data-uf]');
  await expect(states).toHaveCount(0);
  await page.locator('.destination-card').filter({ hasText: 'São Paulo visitada' }).click();
  await expect(states).toHaveCount(27);
  await expect(page.locator('#map path[data-uf="DF"]')).toHaveCount(1);
  const brazil = page.locator('#map path[data-country-id="076"]');
  await expect(brazil).toHaveAttribute('fill', '#c09a71');
  for (const [theme, stroke] of [['light', '#566c58'], ['offline', '#566c58'], ['streets', '#566c58'], ['dark', '#a3b29a']]) {
    await page.locator('#map-style').selectOption(theme);
    await expect(states.first()).toHaveAttribute('stroke', stroke);
    await expect(states.first()).toHaveAttribute('fill', 'none');
  }
  expect(await states.first().evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');
  await page.locator('#fit-button').click();
  await expect(states).toHaveCount(0);
  await expect(brazil).toHaveAttribute('fill', '#c09a71');
});

test('divisas permanecem no mapa limpo e permitem abrir as memórias', async ({ page }) => {
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Fallback')); });
  await page.locator('#clean-map-button').click();
  await expect(page.locator('#map path[data-uf]')).toHaveCount(27);
  await expect(page.locator('#clean-map-brand')).toBeVisible();
  await page.locator('.atlas-visited-pin[title="São Paulo visitada"]').click();
  await expect(page.locator('.leaflet-popup')).toContainText('São Paulo visitada');
  await page.locator('#clean-map-close').click();
  await expect(page.locator('#map path[data-uf]')).toHaveCount(0);
});

test.describe('divisas offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('UFs carregam do cache na primeira aproximação sem internet', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await expect(page.locator('#map path[data-uf]')).toHaveCount(0);
    await context.setOffline(true);
    await page.locator('.destination-card').filter({ hasText: 'São Paulo visitada' }).click();
    await expect(page.locator('#map path[data-uf]')).toHaveCount(27);
    expect(await page.locator('#map path[data-uf]').evaluateAll(paths => new Set(paths.map(path => path.dataset.uf)).size)).toBe(27);
  });
});
