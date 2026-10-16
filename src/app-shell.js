// The app shell never owns sessions or travel data. It delegates to the existing
// controls, which keep their account, sync and permission checks.
const $ = selector => document.querySelector(selector);
const welcome = $('#first-access');
const info = $('#app-info-dialog');
const install = $('#install-app-button');
const nativeInstall = $('#install-native-button');
const installStatus = $('#install-status');
const standalone = matchMedia('(display-mode: standalone)');
const welcomeKey = 'atlas-welcome-v1';
let prompt, installing = false, installedThisVisit = false;
let state = { ready: false, publicView: false, signedIn: false, personalCount: 0 };
let welcomed = false;
try { welcomed = localStorage.getItem(welcomeKey) === 'done'; } catch { /* Storage can be unavailable in private browsing. */ }

const desktop = document.documentElement.dataset.atlasDesktop === 'true';
function isInstalled() { return desktop || installedThisVisit || standalone.matches || navigator.standalone === true; }
function renderInstall() {
  const installed = isInstalled();
  install.hidden = installed;
  nativeInstall.hidden = installed || !prompt;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  $('#install-instructions').textContent = desktop
    ? 'O Atlas já está instalado. Abra-o pela pasta Aplicativos ou pelo Dock. Não é necessário manter o navegador ou o Terminal abertos.'
    : installed
    ? 'O Atlas já está aberto como aplicativo neste aparelho.'
    : ios
      ? 'No Safari, toque em Compartilhar e escolha Adicionar à Tela de Início. Se abriu o link dentro de outro aplicativo, abra-o no Safari primeiro.'
      : prompt
        ? 'Instale o Atlas para abri-lo pela tela inicial, em uma janela própria.'
        : /Android/.test(navigator.userAgent)
          ? 'No Chrome, abra o menu ⋮ e escolha Instalar aplicativo ou Adicionar à tela inicial. Se a opção não aparecer, continue pelo navegador e tente novamente após carregar o Atlas com internet.'
          : 'No Chrome ou Edge, procure o ícone de instalação na barra de endereços ou a opção Instalar no menu do navegador. No Safari do Mac, use Arquivo → Adicionar ao Dock, quando disponível.';
}
function openInfo() {
  renderInstall();
  if (!info.open) info.showModal();
}
function dismissWelcome() {
  welcomed = true; welcome.hidden = true;
  try { localStorage.setItem(welcomeKey, 'done'); } catch { /* Keep this visit usable without persistence. */ }
}
function scrollToSection(selector) {
  $(selector)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
}
function markNavigation(name) {
  document.querySelectorAll('[data-app-nav]').forEach(button => {
    if (button.dataset.appNav === name) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
function updateShell(next) {
  state = { ...state, ...next };
  const routed = Boolean(location.hash && location.hash !== '#/');
  welcome.hidden = !state.ready || state.publicView || state.signedIn || state.personalCount > 0 || welcomed || routed;
  for (const selector of ['#welcome-create', '#welcome-login', '[data-app-nav="trips"]', '[data-app-nav="profile"]']) $(selector).disabled = !state.ready;
}
document.addEventListener('atlas:state', event => updateShell(event.detail));
window.addEventListener('hashchange', () => updateShell({}));
$('#welcome-dismiss').onclick = () => { dismissWelcome(); scrollToSection('#map-area'); };
$('#welcome-create').onclick = () => {
  if (!state.ready || state.publicView) return;
  dismissWelcome(); $('#add-button').click();
};
$('#welcome-login').onclick = () => { if (state.ready) { dismissWelcome(); $('#login-button').click(); } };
$('#show-welcome').onclick = () => {
  info.close();
  // Help can explain the product to existing users too; it never changes data.
  welcome.hidden = false;
  scrollToSection('#first-access');
  $('#welcome-title').setAttribute('tabindex', '-1'); $('#welcome-title').focus({ preventScroll: true });
};
document.querySelectorAll('[data-open-app-info]').forEach(button => button.addEventListener('click', openInfo));
$('#app-info-close').onclick = () => info.close();

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); prompt = event; renderInstall(); });
window.addEventListener('appinstalled', () => { installedThisVisit = true; prompt = null; renderInstall(); installStatus.textContent = 'Atlas instalado. Encontre-o na tela inicial ou na lista de aplicativos.'; });
standalone.addEventListener('change', renderInstall);
async function requestInstall() {
  if (installing) return;
  if (!prompt) { openInfo(); return; }
  installing = true; install.disabled = true; nativeInstall.disabled = true;
  const pending = prompt; prompt = null;
  try {
    await pending.prompt();
    const choice = await pending.userChoice;
    installStatus.textContent = choice.outcome === 'accepted'
      ? 'Instalação solicitada. Aguarde a confirmação do seu navegador.'
      : 'Você pode continuar usando o Atlas aqui e instalar quando quiser.';
  } catch {
    installStatus.textContent = 'Não foi possível abrir a instalação. Use as instruções do seu navegador abaixo.';
    openInfo();
  } finally { installing = false; install.disabled = false; nativeInstall.disabled = false; renderInstall(); }
}
install.onclick = requestInstall; nativeInstall.onclick = requestInstall;

for (const button of document.querySelectorAll('[data-app-nav]')) button.onclick = () => {
  const name = button.dataset.appNav;
  if (name === 'trips' || name === 'profile') {
    if (!state.ready) return;
    if (name === 'trips') $('#trips-button').click();
    else $(state.signedIn ? '#account-button' : '#login-button').click();
    // Dialogs are temporary overlays; the underlying map/list remains selected.
    return;
  }
  markNavigation(name);
  scrollToSection(name === 'map' ? '#map-area' : '#destinations-panel');
  const target = $(name === 'map' ? '#map-area' : '#destinations-panel');
  target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
  window.dispatchEvent(new Event('resize'));
};
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (!matchMedia('(max-width: 700px)').matches) return;
    for (const entry of entries) if (entry.isIntersecting) markNavigation(entry.target.id === 'map-area' ? 'map' : 'memories');
  }, { rootMargin: '-20% 0px -50% 0px', threshold: 0 });
  observer.observe($('#map-area')); observer.observe($('#destinations-panel'));
}
let originOffline = false;
function renderConnection() { $('#app-connection-status').hidden = navigator.onLine && !originOffline; }
function checkOfflineCache() {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return;
  const channel = new MessageChannel();
  const timeout = setTimeout(() => channel.port1.close(), 1500);
  channel.port1.onmessage = event => { clearTimeout(timeout); channel.port1.close(); originOffline = event.data?.offline === true; renderConnection(); };
  worker.postMessage({ type: 'ATLAS_CONNECTION' }, [channel.port2]);
}
window.addEventListener('online', () => { originOffline = false; renderConnection(); });
window.addEventListener('offline', renderConnection);
navigator.serviceWorker?.addEventListener('controllerchange', checkOfflineCache);
checkOfflineCache();
renderInstall(); renderConnection();
if (document.documentElement.dataset.atlasState) {
  try { updateShell(JSON.parse(document.documentElement.dataset.atlasState)); } catch { /* A later state event will restore the shell. */ }
}
