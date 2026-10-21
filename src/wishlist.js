import { currentUser, needsReconnect, readCloudWishlist } from './cloud.js';
import { getWishlist, saveWishlist } from './db.js';
import { emptyWishlist, cleanWishlist, combineWishlistForReview, wishlistStatus, wishlistStatuses, hasWishlistLocation } from './wishlist-data.js';
import { createWishlistMap } from './wishlist-map.js';
import { createGeocoder } from './geocoding.js';
import { countryAt, normalizeCoordinates } from './geography.js';
import { escapeHTML as esc, notify } from './ui.js';
import { diagnosticHTML, showDiagnostic } from './cloud-diagnostics.js';

export function publicWishlistHTML(wishlist) {
  if (!wishlist?.is_public || !wishlist.items.length) return '';
  return `<section class="profile-wishlist" aria-label="Wish list pública"><h3>Wish list · ${wishlist.items.length}</h3><p class="field-hint">Lugares que quero conhecer e desejos realizados</p><ol class="wishlist-public-items">${wishlist.items.map(item => `<li><strong>${esc(item.name)}</strong>${item.country ? `<small>${esc(item.country)}</small>` : ''}<span class="wishlist-status wishlist-status-${wishlistStatus(item)}">${wishlistStatuses[wishlistStatus(item)]}</span>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</li>`).join('')}</ol></section>`;
}
export function initializeWishlist(callbacks) {
  const dialog = document.createElement('dialog'); dialog.id = 'wishlist-dialog'; dialog.className = 'wide-dialog'; dialog.setAttribute('aria-labelledby', 'wishlist-title');
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">O MUNDO AINDA TEM MUITO A MOSTRAR</p><h2 id="wishlist-title">Minha wish list</h2></div><button type="button" class="icon-button" id="wishlist-close" aria-label="Fechar wish list">×</button></header>
    <div class="account-scroll"><section class="account-body">
      <p class="wishlist-intro">Guarde uma vontade. Encontre seu próximo destino.</p>
      <label>Visibilidade da wish list<select id="wishlist-visibility"><option value="private">Privada · somente eu</option><option value="public">Pública · mostrar no perfil</option></select></label>
      <p id="wishlist-privacy-hint" class="field-hint"></p><p id="wishlist-draft-state" class="field-hint" role="status"></p>
      <div class="wishlist-toolbar"><div class="wishlist-view-buttons" role="group" aria-label="Visualização da wish list"><button type="button" class="quiet" id="wishlist-view-map" aria-pressed="true">Mapa e lista</button><button type="button" class="quiet" id="wishlist-view-list" aria-pressed="false">Só lista</button></div><label>Filtrar lugares<select id="wishlist-filter"><option value="all">Todos os lugares</option><option value="wishlist">Quero conhecer</option><option value="planning">Planejando</option><option value="visited">Já visitei</option></select></label></div>
      <div class="wishlist-explorer"><section id="wishlist-map-panel" aria-label="Mapa da wish list"><div class="wishlist-map-top"><span>Seu mapa de possibilidades</span><button type="button" id="wishlist-map-fit" class="text-button">Enquadrar lugares</button></div><div id="wishlist-map" aria-label="Mapa dos lugares da wish list"></div><p id="wishlist-map-summary" class="field-hint" role="status"></p><p class="field-hint">Toque no mapa para localizar um desejo. ♡ Quero conhecer · ↗ Planejando · ✓ Já visitei</p></section><ol id="wishlist-items" class="wishlist-editor-items" aria-label="Lugares da wish list"></ol></div>
      <form id="wishlist-entry-form"><h3 id="wishlist-entry-title">Adicionar um lugar</h3>
        <div class="wishlist-search"><label>Buscar localização<input id="wishlist-search" type="search" maxlength="200" autocomplete="off" placeholder="Busque uma cidade, restaurante ou trilha…" aria-describedby="wishlist-search-hint"></label><p id="wishlist-search-hint" class="field-hint">A busca usa OpenStreetMap e envia somente o termo pesquisado. Você também pode usar o mapa ou as coordenadas.</p><p id="wishlist-search-status" class="field-hint" role="status"></p><div id="wishlist-search-results" class="wishlist-search-results" role="group" aria-label="Resultados da busca de lugares"></div></div>
        <div class="form-row"><label>Lugar que quero conhecer<input id="wishlist-name" maxlength="120" required placeholder="ex.: Kyoto"></label><label>País (opcional)<input id="wishlist-country" maxlength="80" placeholder="ex.: Japão"></label></div>
        <label>Etapa do desejo<select id="wishlist-status"><option value="wishlist">Quero conhecer</option><option value="planning">Planejando</option><option value="visited">Já visitei</option></select></label>
        <p class="field-hint">As etapas organizam seus desejos. Para registrar uma memória e atualizar as estatísticas, adicione um destino no seu atlas.</p>
        <label>Notas do desejo<textarea id="wishlist-notes" maxlength="2000" rows="3" placeholder="Por que quero ir? Uma indicação, uma ideia, um pôr do sol…"></textarea></label>
        <details id="wishlist-coordinates"><summary>Localização e coordenadas (opcional)</summary><div class="form-row"><label>Latitude do desejo<input id="wishlist-lat" type="number" min="-90" max="90" step="any" placeholder="−90 a 90"></label><label>Longitude do desejo<input id="wishlist-lng" type="number" min="-180" max="180" step="any" placeholder="−180 a 180"></label></div><button type="button" id="wishlist-location-clear" class="text-button">Remover localização</button></details><p id="wishlist-location-hint" class="field-hint" role="status">Sem localização. O lugar pode ser salvo só na lista.</p>
        <div class="account-actions"><button type="submit" id="wishlist-entry-save" class="quiet">Adicionar à lista</button><button type="button" id="wishlist-edit-cancel" class="text-button" hidden>Cancelar edição do lugar</button></div>
      </form><div class="account-actions wishlist-save-actions"><button type="button" id="wishlist-save" class="primary">Salvar wish list</button><button type="button" id="wishlist-resolve" class="quiet" hidden>Revisar e combinar listas</button></div><p id="wishlist-message" class="field-hint" role="status"></p></section></div>`;
  document.body.append(dialog);
  dialog.querySelector('#wishlist-message').insertAdjacentHTML('afterend', diagnosticHTML('wishlist-diagnostic'));
  dialog.querySelector('.wishlist-save-actions').insertAdjacentHTML('beforeend', '<button type="button" id="wishlist-reconnect" class="quiet" hidden>Entrar novamente</button>');
  const footer = document.createElement('footer'); footer.className = 'wishlist-footer';
  footer.append(dialog.querySelector('.wishlist-save-actions'), dialog.querySelector('#wishlist-message'), dialog.querySelector('#wishlist-diagnostic'));
  dialog.append(footer);
  const $ = selector => dialog.querySelector(selector);
  let epoch = 0, draft = emptyWishlist(), version = null, editId = null, edited = false, busy = false, resolution = null, map;
  const available = () => callbacks.available();
  const geocoder = createGeocoder(results => {
    $('#wishlist-search-results').replaceChildren();
    if (!dialog.open || busy || !available()) return;
    for (const result of results) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = result.label;
      button.onclick = () => {
        if (busy || !available()) return;
        geocoder.cancel(); $('#wishlist-search-results').replaceChildren(); $('#wishlist-search').value = ''; $('#wishlist-search-status').textContent = '';
        $('#wishlist-name').value = result.name.slice(0, 120); setLocation(result); $('#wishlist-name').focus();
      };
      $('#wishlist-search-results').append(button);
    }
  }, message => { if (dialog.open) $('#wishlist-search-status').textContent = message; });
  function hasEntry() { return Boolean(editId || ['name', 'country', 'notes', 'lat', 'lng', 'search'].some(field => $(`#wishlist-${field}`).value) || $('#wishlist-status').value !== 'wishlist'); }
  function locationHint() {
    const lat = $('#wishlist-lat').value, lng = $('#wishlist-lng').value;
    $('#wishlist-location-hint').textContent = lat && lng ? `Localização: ${lat}, ${lng}. Aplique o lugar e salve a wish list para guardar.` : 'Sem localização. O lugar pode ser salvo só na lista.';
  }
  function setLocation(location) {
    if (busy || !available()) return;
    $('#wishlist-lat').value = location.lat; $('#wishlist-lng').value = location.lng;
    const country = countryAt(location.lat, location.lng); $('#wishlist-country').value = country.countryId ? country.countryName : '';
    map?.candidate(location); locationHint();
  }
  function resetEntry() {
    geocoder.cancel(); $('#wishlist-search-results').replaceChildren(); $('#wishlist-search-status').textContent = '';
    $('#wishlist-entry-form').reset(); $('#wishlist-coordinates').open = false; editId = null; map?.candidate(null); locationHint();
    $('#wishlist-entry-title').textContent = 'Adicionar um lugar'; $('#wishlist-entry-save').textContent = 'Adicionar à lista'; $('#wishlist-edit-cancel').hidden = true;
  }
  function editItem(id) {
    if (busy || !available()) return;
    const item = draft.items.find(i => i.id === id); if (!item) return;
    resetEntry(); editId = item.id;
    $('#wishlist-name').value = item.name; $('#wishlist-country').value = item.country; $('#wishlist-notes').value = item.notes; $('#wishlist-status').value = wishlistStatus(item);
    $('#wishlist-lat').value = item.location?.lat ?? ''; $('#wishlist-lng').value = item.location?.lng ?? ''; locationHint(); map?.candidate(item.location);
    $('#wishlist-entry-title').textContent = `Editar ${item.name}`; $('#wishlist-entry-save').textContent = 'Aplicar alteração'; $('#wishlist-edit-cancel').hidden = false; $('#wishlist-name').focus();
  }
  function showMap(show) {
    $('#wishlist-map-panel').hidden = !show; $('.wishlist-explorer').classList.toggle('wishlist-list-only', !show);
    $('#wishlist-view-map').setAttribute('aria-pressed', String(show)); $('#wishlist-view-list').setAttribute('aria-pressed', String(!show));
    if (show) map?.fit();
  }
  function privacyHint() {
    $('#wishlist-visibility').disabled = !currentUser();
    $('#wishlist-privacy-hint').textContent = !currentUser() ? 'Sem login, sua lista fica privada neste navegador. Entre na conta e use “Enviar meus dados locais” para levar a lista à nuvem.' : $('#wishlist-visibility').value === 'public' ? 'A lista inteira aparecerá para visitantes quando seu perfil permitir que outras pessoas o encontrem.' : 'Sua lista fica acessível somente para você, mesmo com o perfil público.';
  }
  function render() {
    const filter = $('#wishlist-filter').value, items = draft.items.filter(item => filter === 'all' || wishlistStatus(item) === filter);
    $('#wishlist-items').innerHTML = items.length ? items.map(item => `<li data-wish-id="${esc(item.id)}"><div><strong>${esc(item.name)}</strong>${item.country ? `<small>${esc(item.country)}</small>` : ''}<span class="wishlist-status wishlist-status-${wishlistStatus(item)}">${wishlistStatuses[wishlistStatus(item)]}</span>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}${!hasWishlistLocation(item) ? '<small class="wishlist-unlocated">Sem localização · edite para colocar no mapa</small>' : ''}</div><div class="wishlist-item-actions">${hasWishlistLocation(item) ? `<button type="button" class="text-button" data-wish-map aria-label="Ver ${esc(item.name)} no mapa">Ver no mapa</button>` : ''}<button type="button" class="text-button" data-wish-visited aria-label="${wishlistStatus(item) === 'visited' ? 'Voltar a desejar' : 'Marcar como visitado'} ${esc(item.name)}">${wishlistStatus(item) === 'visited' ? 'Voltar a desejar' : 'Já visitei'}</button><button type="button" class="text-button" data-wish-edit aria-label="Editar lugar ${esc(item.name)}">Editar</button><button type="button" class="text-button" data-wish-remove aria-label="Remover lugar ${esc(item.name)}">Remover</button></div></li>`).join('') : `<li class="wishlist-empty">${draft.items.length ? 'Nenhum lugar nesta etapa. Escolha outro filtro.' : 'O próximo destino começa com uma vontade. Busque um lugar ou toque no mapa para começar.'}</li>`;
    $('#wishlist-draft-state').textContent = edited ? 'Alterações no formulário. Clique em “Salvar wish list” para guardar.' : `${draft.items.length} de 200 lugares · não entram nas estatísticas de viagens realizadas.`;
    const located = items.filter(hasWishlistLocation).length;
    $('#wishlist-map-summary').textContent = `${located} no mapa · ${items.length - located} sem localização · ${items.length} de ${draft.items.length} lugares`;
    map?.update(items);
    $('#wishlist-items').querySelectorAll('[data-wish-id]').forEach(row => {
      row.querySelector('[data-wish-edit]').onclick = () => editItem(row.dataset.wishId);
      const view = row.querySelector('[data-wish-map]');
      if (view) view.onclick = () => { if (busy || !available()) return; showMap(true); map?.focus(row.dataset.wishId); $('#wishlist-map-panel').scrollIntoView({ block: 'nearest' }); };
      row.querySelector('[data-wish-visited]').onclick = () => {
        if (busy || !available()) return;
        if (editId === row.dataset.wishId) { $('#wishlist-message').textContent = 'Aplique ou cancele a edição deste lugar antes de mudar sua etapa.'; return; }
        draft = cleanWishlist({ ...draft, items: draft.items.map(item => item.id === row.dataset.wishId ? { ...item, status: wishlistStatus(item) === 'visited' ? 'wishlist' : 'visited' } : item) }); edited = true; render();
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
    if (!edited && !hasEntry()) {
      draft = cleanWishlist(saved); version = saved.localVersion || null; $('#wishlist-visibility').value = draft.is_public ? 'public' : 'private'; render(); privacyHint();
    }
    $('#wishlist-resolve').hidden = !currentUser() || !saved.conflict || Boolean(resolution);
    showDiagnostic($('#wishlist-diagnostic'), currentUser() && saved.cloudDirty ? callbacks.diagnostic() : '');
    $('#wishlist-reconnect').hidden = !needsReconnect();
    $('#wishlist-message').textContent = currentUser() ? saved.cloudDirty ? document.querySelector('#sync-status').textContent : saved.revision ? 'Wish list salva na sua conta.' : 'Sua lista começa privada. Salve para sincronizar.' : 'A lista salva fica neste navegador e entra no backup do seu atlas.';
  }
  async function open() {
    if (!available()) return notify('Aguarde a atualização da sua conta.');
    const token = ++epoch; resolution = null; edited = false; resetEntry(); $('#wishlist-filter').value = 'all'; $('#wishlist-message').textContent = '';
    const saved = await getWishlist(); if (token !== epoch || !available()) return;
    draft = cleanWishlist(saved); version = saved.localVersion || null; $('#wishlist-visibility').value = draft.is_public && currentUser() ? 'public' : 'private';
    document.querySelector('#account-dialog').close(); if (!dialog.open) dialog.showModal();
    if (!map) map = createWishlistMap({ element: $('#wishlist-map'), countries: callbacks.countries, select: editItem, pick: location => { if (busy || !available()) return; setLocation(location); $('#wishlist-name').focus(); } });
    showMap(true); render(); privacyHint(); await refresh();
  }
  $('#wishlist-view-map').onclick = () => showMap(true); $('#wishlist-view-list').onclick = () => showMap(false);
  $('#wishlist-filter').onchange = render; $('#wishlist-map-fit').onclick = () => map?.fit();
  $('#wishlist-search').oninput = () => geocoder.search($('#wishlist-search').value);
  $('#wishlist-location-clear').onclick = () => { if (busy || !available()) return; $('#wishlist-lat').value = ''; $('#wishlist-lng').value = ''; map?.candidate(null); locationHint(); };
  for (const field of ['lat', 'lng']) $(`#wishlist-${field}`).oninput = () => {
    map?.candidate(null); locationHint();
    try { map?.candidate(normalizeCoordinates($('#wishlist-lat').value, $('#wishlist-lng').value)); } catch { /* Partial coordinates remain editable. */ }
  };
  $('#wishlist-visibility').onchange = () => { edited = true; draft.is_public = $('#wishlist-visibility').value === 'public' && Boolean(currentUser()); privacyHint(); render(); };
  $('#wishlist-entry-form').onsubmit = event => {
    event.preventDefault(); if (busy || !available()) return;
    if ($('#wishlist-search').value.trim()) { $('#wishlist-message').textContent = 'Escolha um resultado da busca ou limpe a busca para adicionar o lugar manualmente.'; return; }
    try {
      const location = $('#wishlist-lat').value || $('#wishlist-lng').value ? normalizeCoordinates($('#wishlist-lat').value, $('#wishlist-lng').value) : undefined;
      const item = { id: editId || crypto.randomUUID(), name: $('#wishlist-name').value, country: $('#wishlist-country').value, notes: $('#wishlist-notes').value, status: $('#wishlist-status').value, ...(location ? { location } : {}) };
      draft = cleanWishlist({ ...draft, items: editId ? draft.items.map(i => i.id === editId ? item : i) : [...draft.items, item] });
      edited = true; resetEntry(); render(); $('#wishlist-message').textContent = '';
    } catch (error) { $('#wishlist-message').textContent = error.message; }
  };
  $('#wishlist-edit-cancel').onclick = resetEntry;
  $('#wishlist-save').onclick = async () => {
    if (busy || !available()) return;
    if (hasEntry()) { $('#wishlist-message').textContent = 'Clique em “Adicionar à lista” ou “Aplicar alteração” para incluir o lugar antes de salvar.'; return; }
    const token = epoch; busy = true;
    dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = true; });
    try {
      await saveWishlist({ ...draft, is_public: $('#wishlist-visibility').value === 'public' && Boolean(currentUser()) }, version, resolution);
      if (token !== epoch) return;
      const saved = await getWishlist(); resolution = null; $('#wishlist-resolve').hidden = true; version = saved.localVersion; draft = cleanWishlist(saved); edited = false; render();
      $('#wishlist-message').textContent = currentUser() ? 'Wish list salva neste dispositivo. Aguardando sincronização…' : 'Wish list salva neste navegador.';
      callbacks.afterMutation();
    } catch (error) { if (token === epoch) $('#wishlist-message').textContent = error.message; }
    finally { if (token === epoch) { busy = false; dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); privacyHint(); } }
  };
  $('#wishlist-resolve').onclick = async () => {
    if (busy || !available() || !currentUser()) return;
    if (edited || hasEntry()) {
      $('#wishlist-message').textContent = 'Salve as alterações deste formulário antes de combinar as listas.'; return;
    }
    const token = epoch, owner = currentUser().id;
    busy = true; dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = true; });
    try {
      const local = await getWishlist(), remote = await readCloudWishlist(owner);
      if (token !== epoch || currentUser()?.id !== owner || !available()) return;
      const latest = await getWishlist();
      if (token !== epoch || currentUser()?.id !== owner || !available()) return;
      if (latest.localVersion !== local.localVersion) throw new Error('A lista mudou durante a consulta. Tente combinar novamente.');
      draft = combineWishlistForReview(local, remote); version = local.localVersion;
      resolution = { revision: remote.revision, cloudBase: cleanWishlist(remote) };
      edited = true; $('#wishlist-visibility').value = 'private'; render(); privacyHint();
      $('#wishlist-resolve').hidden = true;
      $('#wishlist-message').textContent = 'As duas listas estão combinadas para revisão. Lugares com versões diferentes foram mantidos separadamente. Confira os itens e clique em “Salvar wish list”. A lista começa privada.';
    } catch (error) { if (token === epoch) $('#wishlist-message').textContent = error.message; }
    finally { if (token === epoch) { busy = false; dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); privacyHint(); } }
  };
  $('#wishlist-reconnect').onclick = () => {
    if (busy || !available()) return;
    if (edited || hasEntry()) {
      $('#wishlist-message').textContent = 'Salve as alterações deste formulário antes de entrar novamente.'; return;
    }
    dialog.close(); callbacks.reconnect();
  };
  function clear() { dialog.querySelectorAll('input,textarea,select,button').forEach(control => { control.disabled = false; }); epoch++; showDiagnostic($('#wishlist-diagnostic'), ''); resolution = null; $('#wishlist-resolve').hidden = true; draft = emptyWishlist(); version = null; edited = false; busy = false; resetEntry(); map?.destroy(); map = null; $('#wishlist-items').replaceChildren(); $('#wishlist-map-summary').textContent = ''; $('#wishlist-message').textContent = ''; $('#wishlist-draft-state').textContent = ''; $('#wishlist-privacy-hint').textContent = ''; $('#wishlist-visibility').value = 'private'; $('#wishlist-save').disabled = false; }
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('#wishlist-close').onclick = () => dialog.close(); dialog.addEventListener('close', clear);
  document.querySelector('#wishlist-button').onclick = () => open().catch(error => notify(error.message, true));
  document.querySelector('#profile-wishlist').onclick = () => open().catch(error => notify(error.message, true));
  return { refresh, reset() { clear(); dialog.close(); }, open };
}
