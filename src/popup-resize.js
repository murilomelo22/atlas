// The popup is anchored below its centre. Resizing from the upper-left corner
// keeps its pointer on the destination and makes the handle follow the gesture.
export function initializePopupResize(card, content, resize, save) {
  const handle = document.createElement('button');
  handle.type = 'button'; handle.className = 'clean-place-resize';
  handle.setAttribute('aria-label', 'Redimensionar cartão da viagem');
  handle.setAttribute('aria-description', 'Arraste este canto ou use as setas para ajustar a largura e a altura.');
  handle.title = 'Arraste para redimensionar. As setas do teclado também ajustam o tamanho.';
  handle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M5 11V5h6m4 4v6H9"/></svg>';
  card.getElement().append(handle);
  let drag;

  handle.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    const box = content.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, width: box.width - 1, height: box.height };
    handle.setPointerCapture(event.pointerId);
    handle.focus({ preventScroll: true });
  });
  handle.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopPropagation();
    resize(drag.width - 2 * (event.clientX - drag.x), drag.height - (event.clientY - drag.y), false);
  });
  function finish(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const id = drag.id; drag = null;
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    save();
  }
  handle.addEventListener('pointerup', finish);
  handle.addEventListener('pointercancel', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
  handle.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const box = content.getBoundingClientRect(), step = event.shiftKey ? 32 : 8;
    resize(box.width - 1 + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      box.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0), true);
    save();
  });
  return { cancel() { if (drag) finish({ pointerId: drag.id }); } };
}
