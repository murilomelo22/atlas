export function initializeMapFocus(controller) {
  const area = document.getElementById('map-area');
  const open = document.getElementById('clean-map-button');
  const close = document.getElementById('clean-map-close');
  const controls = area.querySelector('.clean-map-controls');
  const brand = document.getElementById('clean-map-brand');
  const gallery = document.getElementById('gallery-dialog');
  let galleryParent, galleryNext;
  let active = false, previousView, previousFocus, blocked = [], generation = 0;

  function exit() {
    if (!active) return;
    active = false; generation++;
    if (gallery.open) gallery.close();
    if (galleryParent) galleryParent.insertBefore(gallery, galleryNext?.parentElement === galleryParent ? galleryNext : null);
    if (document.fullscreenElement === area) document.exitFullscreen().catch(() => {});
    area.classList.remove('is-focused'); document.body.classList.remove('map-focused');
    controls.hidden = true;
    brand.hidden = true;
    area.removeAttribute('role'); area.removeAttribute('aria-modal');
    for (const [element, inert] of blocked) element.inert = inert;
    blocked = [];
    controller.setCleanMode(false); controller.resize();
    controller.map.setView(previousView.center, previousView.zoom, { animate: false });
    previousFocus?.focus({ preventScroll: true });
  }

  function enter() {
    if (active) return;
    active = true;
    const token = ++generation;
    previousFocus = document.activeElement;
    previousView = { center: controller.map.getCenter(), zoom: controller.map.getZoom() };
    galleryParent = gallery.parentElement; galleryNext = gallery.nextSibling; area.append(gallery);
    area.classList.add('is-focused'); document.body.classList.add('map-focused');
    controls.hidden = false;
    brand.hidden = false;
    area.setAttribute('role', 'dialog'); area.setAttribute('aria-modal', 'true');
    blocked = [...document.body.children].filter((element) => element !== area.closest('main'));
    blocked.push(document.getElementById('destinations-panel'));
    blocked = blocked.map((element) => [element, element.inert]);
    for (const [element] of blocked) element.inert = true;
    controller.setCleanMode(true); controller.resize(); controller.fitVisited();
    close.focus({ preventScroll: true });
    // Fixed viewport mode also works on browsers that cannot enter native fullscreen.
    if (area.requestFullscreen && document.fullscreenEnabled) {
      area.requestFullscreen().then(() => {
        if (!active || generation !== token) {
          if (document.fullscreenElement === area && !active) document.exitFullscreen().catch(() => {});
          return;
        }
        controller.resize(); controller.fitVisited();
      }).catch(() => {});
    }
  }

  open.onclick = enter; close.onclick = exit;
  document.getElementById('clean-map-fit').onclick = () => controller.fitVisited();
  document.addEventListener('fullscreenchange', () => {
    if (active && document.fullscreenElement !== area) exit();
    controller.resize();
  });
  document.addEventListener('keydown', (event) => {
    if (!active) return;
    if (gallery.open) return;
    if (event.key === 'Escape') { event.preventDefault(); exit(); }
    if (event.key === 'Tab') {
      const focusable = [...area.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')]
        .filter((element) => !element.disabled && element.getClientRects().length && !element.closest('[hidden]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  return { exit };
}
