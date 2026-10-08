import { test, expect } from '@playwright/test';
import { mockCloud, ALICE, BOB } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });
async function ready(page) { await page.goto('/'); await expect(page.locator('.destination-card')).toHaveCount(5); }
async function login(page, email = 'alice@example.com') {
  await page.getByRole('button', { name: 'Entrar / Criar conta' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill(email); await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible();
  await expect(page.locator('#account-button')).toBeVisible();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function addTrip(page, name, { photos = false, visibility = 'private' } = {}) {
  await page.locator('#add-button').click();
  await page.getByLabel('Nome do destino').fill(name); await page.getByLabel('Latitude', { exact: true }).fill('48.8566'); await page.getByLabel('Longitude', { exact: true }).fill('2.3522');
  await page.locator('#visibility').selectOption(visibility);
  if (photos) {
    const image = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 40; c.getContext('2d').fillRect(0, 0, 60, 40); return c.toDataURL().split(',')[1]; });
    await page.locator('#photo-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await expect(page.locator('.photo-edit-card')).toHaveCount(1);
  }
  await page.locator('#save-button').click(); await expect(page.locator('#editor-dialog')).not.toBeVisible();
}
async function logout(page) {
  await page.locator('#account-button').click(); await page.locator('#logout-button').click();
  await expect(page.locator('#account-dialog')).not.toBeVisible(); await expect(page.locator('#login-button')).toBeVisible();
}

test('login, erros de senha, cadastro por e-mail e recuperação', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page);
  await page.locator('#login-button').click();
  await page.getByLabel('E-mail', { exact: true }).fill('alice@example.com'); await page.getByLabel('Senha', { exact: true }).fill('incorreta');
  await page.locator('#auth-submit').click(); await expect(page.locator('#auth-message')).toHaveText('E-mail ou senha incorretos.');
  await page.getByRole('button', { name: 'Criar uma conta', exact: true }).click();
  await page.getByLabel('Seu nome').fill('Alice'); await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.locator('#auth-submit').click(); await expect(page.locator('#auth-message')).toContainText('Confira seu e-mail');
  await page.getByRole('button', { name: 'Já tenho uma conta' }).click();
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await page.locator('#auth-submit').click(); await expect(page.locator('#auth-message')).toContainText('Se houver uma conta');
  expect(cloud.recoveries).toBe(1);
});

test('perfil pessoal, usuário exclusivo, bio, avatar e privacidade do perfil', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); await login(page);
  await page.locator('#account-button').click();
  await page.getByLabel('Nome do perfil', { exact: true }).fill('Alice pelo mundo');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('bob');
  await page.locator('#profile-save').click(); await expect(page.locator('#profile-message')).toContainText('já está em uso');
  await page.getByLabel('Nome de usuário', { exact: true }).fill('alice_viagens');
  await page.getByLabel('Sobre você').fill('Arte e caminhos tranquilos.');
  const avatar = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 80; c.height = 80; c.getContext('2d').fillRect(0, 0, 80, 80); return c.toDataURL().split(',')[1]; });
  await page.locator('#avatar-input').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(avatar, 'base64') });
  await page.locator('#profile-public').uncheck(); await page.locator('#profile-save').click();
  await expect(page.locator('#profile-message')).toHaveText('Perfil salvo.');
  expect(cloud.profiles[0]).toMatchObject({ username: 'alice_viagens', display_name: 'Alice pelo mundo', is_public: false, bio: 'Arte e caminhos tranquilos.' });
  expect(cloud.profiles[0].avatar_path).toMatch(new RegExp(`^${ALICE}/`));
  await page.locator('#my-public-profile').click(); await expect(page.locator('#toast')).toContainText('Ative a opção');
});

test('postagens e fotos sincronizam, atualizam, ficam privadas por padrão e são excluídas', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); await login(page);
  await expect(page.locator('.destination-card')).toHaveCount(0);
  await addTrip(page, 'Paris na conta', { photos: true });
  await expect.poll(() => cloud.posts.length).toBe(1); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  expect(cloud.posts[0].owner_id).toBe(ALICE); expect(cloud.posts[0].visibility).toBe('private'); expect(cloud.photos).toHaveLength(1);
  expect(cloud.objects.size).toBe(2);
  await page.getByRole('button', { name: 'Editar destino', exact: true }).click();
  await page.locator('#visibility').selectOption('public'); await page.getByLabel('Notas', { exact: true }).fill('Uma viagem pública.');
  await page.locator('#save-button').click(); await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await expect.poll(() => cloud.posts[0].visibility).toBe('public'); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  expect(cloud.objects.size).toBe(2); // Caption/metadata edit reuses existing immutable images.
  await page.reload(); await expect(page.getByRole('button', { name: 'Abrir destino Paris na conta' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir destino Paris na conta' }).click(); await expect(page.locator('.detail-gallery button')).toHaveCount(1);
  await page.getByRole('button', { name: 'Excluir destino', exact: true }).click(); await page.locator('#confirm-ok').click();
  await expect.poll(() => cloud.posts.length).toBe(0); await expect.poll(() => cloud.objects.size).toBe(0);
});

test('busca outros perfis, mostra só postagens públicas e impede edição de visitantes', async ({ page }) => {
  const cloud = await mockCloud(page); cloud.addPost('public-alice', 'Paris pública', ALICE, 'public'); cloud.addPost('private-alice', 'Paris privada');
  await ready(page);
  await page.locator('#explore-button').click(); await page.getByLabel('Buscar nome de usuário').fill('ali');
  await page.getByRole('button', { name: /Alice Viajante/ }).click();
  await expect(page.locator('#public-profile-header')).toContainText('Alice Viajante');
  await expect(page.locator('.destination-card')).toHaveCount(1); await expect(page.locator('.destination-card')).toContainText('Paris pública');
  await expect(page.locator('#add-button')).not.toBeVisible();
  await page.locator('.destination-card').click(); await expect(page.getByRole('button', { name: 'Editar destino', exact: true })).toHaveCount(0);
  await page.locator('#home-atlas').click(); await expect(page.locator('.destination-card')).toHaveCount(5);
  expect(cloud.requests.filter((r) => r.path.includes('/rpc/'))).toHaveLength(0);
});

test('migração mantém a coleção local, ignora exemplos e não duplica', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page);
  await page.locator('#add-button').click(); await page.getByLabel('Nome do destino').fill('Minha viagem local');
  await page.getByLabel('Latitude', { exact: true }).fill('48.8566'); await page.getByLabel('Longitude', { exact: true }).fill('2.3522');
  await page.locator('#save-button').click(); await expect(page.locator('#editor-dialog')).not.toBeVisible();
  await login(page);
  await page.locator('#account-button').click();
  for (let i = 0; i < 2; i++) {
    await page.locator('#migrate-button').click(); await page.locator('#confirm-ok').click();
    await expect(page.locator('#account-sync-message')).toHaveText('Tudo salvo na sua conta.');
    await expect.poll(() => cloud.posts.length).toBe(1);
  }
  expect(cloud.posts[0].visibility).toBe('private');
  await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
  await expect(page.locator('.destination-card')).toHaveCount(6);
});

test('contas separadas, restauração em outro navegador e logout limpa a cópia privada', async ({ page, browser }) => {
  const cloud = await mockCloud(page); cloud.addPost('private-alice', 'Somente Alice').data.notes = 'Nota privada da Alice'; cloud.addPost('private-bob', 'Somente Bruno', BOB);
  await ready(page); await login(page); await expect(page.locator('.destination-card')).toHaveCount(1); await expect(page.locator('.destination-card')).toContainText('Somente Alice');
  await page.locator('.destination-card').click(); await page.getByRole('button', { name: 'Editar destino', exact: true }).click();
  await expect(page.locator('#notes')).toHaveValue('Nota privada da Alice'); await page.locator('#editor-cancel').click();
  await logout(page); await expect(page.locator('.destination-card')).toHaveCount(5);
  await expect(page.locator('#notes')).toHaveValue(''); await expect(page.locator('#profile-username')).toHaveValue('');
  const databases = await page.evaluate(() => indexedDB.databases()); expect(databases.map((d) => d.name)).not.toContain(`atlas-pessoal-account-${ALICE}`);
  await login(page, 'bob@example.com'); await expect(page.locator('.destination-card')).toHaveCount(1); await expect(page.locator('.destination-card')).toContainText('Somente Bruno');
  // A fresh context has no local travel data: everything comes from the account API.
  const context = await browser.newContext({ serviceWorkers: 'block' }); const other = await context.newPage();
  const secondCloud = await mockCloud(other); secondCloud.posts = cloud.posts;
  await other.goto('http://127.0.0.1:8000/'); await expect(other.locator('.destination-card')).toHaveCount(5);
  await login(other); await expect(other.locator('.destination-card')).toContainText('Somente Alice');
  await context.close();
});

test('falha de rede preserva alterações pendentes e depois sincroniza', async ({ page }) => {
  const cloud = await mockCloud(page); await ready(page); await login(page); cloud.failed = true;
  await addTrip(page, 'Viagem sem rede');
  await expect(page.locator('#sync-status')).toContainText('Sem conexão'); expect(cloud.posts).toHaveLength(0);
  await page.reload(); await expect(page.locator('.destination-card')).toHaveCount(1); await expect(page.locator('.destination-card')).toContainText('Viagem sem rede');
  cloud.failed = false; await page.locator('#account-button').click(); await page.locator('#sync-button').click();
  await expect(page.locator('#account-sync-message')).toHaveText('Tudo salvo na sua conta.'); expect(cloud.posts).toHaveLength(1);
});

test('conflitos entre dispositivos preservam a versão local até escolha explícita', async ({ page }) => {
  const cloud = await mockCloud(page); const remote = cloud.addPost('conflict-post', 'Viagem original'); await ready(page); await login(page);
  remote.revision = '20000000-0000-4000-8000-000000000001'; remote.data.notes = 'Alteração em outro aparelho';
  await page.locator('.destination-card').click(); await page.getByRole('button', { name: 'Editar destino', exact: true }).click();
  await page.getByLabel('Notas', { exact: true }).fill('Minha alteração local'); await page.locator('#save-button').click();
  await expect(page.locator('#sync-status')).toContainText('outro dispositivo');
  expect(remote.data.notes).toBe('Alteração em outro aparelho'); await expect(page.locator('#detail-panel')).toContainText('Minha alteração local');
  await page.locator('#account-button').click(); await page.locator('#cloud-reload-button').click(); await page.locator('#confirm-ok').click();
  await expect(page.locator('#account-sync-message')).toHaveText('Tudo salvo na sua conta.');
  await page.getByRole('button', { name: 'Fechar perfil' }).click();
  await expect(page.locator('#detail-panel')).toContainText('Alteração em outro aparelho');
});

test('link de recuperação valida a sessão, remove tokens do endereço e atualiza senha', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.goto(`/#access_token=token-${ALICE}&refresh_token=refresh-${ALICE}&expires_in=3600&type=recovery`);
  await expect(page.locator('#auth-title')).toHaveText('Escolher nova senha'); expect(page.url()).not.toContain('access_token');
  await page.getByLabel('Senha', { exact: true }).fill('novaSenha123'); await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible(); expect(cloud.changedPassword).toBe('novaSenha123');
});

test('renova sessão expirada sem misturar contas ou perder a coleção', async ({ page }) => {
  const cloud = await mockCloud(page); cloud.addPost('renew-post', 'Viagem preservada'); await ready(page); await login(page);
  await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open('atlas-auth'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('session', 'readwrite'), store = tx.objectStore('session');
    await new Promise((resolve) => { const request = store.get('current'); request.onsuccess = () => { store.put({ ...request.result, expires_at: 1 }, 'current'); }; tx.oncomplete = resolve; });
    db.close();
  });
  await page.reload(); await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
  await expect(page.locator('.destination-card')).toContainText('Viagem preservada'); expect(cloud.refreshes).toBe(1);
});
