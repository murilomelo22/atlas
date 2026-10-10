import { currentUser } from './cloud.js';
import { getWishlist, saveWishlist } from './db.js';
import { emptyWishlist, cleanWishlist } from './wishlist-data.js';
import { escapeHTML as esc, notify } from './ui.js';

export function publicWishlistHTML(wishlist) {
  if (!wishlist?.is_public || !wishlist.items.length) return '';
  return `<section class="profile-wishlist" aria-label="Wish list pública"><h3>Wish list · ${wishlist.items.length}</h3><p class="field-hint">Lugares que quero conhecer</p><ol class="wishlist-public-items">${wishlist.items.map(item => `<li><strong>${esc(item.name)}</strong>${item.country ? `<small>${esc(item.country)}</small>` : ''}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</li>`).join('')}</ol></section>`;
}
export function initializeWishlist(callbacks) {
  const dialog = document.createElement('dialog'); dialog.id = 'wishlist-dialog'; dialog.className = 'wide-dialog'; dialog.setAttribute('aria-labelledby', 'wishlist-title');
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">LUGARES QUE QUERO CONHECER</p><h2 id="wishlist-title">Minha wish list</h2></div><button type="button" class="icon-button" id="wishlist-close" aria-label="Fechar wish list">×</button></header><div class="account-scroll"><section class="account-body"><label>Visibilidade da wish list<select id="wishlist-visibility"><option value="private">Privada · somente eu</option><option value="public">Pública · mostrar no perfil</option></select></label><p id="wishlist-privacy-hint" class="field-hint"></p><p id="wishlist-draft-state" class="field-hint" role="status"></p><ol id="wishlist-items" class="wishlist-editor-items"></ol><form id="wishlist-entry-form"><div class="form-row"><label>Lugar que quero conhecer<input id="wishlist-name" maxlength="120" required placeholder="ex.: Kyoto"></label><label>País (opcional)<input id="wishlist-country" maxlength="80" placeholder="ex.: Japão"></label></div><label>Notas do desejo<textarea id="wishlist-notes" maxlength="2000" rows="3" placeholder="O que quero fazer por lá…"></textarea></label><div class="account-actions"><button type="submit" id="wishlist-entry-save" class="quiet">Adicionar à lista</button><button type="button" id="wishlist-edit-cancel" class="text-button" hidden>Cancelar edição do lugar</button></div></form><div class="account-actions wishlist-save-actions"><button type="button" id="wishlist-save" class="primary">Salvar wish list</button></div><p id="wishlist-message" class="field-hint" role="status"></p></section></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  let epoch = 0, draft = emptyWishlist(), version = null, editId = null, edited = false, busy = false;
  const available = () => callbacks.available();
  function resetEntry() { $('#wishlist-entry-form').reset(); editId = null; $('#wishlist-entry-save').textContent = 'Adicionar à lista'; $('#wishlist-edit-cancel').hidden = true; }
  function privacyHint() {
    $('#wishlist-visibility').disabled = !currentUser();
    $('#wishlist-privacy-hint').textContent = !currentUser() ? 'Sem login, sua lista fica privada neste navegador. Entre na conta e use “Enviar meus dados locais” para levar a lista à nuvem.' : $('#wishlist-visibility').value === 'public' ? 'A lista inteira aparecerá para visitantes quando seu perfil permitir que outras pessoas o encontrem.' : 'Sua lista fica acessível somente para você, mesmo com o perfil público.';
  }
  function render() {
    $('#wishlist-items').innerHTML = draft.items.length ? draft.items.map(item => `<li data-wish-id="${esc(item.id)}"><div><strong>${esc(item.name)}</strong>${item.country ? `<small>${esc(item.country)}</small>` : ''}${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</div><div class="wishlist-item-actions"><button type="button" class="text-button" data-wish-edit aria-label="Editar lugar ${esc(item.name)}">Editar</button><button type="button" class="text-button" data-wish-remove aria-label="Remover lugar ${esc(item.name)}">Remover</button></div></li>`).join('') : '<li class="wishlist-empty">O próximo destino começa com uma vontade. Adicione seu primeiro lugar.</li>';
    $('#wishlist-draft-state').textContent = edited ? 'Alterações no formulário. Clique em “Salvar wish list” para guardar.' : `${draft.items.length} de 200 lugares · não entram nas estatísticas de viagens realizadas.`;
    $('#wishlist-items').querySelectorAll('[data-wish-id]').forEach(row => {
      row.querySelector('[data-wish-edit]').onclick = () => {
        if (busy || !available()) return;
        const item = draft.items.find(i => i.id === row.dataset.wishId); editId = item.id;
        $('#wishlist-name').value = item.name; $('#wishlist-country').value = item.country; $('#wishlist-notes').value = item.notes;
        $('#wishlist-entry-save').textContent = 'Aplicar alteração'; $('#wishlist-edit-cancel').hidden = false; $('#wishlist-name').focus();
      };
      row.querySelector('[data-wish-remove]').onclick = () => {
        if (busy || !available()) return;
        draft.items = draft.items.filter(i => i.id !== row.dataset.wishId); if (editId === row.dataset.wishId) resetEntry(); edited = true; render();
      };
    });
  }
  async function refresh() {
    if (!dialog.open || busy) return;
    const token = epoch, saved = await getWishlist(); if (token !== epoch || !dialog.open) return;
    if (!edited && !editId && !$('#wishlist-name').value && !$('#wishlist-country').value && !$('#wishlist-notes').value) {
      draft = cleanWishlist(saved); version = saved.localVersion || null; $('#wishlist-visibility').value = draft.is_public ? 'public' : 'private'; render(); privacyHint();
    }
    $('#wishlist-message').textContent = currentUser() ? saved.cloudDirty ? document.querySelector('#sync-status').textContent : saved.revision ? 'Wish list salva na sua conta.' : 'Sua lista começa privada. Salve para sincronizar.' : 'A lista salva fica neste navegador e entra no backup do seu atlas.';
  }
  async function open() {
    if (!available()) return notify('Aguarde a atualização da sua conta.');
    const token = ++epoch; edited = false; resetEntry(); $('#wishlist-message').textContent = '';
    const saved = await getWishlist(); if (token !== epoch || !available()) return;
    draft = cleanWishlist(saved); version = saved.localVersion || null; $('#wishlist-visibility').value = draft.is_public && currentUser() ? 'public' : 'private';
    document.querySelector('#account-dialog').close(); render(); privacyHint(); if (!dialog.open) dialog.showModal(); await refresh();
  }
  $('#wishlist-visibility').onchange = () => { edited = true; draft.is_public = $('#wishlist-visibility').value === 'public' && Boolean(currentUser()); privacyHint(); render(); };
  $('#wishlist-entry-form').onsubmit = event => {
    event.preventDefault(); if (busy || !available()) return;
    try {
      const item = { id: editId || crypto.randomUUID(), name: $('#wishlist-name').value, country: $('#wishlist-country').value, notes: $('#wishlist-notes').value };
      draft = cleanWishlist({ ...draft, items: editId ? draft.items.map(i => i.id === editId ? item : i) : [...draft.items, item] });
      edited = true; resetEntry(); render(); $('#wishlist-message').textContent = '';
    } catch (error) { $('#wishlist-message').textContent = error.message; }
  };
  $('#wishlist-edit-cancel').onclick = resetEntry;
  $('#wishlist-save').onclick = async () => {
    if (busy || !available()) return;
    if ($('#wishlist-name').value || $('#wishlist-country').value || $('#wishlist-notes').value) { $('#wishlist-message').textContent = 'Clique em “Adicionar à lista” ou “Aplicar alteração” para incluir o lugar antes de salvar.'; return; }
    const token = epoch; busy = true;
    dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = true; });
    try {
      await saveWishlist({ ...draft, is_public: $('#wishlist-visibility').value === 'public' && Boolean(currentUser()) }, version);
      if (token !== epoch) return;
      const saved = await getWishlist(); version = saved.localVersion; draft = cleanWishlist(saved); edited = false; render();
      $('#wishlist-message').textContent = currentUser() ? 'Wish list salva neste dispositivo. Aguardando sincronização…' : 'Wish list salva neste navegador.';
      callbacks.afterMutation();
    } catch (error) { if (token === epoch) $('#wishlist-message').textContent = error.message; }
    finally { if (token === epoch) { busy = false; dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); privacyHint(); } }
  };
  function clear() { dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); epoch++; draft = emptyWishlist(); version = null; edited = false; busy = false; resetEntry(); $('#wishlist-items').replaceChildren(); $('#wishlist-message').textContent = ''; $('#wishlist-draft-state').textContent = ''; $('#wishlist-privacy-hint').textContent = ''; $('#wishlist-visibility').value = 'private'; $('#wishlist-save').disabled = false; }
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('#wishlist-close').onclick = () => dialog.close(); dialog.addEventListener('close', clear);
  document.querySelector('#wishlist-button').onclick = () => open().catch(error => notify(error.message, true));
  document.querySelector('#profile-wishlist').onclick = () => open().catch(error => notify(error.message, true));
  return { refresh, reset() { clear(); dialog.close(); }, open };
}
