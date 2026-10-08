import { totalDays, durationLabel, displayDate } from './dates.js';
export const $ = (selector, root = document) => root.querySelector(selector);
export const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let toastTimer;
export function notify(message, error = false) {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.setAttribute('role', error ? 'alert' : 'status');
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 10000 : 5500);
}
export function confirmAction(title, message, action = 'Excluir') {
  const dialog = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-ok').textContent = action;
  dialog.returnValue = '';
  $('#confirm-ok').onclick = () => dialog.close('yes');
  $('#confirm-cancel').onclick = () => dialog.close('no');
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}
export function renderFilterOptions(destinations) {
  for (const [selector, values, label] of [
    ['#country-filter', [...new Set(destinations.map((d) => d.countryName))], 'Todos os países'],
    ['#tag-filter', [...new Set(destinations.flatMap((d) => d.tags))], 'Todas as etiquetas'],
  ]) {
    const select = $(selector), previous = select.value;
    select.innerHTML = `<option value="">${label}</option>${values.sort((a, b) => a.localeCompare(b, 'pt-BR')).map((v) => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('')}`;
    if (values.includes(previous)) select.value = previous;
  }
}
export function renderList(destinations, urls, onSelect, onAdd) {
  const query = $('#list-search').value.trim().toLocaleLowerCase('pt-BR');
  const country = $('#country-filter').value, tag = $('#tag-filter').value;
  const visible = destinations.filter((d) => (!country || d.countryName === country) && (!tag || d.tags.includes(tag)) && [d.name, d.countryName, d.notes, ...d.tags].some((value) => value.toLocaleLowerCase('pt-BR').includes(query)));
  const sort = $('#sort').value;
  const latest = (d) => d.visits.map((v) => v.arrival).filter(Boolean).sort().at(-1) || '';
  visible.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name, 'pt-BR') : sort === 'duration' ? totalDays(b) - totalDays(a) : sort === 'rating' ? b.rating - a.rating : latest(b).localeCompare(latest(a))) || a.name.localeCompare(b.name, 'pt-BR'));
  $('#destination-count').textContent = destinations.length;
  $('#examples-banner').hidden = !destinations.some((d) => d.example);
  const list = $('#destination-list');
  if (!visible.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon" aria-hidden="true">◇</div><h3>${destinations.length ? 'Nenhuma memória por aqui' : 'O mundo está à sua espera'}</h3><p>${destinations.length ? 'Experimente outra busca ou ajuste os filtros.' : 'Comece por um lugar que ficou com você.<br>Clique no mapa ou adicione seu primeiro destino.'}</p>${destinations.length ? '' : '<button class="primary" id="empty-add">Adicionar destino</button>'}</div>`;
    $('#empty-add')?.addEventListener('click', onAdd);
    return;
  }
  list.innerHTML = visible.map((d) => `<button class="destination-card" data-destination-id="${escapeHTML(d.id)}" aria-label="Abrir destino ${escapeHTML(d.name)}"><span class="destination-thumb">${urls.has(d.coverId) ? `<img src="${urls.get(d.coverId)}" alt="" loading="lazy">` : '◇'}</span><span class="destination-summary"><strong>${escapeHTML(d.name)}</strong><small>${escapeHTML(d.countryName)}${d.rating ? ` · ${'★'.repeat(d.rating)}` : ''}</small><span class="duration">${durationLabel(totalDays(d))} · ${d.visits.length} ${d.visits.length === 1 ? 'visita' : 'visitas'}</span></span><span class="card-chevron" aria-hidden="true">›</span></button>`).join('');
  list.querySelectorAll('[data-destination-id]').forEach((button) => button.addEventListener('click', () => onSelect(button.dataset.destinationId)));
}
export function renderDetail(destination, photos, urls, actions) {
  const d = destination;
  const panel = $('#detail-panel');
  $('#list-panel').hidden = true;
  panel.hidden = false;
  panel.innerHTML = `<header class="detail-header"><button class="text-button" data-back>← Meus destinos</button><span class="eyebrow">${d.example ? 'EXEMPLO' : 'MEMÓRIA'}</span></header><div class="detail-cover">${urls.has(d.coverId) ? `<img src="${urls.get(d.coverId)}" alt="Foto de capa de ${escapeHTML(d.name)}">` : '◇'}<span class="cover-count">${photos.length ? `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}` : 'A sua próxima fotografia'}</span></div><div class="detail-body"><h2>${escapeHTML(d.name)}</h2><p class="detail-subtitle">${escapeHTML(d.countryName)}${d.continent ? ` · ${escapeHTML(d.continent)}` : ''}</p><p class="detail-stars" aria-label="${d.rating ? `Avaliação: ${d.rating} de 5` : 'Sem avaliação'}">${d.rating ? '★'.repeat(d.rating) + '☆'.repeat(5 - d.rating) : ''}</p><div class="detail-tags">${d.tags.map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join('')}</div><section class="detail-section"><h3>O tempo por aqui · ${durationLabel(totalDays(d))}</h3>${d.visits.length ? d.visits.map((v, index) => `<div class="visit-summary"><strong>Visita ${index + 1} · ${durationLabel(totalDays({ visits: [v] }))}</strong><small>${v.manualDays != null ? 'Duração informada manualmente' : `${displayDate(v.arrival)} — ${displayDate(v.departure)}`}</small></div>`).join('') : '<p>Nenhuma visita registrada.</p>'}</section><section class="detail-section"><h3>Notas de viagem</h3><p>${escapeHTML(d.notes || 'Uma página em branco, esperando pelas suas memórias.')}</p></section><section class="detail-section"><h3>Galeria · ${photos.length}</h3><div class="detail-gallery">${photos.map((photo, index) => `<button data-photo-index="${index}" aria-label="Abrir foto ${index + 1}${photo.caption ? `: ${escapeHTML(photo.caption)}` : ''}"><img src="${urls.get(photo.id)}" alt="${escapeHTML(photo.caption || `Fotografia de ${d.name}`)}" loading="lazy"></button>`).join('')}</div>${photos.length ? '' : '<p>As imagens também fazem parte da história.<br>Edite este destino para adicionar suas fotos.</p>'}</section><div class="detail-actions"><button class="primary" data-edit>Editar destino</button><button class="quiet" data-delete>Excluir destino</button></div><p class="detail-coordinates">${d.lat.toFixed(5)}°, ${d.lng.toFixed(5)}°</p></div>`;
  $('[data-back]', panel).onclick = actions.back;
  $('[data-edit]', panel).onclick = actions.edit;
  $('[data-delete]', panel).onclick = actions.remove;
  panel.querySelectorAll('[data-photo-index]').forEach((button) => button.onclick = () => actions.gallery(Number(button.dataset.photoIndex)));
}
