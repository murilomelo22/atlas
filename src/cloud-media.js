import { currentUser, downloadBlob, readWithRetry, onAuthChange } from './cloud.js';
import { currentAccountId, cachePhotoParts, getPhoto } from './db.js';

const pending = new Map();
const transfers = new Map();
let activeTransfers = 0;
const waiting = [];
async function transfer(operation, valid, foreground) {
  await new Promise(resolve => {
    const begin = () => { activeTransfers++; resolve(); };
    if (activeTransfers < 2) begin(); else if (foreground) waiting.unshift(begin); else waiting.push(begin);
  });
  try { if (!valid()) throw new DOMException('Operação cancelada.', 'AbortError'); return await operation(); }
  finally { activeTransfers--; waiting.shift()?.(); }
}
export function cancelMediaDownloads() { for (const controller of transfers.keys()) controller.abort(); }
onAuthChange(user => { for (const [controller, owner] of transfers) if (owner && owner !== user?.id) controller.abort(); });
const paths = { blob: 'cloudPath', thumbnail: 'cloudThumbPath', motionBlob: 'cloudMotionPath' };
export const sameCloudMedia = (a, b) => a.id === b.id && a.destinationId === b.destinationId && a.cloudPath === b.cloudPath && a.cloudThumbPath === b.cloudThumbPath && (a.cloudMotionPath || null) === (b.cloudMotionPath || null);

export async function loadCloudMedia(photo, { parts = ['thumbnail'], authenticated = true, persist = authenticated, valid = () => true } = {}) {
  const account = currentUser()?.id, result = { ...photo };
  const authorized = () => !authenticated || !photo.cloudPath || account && account === currentUser()?.id && account === currentAccountId();
  if (!valid() || !authorized()) throw new DOMException('Operação cancelada.', 'AbortError');
  if (persist && authorized()) {
    const cached = await getPhoto(photo.id);
    if (cached && sameCloudMedia(cached, photo)) for (const key of ['blob', 'thumbnail', 'motionBlob']) if (cached[key] instanceof Blob) result[key] = cached[key];
  }
  for (const part of parts) {
    if (!valid() || !authorized()) throw new DOMException('Operação cancelada.', 'AbortError');
    if (result[part] instanceof Blob) continue;
    const path = photo[paths[part]];
    if (!path) throw new Error('Esta mídia não está disponível neste dispositivo. Sincronize sua coleção e tente novamente.');
    const key = `${authenticated ? account : 'public'}:${part}:${path}`;
    if (!pending.has(key)) {
      const controller = new AbortController(); transfers.set(controller, authenticated ? account : null);
      const allowed = () => authorized() && !controller.signal.aborted;
      pending.set(key, transfer(() => readWithRetry(() => downloadBlob('atlas-media', path, authenticated, { signal: controller.signal }), allowed), allowed, parts.some(p => p !== 'thumbnail'))
        .finally(() => { pending.delete(key); transfers.delete(controller); }));
    }
    result[part] = await pending.get(key);
    if (!valid() || !authorized()) throw new DOMException('Operação cancelada.', 'AbortError');
    // Commit each successful part so a later failure never discards a completed download.
    if (persist) await cachePhotoParts(result, account);
  }
  if (!valid() || !authorized()) throw new DOMException('Operação cancelada.', 'AbortError');
  return result;
}

export async function downloadOffline(photos, { onProgress = () => {}, valid = () => true } = {}) {
  let next = 0, done = 0, failed = 0;
  async function worker() {
    while (next < photos.length && valid()) {
      const photo = photos[next++];
      try { await loadCloudMedia(photo, { parts: ['thumbnail', 'blob', ...(photo.kind === 'live' ? ['motionBlob'] : [])], valid }); }
      catch (error) { if (!valid() || error.name === 'AbortError') return; failed++; }
      onProgress(++done, photos.length, failed);
    }
  }
  await Promise.all([worker(), worker()]);
  return { done, failed, cancelled: !valid() };
}
