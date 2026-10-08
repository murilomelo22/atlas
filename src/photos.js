export async function processPhoto(file, destinationId) {
  if (!file.type.startsWith('image/')) throw new Error(`“${file.name}” não é uma imagem.`);
  if (file.size > 40 * 1024 * 1024) throw new Error(`“${file.name}” excede o limite de 40 MB por imagem.`);
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error(`Não foi possível ler “${file.name}”. Use JPEG, PNG ou WebP.`); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 100000000) throw new Error('A imagem excede o limite de 100 megapixels.');
    const resize = async (maxSide, quality) => {
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      context.fillStyle = '#20201e';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('Não foi possível comprimir a imagem.');
      return blob;
    };
    return { id: crypto.randomUUID(), destinationId, blob: await resize(1600, 0.85), thumbnail: await resize(240, 0.85), caption: '' };
  } finally { bitmap.close(); }
}
export const blobAsDataURL = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Não foi possível ler a fotografia.'));
  reader.readAsDataURL(blob);
});
export async function photoFromBackup(raw, destinationId) {
  if (!raw || typeof raw.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(raw.data) || raw.data.length > 60 * 1024 * 1024) throw new Error('O backup contém uma fotografia inválida.');
  const [, mime, base64] = raw.data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.*)$/s) || [];
  if (!mime) throw new Error('Formato de fotografia inválido no backup.');
  let bytes;
  try { bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); } catch { throw new Error('Fotografia corrompida no backup.'); }
  const photo = await processPhoto(new File([bytes], 'backup.jpg', { type: mime }), destinationId);
  photo.id = String(raw.id || photo.id);
  photo.caption = String(raw.caption || '').slice(0, 1000);
  return photo;
}
