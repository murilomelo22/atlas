import {test,expect} from '@playwright/test';
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
