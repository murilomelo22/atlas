import { randomUUID } from 'node:crypto';
export const ALICE = '10000000-0000-4000-8000-000000000001';
export const BOB = '10000000-0000-4000-8000-000000000002';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
// Deterministic HTTP fixture, NOT a replacement for verify-policies.sql on PostgreSQL.
export async function mockCloud(page) {
  const state = {
    profiles: [
      { id: ALICE, username: 'alice', display_name: 'Alice Viajante', bio: 'Pelos caminhos do mundo', is_public: true, avatar_path: null },
      { id: BOB, username: 'bob', display_name: 'Bruno', bio: '', is_public: true, avatar_path: null },
    ], wishlists: [], posts: [], photos: [], objects: new Map(), grants: new Map(), failed: false, confirmation: true, recoveries: 0, refreshes: 0, changedPassword: null, requests: [],
  };
  state.session = (id = ALICE) => ({ access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_in: 3600, user: { id, email: id === ALICE ? 'alice@example.com' : 'bob@example.com' } });
  state.addPost = (id, name, owner = ALICE, visibility = 'private') => {
    const row = { id, owner_id: owner, visibility, revision: randomUUID(), data: { id, name, lat: 48.8566, lng: 2.3522, notes: '', rating: 4, tags: ['viagem'], visits: [{ id: 'visit', arrival: '2025-05-01', departure: '2025-05-03', manualDays: null }], photoIds: [], coverId: null, createdAt: '2025-05-01T12:00:00Z', updatedAt: '2025-05-01T12:00:00Z' } };
    state.posts.push(row); return row;
  };
  await page.route('**/config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export const supabaseConfig = {url:'https://atlas-tests.supabase.co', publishableKey:'sb_publishable_test_fixture'};" }));
  await page.route('https://*.basemaps.cartocdn.com/**', (route) => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.abort());
  await page.route('https://atlas-tests.supabase.co/**', async (route) => {
    if (state.failed) return route.abort();
    const request = route.request(), url = new URL(request.url()), path = decodeURIComponent(url.pathname), method = request.method();
    const auth = request.headers().authorization || '';
    const owner = auth.startsWith('Bearer token-') ? auth.slice('Bearer token-'.length) : null;
    state.requests.push({ path, method, owner });
    let body; try { body = request.postDataJSON(); } catch { body = {}; }
    const ok = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: data == null ? '' : JSON.stringify(data) });
    const denied = () => ok({ message: 'Forbidden' }, 403);
    const canRead = (post) => post.owner_id === owner || post.visibility === 'public' && state.profiles.find((p) => p.id === post.owner_id)?.is_public;
    const filter = (rows) => rows.filter((row) => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || row[key] === (value.slice(3) === 'true' ? true : value.slice(3))));
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'refresh_token') { state.refreshes++; return ok(state.session(body.refresh_token?.endsWith(BOB) ? BOB : ALICE)); }
      if (body.password !== 'password123') return ok({ error_code: 'invalid_credentials' }, 400);
      return ok(state.session(body.email === 'bob@example.com' ? BOB : ALICE));
    }
    if (path === '/auth/v1/signup') return ok(state.confirmation ? { user: { id: ALICE } } : state.session());
    if (path === '/auth/v1/recover') { state.recoveries++; return ok({}); }
    if (path === '/auth/v1/logout') return ok(null, 204);
    if (path === '/auth/v1/user') {
      if (!owner) return ok({}, 401);
      if (method === 'PUT') state.changedPassword = body.password;
      return ok(state.session(owner).user);
    }
    if (path === '/rest/v1/trip_publications') return ok([]);
    if (path === '/rest/v1/profiles') {
      if (method === 'PATCH') {
        if (!owner || url.searchParams.get('id') !== `eq.${owner}`) return denied();
        if (state.profiles.some((p) => p.username === body.username && p.id !== owner)) return ok({ code: '23505' }, 409);
        const profile = state.profiles.find((p) => p.id === owner); Object.assign(profile, body); return ok([profile]);
      }
      let profiles = filter(state.profiles.filter((p) => p.is_public || p.id === owner));
      const query = url.searchParams.get('username');
      if (query?.startsWith('ilike.')) profiles = profiles.filter((p) => p.username.includes(query.slice(7, -1).replaceAll('\\_', '_')));
      return ok(profiles);
    }
    if (path === '/rest/v1/wishlists') return ok(filter(state.wishlists.filter(w => w.owner_id === owner || w.is_public && state.profiles.some(p => p.id === w.owner_id && p.is_public))));
    if (path === '/rest/v1/rpc/atlas_save_wishlist') {
      if (!owner) return denied();
      const old = state.wishlists.find(w => w.owner_id === owner);
      if ((old?.revision || null) !== body.p_expected_revision) {
        if (old && old.is_public === body.p_public && JSON.stringify(old.items) === JSON.stringify(body.p_items)) return ok(old.revision);
        return ok({ code: '40001', message: 'ATLAS_WISHLIST_CONFLICT' }, 409);
      }
      const row = { owner_id: owner, items: body.p_items, is_public: body.p_public, revision: randomUUID() };
      state.wishlists = state.wishlists.filter(w => w !== old); state.wishlists.push(row); return ok(row.revision);
    }
    if (path === '/rest/v1/destinations') return ok(filter(state.posts.filter(canRead)));
    if (path === '/rest/v1/photos') return ok(filter(state.photos.filter((p) => state.posts.some((post) => post.id === p.destination_id && post.owner_id === p.owner_id && canRead(post)))));
    if (path === '/rest/v1/rpc/save_destination') {
      if (!owner) return denied();
      const old = state.posts.find((p) => p.owner_id === owner && p.id === body.p_id);
      if ((old?.revision || null) !== body.p_expected_revision) return ok({ code: '40001', message: 'ATLAS_CONFLICT' }, 409);
      const row = { id: body.p_id, owner_id: owner, data: body.p_data, visibility: body.p_visibility, revision: randomUUID() };
      state.posts = state.posts.filter((p) => p !== old); state.posts.push(row);
      state.photos = state.photos.filter((p) => !(p.owner_id === owner && p.destination_id === row.id));
      state.photos.push(...body.p_photos.map((p) => ({ ...p, owner_id: owner, destination_id: row.id })));
      return ok(row.revision);
    }
    if (path === '/rest/v1/rpc/delete_destination') {
      if (!owner) return denied();
      const old = state.posts.find((p) => p.owner_id === owner && p.id === body.p_id);
      if (old && old.revision !== body.p_expected_revision) return ok({ code: '40001', message: 'ATLAS_CONFLICT' }, 409);
      state.posts = state.posts.filter((p) => p !== old); state.photos = state.photos.filter((p) => !(p.owner_id === owner && p.destination_id === body.p_id));
      return ok(null, 204);
    }
    const sign = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (sign) {
      const [, bucket, object] = sign, key = `${bucket}/${object}`;
      if (method === 'GET') {
        if (state.grants.get(url.searchParams.get('token')) !== key || !state.objects.has(key)) return denied();
        return route.fulfill({ contentType: object.endsWith('.mp4') ? 'video/mp4' : object.endsWith('.webm') ? 'video/webm' : object.endsWith('.mov') ? 'video/quicktime' : 'image/jpeg', body: state.objects.get(key) });
      }
      const allowed = bucket === 'atlas-trip-media' && (state.tripPhotos || []).some(p => [p.storage_path, p.thumbnail_path, p.motion_path].includes(object) && (state.trips || []).some(t => t.id === p.trip_id && (t.is_public || t.owner_id === owner || (state.members || []).some(m => m.trip_id === t.id && m.user_id === owner)))) || bucket === 'atlas-trip-covers' && (state.trips || []).some(t => t.cover_path === object && (t.is_public || t.owner_id === owner || (state.members || []).some(m => m.trip_id === t.id && m.user_id === owner))) || object.startsWith(`${owner}/`) || bucket === 'atlas-media' && state.photos.some((photo) => [photo.storage_path, photo.thumbnail_path, photo.motion_path].includes(object) && state.posts.some((post) => post.id === photo.destination_id && post.owner_id === photo.owner_id && canRead(post))) || bucket === 'atlas-avatars' && state.profiles.some((p) => p.is_public && p.avatar_path === object);
      if (!allowed) return denied();
      const token = randomUUID(); state.grants.set(token, key);
      return ok({ signedURL: `/object/sign/${bucket}/${object}?token=${token}` });
    }
    const storage = path.match(/^\/storage\/v1\/object\/([^/]+)(?:\/(.+))?$/);
    if (storage) {
      const [, bucket, object] = storage;
      if (!owner || object && !object.startsWith(`${owner}/`)) return denied();
      if (bucket === 'atlas-trip-media' && method === 'POST') {
        const trip = (state.trips || []).find(t => t.id === object.split('/')[1]), member = (state.members || []).find(m => m.trip_id === trip?.id && m.user_id === owner);
        if (!trip || trip.owner_id !== owner && !(member?.status === 'accepted' && member.can_add_photos)) return denied();
        if (state.objects.has(`${bucket}/${object}`)) return ok({message:'Duplicate'},409);
      }
      if (method === 'DELETE') { for (const prefix of body.prefixes) if (prefix.startsWith(`${owner}/`)) state.objects.delete(`${bucket}/${prefix}`); return ok({}); }
      state.objects.set(`${bucket}/${object}`, request.postDataBuffer()); return ok({ Key: object });
    }
    return ok({ message: `Unmocked endpoint: ${path}` }, 500);
  });
  return state;
}
