import { synchronizeWishlist } from './wishlist-sync.js';
import { currentUser, saveCloudDestination, deleteCloudDestination, readCollection } from './cloud.js';
import { currentAccountId, getDestinations, getAllPhotos, getPhotos, getMeta, setMeta, markCloudSaved, mergeCloudCollection } from './db.js';
let operation = null;
export const syncRunning = () => Boolean(operation);
export async function synchronize(onStatus = () => {}, { discardLocal = false, onWishlistSync = () => {} } = {}) {
  if (operation) return operation;
  const owner = currentUser()?.id;
  if (!owner || owner !== currentAccountId()) return;
  operation = (async () => {
    const verifyAccount = () => {
      if (owner !== currentUser()?.id || owner !== currentAccountId()) throw new Error('A conta mudou durante a sincronização. Entre novamente.');
    };
    onStatus('Sincronizando…');
    let wishlistError;
    try { await synchronizeWishlist(verifyAccount, discardLocal); }
    catch (error) { verifyAccount(); wishlistError = error; }
    verifyAccount(); await onWishlistSync(); verifyAccount();
    let collectionError;
    try {
      if (!discardLocal) {
        const tombstones = await getMeta('deleted') || [];
        for (const tombstone of tombstones) {
          verifyAccount(); await deleteCloudDestination(tombstone); verifyAccount();
          await setMeta('deleted', (await getMeta('deleted') || []).filter((d) => d.id !== tombstone.id));
        }
        for (const destination of (await getDestinations()).filter((d) => d.cloudDirty)) {
          verifyAccount(); onStatus(`Salvando ${destination.name}…`);
          const saved = await saveCloudDestination(destination, await getPhotos(destination.id));
          verifyAccount(); await markCloudSaved(destination, saved.revision, saved.photos);
        }
      }
      verifyAccount();
      const collection = await readCollection(owner, { cachedPhotos: await getAllPhotos(), cachedDestinations: discardLocal ? [] : await getDestinations() });
      verifyAccount(); await mergeCloudCollection(collection, discardLocal);
    } catch (error) { verifyAccount(); collectionError = error; }
    if (collectionError) {
      const wish = await getMeta('wishlist'); verifyAccount();
      if (!wishlistError && wish?.revision && !wish.cloudDirty) collectionError.message = `Wish list salva na sua conta. Falha ao sincronizar as viagens: ${collectionError.message}`;
      throw collectionError;
    }
    if (wishlistError) throw wishlistError;
    const pending = (await getDestinations()).some((d) => d.cloudDirty) || (await getMeta('wishlist'))?.cloudDirty;
    onStatus(pending ? 'Há alterações locais aguardando sincronização.' : 'Tudo salvo na sua conta.');
  })();
  try { await operation; }
  finally { operation = null; }
}
