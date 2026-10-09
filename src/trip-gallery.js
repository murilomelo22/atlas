import { request, signedURL, deleteObjects, currentUser, ensureMediaSupport } from './cloud.js';
import { MEDIA_ACCEPT, groupMediaFiles, processMedia, mediaKind, mediaLabel, mediaExtension } from './media.js';
import { createGallery } from './gallery.js';
import { escapeHTML as esc, confirmAction } from './ui.js';

export function tripGallery({ container, trip, canAdd, owner, valid, mutate }) {
  let staged = null;
  container.innerHTML = `<h3>Fotos e vídeos da trip</h3><p class="field-hint">Até 100 mídias, com a privacidade do roteiro. Fotos: até 40 MB; vídeos: até 50 MB. Live Photo: selecione a foto e o vídeo com o mesmo nome juntos. Se o iPhone enviar só a foto, exporte o movimento no app Fotos como vídeo.</p><div class="trip-gallery"></div>${canAdd ? `<form class="trip-photo-form"><label>Adicionar foto, vídeo ou Live Photo<input data-trip-photo type="file" accept="${MEDIA_ACCEPT}" multiple required></label><label>Legenda<input data-trip-caption maxlength="500" placeholder="Uma memória da viagem…"></label><button class="quiet" type="submit">Enviar mídia</button></form>` : ''}`;
  async function load() {
    const photos = await request(`/rest/v1/trip_photos?${new URLSearchParams({ select: '*', trip_id: `eq.${trip.id}`, order: 'created_at', limit: '100' })}`, { authenticated: Boolean(currentUser()) });
    if (!valid()) return;
    const grid = container.querySelector('.trip-gallery');
    grid.innerHTML = photos.length ? photos.map(photo => `<figure data-photo="${esc(photo.id)}"><a target="_blank" rel="noopener noreferrer" aria-label="Abrir ${mediaLabel(photo).toLowerCase()} da trip"><img alt="${esc(photo.caption || mediaLabel(photo))}" loading="lazy"></a>${mediaKind(photo) !== 'image' ? `<span class="media-badge">▶ ${mediaLabel(photo)}</span>` : ''}<figcaption>${esc(photo.caption)}</figcaption>${owner || canAdd && photo.uploader_id === currentUser()?.id ? '<button type="button" class="text-button" data-delete-photo>Remover mídia</button>' : ''}</figure>`).join('') : '<p class="field-hint">A primeira foto ou vídeo pode ser sua próxima memória.</p>';
    await Promise.all(photos.map(async photo => {
      const figure = [...grid.children].find(f => f.dataset.photo === photo.id);
      figure.querySelector('[data-delete-photo]')?.addEventListener('click', () => mutate(async () => {
        if (!await confirmAction('Remover esta mídia?', 'A mídia deixará de aparecer no grupo e no roteiro público.')) return;
        if (!valid()) return;
        await request('/rest/v1/rpc/atlas_remove_trip_photo', { method: 'POST', authenticated: true, body: { p_photo: photo.id } });
        if (photo.uploader_id === currentUser()?.id) await deleteObjects('atlas-trip-media', [photo.storage_path, photo.thumbnail_path, photo.motion_path]).catch(() => {});
        if (valid()) await load();
      }));
      try {
        const url = await signedURL('atlas-trip-media', photo.thumbnail_path || photo.storage_path, Boolean(currentUser()));
        if (!valid() || !figure.isConnected) return;
        figure.querySelector('img').src = url; figure.querySelector('a').href = url;
        figure.querySelector('a').onclick = e => {
          e.preventDefault();
          // Request fresh URLs when opened; large videos load only on demand.
          mutate(async () => {
            const [main, motion] = await Promise.all([signedURL('atlas-trip-media', photo.storage_path, Boolean(currentUser())), photo.motion_path ? signedURL('atlas-trip-media', photo.motion_path, Boolean(currentUser())) : null]);
            if (valid()) createGallery().open([{ ...photo, url: main, thumbnailURL: url, motionURL: motion }]);
          });
        };
      } catch { if (valid()) figure.querySelector('img').alt = 'Não foi possível carregar esta mídia. Reabra a trip para tentar novamente.'; }
    }));
  }
  const form = container.querySelector('form');
  if (form) {
    form.querySelector('[data-trip-photo]').onchange = () => { staged = null; };
    form.onsubmit = e => {
      e.preventDefault(); mutate(async () => {
        const who = currentUser()?.id, input = form.querySelector('[data-trip-photo]');
        if (!input.files.length) return;
        if (!staged) {
          const groups = groupMediaFiles([...input.files]);
          if (groups.length !== 1) throw new Error('Envie uma mídia por vez. Para Live Photo, selecione apenas a foto e o vídeo com o mesmo nome.');
          const photo = await processMedia(groups[0], trip.id);
          if (!valid() || who !== currentUser()?.id) return;
          const folder = `${who}/${trip.id}/${photo.id}`, isImage = mediaKind(photo) === 'image';
          staged = { ...photo, path: `${folder}.${mediaExtension(photo.blob)}`, thumbPath: isImage ? null : `${folder}-thumb.jpg`, motionPath: photo.motionBlob ? `${folder}-motion.${mediaExtension(photo.motionBlob)}` : null, uploaded: new Set() };
        }
        const photo = staged, isImage = mediaKind(photo) === 'image';
        if (!isImage) await ensureMediaSupport('trip_photos');
        for (const [path, blob] of [[photo.path, photo.blob], [photo.thumbPath, photo.thumbnail], [photo.motionPath, photo.motionBlob]]) {
          if (!path || photo.uploaded.has(path)) continue;
          if (!valid() || who !== currentUser()?.id) return;
          try { await request(`/storage/v1/object/atlas-trip-media/${path}`, { method: 'POST', authenticated: true, body: blob, headers: { 'Content-Type': blob.type, 'x-upsert': 'false' } }); }
          catch (error) { if (error.status !== 409) throw error; }
          photo.uploaded.add(path);
        }
        if (!valid() || who !== currentUser()?.id) return;
        const body = { p_trip: trip.id, p_id: photo.id, p_path: photo.path, p_caption: form.querySelector('[data-trip-caption]').value };
        if (!isImage) Object.assign(body, { p_kind: photo.kind, p_thumbnail: photo.thumbPath, p_motion: photo.motionPath, p_duration: photo.duration });
        await request(`/rest/v1/rpc/${isImage ? 'atlas_add_trip_photo' : 'atlas_add_trip_media'}`, { method: 'POST', authenticated: true, body });
        if (!valid()) return;
        staged = null; form.reset(); await load();
        document.getElementById('trip-message').textContent = 'Mídia adicionada à trip.';
      });
    };
  }
  return { load };
}
