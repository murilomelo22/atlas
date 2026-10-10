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
