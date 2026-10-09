import { processPhoto, photoFromBackup } from './photos.js';

export const MEDIA_ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.heic,.heif';
export const mediaKind = media => media.kind || 'image';
export const mediaLabel = media => ({ image: 'Foto', video: 'Vídeo', live: 'Live Photo' })[mediaKind(media)] || 'Foto';
export const mediaExtension = blob => ({ 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' })[blob.type] || 'jpg';
const videoType = file => ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' })[file.name?.split('.').at(-1).toLowerCase()] || file.type;
const isVideo = file => file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);

// Apple pickers often return only the still image. Motion must be supplied separately.
export function groupMediaFiles(files) {
  const groups = new Map(), paired = new Set(), result = [];
  for (const file of files) {
    const stem = file.name.replace(/\.[^.]+$/, '').toLowerCase();
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push(file);
  }
  for (const file of files) {
    if (paired.has(file)) continue;
    const group = groups.get(file.name.replace(/\.[^.]+$/, '').toLowerCase());
    if (group.length === 2 && group.filter(isVideo).length === 1 && group.some(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))) {
      const image = group.find(f => !isVideo(f)), motion = group.find(isVideo);
      result.push({ image, motion }); paired.add(image); paired.add(motion);
    } else result.push(isVideo(file) ? { video: file } : { image: file });
  }
  return result;
}

export async function processVideo(file, destinationId) {
  const mime = videoType(file);
  if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(mime)) throw new Error('Use um vídeo MP4, WebM ou MOV compatível com seu navegador.');
  if (!file.size || file.size > 50 * 1024 * 1024) throw new Error(`“${file.name}” deve ter até 50 MB por vídeo.`);
  const blob = file.slice(0, file.size, mime), url = URL.createObjectURL(blob), video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  try {
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); video.onloadeddata = video.onerror = null; error ? reject(error) : resolve(); };
      const timer = setTimeout(() => finish(new Error('O vídeo demorou a abrir. Tente um arquivo menor ou exporte como MP4 (H.264).')), 15000);
      video.onerror = () => finish(new Error(`Não foi possível reproduzir “${file.name}”. Exporte como MP4 (H.264); MOV/HEVC depende do navegador.`));
      video.onloadeddata = () => finish(); video.src = url; video.load();
      // Muted, inline playback lets Safari load a decodable frame for the preview.
      video.play().catch(() => {});
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || video.videoWidth * video.videoHeight > 100000000) throw new Error('O vídeo tem duração ou dimensões inválidas. Exporte novamente como MP4.');
    const canvas = document.createElement('canvas'), scale = Math.min(1, 240 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .85));
    if (!thumbnail) throw new Error('Não foi possível criar a prévia do vídeo.');
    return { id: crypto.randomUUID(), destinationId, kind: 'video', blob, thumbnail, duration: video.duration, caption: '' };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}

export async function processMedia(group, destinationId) {
  if (group.video) return processVideo(group.video, destinationId);
  const photo = await processPhoto(group.image, destinationId);
  if (!group.motion) return { ...photo, kind: 'image' };
  const motion = await processVideo(group.motion, destinationId);
  return { ...photo, kind: 'live', motionBlob: motion.blob, duration: motion.duration };
}

function backupFile(data, name, expected) {
  if (typeof data !== 'string' || data.length > 70 * 1024 * 1024) throw new Error('O backup contém uma mídia inválida.');
  const match = data.match(/^data:([^;,]+);base64,([\s\S]*)$/);
  if (!match || !expected.includes(match[1])) throw new Error('Formato de mídia inválido no backup.');
  try { return new File([Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))], name, { type: match[1] }); }
  catch { throw new Error('Mídia corrompida no backup.'); }
}
export async function mediaFromBackup(raw, destinationId) {
  const kind = raw.kind || 'image';
  if (!['image', 'video', 'live'].includes(kind)) throw new Error('Tipo de mídia inválido no backup.');
  let media;
  if (kind === 'video') media = await processVideo(backupFile(raw.data, 'backup', ['video/mp4', 'video/webm', 'video/quicktime']), destinationId);
  else {
    media = await photoFromBackup(raw, destinationId);
    if (kind === 'live') {
      const motion = await processVideo(backupFile(raw.motion, 'backup-motion', ['video/mp4', 'video/webm', 'video/quicktime']), destinationId);
      media.motionBlob = motion.blob; media.duration = motion.duration;
    }
  }
  return { ...media, id: String(raw.id || media.id), caption: String(raw.caption || '').slice(0, 1000), kind };
}
