import { cloudEnabled, cloudConfigError, currentUser, restoreAuth, onAuthChange, signIn, signUp, recoverPassword, changePassword, signOut, myProfile, saveProfile, searchProfiles, publicProfile, avatarURL, uploadAvatar, deleteObjects } from './cloud.js';
import { getDestinations, getMeta, setMeta, migrateGuest, purgeAccount, currentAccountId } from './db.js';
import { synchronize, syncRunning } from './sync.js';
import { processPhoto } from './photos.js';
import { $, notify, confirmAction, escapeHTML } from './ui.js';
import { shareText, appLink } from './sharing.js';

export async function initializeSocial(callbacks) {
  let profile = null, mode = 'login', change = Promise.resolve(), syncTimer, routeToken = 0, avatarFile = null, submitting = false;
  let ownStatus = 'Coleção neste dispositivo';
  function status(message, viewingProfile = false) {
    $('#sync-status').textContent = message;
    if (!viewingProfile) { ownStatus = message; $('#account-sync-message').textContent = message; }
  }
  function renderAuth() {
    $('#login-button').hidden = Boolean(currentUser()); $('#account-button').hidden = !currentUser();
    status(currentUser() ? 'Conta conectada · sincronização pendente' : 'Coleção neste dispositivo');
  }
  function authMode(value) {
    mode = value; $('#auth-message').textContent = '';
    const signup = mode === 'signup', reset = mode === 'new-password', recover = mode === 'recover';
    $('#auth-title').textContent = signup ? 'Criar sua conta' : recover ? 'Recuperar senha' : reset ? 'Escolher nova senha' : 'Entrar na sua conta';
    $('#auth-submit').textContent = signup ? 'Criar conta' : recover ? 'Enviar link de recuperação' : reset ? 'Salvar nova senha' : 'Entrar';
    $('#signup-name-field').hidden = !signup; $('#signup-name').required = signup;
    $('#auth-email-field').hidden = reset; $('#auth-email').required = !reset; $('#auth-email').disabled = reset;
    $('#auth-password-field').hidden = recover; $('#auth-password').required = !recover; $('#auth-password').disabled = recover;
    $('#auth-password').minLength = signup || reset ? 8 : 1;
    $('#auth-password').autocomplete = signup || reset ? 'new-password' : 'current-password';
    document.querySelectorAll('[data-auth-mode]').forEach((button) => { button.hidden = reset || (signup || recover ? button.dataset.authMode !== 'login' : button.dataset.authMode === 'login'); });
  }
  function openAuth(value = 'login') {
    $('#auth-form').reset(); authMode(value);
    $('#cloud-not-configured').hidden = cloudEnabled; $('#auth-form').hidden = !cloudEnabled;
    if (cloudConfigError) $('#cloud-not-configured>p').textContent = `${cloudConfigError} A coleção local continua disponível.`;
    $('#auth-dialog').showModal();
  }
  async function runSync(discardLocal = false) {
    if (!currentUser() || syncRunning()) return;
    clearTimeout(syncTimer);
    if (discardLocal) callbacks.lock(true);
    for (const id of ['#sync-button', '#migrate-button', '#logout-button', '#cloud-reload-button']) $(id).disabled = true;
    try { await synchronize(status, { discardLocal }); await callbacks.refresh(); }
    catch (error) { status(error.message); notify(error.message, true); }
    finally { if (discardLocal) callbacks.lock(false); for (const id of ['#sync-button', '#migrate-button', '#logout-button', '#cloud-reload-button']) $(id).disabled = false; }
  }
  async function handleAccount() {
    const previous = currentAccountId(), user = currentUser();
    if (user?.id === previous) return;
    clearTimeout(syncTimer);
    profile = null; avatarFile = null; $('#account-dialog').close();
    $('#profile-form').reset(); $('#my-avatar').textContent = '◇'; $('#profile-message').textContent = '';
    await callbacks.switchAccount(user?.id || null);
    if (previous && previous !== user?.id) await purgeAccount(previous);
    renderAuth();
    if (user) {
      try { profile = await myProfile(); await setMeta('profile', profile); await runSync(); }
      catch (error) { status(error.message); notify(error.message, true); }
    }
    if (location.hash.startsWith('#/perfil/')) await route();
    if (location.hash.startsWith('#/roteiro/')) await callbacks.showTrip?.();
  }
  function queueAccountChange() {
    change = change.then(handleAccount).catch((error) => notify(error.message, true));
    return change;
  }
  async function showProfile() {
    if (!currentUser()) return openAuth();
    let failure = '';
    try { profile = await myProfile(); await setMeta('profile', profile); }
    catch (error) { failure = error.message; profile ||= await getMeta('profile'); }
    const shown = profile || { display_name: 'Viajante', username: '', bio: '', is_public: false, avatar_path: null };
    $('#profile-save').disabled = !profile;
    $('#profile-name').value = shown.display_name; $('#profile-username').value = shown.username;
    $('#profile-bio').value = shown.bio || ''; $('#profile-public').checked = shown.is_public;
    $('#avatar-input').value = ''; avatarFile = null; $('#profile-message').textContent = failure;
    $('#my-avatar').textContent = shown.display_name.slice(0, 1).toUpperCase();
    if (shown.avatar_path) avatarURL(shown, true).then((url) => {
      const img = document.createElement('img'); img.src = url; img.alt = ''; $('#my-avatar').replaceChildren(img);
    }).catch(() => {});
    $('#account-dialog').showModal();
  }
  async function route(event) {
    if (location.hash.startsWith('#/roteiro/')) return;
    const token = ++routeToken, match = location.hash.match(/^#\/perfil\/([a-z0-9_]{3,30})$/);
    if (!match) { await callbacks.showOwn({ preserveSelection: !event }); if(token===routeToken)status(ownStatus); return; }
    if (!cloudEnabled) { notify('Perfis públicos estarão disponíveis quando o login for ativado.', true); await callbacks.showOwn(); return; }
    status('Carregando perfil público…', true);
    try {
      const data = await publicProfile(match[1]);
      if (token !== routeToken) return;
      await callbacks.showPublic(data);
      if (token !== routeToken) return;
      status('Você está vendo as viagens públicas deste perfil.', true);
      if (data.profile.avatar_path) avatarURL(data.profile).then((url) => {
        if (token !== routeToken) return;
        const img = document.createElement('img'); img.src = url; img.alt = ''; $('#public-avatar').replaceChildren(img);
      }).catch(() => {});
    } catch (error) { if (token === routeToken) { await callbacks.showOwn(); status(error.message); notify(error.message, true); } }
  }
  const visitProfile = (username) => {
    $('#account-dialog').close(); $('#explore-dialog').close();
    if (location.hash === `#/perfil/${username}`) route(); else location.hash = `/perfil/${username}`;
  };
  document.querySelectorAll('[data-close-dialog]').forEach((button) => button.onclick = () => {
    if (!submitting) document.getElementById(button.dataset.closeDialog).close();
  });
  $('#login-button').onclick = () => openAuth(); $('#account-button').onclick = showProfile;
  document.querySelectorAll('[data-auth-mode]').forEach((button) => button.onclick = () => authMode(button.dataset.authMode));
  $('#auth-dialog').addEventListener('cancel', (event) => { if (submitting) event.preventDefault(); });
  $('#auth-dialog').addEventListener('close', () => { $('#auth-password').value = ''; });
  $('#auth-form').onsubmit = async (event) => {
    event.preventDefault(); if (submitting) return;
    submitting = true; $('#auth-submit').disabled = true; $('#auth-message').textContent = 'Aguarde…';
    try {
      const email = $('#auth-email').value, password = $('#auth-password').value;
      if (mode === 'recover') { await recoverPassword(email); $('#auth-message').textContent = 'Se houver uma conta com esse e-mail, você receberá um link para escolher uma nova senha.'; }
      else if (mode === 'new-password') { await changePassword(password); $('#auth-dialog').close(); notify('Senha atualizada.'); }
      else if (mode === 'signup' && !await signUp(email, password, $('#signup-name').value)) $('#auth-message').textContent = 'Confira seu e-mail e abra o link de confirmação para concluir o cadastro.';
      else {
        if (mode === 'login') await signIn(email, password);
        await change; $('#auth-dialog').close(); notify('Você entrou na sua conta. Sua coleção local foi preservada.');
      }
    } catch (error) { $('#auth-message').textContent = error.message; }
    finally { submitting = false; $('#auth-submit').disabled = false; $('#auth-password').value = ''; }
  };
  $('#avatar-input').onchange = (event) => { avatarFile = event.target.files[0] || null; };
  $('#profile-form').onsubmit = async (event) => {
    event.preventDefault(); if (submitting || !profile) return;
    submitting = true; $('#profile-save').disabled = true; $('#profile-message').textContent = 'Salvando perfil…';
    let staged = null;
    try {
      let path = profile.avatar_path;
      if (avatarFile) { const image = await processPhoto(avatarFile, currentUser().id); path = staged = await uploadAvatar(image.thumbnail); }
      const saved = await saveProfile({ username: $('#profile-username').value.trim().toLowerCase(), display_name: $('#profile-name').value, bio: $('#profile-bio').value, is_public: $('#profile-public').checked, avatar_path: path });
      if (!saved?.[0]) throw new Error('Seu perfil não pôde ser salvo. Verifique a configuração do banco.');
      const old = profile.avatar_path; profile = saved[0]; await setMeta('profile', profile); avatarFile = null;
      $('#profile-message').textContent = 'Perfil salvo.';
      if (old && old !== path) await deleteObjects('atlas-avatars', [old]).catch(() => {});
    } catch (error) {
      $('#profile-message').textContent = error.message;
      if (staged && error.code) await deleteObjects('atlas-avatars', [staged]).catch(() => {});
    } finally { submitting = false; $('#profile-save').disabled = false; }
  };
  $('#account-dialog').addEventListener('cancel', (event) => { if (submitting) event.preventDefault(); });
  $('#sync-button').onclick = () => runSync();
  $('#cloud-reload-button').onclick = async () => {
    if (!await confirmAction('Carregar a versão da nuvem?', 'Alterações de viagens e wish list ainda não enviadas nesta conta serão substituídas. Exporte um backup antes se quiser preservá-las. Os dados do atlas local não serão alterados.', 'Carregar versão da nuvem')) return;
    await runSync(true);
  };
  $('#migrate-button').onclick = async () => {
    if (syncRunning()) return;
    if (!await confirmAction('Enviar suas viagens locais?', 'Uma cópia das viagens e da wish list será salva na sua conta como privada. Exemplos não editados e viagens já existentes serão ignorados. A coleção local será mantida.', 'Enviar para minha conta')) return;
    try { const count = await migrateGuest(); await callbacks.refresh(); notify(`${count} novos itens copiados para sua conta neste dispositivo. ${count ? 'Sincronizando com a nuvem…' : 'Não há novos itens locais para enviar.'}`); if (count) await runSync(); }
    catch (error) { notify(error.message, true); }
  };
  $('#logout-button').onclick = async () => {
    if (syncRunning() || submitting) return;
    const pending = (await getDestinations()).some((d) => d.cloudDirty) || (await getMeta('deleted') || []).length || (await getMeta('wishlist'))?.cloudDirty;
    if (pending && !await confirmAction('Sair com alterações pendentes?', 'Há viagens ou itens da wish list ainda não enviados. Exporte um backup ou sincronize antes de sair. Ao sair, a cópia desta conta será removida do navegador.', 'Sair e remover cópia local')) return;
    $('#logout-button').disabled = true;
    try { await signOut(); await change; notify('Você saiu da conta. A coleção local está disponível.'); }
    finally { $('#logout-button').disabled = false; }
  };
  $('#my-public-profile').onclick = () => {
    if (!profile?.is_public) return notify('Ative a opção de permitir que outras pessoas encontrem seu perfil e salve.', true);
    visitProfile(profile.username);
  };
  $('#share-profile').onclick = async () => {
    if (!profile?.is_public) return notify('Seu perfil está privado. Torne-o público antes de compartilhar.', true);
    const url = new URL(`#/perfil/${profile.username}`, new URL('./', location.href)).href;
    try { await navigator.clipboard.writeText(url); notify('Link do perfil copiado.'); }
    catch { $('#profile-message').textContent = `Copie este endereço: ${url}`; }
  };
  const whatsapp = document.createElement('button'); whatsapp.className = 'text-button'; whatsapp.textContent = 'Perfil no WhatsApp';
  $('#share-profile').after(whatsapp);
  whatsapp.onclick = () => { if (!profile?.is_public) return notify('Torne seu perfil público e salve antes de compartilhar.', true); shareText(`Conheça minhas viagens no Atlas: @${profile.username}`, appLink(`#/perfil/${profile.username}`)); };
  $('#home-atlas').onclick = () => { if (location.hash) location.hash = ''; else callbacks.showOwn(); };
  $('#explore-button').onclick = () => { if (!cloudEnabled) return openAuth(); $('#explore-dialog').showModal(); $('#profile-search').focus(); };
  let searchTimer, searchId = 0;
  $('#profile-search').oninput = () => {
    clearTimeout(searchTimer); const id = ++searchId, query = $('#profile-search').value.trim();
    $('#profile-results').replaceChildren();
    if (query.length < 2) { $('#explore-status').textContent = 'Digite ao menos 2 caracteres.'; return; }
    $('#explore-status').textContent = 'Procurando perfis…';
    searchTimer = setTimeout(async () => {
      try {
        const results = await searchProfiles(query); if (id !== searchId) return;
        $('#explore-status').textContent = results.length ? 'Escolha um perfil para conhecer suas viagens.' : 'Nenhum perfil público encontrado.';
        for (const item of results) {
          const button = document.createElement('button'); button.className = 'profile-result';
          button.innerHTML = `<strong>${escapeHTML(item.display_name)}</strong><span>@${escapeHTML(item.username)}</span><small>${escapeHTML(item.bio || 'Um mundo de memórias para conhecer.')}</small>`;
          button.onclick = () => visitProfile(item.username); $('#profile-results').append(button);
        }
      } catch (error) { if (id === searchId) $('#explore-status').textContent = error.message; }
    }, 350);
  };
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => { if (currentUser()) runSync(); });
  let restored;
  try { restored = await restoreAuth(); }
  catch (error) { notify(error.message, true); }
  onAuthChange(queueAccountChange);
  renderAuth(); await queueAccountChange(); await route();
  if (restored?.recovery) openAuth('new-password');
  return {
    afterMutation() {
      if (!currentUser()) return;
      status('Modificações salvas neste dispositivo. Envio pendente.');
      clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(), 400);
    },
  };
}
