import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockTrips } from './trips-fixture.js';
test.use({ serviceWorkers: 'block' });
const movie = await readFile(new URL('./fixtures/memory.mp4', import.meta.url));
async function setup(page, kinds = ['image']) {
  const cloud = await mockTrips(page); await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5);
  const post = cloud.addPost('my-review', 'Paris da minha avaliação'); post.data.rating = 5; post.data.notes = 'Memórias pessoais'; post.data.visits = [{ id: 'visit-may', arrival: '2024-05-01', departure: '2024-05-04', manualDays: null }];
  const image = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return c.toDataURL('image/jpeg').split(',')[1]; }), 'base64');
  kinds.forEach((kind, index) => {
    const id = `review-${kind}-${index}`, prefix = `${post.owner_id}/review/${id}`;
    const photo = { id, destination_id: post.id, owner_id: post.owner_id, kind, caption: `Minha memória ${index + 1}`, storage_path: `${prefix}.${kind === 'video' ? 'mp4' : 'jpg'}`, thumbnail_path: `${prefix}-thumb.jpg`, motion_path: kind === 'live' ? `${prefix}-motion.mp4` : null, duration: kind === 'image' ? null : 1.2 };
    cloud.photos.push(photo); post.data.photoIds.push(id); post.data.coverId ||= id;
    cloud.objects.set(`atlas-media/${photo.storage_path}`, kind === 'video' ? movie : image); cloud.objects.set(`atlas-media/${photo.thumbnail_path}`, image);
    if (photo.motion_path) cloud.objects.set(`atlas-media/${photo.motion_path}`, movie);
  });
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill('alice@example.com'); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  return { cloud, post };
}
async function create(page, publicly = false) {
  await page.locator('#trips-button').click(); await page.locator('#trip-new').click(); await page.locator('#trip-name').fill('Álbum das férias');
  if (publicly) await page.locator('#trip-public').check(); await page.locator('#trip-save').click(); await expect(page.locator('[data-import-reviews]')).toBeVisible();
}
async function pick(page) {
  await page.locator('[data-import-reviews]').click(); await expect(page.locator('[data-review-photo]')).not.toHaveCount(0);
  for (const input of await page.locator('[data-review-photo]:not(:disabled)').all()) await input.check();
  await page.locator('[data-review-import]').click();
}
test('importa fotos, vídeos e Live Photos com cópia no servidor sem baixar originais nem mudar a avaliação', async ({ page }) => {
  const { cloud, post } = await setup(page, ['image', 'video', 'live']); await create(page, true);
  const originalDownloads = []; page.on('request', request => { if (request.method() === 'GET' && request.url().includes('/object/sign/atlas-media/') && !request.url().includes('-thumb.jpg')) originalDownloads.push(request.url()); });
  await pick(page); await expect(page.locator('.trip-gallery figure')).toHaveCount(3); await expect(page.locator('#trip-message')).toContainText('3 mídias importadas');
  expect(originalDownloads).toHaveLength(0); expect(cloud.tripPhotos.map(p => p.kind || 'image').sort()).toEqual(['image', 'live', 'video']);
  expect(cloud.posts[0].visibility).toBe('private'); expect(cloud.photos).toHaveLength(3);
  const live = cloud.tripPhotos.find(p => p.kind === 'live'); expect(cloud.objects.get(`atlas-trip-media/${live.motion_path}`)).toEqual(movie);
  await page.locator('[data-import-reviews]').click(); for (const input of await page.locator('[data-review-photo]').all()) await expect(input).toBeDisabled();
  await expect(page.locator('[data-review-import]')).toBeDisabled();
  await page.locator('[data-review-cancel]').click(); await page.locator('.trip-gallery [data-delete-photo]').first().click(); await page.locator('#confirm-ok').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(2);
  expect(cloud.objects.has(`atlas-media/${cloud.photos[0].storage_path}`)).toBe(true); expect(cloud.posts.find(p => p.id === post.id).data.rating).toBe(5);
});
test('adicionar viagens realizadas importa suas fotos ao salvar a trip', async ({ page }) => {
  const { cloud } = await setup(page);
  await page.locator('#trips-button').click(); await page.locator('#trip-new').click(); await page.locator('#trip-name').fill('Viagens com fotos'); await page.locator('#trip-add-completed').click();
  await expect(page.locator('#completed-photos')).toBeChecked(); await page.locator('#completed-list input').check(); await page.locator('#completed-add').click();
  await page.locator('#trip-save').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(1);
  expect(cloud.trips[0].stops[0].sourceDestinationId).toBe('my-review'); expect(cloud.tripPhotos).toHaveLength(1);
  expect(cloud.tripPhotos[0]).toMatchObject({stop_id:cloud.trips[0].stops[0].id,location_set:true});
  await page.locator('[data-photo-stop]').selectOption(''); await expect.poll(()=>cloud.tripPhotos[0].stop_id).toBeNull();
  await page.locator('#trip-back').click(); await page.locator('.trip-card').click(); await expect(page.locator('[data-photo-stop]')).toHaveValue('');
  expect(cloud.tripPhotos[0].location_set).toBe(true);
  await page.locator('#trip-view').click(); await expect(page.locator('[data-view-extra] .trip-view-photo')).toHaveCount(1); await expect(page.locator('.trip-memory-card .trip-view-photo')).toHaveCount(0);
});
test('resposta perdida retoma a importação sem duplicar fotos nem transferências concluídas', async ({ page }) => {
  const { cloud } = await setup(page); await create(page);
  let lost = true; await page.route('**/rpc/atlas_add_trip_photo', async route => {
    if (!lost) return route.fallback(); lost = false; const body = route.request().postDataJSON();
    cloud.tripPhotos.push({ id: body.p_id, trip_id: body.p_trip, uploader_id: cloud.trips[0].owner_id, storage_path: body.p_path, caption: body.p_caption }); await route.abort();
  });
  await pick(page); await expect(page.locator('[data-review-status]')).toContainText('tentar novamente');
  await page.locator('[data-review-import]').click(); await expect(page.locator('.review-photo-picker')).not.toBeVisible();
  expect(cloud.tripPhotos).toHaveLength(1); expect(cloud.requests.filter(r => r.path === '/storage/v1/object/copy')).toHaveLength(1);
});
test('revogação da permissão bloqueia importação sem publicar ou remover a foto original', async ({ page }) => {
  const { cloud } = await setup(page); await create(page); await page.locator('[data-import-reviews]').click(); await page.locator('[data-review-photo]').check();
  await page.route('**/storage/v1/object/copy', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"code":"42501"}' }));
  await page.locator('[data-review-import]').click(); await expect(page.locator('[data-review-status]')).toContainText('permissão');
  expect(cloud.tripPhotos).toHaveLength(0); expect(cloud.photos).toHaveLength(1); expect(cloud.objects.has(`atlas-media/${cloud.photos[0].storage_path}`)).toBe(true);
});

test('foto local ainda não sincronizada entra na trip e permanece na avaliação pendente', async ({ page }) => {
  const { cloud } = await setup(page);
  await page.evaluate(async () => {
    const db = await import('/src/db.js'), canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48; canvas.getContext('2d').fillRect(0, 0, 64, 48);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    const destination = db.sanitizeDestination({ id: 'local-review', name: 'Memória offline', lat: 40, lng: 2, visits: [{ id: 'local-visit', manualDays: 2, arrival: '', departure: '' }], tags: [], notes: '', rating: 4 }); destination.photoIds = ['local-photo']; destination.coverId = 'local-photo';
    await db.saveDestination(destination, [{ id: 'local-photo', destinationId: destination.id, blob, thumbnail: blob, caption: 'Foto ainda local' }]);
  });
  await create(page); await page.locator('[data-import-reviews]').click(); await page.locator('[data-review-destination]').selectOption('local-review');
  await page.locator('[data-review-photo]').check(); await page.locator('[data-review-import]').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(1);
  expect(cloud.tripPhotos[0].caption).toBe('Foto ainda local'); expect(cloud.posts.some(p => p.id === 'local-review')).toBe(false);
  const local = await page.evaluate(async () => { const db = await import('/src/db.js'); return { destination: (await db.getDestinations()).find(d => d.id === 'local-review'), hasOriginal: (await db.getPhoto('local-photo')).blob instanceof Blob }; });
  expect(local.destination.cloudDirty).toBe(true); expect(local.hasOriginal).toBe(true);
});
test('trocar de conta durante uma cópia interrompe a importação antes de compartilhar a mídia', async ({ page }) => {
  const { cloud } = await setup(page); await create(page);
  let release, started = false; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/storage/v1/object/copy', async route => { started = true; await gate; return route.fallback(); });
  await pick(page); await expect.poll(() => started).toBe(true);
  await page.evaluate(async () => { const api = await import('/src/cloud.js'); await api.signOut(); await api.signIn('bob@example.com', 'password123'); });
  await expect.poll(() => page.evaluate(async () => (await import('/src/db.js')).currentAccountId())).toBe('10000000-0000-4000-8000-000000000002');
  release(); await expect(page.locator('#trips-dialog')).not.toBeVisible(); await page.waitForTimeout(300);
  expect(cloud.tripPhotos).toHaveLength(0); expect(cloud.requests.some(r => r.path.endsWith('/atlas_add_trip_photo'))).toBe(false);
});

test('seleciona todas por destino da trip, mantém escolhas entre lugares e ignora fotos já importadas e lugares futuros', async ({ page }) => {
  const { cloud, post } = await setup(page, ['image', 'image']);
  const places = [
    { id: 'spain', name: 'Espanha', lat: 40.4168, lng: -3.7038, photos: 2 },
    { id: 'italy', name: 'Itália', lat: 41.9028, lng: 12.4964, photos: 1 },
    { id: 'greece', name: 'Grécia', lat: 37.9838, lng: 23.7275, photos: 2 },
    { id: 'portugal', name: 'Portugal fora da trip', lat: 38.7223, lng: -9.1393, photos: 1 },
    { id: 'future', name: 'Visita futura', lat: 50, lng: 10, photos: 1, future: true },
  ];
  await page.evaluate(async places => {
    const db = await import('/src/db.js'), canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 40; canvas.getContext('2d').fillRect(0, 0, 60, 40);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    for (const place of places) {
      const photos = Array.from({ length: place.photos }, (_, index) => ({ id: `${place.id}-${index}`, destinationId: place.id, blob, thumbnail: blob, caption: `${place.name} · foto ${index + 1}` }));
      const destination = db.sanitizeDestination({ ...place, rating: 5, notes: 'Avaliação original', tags: [], visits: [{ id: `${place.id}-visit`, arrival: place.future ? '2999-01-01' : '2024-05-01', departure: place.future ? '2999-01-02' : '2024-05-04' }] });
      destination.photoIds = photos.map(photo => photo.id); destination.coverId = photos[0].id; await db.saveDestination(destination, photos);
    }
  }, places);
  const trip = { id: '50000000-0000-4000-8000-000000000010', owner_id: post.owner_id, revision: '50000000-0000-4000-8000-000000000011', name: 'Espanha, Itália e Grécia', is_public: false, notes: '', stops: [
    { id: 's1', name: 'Espanha', lat: 40, lng: -3, completed: true, sourceDestinationId: 'spain', sourceVisitId: 'spain-visit', date: '2024-05-01', departure: '2024-05-04' },
    { id: 's2', name: 'Itália', lat: 41.9028, lng: 12.4964, date: '', notes: '' },
    { id: 's3', name: 'Grécia', lat: 37.9838, lng: 23.7275, completed: true, sourceDestinationId: 'greece', date: '', notes: '' },
    { id: 's4', name: 'Visita futura', lat: 50, lng: 10, date: '2999-01-01', notes: '' },
  ] };
  cloud.trips.push(trip);
  const copiedID = await page.evaluate(async ({ owner, trip }) => (await import('/src/trip-media-import.js')).importedPhotoId(owner, trip, { id: 'spain-0', destinationId: 'spain' }), { owner: post.owner_id, trip: trip.id });
  const copyPath = `${post.owner_id}/${trip.id}/${copiedID}.jpg`;
  cloud.tripPhotos.push({ id: copiedID, trip_id: trip.id, uploader_id: post.owner_id, storage_path: copyPath, caption: 'Espanha · foto 1' });
  cloud.objects.set(`atlas-trip-media/${copyPath}`, cloud.objects.get(`atlas-media/${cloud.photos[0].storage_path}`));
  await page.locator('#trips-button').click(); await page.getByRole('button', { name: /Espanha, Itália e Grécia/ }).click();
  await expect(page.locator('.trip-gallery figure')).toHaveCount(1); await expect.poll(()=>cloud.tripPhotos[0].stop_id).toBe('s1'); await page.locator('[data-import-reviews]').click();
  const select = page.locator('[data-review-destination]'); await expect(select).toHaveValue('__trip__');
  await expect(page.locator('[data-review-photo]')).toHaveCount(5);
  await expect(page.locator('optgroup[label="Destinos desta trip"] option')).toHaveText(['Espanha', 'Grécia', 'Itália']);
  await expect(page.locator('[data-review-photo="spain-0"]')).toBeDisabled();
  await select.selectOption('spain'); await page.getByRole('button', { name: 'Selecionar todas deste lugar' }).click();
  await expect(page.locator('[data-review-photo="spain-1"]')).toBeChecked(); await expect(page.locator('[data-review-photo="spain-0"]')).not.toBeChecked();
  await expect(page.locator('[data-review-status]')).toHaveText('1 selecionada no total');
  await select.selectOption('italy'); await page.getByRole('button', { name: 'Selecionar todas deste lugar' }).click();
  await select.selectOption('greece'); await page.getByRole('button', { name: 'Selecionar todas deste lugar' }).click();
  await expect(page.locator('[data-review-status]')).toHaveText('4 selecionadas no total');
  await select.selectOption('spain'); await page.getByRole('button', { name: 'Desmarcar deste lugar' }).click();
  await expect(page.locator('[data-review-status]')).toHaveText('3 selecionadas no total');
  await select.selectOption('greece'); for (const input of await page.locator('[data-review-photo]').all()) await expect(input).toBeChecked();
  await select.selectOption('__trip__'); await page.getByRole('button', { name: 'Selecionar todas da trip' }).click();
  await expect(page.locator('[data-review-select-all]')).toBeDisabled(); await expect(page.locator('[data-review-status]')).toHaveText('4 selecionadas no total');
  await page.locator('[data-review-import]').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(5);
  expect(cloud.tripPhotos.map(photo => photo.caption).sort()).toEqual(['Espanha · foto 1', 'Espanha · foto 2', 'Grécia · foto 1', 'Grécia · foto 2', 'Itália · foto 1'].sort());
  await page.locator('[data-import-reviews]').click(); await expect(select).toHaveValue('__trip__');
  for (const input of await page.locator('[data-review-photo]').all()) await expect(input).toBeDisabled();
  await expect(page.locator('[data-review-select-all]')).toBeDisabled(); await expect(page.locator('[data-review-import]')).toBeDisabled();
  const original = await page.evaluate(async () => { const db = await import('/src/db.js'); return { rating: (await db.getDestinations()).find(destination => destination.id === 'spain').rating, photo: (await db.getPhoto('spain-1')).blob instanceof Blob }; });
  expect(original).toEqual({ rating: 5, photo: true });
});
