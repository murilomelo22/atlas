import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanWishlist, mergeWishlistItems, reconcileWishlist, combineWishlistForReview } from '../src/wishlist-data.js';
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

test('legacy items retain their payload and malformed coordinates or states are rejected', () => {
  assert.deepEqual(cleanWishlist(list([a])), list([a]));
  for (const location of [null, { lat: '35', lng: 135 }, { lat: 91, lng: 0 }, { lat: 0 }, { lat: 0, lng: Infinity }]) assert.throws(() => cleanWishlist(list([{ ...a, location }])));
  for (const status of ['invalid', null, ['planning']]) assert.throws(() => cleanWishlist(list([{ ...a, status }])));
  assert.deepEqual(cleanWishlist(list([{ ...a, location: { lat: 0, lng: 0 }, status: 'wishlist' }])), list([{ ...a, location: { lat: 0, lng: 0 } }]));
});
test('coordinate additions, state edits and unrelated notes merge without losing fields', () => {
  const location = { lat: 35, lng: 135 };
  assert.deepEqual(reconcileWishlist(list([a]), list([{ ...a, location, status: 'planning' }]), list([{ ...a, notes: 'Nova nota' }])), list([{ ...a, notes: 'Nova nota', location, status: 'planning' }]));
});
test('coordinates are atomic and competing location changes require review', () => {
  const original = { ...a, location: { lat: 35, lng: 135 } };
  assert.equal(reconcileWishlist(list([original]), list([{ ...original, location: { lat: 34, lng: 135 } }]), list([{ ...original, location: { lat: 35, lng: 136 } }])), null);
  assert.equal(combineWishlistForReview(list([original]), list([{ ...original, status: 'visited' }])).items.length, 2);
});
test('backup deduplication preserves places with equal names at different locations', () => {
  const first = { ...a, location: { lat: 35, lng: 135 } }, second = { ...first, id: b.id, location: { lat: 34, lng: 135 } };
  assert.deepEqual(mergeWishlistItems([], [first, second]), [first, second]);
  assert.equal(mergeWishlistItems([first, second], [first, second]).length, 2);
  assert.equal(mergeWishlistItems([a], [first]).length, 1);
});
