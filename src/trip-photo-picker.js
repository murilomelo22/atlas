import { currentUser } from './cloud.js';
import { currentAccountId } from './db.js';
import { reviewPhotos, importedPhotoId, importReviewPhotos } from './trip-media-import.js';
import { loadCloudMedia } from './cloud-media.js';
import { escapeHTML as esc } from './ui.js';
import { visitedDestinations } from './dates.js';
import { stopForDestination } from './trip-photo-location.js';

export function createTripPhotoPicker({ container, trip, valid, mutate, existing, reload }) {
  const section = document.createElement('section'); section.className = 'review-photo-picker'; section.hidden = true;
  section.innerHTML = '<h4>Fotos das minhas avaliações</h4><p class="field-hint">Escolha um destino da trip para selecionar todas as fotos da sua avaliação de uma vez. As cópias serão vistas pelos participantes e, se a trip for pública, por seus visitantes.</p><label>Lugar<select data-review-destination><option value="">Todos os meus lugares</option></select></label><div class="review-photo-tools"><button type="button" class="quiet" data-review-select-all disabled>Selecionar todas</button><button type="button" class="text-button" data-review-clear disabled>Desmarcar todas</button></div><div class="review-photo-grid"></div><p class="field-hint" data-review-status role="status"></p><div class="account-actions"><button type="button" class="primary" data-review-import disabled>Importar selecionadas</button><button type="button" class="text-button" data-review-cancel>Cancelar</button></div>';
  const uploadForm = container.querySelector('.trip-photo-form');
  if (uploadForm) uploadForm.before(section); else container.append(section);
  const $ = selector => section.querySelector(selector), selection = new Set(), urls = [], busyPhotos = new Set();
  let sources = [], generation = 0, owner, observer;
  const alive = token => token === generation && valid() && owner === currentUser()?.id && owner === currentAccountId() && !section.hidden;
  function close() { generation++; observer?.disconnect(); urls.splice(0).forEach(url => URL.revokeObjectURL(url)); selection.clear(); sources = []; section.hidden = true; $('.review-photo-grid').replaceChildren(); updateControls(); }
  function visibleSources() { const place = $('[data-review-destination]').value; return sources.filter(source => place === '__trip__' ? source.inTrip : !place || source.destination.id === place); }
  function updateControls() {
    const place = $('[data-review-destination]').value, visible = visibleSources().filter(source => !source.copied);
    $('[data-review-import]').disabled = !selection.size;
    $('[data-review-select-all]').disabled = !visible.some(source => !selection.has(source.photo.id));
    $('[data-review-clear]').disabled = !visible.some(source => selection.has(source.photo.id));
    $('[data-review-select-all]').textContent = place === '__trip__' ? 'Selecionar todas da trip' : place ? 'Selecionar todas deste lugar' : 'Selecionar todas';
    $('[data-review-clear]').textContent = place === '__trip__' ? 'Desmarcar da trip' : place ? 'Desmarcar deste lugar' : 'Desmarcar todas';
  }
  function count() { updateControls(); $('[data-review-status]').textContent = `${selection.size} selecionada${selection.size === 1 ? '' : 's'} no total`; }
  function showSelection() { $('.review-photo-grid').querySelectorAll('[data-review-photo]').forEach(input => input.checked = selection.has(input.dataset.reviewPhoto)); count(); }
  async function preview(element, source, token) {
    if (busyPhotos.has(source.photo.id) || !alive(token)) return;
    busyPhotos.add(source.photo.id);
    try {
      const photo = await loadCloudMedia(source.photo, { parts: ['thumbnail'], authenticated: true, persist: true, valid: () => alive(token) });
      if (!alive(token) || !element.isConnected || !(photo.thumbnail instanceof Blob)) return;
      const url = URL.createObjectURL(photo.thumbnail); urls.push(url);
      const image = document.createElement('img'); image.src = url; image.alt = photo.caption || source.destination.name; element.replaceChildren(image);
    } catch { /* A placeholder keeps selection available if the preview failed. */ }
    finally { busyPhotos.delete(source.photo.id); }
  }
  function render() {
    observer?.disconnect(); urls.splice(0).forEach(url => URL.revokeObjectURL(url));
    const token = generation, visible = visibleSources();
    $('.review-photo-grid').innerHTML = visible.map(({ photo, destination, copied }) => `<label class="review-photo-option"><input type="checkbox" data-review-photo="${esc(photo.id)}" ${copied ? 'disabled' : selection.has(photo.id) ? 'checked' : ''}><span class="review-photo-preview" data-preview-photo="${esc(photo.id)}">◇</span><span><strong>${esc(destination.name)}</strong><small>${esc(photo.caption || 'Sem legenda')}${copied ? ' · Já na trip' : ''}</small></span></label>`).join('') || '<p class="field-hint">Não há fotos salvas para este lugar.</p>';
    $('.review-photo-grid').querySelectorAll('input').forEach(input => input.onchange = () => { if (input.checked) selection.add(input.dataset.reviewPhoto); else selection.delete(input.dataset.reviewPhoto); count(); });
    observer = new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) return; observer.unobserve(entry.target); const source = visible.find(s => s.photo.id === entry.target.dataset.previewPhoto); if (source) preview(entry.target, source, token); }), { root: $('.review-photo-grid'), rootMargin: '40px' });
    $('.review-photo-grid').querySelectorAll('[data-preview-photo]').forEach(element => observer.observe(element)); count();
  }
  async function open() {
    close(); owner = currentUser()?.id; section.hidden = false; const token = generation;
    $('[data-review-status]').textContent = 'Buscando fotos das suas avaliações…'; $('[data-review-import]').disabled = true;
    const photos = await reviewPhotos(); if (!alive(token)) return;
    const visited = new Set(visitedDestinations([...new Map(photos.map(source => [source.destination.id, source.destination])).values()]).map(destination => destination.id));
    const inTrip = destination => visited.has(destination.id) && Boolean(stopForDestination(trip, destination));
    const copied = new Set(existing().map(photo => photo.id));
    sources = await Promise.all(photos.map(async source => ({ ...source, inTrip: inTrip(source.destination), copied: copied.has(await importedPhotoId(owner, trip.id, source.photo)) }))); if (!alive(token)) return;
    const options = matching => [...new Map(sources.filter(source => source.inTrip === matching).map(source => [source.destination.id, source.destination.name]))].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    const tripPlaces = options(true), otherPlaces = options(false);
    $('[data-review-destination]').innerHTML = (tripPlaces ? '<option value="__trip__">Todos os destinos desta trip</option>' : '') + '<option value="">Todos os meus lugares</option>' + (tripPlaces ? `<optgroup label="Destinos desta trip">${tripPlaces}</optgroup>` : '') + (otherPlaces ? `<optgroup label="Outros lugares da minha coleção">${otherPlaces}</optgroup>` : ''); render();
    $('[data-review-destination]').focus({ preventScroll: true }); section.scrollIntoView({ block: 'nearest' });
  }
  $('[data-review-destination]').onchange = render; $('[data-review-cancel]').onclick = close;
  $('[data-review-select-all]').onclick = () => { visibleSources().filter(source => !source.copied).forEach(source => selection.add(source.photo.id)); showSelection(); };
  $('[data-review-clear]').onclick = () => { visibleSources().forEach(source => selection.delete(source.photo.id)); showSelection(); };
  $('[data-review-import]').onclick = async () => {
    if (!selection.size) return;
    await mutate(async () => {
    const token = generation;
    try {
      const result = await importReviewPhotos({ trip, photoIds: [...selection], valid: () => alive(token), progress: message => { $('[data-review-status]').textContent = message; } });
      if (!alive(token)) return; close(); await reload();
      document.getElementById('trip-message').textContent = result.imported ? `${result.imported} ${result.imported === 1 ? 'mídia importada' : 'mídias importadas'} das suas avaliações.` : 'As mídias selecionadas já estão na trip.';
    } catch (error) { if (alive(token)) { $('[data-review-status]').textContent = `${error.message} Você pode tentar novamente; as mídias concluídas serão mantidas.`; await reload(); } throw error; }
    });
    updateControls();
  };
  return { open, close, destroy: close, updateControls };
}
