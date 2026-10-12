// Only response metadata is shown. Request bodies, headers and session objects
// must never enter diagnostics; messages are redacted before display or copying.
export function cloudDiagnostic({ status, code, path, method, message }) {
  const route = String(path || '').split('?')[0];
  const safeRoute = route.startsWith('/rest/v1/rpc/') ? route.slice(0, 100)
    : route.split('/').slice(0, 4).join('/');
  const detail = String(message || 'O servidor não forneceu uma mensagem.').replace(/Bearer\s+[^\s"']+/gi, 'Bearer [removido]')
    .replace(/\b(access_token|refresh_token|password|authorization|apikey)\s*[:=]\s*["']?[^\s,"']+/gi, '$1=[removido]')
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[chave removida]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[token removido]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL removida]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email removido]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 1000);
  const safeCode = /^[a-zA-Z0-9_]{1,40}$/.test(String(code || '')) ? String(code) : 'sem código';
  return `${new Date().toISOString()}\n${method || 'GET'} ${safeRoute}\nHTTP ${status || 'sem resposta'} · ${safeCode}\nServidor: ${detail}`;
}

export function diagnosticHTML(id) {
  return `<details id="${id}" class="sync-diagnostic" hidden><summary>Detalhes da falha</summary><pre></pre><button type="button" class="text-button">Copiar detalhes</button></details>`;
}
export function showDiagnostic(element, text) {
  element.hidden = !text;
  element.querySelector('pre').textContent = text || '';
  const button = element.querySelector('button');
  button.textContent = 'Copiar detalhes';
  button.onclick = async () => {
    try { await navigator.clipboard.writeText(element.querySelector('pre').textContent); button.textContent = 'Detalhes copiados'; }
    catch { button.textContent = 'Selecione o texto acima para copiar'; }
  };
}
