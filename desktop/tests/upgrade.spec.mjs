import {test,expect,_electron as electron} from '@playwright/test';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../package.json',import.meta.url));
test('migra perfil real de 0.1.1 para 0.1.2 e permite rollback sem perder memória',async()=>{
 test.skip(!process.env.ATLAS_LEGACY_EXECUTABLE,'Exige o binário original 0.1.1; não simular instalação assinada.');
 test.setTimeout(120000);
 const profile=await mkdtemp(path.join(tmpdir(),'atlas-upgrade-'));let app;
 const launch=async legacy=>{
  const executablePath=legacy?process.env.ATLAS_LEGACY_EXECUTABLE:process.env.ATLAS_DESKTOP_EXECUTABLE||require('electron');
  const args=[...(!legacy&&!process.env.ATLAS_DESKTOP_EXECUTABLE?[fileURLToPath(new URL('../',import.meta.url))]:[]),`--user-data-dir=${profile}`];
  app=await electron.launch({executablePath,args});const page=await app.firstWindow();await expect.poll(()=>page.evaluate(()=>JSON.parse(document.documentElement.dataset.atlasState||'{}').ready)).toBe(true);return page;
 };
 try{
  let page=await launch(true);
  await page.locator('#add-button').click();await page.locator('#destination-name').fill('Memória antes da atualização');
  // The established editor uses the same coordinates fields in both versions.
  await page.locator('#latitude').fill('48.85');await page.locator('#longitude').fill('2.35');
  await page.locator('#destination-form button[type="submit"]').click();await expect(page.locator('#destination-list')).toContainText('Memória antes da atualização');await app.close();app=null;
  page=await launch(false);await expect(page.locator('#destination-list')).toContainText('Memória antes da atualização');
  expect(await page.evaluate(async()=> (await import('./src/db.js')).getMeta('data-schema'))).toBe(2);await app.close();app=null;
  page=await launch(true);await expect(page.locator('#destination-list')).toContainText('Memória antes da atualização');
 }finally{if(app)await app.close();await rm(profile,{recursive:true,force:true});}
});
