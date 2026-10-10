import { countryAt, normalizeCoordinates } from './geography.js';
import { validateVisits } from './dates.js';
import { blobAsDataURL } from './photos.js';
import { mediaFromBackup } from './media.js';
import { cleanWishlist, emptyWishlist, mergeWishlistItems } from './wishlist-data.js';
let database;
let accountId = null;
export const currentAccountId = () => accountId;
const databaseName = (id) => id ? `atlas-pessoal-account-${id}` : 'atlas-pessoal';
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
export async function openDatabase(options = {}) {
  const nextAccount = options.accountId || null;
  if (database && nextAccount === accountId) return;
  if (database) { database.close(); database = null; }
  accountId = nextAccount;
  if (!window.indexedDB) throw new Error('Seu navegador não oferece IndexedDB. Use um navegador atualizado.');
  const request = indexedDB.open(databaseName(accountId), 1);
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
    if (!accountId) for (const destination of examples()) tx.objectStore('destinations').put(destination);
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
export async function getPhotos(id) {
  const tx = database.transaction(['destinations', 'photos']);
  const [destination, photos] = await Promise.all([requestValue(tx.objectStore('destinations').get(id)), requestValue(tx.objectStore('photos').index('destinationId').getAll(id))]);
  const order = destination?.photoIds || [];
  return photos.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}
export const getAllPhotos = () => requestValue(database.transaction('photos').objectStore('photos').getAll());
export const getMeta = (key) => requestValue(database.transaction('meta').objectStore('meta').get(key)).then((row) => row?.value);
export const setMeta = (key, value) => writeTransaction(['meta'], (tx) => tx.objectStore('meta').put({ key, value }));
export const getWishlist = async () => await getMeta('wishlist') || emptyWishlist();
export async function updateWishlistMeta(update) {
  const tx = database.transaction('meta', 'readwrite'), done = transactionDone(tx);
  let failure;
  const read = tx.objectStore('meta').get('wishlist');
  read.onsuccess = () => {
    try { const value = update(read.result?.value); if (value) tx.objectStore('meta').put({ key: 'wishlist', value }); }
    catch (error) { failure = error; tx.abort(); }
  };
  try { await done; } catch (error) { throw failure || error; }
}
export async function saveWishlist(raw, expectedVersion) {
  const clean = cleanWishlist(raw);
  await updateWishlistMeta(previous => {
    if ((previous?.localVersion || null) !== expectedVersion) throw new Error('Sua wish list mudou durante a edição. Suas alterações continuam neste formulário; copie-as antes de reabrir a lista.');
    return { ...clean, revision: previous?.revision || null, cloudDirty: Boolean(accountId), localVersion: crypto.randomUUID() };
  });
}
export async function saveDestination(destination, photos) {
  const previous = await getPhotos(destination.id);
  if (accountId) { destination.cloudDirty = true; destination.localVersion = crypto.randomUUID(); }
  await writeTransaction(['destinations', 'photos'], (tx) => {
    tx.objectStore('destinations').put(destination);
    const ids = new Set(photos.map((p) => p.id));
    for (const old of previous) if (!ids.has(old.id)) tx.objectStore('photos').delete(old.id);
    for (const photo of photos) tx.objectStore('photos').put(photo);
  });
}
export async function removeDestinations(ids) {
  const photos = await getAllPhotos(), destinations = await getDestinations();
  const pending = await getMeta('deleted') || [];
  const selected = new Set(ids);
  await writeTransaction(['destinations', 'photos', 'meta'], (tx) => {
    if (accountId) {
      for (const id of ids) {
        const destination = destinations.find((d) => d.id === id);
        if (destination) pending.push({ id, cloudRevision: destination.cloudRevision || null, paths: photos.filter((p) => p.destinationId === id).flatMap((p) => [p.cloudPath, p.cloudThumbPath, p.cloudMotionPath]).filter(Boolean) });
      }
      tx.objectStore('meta').put({ key: 'deleted', value: pending });
    }
    for (const id of ids) tx.objectStore('destinations').delete(id);
    for (const photo of photos) if (selected.has(photo.destinationId)) tx.objectStore('photos').delete(photo.id);
  });
}
export async function exportBackup() {
  const tx = database.transaction(['destinations', 'photos', 'meta']);
  const [destinations, photos, wishlist] = await Promise.all([
    requestValue(tx.objectStore('destinations').getAll()),
    requestValue(tx.objectStore('photos').getAll()),
    requestValue(tx.objectStore('meta').get('wishlist')),
  ]);
  return { ...(wishlist?.value ? { wishlist: cleanWishlist(wishlist.value) } : {}), format: 'atlas-pessoal', version: 2, exportedAt: new Date().toISOString(), destinations, photos: await Promise.all(photos.map(async (p) => ({ id: p.id, destinationId: p.destinationId, caption: p.caption, kind: p.kind || 'image', data: await blobAsDataURL(p.blob), ...(p.motionBlob ? { motion: await blobAsDataURL(p.motionBlob) } : {}) }))) };
}
const identity = (d) => `${d.name.trim().toLocaleLowerCase('pt-BR')}|${d.lat.toFixed(5)}|${d.lng.toFixed(5)}`;
export function sanitizeDestination(raw) {
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
    photoIds: [], coverId: null, kind: raw.kind === 'home' ? 'home' : 'trip', favorite: raw.favorite === true, pinned: raw.pinned === true, example: raw.example === true, createdAt: timestamp(raw.createdAt), updatedAt: timestamp(raw.updatedAt) };
}
export async function importBackup(file) {
  if (file.size > 250 * 1024 * 1024) throw new Error('O backup excede 250 MB. Divida sua coleção antes de importar.');
  let raw;
  try { raw = JSON.parse(await file.text()); } catch { throw new Error('Não foi possível ler o JSON. Selecione um backup do Atlas Pessoal.'); }
  if (!raw || raw.format !== 'atlas-pessoal' || ![1, 2].includes(raw.version) || !Array.isArray(raw.destinations) || !Array.isArray(raw.photos) || raw.destinations.length > 10000 || raw.photos.length > 20000) throw new Error('Formato ou versão de backup não reconhecido.');
  const importedWishlist = raw.wishlist == null ? null : cleanWishlist(raw.wishlist);
  const previousWishlist = importedWishlist ? await getWishlist() : null;
  const restoredWishlist = importedWishlist ? { items: mergeWishlistItems(previousWishlist.items, importedWishlist.items), is_public: false, revision: previousWishlist.revision || null, cloudDirty: Boolean(accountId), localVersion: crypto.randomUUID() } : null;
  const existing = await getDestinations(), oldPhotos = await getAllPhotos();
  const byId = new Map(existing.map((d) => [d.id, d]));
  const byIdentity = new Map(existing.map((d) => [identity(d), d]));
  const prepared = new Map(), sourceIds = new Map(), photoIds = new Set(oldPhotos.map((p) => p.id));
  for (const item of raw.destinations) {
    const clean = sanitizeDestination(item);
    if (sourceIds.has(String(item.id))) throw new Error('O backup contém identificadores de destino repetidos.');
    const previous = byId.get(clean.id) || byIdentity.get(identity(clean));
    if (previous) clean.id = previous.id;
    if (accountId) {
      clean.cloudRevision = previous?.cloudRevision || null;
      clean.visibility = 'private'; clean.cloudDirty = true; clean.localVersion = crypto.randomUUID();
    }
    sourceIds.set(String(item.id), clean.id);
    if (!prepared.has(clean.id)) prepared.set(clean.id, { destination: clean, photos: [], sourceCover: item.coverId, sourceOrder: Array.isArray(item.photoIds) ? item.photoIds : [], order: new Map() });
    byIdentity.set(identity(clean), clean);
  }
  const seenPhotoIds = new Set();
  for (const item of raw.photos) {
    const id = sourceIds.get(String(item.destinationId));
    if (!id || seenPhotoIds.has(String(item.id))) throw new Error('O backup contém fotografias sem destino ou repetidas.');
    seenPhotoIds.add(String(item.id));
    const group = prepared.get(id);
    const photo = await mediaFromBackup(item, id);
    if (photoIds.has(photo.id) && !oldPhotos.some((p) => p.id === photo.id && p.destinationId === id)) photo.id = crypto.randomUUID();
    photoIds.add(photo.id);
    group.photos.push(photo);
    const position = group.sourceOrder.indexOf(item.id);
    group.order.set(photo.id, position < 0 ? Infinity : position);
    if (group.sourceCover === item.id) group.destination.coverId = photo.id;
  }
  for (const group of prepared.values()) {
    if (group.photos.length > 100) throw new Error('Use até 100 mídias por destino no backup.');
    group.photos.sort((a, b) => group.order.get(a.id) - group.order.get(b.id));
  }
  // All validation and decoding completes before one atomic write transaction.
  await writeTransaction(['destinations', 'photos', 'meta'], (tx) => {
    if (restoredWishlist) tx.objectStore('meta').put({ key: 'wishlist', value: restoredWishlist });
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
export async function guestCollection() {
  const request = indexedDB.open('atlas-pessoal', 1);
  const db = await requestValue(request);
  try {
    const tx = db.transaction(['destinations', 'photos']);
    return { destinations: await requestValue(tx.objectStore('destinations').getAll()), photos: await requestValue(db.transaction('photos').objectStore('photos').getAll()), wishlist: (await requestValue(db.transaction('meta').objectStore('meta').get('wishlist')))?.value || emptyWishlist() };
  } finally { db.close(); }
}
export async function migrateGuest() {
  if (!accountId) throw new Error('Entre na conta antes de enviar suas viagens.');
  const guest = await guestCollection(), existing = await getDestinations(), currentPhotos = await getAllPhotos();
  const currentWish = await getWishlist();
  const wishItems = mergeWishlistItems(currentWish.items, cleanWishlist(guest.wishlist).items);
  const wishesAdded = wishItems.length - currentWish.items.length;
  const identities = new Set(existing.map(identity)), ids = new Set(existing.map((d) => d.id)), usedPhotos = new Set(currentPhotos.map((p) => p.id));
  const additions = [], pictures = [];
  for (const destination of guest.destinations.filter((d) => !d.example)) {
    if (ids.has(destination.id) || identities.has(identity(destination))) continue;
    const photoMap = new Map();
    for (const photo of guest.photos.filter((p) => p.destinationId === destination.id)) {
      const id = usedPhotos.has(photo.id) ? crypto.randomUUID() : photo.id;
      usedPhotos.add(id); photoMap.set(photo.id, id);
      pictures.push({ id, destinationId: destination.id, blob: photo.blob, thumbnail: photo.thumbnail, caption: photo.caption, kind: photo.kind || 'image', duration: photo.duration, ...(photo.motionBlob ? { motionBlob: photo.motionBlob } : {}) });
    }
    additions.push({ ...destination, visibility: 'private', cloudRevision: null, cloudDirty: true, localVersion: crypto.randomUUID(), photoIds: destination.photoIds.map((id) => photoMap.get(id)).filter(Boolean), coverId: photoMap.get(destination.coverId) || null });
    ids.add(destination.id); identities.add(identity(destination));
  }
  await writeTransaction(['destinations', 'photos', 'meta'], (tx) => {
    if (wishesAdded) tx.objectStore('meta').put({ key: 'wishlist', value: { items: wishItems, is_public: false, revision: currentWish.revision || null, cloudDirty: true, localVersion: crypto.randomUUID() } });
    for (const destination of additions) tx.objectStore('destinations').put(destination);
    for (const photo of pictures) tx.objectStore('photos').put(photo);
  });
  return additions.length + wishesAdded;
}
export async function markCloudSaved(snapshot, revision, remotePhotos) {
  const current = (await getDestinations()).find((d) => d.id === snapshot.id);
  if (!current) return;
  const photos = await getPhotos(snapshot.id);
  const unchanged = current.localVersion === snapshot.localVersion;
  await writeTransaction(['destinations', 'photos'], (tx) => {
    tx.objectStore('destinations').put({ ...current, cloudRevision: revision, cloudDirty: !unchanged });
    if (unchanged) for (const photo of photos) {
      const remote = remotePhotos.find((p) => p.id === photo.id);
      if (remote) tx.objectStore('photos').put({ ...photo, cloudPath: remote.storage_path, cloudThumbPath: remote.thumbnail_path, cloudMotionPath: remote.motion_path || null });
    }
  });
}
export async function mergeCloudCollection(collection, force = false) {
  const current = await getDestinations(), photos = await getAllPhotos(), tombstones = await getMeta('deleted') || [];
  const preserve = new Set(force ? [] : [...current.filter((d) => d.cloudDirty).map((d) => d.id), ...tombstones.map((d) => d.id)]);
  await writeTransaction(['destinations', 'photos', 'meta'], (tx) => {
    for (const d of current) if (!preserve.has(d.id)) tx.objectStore('destinations').delete(d.id);
    for (const photo of photos) if (!preserve.has(photo.destinationId)) tx.objectStore('photos').delete(photo.id);
    for (const d of collection.destinations) if (!preserve.has(d.id)) tx.objectStore('destinations').put({ ...d, localVersion: crypto.randomUUID() });
    for (const photo of collection.photos) if (!preserve.has(photo.destinationId)) tx.objectStore('photos').put(photo);
    if (force) tx.objectStore('meta').put({ key: 'deleted', value: [] });
  });
}
export async function purgeAccount(id) {
  if (id === accountId) throw new Error('Feche a coleção da conta antes de limpar o cache.');
  await requestValue(indexedDB.deleteDatabase(databaseName(id)));
}
export function storageMessage(error) {
  return error?.name === 'QuotaExceededError' ? 'O armazenamento do navegador está cheio. Exporte um backup e remova algumas fotos antes de tentar novamente.' : error?.message || 'Não foi possível salvar. Tente novamente e mantenha um backup dos seus dados.';
}
