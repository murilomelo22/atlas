import { request, signedURL, deleteObjects, currentUser } from './cloud.js';
import { processPhoto } from './photos.js';
import { escapeHTML as esc, confirmAction } from './ui.js';

export function tripGallery({ container, trip, canAdd, owner, valid, mutate }) {
  let staged = null;
  container.innerHTML = `<h3>Fotos da trip</h3><p class="field-hint">Fotos adicionadas aqui acompanham a privacidade do roteiro. Até 100 fotos por trip.</p><div class="trip-gallery"></div>${canAdd ? '<form class="trip-photo-form"><label>Adicionar foto<input data-trip-photo type="file" accept="image/jpeg,image/png,image/webp" required></label><label>Legenda<input data-trip-caption maxlength="500" placeholder="Uma memória da viagem…"></label><button class="quiet" type="submit">Enviar foto</button></form>' : ''}`;
  async function load() {
    const photos = await request(`/rest/v1/trip_photos?${new URLSearchParams({ select: '*', trip_id: `eq.${trip.id}`, order: 'created_at', limit: '100' })}`, { authenticated: Boolean(currentUser()) });
    if (!valid()) return;
    const grid = container.querySelector('.trip-gallery');
    grid.innerHTML = photos.length ? photos.map(photo => `<figure data-photo="${esc(photo.id)}"><a target="_blank" rel="noopener noreferrer" aria-label="Abrir foto da trip"><img alt="${esc(photo.caption || 'Foto da trip')}" loading="lazy"></a><figcaption>${esc(photo.caption)}</figcaption>${owner || canAdd && photo.uploader_id === currentUser()?.id ? '<button type="button" class="text-button" data-delete-photo>Remover foto</button>' : ''}</figure>`).join('') : '<p class="field-hint">A primeira foto pode ser sua próxima memória.</p>';
    await Promise.all(photos.map(async photo => {
      const figure = [...grid.children].find(f => f.dataset.photo === photo.id);
      figure.querySelector('[data-delete-photo]')?.addEventListener('click', () => mutate(async () => {
        if (!await confirmAction('Remover esta foto?', 'A foto deixará de aparecer no grupo e no roteiro público.')) return;
        if (!valid()) return;
        await request('/rest/v1/rpc/atlas_remove_trip_photo', { method: 'POST', authenticated: true, body: { p_photo: photo.id } });
        // The creator can remove others' photos, but only the uploader deletes their storage objects.
        if (photo.uploader_id === currentUser()?.id) await deleteObjects('atlas-trip-media', [photo.storage_path]).catch(() => {});
        if (valid()) await load();
      }));
      try {
        const url = await signedURL('atlas-trip-media', photo.storage_path, Boolean(currentUser()));
        if (valid() && figure.isConnected) { figure.querySelector('img').src = url; figure.querySelector('a').href = url; }
      } catch { if (valid()) figure.querySelector('img').alt = 'Não foi possível carregar esta foto. Reabra a trip para tentar novamente.'; }
    }));
  }
  const form = container.querySelector('form');
  if (form) {
    form.querySelector('[data-trip-photo]').onchange = () => { staged = null; };
    form.onsubmit = e => {
      e.preventDefault(); mutate(async () => {
        const who = currentUser()?.id, input = form.querySelector('[data-trip-photo]');
        if (!input.files[0]) return;
        if (!staged) {
          const photo = await processPhoto(input.files[0], trip.id);
          if (!valid() || who !== currentUser()?.id) return;
          staged = { id: photo.id, blob: photo.blob, path: `${who}/${trip.id}/${photo.id}.jpg`, uploaded: false };
        }
        const photo = staged;
        if (!photo.uploaded) {
          try {
            await request(`/storage/v1/object/atlas-trip-media/${photo.path}`, { method: 'POST', authenticated: true, body: photo.blob, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' } });
          } catch (error) { if (error.status !== 409) throw error; }
          photo.uploaded = true;
        }
        if (!valid() || who !== currentUser()?.id) return;
        await request('/rest/v1/rpc/atlas_add_trip_photo', { method: 'POST', authenticated: true, body: { p_trip: trip.id, p_id: photo.id, p_path: photo.path, p_caption: form.querySelector('[data-trip-caption]').value } });
        if (!valid()) return;
        staged = null; form.reset(); await load();
        document.getElementById('trip-message').textContent = 'Foto adicionada à trip.';
      });
    };
  }
  return { load };
}
