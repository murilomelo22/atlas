import { openMapSettings } from './map-settings-helper.js';
import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = {url:'', publishableKey:''};" }));
  await page.goto('/'); await expect(page.locator('#country-search-button')).toBeEnabled();
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const defaults = { kind: 'trip', rating: 4, notes: 'Minha memória', tags: [], photoIds: [], coverId: null, visits: [{ arrival: '2024-01-01', departure: '2024-01-03' }], createdAt: '2024-01-01T12:00:00Z' };
    for (const item of [
      { id: 'sp', name: 'São Paulo visitada', lat: -23.55, lng: -46.63 },
      { id: 'rj', name: 'Rio visitado', lat: -22.91, lng: -43.17 },
      { id: 'ny', name: 'Nova York visitada', lat: 40.71, lng: -74 },
      { id: 'future', name: 'Manaus futura', lat: -3.1, lng: -60, visits: [{ arrival: '2099-01-01', departure: '2099-01-03' }] },
      { id: 'home', name: 'Casa em Brasília', lat: -15.78, lng: -47.93, kind: 'home' },
    ]) await db.saveDestination({ ...defaults, ...item }, []);
  });
  await page.reload(); await expect(page.locator('#country-search-button')).toBeEnabled();
});
async function search(page, query, name) {
  await page.locator('#country-search-button').click();
  await page.getByRole('searchbox', { name: 'País', exact: true }).fill(query);
  await page.locator('#country-search-results').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('#country-search-status')).not.toContainText('Carregando');
}

test('pesquisa aproxima o Brasil e pinta somente UFs e lugares realmente visitados', async ({ page }) => {
  await openMapSettings(page); await page.locator('#show-markers').uncheck();
  const before = await page.locator('#map path[data-country-id="076"]').getAttribute('d');
  await search(page, 'brasil', 'Brasil');
  await expect(page.locator('#map')).toHaveAttribute('data-focused-country', '076');
  expect(await page.locator('#map path[data-country-id="076"]').getAttribute('d')).not.toBe(before);
  await expect(page.locator('#country-search-count')).toHaveText('2 lugares visitados');
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(2);
  await expect(page.locator('#map path[data-uf]')).toHaveCount(27);
  await expect(page.locator('#map path[data-uf][data-visited="true"]')).toHaveCount(2);
  await expect(page.locator('#map path[data-uf="SP"]')).toHaveAttribute('fill', '#d4a76f');
  await expect(page.locator('#map path[data-uf="RJ"]')).toHaveAttribute('data-visited', 'true');
  await expect(page.locator('#map path[data-uf="AM"]')).toHaveAttribute('fill', 'none');
  await expect(page.locator('#map path[data-uf="DF"]')).toHaveAttribute('data-visited', 'false');
  await page.locator('.atlas-visited-pin[title="São Paulo visitada"]').click();
  await expect(page.locator('.leaflet-popup')).toContainText('São Paulo visitada');
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await page.locator('#country-search-clear').click();
  await expect(page.locator('#country-search-summary')).not.toBeVisible();
  await expect(page.locator('#show-markers')).not.toBeChecked();
  await expect(page.locator('.atlas-visited-pin,.atlas-pin,.atlas-cluster')).toHaveCount(0);
});

test('busca aceita siglas e acentos e mostra países sem visitas ou sem cobertura', async ({ page }) => {
  await search(page, 'eua', 'Estados Unidos');
  await expect(page.locator('#country-search-count')).toHaveText('1 lugar visitado');
  await expect(page.locator('#map path[data-subdivision-id]')).toHaveCount(51);
  await expect(page.locator('#map path[data-subdivision-id][data-visited="true"]')).toHaveCount(1);
  await search(page, 'japao', 'Japão');
  await expect(page.locator('#country-search-count')).toContainText('ainda não registrou visitas');
  await expect(page.locator('#map path[data-subdivision-id]')).toHaveCount(47);
  await expect(page.locator('#map path[data-subdivision-id][data-visited="true"]')).toHaveCount(0);
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(0);
  await search(page, 'vaticano', 'Cidade do Vaticano');
  await expect(page.locator('#country-search-status')).toContainText('não disponíveis nesta base');
  await expect(page.locator('#map path[data-subdivision-id]')).toHaveCount(0);
  await page.locator('#country-search-button').click();
  await page.locator('#country-search-input').fill('pais inexistente');
  await expect(page.locator('#country-search-feedback')).toContainText('Nenhum país encontrado');
});

test('pesquisar funciona em tela cheia com teclado e mantém o país ao sair', async ({ page }) => {
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Fallback')); });
  await page.locator('#clean-map-button').click();
  await expect(page.locator('#country-search-button')).toBeVisible();
  await page.locator('#country-search-button').click();
  await page.locator('#country-search-input').fill('br');
  await page.keyboard.press('Enter');
  await expect(page.locator('#map')).toHaveAttribute('data-focused-country', '076');
  await expect(page.locator('#map path[data-uf][data-visited="true"]')).toHaveCount(2);
  await page.locator('#country-search-button').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#country-search-panel')).not.toBeVisible();
  await expect(page.locator('#map-area')).toHaveClass(/is-focused/);
  await page.locator('#clean-map-close').click();
  await expect(page.locator('#map')).toHaveAttribute('data-focused-country', '076');
  await expect(page.locator('.atlas-visited-pin')).toHaveCount(2);
});

test('busca e divisões permanecem dentro da tela cheia nativa', async ({ page }) => {
  test.skip(!await page.evaluate(() => document.fullscreenEnabled), 'Native fullscreen unavailable');
  await page.locator('#clean-map-button').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area');
  await search(page, 'brasil', 'Brasil');
  await expect(page.locator('#map path[data-uf][data-visited="true"]')).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area');
  await page.locator('#clean-map-close').click();
  await expect(page.locator('#country-search-summary')).toBeVisible();
});

test('a última pesquisa prevalece se as divisões de outro país chegam atrasadas', async ({ page }) => {
  let release;
  await page.route('**/subdivisions/US.geojson', async route => {
    await new Promise(resolve => { release = resolve; }); await route.continue();
  });
  await page.locator('#country-search-button').click(); await page.locator('#country-search-input').fill('eua');
  await page.locator('#country-search-results').getByRole('button', { name: 'Estados Unidos', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await search(page, 'brasil', 'Brasil');
  release();
  await expect(page.locator('#country-search-name')).toHaveText('Brasil');
  await expect(page.locator('#map path[data-subdivision-id]')).toHaveCount(27);
  await expect(page.locator('#map path[data-uf="SP"]')).toHaveAttribute('data-visited', 'true');
});

test('enquadramento considera o território principal e cruza a linha de data', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { countryFocusBounds } = await import('/src/country-search.js');
    const data = await (await fetch('/vendor/countries.geojson')).json();
    return ['FR', 'FJ'].map(iso => countryFocusBounds(data.features.find(f => f.properties.iso === iso)));
  });
  expect(result[0][1][1] - result[0][0][1]).toBeLessThan(20);
  expect(result[1][1][1] - result[1][0][1]).toBeLessThan(20);
});

test.describe('consulta offline', () => {
  test.use({ serviceWorkers: 'allow' });
  test('países consultados continuam com divisões disponíveis sem internet', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await search(page, 'eua', 'Estados Unidos');
    await search(page, 'brasil', 'Brasil');
    await expect.poll(() => page.evaluate(async () => (await caches.open('atlas-subdivisions-v1')).keys().then(keys => keys.some(key => key.url.endsWith('/US.geojson'))))).toBe(true);
    await context.setOffline(true); await page.reload();
    await expect(page.locator('#country-search-button')).toBeEnabled();
    await search(page, 'eua', 'Estados Unidos');
    await expect(page.locator('#map path[data-subdivision-id]')).toHaveCount(51);
  });
});
