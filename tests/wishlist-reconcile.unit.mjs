import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileWishlist, combineWishlistForReview } from '../src/wishlist-data.js';
const a = { id: '10000000-0000-4000-8000-000000000001', name: 'Kyoto', country: 'Japão', notes: 'Templos' };
const b = { ...a, id: '10000000-0000-4000-8000-000000000002', name: 'Osaka' };
const list = (items, is_public = false) => ({ items, is_public });
test('a deletion and an unrelated addition survive reconciliation', () => {
  assert.deepEqual(reconcileWishlist(list([a]), list([]), list([a, b])), list([b]));
});
test('edits to different fields of one place are combined', () => {
  assert.deepEqual(reconcileWishlist(list([a]), list([{ ...a, name: 'Kyoto e arredores' }]), list([{ ...a, notes: 'Trilhas' }])), list([{ ...a, name: 'Kyoto e arredores', notes: 'Trilhas' }]));
});
test('an edit versus deletion requires review', () => {
  assert.equal(reconcileWishlist(list([a]), list([]), list([{ ...a, notes: 'Trilhas' }])), null);
});
test('different edits to the same field require review', () => {
  assert.equal(reconcileWishlist(list([a]), list([{ ...a, notes: 'Trilhas' }]), list([{ ...a, notes: 'Museus' }])), null);
});
test('an old cache without a baseline never guesses deleted items', () => {
  assert.equal(reconcileWishlist(null, list([a]), list([a, b])), null);
  assert.deepEqual(reconcileWishlist(null, list([a]), list([a])), list([a]));
});
test('a local privacy change survives remote item additions', () => {
  assert.deepEqual(reconcileWishlist(list([a], true), list([a], false), list([a, b], true)), list([a, b], false));
});
test('review keeps both notes for the same ID and defaults to private', () => {
  const result = combineWishlistForReview(list([a], true), list([{ ...a, notes: 'Museus' }], true));
  assert.equal(result.is_public, false);
  assert.deepEqual(result.items.map(i => i.notes), ['Templos', 'Museus']);
  assert.notEqual(result.items[0].id, result.items[1].id);
});
test('review collapses exact copies without dropping different notes', () => {
  assert.deepEqual(combineWishlistForReview(list([a]), list([a])), list([a]));
});
test('automatic reconciliation respects the 200-place limit', () => {
  const items = Array.from({ length: 200 }, (_, i) => ({ ...a, name: `Lugar ${i}`, id: `10000000-0000-4000-8000-${String(i + 3).padStart(12, '0')}` }));
  assert.equal(reconcileWishlist(list([]), list(items), list([a])), null);
  assert.throws(() => combineWishlistForReview(list(items), list([a])), /200/);
});
