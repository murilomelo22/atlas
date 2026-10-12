import { currentUser } from './cloud.js';
import { currentAccountId } from './db.js';
import { reviewPhotos, importedPhotoId, importReviewPhotos } from './trip-media-import.js';
import { loadCloudMedia } from './cloud-media.js';
import { escapeHTML as esc } from './ui.js';

export function createTripPhotoPicker({ container, trip, valid, mutate, existing, reload }) {
  const section = document.createElement('section'); section.className = 'review-photo-picker'; section.hidden = true;
  section.innerHTML = '<h4>Fotos das minhas avaliações</h4><p class="field-hint">Escolha as fotos e memórias que deseja levar para esta trip. Elas serão vistas pelos participantes e, se a trip for pública, por seus visitantes.</p><label>Lugar<select data-review-destination><option value="">Todos os lugares</option></select></label><div class="review-photo-grid"></div><p class="field-hint" data-review-status role="status"></p><div class="account-actions"><button type="button" class="primary" data-review-import disabled>Importar selecionadas</button><button type="button" class="text-button" data-review-cancel>Cancelar</button></div>';
  const uploadForm = container.querySelector('.trip-photo-form');
  if (uploadForm) uploadForm.before(section); else container.append(section);
  const $ = selector => section.querySelector(selector), selection = new Set(), urls = [], busyPhotos = new Set();
  let sources = [], generation = 0, owner, observer;
  const alive = token => token === generation && valid() && owner === currentUser()?.id && owner === currentAccountId() && !section.hidden;
  function close() { generation++; observer?.disconnect(); urls.splice(0).forEach(url => URL.revokeObjectURL(url)); selection.clear(); section.hidden = true; $('[data-review-import]').disabled = true; $('.review-photo-grid').replaceChildren(); }
  function count() { $('[data-review-import]').disabled = !selection.size; $('[data-review-status]').textContent = `${selection.size} selecionada${selection.size === 1 ? '' : 's'}`; }
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
    const token = generation, selectedPlace = $('[data-review-destination]').value;
    const visible = sources.filter(source => !selectedPlace || source.destination.id === selectedPlace);
    $('.review-photo-grid').innerHTML = visible.map(({ photo, destination, copied }) => `<label class="review-photo-option"><input type="checkbox" data-review-photo="${esc(photo.id)}" ${copied ? 'disabled' : selection.has(photo.id) ? 'checked' : ''}><span class="review-photo-preview" data-preview-photo="${esc(photo.id)}">◇</span><span><strong>${esc(destination.name)}</strong><small>${esc(photo.caption || 'Sem legenda')}${copied ? ' · Já na trip' : ''}</small></span></label>`).join('') || '<p class="field-hint">Não há fotos salvas para este lugar.</p>';
    $('.review-photo-grid').querySelectorAll('input').forEach(input => input.onchange = () => { if (input.checked) selection.add(input.dataset.reviewPhoto); else selection.delete(input.dataset.reviewPhoto); count(); });
    observer = new IntersectionObserver(entries => entries.forEach(entry => { if (!entry.isIntersecting) return; observer.unobserve(entry.target); const source = visible.find(s => s.photo.id === entry.target.dataset.previewPhoto); if (source) preview(entry.target, source, token); }), { root: $('.review-photo-grid'), rootMargin: '40px' });
    $('.review-photo-grid').querySelectorAll('[data-preview-photo]').forEach(element => observer.observe(element)); count();
  }
  async function open() {
    close(); owner = currentUser()?.id; section.hidden = false; const token = generation;
    $('[data-review-status]').textContent = 'Buscando fotos das suas avaliações…'; $('[data-review-import]').disabled = true;
    const photos = await reviewPhotos(); if (!alive(token)) return;
    const copied = new Set(existing().map(photo => photo.id));
    sources = await Promise.all(photos.map(async source => ({ ...source, copied: copied.has(await importedPhotoId(owner, trip.id, source.photo)) }))); if (!alive(token)) return;
    const places = new Map(sources.map(source => [source.destination.id, source.destination.name]));
    $('[data-review-destination]').innerHTML = '<option value="">Todos os lugares</option>' + [...places].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join(''); render();
    $('[data-review-destination]').focus({ preventScroll: true }); section.scrollIntoView({ block: 'nearest' });
  }
  $('[data-review-destination]').onchange = render; $('[data-review-cancel]').onclick = close;
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
    $('[data-review-import]').disabled = !selection.size;
  };
  return { open, close, destroy: close, updateControls: () => { $('[data-review-import]').disabled = !selection.size; } };
}
