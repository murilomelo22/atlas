import { test, expect } from '@playwright/test';
import { openMapSettings } from './map-settings-helper.js';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', route => route.fulfill({
    contentType: 'text/javascript',
    body: "export const supabaseConfig = { url: '', publishableKey: '' };",
  }));
  await page.goto('/');
  await expect(page.locator('#country-search-button')).toBeEnabled();
});

test('mapa móvel tem título e legenda fora do canvas e ajustes recolhidos', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Layout de celular');
  for (const width of [320, 360, 390, 430, 700]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#map-settings')).not.toBeVisible();
    await expect(page.locator('#map-settings-button')).toHaveAttribute('aria-expanded', 'false');
    const layout = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const map = box('#map'), title = box('.map-title'), legend = box('.map-legend');
      const search = box('#country-search-button'), fullscreen = box('#clean-map-button');
      const brand = box('.brand'), actions = box('.header-actions');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        titleAbove: title.bottom <= map.top,
        legendBelow: legend.top >= map.bottom,
        actionsAbove: Math.max(search.bottom, fullscreen.bottom) <= map.top,
        separateActions: search.right <= fullscreen.left,
        separateHeader: brand.right <= actions.left,
        canvasHeight: map.height,
      };
    });
    expect(layout, `largura ${width}`).toMatchObject({
      overflow: false, titleAbove: true, legendBelow: true,
      actionsAbove: true, separateActions: true, separateHeader: true,
    });
    expect(layout.canvasHeight).toBeGreaterThanOrEqual(300);
  }
});

test('ajustes móveis preservam preferências e fecham com Escape e pesquisa', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Painel recolhível de celular');
  await openMapSettings(page);
  await expect(page.locator('#map-settings-button')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#map-style').selectOption('light');
  await page.locator('#heat-mode').selectOption('days');
  await page.locator('#show-markers').uncheck();
  await expect(page.locator('#route-toggle')).toBeDisabled();
  await page.locator('#show-markers').press('Escape');
  await expect(page.locator('#map-settings')).not.toBeVisible();
  await expect(page.locator('#map-settings-button')).toBeFocused();
  await page.reload();
  await expect(page.locator('#country-search-button')).toBeEnabled();
  await expect(page.locator('#map')).toHaveAttribute('data-style', 'light');
  await openMapSettings(page);
  await expect(page.locator('#heat-mode')).toHaveValue('days');
  await expect(page.locator('#show-markers')).not.toBeChecked();
  await page.locator('#country-search-button').click();
  await expect(page.locator('#map-settings')).not.toBeVisible();
  await expect(page.locator('#country-search-input')).toBeFocused();
  await page.locator('#country-search-input').fill('Brasil');
  await page.locator('#country-search-results').getByRole('button', { name: 'Brasil', exact: true }).click();
  await expect(page.locator('#country-search-summary')).toBeVisible();
  const boxes = await page.evaluate(() => {
    const map = document.querySelector('#map').getBoundingClientRect();
    const summary = document.querySelector('#country-search-summary').getBoundingClientRect();
    return { contained: summary.top >= map.top && summary.bottom <= map.bottom };
  });
  expect(boxes.contained).toBe(true);
});

test('controles permanecem disponíveis ao alternar entre desktop e celular', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(page.locator('#map-style')).toBeVisible();
  await expect(page.locator('#show-markers')).toBeVisible();
  await expect(page.locator('#map-settings-button')).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#map-style')).not.toBeVisible();
  await openMapSettings(page);
  await expect(page.locator('#map-style')).toBeVisible();
  await page.locator('#clean-map-button').click();
  await expect(page.locator('#map-area')).toHaveClass(/is-focused/);
  await expect(page.locator('#map-settings')).not.toBeVisible();
  await expect(page.locator('#country-search-button')).toBeVisible();
  await page.locator('#clean-map-close').click();
  await expect(page.locator('#map-settings')).not.toBeVisible();
  await expect(page.locator('#map-settings-button')).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 1440, height: 980 });
  await expect(page.locator('#map-style')).toBeVisible();
});
