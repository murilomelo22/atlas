import { test, expect } from '@playwright/test';
import { mockTrips } from './trips-fixture.js';
import { ALICE } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page, email = 'alice@example.com') {
  await page.locator('#login-button').click(); await page.locator('#auth-email').fill(email); await page.locator('#auth-password').fill('password123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible();
  if ((await page.evaluate(()=>location.hash)).startsWith('#/perfil/')) await page.locator('#home-atlas').click();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function logout(page) {
  if (await page.locator('#trips-dialog').isVisible()) await page.locator('#trips-close').click();
  await page.locator('#account-button').click(); await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
}
async function create(page, publicly = false) {
  await page.locator('#trips-button').click(); await page.locator('#trip-new').click(); await page.locator('#trip-name').fill('Férias em grupo'); await page.locator('#trip-add-stop').click();
  await page.locator('[data-stop-name]').fill('Paris'); await page.locator('[data-stop-lat]').fill('48.85'); await page.locator('[data-stop-lng]').fill('2.35');
  if (publicly) await page.locator('#trip-public').check(); await page.locator('#trip-save').click(); await expect(page.locator('#trip-invite-form')).toBeVisible();
}
async function invite(page, permissions) {
  await page.locator('#trip-invite-username').fill('bob');
  for (const key of permissions) await page.locator(`#trip-invite-permissions [data-permission="${key}"]`).check();
  await page.locator('#trip-invite-form').getByRole('button', { name: 'Enviar convite' }).click(); await expect(page.locator('#trip-people')).toContainText('@bob');
}
async function open(page) { await page.locator('#trips-button').click(); await page.locator('.trip-card').click(); }
async function accept(page) { await open(page); await page.locator('#trip-accept').click(); await expect(page.locator('#trip-accept')).toHaveCount(0); }
async function upload(page) {
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 60; c.getContext('2d').fillRect(0, 0, 80, 60); return c.toDataURL().split(',')[1]; });
  await page.locator('[data-trip-photo]').setInputFiles({ name: 'ferias.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('[data-trip-caption]').fill('Memória com amigos <img onerror="alert(1)">'); await page.getByRole('button', { name: 'Enviar mídia', exact: true }).click();
}

test('colaborador com fotos, sem editar roteiro; revogação e remoção pelo criador', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await create(page); await invite(page, ['add_photos']);
  await logout(page); await login(page, 'bob@example.com'); await accept(page);
  await expect(page.locator('#trip-name')).toBeDisabled(); await expect(page.locator('#trip-notes')).toBeDisabled(); await expect(page.locator('#trip-save')).not.toBeVisible();
  await upload(page); await expect(page.locator('.trip-gallery img')).toBeVisible(); await expect(page.locator('.trip-gallery figcaption')).toHaveText('Memória com amigos <img onerror="alert(1)">');
  expect(cloud.tripPhotos).toHaveLength(1); expect(cloud.trips[0].owner_id).toBe(ALICE);
  await logout(page); await login(page); await open(page); await page.locator('[data-person] [data-permission="add_photos"]').uncheck(); await page.locator('[data-save-person]').click();
  await expect(page.locator('#trip-message')).toHaveText('Permissões atualizadas.'); await logout(page); await login(page, 'bob@example.com'); await open(page);
  await expect(page.locator('[data-trip-photo]')).toHaveCount(0); await expect(page.locator('[data-delete-photo]')).toHaveCount(0); await expect(page.locator('.trip-gallery img')).toBeVisible();
  await logout(page); await login(page); await open(page); await page.locator('[data-delete-photo]').click(); await page.locator('#confirm-ok').click(); await expect(page.locator('.trip-gallery figure')).toHaveCount(0);
  expect(cloud.tripPhotos).toHaveLength(0);
});

test('descrições podem ser editadas com roteiro e capa bloqueados', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await create(page); await invite(page, ['edit_description']);
  await logout(page); await login(page, 'bob@example.com'); await accept(page);
  await expect(page.locator('#trip-name')).toBeDisabled(); await expect(page.locator('[data-stop-name]')).toBeDisabled(); await expect(page.locator('[data-stop-lat]')).toBeDisabled(); await expect(page.locator('#trip-add-stop')).not.toBeVisible();
  await expect(page.locator('#trip-cover')).toBeDisabled(); await page.locator('#trip-notes').fill('Descrição escrita pelo colaborador'); await page.locator('[data-stop-notes]').fill('Visitar os museus');
  await page.locator('#trip-save').click(); await expect(page.locator('#trip-notes')).toHaveValue('Descrição escrita pelo colaborador');
  expect(cloud.trips[0].notes).toBe('Descrição escrita pelo colaborador'); expect(cloud.trips[0].stops[0].notes).toBe('Visitar os museus'); expect(cloud.trips[0].name).toBe('Férias em grupo');
  await expect(page.locator('#trip-invite-form')).not.toBeVisible();
});

test('publicação autorizada no perfil e revogação sem copiar postagens privadas', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await create(page, true); await invite(page, ['publish_profile']);
  await logout(page); await login(page, 'bob@example.com'); await accept(page); await expect(page.locator('#trip-publish-profile')).toBeEnabled();
  await page.locator('#trip-publish-profile').click(); await expect(page.locator('#trip-publish-profile')).toHaveText('Retirar do meu perfil'); expect(cloud.publications).toHaveLength(1); expect(cloud.posts).toHaveLength(0);
  await page.locator('#trips-close').click(); await page.goto('/#/perfil/bob'); await expect(page.locator('.profile-trips')).toContainText('Férias em grupo');
  await page.locator('.profile-trips a').click(); await expect(page.locator('#trips-dialog')).toBeVisible(); await expect(page.locator('#trip-name')).toHaveValue('Férias em grupo'); await logout(page); await login(page); await open(page);
  await page.locator('[data-person] [data-permission="publish_profile"]').uncheck(); await page.locator('[data-save-person]').click(); await expect(page.locator('#trip-message')).toHaveText('Permissões atualizadas.');
  await logout(page); await page.goto('/#/perfil/bob'); await expect(page.locator('#public-profile-header')).toContainText('@bob'); await expect(page.locator('.profile-trips')).toHaveCount(0); expect(cloud.publications).toHaveLength(0);
});

test('trip privada bloqueia publicação; galeria pública respeita troca para privada', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await create(page); await invite(page, ['publish_profile']); await upload(page); await expect(page.locator('.trip-gallery img')).toBeVisible();
  await logout(page); await login(page, 'bob@example.com'); await accept(page); await expect(page.locator('#trip-publish-profile')).toBeDisabled(); await expect(page.locator('#trip-publication-status')).toContainText('tornar o roteiro público');
  await logout(page); await login(page); await open(page); await page.locator('#trip-public').check(); await page.locator('#trip-save').click(); await expect(page.locator('.trip-gallery img')).toBeVisible();
  const id = cloud.trips[0].id; await logout(page); await page.goto(`/#/roteiro/${id}`); await expect(page.locator('.trip-gallery img')).toBeVisible(); await expect(page.locator('[data-trip-photo]')).toHaveCount(0); await expect(page.locator('#trip-members-section')).not.toBeVisible();
  cloud.trips[0].is_public = false; await page.reload(); await expect(page.locator('#toast')).toContainText('não tem acesso'); await expect(page.locator('.trip-gallery img')).toHaveCount(0);
});

test('resposta perdida ao adicionar foto permite tentar novamente sem duplicar', async ({ page }) => {
  const cloud = await mockTrips(page); await ready(page); await login(page); await create(page);
  let lost = false;
  await page.route('**/rpc/atlas_add_trip_photo', async route => {
    if (lost) return route.fallback(); lost = true; const body = route.request().postDataJSON();
    cloud.tripPhotos.push({ id: body.p_id, trip_id: body.p_trip, uploader_id: ALICE, storage_path: body.p_path, caption: body.p_caption }); await route.abort();
  });
  await upload(page); await expect(page.locator('#trip-message')).toContainText('Sem conexão'); await expect(page.locator('[data-trip-caption]')).toHaveValue('Memória com amigos <img onerror="alert(1)">');
  await page.getByRole('button', { name: 'Enviar mídia', exact: true }).click(); await expect(page.locator('.trip-gallery img')).toBeVisible(); expect(cloud.tripPhotos).toHaveLength(1);
});

test('mapa de calor por visitas/dias, privacidade e estilos locais sem tiles de terceiros', async ({ page }) => {
  const cloud = await mockTrips(page);
  const a = cloud.addPost('private', 'Paris privada'), b = cloud.addPost('public', 'Roma pública', ALICE, 'public');
  a.data.visits.push({ id: 'manual', arrival: '', departure: '', manualDays: 2 }); b.data.lat = 41.9; b.data.lng = 12.5;
  const home = cloud.addPost('home', 'Minha casa'); home.data.kind = 'home';
  cloud.addPost('future', 'Viagem futura').data.visits = [{ arrival: '2099-01-01', departure: '2099-01-04', manualDays: null }];
  const tiles = []; page.on('request', r => { if (/cartocdn|tile.openstreetmap/.test(r.url())) tiles.push(r.url()); });
  await ready(page); await page.locator('#heat-mode').selectOption('visits'); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-points', '0');
  await login(page); await page.locator('#fit-button').click(); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-points', '2'); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-weight', '3');
  await page.locator('#heat-mode').selectOption('days'); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-weight', '8');
  expect(await page.locator('.atlas-heatmap').evaluate(c => c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0))).toBe(true);
  await page.locator('#show-markers').uncheck(); await expect(page.locator('.atlas-heatmap')).toBeVisible();
  await page.locator('#map-style').selectOption('light'); await expect(page.locator('#map .leaflet-tile')).toHaveCount(0); await page.reload(); await expect(page.locator('#heat-mode')).toHaveValue('days'); await expect(page.locator('#map-style')).toHaveValue('light');
  await page.locator('#map-style').selectOption('offline'); await expect(page.locator('#map .leaflet-tile')).toHaveCount(0); expect(tiles).toHaveLength(0); await expect(page.locator('.leaflet-control-attribution')).toContainText('Natural Earth');
  await logout(page); await page.goto('/#/perfil/alice'); await expect(page.locator('#public-profile-header')).toContainText('@alice'); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-points', '1'); await expect(page.locator('.atlas-heatmap')).toHaveAttribute('data-weight', '3');
  await page.locator('#heat-mode').click({trial:true}); await page.locator('#heat-mode').selectOption('off'); await expect(page.locator('.atlas-heatmap')).toHaveCount(0); await expect(page.locator('#heat-legend')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
