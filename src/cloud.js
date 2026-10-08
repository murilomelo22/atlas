import { supabaseConfig } from '../config.js';
import { readSession, writeSession } from './session.js';
import { sanitizeDestination } from './db.js';

function validConfig(config) {
  if (!config.url || !config.publishableKey) return null;
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('A URL pública do Supabase precisa ser HTTPS, sem caminho ou credenciais.');
  const key = config.publishableKey.trim();
  if (key.startsWith('sb_secret_')) throw new Error('Uma chave administrativa foi configurada. Remova-a do site e use somente a chave pública publishable/anon.');
  if (!key.startsWith('sb_publishable_')) {
    try { if (JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') throw new Error(); }
    catch { throw new Error('Use uma chave pública publishable ou anon; chaves administrativas não podem ficar no site.'); }
  }
  return { url: url.origin, key };
}
let config = null;
export let cloudConfigError = '';
try { config = validConfig(supabaseConfig); }
catch (error) { cloudConfigError = error.message; }
export const cloudEnabled = Boolean(config);
let session = null, refreshing = null;
const listeners = new Set();
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('atlas-auth') : null;
export const currentUser = () => session?.user || null;
export const onAuthChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
function announce() { for (const listener of listeners) listener(currentUser()); }
async function keepSession(raw, broadcast = true) {
  if (raw && (!raw.access_token || !raw.refresh_token || !/^[0-9a-f-]{36}$/i.test(raw.user?.id || ''))) throw new Error('A sessão recebida é inválida. Entre novamente.');
  session = raw ? { access_token: raw.access_token, refresh_token: raw.refresh_token, expires_at: raw.expires_at || Math.floor(Date.now() / 1000) + (raw.expires_in || 3600), user: { id: raw.user.id, email: raw.user.email || '' } } : null;
  await writeSession(session);
  if (broadcast) channel?.postMessage('changed');
  announce();
}
if (channel) channel.onmessage = async () => { session = await readSession() || null; announce(); };
function apiError(body, status) {
  const error = new Error(status === 401 ? 'Sua sessão expirou. Entre novamente para sincronizar.' : status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente novamente.' : status >= 500 ? 'A nuvem está indisponível. Seus dados locais foram preservados.' : 'Não foi possível concluir a operação.');
  error.code = body?.code || body?.error_code;
  if (error.code === '23505') error.message = 'Este nome de usuário já está em uso. Escolha outro.';
  if (body?.message?.includes('ATLAS_CONFLICT')) { error.code = 'conflict'; error.message = 'Uma viagem foi alterada em outro dispositivo. Suas mudanças locais foram preservadas. Carregue a versão da nuvem ou exporte um backup antes de continuar.'; }
  if (body?.error_code === 'invalid_credentials') error.message = 'E-mail ou senha incorretos.';
  if (body?.error_code === 'email_not_confirmed') error.message = 'Confirme seu e-mail antes de entrar.';
  if (body?.error_code === 'weak_password') error.message = 'A senha não atende à política de segurança. Use ao menos 8 caracteres.';
  if (error.code === '42P01' || error.code === 'PGRST202') error.message = 'O banco do Atlas ainda não foi configurado. Execute o schema.sql conforme o guia de ativação.';
  return error;
}
export async function request(path, { method = 'GET', body, authenticated = false, headers = {}, retry = true } = {}) {
  if (!config) throw new Error('O login ainda não foi ativado. A coleção local continua disponível.');
  if (authenticated && !session) throw new Error('Entre na sua conta para continuar.');
  if (authenticated && session.expires_at < Date.now() / 1000 + 30 && retry) await refreshSession();
  const token = authenticated ? session.access_token : config.key.startsWith('ey') ? config.key : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(config.url + path, {
      method, credentials: 'omit', signal: controller.signal,
      headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body instanceof Blob ? body : body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let raw; try { raw = await response.json(); } catch { raw = {}; }
      if (response.status === 401 && authenticated && retry) { await refreshSession(); return request(path, { method, body, authenticated, headers, retry: false }); }
      throw apiError(raw, response.status);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') throw new Error('Sem conexão com a nuvem. As alterações continuam salvas neste dispositivo e serão enviadas quando você sincronizar.');
    throw error;
  } finally { clearTimeout(timeout); }
}
async function refreshSession() {
  if (!session) throw new Error('Entre novamente para sincronizar.');
  if (!refreshing) refreshing = (async () => {
    try {
      const raw = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, retry: false });
      await keepSession(raw);
    } catch (error) {
      // Offline failures retain the cache and refresh token; invalid sessions do not.
      if (['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found'].includes(error.code)) await keepSession(null);
      throw error;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
const redirectURL = () => new URL('./', location.href).href;
export async function restoreAuth() {
  if (!cloudEnabled) return { recovery: false };
  session = await readSession() || null;
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('access_token') || hash.has('error_description')) {
    history.replaceState(null, '', location.pathname + location.search);
    if (hash.has('error_description')) throw new Error('O link de confirmação ou recuperação expirou. Solicite um novo.');
    const raw = { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_in: Number(hash.get('expires_in')) || 3600 };
    // Validate the provider token before persisting or selecting an account cache.
    const previous = session;
    session = { ...raw, expires_at: Date.now() / 1000 + 3600 };
    try { raw.user = await request('/auth/v1/user', { authenticated: true, retry: false }); await keepSession(raw); }
    catch (error) { session = previous; throw error; }
    return { recovery: hash.get('type') === 'recovery' };
  }
  return { recovery: false };
}
export async function signIn(email, password) {
  const raw = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  await keepSession(raw);
}
export async function signUp(email, password, name) {
  const raw = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectURL())}`, { method: 'POST', body: { email: email.trim(), password, data: { display_name: name.trim() } } });
  if (raw.access_token) await keepSession(raw);
  return Boolean(raw.access_token);
}
export async function recoverPassword(email) {
  await request(`/auth/v1/recover?redirect_to=${encodeURIComponent(redirectURL())}`, { method: 'POST', body: { email: email.trim() } });
}
export async function changePassword(password) {
  await request('/auth/v1/user', { method: 'PUT', body: { password }, authenticated: true });
}
export async function signOut() {
  // Logout remains possible offline. Private account caches are removed by the UI.
  try { if (session) await request('/auth/v1/logout', { method: 'POST', authenticated: true, retry: false }); }
  catch { /* Local logout still proceeds. */ }
  await keepSession(null);
}
async function rows(table, parameters, authenticated = false) {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const query = new URLSearchParams({ select: '*', ...parameters, limit: '1000', offset: String(offset) });
    const page = await request(`/rest/v1/${table}?${query}`, { authenticated });
    if (!Array.isArray(page)) throw new Error('A nuvem retornou dados inesperados. Tente novamente.');
    result.push(...page); if (page.length < 1000) return result;
  }
}
export async function myProfile() {
  const profiles = await rows('profiles', { id: `eq.${currentUser().id}` }, true);
  if (!profiles[0]) throw new Error('Seu perfil ainda não foi criado. Verifique a instalação do banco.');
  return profiles[0];
}
export async function saveProfile(profile) {
  if (!/^[a-z0-9_]{3,30}$/.test(profile.username)) throw new Error('Use um nome de usuário com 3 a 30 letras minúsculas, números ou sublinhado.');
  if (!profile.display_name.trim()) throw new Error('Informe seu nome de perfil.');
  return request(`/rest/v1/profiles?id=eq.${currentUser().id}`, { method: 'PATCH', authenticated: true, headers: { Prefer: 'return=representation' }, body: { username: profile.username, display_name: profile.display_name.trim().slice(0, 80), bio: profile.bio.slice(0, 500), avatar_path: profile.avatar_path || null, is_public: profile.is_public } });
}
export async function searchProfiles(query) {
  const safe = query.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  if (safe.length < 2) return [];
  return request(`/rest/v1/profiles?${new URLSearchParams({ select: 'id,username,display_name,bio,avatar_path', is_public: 'eq.true', username: `ilike.*${safe.replace(/_/g, '\\_')}*`, order: 'username', limit: '20' })}`);
}
const objectPath = (path) => path.split('/').map(encodeURIComponent).join('/');
export async function signedURL(bucket, path, authenticated = false) {
  const result = await request(`/storage/v1/object/sign/${bucket}/${objectPath(path)}`, { method: 'POST', body: { expiresIn: 300 }, authenticated });
  const signed = result.signedURL || result.signedUrl;
  if (!signed || !signed.startsWith('/object/sign/')) throw new Error('Não foi possível abrir a fotografia.');
  return `${config.url}/storage/v1${signed}`;
}
async function downloadBlob(bucket, path, authenticated) {
  const url = await signedURL(bucket, path, authenticated);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try { const response = await fetch(url, { signal: controller.signal, credentials: 'omit' }); if (!response.ok) throw new Error('Não foi possível baixar uma fotografia. Os dados locais foram preservados.'); return await response.blob(); }
  finally { clearTimeout(timeout); }
}
export async function avatarURL(profile, authenticated = false) {
  return profile.avatar_path ? signedURL('atlas-avatars', profile.avatar_path, authenticated) : null;
}
async function upload(bucket, path, blob) {
  await request(`/storage/v1/object/${bucket}/${objectPath(path)}`, { method: 'POST', authenticated: true, body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'false' } });
}
export async function uploadAvatar(blob) {
  const path = `${currentUser().id}/${crypto.randomUUID()}.jpg`;
  await upload('atlas-avatars', path, blob); return path;
}
export async function deleteObjects(bucket, paths) {
  if (paths.length) await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', authenticated: true, body: { prefixes: [...new Set(paths)] } });
}
async function hash(value) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function cleanRemote(row) {
  const data = row.data;
  if (!data || typeof data.name !== 'string' || !Array.isArray(data.visits) || !Array.isArray(data.photoIds) || !Array.isArray(data.tags)) throw new Error('Uma viagem na nuvem tem formato inválido. Exporte um backup e verifique os dados.');
  const clean = sanitizeDestination(data);
  return { ...clean, photoIds: data.photoIds.filter((id) => typeof id === 'string'), coverId: typeof data.coverId === 'string' ? data.coverId : null, id: row.id, visibility: row.visibility, cloudRevision: row.revision, cloudDirty: false, example: false };
}
export async function readCollection(ownerId, { publicOnly = false, cachedPhotos = [] } = {}) {
  const authenticated = !publicOnly;
  const destinations = (await rows('destinations', { owner_id: `eq.${ownerId}`, ...(publicOnly ? { visibility: 'eq.public' } : {}) }, authenticated)).filter((r) => r.owner_id === ownerId && (!publicOnly || r.visibility === 'public')).map(cleanRemote);
  const visible = new Set(destinations.map((d) => d.id));
  const photoRows = (await rows('photos', { owner_id: `eq.${ownerId}` }, authenticated)).filter((p) => p.owner_id === ownerId && visible.has(p.destination_id));
  const photos = [];
  for (const row of photoRows) {
    const cached = cachedPhotos.find((p) => p.id === row.id && p.destinationId === row.destination_id && p.cloudPath === row.storage_path && p.cloudThumbPath === row.thumbnail_path);
    photos.push({ id: row.id, destinationId: row.destination_id, caption: row.caption || '', blob: cached?.blob || await downloadBlob('atlas-media', row.storage_path, authenticated), thumbnail: cached?.thumbnail || await downloadBlob('atlas-media', row.thumbnail_path, authenticated), cloudPath: row.storage_path, cloudThumbPath: row.thumbnail_path });
  }
  return { destinations, photos };
}
export async function publicProfile(username) {
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('Nome de usuário inválido.');
  const profiles = await rows('profiles', { username: `eq.${username}`, is_public: 'eq.true' });
  const profile = profiles.find((p) => p.username === username && p.is_public);
  if (!profile) throw new Error('Este perfil não existe ou está privado.');
  return { profile, ...await readCollection(profile.id, { publicOnly: true }) };
}
export async function saveCloudDestination(destination, photos) {
  const existingPhotos = await rows('photos', { owner_id: `eq.${currentUser().id}`, destination_id: `eq.${destination.id}` }, true);
  const prepared = [];
  const staged = [];
  try {
    for (const photo of photos) {
      const original = existingPhotos.find((p) => p.id === photo.id);
      let path = photo.cloudPath, thumbPath = photo.cloudThumbPath;
      if (!original || original.storage_path !== path || original.thumbnail_path !== thumbPath) {
        const folder = `${currentUser().id}/${await hash(destination.id)}/${crypto.randomUUID()}`;
        path = `${folder}.jpg`; thumbPath = `${folder}-thumb.jpg`;
        await upload('atlas-media', path, photo.blob); staged.push(path);
        await upload('atlas-media', thumbPath, photo.thumbnail); staged.push(thumbPath);
      }
      prepared.push({ id: photo.id, storage_path: path, thumbnail_path: thumbPath, caption: photo.caption });
    }
    const { cloudRevision, cloudDirty, localVersion, ...data } = destination;
    const revision = await request('/rest/v1/rpc/save_destination', { method: 'POST', authenticated: true, body: { p_id: destination.id, p_data: data, p_visibility: destination.visibility || 'private', p_expected_revision: cloudRevision || null, p_photos: prepared } });
    // Object cleanup is best effort after metadata committed. Never undo a successful save.
    const retained = new Set(prepared.flatMap((p) => [p.storage_path, p.thumbnail_path]));
    await deleteObjects('atlas-media', existingPhotos.flatMap((p) => [p.storage_path, p.thumbnail_path]).filter((p) => !retained.has(p))).catch(() => {});
    return { revision, photos: prepared };
  } catch (error) {
    // Do not remove staged objects after an ambiguous network error: the RPC may have committed.
    if (error.code) await deleteObjects('atlas-media', staged).catch(() => {});
    throw error;
  }
}
export async function deleteCloudDestination(tombstone) {
  await request('/rest/v1/rpc/delete_destination', { method: 'POST', authenticated: true, body: { p_id: tombstone.id, p_expected_revision: tombstone.cloudRevision || null } });
  await deleteObjects('atlas-media', tombstone.paths || []).catch(() => {});
}
