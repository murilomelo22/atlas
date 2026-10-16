import {test,expect} from '@playwright/test';
test('presentation links to actual released app and states commercial plans are pending',async({page})=>{
 await page.goto('/apresentacao.html');await expect(page.getByRole('heading',{level:1})).toHaveText('Suas viagens têm um lugar.');
 await expect(page.getByRole('link',{name:'Baixar versão 0.1.1 para Mac'})).toHaveAttribute('href',/desktop-v0\.1\.1\/Atlas-Pessoal-0\.1\.1-universal\.dmg$/);
 await expect(page.locator('body')).toContainText('nenhuma assinatura é vendida por esta página');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
