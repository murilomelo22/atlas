import { countryAt, normalizeCoordinates } from './geography.js';
import { validateVisits } from './dates.js';
import { blobAsDataURL, photoFromBackup } from './photos.js';
let database;
const requestValue = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const transactionDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error || new Error('A operação foi cancelada.'));
});
async function writeTransaction(stores, write) {
  const tx = database.transaction(stores, 'readwrite');
  const done = transactionDone(tx);
  try { write(tx); }
  catch (error) {
    // Synchronous errors must also roll back any earlier queued writes.
    tx.abort();
    await done.catch(() => {});
    throw error;
  }
  await done;
}
export async function openDatabase() {
  if (database) return;
  if (!window.indexedDB) throw new Error('Seu navegador não oferece IndexedDB. Use um navegador atualizado.');
  const request = indexedDB.open('atlas-pessoal', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('destinations', { keyPath: 'id' });
    db.createObjectStore('photos', { keyPath: 'id' }).createIndex('destinationId', 'destinationId');
    db.createObjectStore('meta', { keyPath: 'key' });
  };
  database = await requestValue(request);
  database.onversionchange = () => { database.close(); database = null; };
  const tx = database.transaction(['destinations', 'meta'], 'readwrite');
  const done = transactionDone(tx);
  const initialized = tx.objectStore('meta').get('initialized');
  initialized.onsuccess = () => {
    if (initialized.result) return;
    for (const destination of examples()) tx.objectStore('destinations').put(destination);
    tx.objectStore('meta').put({ key: 'initialized', value: true });
  };
  await done;
}
function examples() {
  return [
    ['milao', 'Milão', 45.4642, 9.1900, '2024-05-01', '2024-05-03'],
    ['verona', 'Verona', 45.4384, 10.9916, '2024-05-04', '2024-05-05'],
    ['veneza', 'Veneza', 45.4408, 12.3155, '2024-05-06', '2024-05-08'],
    ['florenca', 'Florença', 43.7696, 11.2558, '2024-05-09', '2024-05-11'],
    ['roma', 'Roma', 41.9028, 12.4964, '2024-05-12', '2024-05-15'],
  ].map(([id, name, lat, lng, arrival, departure]) => ({
    id: `example-${id}`, name, lat, lng, ...countryAt(lat, lng),
    visits: [{ id: crypto.randomUUID(), arrival, departure, manualDays: null }],
    notes: 'Destino de exemplo. As datas são ilustrativas — edite para registrar sua viagem.',
    rating: 0, tags: ['exemplo'], photoIds: [], coverId: null, example: true,
    createdAt: '2024-05-01T12:00:00.000Z', updatedAt: '2024-05-01T12:00:00.000Z',
  }));
}
export const getDestinations = () => requestValue(database.transaction('destinations').objectStore('destinations').getAll());
export const getPhotos = (id) => requestValue(database.transaction('photos').objectStore('photos').index('destinationId').getAll(id));
export const getAllPhotos = () => requestValue(database.transaction('photos').objectStore('photos').getAll());
export async function saveDestination(destination, photos) {
  const previous = await getPhotos(destination.id);
  await writeTransaction(['destinations', 'photos'], (tx) => {
    tx.objectStore('destinations').put(destination);
    const ids = new Set(photos.map((p) => p.id));
    for (const old of previous) if (!ids.has(old.id)) tx.objectStore('photos').delete(old.id);
    for (const photo of photos) tx.objectStore('photos').put(photo);
  });
}
export async function removeDestinations(ids) {
  const photos = await getAllPhotos();
  const selected = new Set(ids);
  await writeTransaction(['destinations', 'photos'], (tx) => {
    for (const id of ids) tx.objectStore('destinations').delete(id);
    for (const photo of photos) if (selected.has(photo.destinationId)) tx.objectStore('photos').delete(photo.id);
  });
}
export async function exportBackup() {
  const tx = database.transaction(['destinations', 'photos']);
  const [destinations, photos] = await Promise.all([
    requestValue(tx.objectStore('destinations').getAll()),
    requestValue(tx.objectStore('photos').getAll()),
  ]);
  return { format: 'atlas-pessoal', version: 1, exportedAt: new Date().toISOString(), destinations, photos: await Promise.all(photos.map(async (p) => ({ id: p.id, destinationId: p.destinationId, caption: p.caption, data: await blobAsDataURL(p.blob) }))) };
}
const identity = (d) => `${d.name.trim().toLocaleLowerCase('pt-BR')}|${d.lat.toFixed(5)}|${d.lng.toFixed(5)}`;
function sanitizeDestination(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 120) throw new Error('O backup contém um destino sem nome válido.');
  const coords = normalizeCoordinates(raw.lat, raw.lng);
  if (!Array.isArray(raw.visits) || raw.visits.length > 1000) throw new Error('As visitas do backup são inválidas.');
  const visits = raw.visits.map((v) => {
    if (!v || typeof v !== 'object') throw new Error('Visita inválida no backup.');
    return { id: String(v.id || crypto.randomUUID()), arrival: String(v.arrival || ''), departure: String(v.departure || ''), manualDays: v.manualDays == null || v.manualDays === '' ? null : Number(v.manualDays) };
  });
  validateVisits(visits);
  const rating = Number(raw.rating || 0);
  if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new Error('Avaliação inválida no backup.');
  const timestamp = (v) => Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : new Date().toISOString();
  return { id: String(raw.id || crypto.randomUUID()).slice(0, 128), name: raw.name.trim(), ...coords, ...countryAt(coords.lat, coords.lng), visits,
    notes: String(raw.notes || '').slice(0, 20000), rating, tags: [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 30),
    photoIds: [], coverId: null, example: raw.example === true, createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt) };
}
export async function importBackup(file) {
  if (file.size > 250 * 1024 * 1024) throw new Error('O backup excede 250 MB. Divida sua coleção antes de importar.');
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('Não foi possível ler o JSON. Selecione um backup do Atlas Pessoal.'); }
  if (!raw || raw.format !== 'atlas-pessoal' || raw.version !== 1 || !Array.isArray(raw.destinations) || !Array.isArray(raw.photos) || raw.destinations.length > 10000 || raw.photos.length > 20000) throw new Error('Formato ou versão de backup não reconhecido.');
  const existing = await getDestinations(), oldPhotos = await getAllPhotos();
  const byId = new Map(existing.map((d) => [d.id, d]));
  const byIdentity = new Map(existing.map((d) => [identity(d), d]));
  const prepared = new Map(), sourceIds = new Map(), photoIds = new Set(oldPhotos.map((p) => p.id));
  for (const item of raw.destinations) {
    const clean = sanitizeDestination(item);
    if (sourceIds.has(String(item.id))) throw new Error('O backup contém identificadores de destino repetidos.');
    const previous = byId.get(clean.id) || byIdentity.get(identity(clean));
    if (previous) clean.id = previous.id;
    sourceIds.set(String(item.id), clean.id);
    if (!prepared.has(clean.id)) prepared.set(clean.id, { destination: clean, photos: [], sourceCover: item.coverId });
    byIdentity.set(identity(clean), clean);
  }
  const seenPhotoIds = new Set();
  for (const item of raw.photos) {
    const id = sourceIds.get(String(item.destinationId));
    if (!id || seenPhotoIds.has(String(item.id))) throw new Error('O backup contém fotografias sem destino ou repetidas.');
    seenPhotoIds.add(String(item.id));
    const group = prepared.get(id);
    const photo = await photoFromBackup(item, id);
    if (photoIds.has(photo.id) && !oldPhotos.some((p) => p.id === photo.id && p.destinationId === id)) photo.id = crypto.randomUUID();
    photoIds.add(photo.id);
    group.photos.push(photo);
    if (group.sourceCover === item.id) group.destination.coverId = photo.id;
  }
  // All validation and image work completes before one atomic write transaction.
  await writeTransaction(['destinations', 'photos'], (tx) => {
    for (const old of oldPhotos) if (prepared.has(old.destinationId)) tx.objectStore('photos').delete(old.id);
    for (const { destination, photos } of prepared.values()) {
      destination.photoIds = photos.map((p) => p.id);
      destination.coverId ||= photos[0]?.id || null;
      tx.objectStore('destinations').put(destination);
      for (const photo of photos) tx.objectStore('photos').put(photo);
    }
  });
  return prepared.size;
}
export function storageMessage(error) {
  return error?.name === 'QuotaExceededError' ? 'O armazenamento do navegador está cheio. Exporte um backup e remova algumas fotos antes de tentar novamente.' : error?.message || 'Não foi possível salvar. Tente novamente e mantenha um backup dos seus dados.';
}
