import { readCloudWishlist, saveCloudWishlist, wishlistMigrationMissing, currentUser } from './cloud.js';
import { getWishlist, updateWishlistMeta } from './db.js';
import { cleanWishlist, reconcileWishlist } from './wishlist-data.js';
export async function synchronizeWishlist(verifyAccount, discardLocal = false) {
  verifyAccount();
  const local = await getWishlist();
  try {
    if (local.cloudDirty && !discardLocal) {
      let snapshot = local;
      // A revision conflict gets one reconciliation attempt, never an unbounded loop.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const revision = await saveCloudWishlist(snapshot); verifyAccount();
          await updateWishlistMeta(current => current ? { ...current, revision, cloudBase: cleanWishlist(snapshot), conflict: false, cloudDirty: current.localVersion !== snapshot.localVersion } : null);
          break;
        } catch (error) {
          verifyAccount();
          if (error.code !== 'conflict') throw error;
          if (attempt === 1) {
            await updateWishlistMeta(current => current ? { ...current, conflict: true } : null);
            throw error;
          }
          const remote = await readCloudWishlist(currentUser().id); verifyAccount();
          let reconciled = false;
          await updateWishlistMeta(current => {
            if (!current) return null;
            const merged = reconcileWishlist(current.cloudBase, current, remote);
            if (!merged) return { ...current, conflict: true };
            reconciled = true;
            return { ...merged, revision: remote.revision, cloudBase: cleanWishlist(remote), cloudDirty: true, conflict: false, localVersion: crypto.randomUUID() };
          });
          if (!reconciled) throw error;
          verifyAccount(); snapshot = await getWishlist(); verifyAccount();
        }
      }
    }
    const remote = await readCloudWishlist(currentUser().id); verifyAccount();
    await updateWishlistMeta(current => {
      if (current?.cloudDirty && !discardLocal) return current;
      if (current && current.revision === remote.revision && !current.cloudDirty) return { ...current, cloudBase: cleanWishlist(remote), conflict: false };
      return { ...remote, cloudBase: cleanWishlist(remote), cloudDirty: false, conflict: false, localVersion: crypto.randomUUID() };
    });
  } catch (error) {
    if (wishlistMigrationMissing(error)) {
      if (!local.cloudDirty) return;
      throw new Error('Para sincronizar sua wish list, execute supabase/wishlist.sql no Supabase. A lista continua salva neste dispositivo.');
    }
    throw error;
  }
}
