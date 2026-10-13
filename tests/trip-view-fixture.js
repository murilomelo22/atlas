import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mockTrips } from './trips-fixture.js';
import { ALICE } from './cloud-fixture.js';
const video=await readFile(new URL('./fixtures/memory.mp4',import.meta.url));
export async function tripViewFixture(page,{publicly=true}={}) {
  const cloud=await mockTrips(page);await page.goto('/');await page.locator('.destination-card').first().waitFor();
  const jpeg=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=120;c.height=90;const ctx=c.getContext('2d');ctx.fillStyle='#b89466';ctx.fillRect(0,0,120,90);ctx.fillStyle='#2c6552';ctx.fillRect(35,25,45,65);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
  const trip={id:randomUUID(),owner_id:ALICE,revision:randomUUID(),name:'Espanha, Itália e Grécia',notes:'Dias de sol, caminhos antigos e histórias para guardar.',is_public:publicly,cover_path:null,stops:[
    {id:'greece',name:'Atenas',lat:37.9838,lng:23.7275,date:'2024-05-11',notes:'O último capítulo, perto do mar.'},
    {id:'spain',name:'Madri',lat:40.4168,lng:-3.7038,date:'2024-05-01',notes:'Minha primeira parada <img src=x onerror=alert(1)>'},
    {id:'italy',name:'Roma',lat:41.9028,lng:12.4964,date:'2024-05-07',notes:'Entre praças e memórias.'},
    {id:'no-date',name:'Lisboa',lat:38.7223,lng:-9.1393,date:'',notes:'Um encontro ainda sem data.'},
  ]};cloud.trips.push(trip);
  for(const [place,kind,caption] of [['spain','image','Uma tarde em Madri'],['italy','video','Caminhando por Roma'],['greece','image','O mar da Grécia'],[null,'image','Uma memória do grupo']]){
    const id=randomUUID(),prefix=`${ALICE}/${trip.id}/${id}`,photo={id,trip_id:trip.id,uploader_id:ALICE,storage_path:prefix+(kind==='video'?'.mp4':'.jpg'),thumbnail_path:prefix+'-thumb.jpg',kind,caption,stop_id:place,created_at:'2024-05-01T10:00:00Z',duration:kind==='video'?1.2:null};
    cloud.tripPhotos.push(photo);cloud.objects.set(`atlas-trip-media/${photo.storage_path}`,kind==='video'?video:jpeg);cloud.objects.set(`atlas-trip-media/${photo.thumbnail_path}`,jpeg);
  }
  cloud.addPost('private-review','Minha avaliação privada').data.notes='SEGREDO DA AVALIAÇÃO PESSOAL';
  return {cloud,trip,jpeg};
}
export async function loginForTrip(page,email='alice@example.com'){
  await page.locator('#login-button').click();await page.locator('#auth-email').fill(email);await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await page.locator('#auth-dialog').waitFor({state:'hidden'});
}
export async function closeTripViews(page){
  if(await page.locator('#trip-view-dialog').isVisible())await page.locator('[data-view-close]').click();
  if(await page.locator('#trips-dialog').isVisible())await page.locator('#trips-close').click();
}
export async function logoutForTrip(page){await closeTripViews(page);await page.locator('#account-button').click();await page.locator('#logout-button').click();await page.locator('#login-button').waitFor({state:'visible'});}
