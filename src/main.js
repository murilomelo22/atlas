import { loadCountries, countryAt, normalizeCoordinates } from './geography.js';
import { openDatabase, getDestinations, getAllPhotos, getPhotos, saveDestination, removeDestinations, exportBackup, importBackup, storageMessage } from './db.js';
import { durationLabel, totalDays, validateVisits } from './dates.js';
import { statistics } from './stats.js';
import { createMap } from './map.js';
import { createGeocoder } from './geocoding.js';
import { processPhoto } from './photos.js';
import { createGallery } from './gallery.js';
import { $, escapeHTML, notify, confirmAction, renderList, renderFilterOptions, renderDetail } from './ui.js';

let destinations = [], allPhotos = [], selectedId = null, mapController;
const urls = new Map();
const gallery = createGallery();
let editId, editPhotos = [], coverId, editorToken = 0, photoBusy = false, editorURLs = [], saving = false;
const editor = $('#editor-dialog');
const geocoder = createGeocoder((results) => {
  const container = $('#geocode-results');
  container.replaceChildren();
  for (const result of results) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = result.label;
    button.onclick = () => {
      $('#destination-name').value = result.name;
      $('#latitude').value = result.lat; $('#longitude').value = result.lng;
      $('#geocode-input').value = result.label;
      container.replaceChildren(); geocoder.cancel();
      $('#geocode-status').textContent = 'Lugar selecionado. O país é determinado pelas coordenadas.';
      updateCountry(); $('#destination-name').focus();
    };
    container.append(button);
  }
}, (message) => { $('#geocode-status').textContent = message; });

function photosFor(destination) {
  const byId = new Map(allPhotos.filter((p) => p.destinationId === destination.id).map((p) => [p.id, p]));
  return destination.photoIds.map((id) => byId.get(id)).filter(Boolean);
}
function renderSelected() {
  const destination = destinations.find((d) => d.id === selectedId);
  if (!destination) { selectedId = null; $('#list-panel').hidden = false; $('#detail-panel').hidden = true; return; }
  const photos = photosFor(destination);
  renderDetail(destination, photos, urls, {
    back: () => { selectedId = null; renderSelected(); },
    edit: () => openEditor(destination),
    remove: async () => {
      if (!await confirmAction(`Excluir ${destination.name}?`, 'O destino, suas visitas e todas as fotos serão removidos deste navegador. Exporte um backup se quiser guardar uma cópia.')) return;
      try { await removeDestinations([destination.id]); selectedId = null; await refresh(); notify('Destino excluído.'); }
      catch (error) { notify(storageMessage(error), true); }
    },
    gallery: (index) => gallery.open(photos, index),
  });
}
function selectDestination(id) {
  const destination = destinations.find((d) => d.id === id);
  if (!destination) return;
  selectedId = id; renderSelected(); mapController.flyTo(destination);
  if (matchMedia('(max-width: 700px)').matches) $('#destinations-panel').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  $('#destinations-panel').scrollTop = 0;
}
function updateList() { renderList(destinations, urls, selectDestination, () => openEditor()); }
async function refresh() {
  destinations = await getDestinations(); allPhotos = await getAllPhotos();
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
  for (const photo of allPhotos) urls.set(photo.id, URL.createObjectURL(photo.thumbnail));
  renderFilterOptions(destinations); updateList(); renderSelected();
  const stats = statistics(destinations);
  for (const [key, value] of Object.entries(stats)) $(`#stat-${key}`).textContent = new Intl.NumberFormat('pt-BR').format(value);
  mapController.update(destinations, urls);
}
function updateCountry() {
  try {
    const { lat, lng } = normalizeCoordinates($('#latitude').value, $('#longitude').value);
    const info = countryAt(lat, lng);
    $('#country-preview').textContent = info.countryId ? `${info.countryName} · ${info.continent} — identificado pelas coordenadas` : 'País não identificado. Pode ser uma ilha pequena, uma área costeira ou um ponto no oceano. O destino pode ser salvo.';
  } catch { $('#country-preview').textContent = 'Informe coordenadas válidas para identificar o país.'; }
}
function readVisits() {
  return [...$('#visits-editor').querySelectorAll('.visit-editor')].map((row) => {
    const manual = $('[data-manual]', row).checked;
    return {
      id: row.dataset.visitId, arrival: manual ? '' : $('[data-arrival]', row).value, departure: manual ? '' : $('[data-departure]', row).value,
      manualDays: manual ? ($('[data-days]', row).value === '' ? '' : Number($('[data-days]', row).value)) : null,
    };
  });
}
function updateDuration() {
  const visits = readVisits();
  try { validateVisits(visits); $('#duration-preview').textContent = durationLabel(totalDays({ visits })); }
  catch (error) { $('#duration-preview').textContent = error.message; }
}
function addVisit(visit = {}) {
  const id = visit.id || crypto.randomUUID(), manual = visit.manualDays != null;
  const row = document.createElement('div');
  row.className = 'visit-editor'; row.dataset.visitId = id;
  const unique = crypto.randomUUID();
  row.innerHTML = `<div class="visit-heading"><span>Visita</span><button type="button" data-remove-visit aria-label="Remover visita">Remover</button></div><div class="visit-dates" ${manual ? 'hidden' : ''}><label for="arrival-${unique}">Chegada<input id="arrival-${unique}" type="date" data-arrival value="${escapeHTML(visit.arrival || '')}" ${manual ? 'disabled' : ''}></label><label for="departure-${unique}">Partida<input id="departure-${unique}" type="date" data-departure value="${escapeHTML(visit.departure || '')}" ${manual ? 'disabled' : ''}></label></div><label class="manual-toggle"><input type="checkbox" data-manual ${manual ? 'checked' : ''}> Não lembro as datas</label><label class="manual-duration" ${manual ? '' : 'hidden'}>Duração em dias<input type="number" min="1" max="365000" step="1" data-days value="${escapeHTML(visit.manualDays ?? '')}" ${manual ? 'required' : 'disabled'}></label>`;
  $('[data-manual]', row).onchange = () => {
    const checked = $('[data-manual]', row).checked;
    $('.visit-dates', row).hidden = checked; $('.manual-duration', row).hidden = !checked;
    $('[data-arrival]', row).disabled = checked; $('[data-departure]', row).disabled = checked;
    $('[data-days]', row).disabled = !checked; $('[data-days]', row).required = checked;
    updateDuration();
  };
  $('[data-remove-visit]', row).onclick = () => { row.remove(); updateDuration(); };
  row.addEventListener('input', updateDuration);
  $('#visits-editor').append(row); updateDuration();
}
function releaseEditorURLs() { editorURLs.forEach((url) => URL.revokeObjectURL(url)); editorURLs = []; }
function renderPhotoEditor() {
  releaseEditorURLs();
  const container = $('#photo-editor');
  container.replaceChildren();
  editPhotos.forEach((photo, index) => {
    const url = URL.createObjectURL(photo.thumbnail); editorURLs.push(url);
    const card = document.createElement('div'); card.className = 'photo-edit-card';
    card.innerHTML = `<img src="${url}" alt="Prévia da foto ${index + 1}"><label>Legenda da foto ${index + 1}<input type="text" maxlength="1000" data-caption value="${escapeHTML(photo.caption)}"></label><div class="photo-controls"><label><input type="radio" name="cover" data-cover ${coverId === photo.id ? 'checked' : ''}> Capa</label><button type="button" data-remove-photo aria-label="Remover foto ${index + 1}">Remover</button></div>`;
    $('[data-caption]', card).oninput = (e) => { photo.caption = e.target.value; };
    $('[data-cover]', card).onchange = () => { coverId = photo.id; };
    $('[data-remove-photo]', card).onclick = () => {
      editPhotos = editPhotos.filter((p) => p.id !== photo.id);
      if (coverId === photo.id) coverId = editPhotos[0]?.id || null;
      renderPhotoEditor();
    };
    container.append(card);
  });
}
async function openEditor(destination, coords = {}) {
  const token = ++editorToken;
  editId = destination?.id || crypto.randomUUID(); coverId = destination?.coverId || null;
  editPhotos = []; photoBusy = false; saving = false;
  $('#destination-form').reset(); $('#form-error').hidden = true;
  $('#editor-title').textContent = destination ? 'Editar destino' : 'Adicionar destino';
  $('#save-button').disabled = false; $('#save-button').textContent = 'Salvar destino';
  $('#destination-name').value = destination?.name || '';
  $('#latitude').value = destination?.lat ?? coords.lat ?? '';
  $('#longitude').value = destination?.lng ?? coords.lng ?? '';
  $('#notes').value = destination?.notes || ''; $('#rating').value = destination?.rating || '0'; $('#tags').value = destination?.tags.join(', ') || '';
  $('#geocode-results').replaceChildren(); $('#geocode-status').textContent = 'Digite ao menos 3 caracteres ou use as coordenadas abaixo.';
  $('#photo-status').textContent = 'As fotos são reduzidas para 1600 px e salvas apenas neste navegador.';
  $('#visits-editor').replaceChildren();
  for (const visit of destination?.visits.length ? destination.visits : [{}]) addVisit(visit);
  updateCountry(); renderPhotoEditor(); editor.showModal();
  if (coords.lat != null) $('#destination-name').focus(); else $('#geocode-input').focus();
  if (destination) {
    photoBusy = true; $('#save-button').disabled = true;
    try { const loaded = await getPhotos(destination.id); if (token !== editorToken) return; editPhotos = loaded; renderPhotoEditor(); }
    catch (error) { editor.close(); notify(storageMessage(error), true); }
    finally { if (token === editorToken) { photoBusy = false; $('#save-button').disabled = false; } }
  }
}
async function addPhotos(files) {
  if (photoBusy || !files.length) return;
  if (files.length + editPhotos.length > 100) { notify('Use até 100 fotos por destino.', true); return; }
  const token = editorToken; photoBusy = true; $('#save-button').disabled = true;
  const errors = [];
  try {
    for (let i = 0; i < files.length; i++) {
      $('#photo-status').textContent = `Preparando foto ${i + 1} de ${files.length}…`;
      try {
        const photo = await processPhoto(files[i], editId);
        if (token !== editorToken) return;
        editPhotos.push(photo); coverId ||= photo.id;
      } catch (error) { errors.push(error.message); }
    }
    if (token !== editorToken) return;
    renderPhotoEditor();
    $('#photo-status').textContent = errors.length ? errors.join(' ') : `${editPhotos.length} ${editPhotos.length === 1 ? 'foto pronta' : 'fotos prontas'} para salvar.`;
    if (errors.length) notify(errors.join(' '), true);
  } finally { if (token === editorToken) { photoBusy = false; $('#save-button').disabled = false; } }
}
async function save(event) {
  event.preventDefault();
  if (photoBusy || saving) return;
  $('#form-error').hidden = true;
  try {
    const coords = normalizeCoordinates($('#latitude').value, $('#longitude').value);
    const name = $('#destination-name').value.trim();
    if (!name) throw new Error('Informe o nome do destino.');
    const visits = readVisits(); validateVisits(visits);
    const previous = destinations.find((d) => d.id === editId);
    const tags = [...new Set($('#tags').value.split(',').map((tag) => tag.trim()).filter(Boolean))];
    if (tags.length > 30 || tags.some((t) => t.length > 40)) throw new Error('Use até 30 etiquetas com até 40 caracteres cada.');
    const now = new Date().toISOString();
    const destination = { id: editId, name, ...coords, ...countryAt(coords.lat, coords.lng), visits,
      notes: $('#notes').value.trim(), rating: Number($('#rating').value), tags,
      photoIds: editPhotos.map((p) => p.id), coverId: editPhotos.some((p) => p.id === coverId) ? coverId : editPhotos[0]?.id || null,
      example: false, createdAt: previous?.createdAt || now, updatedAt: now };
    saving = true; $('#save-button').disabled = true; $('#save-button').textContent = 'Salvando…';
    await saveDestination(destination, editPhotos);
    editor.close(); selectedId = destination.id; await refresh(); mapController.flyTo(destination);
    notify('Destino salvo. Mais um lugar na sua história.');
  } catch (error) {
    $('#form-error').textContent = storageMessage(error); $('#form-error').hidden = false;
    $('#form-error').scrollIntoView({ block: 'nearest' });
  } finally { saving = false; $('#save-button').disabled = false; $('#save-button').textContent = 'Salvar destino'; }
}
function bindEvents() {
  $('#add-button').onclick = () => openEditor();
  $('#editor-close').onclick = $('#editor-cancel').onclick = () => { if (!saving) editor.close(); };
  editor.addEventListener('cancel', (e) => { if (saving) e.preventDefault(); });
  editor.addEventListener('close', () => { editorToken++; geocoder.cancel(); releaseEditorURLs(); });
  $('#geocode-input').oninput = (e) => geocoder.search(e.target.value);
  $('#latitude').oninput = $('#longitude').oninput = updateCountry;
  $('#add-visit').onclick = () => addVisit();
  $('#destination-form').onsubmit = save;
  $('#photo-input').onchange = async (e) => { await addPhotos([...e.target.files]); e.target.value = ''; };
  const zone = $('#drop-zone');
  for (const type of ['dragenter', 'dragover']) zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add('dragging'); });
  for (const type of ['dragleave', 'drop']) zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.remove('dragging'); });
  zone.addEventListener('drop', (e) => addPhotos([...e.dataTransfer.files]));
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  for (const selector of ['#list-search', '#country-filter', '#tag-filter', '#sort']) $(selector).addEventListener('input', updateList);
  $('#route-toggle').onchange = (e) => mapController.route(e.target.checked);
  $('#fit-button').onclick = () => mapController.fit(destinations);
  $('#clear-examples').onclick = async () => {
    if (!await confirmAction('Limpar os exemplos?', 'Somente os exemplos que você ainda não editou serão removidos. Suas memórias serão preservadas.', 'Limpar exemplos')) return;
    try { await removeDestinations(destinations.filter((d) => d.example).map((d) => d.id)); await refresh(); notify('Exemplos removidos. O próximo destino é seu.'); }
    catch (error) { notify(storageMessage(error), true); }
  };
  $('#export-button').onclick = async () => {
    const button = $('#export-button'); button.disabled = true;
    try {
      const backup = await exportBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `atlas-pessoal-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      notify('Backup exportado com todos os destinos e fotografias.');
    } catch (error) { notify(storageMessage(error), true); }
    finally { button.disabled = false; }
  };
  $('#import-button').onclick = () => $('#import-input').click();
  $('#import-input').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    $('#import-button').disabled = true;
    try { notify('Validando o backup e preparando as fotos…'); const count = await importBackup(file); await refresh(); notify(`${count} ${count === 1 ? 'destino importado' : 'destinos importados'}. Os registros existentes foram atualizados sem duplicação.`); }
    catch (error) { notify(storageMessage(error), true); }
    finally { e.target.value = ''; $('#import-button').disabled = false; }
  };
  window.addEventListener('resize', () => mapController.resize());
  window.addEventListener('pagehide', (event) => { if (!event.persisted) { for (const url of urls.values()) URL.revokeObjectURL(url); releaseEditorURLs(); } });
}
async function init() {
  const buttons = ['#add-button', '#export-button', '#import-button'];
  buttons.forEach((selector) => { $(selector).disabled = true; });
  try {
    const countries = await loadCountries();
    await openDatabase();
    mapController = createMap(countries, selectDestination, (coords) => openEditor(null, coords), () => {
      $('#map-status').textContent = 'Tiles indisponíveis. Seus países e destinos continuam acessíveis.';
    });
    await refresh(); bindEvents(); buttons.forEach((selector) => { $(selector).disabled = false; });
    // Cache the local shell; remote tiles and geocoding are never required to read saved data.
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => notify('O cache offline não pôde ser ativado. Os dados continuam salvos; mantenha o servidor local disponível.', true));
  } catch (error) {
    notify(storageMessage(error), true);
    $('#destination-list').innerHTML = `<div class="empty-state"><h3>Não foi possível abrir o atlas</h3><p>${escapeHTML(storageMessage(error))}</p><button class="primary" id="retry-init">Tentar novamente</button></div>`;
    $('#retry-init').onclick = () => location.reload();
  }
}
init();
