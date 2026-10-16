import { test, expect } from '@playwright/test';
test.use({serviceWorkers:'block'});
test('plan is unavailable safely before backend deployment and old premium stays isolated',async({page})=>{
  await page.goto('/');await expect(page.locator('#poster-button')).toBeEnabled();
  await page.locator('#plan-button').click();await expect(page.locator('#plan-status')).toContainText('ainda não estão disponíveis');
  await expect(page.locator('[data-billing-action="checkout"]')).toBeDisabled();
  await page.locator('#plan-close').click();
  expect(await page.evaluate(async()=> (await import('/src/premium.js')).readPremiumAccess())).toBe(false);
  await page.locator('#export-button').click();
});
