import { currentUser, onAuthChange } from './cloud.js';
import { readPremiumAccess } from './premium.js';
import { posterSVG, posterPNG, POSTER_SIZES } from './poster-render.js';
import { visitedDestinations } from './dates.js';

export function initializePoster({ countries, destinations, available }) {
  const dialog = document.getElementById('poster-dialog');
  const form = document.getElementById('poster-form');
  const status = document.getElementById('poster-status');
  const preview = document.getElementById('poster-preview');
  const download = document.getElementById('poster-download');
  const field = id => document.getElementById(`poster-${id}`);
  let generation = 0, previewURL, timer, busy = false;
  function clearPreview() { preview.removeAttribute('src'); if (previewURL) URL.revokeObjectURL(previewURL); previewURL = null; }
  function reset() {
    generation++; busy = false; clearTimeout(timer); dialog.close(); form.reset(); form.hidden = true;
    [...form.elements].forEach(element => { element.disabled = false; });
    field('login').hidden = true; status.textContent = ''; clearPreview(); download.disabled = true;
  }
  function options() { return { title: field('title').value, size: field('size').value, theme: field('theme').value }; }
  function render() {
    clearPreview();
    const places = destinations(), count = visitedDestinations(places).length;
    if (!count) { status.textContent = 'Adicione um lugar visitado ao seu atlas para criar seu pôster.'; download.disabled = true; return; }
    const svg = posterSVG(countries, places, options());
    previewURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); preview.src = previewURL;
    const size = POSTER_SIZES[field('size').value];
    field('dimensions').textContent = `${size.width} × ${size.height} mm · ${size.pixels.join(' × ')} px a 300 dpi · paisagem`;
    status.textContent = 'Premium · teste ativo. Seu pôster inclui os lugares visitados de toda a sua coleção.';
    download.disabled = false;
  }
  async function open() {
    if (!available()) return;
    reset(); dialog.showModal(); const token = generation;
    if (!currentUser()) {
      status.textContent = 'Entre na sua conta para verificar o acesso. O pôster é um recurso premium em teste, sem cobrança nesta fase.';
      field('login').hidden = false; return;
    }
    status.textContent = 'Verificando acesso premium…';
    try {
      const access = await readPremiumAccess();
      if (token !== generation || !dialog.open || !available()) return;
      if (!access) { status.textContent = 'A exportação de pôster é um recurso premium em teste, liberado apenas para contas habilitadas. Não há cobrança nesta fase.'; return; }
      form.hidden = false; render();
    } catch (error) { if (token === generation && dialog.open) status.textContent = 'Não foi possível verificar o premium. Confira sua conexão e use “Verificar acesso”.'; }
  }
  document.getElementById('poster-button').onclick = open;
  document.getElementById('profile-poster').onclick = () => { document.getElementById('account-dialog').close(); open(); };
  field('retry').onclick = open;
  field('close').onclick = () => dialog.close();
  field('login').onclick = () => { dialog.close(); document.dispatchEvent(new CustomEvent('atlas-open-auth')); };
  dialog.addEventListener('close', () => { if (!dialog.open) reset(); });
  let observedOwner = currentUser()?.id;
  onAuthChange(() => {
    const nextOwner = currentUser()?.id;
    if (nextOwner !== observedOwner) { observedOwner = nextOwner; reset(); }
  });
  field('title').addEventListener('input', () => {
    clearTimeout(timer); timer = setTimeout(() => { if (!form.hidden && !busy) render(); }, 150);
  });
  for (const id of ['size', 'theme']) field(id).addEventListener('change', () => { if (!form.hidden && !busy) render(); });
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || form.hidden || !available()) return;
    clearTimeout(timer); render(); busy = true; download.disabled = true;
    const token = generation, owner = currentUser()?.id;
    const valid = () => token === generation && currentUser()?.id === owner && available() && dialog.open;
    const controls = [...form.elements]; controls.forEach(element => { element.disabled = true; });
    status.textContent = 'Preparando seu pôster…';
    try {
      if (!await readPremiumAccess()) throw new Error('O acesso premium não está ativo nesta conta.');
      if (!valid()) return;
      const settings = options(), format = field('format').value, places = destinations();
      if (!visitedDestinations(places).length) throw new Error('Adicione um lugar visitado para exportar.');
      const svg = posterSVG(countries, places, settings);
      const blob = format === 'svg' ? new Blob([svg], { type: 'image/svg+xml' }) : await posterPNG(svg, settings.size);
      if (!valid()) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `atlas-poster-${settings.size}.${format}`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      status.textContent = 'Pôster baixado. Imprima em tamanho real (100%), sem ajustar à página.';
    } catch (error) { if (valid()) status.textContent = error.message; }
    finally { if (token === generation) { busy = false; controls.forEach(element => { element.disabled = false; }); } }
  };
  return { reset };
}
