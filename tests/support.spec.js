import {test,expect} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('telemetry defaults off, can be revoked and support report always needs separate opt in',async({page})=>{
 let telemetry=0;page.on('request',r=>{if(r.url().includes('/v1/telemetry'))telemetry++;});
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();
 await page.locator('#support-button').click();await expect(page.locator('#metrics-consent')).not.toBeChecked();await expect(page.locator('#errors-consent')).not.toBeChecked();await expect(page.locator('#support-logs')).not.toBeChecked();expect(telemetry).toBe(0);
 await page.locator('#metrics-consent').check();await page.locator('#save-consent').click();await page.locator('#support-close').click();await page.reload();await expect(page.locator('#add-button')).toBeEnabled();await page.locator('#support-button').click();await expect(page.locator('#metrics-consent')).toBeChecked();await expect(page.locator('#support-logs')).not.toBeChecked();
 await page.locator('#metrics-consent').uncheck();await page.locator('#save-consent').click();await page.locator('#support-email').click();await expect(page.locator('#support-status')).toContainText('configurado');
 await page.locator('#support-close').click();await page.goto('/ajuda.html');await expect(page.getByRole('heading',{level:1})).toHaveText('Ajuda do Atlas');
});
