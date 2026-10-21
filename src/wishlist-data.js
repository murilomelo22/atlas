export const emptyWishlist = () => ({ items: [], is_public: false });
export const wishlistStatuses = { wishlist: 'Quero conhecer', planning: 'Planejando', visited: 'Já visitei' };
export const wishlistStatus = item => item.status || 'wishlist';
export const hasWishlistLocation = item => Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lng);
export function cleanWishlist(raw) {
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 200 || typeof raw.is_public !== 'boolean') throw new Error('Use até 200 lugares e escolha a privacidade da wish list.');
  const ids = new Set();
  const items = raw.items.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) throw new Error('Informe um lugar com até 120 caracteres.');
    if (typeof item.country !== 'string' || item.country.length > 80 || typeof item.notes !== 'string' || item.notes.length > 2000) throw new Error('Use até 80 caracteres no país e 2.000 nas notas.');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id || '') || ids.has(item.id.toLowerCase())) throw new Error('A wish list contém identificadores inválidos ou repetidos.');
    ids.add(item.id.toLowerCase());
    const clean = { id: item.id.toLowerCase(), name: item.name.trim(), country: item.country.trim(), notes: item.notes.trim() };
    if (item.status !== undefined && (typeof item.status !== 'string' || !Object.hasOwn(wishlistStatuses, item.status))) throw new Error('Escolha Quero conhecer, Planejando ou Já visitei.');
    // Omit defaults so older text-only lists keep their original cloud payload.
    if (item.status && item.status !== 'wishlist') clean.status = item.status;
    if (item.location !== undefined) {
      const { lat, lng } = item.location || {};
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Latitude deve estar entre −90 e 90; longitude entre −180 e 180.');
      clean.location = { lat, lng };
    }
    return clean;
  });
  return { items, is_public: raw.is_public };
}
export function mergeWishlistItems(current, incoming) {
  const result = [...current], ids = new Set(current.map(i => i.id));
  const nameKey = item => `${item.name.toLocaleLowerCase('pt-BR')}|${item.country.toLocaleLowerCase('pt-BR')}`;
  for (const item of incoming) {
    // Two branches of a cafe or trail may have the same name and country.
    // Preserve distinct known locations while keeping legacy text deduplication.
    if (result.some(saved => nameKey(saved) === nameKey(item) && (!hasWishlistLocation(saved) || !hasWishlistLocation(item) || same(saved.location, item.location)))) continue;
    const id = ids.has(item.id) ? crypto.randomUUID() : item.id;
    result.push({ ...item, id }); ids.add(id);
  }
  if (result.length > 200) throw new Error('A wish list pode ter até 200 lugares. Reduza a lista antes de importar.');
  return result;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Use the last confirmed cloud snapshot to distinguish additions, edits and deletions.
// An ambiguous edit/delete or two different edits to one field require review.
export function reconcileWishlist(base, local, remote) {
  if (!base) return same(cleanWishlist(local), cleanWishlist(remote)) ? cleanWishlist(remote) : null;
  const original = cleanWishlist(base), mine = cleanWishlist(local), theirs = cleanWishlist(remote);
  const byId = list => new Map(list.map(item => [item.id, item]));
  const before = byId(original.items), left = byId(mine.items), right = byId(theirs.items);
  const items = [];
  for (const id of new Set([...left.keys(), ...right.keys(), ...before.keys()])) {
    const old = before.get(id), a = left.get(id), b = right.get(id);
    if (same(a, b)) { if (a) items.push(a); continue; }
    if (same(a, old)) { if (b) items.push(b); continue; }
    if (same(b, old)) { if (a) items.push(a); continue; }
    if (!old || !a || !b) return null;
    const item = { id };
    // Coordinates are one atomic field: never combine latitude from one edit
    // with longitude from another and accidentally move a place.
    for (const field of ['name', 'country', 'notes', 'status', 'location']) {
      if (same(a[field], b[field]) || same(b[field], old[field])) item[field] = a[field];
      else if (same(a[field], old[field])) item[field] = b[field];
      else return null;
    }
    items.push(item);
  }
  if (items.length > 200) return null;
  const is_public = mine.is_public === original.is_public ? theirs.is_public : mine.is_public;
  return cleanWishlist({ items, is_public });
}

// Explicit review for older caches or genuinely conflicting edits: keep both versions.
export function combineWishlistForReview(local, remote) {
  const items = cleanWishlist(local).items.slice();
  for (const item of cleanWishlist(remote).items) {
    if (items.some(mine => same({ ...mine, id: '' }, { ...item, id: '' }))) continue;
    items.push({ ...item, id: items.some(mine => mine.id === item.id) ? crypto.randomUUID() : item.id });
  }
  return cleanWishlist({ items, is_public: false });
}
