import {test,expect} from '@playwright/test';
import {mockTrips} from './trips-fixture.js';
import {ALICE} from './cloud-fixture.js';
test.use({serviceWorkers:'block'});
async function ready(page){await page.goto('/');await expect(page.locator('.destination-card')).toHaveCount(5);}
async function login(page){await page.locator('#login-button').click();await page.locator('#auth-email').fill('alice@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#sync-status')).toHaveText('Tudo salvo na sua conta.');}

test('viagens realizadas entram na trip com datas, sem notas e sem duplicação',async({page})=>{
 const cloud=await mockTrips(page);const d=cloud.addPost('italia','Roma já visitada');d.data.notes='Memória particular';d.data.visits=[{id:'maio',arrival:'2024-05-01',departure:'2024-05-04',manualDays:null},{id:'junho',arrival:'2024-06-10',departure:'2024-06-12',manualDays:null}];
 const home=cloud.addPost('home','Minha casa');home.data.kind='home';const future=cloud.addPost('future','Viagem futura');future.data.visits=[{arrival:'2099-01-01',departure:'2099-01-02',manualDays:null}];
 await ready(page);await login(page);await page.locator('#trips-button').click();await page.locator('#trip-new').click();await page.locator('#trip-name').fill('Minhas viagens feitas');await page.locator('#trip-add-completed').click();
 await expect(page.locator('#completed-list .recorded-visit')).toHaveCount(2);await expect(page.locator('#completed-list')).not.toContainText('Minha casa');await expect(page.locator('#completed-list')).not.toContainText('Viagem futura');
 for(const input of await page.locator('#completed-list input').all())await input.check();await page.locator('#completed-add').click();await expect(page.locator('.trip-stop')).toHaveCount(2);await expect(page.locator('.trip-stop').first().locator('[data-stop-date]')).toHaveValue('2024-05-01');await expect(page.locator('.trip-stop').first().locator('[data-stop-departure]')).toHaveValue('2024-05-04');await expect(page.locator('.trip-stop').first().locator('[data-stop-notes]')).toHaveValue('');
 await page.locator('#trip-add-completed').click();for(const input of await page.locator('#completed-list input').all())await expect(input).toBeDisabled();await page.getByRole('button',{name:'Fechar viagens realizadas'}).click();
 await page.locator('#trip-save').click();await expect(page.locator('#trip-share')).toBeVisible();expect(cloud.trips[0].stops).toHaveLength(2);expect(cloud.trips[0].stops[0]).toMatchObject({completed:true,sourceDestinationId:'italia',sourceVisitId:'maio',departure:'2024-05-04',notes:''});
 await page.locator('#trip-back').click();await page.locator('.trip-card').click();await expect(page.locator('.trip-stop').first()).toContainText('Viagem realizada');await expect(page.locator('.trip-stop').last().locator('[data-stop-departure]')).toHaveValue('2024-06-12');
});

test('notas de viagem são copiadas apenas com escolha explícita',async({page})=>{
 const cloud=await mockTrips(page);const p=cloud.addPost('p','Paris visitada');p.data.notes='Anotações para compartilhar';p.data.visits=[{id:'manual',arrival:'',departure:'',manualDays:7}];
 await ready(page);await login(page);await page.locator('#trips-button').click();await page.locator('#trip-new').click();await page.locator('#trip-name').fill('Trip com notas');await page.locator('#trip-add-completed').click();await page.locator('#completed-list input').check();await page.locator('#completed-notes').check();await page.locator('#completed-add').click();await expect(page.locator('[data-stop-notes]')).toHaveValue('Anotações para compartilhar');await page.locator('#trip-save').click();await expect.poll(()=>cloud.trips.length).toBe(1);expect(cloud.trips[0].stops[0]).toMatchObject({notes:'Anotações para compartilhar',manualDays:7,completed:true,date:''});
});

test('países pintados permanecem com marcadores e números ocultos, inclusive após recarregar',async({page})=>{
 await mockTrips(page);await ready(page);await expect(page.locator('.atlas-cluster')).toHaveCount(1);await page.locator('#route-toggle').check();await page.locator('#show-markers').uncheck();
 await expect(page.locator('.atlas-pin,.atlas-cluster')).toHaveCount(0);await expect(page.locator('#map path[stroke-dasharray]')).toHaveCount(0);await expect(page.locator('#route-toggle')).toBeDisabled();await expect(page.locator('#map path[data-country-id="380"]')).toHaveAttribute('fill','#c09a71');
 await page.reload();await expect(page.locator('#show-markers')).not.toBeChecked();await expect(page.locator('.atlas-cluster')).toHaveCount(0);await expect(page.locator('#map path[data-country-id="380"]')).toHaveAttribute('fill','#c09a71');await page.locator('#show-markers').check();await expect(page.locator('.atlas-cluster')).toHaveCount(1);
});

test('moradia sincroniza com símbolo de casa e fica fora das estatísticas de viagens',async({page})=>{
 const cloud=await mockTrips(page);await ready(page);await login(page);await page.locator('#add-button').click();await page.locator('#destination-name').fill('Minha casa em São Paulo');await page.locator('#destination-kind').selectOption('home');await page.locator('#latitude').fill('-23.55');await page.locator('#longitude').fill('-46.63');await page.locator('[data-arrival]').fill('2025-01-01');await page.locator('[data-departure]').fill('2025-12-31');await page.locator('#save-button').click();
 await expect.poll(()=>cloud.posts.length).toBe(1);expect(cloud.posts[0].data.kind).toBe('home');await expect(page.locator('#detail-panel')).toContainText('Casa / moradia');await expect(page.locator('#stat-days')).toHaveText('0');await expect(page.locator('#stat-distance')).toHaveText('0');await expect(page.locator('.home-pin')).toHaveCount(1);
 await page.locator('#recap-button').click();await page.locator('#recap-year').fill('2025');await expect(page.locator('.recap-stats strong').first()).toHaveText('0destinos');await page.getByRole('button',{name:'Fechar resumo'}).click();
 await page.reload();await expect(page.locator('.home-badge')).toHaveCount(1);await page.locator('#fit-button').click();await expect(page.locator('.home-pin')).toHaveCount(1);await expect(page.locator('#stat-days')).toHaveText('0');
});

test('contornos corrigidos não atribuem oceanos a Fiji ou Rússia e mostram nome no hover',async({page})=>{
 await mockTrips(page);await ready(page);
 const actual=await page.evaluate(async()=>{const{countryAt}=await import('/src/geography.js');return [[-16.5,0],[-16.5,80],[-16.5,-80],[65,-30],[0,179],[41.9,12.5],[35.68,139.69],[-17.8,178]].map(([lat,lng])=>countryAt(lat,lng).countryId);});
 expect(actual).toEqual([null,null,null,null,null,'380','392','242']);
 const geometry=await page.evaluate(async()=>{const collection=await(await fetch('/vendor/countries.geojson')).json();return collection.features.every(f=>(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).every(p=>p.every(r=>r.slice(1).every((point,i)=>Math.abs(point[0]-r[i][0])<=180.00001))));});expect(geometry).toBe(true);
 const italy=page.locator('#map path[data-country-id="380"]');await italy.dispatchEvent('mouseover');await expect(italy).toHaveAttribute('fill','#6ca78e');await expect(page.locator('.leaflet-tooltip')).toContainText('Itália');await italy.dispatchEvent('mouseout');await expect(italy).toHaveAttribute('fill','#c09a71');
});
