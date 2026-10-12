import { mediaKind, mediaLabel } from './media.js';
let gallery;
export function createGallery() {
  if (gallery) return gallery;
  const dialog = document.querySelector('#gallery-dialog'), image = dialog.querySelector('img'), video = dialog.querySelector('video'), live = dialog.querySelector('[data-gallery-live]'), caption = dialog.querySelector('#gallery-caption'), counter = dialog.querySelector('#gallery-counter');
  let photos = [], index = 0, urls = [], startX, loader, token = 0;
  const retry = dialog.querySelector('[data-gallery-retry]'), loading = dialog.querySelector('[data-gallery-loading]');
  const source = (blob, url) => { if (!blob) return url || ''; const value = URL.createObjectURL(blob); urls.push(value); return value; };
  function release() {
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); image.removeAttribute('src');
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
  }
  async function render() {
    const current = ++token;
    release();
    let photo = photos[index]; const kind = mediaKind(photo);
    retry.hidden = true; loading.hidden = true;
    counter.textContent = `${index + 1} / ${photos.length} · ${mediaLabel(photo)}`;
    caption.textContent = photo.caption || 'Sem legenda';
    if (loader) {
      image.hidden = video.hidden = live.hidden = true; loading.hidden = false;
      try { photo = await loader(photo); }
      catch (error) { if (current === token && dialog.open) { loading.hidden = true; retry.hidden = false; caption.textContent = error.message || 'Não foi possível abrir esta mídia. Tente novamente.'; } return; }
      if (current !== token || !dialog.open) return;
      photos[index] = photo; loading.hidden = true;
    }
    image.hidden = kind === 'video'; video.hidden = kind !== 'video'; live.hidden = kind !== 'live';
    live.textContent = '▶ Reproduzir Live Photo'; live.setAttribute('aria-pressed', 'false');
    if (kind !== 'video') { image.src = source(photo.blob, photo.url); image.alt = photo.caption || `${mediaLabel(photo)} ${index + 1}`; }
    if (kind === 'video') {
      video.src = source(photo.blob, photo.url);
      video.poster = source(photo.thumbnail, photo.thumbnailURL);
    }
    caption.textContent = photo.caption || 'Sem legenda';
    counter.textContent = `${index + 1} / ${photos.length} · ${mediaLabel(photo)}`;
  }
  function move(delta) { if (!photos.length) return; index = (index + delta + photos.length) % photos.length; render(); }
  live.onclick = async () => {
    const playing = live.getAttribute('aria-pressed') !== 'true';
    if (playing && !video.hasAttribute('src')) {
      const current = token; loading.hidden = false;
      try {
        const photo = loader ? await loader(photos[index], { motion: true }) : photos[index];
        if (current !== token || !dialog.open) return;
        photos[index] = photo; video.src = source(photo.motionBlob, photo.motionURL); video.poster = image.src;
      } catch (error) { if (current === token) { caption.textContent = error.message; retry.hidden = false; } return; }
      finally { if (current === token) loading.hidden = true; }
    }
    image.hidden = playing; video.hidden = !playing; live.setAttribute('aria-pressed', String(playing)); live.textContent = playing ? 'Ver foto' : '▶ Reproduzir Live Photo';
    if (playing) { try { await video.play(); } catch { caption.textContent = 'Toque no botão de reprodução do vídeo. Se o formato não abrir, exporte como MP4 (H.264).'; } }
    else { video.pause(); video.currentTime = 0; }
  };
  video.onerror = () => { if (video.hasAttribute('src')) { caption.textContent = 'Este vídeo não abriu. Tente novamente ou exporte o original como MP4 (H.264).'; retry.hidden = false; } };
  retry.onclick = () => render();
  dialog.querySelector('[data-gallery-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-gallery-prev]').onclick = () => move(-1);
  dialog.querySelector('[data-gallery-next]').onclick = () => move(1);
  dialog.addEventListener('keydown', e => {
    if (e.target === video || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); }
  });
  dialog.addEventListener('touchstart', e => { startX = e.target === video ? null : e.changedTouches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', e => { if (startX == null) return; const distance = e.changedTouches[0].clientX - startX; if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1); startX = null; }, { passive: true });
  dialog.addEventListener('close', () => { token++; release(); photos = []; loader = null; loading.hidden = retry.hidden = true; });
  gallery = { open(items, photoIndex = 0, options = {}) { if (!items.length) return; photos = [...items]; loader = options.load; index = Math.min(Math.max(photoIndex, 0), items.length - 1); if (!dialog.open) dialog.showModal(); render(); } };
  return gallery;
}
