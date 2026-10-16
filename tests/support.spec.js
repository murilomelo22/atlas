import {test,expect} from '@playwright/test';
import {mockCloud} from './cloud-fixture.js';
test.use({serviceWorkers:'block'});
test('telemetry defaults off, can be revoked and support report always needs separate opt in',async({page})=>{
 let telemetry=0;page.on('request',r=>{if(r.url().includes('/v1/telemetry'))telemetry++;});
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();
 await page.locator('#support-button').click();await expect(page.locator('#metrics-consent')).not.toBeChecked();await expect(page.locator('#errors-consent')).not.toBeChecked();await expect(page.locator('#support-logs')).not.toBeChecked();expect(telemetry).toBe(0);
 await page.locator('#metrics-consent').check();await page.locator('#save-consent').click();await page.locator('#support-close').click();await page.reload();await expect(page.locator('#add-button')).toBeEnabled();await page.locator('#support-button').click();await expect(page.locator('#metrics-consent')).toBeChecked();await expect(page.locator('#support-logs')).not.toBeChecked();
 await page.locator('#metrics-consent').uncheck();await page.locator('#save-consent').click();await page.locator('#support-email').click();await expect(page.locator('#support-status')).toContainText('configurado');
 await page.locator('#support-close').click();await page.goto('/ajuda.html');await expect(page.getByRole('heading',{level:1})).toHaveText('Ajuda do Atlas');
});
test('opt-in sends only allowed payload and revocation immediately stops collection',async({page})=>{
 await mockCloud(page);await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const supabaseConfig={url:'https://atlas-tests.supabase.co',publishableKey:'sb_publishable_test_fixture'};export const commercialConfig={apiURL:'https://billing.example.invalid/'};"}));
 const events=[];await page.route('https://billing.example.invalid/v1/telemetry',route=>{events.push(route.request().postDataJSON());return route.fulfill({json:{received:true}});});
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();await page.locator('#login-button').click();await page.locator('#auth-email').fill('alice@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();expect(events).toHaveLength(0);
 await page.locator('#support-button').click();await page.locator('#metrics-consent').check();await page.locator('#save-consent').click();
 await page.evaluate(async()=>{await(await import('/src/support.js')).recordEvent('backup_export');});expect(events).toEqual([{event:'backup_export',version:'0.1.2'}]);
 await page.locator('#metrics-consent').uncheck();await page.locator('#save-consent').click();await page.evaluate(async()=>{await(await import('/src/support.js')).recordEvent('backup_export');window.dispatchEvent(new ErrorEvent('error',{message:'private@example.invalid/secret-token'}));});expect(events).toHaveLength(1);
 await page.locator('#errors-consent').check();await page.locator('#save-consent').click();await page.evaluate(()=>window.dispatchEvent(new ErrorEvent('error',{message:'private@example.invalid/secret-token'})));await expect.poll(()=>events.length).toBe(2);expect(events[1]).toEqual({event:'UNHANDLED_ERROR',version:'0.1.2'});
});
