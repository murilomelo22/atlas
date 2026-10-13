import { test, expect } from '@playwright/test';
import { tripViewFixture,loginForTrip,logoutForTrip } from './trip-view-fixture.js';
import { ALICE,BOB } from './cloud-fixture.js';
test.use({serviceWorkers:'block'});

test('link abre uma visualização cronológica com rota, fotos por lugar e vídeo só ao clicar',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`/#/roteiro/${trip.id}`);await expect(page.locator('#trip-view-title')).toHaveText(trip.name);
  await expect(page.locator('.trip-memory-card h3')).toHaveText(['Madri','Roma','Atenas','Lisboa']);
  await expect(page.locator('.trip-route-marker')).toHaveCount(4);await expect(page.locator('.trip-route-direction')).toHaveCount(3);
  await page.locator('[data-memory-stop="0"] .trip-view-photo').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-memory-stop="0"] .trip-view-photo img')).toBeVisible();
  const pin=page.locator('.trip-route-marker[title="1. Madri"] .trip-route-pin'); await expect(pin.locator('img')).toBeVisible(); await expect(pin.locator('svg')).toHaveCount(0);
  expect(await pin.evaluate(element=>element.querySelector('img').getBoundingClientRect().width<=element.getBoundingClientRect().width)).toBe(true);
  await expect(page.locator('[data-memory-stop="0"] .trip-memory-notes')).toContainText('<img src=x');await expect(page.locator('.trip-memory-notes img')).toHaveCount(0);
  await expect(page.locator('[data-view-extra]')).toContainText('Mais memórias da trip');
  await expect(page.locator('[data-memory-stop="3"]')).toContainText('Sem data');
  expect(cloud.requests.filter(request=>request.method==='GET'&&request.path.includes('/object/sign/atlas-trip-media/')&&request.path.endsWith('.mp4'))).toHaveLength(0);
  await page.locator('[data-memory-stop="1"] .trip-view-photo').click();await expect(page.locator('#gallery-dialog video')).toBeVisible();
  await expect.poll(()=>cloud.requests.filter(request=>request.method==='GET'&&request.path.endsWith('.mp4')).length).toBeGreaterThan(0);
  await page.locator('[data-gallery-close]').click();await page.locator('.trip-route-marker[title="3. Atenas"]').click();await expect(page.locator('[data-memory-stop="2"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-view-manage]')).not.toBeVisible();await expect(page.locator('[data-trip-photo]')).toHaveCount(0);
  await expect(page.locator('#trip-view-dialog')).not.toContainText('SEGREDO DA AVALIAÇÃO PESSOAL');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#trip-view-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);expect(errors).toEqual([]);
});

test('salvar e pedir participação exigem conta; confirmação de email mantém pedido sem envio',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page);await page.goto(`/#/roteiro/${trip.id}`);await expect(page.locator('[data-view-save]')).toBeVisible();
  await page.locator('[data-view-save]').click();await expect(page.locator('#auth-title')).toHaveText('Criar sua conta');
  await page.locator('#signup-name').fill('Familiar');await page.locator('#auth-email').fill('familiar@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();
  await expect(page.locator('#auth-message')).toContainText('Confira seu e-mail');expect(cloud.saves).toHaveLength(0);expect(cloud.joinRequests).toHaveLength(0);
  await page.locator('[data-close-dialog="auth-dialog"]').click();await page.locator('[data-view-join]').click();await expect(page.locator('#auth-title')).toHaveText('Criar sua conta');
  expect(cloud.requests.some(request=>request.path.endsWith('atlas_request_trip_join'))).toBe(false);
});

test('entrar pelo link mantém a trip e permite salvar na coleção sem obter edição',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page);cloud.profiles.find(profile=>profile.id===BOB).is_public=false;
  await page.goto(`/#/roteiro/${trip.id}`);await page.locator('[data-view-signin]').click();await page.locator('#auth-email').fill('bob@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();
  await expect(page.locator('#trip-view-title')).toHaveText(trip.name);await expect(page).toHaveURL(new RegExp(`#/roteiro/${trip.id}$`));
  await page.locator('[data-view-save]').click();await expect(page.locator('[data-view-save]')).toHaveText('✓ Salva na minha coleção');expect(cloud.saves).toEqual([{trip_id:trip.id,user_id:BOB}]);
  await expect(page.locator('[data-view-manage]')).not.toBeVisible();await page.locator('[data-view-close]').click();await page.locator('#trips-button').click();await expect(page.locator('.trip-card')).toContainText('Salva na sua coleção');
  await page.locator('.trip-card').click();await expect(page.locator('#trip-view-title')).toHaveText(trip.name);await expect(page.locator('#trip-form')).toHaveCount(0);
  await page.locator('[data-view-save]').click();await expect(page.locator('[data-view-save]')).toHaveText('Salvar na minha coleção');expect(cloud.saves).toHaveLength(0);
});

test('organizador aprova pedido e mantém edição e fotos sob suas permissões',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page);await loginForTrip(page,'bob@example.com');await page.goto(`/#/roteiro/${trip.id}`);
  await page.locator('[data-view-join]').click();await expect(page.locator('[data-view-join]')).toHaveText('Pedido enviado');await expect(page.locator('[data-view-join]')).toBeDisabled();expect(cloud.members).toHaveLength(0);
  await page.locator('[data-view-refresh]').click();await expect(page.locator('[data-view-join]')).toHaveText('Pedido enviado');expect(cloud.joinRequests).toHaveLength(1);
  await logoutForTrip(page);await loginForTrip(page);await page.locator('#trips-button').click();await page.locator('.trip-card').click();await expect(page.locator('.trip-join-request')).toContainText('Bruno');
  await page.locator('[data-approve-request]').click();await expect(page.locator('#trip-message')).toContainText('Pedido aprovado');expect(cloud.members[0]).toMatchObject({user_id:BOB,status:'accepted',can_edit_itinerary:false,can_add_photos:false});
  await expect(page.locator('[data-person] [data-permission="add_photos"]')).not.toBeChecked();
  await logoutForTrip(page);await loginForTrip(page,'bob@example.com');await page.locator('#trips-button').click();await page.locator('.trip-card').click();await expect(page.locator('#trip-save')).not.toBeVisible();await expect(page.locator('[data-trip-photo]')).toHaveCount(0);
  await page.locator('#trip-view').click();await expect(page.locator('[data-view-membership]')).toContainText('Você participa');await expect(page.locator('[data-view-join]')).not.toBeVisible();
});

test('link de trip privada só é publicado após ação do organizador; visitantes perdem acesso quando volta a ser privada',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page,{publicly:false});await loginForTrip(page);await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('#trip-view').click();
  await page.locator('[data-view-share]').click();await expect(page.locator('#confirm-dialog')).toBeVisible();expect(trip.is_public).toBe(false);await page.locator('#confirm-cancel').click();await expect(page.locator('#confirm-dialog')).not.toBeVisible();expect(cloud.trips[0].is_public).toBe(false);
  await page.locator('[data-view-share]').click();await page.locator('#confirm-ok').click();await expect(page.locator('#share-text')).toHaveValue(new RegExp(`#/roteiro/${trip.id}`));expect(cloud.trips[0].is_public).toBe(true);
  await page.getByRole('button',{name:'Fechar compartilhamento'}).click();await logoutForTrip(page);await page.goto(`/#/roteiro/${trip.id}`);await expect(page.locator('#trip-view-title')).toHaveText(trip.name);
  cloud.trips[0].is_public=false;await page.reload();await expect(page.locator('#toast')).toContainText('não tem acesso');await expect(page.locator('#trip-view-dialog')).not.toBeVisible();await expect(page.locator('.trip-view-photo')).toHaveCount(0);
});

test('trocar de conta apaga a visualização privada anterior e não reutiliza seus detalhes',async({page})=>{
  const {trip}=await tripViewFixture(page,{publicly:false});trip.notes='DETALHES PRIVADOS DA ALICE';await loginForTrip(page);await page.goto(`/#/roteiro/${trip.id}`);await expect(page.locator('#trip-view-dialog')).toContainText('DETALHES PRIVADOS DA ALICE');
  await page.evaluate(async()=>{const api=await import('/src/cloud.js');await api.signOut();await api.signIn('bob@example.com','password123');});
  await expect(page.locator('#trip-view-dialog')).not.toContainText('DETALHES PRIVADOS DA ALICE');await expect(page.locator('#trip-view-dialog')).not.toBeVisible();await expect(page.locator('.trip-view-photo')).toHaveCount(0);
});

test('visualizar alterações ainda não salvas preserva o formulário e orienta salvar primeiro',async({page})=>{
  await tripViewFixture(page);await loginForTrip(page);await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('#trip-notes').fill('Minhas alterações ainda não salvas');
  await page.locator('#trip-view').click();await expect(page.locator('#trip-message')).toContainText('Salve suas alterações');await expect(page.locator('#trip-notes')).toHaveValue('Minhas alterações ainda não salvas');await expect(page.locator('#trip-view-dialog')).not.toBeVisible();
});


test('uma resposta de salvar atrasada não altera a coleção da conta seguinte',async({page})=>{
  const {cloud,trip}=await tripViewFixture(page);const next={...trip,id:'50000000-0000-4000-8000-000000000099',owner_id:BOB,name:'Trip do Bruno'};cloud.trips.push(next);
  await loginForTrip(page,'bob@example.com');await page.goto(`/#/roteiro/${trip.id}`);
  let release,started=false,answered=false;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/rpc/atlas_save_trip_link',async route=>{if(started)return route.fallback();started=true;await gate;await route.fulfill({contentType:'application/json',body:'true'});answered=true;});
  await page.locator('[data-view-save]').click();await expect.poll(()=>started).toBe(true);
  await page.evaluate(async()=>{const api=await import('/src/cloud.js');await api.signOut();await api.signIn('alice@example.com','password123');});
  await page.goto(`/#/roteiro/${next.id}`);await expect(page.locator('#trip-view-title')).toHaveText(next.name);await expect(page.locator('[data-view-save]')).toHaveText('Salvar na minha coleção');
  release();await expect.poll(()=>answered).toBe(true);await page.locator('[data-view-save]').click();await expect(page.locator('[data-view-save]')).toHaveText('✓ Salva na minha coleção');
  expect(cloud.saves).toEqual([{trip_id:next.id,user_id:ALICE}]);
});
