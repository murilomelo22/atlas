import { currentUser, myProfile } from './cloud.js';
import { $, notify, escapeHTML } from './ui.js';
export const appLink = (hash) => new URL(hash, new URL('./', location.href)).href;
export function shareText(text, url = '') {
  let dialog = $('#share-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog'); dialog.id = 'share-dialog'; dialog.setAttribute('aria-labelledby', 'share-title');
    dialog.innerHTML = '<header class="dialog-header"><h2 id="share-title">Compartilhar</h2><button class="icon-button" aria-label="Fechar compartilhamento">×</button></header><div class="account-body"><label>Mensagem<textarea id="share-text" rows="7" readonly></textarea></label><div class="account-actions"><a id="share-whatsapp" class="primary" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a><button id="share-copy" class="quiet">Copiar mensagem</button></div><p id="share-status" class="field-hint" role="status"></p></div>';
    document.body.append(dialog); $('.icon-button', dialog).onclick = () => dialog.close();
    dialog.addEventListener('close', () => { $('#share-text').value = ''; $('#share-whatsapp').removeAttribute('href'); $('#share-status').textContent = ''; });
    $('#share-copy').onclick = async () => { try { await navigator.clipboard.writeText($('#share-text').value); $('#share-status').textContent = 'Mensagem copiada.'; } catch { $('#share-text').select(); $('#share-status').textContent = 'Selecione e copie o texto acima.'; } };
  }
  const message = [text, url].filter(Boolean).join('\n\n');
  $('#share-text').value = message; $('#share-whatsapp').href = `https://wa.me/?text=${encodeURIComponent(message)}`; $('#share-status').textContent = '';
  if (!dialog.open) dialog.showModal();
}
export async function shareDestination(destination, profile) {
  try {
    if (!profile) {
      if (!currentUser() || destination.visibility !== 'public') throw new Error('Para compartilhar esta postagem por link, entre na conta e salve-a como pública.');
      profile = await myProfile();
    }
    if (!profile.is_public) throw new Error('Seu perfil está privado. Torne-o público e salve antes de compartilhar.');
    shareText(`Conheça minha viagem a ${destination.name} no Atlas!`, appLink(`#/perfil/${profile.username}`));
  } catch (error) { notify(error.message, true); }
}
export function downloadText(name, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const xmlText = (value) => escapeHTML(value);
