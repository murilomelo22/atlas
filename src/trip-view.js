import { currentUser, signedURL } from './cloud.js';
import { createGallery } from './gallery.js';
import { mediaKind, mediaLabel } from './media.js';
import { displayDate, dateDays } from './dates.js';
import { countryAt } from './geography.js';
import { escapeHTML as esc } from './ui.js';
import { orderedTripStops, tripRouteDistance, createTripRoute } from './trip-route.js';
import { photosForTripStop } from './trip-photo-location.js';

export function createTripViewer({ countries, onClose }) {
  const dialog = document.createElement('dialog'); dialog.id = 'trip-view-dialog'; dialog.className = 'trip-view-dialog'; dialog.setAttribute('aria-labelledby', 'trip-view-title'); document.body.append(dialog);
  let generation = 0, actor, trip, options, route, observer, busy = false, photos = [], queue = [], active = 0;
  const previews = new Map();
  const $ = selector => dialog.querySelector(selector);
  const valid = token => token === generation && dialog.open && actor === (currentUser()?.id || null);
  function status(message) { $('[data-view-status]').textContent = message; }
  function release() { generation++; if(dialog.open)document.getElementById('gallery-dialog')?.close();observer?.disconnect(); route?.destroy(); route = null; queue = []; previews.clear(); photos = []; }
  function close(reason = 'close') { release(); if (dialog.open) dialog.close(reason); }
  dialog.addEventListener('close', () => { if (dialog.open) return; release(); onClose?.(dialog.returnValue); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  function paintActions() {
    const signedIn = Boolean(currentUser()), member = options.member;
    $('[data-view-save]').hidden = options.owner || !trip.owner_id;
    $('[data-view-save]').textContent = options.saved ? '✓ Salva na minha coleção' : 'Salvar na minha coleção';
    const join = $('[data-view-join]'); join.hidden = options.owner || !trip.owner_id || Boolean(member);
    join.disabled = busy || ['pending', 'rejected', 'approved'].includes(options.joinStatus);
    join.textContent = options.joinStatus === 'pending' ? 'Pedido enviado' : options.joinStatus === 'rejected' ? 'Pedido não aprovado' : options.joinStatus === 'approved' ? 'Participação encerrada' : signedIn ? 'Pedir para participar' : 'Criar conta para participar';
    $('[data-view-signin]').hidden = signedIn || !trip.owner_id;
    $('[data-view-manage]').hidden = !options.manage;
    $('[data-view-manage]').textContent = options.owner ? 'Editar trip' : member?.status === 'invited' ? 'Responder ao convite' : 'Ver grupo e memórias';
    $('[data-view-membership]').hidden = !member;
    $('[data-view-membership]').textContent = member?.status === 'invited' ? 'Você recebeu um convite para esta trip.' : 'Você participa desta trip.';
  }
  async function action(fn) {
    if (busy) return;
    busy = true; const token = generation;
    const buttons = [...dialog.querySelectorAll('button')].map(button => [button, button.disabled]); buttons.forEach(([button]) => button.disabled = true);
    try { await fn(); }
    catch (error) { if (valid(token)) status(error.message || 'Não foi possível concluir. Tente novamente.'); }
    finally { if (token === generation) { busy = false; buttons.forEach(([button, disabled]) => { if (button.isConnected) button.disabled = disabled; }); paintActions(); } }
  }
  function auth(mode) { options.auth(mode); status('Entre ou crie uma conta para salvar a trip e pedir participação.'); }
  async function loadPreview(element, photo, index, token) {
    try {
      let url = previews.get(photo.id);
      if (!url) { url = await signedURL('atlas-trip-media', photo.thumbnail_path || photo.storage_path, Boolean(actor)); if (!valid(token)) return; previews.set(photo.id, url); }
      if (!valid(token) || !element.isConnected) return;
      const image = document.createElement('img'); image.src = url; image.alt = photo.caption || mediaLabel(photo); image.loading = 'lazy'; element.querySelector('[data-preview-face]').replaceChildren(image);
      if (index != null) route?.thumbnail(index, url);
    } catch { if (valid(token) && element.isConnected) element.querySelector('[data-preview-face]').textContent = 'Prévia indisponível'; }
  }
  function pump(token) {
    while (active < 2 && queue.length && valid(token)) {
      const item = queue.shift(); active++;
      loadPreview(item.element, item.photo, item.index, token).finally(() => { if (token === generation) { active--; if (valid(token)) pump(token); } });
    }
  }
  function gallery(items, index) {
    const token = generation;
    createGallery().open(items, index, { load: async (photo, { motion = false } = {}) => {
      if (!valid(token)) throw new DOMException('A trip mudou.', 'AbortError');
      const url = await signedURL('atlas-trip-media', photo.storage_path, Boolean(actor));
      const motionURL = motion && photo.motion_path ? await signedURL('atlas-trip-media', photo.motion_path, Boolean(actor)) : photo.motionURL;
      if (!valid(token)) throw new DOMException('A conta ou a trip mudou.', 'AbortError');
      return { ...photo, url, motionURL, thumbnailURL: previews.get(photo.id) };
    } });
  }
  function photoButtons(items, place, stopIndex) {
    return items.slice(0, 4).map((photo, index) => `<button type="button" class="trip-view-photo" data-view-photo="${esc(photo.id)}" data-photo-index="${index}" data-place-index="${stopIndex ?? ''}" aria-label="Abrir ${mediaLabel(photo).toLowerCase()} ${index + 1} de ${esc(place)}"><span data-preview-face>◇</span>${mediaKind(photo) !== 'image' ? `<small class="media-badge">▶ ${mediaLabel(photo)}</small>` : ''}${index === 3 && items.length > 4 ? `<span class="trip-photo-more">+${items.length - 4}</span>` : ''}</button>`).join('');
  }
  function renderMemories(stops, token) {
    const groups = stops.map(stop => photosForTripStop(trip, photos, stop));
    const assigned = new Set(groups.flat().map(photo => photo.id)), other = photos.filter(photo => !assigned.has(photo.id));
    $('[data-view-timeline]').innerHTML = stops.map((stop, index) => `<article class="trip-memory-card" data-memory-stop="${index}"><span class="trip-memory-number" aria-hidden="true">${index + 1}</span><header><div><p class="eyebrow">${esc(dateDays(stop.date) != null ? displayDate(stop.date) : 'Sem data · ordem do roteiro')}</p><h3>${esc(stop.name)}</h3><p class="trip-memory-country">${esc(countryAt(Number(stop.lat), Number(stop.lng))?.countryName || '')}${stop.departure ? ` · até ${esc(displayDate(stop.departure))}` : ''}</p></div><button type="button" class="trip-locate-button quiet" data-view-stop="${index}" aria-label="Localizar ${esc(stop.name)} no mapa" title="Localizar no mapa">⌖</button></header>${stop.notes ? `<p class="trip-memory-notes">${esc(stop.notes)}</p>` : ''}${groups[index].length ? `<div class="trip-view-photos">${photoButtons(groups[index], stop.name, index)}</div><small class="trip-memory-count">${groups[index].length} ${groups[index].length === 1 ? 'memória' : 'memórias'} deste lugar</small>` : '<p class="trip-memory-empty">Um lugar na história, esperando suas fotos.</p>'}</article>`).join('') || '<p class="trip-memory-empty">O roteiro desta trip ainda está sendo escrito.</p>';
    const extra = $('[data-view-extra]'); extra.hidden = !other.length;
    extra.innerHTML = other.length ? `<h3>Mais memórias da trip</h3><div class="trip-view-photos">${photoButtons(other, 'álbum da trip')}</div><small>${other.length} mídias no álbum geral</small>` : '';
    dialog.querySelectorAll('[data-view-stop]').forEach(button => button.onclick = () => { const index = Number(button.dataset.viewStop); highlight(index); route.focus(index); $('[data-view-map]').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    dialog.querySelectorAll('[data-view-photo]').forEach(button => button.onclick = () => { const index = button.dataset.placeIndex; gallery(index === '' ? other : groups[Number(index)], Number(button.dataset.photoIndex)); });
    observer?.disconnect();
    observer = new IntersectionObserver(entries => { for (const entry of entries) { if (!entry.isIntersecting) continue; observer.unobserve(entry.target); const photo = photos.find(item => item.id === entry.target.dataset.viewPhoto); if (photo) queue.push({ element: entry.target, photo, index: entry.target.dataset.photoIndex === '0' && entry.target.dataset.placeIndex !== '' ? Number(entry.target.dataset.placeIndex) : null }); } pump(token); }, { root: dialog, rootMargin: '120px' });
    dialog.querySelectorAll('[data-view-photo]').forEach(button => observer.observe(button));
  }
  function highlight(index) { dialog.querySelectorAll('[data-memory-stop]').forEach(card => card.classList.toggle('is-selected', Number(card.dataset.memoryStop) === index)); }
  async function open(value, actions) {
    release(); busy = false; active = 0; trip = value; options = actions; actor = currentUser()?.id || null; const token = generation, stops = orderedTripStops(trip);
    dialog.innerHTML = `<header class="trip-view-heading"><a class="trip-view-brand" href="#" aria-label="Atlas Pessoal">Atlas <span>Pessoal</span></a><button type="button" class="icon-button" data-view-close aria-label="Fechar visualização da trip">×</button></header><section class="trip-view-hero"><div class="trip-view-cover" hidden></div><div class="trip-view-intro"><p class="eyebrow">UMA VIAGEM, MUITAS MEMÓRIAS</p><h2 id="trip-view-title">${esc(trip.name)}</h2>${trip.notes ? `<p class="trip-view-description">${esc(trip.notes)}</p>` : '<p class="trip-view-description">Cada parada, um novo capítulo para revisitar.</p>'}<div class="trip-view-stats"><span>${stops.length} ${stops.length === 1 ? 'destino' : 'destinos'}</span><span>${tripRouteDistance(stops).toLocaleString('pt-BR')} km em linha reta</span><span data-view-visibility>${trip.is_public ? 'Compartilhada por link' : 'Trip privada'}</span></div><div class="trip-view-actions"><button type="button" class="primary" data-view-share ${trip.owner_id ? '' : 'disabled'}>${trip.is_public ? 'Compartilhar link' : options.owner && trip.owner_id ? 'Criar link para visualizar' : 'Link restrito ao grupo'}</button><button type="button" class="quiet" data-view-manage></button><button type="button" class="quiet" data-view-save>Salvar na minha coleção</button><button type="button" class="quiet" data-view-join></button><button type="button" class="text-button" data-view-signin>Já tenho conta</button></div><p class="field-hint" data-view-membership hidden></p><p class="trip-view-status" data-view-status role="status"></p></div></section><div class="trip-view-layout"><aside class="trip-view-map-panel"><div class="trip-view-map-heading"><div><p class="eyebrow">O CAMINHO DA VIAGEM</p><h3>Destino após destino</h3></div><button type="button" class="quiet" data-view-fit aria-label="Enquadrar rota completa">⌖</button></div><div class="trip-view-map" data-view-map aria-label="Rota cronológica da trip"></div><p class="trip-route-note">Toque em um lugar no mapa para revisitar suas fotos. As linhas conectam os destinos em ordem de data.</p>${stops.some(stop => dateDays(stop.date) == null) ? '<p class="trip-route-note">Paradas sem data aparecem ao final, na ordem do roteiro.</p>' : ''}</aside><section class="trip-view-story"><div class="trip-view-story-heading"><p class="eyebrow">CAPÍTULOS DA VIAGEM</p><h3>Uma lembrança de cada lugar</h3></div><div class="trip-view-timeline" data-view-timeline></div><section class="trip-view-extra" data-view-extra hidden></section></section></div>`;
    $('[data-view-close]').onclick = () => close(); $('.trip-view-brand').onclick = event => { event.preventDefault(); close(); };
    const refresh=document.createElement('button');refresh.type='button';refresh.className='text-button';refresh.dataset.viewRefresh='';refresh.textContent='Atualizar trip';$('[data-view-close]').before(refresh);refresh.onclick=()=>action(actions.refresh);
    $('[data-view-manage]').onclick = () => { close('edit'); actions.edit(); };
    $('[data-view-share]').disabled = !trip.owner_id || !trip.is_public && !options.owner;
    $('[data-view-share]').onclick = () => action(async () => { await actions.share(); if (valid(token)) { $('[data-view-visibility]').textContent = trip.is_public ? 'Compartilhada por link' : 'Trip privada'; $('[data-view-share]').textContent = trip.is_public ? 'Compartilhar link' : 'Criar link para visualizar'; } });
    $('[data-view-save]').onclick = () => { if (!currentUser()) return auth('signup'); action(async () => { const saved = await actions.save(!actions.saved); if (valid(token)) { actions.saved = saved; status(saved ? 'Trip salva na sua coleção.' : 'Trip retirada da sua coleção.'); } }); };
    $('[data-view-join]').onclick = () => { if (!currentUser()) return auth('signup'); action(async () => { const result = await actions.join(); if (valid(token)) { actions.joinStatus = result; status(result === 'pending' ? 'Pedido enviado. O organizador pode aprovar sua participação.' : 'Seu pedido já foi registrado.'); } }); };
    $('[data-view-signin]').onclick = () => auth('login'); paintActions();
    if (!dialog.open) dialog.showModal();
    route = createTripRoute({ element: $('[data-view-map]'), countries, stops, select: index => { highlight(index); route.focus(index); $(`[data-memory-stop="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } });
    $('[data-view-fit]').onclick = () => route.fit(); renderMemories(stops, token);
    if (trip.cover_path || trip.cover_data) {
      try { const url = trip.cover_data || await signedURL('atlas-trip-covers', trip.cover_path, Boolean(actor)); if (valid(token)) { const image = document.createElement('img'); image.src = url; image.alt = `Capa de ${trip.name}`; $('.trip-view-cover').replaceChildren(image); $('.trip-view-cover').hidden = false; } } catch { /* The itinerary remains available without its cover. */ }
    }
    if (!valid(token)) return;
    try { const items = await actions.photos(() => valid(token)); if (!valid(token)) return; photos = items; renderMemories(stops, token); }
    catch (error) { if (valid(token)) status(`As fotos não carregaram. ${error.message || 'Reabra a trip para tentar novamente.'}`); }
  }
  return { open, close, reset(){close('reset');dialog.replaceChildren();trip=null;options=null;actor=null;busy=false;},isOpen: () => dialog.open, tripID: () => trip?.id, actor: () => actor, valid: () => dialog.open && actor === (currentUser()?.id || null) };
}
