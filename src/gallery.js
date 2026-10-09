import { mediaKind, mediaLabel } from './media.js';
let gallery;
export function createGallery() {
  if (gallery) return gallery;
  const dialog = document.querySelector('#gallery-dialog'), image = dialog.querySelector('img'), video = dialog.querySelector('video'), live = dialog.querySelector('[data-gallery-live]'), caption = dialog.querySelector('#gallery-caption'), counter = dialog.querySelector('#gallery-counter');
  let photos = [], index = 0, urls = [], startX;
  const source = (blob, url) => { if (!blob) return url; const value = URL.createObjectURL(blob); urls.push(value); return value; };
  function release() {
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); image.removeAttribute('src');
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
  }
  function render() {
    release();
    const photo = photos[index], kind = mediaKind(photo);
    image.hidden = kind === 'video'; video.hidden = kind !== 'video'; live.hidden = kind !== 'live';
    live.textContent = '▶ Reproduzir Live Photo'; live.setAttribute('aria-pressed', 'false');
    if (kind !== 'video') { image.src = source(photo.blob, photo.url); image.alt = photo.caption || `${mediaLabel(photo)} ${index + 1}`; }
    if (kind !== 'image') {
      video.src = source(kind === 'live' ? photo.motionBlob : photo.blob, kind === 'live' ? photo.motionURL : photo.url);
      video.poster = kind === 'live' ? image.src : source(photo.thumbnail, photo.thumbnailURL);
    }
    caption.textContent = photo.caption || 'Sem legenda';
    counter.textContent = `${index + 1} / ${photos.length} · ${mediaLabel(photo)}`;
  }
  function move(delta) { if (!photos.length) return; index = (index + delta + photos.length) % photos.length; render(); }
  live.onclick = async () => {
    const playing = live.getAttribute('aria-pressed') !== 'true';
    image.hidden = playing; video.hidden = !playing; live.setAttribute('aria-pressed', String(playing)); live.textContent = playing ? 'Ver foto' : '▶ Reproduzir Live Photo';
    if (playing) { try { await video.play(); } catch { caption.textContent = 'Toque no botão de reprodução do vídeo. Se o formato não abrir, exporte como MP4 (H.264).'; } }
    else { video.pause(); video.currentTime = 0; }
  };
  video.onerror = () => { if (video.hasAttribute('src')) caption.textContent = 'Este vídeo não abriu. Reabra a galeria ou exporte o original como MP4 (H.264).'; };
  dialog.querySelector('[data-gallery-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-gallery-prev]').onclick = () => move(-1);
  dialog.querySelector('[data-gallery-next]').onclick = () => move(1);
  dialog.addEventListener('keydown', e => {
    if (e.target === video || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); }
  });
  dialog.addEventListener('touchstart', e => { startX = e.target === video ? null : e.changedTouches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', e => { if (startX == null) return; const distance = e.changedTouches[0].clientX - startX; if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1); startX = null; }, { passive: true });
  dialog.addEventListener('close', () => { release(); photos = []; });
  gallery = { open(items, photoIndex = 0) { if (!items.length) return; photos = items; index = Math.min(Math.max(photoIndex, 0), items.length - 1); render(); if (!dialog.open) dialog.showModal(); } };
  return gallery;
}
