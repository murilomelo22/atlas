// This module runs independently of account synchronization and app startup,
// so an older or failed main module cannot prevent an update from installing.
const version = new URL(import.meta.url).searchParams.get('v') || document.querySelector('meta[name="atlas-version"]')?.content;
const banner = document.getElementById('app-update-banner');
const status = document.getElementById('app-update-status');
const buttons = [...document.querySelectorAll('[data-app-update]')];
const workerURL = new URL('../sw.js', import.meta.url);
let registration, registering, lastCheck = 0;

function message(text) { status.textContent = text; status.hidden = !text; }
function workerVersion(worker) {
  return new Promise(resolve => {
    if (!worker) return resolve(null);
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timeout); channel.port1.close(); resolve(value); };
    const timeout = setTimeout(() => finish(null), 1000);
    channel.port1.onmessage = event => finish(event.data?.version);
    worker.postMessage({ type: 'ATLAS_VERSION' }, [channel.port2]);
  });
}
function activated(worker) {
  if (!worker || worker.state === 'activated') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timeout); worker.removeEventListener('statechange', changed); error ? reject(error) : resolve(); };
    const changed = () => {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('A nova versão não pôde ser instalada. Tente novamente.'));
    };
    const timeout = setTimeout(() => finish(new Error('A atualização demorou para responder. Tente novamente.')), 20000);
    worker.addEventListener('statechange', changed); changed();
  });
}
function claimed(worker) {
  if (!worker || navigator.serviceWorker.controller === worker) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const changed = () => { if (navigator.serviceWorker.controller === worker) finish(); };
    const finish = error => { clearTimeout(timeout); navigator.serviceWorker.removeEventListener('controllerchange', changed); error ? reject(error) : resolve(); };
    const timeout = setTimeout(() => finish(new Error('A atualização ainda não está pronta. Tente novamente.')), 5000);
    navigator.serviceWorker.addEventListener('controllerchange', changed); changed();
  });
}
async function register() {
  if (!('serviceWorker' in navigator)) return null;
  if (registration) return registration;
  if (!registering) registering = navigator.serviceWorker.register(workerURL, { updateViaCache: 'none' }).then(value => registration = value).finally(() => { registering = null; });
  return registering;
}
async function check() {
  if (!navigator.onLine || Date.now() - lastCheck < 5 * 60 * 1000) return;
  lastCheck = Date.now();
  try { const value = await register(); await value?.update(); } catch { /* Keep the saved app available while offline or during a failed deployment. */ }
}

if ('serviceWorker' in navigator) {
  let controller = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    const previous = controller; controller = navigator.serviceWorker.controller;
    // Always offer a reload after replacing an existing worker: even a current
    // HTML page may have imported older modules before the worker took over.
    if (previous && previous !== controller || await workerVersion(controller) !== version) banner.hidden = false;
  });
  register().then(async () => {
    const installed = await workerVersion(navigator.serviceWorker.controller);
    if (installed && installed !== version) banner.hidden = false;
  }).catch(() => message('O modo offline não pôde ser atualizado. Tente atualizar o site quando a conexão voltar.'));
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

for (const button of buttons) button.onclick = async () => {
  if (document.querySelector('dialog[open]')) { message('Salve ou feche o formulário aberto antes de atualizar o site.'); return; }
  if (!navigator.onLine) { message('Conecte-se à internet para atualizar o site. Seus dados continuam salvos neste dispositivo.'); return; }
  buttons.forEach(element => element.disabled = true); message('Buscando a versão mais recente…');
  try {
    const value = await register();
    if (value) {
      await value.update();
      await activated(value.installing || value.waiting || value.active);
      await claimed(value.active);
    }
    // A fresh navigation also avoids a cached document/CDN response and keeps
    // the current profile/trip route. IndexedDB and session data are untouched.
    const url = new URL(location.href); url.searchParams.set('atlas-update', String(Date.now())); location.replace(url);
  } catch (error) { message(`${error.message || 'Não foi possível atualizar o site.'} Suas memórias continuam salvas.`); buttons.forEach(element => element.disabled = false); }
};
