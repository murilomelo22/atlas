export function createGallery() {
  const dialog = document.querySelector('#gallery-dialog'), image = dialog.querySelector('img'), caption = dialog.querySelector('#gallery-caption'), counter = dialog.querySelector('#gallery-counter');
  let photos = [], index = 0, url, startX;
  function render() {
    if (url) URL.revokeObjectURL(url);
    const photo = photos[index];
    url = URL.createObjectURL(photo.blob);
    image.src = url;
    image.alt = photo.caption || `Fotografia ${index + 1}`;
    caption.textContent = photo.caption || 'Sem legenda';
    counter.textContent = `${index + 1} / ${photos.length}`;
  }
  function move(delta) { index = (index + delta + photos.length) % photos.length; render(); }
  dialog.querySelector('[data-gallery-close]').onclick = () => dialog.close();
  dialog.querySelector('[data-gallery-prev]').onclick = () => move(-1);
  dialog.querySelector('[data-gallery-next]').onclick = () => move(1);
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); move(e.key === 'ArrowRight' ? 1 : -1); }
  });
  dialog.addEventListener('touchstart', (e) => { startX = e.changedTouches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    const distance = e.changedTouches[0].clientX - startX;
    if (Math.abs(distance) > 45) move(distance < 0 ? 1 : -1);
  }, { passive: true });
  dialog.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); url = null; image.removeAttribute('src'); });
  return { open(items, photoIndex = 0) { photos = items; index = photoIndex; if (!photos.length) return; render(); dialog.showModal(); } };
}
