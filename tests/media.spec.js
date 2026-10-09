import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockTrips } from './trips-fixture.js';
import { ALICE, BOB } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
const videoBytes = await readFile(new URL('./fixtures/memory.mp4', import.meta.url));
const video = (name = 'memory.mp4') => ({ name, mimeType: 'video/mp4', buffer: videoBytes });
async function still(page, name = 'memory.jpg') {
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 360; c.height = 240; c.getContext('2d').fillRect(0, 0, 360, 240); return c.toDataURL('image/jpeg').split(',')[1]; });
  return { name, mimeType: 'image/jpeg', buffer: Buffer.from(data, 'base64') };
}
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page, email = 'alice@example.com') {
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill(email); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function logout(page) {
  if (await page.locator('#gallery-dialog').isVisible()) await page.locator('[data-gallery-close]').click();
  if (await page.locator('#trips-dialog').isVisible()) await page.locator('#trips-close').click();
  await page.locator('#account-button').click(); await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
}
async function review(page, name, files) {
  await page.locator('#add-button').click(); await page.locator('#destination-name').fill(name); await page.locator('#latitude').fill('48.85'); await page.locator('#longitude').fill('2.35');
  await page.locator('#photo-input').setInputFiles(files); await expect(page.locator('#save-button')).toBeEnabled();
}
async function save(page) { await page.locator('#save-button').click(); await expect(page.locator('#editor-dialog')).not.toBeVisible(); }
async function playing(page) {
  const player = page.locator('#gallery-dialog video'); await expect(player).toBeVisible();
  await expect.poll(() => player.evaluate(v => v.readyState)).toBeGreaterThanOrEqual(2);
  await player.evaluate(v => { v.muted = true; return v.play(); });
  await expect.poll(() => player.evaluate(v => v.currentTime)).toBeGreaterThan(0);
  expect(await player.evaluate(v => v.videoWidth)).toBe(320);
  const bounds = await player.boundingBox(); expect(bounds.width).toBeLessThanOrEqual(page.viewportSize().width);
}
async function trip(page) {
  await page.locator('#trips-button').click(); await page.locator('#trip-new').click(); await page.locator('#trip-name').fill('Trip com vídeos'); await page.locator('#trip-add-stop').click();
  await page.locator('[data-stop-name]').fill('Paris'); await page.locator('[data-stop-lat]').fill('48.85'); await page.locator('[data-stop-lng]').fill('2.35');
  await page.locator('#trip-save').click(); await expect(page.locator('#trip-invite-form')).toBeVisible();
}

test('vídeo toca, navega para fotos, recarrega e restaura backup sem perder o original', async ({ page }) => {
  await mockTrips(page); await ready(page);
  await review(page, 'Review com vídeo', [video(), await still(page, 'other.jpg')]); await expect(page.locator('.photo-edit-card')).toHaveCount(2); await save(page);
  await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page);
  await page.locator('[data-gallery-next]').click(); await expect(page.locator('#gallery-dialog video')).not.toBeVisible(); await expect(page.locator('#gallery-dialog img')).toBeVisible();
  expect(await page.locator('#gallery-dialog video').evaluate(v => v.paused && !v.hasAttribute('src'))).toBe(true);
  await page.locator('[data-gallery-close]').click();
  const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar backup' }).click(); const download = await pending;
  const bytes = await readFile(await download.path()), backup = JSON.parse(bytes); expect(backup.version).toBe(2);
  const media = backup.photos.find(p => p.kind === 'video'); expect(Buffer.from(media.data.split(',')[1], 'base64')).toEqual(videoBytes);
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('#import-input').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: bytes }); await expect(page.locator('.destination-card')).toHaveCount(6);
  await page.reload(); await page.getByRole('button', { name: 'Abrir destino Review com vídeo' }).click(); await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page);
});

test('Live Photo combina arquivos, alterna foto e movimento e preserva os dois no backup', async ({ page }) => {
  await mockTrips(page); await ready(page); await review(page, 'Review Live', [await still(page, 'IMG_2487.JPG'), video('IMG_2487.mp4')]);
  await expect(page.locator('.photo-edit-card')).toHaveCount(1); await expect(page.locator('.photo-edit-card')).toContainText('Live Photo'); await save(page);
  await page.getByRole('button', { name: 'Abrir Live Photo 1', exact: true }).click(); await expect(page.locator('#gallery-dialog img')).toBeVisible();
  await page.locator('[data-gallery-live]').click(); await playing(page); await page.locator('[data-gallery-live]').click(); await expect(page.locator('#gallery-dialog img')).toBeVisible(); await expect(page.locator('#gallery-dialog video')).not.toBeVisible();
  await page.locator('[data-gallery-close]').click();
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup()); expect(backup.photos).toHaveLength(1);
  expect(backup.photos[0].data).toMatch(/^data:image\/jpeg/); expect(Buffer.from(backup.photos[0].motion.split(',')[1], 'base64')).toEqual(videoBytes);
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect(page.locator('.destination-card')).toHaveCount(5);
  await page.locator('#import-input').setInputFiles({ name: 'live.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) }); await expect(page.locator('.destination-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Abrir destino Review Live' }).click(); await page.getByRole('button', { name: 'Abrir Live Photo 1', exact: true }).click(); await page.locator('[data-gallery-live]').click(); await playing(page);
});

test('Live Photo sincroniza sem duplicar arquivos nas edições e remove foto, vídeo e miniatura', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await review(page, 'Live na nuvem', [await still(page), video()]); await save(page);
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.photos[0].kind).toBe('live'); expect(cloud.objects.size).toBe(3);
  expect(cloud.objects.get(`atlas-media/${cloud.photos[0].motion_path}`)).toEqual(videoBytes);
  await page.getByRole('button', { name: 'Editar destino', exact: true }).click(); await expect(page.locator('.photo-edit-card')).toHaveCount(1); await page.locator('[data-caption]').fill('Movimento preservado'); await save(page);
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.objects.size).toBe(3);
  await page.reload(); await page.getByRole('button', { name: 'Abrir destino Live na nuvem' }).click(); await page.getByRole('button', { name: /Abrir Live Photo 1/ }).click(); await page.locator('[data-gallery-live]').click(); await playing(page); await page.locator('[data-gallery-close]').click();
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click(); await page.locator('#confirm-ok').click(); await expect.poll(() => cloud.objects.size).toBe(0); expect(cloud.photos).toHaveLength(0);
});

test('vídeo público abre para visitante e a mídia privada e cache saem com a conta', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await review(page, 'Vídeo público', [video()]); await page.locator('#visibility').selectOption('public'); await save(page);
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); await review(page, 'Vídeo privado', [video()]); await save(page); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page); await logout(page);
  expect(await page.locator('#gallery-dialog video').evaluate(v => !v.hasAttribute('src') && !v.hasAttribute('poster') && v.paused)).toBe(true);
  expect((await page.evaluate(() => indexedDB.databases())).some(db => db.name === `atlas-pessoal-account-${ALICE}`)).toBe(false);
  await page.goto('/#/perfil/alice'); await expect(page.locator('.destination-card')).toHaveCount(1); await page.getByRole('button', { name: 'Abrir destino Vídeo público' }).click(); await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page);
  expect(cloud.requests.some(r => r.path.includes('/sign/') && r.owner === null)).toBe(true); await page.locator('[data-gallery-close]').click();
  await page.goto('/#/perfil/bob'); await expect(page.locator('.destination-card')).toHaveCount(0);
});

test('migração ausente preserva mídia local e sincroniza após a ativação', async ({ page }) => {
  const cloud = await mockTrips(page); let missing = true;
  await page.route('https://atlas-tests.supabase.co/rest/v1/photos?**', route => missing && new URL(route.request().url()).searchParams.get('select') === 'kind,motion_path,duration' ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '42703', message: 'column kind does not exist' }) }) : route.fallback());
  await ready(page); await login(page); await review(page, 'Vídeo pendente', [video()]); await save(page); await expect(page.locator('#sync-status')).toContainText('media.sql'); expect(cloud.objects.size).toBe(0);
  await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page); await page.locator('[data-gallery-close]').click();
  missing = false; await page.locator('#account-button').click(); await page.locator('#sync-button').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.photos[0].kind).toBe('video');
});

test('colaborador envia Live Photo, reproduz na trip e perde envio quando permissão é revogada', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await trip(page);
  await page.locator('#trip-invite-username').fill('bob'); await page.locator('#trip-invite-permissions [data-permission="add_photos"]').check(); await page.locator('#trip-invite-form').getByRole('button', { name: 'Enviar convite' }).click(); await expect(page.locator('#trip-people')).toContainText('@bob');
  await logout(page); await login(page, 'bob@example.com'); await page.locator('#trips-button').click(); await page.locator('.trip-card').click(); await page.locator('#trip-accept').click(); await expect(page.locator('#trip-accept')).toHaveCount(0);
  await page.locator('[data-trip-photo]').setInputFiles([await still(page), video()]); await page.getByRole('button', { name: 'Enviar mídia', exact: true }).click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(1);
  expect(cloud.tripPhotos[0].uploader_id).toBe(BOB); expect(cloud.tripPhotos[0].kind).toBe('live');
  await page.getByRole('link', { name: 'Abrir live photo da trip' }).click(); await page.locator('[data-gallery-live]').click(); await playing(page); await page.locator('[data-gallery-close]').click();
  cloud.members[0].can_add_photos = false; await page.locator('#trips-close').click(); await page.locator('#trips-button').click(); await page.locator('.trip-card').click(); await expect(page.locator('[data-trip-photo]')).toHaveCount(0); await expect(page.locator('[data-delete-photo]')).toHaveCount(0);
  await page.getByRole('link', { name: 'Abrir live photo da trip' }).click(); await page.locator('[data-gallery-live]').click(); await playing(page); await page.locator('[data-gallery-close]').click();
  await logout(page); await login(page); await page.locator('#trips-button').click(); await page.locator('.trip-card').click(); await page.locator('[data-delete-photo]').click(); await page.locator('#confirm-ok').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(0);
});

test('rejeita vídeo corrompido, acima do limite e pareamento ambíguo sem travar o editor', async ({ page }) => {
  await mockTrips(page); await ready(page); await review(page, 'Mídia inválida', [{ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('invalid video') }]);
  await expect(page.locator('#photo-status')).toContainText('Não foi possível reproduzir'); await expect(page.locator('.photo-edit-card')).toHaveCount(0); await expect(page.locator('#save-button')).toBeEnabled();
  expect(await page.evaluate(async () => { try { await (await import('/src/media.js')).processVideo(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'large.mp4', { type: 'video/mp4' }), 'test'); return ''; } catch (e) { return e.message; } })).toContain('50 MB');
  await page.locator('#photo-input').setInputFiles([await still(page), video('memory.mp4'), video('memory.mov')]); await expect(page.locator('.photo-edit-card')).toHaveCount(3); await expect(page.locator('#save-button')).toBeEnabled();
  expect(await page.locator('.photo-edit-card .media-badge').allTextContents()).not.toContain('Live Photo');
});

test('MOV com H.264 e WebM com VP9 tocam e mantêm os bytes originais', async ({ page }) => {
  await mockTrips(page); await ready(page);
  const mov = await readFile(new URL('./fixtures/memory.mov', import.meta.url)), webm = await readFile(new URL('./fixtures/memory.webm', import.meta.url));
  await review(page, 'Outros formatos', [{ name: 'movie.mov', mimeType: 'video/quicktime', buffer: mov }, { name: 'movie.webm', mimeType: 'video/webm', buffer: webm }]);
  await expect(page.locator('.photo-edit-card')).toHaveCount(2); await save(page); await page.getByRole('button', { name: 'Abrir Vídeo 1', exact: true }).click(); await playing(page); await page.locator('[data-gallery-next]').click(); await playing(page); await page.locator('[data-gallery-close]').click();
  const backup = await page.evaluate(async () => (await import('/src/db.js')).exportBackup());
  expect(Buffer.from(backup.photos.find(p => p.data.startsWith('data:video/quicktime')).data.split(',')[1], 'base64')).toEqual(mov);
  expect(Buffer.from(backup.photos.find(p => p.data.startsWith('data:video/webm')).data.split(',')[1], 'base64')).toEqual(webm);
});

test('Live Photo funciona quando o navegador só decodifica fotos pelo elemento img', async ({ page }) => {
  await page.addInitScript(() => { window.createImageBitmap = undefined; }); await mockTrips(page); await ready(page);
  await review(page, 'Decodificação nativa', [await still(page), video()]); await expect(page.locator('.photo-edit-card')).toHaveCount(1); await save(page);
  await page.getByRole('button', { name: 'Abrir Live Photo 1', exact: true }).click(); await expect(page.locator('#gallery-dialog img')).toBeVisible(); await page.locator('[data-gallery-live]').click(); await playing(page);
});

test('migração da coleção local para a conta mantém Live Photo privada e o vídeo', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await review(page, 'Live local migrada', [await still(page), video()]); await save(page); await login(page);
  await page.locator('#account-button').click(); await page.locator('#migrate-button').click(); await page.locator('#confirm-ok').click(); await expect.poll(() => cloud.posts.length).toBe(1); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  await expect.poll(() => cloud.photos.length).toBe(1); expect(cloud.photos[0].kind).toBe('live'); expect(cloud.posts[0].visibility).toBe('private'); expect(cloud.objects.get(`atlas-media/${cloud.photos[0].motion_path}`)).toEqual(videoBytes);
  await page.getByRole('button', { name: 'Fechar perfil' }).click(); await page.getByRole('button', { name: 'Abrir destino Live local migrada' }).click(); await page.getByRole('button', { name: 'Abrir Live Photo 1', exact: true }).click(); await page.locator('[data-gallery-live]').click(); await playing(page);
});

test('resposta perdida ao enviar Live Photo permite repetir sem duplicar três arquivos', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await trip(page);
  let lost = true;
  await page.route('**/rpc/atlas_add_trip_media', async route => {
    if (!lost) return route.fallback(); lost = false;
    const b = route.request().postDataJSON(); cloud.tripPhotos.push({ id: b.p_id, trip_id: b.p_trip, uploader_id: ALICE, kind: b.p_kind, storage_path: b.p_path, thumbnail_path: b.p_thumbnail, motion_path: b.p_motion, duration: b.p_duration, caption: b.p_caption }); await route.abort();
  });
  await page.locator('[data-trip-photo]').setInputFiles([await still(page), video()]); await page.getByRole('button', { name: 'Enviar mídia', exact: true }).click(); await expect(page.locator('#trip-message')).toContainText('Sem conexão');
  expect(cloud.objects.size).toBe(3); await page.getByRole('button', { name: 'Enviar mídia', exact: true }).click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(1); expect(cloud.tripPhotos).toHaveLength(1); expect(cloud.objects.size).toBe(3);
  await page.getByRole('link', { name: 'Abrir live photo da trip' }).click(); await page.locator('[data-gallery-live]').click(); await playing(page);
});
