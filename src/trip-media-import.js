import { currentUser, request, ensureMediaSupport, deleteObjects } from './cloud.js';
import { currentAccountId, getAllPhotos, getDestinations } from './db.js';
import { mediaKind, mediaExtension } from './media.js';
import { stopForDestination, assignTripPhotoStops } from './trip-photo-location.js';

export async function importedPhotoId(owner, trip, photo) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['atlas-review-import-v1', owner, trip, photo.destinationId, photo.id]))));
  digest[6] = (digest[6] & 15) | 128; digest[8] = (digest[8] & 63) | 128;
  const hex = [...digest.slice(0, 16)].map(n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function reviewPhotos() {
  if (!currentUser() || currentAccountId() !== currentUser().id) throw new Error('Entre na sua conta e aguarde sua coleção para importar fotos.');
  const owner = currentUser().id;
  const [destinations, photos] = await Promise.all([getDestinations(), getAllPhotos()]);
  if (currentUser()?.id !== owner || currentAccountId() !== owner) throw new DOMException('A conta mudou.', 'AbortError');
  const byId = new Map(destinations.filter(d => !d.example && d.kind !== 'home').map(d => [d.id, d]));
  return photos.filter(p => byId.has(p.destinationId)).map(photo => ({ photo, destination: byId.get(photo.destinationId) }));
}
const extension = (path, blob) => path?.match(/\.(mp4|webm|mov)$/i)?.[1].toLowerCase() || mediaExtension(blob);

// Existing imported copies have stable IDs. Organize them from the current
// account's cached reviews, without downloading originals or exposing reviews.
export async function linkExistingReviewPhotos(trip, photos, valid = () => true) {
  const owner = currentUser()?.id;
  const unassigned = new Set(photos.filter(photo => !photo.stop_id && !photo.location_set && photo.id?.[14] === '8' && photo.uploader_id === owner).map(photo => photo.id));
  if (!owner || currentAccountId() !== owner || !unassigned.size || !valid()) return photos;
  const links = [];
  for (const destination of await getDestinations()) {
    if (!valid() || currentUser()?.id !== owner || currentAccountId() !== owner) return photos;
    if (destination.example || destination.kind === 'home') continue;
    const stop = stopForDestination(trip, destination); if (!stop?.id) continue;
    // Matching needs only IDs, so large local originals stay in IndexedDB.
    for (const photoID of destination.photoIds || []) {
      const id = await importedPhotoId(owner, trip.id, { id: photoID, destinationId: destination.id });
      if (unassigned.has(id)) links.push({ photo_id: id, stop_id: stop.id });
    }
  }
  if (links.length && valid() && currentUser()?.id === owner) {
    try { await assignTripPhotoStops(trip, links, valid); }
    catch { return photos; } // Keep the album available if organization failed.
    const byID = new Map(links.map(link => [link.photo_id, link.stop_id]));
    return photos.map(photo => byID.has(photo.id) ? { ...photo, stop_id: byID.get(photo.id), location_set: true } : photo);
  }
  return photos;
}

export async function importReviewPhotos({ trip, photoIds, destinationIds, valid = () => true, progress = () => {} }) {
  const owner = currentUser()?.id;
  const guard = () => { if (!owner || owner !== currentUser()?.id || owner !== currentAccountId() || !valid()) throw new DOMException('Importação interrompida. As fotos concluídas foram preservadas.', 'AbortError'); };
  guard();
  const sources = (await reviewPhotos()).filter(({ photo }) => photoIds ? photoIds.includes(photo.id) : destinationIds?.includes(photo.destinationId)); guard();
  if (!sources.length) return { imported: 0, skipped: 0 };
  const existing = await request(`/rest/v1/trip_photos?${new URLSearchParams({ select: 'id,uploader_id,storage_path,stop_id,location_set', trip_id: `eq.${trip.id}`, limit: '100' })}`, { authenticated: true }); guard();
  const ids = new Set(existing.map(p => p.id)), prepared = [];
  for (const source of sources) prepared.push({ ...source, id: await importedPhotoId(owner, trip.id, source.photo) });
  guard();
  const byID = new Map(existing.map(photo => [photo.id, photo]));
  for (const source of prepared) { const photo = byID.get(source.id); if (photo && (photo.uploader_id !== owner || !photo.storage_path.startsWith(`${owner}/${trip.id}/${source.id}.`))) throw new Error('Esta importação encontrou uma mídia com identidade diferente. Os originais foram preservados.'); }
  const pending = prepared.filter(source => !ids.has(source.id));
  if (ids.size + pending.length > 100) throw new Error('A trip aceita até 100 mídias. Selecione menos fotos para importar.');
  if (pending.some(({ photo }) => mediaKind(photo) !== 'image')) { await ensureMediaSupport('trip_photos'); guard(); }
  let imported = 0;
  for (const { photo, destination, id } of pending) {
    guard(); progress(`Importando ${imported + 1} de ${pending.length} · ${destination.name}…`);
    const kind = mediaKind(photo), prefix = `${owner}/${trip.id}/${id}`;
    const path = `${prefix}.${kind === 'video' ? extension(photo.cloudPath, photo.blob) : 'jpg'}`;
    const thumb = kind === 'image' ? null : `${prefix}-thumb.jpg`;
    const motion = kind === 'live' ? `${prefix}-motion.${extension(photo.cloudMotionPath, photo.motionBlob)}` : null;
    const created = [];
    try {
      for (const [target, source, blob] of [[path, photo.cloudPath, photo.blob], [thumb, photo.cloudThumbPath, photo.thumbnail], [motion, photo.cloudMotionPath, photo.motionBlob]]) {
        if (!target) continue; guard();
        try {
          if (source) {
            if (!source.startsWith(`${owner}/`)) throw new Error('Esta mídia não pertence à sua coleção. Sincronize antes de importar.');
            await request('/storage/v1/object/copy', { method: 'POST', authenticated: true, body: { bucketId: 'atlas-media', sourceKey: source, destinationBucket: 'atlas-trip-media', destinationKey: target } });
          } else {
            if (!(blob instanceof Blob)) throw new Error('A mídia não está disponível neste dispositivo. Sincronize sua coleção antes de importar.');
            await request(`/storage/v1/object/atlas-trip-media/${target}`, { method: 'POST', authenticated: true, body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'false' } });
          }
          created.push(target);
        } catch (error) { if (error.status !== 409 && error.code !== 'Duplicate') throw error; }
        guard();
      }
      const body = { p_trip: trip.id, p_id: id, p_path: path, p_caption: (photo.caption || destination.name).slice(0, 500) };
      if (kind !== 'image') Object.assign(body, { p_kind: kind, p_thumbnail: thumb, p_motion: motion, p_duration: photo.duration });
      await request(`/rest/v1/rpc/${kind === 'image' ? 'atlas_add_trip_photo' : 'atlas_add_trip_media'}`, { method: 'POST', authenticated: true, body });
      guard(); imported++;
    } catch (error) {
      // Preserve uncertain writes for an idempotent retry; clean only known rejections.
      if (owner === currentUser()?.id && error.status >= 400 && error.status < 500 && error.status !== 429) await deleteObjects('atlas-trip-media', created).catch(() => {});
      throw error;
    }
  }
  const links = prepared.flatMap(({ destination, id }) => { const stop = stopForDestination(trip, destination), photo = byID.get(id); return stop?.id && !photo?.location_set && !photo?.stop_id ? [{ photo_id: id, stop_id: stop.id }] : []; });
  await assignTripPhotoStops(trip, links, valid); guard();
  return { imported, skipped: prepared.length - pending.length };
}
