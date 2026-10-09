import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
test.beforeEach(async ({ page }) => {
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = { url: '', publishableKey: '' };" }));
  await page.route('https://*.basemaps.cartocdn.com/**', (route) => route.fulfill({ contentType: 'image/png', body: tile }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ lat: '38.7223', lon: '-9.1393', display_name: 'Lisboa, Portugal' }]) }));
  await page.goto('/');
  await expect(page.locator('.destination-card')).toHaveCount(5);
});
async function openNew(page, name, lat = '48.8566', lng = '2.3522') {
  await page.getByRole('button', { name: 'Adicionar destino', exact: false }).first().click();
  await page.getByLabel('Nome do destino').fill(name);
  await page.getByLabel('Latitude', { exact: true }).fill(lat);
  await page.getByLabel('Longitude', { exact: true }).fill(lng);
}
async function save(page) {
  await page.getByRole('button', { name: 'Salvar destino', exact: true }).click();
  await expect(page.locator('#editor-dialog')).not.toBeVisible();
}
async function back(page) { await page.getByRole('button', { name: 'Meus destinos', exact: false }).click(); }
async function generatedPhotos(page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2000; canvas.height = 1200;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#c09a71'; ctx.fillRect(0, 0, 2000, 1200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return ['memoria-1.png', 'memoria-2.png'].map((name) => ({ name, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }));
}
async function destinationData(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open('atlas-pessoal'); r.onsuccess = () => resolve(r.result); });
    const result = await new Promise((resolve) => { const r = db.transaction('destinations').objectStore('destinations').getAll(); r.onsuccess = () => resolve(r.result); });
    db.close(); return result;
  });
}

test('exemplos, país por polígono, estatísticas e layout sem transbordamento', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#stat-countries')).toHaveText('1');
  await expect(page.locator('#stat-cities')).toHaveText('5');
  await expect(page.locator('#stat-days')).toHaveText('15');
  await expect(page.locator('#stat-continents')).toHaveText('1');
  const data = await destinationData(page);
  expect(data.map((d) => d.countryName)).toEqual(Array(5).fill('Itália'));
  await page.getByRole('button', { name: 'Abrir destino Milão' }).click();
  await expect(page.locator('#detail-panel')).toContainText('3 dias');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await back(page);
  await openNew(page, 'Layout');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('adiciona por clique no mapa e mantém o destino ao recarregar', async ({ page }) => {
  const map = page.locator('#map'); const box = await map.boundingBox();
  await map.click({ position: { x: box.width * 0.45, y: box.height * 0.65 } });
  await expect(page.locator('#editor-dialog')).toBeVisible();
  expect(await page.getByLabel('Latitude', { exact: true }).inputValue()).not.toBe('');
  await page.getByLabel('Nome do destino').fill('Minha lembrança no mapa');
  await page.getByLabel('Chegada', { exact: true }).fill('2025-03-01');
  await page.getByLabel('Partida', { exact: true }).fill('2025-03-03');
  await expect(page.locator('#duration-preview')).toHaveText('3 dias');
  await save(page);
  await expect(page.locator('#detail-panel h2')).toHaveText('Minha lembrança no mapa');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir destino Minha lembrança no mapa' })).toBeVisible();
  await expect(page.locator('.destination-card')).toHaveCount(6);
});

test('adiciona pela busca com sugestões, debounce e intervalo entre pedidos', async ({ page }) => {
  const requests = []; page.on('request', (request) => { if (request.url().includes('nominatim')) requests.push(Date.now()); });
  await page.getByRole('button', { name: 'Adicionar destino', exact: false }).first().click();
  await page.getByLabel('Buscar cidade ou país').fill('Lis');
  await page.getByLabel('Buscar cidade ou país').fill('Lisboa');
  await page.getByRole('button', { name: 'Lisboa, Portugal', exact: true }).click();
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('38.7223');
  await expect(page.locator('#country-preview')).toContainText('Portugal');
  await page.getByLabel('Buscar cidade ou país').fill('Portugal');
  await page.getByRole('button', { name: 'Lisboa, Portugal', exact: true }).click();
  expect(requests.length).toBe(2);
  expect(requests[1] - requests[0]).toBeGreaterThanOrEqual(990);
  await save(page);
  await expect(page.locator('#detail-panel h2')).toHaveText('Lisboa');
  await expect(page.locator('#detail-panel')).toContainText('Portugal');
});

test('coordenadas, duração manual, visitas múltiplas e validação de datas', async ({ page }) => {
  await openNew(page, 'Paris');
  await expect(page.locator('#country-preview')).toContainText('França');
  await page.getByLabel('Chegada', { exact: true }).fill('2025-02-10');
  await page.getByLabel('Partida', { exact: true }).fill('2025-02-01');
  await page.getByRole('button', { name: 'Salvar destino', exact: true }).click();
  await expect(page.locator('#form-error')).toContainText('anterior');
  await page.getByLabel('Chegada', { exact: true }).fill('2025-02-01');
  await page.getByLabel('Partida', { exact: true }).fill('2025-02-15');
  await expect(page.locator('#duration-preview')).toHaveText('2 semanas e 1 dia');
  await page.getByRole('button', { name: 'Adicionar outra visita' }).click();
  const second = page.locator('.visit-editor').nth(1);
  await second.getByLabel('Não lembro as datas').check();
  await second.getByLabel('Duração em dias').fill('3');
  await page.getByLabel('Etiquetas', { exact: true }).fill('arte, férias');
  await page.getByRole('combobox', { name: 'Avaliação', exact: true }).selectOption('5');
  await save(page);
  await expect(page.locator('#detail-panel')).toContainText('2 semanas e 4 dias');
  await expect(page.locator('#detail-panel .visit-summary')).toHaveCount(2);
  await expect(page.locator('#stat-days')).toHaveText('33');
  await back(page);
  await page.getByRole('combobox', { name: 'País', exact: true }).selectOption('França');
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Etiqueta', exact: true }).selectOption('arte');
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.getByLabel('Buscar destinos salvos').fill('inexistente');
  await expect(page.locator('#destination-list')).toContainText('Nenhuma memória');
});

test('duas fotos, compressão, capa, legenda, galeria e edição', async ({ page }) => {
  await openNew(page, 'Paris com fotos');
  await page.locator('#photo-input').setInputFiles(await generatedPhotos(page));
  await expect(page.locator('.photo-edit-card')).toHaveCount(2);
  await page.getByLabel('Legenda da foto 1').fill('Uma tarde dourada');
  await page.locator('.photo-edit-card').nth(1).getByLabel('Capa', { exact: true }).check();
  await save(page);
  await expect(page.locator('.detail-gallery button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Abrir foto 1: Uma tarde dourada' }).click();
  await expect(page.locator('#gallery-dialog')).toBeVisible();
  await expect(page.locator('#gallery-caption')).toHaveText('Uma tarde dourada');
  await page.getByRole('button', { name: 'Próxima foto' }).click();
  await expect(page.locator('#gallery-counter')).toHaveText('2 / 2 · Foto');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#gallery-counter')).toHaveText('1 / 2 · Foto');
  await page.keyboard.press('Escape');
  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const r = indexedDB.open('atlas-pessoal'); r.onsuccess = () => resolve(r.result); });
    const photos = await new Promise((resolve) => { const r = db.transaction('photos').objectStore('photos').getAll(); r.onsuccess = () => resolve(r.result); });
    const image = await createImageBitmap(photos[0].blob); const thumbnail = await createImageBitmap(photos[0].thumbnail);
    const dimensions = { width: image.width, height: image.height, thumb: thumbnail.width, type: photos[0].blob.type }; image.close(); thumbnail.close(); db.close(); return dimensions;
  });
  expect(stored).toEqual({ width: 1600, height: 960, thumb: 240, type: 'image/jpeg' });
  await page.getByRole('button', { name: 'Editar destino', exact: true }).click();
  await expect(page.locator('.photo-edit-card')).toHaveCount(2);
  await page.getByLabel('Nome do destino').fill('Paris, uma memória');
  await page.getByLabel('Notas', { exact: true }).fill('Quero voltar.');
  await page.getByRole('button', { name: 'Remover foto 1', exact: true }).click();
  await save(page);
  await expect(page.locator('#detail-panel h2')).toHaveText('Paris, uma memória');
  await expect(page.locator('.detail-gallery button')).toHaveCount(1);
  await page.reload();
  await page.getByRole('button', { name: 'Abrir destino Paris, uma memória' }).click();
  await expect(page.locator('#detail-panel')).toContainText('Quero voltar.');
  await expect(page.locator('.detail-gallery button')).toHaveCount(1);
});

test('exporta e importa JSON com fotos sem duplicar; exclusão tem confirmação', async ({ page }) => {
  await openNew(page, 'Backup Paris');
  await page.locator('#photo-input').setInputFiles(await generatedPhotos(page));
  await expect(page.locator('.photo-edit-card')).toHaveCount(2);
  await save(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const download = await downloadPromise;
  const buffer = await fs.readFile(await download.path()); const backup = JSON.parse(buffer.toString());
  expect(backup.destinations).toHaveLength(6); expect(backup.photos).toHaveLength(2);
  expect(backup.photos[0].data).toMatch(/^data:image\/jpeg;base64,/);
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#detail-panel h2')).toHaveText('Backup Paris');
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('.destination-card')).toHaveCount(5);
  for (let i = 0; i < 2; i++) {
    await page.locator('#import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
    await expect(page.locator('#toast')).toContainText('sem duplicação');
    await expect(page.locator('.destination-card')).toHaveCount(6);
  }
  // Even a backup with a different ID for the same name and coordinates must merge.
  const copy = JSON.parse(buffer.toString());
  const imported = copy.destinations.find((d) => d.name === 'Backup Paris');
  const oldId = imported.id; imported.id = 'another-destination-id'; imported.countryName = 'País incorreto';
  copy.photos.filter((p) => p.destinationId === oldId).forEach((p) => { p.destinationId = imported.id; });
  await page.locator('#import-input').setInputFiles({ name: 'copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copy)) });
  await expect(page.locator('#toast')).toContainText('sem duplicação');
  await expect(page.locator('.destination-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Abrir destino Backup Paris' }).click();
  await expect(page.locator('.detail-gallery button')).toHaveCount(2);
  await expect(page.locator('#detail-panel')).toContainText('França');
});

test('falhas de busca e tiles preservam o atlas; imagens e backup inválidos não alteram os dados', async ({ page }) => {
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.locator('#map-style').selectOption('streets');
  await page.reload();
  await expect(page.locator('#map-status')).toContainText('continuam acessíveis');
  await openNew(page, 'Sem rede');
  await page.getByLabel('Buscar cidade ou país').fill('Lugar');
  await expect(page.locator('#geocode-status')).toContainText('indisponível');
  await page.locator('#photo-input').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('imagem inválida') });
  await expect(page.locator('#photo-status')).toContainText('Não foi possível ler');
  await save(page);
  await expect(page.locator('#detail-panel h2')).toHaveText('Sem rede');
  await page.locator('#import-input').setInputFiles({ name: 'corrompido.json', mimeType: 'application/json', buffer: Buffer.from('{não é json') });
  await expect(page.locator('#toast')).toContainText('Não foi possível ler o JSON');
  await expect(page.locator('#stat-cities')).toHaveText('6');
});

test('limpar exemplos preserva destinos editados e não semeia novamente', async ({ page }) => {
  await page.getByRole('button', { name: 'Abrir destino Roma' }).click();
  await page.getByRole('button', { name: 'Editar destino', exact: true }).click();
  await page.getByLabel('Notas', { exact: true }).fill('Minha viagem real.');
  await save(page); await back(page);
  await page.getByRole('button', { name: 'Limpar exemplos', exact: true }).click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.destination-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Abrir destino Roma' }).click();
  await expect(page.locator('#detail-panel')).toContainText('Minha viagem real.');
});

test('reabre o atlas completamente offline com dados e galeria', async ({ page, context }) => {
  await openNew(page, 'Paris offline');
  await page.locator('#photo-input').setInputFiles(await generatedPhotos(page));
  await expect(page.locator('.photo-edit-card')).toHaveCount(2); await save(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Abrir destino Paris offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir destino Paris offline' }).click();
  await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click();
  await expect(page.locator('#gallery-dialog img')).toBeVisible();
  expect(await page.locator('#gallery-dialog img').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('ordenação, rota curva, clustering e cores dos países visitados', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption('name');
  await expect(page.locator('.destination-card').first()).toHaveAttribute('aria-label', 'Abrir destino Florença');
  await page.getByRole('combobox', { name: 'Ordenar por' }).selectOption('duration');
  await expect(page.locator('.destination-card').first()).toHaveAttribute('aria-label', 'Abrir destino Roma');
  await expect(page.locator('.atlas-cluster')).toHaveCount(1);
  const pathCount = await page.locator('#map path').count();
  await page.getByLabel('Rota cronológica').check();
  await expect(page.locator('#map path')).toHaveCount(pathCount + 4);
  const path = page.locator('#map path[stroke-dasharray]').first();
  expect((await path.getAttribute('d')).split('L').length).toBeGreaterThan(10);
  await page.getByLabel('Rota cronológica').uncheck();
  await expect(page.locator('#map path')).toHaveCount(pathCount);
  await expect(page.locator('#map path[fill="#c09a71"]')).toHaveCount(1);
});

test('arrastar fotos, deslizar na galeria e navegação por teclado', async ({ page }) => {
  await openNew(page, 'Memórias arrastadas');
  const payload = (await generatedPhotos(page)).map((file) => ({ name: file.name, type: file.mimeType, data: file.buffer.toString('base64') }));
  await page.locator('#drop-zone').evaluate((zone, files) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0))], file.name, { type: file.type }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, payload);
  await expect(page.locator('.photo-edit-card')).toHaveCount(2); await save(page);
  await page.getByRole('button', { name: 'Abrir foto 1', exact: true }).click();
  await page.locator('#gallery-dialog').evaluate((dialog) => {
    const touch = (x) => new Touch({ identifier: 1, target: dialog, clientX: x, clientY: 200 });
    dialog.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [touch(280)], touches: [touch(280)], bubbles: true }));
    dialog.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(80)], touches: [], bubbles: true }));
  });
  await expect(page.locator('#gallery-counter')).toHaveText('2 / 2 · Foto');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#gallery-counter')).toHaveText('1 / 2 · Foto');
  await page.getByRole('button', { name: 'Fechar galeria' }).click();
  await expect(page.locator('#gallery-dialog')).not.toBeVisible();
});

test('cota de armazenamento informa o problema sem perder dados existentes', async ({ page }) => {
  await openNew(page, 'Falha de armazenamento');
  await page.locator('#photo-input').setInputFiles(await generatedPhotos(page));
  await expect(page.locator('.photo-edit-card')).toHaveCount(2);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'photos') throw new DOMException('Storage full', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Salvar destino', exact: true }).click();
  await expect(page.locator('#form-error')).toContainText('armazenamento do navegador está cheio');
  expect((await destinationData(page)).length).toBe(5);
  await expect(page.locator('#editor-dialog')).toBeVisible();
});

test('sem Supabase configurado, informa a ativação pendente e mantém o atlas local', async ({ page }) => {
  await page.locator('#login-button').click();
  await expect(page.locator('#cloud-not-configured')).toContainText('login ainda está em preparação');
  await expect(page.locator('#auth-form')).not.toBeVisible();
  await page.getByRole('button', { name: 'Fechar login' }).click();
  await expect(page.locator('.destination-card')).toHaveCount(5);
});
