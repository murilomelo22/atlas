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
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  await chooseContent(page, 'scorePhotos');
  await expect(page.locator('.clean-place-rating')).toBeVisible();
  await expect(page.locator('.clean-place-rating .clean-rating-star.is-filled')).toHaveCount(5);
  await expect(page.locator('.clean-place-notes')).not.toBeVisible();
  await page.getByRole('button', { name: 'Abrir memória 1 de Paris avaliada' }).click();
  await expect(page.locator('#gallery-dialog img')).toBeVisible(); await page.locator('[data-gallery-close]').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('map-area'); await page.locator('#clean-map-close').click();
});
test('conteúdo do cartão alterna sem fechar a viagem e lembra a escolha após recarregar', async ({ page }) => {
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Fallback')); });
  await page.locator('#clean-map-button').click();
  const pin = page.locator('.atlas-visited-pin[title="Paris avaliada"]');
  await pin.click();
  const select = page.getByRole('combobox', { name: 'Conteúdo da viagem no mapa', includeHidden: true });
  const rating = page.locator('.clean-place-rating'), notes = page.locator('.clean-place-notes'), photos = page.locator('.clean-place-gallery');
  await expect(select).toHaveValue('all');
  await chooseContent(page, 'memories');
  await expect(rating).not.toBeVisible(); await expect(notes).toBeVisible(); await expect(photos).toBeVisible();
  await chooseContent(page, 'score');
  await expect(rating).toBeVisible(); await expect(rating.locator('.clean-rating-star.is-filled')).toHaveCount(5); await expect(rating).not.toContainText('5/5');
  await expect(notes).not.toBeVisible(); await expect(photos).not.toBeVisible();
  await chooseContent(page, 'notes');
  await expect(rating).not.toBeVisible(); await expect(notes).toBeVisible(); await expect(photos).not.toBeVisible();
  await chooseContent(page, 'photos');
  await expect(rating).not.toBeVisible(); await expect(notes).not.toBeVisible(); await expect(photos).toBeVisible();
  await chooseContent(page, 'scorePhotos');
  await expect(rating).toBeVisible(); await expect(rating.locator('.clean-rating-star.is-filled')).toHaveCount(5); await expect(rating).not.toContainText('5/5');
  await expect(notes).not.toBeVisible(); await expect(photos).toBeVisible();
  await page.getByRole('button', { name: 'Abrir memória 1 de Paris avaliada' }).click();
  await expect(page.locator('#gallery-dialog img')).toBeVisible();
  await page.locator('[data-gallery-close]').click();
  await page.locator('.leaflet-popup-close-button').click(); await pin.click();
  await expect(select).toHaveValue('scorePhotos');
  await page.locator('#clean-map-close').click();
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click(); await pin.click();
  await expect(select).toHaveValue('scorePhotos');
  await expect(rating).toBeVisible(); await expect(rating.locator('.clean-rating-star.is-filled')).toHaveCount(5); await expect(rating).not.toContainText('5/5');
  await expect(notes).not.toBeVisible(); await expect(photos).toBeVisible();
  await chooseContent(page, 'all');
  await expect(rating.locator('.clean-rating-star.is-filled')).toHaveCount(5); await expect(notes).toContainText('Uma viagem incrível');
  const saved = await page.evaluate(async () => { const db = await import('/src/db.js'); const d = (await db.getDestinations()).find(d => d.id === 'review'); return { rating: d.rating, notes: d.notes, photoIds: d.photoIds }; });
  expect(saved).toEqual({ rating: 5, notes: 'Uma viagem incrível <img src=x onerror=alert(1)>', photoIds: ['review-photo'] });
});
test('avaliação usa estrelas preenchidas e contornadas com nota acessível', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const destination = (await db.getDestinations()).find(d => d.id === 'review');
    await db.saveDestination({ ...destination, rating: 3 }, await db.getPhotos('review'));
  });
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click();
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  await chooseContent(page, 'scorePhotos');
  const rating = page.getByRole('img', { name: 'Minha avaliação: 3 de 5' });
  await expect(rating).toBeVisible();
  await expect(rating.locator('.clean-rating-star.is-filled')).toHaveCount(3);
  await expect(rating.locator('.clean-rating-star:not(.is-filled)')).toHaveCount(2);
  await expect(rating).toHaveText('');
  await expect(page.locator('.clean-place-gallery')).toBeVisible();
  await expect(page.locator('.clean-place-notes')).not.toBeVisible();
});
test('escolha vale para outras viagens e trata conteúdo ausente', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    await db.saveDestination({ id: 'empty', name: 'Viagem sem detalhes', lat: 43, lng: 5, kind: 'trip', rating: 0, notes: '', tags: [], photoIds: [], coverId: null, visits: [{ manualDays: 2, arrival: '', departure: '' }], createdAt: new Date().toISOString() }, []);
  });
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click();
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  const select = page.getByRole('combobox', { name: 'Conteúdo da viagem no mapa', includeHidden: true });
  await chooseContent(page, 'photos');
  await page.locator('.leaflet-popup-close-button').click();
  await expect(select).toHaveCount(0);
  await page.locator('.atlas-visited-pin[title="Viagem sem detalhes"]').click();
  await expect(select).toHaveValue('photos');
  await expect(page.locator('.clean-place-no-photos')).toBeVisible();
  await expect(page.locator('.clean-place-rating')).not.toBeVisible();
  await chooseContent(page, 'notes');
  await expect(page.locator('.clean-place-notes')).toHaveText('Ainda sem anotações nesta memória.');
  await expect(page.locator('.clean-place-notes')).toBeVisible();
  await expect(page.locator('.clean-place-no-photos')).not.toBeVisible();
  await chooseContent(page, 'score');
  await expect(page.locator('.clean-place-rating')).toHaveText('Ainda sem avaliação');
  await expect(page.locator('.clean-place-rating')).toBeVisible();
  await page.getByRole('button', { name: 'Opções do cartão' }).focus(); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.getElementById('map-area').contains(document.activeElement))).toBe(true);
});
test('grupos de lugares usam o check do mapa limpo, com quantidade acessível', async ({ page }) => {
  await expect(page.locator('.atlas-cluster')).toHaveCount(1);
  await expect(page.locator('.cluster-check svg')).toBeVisible(); await expect(page.locator('.cluster-check')).toHaveAttribute('aria-label', /lugares próximos/);
  expect((await page.locator('.cluster-check').textContent()).trim()).toBe('');
});

test('cartão abre compacto e permite mudar tamanho sem alterar a avaliação', async ({ page }) => {
  await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const destination = (await db.getDestinations()).find(d => d.id === 'review');
    await db.saveDestination({ ...destination, notes: 'Uma memória longa para ler com calma.\n'.repeat(100) }, await db.getPhotos('review'));
  });
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click();
  const pin = page.locator('.atlas-visited-pin[title="Paris avaliada"]');
  await pin.click();
  const size = page.getByRole('combobox', { name: 'Tamanho do cartão da viagem' });
  const card = page.locator('.clean-place-popup');
  await expect(size).toHaveValue('compact');
  const compact = await card.boundingBox();
  expect(compact.height).toBeLessThanOrEqual(261);
  expect(await page.locator('.clean-place-body').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await size.selectOption('large');
  const large = await card.boundingBox();
  expect(large.height).toBeGreaterThan(compact.height);
  expect(large.width).toBeGreaterThanOrEqual(compact.width);
  await expect(page.locator('.clean-place-rating')).toHaveAttribute('aria-label', 'Minha avaliação: 5 de 5');
  await size.selectOption('medium');
  const medium = await card.boundingBox();
  expect(medium.height).toBeGreaterThan(compact.height);
  expect(medium.height).toBeLessThan(large.height);
  await page.locator('.leaflet-popup-close-button').click(); await pin.click();
  await expect(size).toHaveValue('medium');
  await page.locator('#clean-map-close').click();
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click(); await pin.click();
  await expect(size).toHaveValue('medium');
  const saved = await page.evaluate(async () => {
    const db = await import('/src/db.js');
    const destination = (await db.getDestinations()).find(d => d.id === 'review');
    return { rating: destination.rating, notes: destination.notes, photoIds: destination.photoIds };
  });
  expect(saved).toEqual({ rating: 5, notes: 'Uma memória longa para ler com calma.\n'.repeat(100), photoIds: ['review-photo'] });
});

test('cartão grande se adapta a uma janela menor e mantém controles e galeria acessíveis', async ({ page }) => {
  await page.locator('#clean-map-button').click();
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  const size = page.getByRole('combobox', { name: 'Tamanho do cartão da viagem' });
  await size.selectOption('large');
  await page.setViewportSize({ width: 320, height: 480 });
  await expect(async () => {
    const card = await page.locator('.leaflet-popup').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(0);
    expect(card.x + card.width).toBeLessThanOrEqual(320);
    expect(card.y).toBeGreaterThanOrEqual(0);
    expect(card.y + card.height).toBeLessThanOrEqual(480);
  }).toPass();
  await expect(size).toBeVisible();
  await page.getByRole('button', { name: 'Abrir memória 1 de Paris avaliada' }).click();
  await expect(page.locator('#gallery-dialog img')).toBeVisible();
  await page.locator('[data-gallery-close]').click();
  await expect(page.locator('#map-area')).toHaveClass(/is-focused/);
});

async function chooseContent(page, value) {
  const tools = page.getByRole('button', { name: 'Opções do cartão' });
  if (await tools.isVisible() && await tools.getAttribute('aria-expanded') === 'false') await tools.click();
  await page.locator('.clean-place-display select').selectOption(value);
}

async function openScoreCard(page) {
  await page.evaluate(() => { document.getElementById('map-area').requestFullscreen = () => Promise.reject(new Error('Fallback')); });
  await page.locator('#clean-map-button').click();
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  await chooseContent(page, 'score');
  const handle = page.getByRole('button', { name: 'Redimensionar cartão da viagem' });
  await handle.hover();
  const box = await page.locator('.leaflet-popup').boundingBox();
  expect(box.width).toBeLessThan(180); expect(box.height).toBeLessThan(110);
  return handle;
}

test('arrastar o canto reduz a caixa abaixo de Compacto e salva as dimensões livres', async ({ page }) => {
  const handle = await openScoreCard(page);
  const card = page.locator('.clean-place-popup'), compact = await card.boundingBox();
  const beforeMap = await page.locator('.leaflet-map-pane').getAttribute('style');
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 40, grip.y + grip.height / 2 + 100, { steps: 8 });
  await page.mouse.up();
  const small = await card.boundingBox();
  expect(small.width).toBeLessThan(compact.width - 20);
  expect(small.height).toBeLessThan(compact.height - 8);
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(beforeMap);
  await expect(page.getByRole('img', { name: 'Minha avaliação: 5 de 5' })).toBeVisible();
  await expect(page.locator('.clean-place-rating .clean-rating-star')).toHaveCount(5);
  await page.locator('.leaflet-popup-close-button').click();
  await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  const reopened = await card.boundingBox();
  expect(reopened.width).toBeCloseTo(small.width, 0); expect(reopened.height).toBeCloseTo(small.height, 0);
  await page.locator('#clean-map-close').click();
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click(); await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  const restored = await card.boundingBox();
  expect(restored.width).toBeCloseTo(small.width, 0); expect(restored.height).toBeCloseTo(small.height, 0);
  await page.getByRole('button', { name: 'Opções do cartão' }).click();
  const size = page.getByRole('combobox', { name: 'Tamanho do cartão da viagem' });
  await expect(size).toHaveValue('custom');
  await size.selectOption('compact');
  await expect(page.getByRole('button', { name: 'Opções do cartão' })).toBeVisible();
  expect((await card.boundingBox()).width).toBeGreaterThan(small.width);
});

test('setas ajustam largura e altura e a caixa respeita os limites da tela', async ({ page }) => {
  const handle = await openScoreCard(page);
  const card = page.locator('.clean-place-popup'), initial = await card.boundingBox();
  await handle.focus(); await handle.press('ArrowRight'); await handle.press('ArrowDown');
  const larger = await card.boundingBox();
  expect(larger.width).toBeCloseTo(initial.width + 8, 0);
  expect(larger.height).toBeCloseTo(initial.height + 8, 0);
  await handle.press('ArrowLeft'); await handle.press('ArrowUp');
  const smaller = await card.boundingBox();
  expect(smaller.width).toBeCloseTo(initial.width, 0); expect(smaller.height).toBeCloseTo(initial.height, 0);
  await page.setViewportSize({ width: 320, height: 480 });
  await handle.press('Shift+ArrowRight'); await handle.press('Shift+ArrowDown');
  await expect(async () => {
    const bounds = await page.locator('.leaflet-popup').boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(480);
  }).toPass();
  await expect(page.locator('#map-area')).toHaveClass(/is-focused/);
});

test('arrastar com o dedo redimensiona sem arrastar o mapa ou abrir o editor', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Gesto em tela de toque');
  const handle = await openScoreCard(page);
  const initial = await page.locator('.clean-place-popup').boundingBox();
  const grip = await handle.boundingBox(), session = await context.newCDPSession(page);
  const beforeMap = await page.locator('.leaflet-map-pane').getAttribute('style');
  const x = grip.x + grip.width / 2, y = grip.y + grip.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 6; step++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 6, y: y + step * 15, id: 1 }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  const resized = await page.locator('.clean-place-popup').boundingBox();
  expect(resized.width).toBeLessThan(initial.width - 20); expect(resized.height).toBeLessThan(initial.height - 8);
  expect(await page.locator('.leaflet-map-pane').getAttribute('style')).toBe(beforeMap);
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await expect(page.getByRole('img', { name: 'Minha avaliação: 5 de 5' })).toBeVisible();
});

test('o mínimo antigo fica menor e as cinco estrelas cabem sem rolagem', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('atlas-clean-popup-content', 'score');
    localStorage.setItem('atlas-clean-popup-size', 'custom');
    localStorage.setItem('atlas-clean-popup-custom-size', JSON.stringify({ width: 160, height: 112 }));
  });
  await page.reload(); await expect(page.locator('#clean-map-button')).toBeEnabled();
  await page.locator('#clean-map-button').click(); await page.locator('.atlas-visited-pin[title="Paris avaliada"]').click();
  const box = await page.locator('.leaflet-popup').boundingBox();
  expect(box.width).toBeLessThan(150); expect(box.height).toBeLessThan(90);
  const fits = await page.locator('.clean-place-body').evaluate(body => {
    const bounds = body.getBoundingClientRect();
    return [...body.querySelectorAll('.clean-rating-star')].every(star => {
      const rect = star.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right && rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    });
  });
  expect(fits).toBe(true);
});
