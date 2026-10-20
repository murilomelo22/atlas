import { supabaseConfig } from '../config.js';
import { readSession, writeSession } from './session.js';
import { sanitizeDestination } from './db.js';
import { mediaKind, mediaExtension } from './media.js';
import { cleanWishlist, emptyWishlist } from './wishlist-data.js';
import { cloudDiagnostic } from './cloud-diagnostics.js';

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
const signedCache = new Map(), signing = new Map();
const listeners = new Set();
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('atlas-auth') : null;
export const currentUser = () => session?.user || null;
export const needsReconnect = () => Boolean(session?.needsLogin);
export const reconnectMessage = 'Sua sessão precisa ser renovada. Use “Entrar novamente” com a mesma conta; suas alterações locais foram preservadas.';
const reconnectError = () => Object.assign(new Error(reconnectMessage), { code: 'reauth_required' });
export const onAuthChange = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
function announce() { for (const listener of listeners) listener(currentUser()); }
async function keepSession(raw, broadcast = true) {
  if (raw?.user?.id !== session?.user?.id) signedCache.clear();
  if (raw && (!raw.access_token || !raw.refresh_token || !/^[0-9a-f-]{36}$/i.test(raw.user?.id || ''))) throw new Error('A sessão recebida é inválida. Entre novamente.');
  session = raw ? { access_token: raw.access_token, refresh_token: raw.refresh_token, expires_at: raw.expires_at || Math.floor(Date.now() / 1000) + (raw.expires_in || 3600), user: { id: raw.user.id, email: raw.user.email || '' } } : null;
  await writeSession(session);
  if (broadcast) channel?.postMessage('changed');
  announce();
}
if (channel) channel.onmessage = async () => { const next = await readSession() || null; if (next?.user?.id !== session?.user?.id) signedCache.clear(); session = next; announce(); };
function apiError(body, status, path, method) {
  const error = new Error(status === 401 ? 'Sua sessão expirou. Entre novamente para sincronizar.' : status === 429 ? 'Muitas tentativas. Aguarde um pouco e tente novamente.' : status >= 500 ? 'A nuvem está indisponível. Seus dados locais foram preservados.' : 'Não foi possível concluir a operação.');
  error.code = body?.code || body?.error_code;
  error.status = status;
  error.diagnostic = cloudDiagnostic({ status, code: error.code, path, method, message: body?.message || body?.msg || body?.error_description || (typeof body?.error === 'string' ? body.error : '') });
  if (['PT409', '40001'].includes(error.code)) {
    error.code = 'conflict';
    error.message = path?.endsWith('/atlas_save_wishlist')
      ? 'Sua wish list mudou em outro dispositivo. Abra a wish list e use “Revisar e combinar listas”. Suas alterações locais foram preservadas.'
      : 'Uma viagem foi alterada em outro dispositivo. Suas mudanças locais foram preservadas. Carregue a versão da nuvem ou exporte um backup antes de continuar.';
  }
  if (error.code === '57014') error.message = 'O banco demorou demais e cancelou a operação. Seus dados continuam neste dispositivo. Tente sincronizar novamente quando o Supabase se recuperar.';
  if (error.code === '42501' || status === 403) error.message = 'O banco recusou a operação por falta de permissão. Seus dados locais foram preservados. É necessário verificar as permissões no Supabase.';
  if (error.code === '22023') error.message = 'O banco recusou os dados enviados. Suas alterações locais foram preservadas.';
  const providerMessage = String(body?.message || body?.msg || body?.error_description || '');
  if (path?.startsWith('/auth/v1/token') && (['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found'].some(code => code === error.code || code === body?.error_code) || /invalid refresh token|refresh token (?:not found|already used)/i.test(providerMessage))) {
    error.code = 'reauth_required'; error.message = reconnectError().message;
  }
  if (/statement timeout|query timeout|connection acquisition timeout/i.test(providerMessage)) error.message = 'O Supabase não concluiu a operação a tempo. Seus dados continuam neste dispositivo. Aguarde a recuperação do banco antes de sincronizar novamente.';
  if (error.code === '23505') error.message = 'Este nome de usuário já está em uso. Escolha outro.';
  if (body?.message?.includes('ATLAS_CONFLICT')) { error.code = 'conflict'; error.message = 'Uma viagem foi alterada em outro dispositivo. Suas mudanças locais foram preservadas. Carregue a versão da nuvem ou exporte um backup antes de continuar.'; }
  if (body?.message?.includes('ATLAS_WISHLIST_CONFLICT')) { error.code = 'conflict'; error.message = 'Sua wish list mudou em outro dispositivo. Abra a wish list e use “Revisar e combinar listas”. Suas alterações locais foram preservadas.'; }
  const tripErrors = {
    ATLAS_TRIP_CONFLICT: 'Outra pessoa alterou o roteiro. Exporte seu JSON para preservar as mudanças e reabra a trip antes de editar novamente.',
    ATLAS_TRIP_FORBIDDEN: 'Você não tem permissão para esta ação. O convite precisa ser aceito para editar; só quem organiza gerencia o grupo.',
    ATLAS_TRIP_USER_NOT_FOUND: 'Nome de usuário não encontrado. Confira o nome e se o perfil está encontrável. Você já organiza esta trip.',
    ATLAS_TRIP_INVALID_COVER: 'A foto de capa não foi encontrada ou não pertence a você.',
    ATLAS_TRIP_INVALID: 'Confira o nome, as coordenadas e as datas do roteiro.',
    ATLAS_TRIP_INVALID_PHOTO: 'A foto não foi encontrada ou não pertence a esta trip.',
    ATLAS_TRIP_PHOTO_LIMIT: 'A trip já tem 100 fotos. Remova uma antes de adicionar outra.',
    ATLAS_TRIP_PUBLISH_PUBLIC: 'O criador precisa tornar o roteiro público e seu perfil precisa estar encontrável para publicar a trip no seu perfil.',
  };
  for (const [code, message] of Object.entries(tripErrors)) if (body?.message?.includes(code)) error.message = message;
  if (body?.error_code === 'invalid_credentials') error.message = 'E-mail ou senha incorretos.';
  if (body?.error_code === 'email_not_confirmed') error.message = 'Confirme seu e-mail antes de entrar.';
  if (body?.error_code === 'weak_password') error.message = 'A senha não atende à política de segurança. Use ao menos 8 caracteres.';
  if (error.code === '42P01' || error.code === 'PGRST202') error.message = 'O banco do Atlas ainda não foi configurado. Execute o schema.sql conforme o guia de ativação.';
  if (error.message === 'Não foi possível concluir a operação.') {
    const code = /^[a-zA-Z0-9_]{1,40}$/.test(error.code || '') ? ` · ${error.code}` : '';
    error.message = `A nuvem recusou a operação (HTTP ${status}${code}). Seus dados locais foram preservados.`;
  }
  return error;
}
export async function request(path, { method = 'GET', body, authenticated = false, headers = {}, retry = true } = {}) {
  if (!config) throw new Error('O login ainda não foi ativado. A coleção local continua disponível.');
  if (authenticated && !session) throw new Error('Entre na sua conta para continuar.');
  if (authenticated && needsReconnect()) throw reconnectError();
  if (authenticated && session.expires_at < Date.now() / 1000 + 30 && retry) await refreshSession();
  const token = authenticated ? session.access_token : config.key.startsWith('ey') ? config.key : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), body instanceof Blob ? 120000 : 20000);
  try {
    const response = await fetch(config.url + path, {
      method, credentials: 'omit', signal: controller.signal,
      headers: { apikey: config.key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body instanceof Blob ? body : body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const errorText = await response.text();
      let raw; try { raw = JSON.parse(errorText); } catch { raw = { message: errorText }; }
      if (response.status === 401 && authenticated && retry) { await refreshSession(true); return request(path, { method, body, authenticated, headers, retry: false }); }
      throw apiError(raw, response.status, path, method);
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error instanceof TypeError || error.name === 'AbortError') {
      const timedOut = error.name === 'AbortError';
      const failure = new Error(timedOut
        ? 'A nuvem não respondeu a tempo. Suas alterações continuam salvas neste dispositivo. Tente sincronizar quando o banco se recuperar.'
        : 'Sem conexão com a nuvem. As alterações continuam salvas neste dispositivo e serão enviadas quando você sincronizar.');
      failure.code = timedOut ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR';
      failure.diagnostic = cloudDiagnostic({ path, method, code: error.name === 'AbortError' ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR', message: error.name === 'AbortError' ? 'A requisição excedeu o tempo limite do navegador.' : 'O navegador não conseguiu receber uma resposta da API.' });
      throw failure;
    }
    throw error;
  } finally { clearTimeout(timeout); }
}
async function refreshSession(force = false) {
  if (!session) throw new Error('Entre novamente para sincronizar.');
  if (needsReconnect()) throw reconnectError();
  const owner = session.user.id, requestedToken = session.refresh_token;
  const refresh = async () => {
    const stored = await readSession();
    if (session?.user?.id !== owner || stored?.user?.id !== owner) throw new Error('A conta mudou durante a renovação da sessão.');
    session = stored;
    if (needsReconnect()) throw reconnectError();
    if (session.expires_at > Date.now() / 1000 + 30 && (!force || session.refresh_token !== requestedToken)) return;
    const token = session.refresh_token;
    try {
      const raw = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token }, retry: false });
      const latest = await readSession();
      if (session?.user?.id !== owner || latest?.user?.id !== owner || raw.user?.id !== owner) throw new Error('A conta mudou durante a renovação da sessão.');
      if (latest.refresh_token !== token) { session = latest; return; }
      await keepSession(raw);
    } catch (error) {
      if (error.code === 'reauth_required') {
        const latest = await readSession();
        if (session?.user?.id === owner && latest?.user?.id === owner) {
          // Another tab may have already renewed this token while the request ran.
          if (latest.refresh_token !== token && !latest.needsLogin) { session = latest; return; }
          // Keep the account identity/cache. This is not a user-requested logout.
          session = { user: latest.user, needsLogin: true }; signedCache.clear();
          await writeSession(session); channel?.postMessage('changed'); announce();
        }
      }
      throw error;
    }
  };
  if (!refreshing) refreshing = (navigator.locks ? navigator.locks.request('atlas-session-refresh', refresh) : refresh()).finally(() => { refreshing = null; });
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
export async function signIn(email, password, { expectedUserId = null } = {}) {
  const raw = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email.trim(), password } });
  if (expectedUserId && raw.user?.id !== expectedUserId) throw new Error('Entre na mesma conta para recuperar as alterações pendentes. A conta anterior e seus dados locais foram preservados.');
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
    const page = await readWithRetry(() => request(`/rest/v1/${table}?${query}`, { authenticated }));
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
export async function readWithRetry(operation, valid = () => true) {
  for (let attempt = 0; ; attempt++) {
    if (!valid()) throw new DOMException('Operação cancelada.', 'AbortError');
    try { const result = await operation(); if (!valid()) throw new DOMException('Operação cancelada.', 'AbortError'); return result; }
    catch (error) {
      const temporary = error.code !== 'CLIENT_TIMEOUT' && (error instanceof TypeError || error.status === 429 || [502, 503, 504].includes(error.status) || error.message?.startsWith('Sem conexão'));
      if (!valid() || !temporary || attempt >= 2 || navigator.onLine === false) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
export async function signedURL(bucket, path, authenticated = false) {
  const actor = authenticated ? currentUser()?.id : 'public', key = `${actor}:${bucket}:${path}`;
  const cached = signedCache.get(key);
  if (cached?.expires > Date.now()) return cached.url;
  if (!signing.has(key)) signing.set(key, (async () => {
    const result = await readWithRetry(() => request(`/storage/v1/object/sign/${bucket}/${objectPath(path)}`, { method: 'POST', body: { expiresIn: 300 }, authenticated }), () => !authenticated || currentUser()?.id === actor);
    const signed = result.signedURL || result.signedUrl;
    if (!signed || !signed.startsWith('/object/sign/')) throw new Error('Não foi possível abrir a fotografia.');
    const url = `${config.url}/storage/v1${signed}`;
    if (signedCache.size > 1000) signedCache.clear();
    signedCache.set(key, { url, expires: Date.now() + 240000 });
    return url;
  })().finally(() => signing.delete(key)));
  return signing.get(key);
}
export async function downloadBlob(bucket, path, authenticated, { signal } = {}) {
  const url = await signedURL(bucket, path, authenticated);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 120000);
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  try { const response = await fetch(url, { signal: controller.signal, credentials: 'omit' }); if (!response.ok) { const error = new Error('Não foi possível baixar esta mídia. Tente novamente; seus dados continuam salvos.'); error.status = response.status; throw error; } return await response.blob(); }
  catch (error) { if (error.name === 'AbortError' && !signal?.aborted) throw new Error('O download demorou a responder. Tente novamente; as mídias já baixadas continuam salvas.'); throw error; }
  finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
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
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length) await request(`/storage/v1/object/${bucket}`, { method: 'DELETE', authenticated: true, body: { prefixes: unique } });
}
export async function ensureMediaSupport(table = 'photos') {
  try { await request(`/rest/v1/${table}?select=kind,motion_path,duration&limit=0`, { authenticated: true }); }
  catch (error) {
    if (['42703', 'PGRST204', 'PGRST202', '42P01', 'PGRST205'].includes(error.code)) throw new Error('Para salvar vídeos e Live Photos na nuvem, execute supabase/media.sql no SQL Editor do seu Supabase. A mídia pessoal continua salva neste dispositivo.');
    throw error;
  }
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
export async function readCollection(ownerId, { publicOnly = false, cachedPhotos = [], cachedDestinations = [] } = {}) {
  const authenticated = !publicOnly;
  const parameters = { owner_id: `eq.${ownerId}`, ...(publicOnly ? { visibility: 'eq.public' } : {}), order: 'id' };
  let destinations, changed;
  if (cachedDestinations.length && !publicOnly) {
    const cached = new Map(cachedDestinations.map(d => [d.id, d]));
    const manifest = (await rows('destinations', { ...parameters, select: 'owner_id,id,revision,visibility' }, authenticated)).filter(r => r.owner_id === ownerId);
    changed = new Set(manifest.filter(r => !cached.has(r.id) || cached.get(r.id).cloudRevision !== r.revision).map(r => r.id));
    const received = new Map();
    for (const batch of idBatches([...changed])) {
      for (const row of await rows('destinations', { ...parameters, id: inFilter(batch) }, authenticated)) if (row.owner_id === ownerId && changed.has(row.id)) received.set(row.id, cleanRemote(row));
    }
    if (manifest.some(r => changed.has(r.id) && !received.has(r.id))) throw new Error('A coleção mudou durante a sincronização. Tente novamente; seus dados locais foram preservados.');
    destinations = manifest.map(r => changed.has(r.id) ? received.get(r.id) : cached.get(r.id));
  } else {
    destinations = (await rows('destinations', parameters, authenticated)).filter(r => r.owner_id === ownerId && (!publicOnly || r.visibility === 'public')).map(cleanRemote);
    changed = new Set(destinations.map(d => d.id));
  }
  const visible = new Set(destinations.map((d) => d.id));
  const photoRows = [];
  for (const batch of idBatches([...changed].filter(id => visible.has(id)))) {
    photoRows.push(...(await rows('photos', { owner_id: `eq.${ownerId}`, destination_id: inFilter(batch), order: 'id' }, authenticated)).filter(p => p.owner_id === ownerId && batch.includes(p.destination_id)));
  }
  const photos = cachedPhotos.filter(p => visible.has(p.destinationId) && !changed.has(p.destinationId));
  const cachedById = new Map(cachedPhotos.map(p => [`${p.destinationId}:${p.id}`, p]));
  for (const row of photoRows) {
    let cached = cachedById.get(`${row.destination_id}:${row.id}`);
    if (cached && !(mediaKind(cached) === (row.kind || 'image') && cached.cloudPath === row.storage_path && cached.cloudThumbPath === row.thumbnail_path && (cached.cloudMotionPath || null) === (row.motion_path || null))) cached = null;
    photos.push({ id: row.id, destinationId: row.destination_id, caption: row.caption || '', kind: row.kind || 'image', duration: row.duration,
      blob: cached?.blob || null, thumbnail: cached?.thumbnail || null,
      ...(row.motion_path ? { motionBlob: cached?.motionBlob || null } : {}),
      cloudPath: row.storage_path, cloudThumbPath: row.thumbnail_path, cloudMotionPath: row.motion_path || null });
  }
  return { destinations, photos };
}
function idBatches(ids) { return Array.from({ length: Math.ceil(ids.length / 40) }, (_, i) => ids.slice(i * 40, (i + 1) * 40)); }
function inFilter(ids) { return `in.(${ids.map(id => JSON.stringify(id)).join(',')})`; }
export async function publicProfile(username) {
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error('Nome de usuário inválido.');
  const profiles = await rows('profiles', { username: `eq.${username}`, is_public: 'eq.true' });
  const profile = profiles.find((p) => p.username === username && p.is_public);
  if (!profile) throw new Error('Este perfil não existe ou está privado.');
  let publishedTrips = [];
  try {
    const publications = await rows('trip_publications', { select: 'trip_id,trips(id,name,stops)', user_id: `eq.${profile.id}`, order: 'created_at.desc' });
    publishedTrips = publications.map(p => p.trips).filter(Boolean);
  } catch (error) {
    // Profiles already in use keep working before the additive migration is installed.
    if (!['42P01', 'PGRST205', 'PGRST200'].includes(error.code)) throw error;
  }
  let wishlist = null;
  try { wishlist = await readCloudWishlist(profile.id, false); }
  catch (error) { if (!wishlistMigrationMissing(error)) throw error; }
  return { profile, publishedTrips, wishlist: wishlist?.is_public ? wishlist : null, ...await readCollection(profile.id, { publicOnly: true }) };
}
export const wishlistMigrationMissing = error => ['42P01', 'PGRST205', 'PGRST202'].includes(error?.code);
export async function readCloudWishlist(ownerId, authenticated = true) {
  const query = new URLSearchParams({ select: '*', owner_id: `eq.${ownerId}`, limit: '1', ...(!authenticated ? { is_public: 'eq.true' } : {}) });
  const result = await request(`/rest/v1/wishlists?${query}`, { authenticated });
  if (!Array.isArray(result)) throw new Error('A nuvem retornou uma wish list inválida. Seus dados locais foram preservados.');
  const row = result.find(r => r.owner_id === ownerId && (authenticated || r.is_public));
  return row ? { ...cleanWishlist(row), revision: row.revision } : { ...emptyWishlist(), revision: null };
}
export async function saveCloudWishlist(wishlist) {
  return request('/rest/v1/rpc/atlas_save_wishlist', { method: 'POST', authenticated: true, body: { p_items: cleanWishlist(wishlist).items, p_public: wishlist.is_public, p_expected_revision: wishlist.revision || null } });
}
export async function saveCloudDestination(destination, photos) {
  if (photos.some(p => mediaKind(p) !== 'image')) await ensureMediaSupport();
  const existingPhotos = destination.cloudRevision ? await rows('photos', { owner_id: `eq.${currentUser().id}`, destination_id: `eq.${destination.id}` }, true) : [];
  const prepared = [];
  const staged = [];
  try {
    for (const photo of photos) {
      const original = existingPhotos.find((p) => p.id === photo.id);
      let path = photo.cloudPath, thumbPath = photo.cloudThumbPath, motionPath = photo.cloudMotionPath || null;
      if (!original || original.storage_path !== path || original.thumbnail_path !== thumbPath || (original.kind || 'image') !== mediaKind(photo) || (original.motion_path || null) !== motionPath) {
        if (!(photo.blob instanceof Blob) || !(photo.thumbnail instanceof Blob) || mediaKind(photo) === 'live' && !(photo.motionBlob instanceof Blob)) throw new Error('Esta mídia mudou na nuvem. Sincronize antes de editar novamente; suas alterações locais continuam salvas.');
        const folder = `${currentUser().id}/${await hash(destination.id)}/${crypto.randomUUID()}`;
        path = `${folder}.${mediaExtension(photo.blob)}`; thumbPath = `${folder}-thumb.jpg`; motionPath = null;
        await upload('atlas-media', path, photo.blob); staged.push(path);
        await upload('atlas-media', thumbPath, photo.thumbnail); staged.push(thumbPath);
        if (photo.motionBlob) { motionPath = `${folder}-motion.${mediaExtension(photo.motionBlob)}`; await upload('atlas-media', motionPath, photo.motionBlob); staged.push(motionPath); }
      }
      prepared.push({ id: photo.id, storage_path: path, thumbnail_path: thumbPath, caption: photo.caption, kind: mediaKind(photo), motion_path: motionPath, duration: photo.duration || null });
    }
    const { cloudRevision, cloudDirty, localVersion, ...data } = destination;
    const revision = await request('/rest/v1/rpc/save_destination', { method: 'POST', authenticated: true, body: { p_id: destination.id, p_data: data, p_visibility: destination.visibility || 'private', p_expected_revision: cloudRevision || null, p_photos: prepared } });
    // Object cleanup is best effort after metadata committed. Never undo a successful save.
    const retained = new Set(prepared.flatMap((p) => [p.storage_path, p.thumbnail_path, p.motion_path]));
    await deleteObjects('atlas-media', existingPhotos.flatMap((p) => [p.storage_path, p.thumbnail_path, p.motion_path]).filter((p) => p && !retained.has(p))).catch(() => {});
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
