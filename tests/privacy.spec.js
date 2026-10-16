import {test,expect} from '@playwright/test';
import {mockCloud} from './cloud-fixture.js';
test.use({serviceWorkers:'block'});
test('draft privacy is explicit, no destructive action offline and export remains available',async({page})=>{
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();
 await page.locator('#privacy-button').click();await expect(page.locator('#privacy-status')).toContainText('RASCUNHO');
 await page.locator('#portability-button').click();await expect(page.locator('#privacy-status')).toContainText('ainda não estão disponíveis');
 await page.locator('#delete-confirmation').fill('EXCLUIR MINHA CONTA');await page.locator('#delete-password').fill('fixture-only');await page.locator('#account-delete-form button').click();
 await expect(page.locator('#privacy-status')).toContainText('Entre na conta');await expect(page.locator('#delete-password')).toHaveValue('');
 await page.locator('#privacy-close').click();await expect(page.locator('.destination-card')).toHaveCount(5);
 await page.goto('/legal/privacidade.html');await expect(page.getByRole('heading',{level:1})).toContainText('RASCUNHO NÃO APROVADO');
});
test('approved document flow records explicit acceptance of server version',async({page})=>{
 await mockCloud(page);
 await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const supabaseConfig={url:'https://atlas-tests.supabase.co',publishableKey:'sb_publishable_test_fixture'};export const commercialConfig={apiURL:'https://billing.example.invalid/',legalApproved:true};"}));
 let accepted;
 await page.route('https://billing.example.invalid/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/v1/consent')accepted=route.request().postDataJSON();return route.fulfill({json:{available:true,version:'fixture-final-v1',accepted:path==='/v1/consent'}});});
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();await page.locator('#login-button').click();await page.locator('#auth-email').fill('alice@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();
 await page.locator('#privacy-button').click();await expect(page.locator('#legal-consent-form')).toBeVisible();await page.locator('#legal-consent-form input').check();await page.locator('#legal-consent-form button').click();await expect(page.locator('#legal-consent-form')).not.toBeVisible();expect(accepted).toEqual({version:'fixture-final-v1',accepted:true});
});
