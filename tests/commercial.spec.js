import { test, expect } from '@playwright/test';
import {mockCloud,ALICE} from './cloud-fixture.js';
test.use({serviceWorkers:'block'});
test('plan is unavailable safely before backend deployment and old premium stays isolated',async({page})=>{
  await page.goto('/');await expect(page.locator('#poster-button')).toBeEnabled();
  await page.locator('#plan-button').click();await expect(page.locator('#plan-status')).toContainText('ainda não estão disponíveis');
  await expect(page.locator('[data-billing-action="checkout"]')).toBeDisabled();
  await page.locator('#plan-close').click();
  expect(await page.evaluate(async()=> (await import('/src/premium.js')).readPremiumAccess())).toBe(false);
  await page.locator('#export-button').click();
});
test('signed-in plan uses authenticated backend and only opens trusted payment origins',async({page,context})=>{
 await mockCloud(page);
 await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"export const supabaseConfig={url:'https://atlas-tests.supabase.co',publishableKey:'sb_publishable_test_fixture'};export const commercialConfig={apiURL:'https://billing.example.invalid/',experimentalPoster:false};"}));
 const calls=[];
 await page.route('https://billing.example.invalid/**',route=>{calls.push({path:new URL(route.request().url()).pathname,auth:route.request().headers().authorization});return route.fulfill({json:new URL(route.request().url()).pathname.endsWith('/plan')?{plan:'free',mode:'test'}:{url:'https://checkout.stripe.com/c/pay/fixture'}});});
 await context.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'Fixture checkout; no payment is processed.'}));
 await page.goto('/');await expect(page.locator('#add-button')).toBeEnabled();
 await page.locator('#login-button').click();await page.locator('#auth-email').fill('alice@example.com');await page.locator('#auth-password').fill('password123');await page.locator('#auth-submit').click();await expect(page.locator('#auth-dialog')).not.toBeVisible();
 await page.locator('#plan-button').click();await expect(page.locator('#plan-status')).toContainText('AMBIENTE DE TESTE');
 const popup=context.waitForEvent('page');await page.locator('[data-billing-action="checkout"]').click();const checkout=await popup;await checkout.waitForURL('https://checkout.stripe.com/c/pay/fixture');await checkout.close();
 expect(calls.map(c=>c.path)).toEqual(['/v1/plan','/v1/checkout']);expect(calls.every(c=>c.auth===`Bearer token-${ALICE}`)).toBe(true);
 const destinations=await page.evaluate(async()=>{const {safeBillingURL}=await import('/src/commercial.js');return ['https://evil.example.invalid','javascript:alert(1)','https://user:password@checkout.stripe.com'].map(url=>{try{safeBillingURL(url);return true;}catch{return false;}});});expect(destinations).toEqual([false,false,false]);
});
