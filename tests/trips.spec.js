import { test,expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mockTrips } from './trips-fixture.js';
import { ALICE, BOB } from './cloud-fixture.js';
test.use({serviceWorkers:'block'});
async function ready(page){await page.goto('/');await expect(page.locator('.destination-card')).toHaveCount(5);}
async function login(page,email='alice@example.com') {
 await page.locator('#login-button').click();await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');
}
async function logout(page){await page.locator('#account-button').click();await page.locator('#logout-button').click();await expect(page.locator('#login-button')).toBeVisible();}
async function newTrip(page,name='Itália em grupo') {
 await page.locator('#trips-button').click();await page.locator('#trip-new').click();await page.locator('#trip-name').fill(name);await page.locator('#trip-add-stop').click();
 const row=page.locator('.trip-stop').first();await row.locator('[data-stop-name]').fill('Roma');await row.locator('[data-stop-lat]').fill('41.9');await row.locator('[data-stop-lng]').fill('12.5');await row.locator('[data-stop-date]').fill('2026-11-01');
}
async function saveTrip(page){await page.locator('#trip-save').click();await expect(page.locator('#trip-message')).toHaveText('');await expect(page.locator('#trip-share')).toBeVisible();}

test('trip local, reordenação, persistência, exportação/importação e mapa',async({page})=>{
 await mockTrips(page);await ready(page);await newTrip(page,'Minha trip local');
 await page.locator('#trip-existing').selectOption('example-milao');await expect(page.locator('.trip-stop')).toHaveCount(2);
 await page.locator('.trip-stop').last().locator('[data-up]').click();await expect(page.locator('.trip-stop').first().locator('[data-stop-name]')).toHaveValue('Milão');
 await saveTrip(page);await page.reload();await page.locator('#trips-button').click();await page.getByRole('button',{name:'Minha trip local',exact:false}).click();await expect(page.locator('.trip-stop').first().locator('[data-stop-name]')).toHaveValue('Milão');
 const download=page.waitForEvent('download');await page.locator('#trip-export').click();const file=await (await download).path();
 await page.locator('#trip-back').click();await page.locator('#trip-file').setInputFiles(file);await expect(page.locator('#trip-name')).toHaveValue('Minha trip local');await saveTrip(page);
 await page.locator('#trip-map').click();await expect(page.locator('#trips-dialog')).not.toBeVisible();await expect(page.locator('#toast')).toContainText('Roteiro no mapa');
 await page.locator('#trips-button').click();await expect(page.locator('.trip-card')).toHaveCount(2);
});

test('grupo na nuvem, capa, convite, aceitação, edição e saída',async({page})=>{
 const cloud=await mockTrips(page);await ready(page);await login(page);await newTrip(page);
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=80;c.height=60;c.getContext('2d').fillRect(0,0,80,60);return c.toDataURL().split(',')[1];});
 await page.locator('#trip-cover').setInputFiles({name:'capa.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await saveTrip(page);
 expect(cloud.trips[0].is_public).toBe(false);expect(cloud.trips[0].owner_id).toBe(ALICE);expect(cloud.trips[0].cover_path).toContain(ALICE);await expect(page.locator('#trip-cover-preview img')).toBeVisible();
 await page.locator('#trip-invite-username').fill('bob');await page.locator('#trip-invite-role').selectOption('editor');await page.locator('#trip-invite-form').getByRole('button',{name:'Enviar convite'}).click();await expect(page.locator('#trip-people')).toContainText('@bob');
 await page.locator('#trips-close').click();await logout(page);await login(page,'bob@example.com');await page.locator('#trips-button').click();await page.locator('.trip-card').click();await expect(page.locator('#trip-save')).not.toBeVisible();await expect(page.locator('#trip-name')).toBeDisabled();
 await page.locator('#trip-accept').click();await expect(page.locator('#trip-save')).toBeVisible();await expect(page.locator('#trip-public')).toBeDisabled();await expect(page.locator('#trip-invite-form')).not.toBeVisible();
 await page.locator('#trip-name').fill('Trip editada por Bruno');await saveTrip(page);expect(cloud.trips[0].name).toBe('Trip editada por Bruno');
 await page.locator('#trip-leave').click();await page.locator('#confirm-ok').click();await expect(page.locator('.trip-card')).toHaveCount(0);expect(cloud.members).toHaveLength(0);
});

test('link público, WhatsApp e privacidade depois de retirar publicação',async({page})=>{
 const cloud=await mockTrips(page);await ready(page);await login(page);await newTrip(page,'Roteiro compartilhado');await page.locator('#trip-public').check();await saveTrip(page);
 const id=cloud.trips[0].id;await page.locator('#trip-share').click();await expect(page.locator('#share-text')).toHaveValue(new RegExp(`#/roteiro/${id}`));expect(await page.locator('#share-whatsapp').getAttribute('href')).toMatch(/^https:\/\/wa.me\/\?text=/);
 await page.getByRole('button',{name:'Fechar compartilhamento'}).click();await page.locator('#trips-close').click();await logout(page);await page.goto(`/#/roteiro/${id}`);
 await expect(page.locator('#trip-name')).toHaveValue('Roteiro compartilhado');await expect(page.locator('#trip-name')).toBeDisabled();await expect(page.locator('#trip-save')).not.toBeVisible();await expect(page.locator('#trip-members-section')).not.toBeVisible();
 cloud.trips[0].is_public=false;await page.reload();await expect(page.locator('#toast')).toContainText('não tem acesso');await expect(page.locator('#trips-dialog')).not.toBeVisible();
});

test('conflito e desconexão mantêm o formulário e exportação disponíveis',async({page})=>{
 const cloud=await mockTrips(page);await ready(page);await login(page);await newTrip(page);await saveTrip(page);
 const original=cloud.trips[0].name;cloud.trips[0].revision=randomUUID();await page.locator('#trip-name').fill('Minha edição pendente');await page.locator('#trip-save').click();await expect(page.locator('#trip-message')).toContainText('Outra pessoa alterou');expect(cloud.trips[0].name).toBe(original);await expect(page.locator('#trip-name')).toHaveValue('Minha edição pendente');
 const download=page.waitForEvent('download');await page.locator('#trip-export').click();await download;
 cloud.failed=true;await page.locator('#trip-save').click();await expect(page.locator('#trip-message')).toContainText('não foi enviado');await expect(page.locator('#trip-name')).toHaveValue('Minha edição pendente');
});

test('favoritas e fixadas sincronizam e aparecem no perfil público',async({page})=>{
 const cloud=await mockTrips(page);const a=cloud.addPost('a','Memória recente',ALICE,'public'),b=cloud.addPost('b','Destaque antigo',ALICE,'public');b.data.visits[0].arrival='2024-01-01';b.data.visits[0].departure='2024-01-02';
 await ready(page);await login(page);await page.getByRole('button',{name:'Abrir destino Destaque antigo'}).click();await page.getByRole('button',{name:'Editar destino'}).click();await page.locator('#destination-favorite').check();await page.locator('#destination-pinned').check();await page.locator('#save-button').click();
 await expect.poll(()=>cloud.posts.find(p=>p.id==='b').data.pinned).toBe(true);await page.getByRole('button',{name:'Meus destinos',exact:false}).click();await expect(page.locator('.destination-card').first()).toContainText('Destaque antigo');
 await logout(page);await page.goto('/#/perfil/alice');await expect(page.locator('.destination-card').first()).toContainText('Fixada');await expect(page.locator('.destination-card').first()).toContainText('Favorita');
});

test('resumos com sobreposição, virada de mês, comparação e exportações',async({page})=>{
 const cloud=await mockTrips(page);const a=cloud.addPost('a','Paris'),b=cloud.addPost('b','Roma');a.data.visits=[{arrival:'2025-01-30',departure:'2025-02-02',manualDays:null}];b.data.lat=41.9;b.data.lng=12.5;b.data.visits=[{arrival:'2025-02-01',departure:'2025-02-03',manualDays:null}];
 await ready(page);await login(page);await page.locator('#recap-button').click();await page.locator('#recap-year').fill('2025');await page.locator('#recap-month').selectOption('2');await expect(page.locator('.activity-cell')).toHaveCount(28);await expect(page.locator('.activity-cell.level-1,.activity-cell.level-2')).toHaveCount(3);await expect(page.locator('.recap-stats strong').nth(1)).toHaveText('3dias registrados');
 await page.locator('#recap-month').selectOption('0');await expect(page.locator('.activity-cell.level-1,.activity-cell.level-2')).toHaveCount(5);await expect(page.locator('.walking-comparison')).not.toContainText('0 dias');
 const image=page.waitForEvent('download');await page.locator('#recap-image').click();expect((await image).suggestedFilename()).toMatch(/\.svg$/);
 const csv=page.waitForEvent('download');await page.locator('#recap-csv').click();expect((await csv).suggestedFilename()).toMatch(/\.csv$/);
 await page.locator('#recap-share').click();await expect(page.locator('#share-text')).toHaveValue(/5 dias registrados/);
});

test('estilos de mapa persistem e modal de roteiro não transborda',async({page})=>{
 await mockTrips(page);await ready(page);await page.locator('#map-style').selectOption('light');await expect(page.locator('#map')).toHaveAttribute('data-style','light');await page.reload();await expect(page.locator('#map-style')).toHaveValue('light');await page.locator('#map-style').selectOption('offline');await expect(page.locator('#map .leaflet-tile')).toHaveCount(0);
 await newTrip(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#trips-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
});

test('convite de acompanhante, recusa, remoção e exclusão pelo organizador',async({page})=>{
 const cloud=await mockTrips(page);await ready(page);await login(page);await newTrip(page,'Grupo de acompanhamento');await saveTrip(page);
 await page.locator('#trip-invite-username').fill('bob');await page.locator('#trip-invite-form').getByRole('button',{name:'Enviar convite'}).click();await expect(page.locator('#trip-people')).toContainText('Acompanhante');
 await page.locator('#trips-close').click();await logout(page);await login(page,'bob@example.com');await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('#trip-decline').click();await expect(page.locator('.trip-card')).toHaveCount(0);
 await page.locator('#trips-close').click();await logout(page);await login(page);await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('#trip-invite-username').fill('bob');await page.locator('#trip-invite-form').getByRole('button',{name:'Enviar convite'}).click();await expect.poll(()=>cloud.members.length).toBe(1);
 await page.locator('#trips-close').click();await logout(page);await login(page,'bob@example.com');await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('#trip-accept').click();await expect(page.locator('#trip-name')).toBeDisabled();await expect(page.locator('#trip-save')).not.toBeVisible();await expect(page.locator('#trip-delete')).not.toBeVisible();
 await page.locator('#trips-close').click();await logout(page);await login(page);await page.locator('#trips-button').click();await page.locator('.trip-card').click();await page.locator('[data-remove-person]').click();await expect(page.locator('#trip-people')).toContainText('Nenhum participante');expect(cloud.members).toHaveLength(0);
 await page.locator('#trip-delete').click();await page.locator('#confirm-ok').click();await expect(page.locator('.trip-card')).toHaveCount(0);expect(cloud.trips).toHaveLength(0);
});

test('SQL ainda não instalado informa ativação sem afetar postagens',async({page})=>{
 const cloud=await mockTrips(page);cloud.addPost('safe','Minha memória preservada');
 await page.route('https://atlas-tests.supabase.co/rest/v1/trip_members?**',route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST205'})}));
 await ready(page);await login(page);await page.locator('#trips-button').click();await expect(page.locator('#trip-list-status')).toContainText('precisam ser ativadas');await page.locator('#trips-close').click();await expect(page.locator('.destination-card')).toContainText('Minha memória preservada');
});
