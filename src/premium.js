import { currentUser, request } from './cloud.js';

// Entitlements are administered in the database, never in editable profiles.
export async function readPremiumAccess() {
  const owner = currentUser()?.id;
  if (!owner) return false;
  const query = new URLSearchParams({ select: 'user_id,expires_at', user_id: `eq.${owner}`, limit: '1' });
  const rows = await request(`/rest/v1/premium_accounts?${query}`, { authenticated: true });
  if (currentUser()?.id !== owner) throw new DOMException('Conta alterada.', 'AbortError');
  if (!Array.isArray(rows)) throw new Error('Não foi possível verificar o acesso premium.');
  return rows.some(row => row.user_id === owner && (!row.expires_at || Date.parse(row.expires_at) > Date.now()));
}

export async function refreshPremiumStatus() {
  const owner = currentUser()?.id, element = document.getElementById('premium-status');
  element.textContent = 'Verificando acesso premium…';
  try {
    const enabled = await readPremiumAccess();
    if (currentUser()?.id === owner) element.textContent = enabled
      ? 'Premium · teste ativo. Exportação de pôster liberada, sem cobrança.'
      : 'Conta gratuita. A exportação de pôster está em teste para contas premium habilitadas.';
  } catch {
    if (currentUser()?.id === owner) element.textContent = 'Não foi possível verificar o premium. Tente novamente com conexão.';
  }
}
