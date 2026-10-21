import { openMapSettings } from './map-settings-helper.js';
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = { url: '', publishableKey: '' };" }));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.destination-card')).toHaveCount(5);
  await expect(page.locator('#clean-map-button')).toBeEnabled();
});

async function seed(page) {
  await page.evaluate(async () => {
    const { saveDestination } = await import('/src/db.js');
    const defaults = { kind: 'trip', notes: '', rating: 4, tags: ['Viagem'], photoIds: [], coverId: null, example: false, createdAt: '2024-01-01T12:00:00Z' };
    const records = [
      { id: 'paris', name: 'Paris favorita', lat: 48.85, lng: 2.35, favorite: true, visits: [{ arrival: '2024-01-01', departure: '2024-01-04' }] },
      { id: 'lisboa', name: 'Lisboa sem datas', lat: 38.72, lng: -9.14, visits: [{ arrival: '', departure: '', manualDays: 4 }] },
      { id: 'future', name: 'Tóquio futura', lat: 35.68, lng: 139.69, visits: [{ arrival: '2099-01-01', departure: '2099-01-03' }] },
      { id: 'home', name: 'Minha casa', kind: 'home', lat: -23.55, lng: -46.63, visits: [{ arrival: '2024-01-01', departure: '2024-01-03' }] },
      { id: 'ongoing', name: 'Berlim em andamento', lat: 52.52, lng: 13.4, visits: [{ arrival: '2024-01-01', departure: '2099-01-01' }] },
      { id: 'unknown', name: 'Memória <b>antiga</b>', lat: 41.9, lng: 12.5, visits: [] },
    ];
    for (const record of records) await saveDestination({ ...defaults, ...record }, []);
  });
  await page.reload();
  await expect(page.locator('.destination-card')).toHaveCount(11);
  await expect(page.locator('#clean-map-button')).toBeEnabled();
}
async function useFallback(page) {
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable')); });
}
async function expectViewport(page) {
  const box = await page.locator('#map-area').boundingBox(), viewport = page.viewportSize();
  expect(box.x).toBe(0); expect(box.y).toBe(0);
  expect(box.width).toBe(viewport.width); expect(box.height).toBe(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('mapa limpo ocupa a tela sem API nativa e mostra apenas lugares já visitados', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await seed(page); await useFallback(page);
  await openMapSettings(page); await page.locator('#route-toggle').check(); await openMapSettings(page); await page.locator('#heat-mode').selectOption('days');
  await page.locator('#clean-map-button').click();
  await expect(page.locator('#map-area')).toHaveAttribute('aria-modal', 'true');
  await expectViewport(page);
  await expect(page.locator('#clean-map-brand')).toBeVisible();
  await expect(page.locator('#clean-map-brand')).toContainText('Atlas Pessoal');
  await expect(page.locator('#clean-map-brand')).toContainText('Memórias em movimento');
  const brandBox = await page.locator('#clean-map-brand').boundingBox();
  const controlsBox = await page.locator('.clean-map-controls').boundingBox();
  expect(brandBox.x + brandBox.width).toBeLessThan(controlsBox.x);
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(4);
  await expect(page.locator('.atlas-pin,.atlas-cluster,.atlas-heatmap,#map path[stroke-dasharray]')).toHaveCount(0);
  for (const selector of ['.map-title', '.map-toolbar', '.map-status', '.map-legend', '.marker-switch', '.leaflet-control-zoom']) await expect(page.locator(selector)).not.toBeVisible();
  await expect(page.locator('#map path[data-country-id="392"]')).toHaveAttribute('fill', '#202923');
  await expect(page.locator('#map path[data-country-id="076"]')).toHaveAttribute('fill', '#202923');
  await expect(page.locator('#map path[data-country-id="250"]')).toHaveAttribute('fill', '#c09a71');
  await page.locator('.atlas-visited-pin[title="Memória <b>antiga</b>"]').click();
  await expect(page.locator('.leaflet-popup')).toContainText('Memória <b>antiga</b>');
  await expect(page.locator('.leaflet-popup b')).toHaveCount(0);
  await page.locator('#clean-map-fit').click();
  await page.locator('#map').click({ position: { x: 30, y: 30 } });
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.locator('#clean-map-close').click();
  await expect(page.locator('#map-area')).not.toHaveClass(/is-focused/);
  await expect(page.locator('#clean-map-brand')).not.toBeVisible();
  await expect(page.locator('.map-title')).toBeVisible();
  await expect(page.locator('.atlas-heatmap')).toBeVisible();
  await expect(page.locator('#map path[stroke-dasharray]')).not.toHaveCount(0);
  await expect(page.locator('#clean-map-button')).toBeFocused();
  expect(await page.evaluate(() => document.querySelector('.app-header').inert)).toBe(false);
  expect(errors).toEqual([]);
});

test('preferências e enquadramento voltam ao sair com Esc, mesmo com marcadores ocultos', async ({ page }) => {
  await seed(page); await useFallback(page);
  await openMapSettings(page); await page.locator('#map-style').selectOption('light');
  await openMapSettings(page); await page.locator('#show-markers').uncheck(); await openMapSettings(page); await page.locator('#heat-mode').selectOption('visits');
  const before = await page.evaluate(() => ({ prefs: ['atlas-map-style', 'atlas-show-markers', 'atlas-heat-mode'].map((key) => localStorage.getItem(key)), transform: document.querySelector('.leaflet-map-pane').style.transform }));
  await page.locator('#clean-map-button').click();
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(4);
  await page.keyboard.press('Escape');
  await expect(page.locator('#map-area')).not.toHaveClass(/is-focused/);
  await expect(page.locator('#map')).toHaveAttribute('data-style', 'light');
  await expect(page.locator('.atlas-pin,.atlas-cluster,.atlas-visited-pin')).toHaveCount(0);
  await expect(page.locator('#show-markers')).not.toBeChecked();
  await expect(page.locator('#heat-mode')).toHaveValue('visits');
  expect(await page.evaluate(() => ['atlas-map-style', 'atlas-show-markers', 'atlas-heat-mode'].map((key) => localStorage.getItem(key)))).toEqual(before.prefs);
  expect(await page.locator('.leaflet-map-pane').evaluate((element) => element.style.transform)).toBe(before.transform);
  await page.reload(); await expect(page.locator('#show-markers')).not.toBeChecked();
});

test('tela cheia nativa acompanha a saída pelo navegador', async ({ page }) => {
  test.skip(!await page.evaluate(() => document.fullscreenEnabled), 'API de tela cheia não disponível neste navegador');
  await seed(page);
  await page.locator('#clean-map-button').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area');
  await expectViewport(page);
  await expect(page.locator('#clean-map-brand')).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('#map-area')).not.toHaveClass(/is-focused/);
  await expect(page.locator('.map-title')).toBeVisible();
  await expect(page.locator('#clean-map-button')).toBeFocused();
});

test('exemplos não viram viagens pessoais no modo limpo e é possível sair pelo teclado', async ({ page }) => {
  await useFallback(page); await page.locator('#clean-map-button').click();
  await expect(page.locator('#clean-map-empty')).toBeVisible();
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(0);
  await expect(page.locator('#clean-map-close')).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('map-area').contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#clean-map-empty')).not.toBeVisible();
  await expect(page.locator('#clean-map-button')).toBeFocused();
});

test('filtros rápidos combinam com busca sem acentos e limpeza restaura a coleção', async ({ page }) => {
  await seed(page);
  await page.locator('[data-collection-filter="visited"]').click();
  await expect(page.locator('.destination-card')).toHaveCount(4);
  await expect(page.locator('#destination-count')).toHaveText('4 / 11');
  await page.locator('#list-search').fill('memoria');
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.locator('#clear-filters').click();
  await expect(page.locator('.destination-card')).toHaveCount(11);
  await expect(page.locator('#list-search')).toBeFocused();
  await page.locator('[data-collection-filter="favorites"]').click();
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.locator('#list-search').fill('inexistente');
  await expect(page.locator('#destination-list')).toContainText('Nenhuma memória por aqui');
  await expect(page.locator('#clear-filters')).toBeVisible();
  await page.locator('#clear-filters').click();
  await page.locator('#list-search').fill('italia');
  await expect(page.locator('.destination-card')).toHaveCount(6);
});

test('modo limpo retira tiles de ruas temporariamente', async ({ page }) => {
  await seed(page); await useFallback(page);
  await openMapSettings(page); await page.locator('#map-style').selectOption('streets');
  await expect(page.locator('.leaflet-tile')).not.toHaveCount(0);
  await page.locator('#clean-map-button').click();
  await expect(page.locator('.leaflet-tile')).toHaveCount(0);
  await expect(page.locator('#map')).toHaveAttribute('data-style', 'light');
  await page.locator('#clean-map-close').click();
  await expect(page.locator('.leaflet-tile')).not.toHaveCount(0);
  await expect(page.locator('#map-style')).toHaveValue('streets');
  await expect(page.locator('#map')).toHaveAttribute('data-style', 'streets');
});
