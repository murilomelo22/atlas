import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mockCloud, ALICE, BOB } from './cloud-fixture.js';

test.use({ serviceWorkers: 'block' });
const mp4 = await readFile(new URL('./fixtures/memory.mp4', import.meta.url));
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page, email = 'alice@example.com') {
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill(email); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function media(page, cloud, post, count = 1, kind = 'image') {
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  for (let i = 0; i < count; i++) {
    const id = `${post.id}-photo-${i}`, prefix = `${post.owner_id}/${post.id}/${id}`;
    const row = { id, owner_id: post.owner_id, destination_id: post.id, caption: `Memória ${i}`, kind, storage_path: `${prefix}.${kind === 'video' ? 'mp4' : 'jpg'}`, thumbnail_path: `${prefix}-thumb.jpg`, motion_path: kind === 'live' ? `${prefix}-motion.mp4` : null, duration: kind === 'image' ? null : 1.2 };
    cloud.photos.push(row); post.data.photoIds.push(id); post.data.coverId ||= id;
    cloud.objects.set(`atlas-media/${row.storage_path}`, kind === 'video' ? mp4 : jpeg);
    cloud.objects.set(`atlas-media/${row.thumbnail_path}`, jpeg);
    if (row.motion_path) cloud.objects.set(`atlas-media/${row.motion_path}`, mp4);
  }
}
async function cache(page) { return page.evaluate(async () => (await (await import('/src/db.js')).getAllPhotos()).map(p => ({ id: p.id, blob: p.blob instanceof Blob, thumbnail: p.thumbnail instanceof Blob, motion: p.motionBlob instanceof Blob }))); }
async function sync(page) { await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); }
const original = request => request.method() === 'GET' && request.url().includes('/object/sign/atlas-media/') && !request.url().includes('-thumb.jpg');

test('cem fotos sincronizam como metadados; falha de original não bloqueia o mapa e permite tentar novamente', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('family', 'Memórias da família'); await media(page, cloud, post, 100);
  let failed = true; const downloads = [];
  await page.route('**/object/sign/atlas-media/**', route => {
    if (!original(route.request())) return route.fallback();
    downloads.push(route.request().url());
    return failed ? route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }) : route.fallback();
  });
  await login(page); await expect(page.locator('.destination-card')).toHaveCount(1);
  expect(downloads).toHaveLength(0); expect((await cache(page)).filter(p => p.blob)).toHaveLength(0); expect(await cache(page)).toHaveLength(100);
  await page.locator('.destination-card').click(); await page.locator('[data-photo-index="0"]').click();
  await expect(page.locator('[data-gallery-retry]')).toBeVisible();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); await expect(page.locator('#stat-cities')).toHaveText('1');
  expect(downloads.length).toBe(3);
  failed = false; await page.locator('[data-gallery-retry]').click(); await expect(page.locator('#gallery-dialog img')).toBeVisible();
  await expect.poll(async () => (await cache(page)).filter(p => p.blob).length).toBe(1);
  await page.locator('[data-gallery-close]').click(); const count = downloads.length;
  await page.locator('[data-photo-index="0"]').click(); await expect(page.locator('#gallery-dialog img')).toBeVisible(); expect(downloads).toHaveLength(count);
});

test('revisões evitam reler fotos e dados inalterados; alterações e exclusões de outro dispositivo chegam', async ({ page }) => {
  const cloud = await mockCloud(page); const first = cloud.addPost('first', 'Primeira memória'), second = cloud.addPost('second', 'Segunda memória');
  await ready(page); await media(page, cloud, first); await media(page, cloud, second); await login(page);
  const reads = []; page.on('request', request => { if (request.method() === 'GET' && request.url().includes('/rest/v1/')) reads.push(new URL(request.url())); });
  await page.locator('#account-button').click(); await sync(page);
  expect(reads.filter(u => u.pathname.endsWith('/photos'))).toHaveLength(0);
  expect(reads.filter(u => u.pathname.endsWith('/destinations')).map(u => u.searchParams.get('select'))).toEqual(['owner_id,id,revision,visibility']);
  reads.length = 0; second.revision = randomUUID(); second.data.notes = 'Alterada no segundo dispositivo'; cloud.posts = cloud.posts.filter(p => p !== first);
  await sync(page); await expect(page.locator('.destination-card')).toHaveCount(1);
  expect(reads.filter(u => u.pathname.endsWith('/destinations') && u.searchParams.get('select') === '*').map(u => u.searchParams.get('id'))).toEqual(['in.("second")']);
  expect(reads.filter(u => u.pathname.endsWith('/photos')).map(u => u.searchParams.get('destination_id'))).toEqual(['in.("second")']);
  expect((await cache(page)).map(p => p.id)).toEqual(['second-photo-0']);
  await page.getByRole('button', { name: 'Fechar perfil', exact: true }).click(); await page.locator('.destination-card').click(); await expect(page.locator('#detail-panel')).toContainText('Alterada no segundo dispositivo');
});

test('download offline preserva partes concluídas e repete somente o que faltou, incluindo Live Photo', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('offline', 'Viagem offline'); await media(page, cloud, post, 1, 'live');
  const row = cloud.photos[0]; let failed = true; const downloads = new Map();
  await page.route('**/object/sign/atlas-media/**', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const path = decodeURIComponent(new URL(route.request().url()).pathname); downloads.set(path, (downloads.get(path) || 0) + 1);
    return failed && path.endsWith(row.motion_path) ? route.fulfill({ status: 403, body: '{}' }) : route.fallback();
  });
  await login(page); await page.locator('#account-button').click(); await page.locator('#download-media-button').click();
  await expect(page.locator('#offline-media-status')).toContainText('1 mídia não pôde');
  expect(await cache(page)).toEqual([{ id: row.id, blob: true, thumbnail: true, motion: false }]);
  const imageDownloads = downloads.get(`/storage/v1/object/sign/atlas-media/${row.storage_path}`);
  const thumbDownloads = downloads.get(`/storage/v1/object/sign/atlas-media/${row.thumbnail_path}`);
  failed = false; await page.locator('#download-media-button').click(); await expect(page.locator('#offline-media-status')).toContainText('disponíveis neste dispositivo');
  expect(downloads.get(`/storage/v1/object/sign/atlas-media/${row.storage_path}`)).toBe(imageDownloads);
  expect(downloads.get(`/storage/v1/object/sign/atlas-media/${row.thumbnail_path}`)).toBe(thumbDownloads);
  expect(await cache(page)).toEqual([{ id: row.id, blob: true, thumbnail: true, motion: true }]);
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup.photos).toHaveLength(1); expect(Buffer.from(backup.photos[0].motion.split(',')[1], 'base64')).toEqual(mp4);
});

test('backup completo busca originais sob demanda e falha sem produzir um backup incompleto', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('backup', 'Backup da família'); await media(page, cloud, post, 2);
  await login(page); let blocked = true, received = 0;
  await page.route('**/object/sign/atlas-media/**', route => {
    if (!original(route.request())) return route.fallback(); received++;
    return blocked && route.request().url().includes('photo-1.jpg') ? route.fulfill({ status: 403, body: '{}' }) : route.fallback();
  });
  const attempt = () => page.evaluate(async () => { try { return await (await import('/src/db.js')).exportBackup(); } catch (error) { return { error: error.message }; } });
  const failed = await attempt(); expect(failed.error).toContain('Não foi possível baixar'); expect((await cache(page)).filter(p => p.blob)).toHaveLength(1);
  blocked = false; const backup = await attempt(); expect(backup.photos).toHaveLength(2); expect(backup.photos.every(p => p.data.startsWith('data:image/jpeg;base64,'))).toBe(true); expect(received).toBe(3);
});

test('vídeo e movimento de Live Photo só carregam ao abrir ou reproduzir', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const movie = cloud.addPost('movie', 'Vídeo na nuvem'), live = cloud.addPost('live', 'Live Photo na nuvem');
  await media(page, cloud, movie, 1, 'video'); await media(page, cloud, live, 1, 'live');
  const downloads = []; page.on('request', request => { if (original(request)) downloads.push(request.url()); });
  await login(page); expect(downloads).toHaveLength(0);
  await page.getByRole('button', { name: 'Abrir destino Live Photo na nuvem' }).click(); await page.locator('[data-photo-index="0"]').click(); await expect(page.locator('#gallery-dialog img')).toBeVisible();
  expect(downloads.some(u => u.includes('-motion.mp4'))).toBe(false);
  await page.locator('[data-gallery-live]').click(); await expect(page.locator('#gallery-dialog video')).toBeVisible(); await expect.poll(() => page.locator('#gallery-dialog video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(downloads.some(u => u.includes('-motion.mp4'))).toBe(true);
  await page.locator('[data-gallery-close]').click(); await page.getByRole('button', { name: 'Meus destinos', exact: false }).click();
  await page.getByRole('button', { name: 'Abrir destino Vídeo na nuvem' }).click(); await page.locator('[data-photo-index="0"]').click(); await expect(page.locator('#gallery-dialog video')).toBeVisible();
  await expect.poll(() => page.locator('#gallery-dialog video').evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  expect((await cache(page)).find(p => p.id === movie.data.photoIds[0]).blob).toBe(false);
});

test('resposta atrasada de uma mídia privada não recria cache nem aparece na outra conta', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('private', 'Somente Alice'); await media(page, cloud, post); cloud.addPost('bob', 'Somente Bruno', BOB);
  let release, started = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/object/sign/atlas-media/**', async route => { if (original(route.request())) { started = true; await gate; } await route.fallback(); });
  await login(page); await page.locator('.destination-card').click(); await page.locator('[data-photo-index="0"]').click(); await expect.poll(() => started).toBe(true);
  await page.locator('[data-gallery-close]').click(); await page.locator('#account-button').click(); await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
  await login(page, 'bob@example.com'); release();
  await expect(page.locator('.destination-card')).toContainText('Somente Bruno'); expect(await cache(page)).toEqual([]);
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === `atlas-pessoal-account-${ALICE}`)).toBe(false);
  expect(await page.locator('#gallery-dialog img').getAttribute('src')).toBeNull();
});

test('uma resposta de metadados anterior ao download não apaga o original já salvo', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('race', 'Memória preservada'); await media(page, cloud, post); await login(page);
  await page.evaluate(async owner => {
    const { readCollection } = await import('/src/cloud.js'), db = await import('/src/db.js'), { loadCloudMedia } = await import('/src/cloud-media.js');
    const earlier = await readCollection(owner);
    await loadCloudMedia(earlier.photos[0], { parts: ['blob'] });
    await db.mergeCloudCollection(earlier);
  }, ALICE);
  expect((await cache(page))[0].blob).toBe(true);
});

test('interromper o download libera o controle e a retomada preserva os arquivos concluídos', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('cancel', 'Download interrompível'); await media(page, cloud, post, 2);
  let release, blocked = true, started = false, firstDownloads = 0; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/object/sign/atlas-media/**', async route => {
    if (original(route.request())) {
      if (route.request().url().includes('photo-0.jpg')) firstDownloads++;
      if (blocked && route.request().url().includes('photo-1.jpg')) { started = true; await gate; }
    }
    try { await route.fallback(); } catch {}
  });
  await login(page); await page.locator('#account-button').click(); await page.locator('#download-media-button').click();
  await expect.poll(() => started).toBe(true); await expect(page.locator('#offline-media-status')).toContainText('1/2');
  await page.locator('#cancel-media-download').click(); await expect(page.locator('#download-media-button')).toBeEnabled();
  await expect(page.locator('#offline-media-status')).toContainText('interrompido'); expect((await cache(page)).filter(p => p.blob)).toHaveLength(1);
  blocked = false; release(); await page.locator('#download-media-button').click(); await expect(page.locator('#offline-media-status')).toContainText('disponíveis neste dispositivo');
  expect((await cache(page)).filter(p => p.blob)).toHaveLength(2); expect(firstDownloads).toBe(1);
});

test('pedidos simultâneos usam a mesma fila e mantêm no máximo dois downloads de arquivos', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); const post = cloud.addPost('limited', 'Coleção com limite de carga'); await media(page, cloud, post, 15); await login(page);
  let active = 0, maximum = 0;
  await page.route('**/object/sign/atlas-media/**', async route => {
    if (!original(route.request())) return route.fallback();
    active++; maximum = Math.max(maximum, active);
    try { await new Promise(resolve => setTimeout(resolve, 100)); await route.fallback(); }
    finally { active--; }
  });
  await page.evaluate(async () => {
    const { getAllPhotos } = await import('/src/db.js'), { loadCloudMedia } = await import('/src/cloud-media.js');
    await Promise.all((await getAllPhotos()).map(p => loadCloudMedia(p, { parts: ['blob'] })));
  });
  expect(maximum).toBeGreaterThan(0); expect(maximum).toBeLessThanOrEqual(2);
  expect((await cache(page)).filter(p => p.blob)).toHaveLength(15);
});
