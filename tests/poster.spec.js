import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mockCloud, ALICE } from './cloud-fixture.js';
test.use({ serviceWorkers: 'block' });

async function setup(page, premium = false) {
  const cloud = await mockCloud(page);
  if (premium) cloud.premium.push({ user_id: ALICE, expires_at: null });
  cloud.addPost('paris', 'Paris');
  cloud.addPost('home', 'Casa').data.kind = 'home';
  cloud.addPost('future', 'Futuro').data.visits = [{ arrival: '2099-01-01', departure: '2099-01-03' }];
  await page.goto('/'); await expect(page.locator('#poster-button')).toBeEnabled();
  return cloud;
}
async function login(page) {
  await page.locator('#login-button').click();
  await page.getByLabel('E-mail', { exact: true }).fill('alice@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('password123');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible();
  await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function open(page) {
  await page.locator('#poster-button').click();
  await expect(page.locator('#poster-dialog')).toBeVisible();
}

test('premium de teste exige conta habilitada, sem depender do nome de usuário', async ({ page }) => {
  const cloud = await setup(page);
  await open(page);
  await expect(page.locator('#poster-login')).toBeVisible();
  await expect(page.locator('#poster-form')).not.toBeVisible();
  await page.locator('#poster-login').click();
  await page.getByLabel('E-mail', { exact: true }).fill('alice@example.com');
  await page.getByLabel('Senha', { exact: true }).fill('password123');
  cloud.profiles[0].username = 'muriloatlas';
  await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-dialog')).not.toBeVisible();
  await expect(page.locator('#poster-button')).toBeEnabled();
  await open(page);
  await expect(page.locator('#poster-status')).toContainText('apenas para contas habilitadas');
  await expect(page.locator('#poster-form')).not.toBeVisible();
  cloud.premium.push({ user_id: ALICE, expires_at: '2020-01-01T00:00:00Z' });
  await page.locator('#poster-retry').click();
  await expect(page.locator('#poster-status')).toContainText('apenas para contas habilitadas');
});

test('pôster SVG usa tamanho físico, escapa o título e inclui apenas memórias visitadas', async ({ page }) => {
  await setup(page, true); await login(page); await open(page);
  await expect(page.locator('#poster-preview')).toBeVisible();
  await page.locator('#poster-title').fill('<script>alert("x")</script> & meu atlas');
  await page.locator('#poster-size').selectOption('a4');
  await page.locator('#poster-theme').selectOption('dark');
  await page.locator('#poster-format').selectOption('svg');
  const downloaded = page.waitForEvent('download'); await page.locator('#poster-download').click();
  const file = await downloaded, svg = await readFile(await file.path(), 'utf8');
  expect(file.suggestedFilename()).toBe('atlas-poster-a4.svg');
  expect(svg).toContain('width="297mm" height="210mm"');
  expect(svg).toContain('&lt;script&gt;'); expect(svg).not.toContain('<script>');
  expect(svg).toContain('fill="#101c18"');
  expect(svg.match(/data-place="visited"/g)).toHaveLength(1);
  expect(svg).toContain('1 lugar visitado · 1 país');
  expect(svg).toContain('Natural Earth'); expect(svg).not.toMatch(/<image|https?:\/\/.*supabase/);
  await expect(page.locator('#poster-status')).toContainText('Pôster baixado');
});

test('PNG A3 tem resolução de impressão e metadados reais de 300 dpi', async ({ page }) => {
  await setup(page, true); await login(page); await open(page);
  await expect(page.locator('#poster-download')).toBeEnabled();
  const downloaded = page.waitForEvent('download'); await page.locator('#poster-download').click();
  const file = await downloaded, png = await readFile(await file.path());
  expect(file.suggestedFilename()).toBe('atlas-poster-a3.png');
  expect(png.readUInt32BE(16)).toBe(4961); expect(png.readUInt32BE(20)).toBe(3508);
  let densities = 0;
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'pHYs') { densities++; expect(png.readUInt32BE(offset + 8)).toBe(11811); expect(png.readUInt32BE(offset + 12)).toBe(11811); expect(png[offset + 16]).toBe(1); }
    offset += length + 12;
  }
  expect(densities).toBe(1);
  const pixels = await page.evaluate(async base64 => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = 4961; canvas.height = 3508;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return [ctx.getImageData(1, 1, 1, 1).data[3], ctx.getImageData(2480, 1754, 1, 1).data[3]];
  }, png.toString('base64'));
  expect(pixels).toEqual([255, 255]);
});

test('revogação e falha de conexão bloqueiam download e permitem verificar novamente', async ({ page }) => {
  const cloud = await setup(page, true); await login(page); await open(page);
  await expect(page.locator('#poster-download')).toBeEnabled();
  let downloads = 0; page.on('download', () => downloads++);
  cloud.premium = [];
  await page.locator('#poster-download').click();
  await expect(page.locator('#poster-status')).toContainText('não está ativo'); expect(downloads).toBe(0);
  cloud.failed = true; await page.locator('#poster-retry').click();
  await expect(page.locator('#poster-status')).toContainText('Confira sua conexão');
  await expect(page.locator('#poster-form')).not.toBeVisible();
  cloud.failed = false; cloud.premium.push({ user_id: ALICE, expires_at: null });
  await page.locator('#poster-retry').click();
  await expect(page.locator('#poster-preview')).toBeVisible();
  await page.locator('#poster-close').click();
  await page.locator('#account-button').click();
  await expect(page.locator('#premium-status')).toContainText('teste ativo');
  await page.locator('#logout-button').click(); await expect(page.locator('#login-button')).toBeVisible();
  await open(page); await expect(page.locator('#poster-login')).toBeVisible();
  await expect(page.locator('#poster-preview')).not.toBeVisible();
});

test('coleção vazia não exporta e perfil público não exibe ação de pôster', async ({ page }) => {
  const cloud = await setup(page, true); cloud.posts = [];
  await login(page); await open(page);
  await expect(page.locator('#poster-status')).toContainText('Adicione um lugar visitado');
  await expect(page.locator('#poster-download')).toBeDisabled();
  await page.locator('#poster-close').click();
  await page.evaluate(() => { location.hash = '/perfil/bob'; });
  await expect(page.locator('#public-profile-header')).toBeVisible();
  await expect(page.locator('#poster-button')).not.toBeVisible();
});
