import { readCloudWishlist, saveCloudWishlist, wishlistMigrationMissing, currentUser } from './cloud.js';
import { getWishlist, updateWishlistMeta } from './db.js';
export async function synchronizeWishlist(verifyAccount, discardLocal = false) {
  verifyAccount();
  const local = await getWishlist();
  try {
    if (local.cloudDirty && !discardLocal) {
      const revision = await saveCloudWishlist(local); verifyAccount();
      await updateWishlistMeta(current => current ? { ...current, revision, cloudDirty: current.localVersion !== local.localVersion } : null);
    }
    const remote = await readCloudWishlist(currentUser().id); verifyAccount();
    await updateWishlistMeta(current => {
      if (current?.cloudDirty && !discardLocal) return current;
      if (current && current.revision === remote.revision && !current.cloudDirty) return current;
      return { ...remote, cloudDirty: false, localVersion: crypto.randomUUID() };
    });
  } catch (error) {
    if (wishlistMigrationMissing(error)) {
      if (!local.cloudDirty) return;
      throw new Error('Para sincronizar sua wish list, execute supabase/wishlist.sql no Supabase. A lista continua salva neste dispositivo.');
    }
    throw error;
  }
}
