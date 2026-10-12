export const emptyWishlist = () => ({ items: [], is_public: false });
export function cleanWishlist(raw) {
  if (!raw || !Array.isArray(raw.items) || raw.items.length > 200 || typeof raw.is_public !== 'boolean') throw new Error('Use até 200 lugares e escolha a privacidade da wish list.');
  const ids = new Set();
  const items = raw.items.map(item => {
    if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) throw new Error('Informe um lugar com até 120 caracteres.');
    if (typeof item.country !== 'string' || item.country.length > 80 || typeof item.notes !== 'string' || item.notes.length > 2000) throw new Error('Use até 80 caracteres no país e 2.000 nas notas.');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.id || '') || ids.has(item.id.toLowerCase())) throw new Error('A wish list contém identificadores inválidos ou repetidos.');
    ids.add(item.id.toLowerCase());
    return { id: item.id.toLowerCase(), name: item.name.trim(), country: item.country.trim(), notes: item.notes.trim() };
  });
  return { items, is_public: raw.is_public };
}
export function mergeWishlistItems(current, incoming) {
  const result = [...current], names = new Set(current.map(i => `${i.name.toLocaleLowerCase('pt-BR')}|${i.country.toLocaleLowerCase('pt-BR')}`)), ids = new Set(current.map(i => i.id));
  for (const item of incoming) {
    const key = `${item.name.toLocaleLowerCase('pt-BR')}|${item.country.toLocaleLowerCase('pt-BR')}`;
    if (names.has(key)) continue;
    const id = ids.has(item.id) ? crypto.randomUUID() : item.id;
    result.push({ ...item, id }); names.add(key); ids.add(id);
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
    for (const field of ['name', 'country', 'notes']) {
      if (a[field] === b[field] || b[field] === old[field]) item[field] = a[field];
      else if (a[field] === old[field]) item[field] = b[field];
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
    if (items.some(mine => mine.name === item.name && mine.country === item.country && mine.notes === item.notes)) continue;
    items.push({ ...item, id: items.some(mine => mine.id === item.id) ? crypto.randomUUID() : item.id });
  }
  return cleanWishlist({ items, is_public: false });
}
