import { accountAccessToken, currentUser, onAuthChange } from './cloud.js';
import * as publicConfig from '../config.js';
export const commercialConfig = publicConfig.commercialConfig || { apiURL: '', experimentalPoster: false };

export async function commercialRequest(path, { method = 'GET', body } = {}) {
  if (!commercialConfig.apiURL) throw new Error('Os planos comerciais ainda não estão disponíveis. Sua coleção local continua funcionando.');
  const base = new URL(commercialConfig.apiURL);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Endereço comercial inválido.');
  const owner = currentUser()?.id, token = await accountAccessToken();
  const response = await fetch(new URL(path.replace(/^\//, ''), base.href.replace(/\/?$/, '/')), {
    method, credentials: 'omit', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (currentUser()?.id !== owner) throw new DOMException('Conta alterada.', 'AbortError');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação. Seus dados locais foram preservados.');
  return data;
}
export function safeBillingURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !['checkout.stripe.com','billing.stripe.com'].includes(url.hostname)) throw new Error('Endereço de pagamento inválido.');
  return url.href;
}
export function initializeCommercial() {
  const dialog = document.getElementById('plan-dialog'), status = document.getElementById('plan-status');
  const buttons = [...dialog.querySelectorAll('[data-billing-action]')];
  async function show() {
    dialog.showModal(); status.textContent = 'Verificando plano…'; buttons.forEach(b => b.disabled = true);
    try {
      const plan = await commercialRequest('/v1/plan');
      status.textContent = `${plan.plan === 'paid' ? 'Plano pago' : 'Plano gratuito'}${plan.mode === 'test' ? ' · AMBIENTE DE TESTE, sem cobrança real' : ''}${plan.cancelAtPeriodEnd ? ' · cancelamento agendado' : ''}.`;
      buttons.forEach(b => b.disabled = !currentUser());
    } catch (e) { status.textContent = e.message; }
  }
  document.getElementById('plan-button').onclick = show;
  document.getElementById('plan-close').onclick = () => dialog.close();
  onAuthChange(() => { dialog.close(); status.textContent = ''; buttons.forEach(b => b.disabled = true); });
  for (const button of buttons) button.onclick = async () => {
    buttons.forEach(b => b.disabled = true);
    try { const { url } = await commercialRequest(`/v1/${button.dataset.billingAction}`, { method: 'POST', body: {} }); window.open(safeBillingURL(url), '_blank', 'noopener,noreferrer'); }
    catch (e) { status.textContent = e.message; }
    finally { buttons.forEach(b => b.disabled = !currentUser()); }
  };
}
