import { visitedDestinations } from './dates.js';

export const POSTER_SIZES = {
  a4: { width: 297, height: 210, pixels: [3508, 2480] },
  a3: { width: 420, height: 297, pixels: [4961, 3508] },
};
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const themes = {
  light: { paper: '#f5f1e8', ink: '#263b32', land: '#dce2d9', line: '#a8b6aa', accent: '#a16d3f', dot: '#3f6650' },
  dark: { paper: '#101c18', ink: '#eee9df', land: '#263b32', line: '#536258', accent: '#c7a179', dot: '#f3d5ad' },
};
let cachedCountries, cachedPaths;
function countryPaths(countries) {
  if (countries === cachedCountries) return cachedPaths;
  cachedCountries = countries;
  cachedPaths = countries.features.map(feature => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    const path = polygons.flatMap(polygon => polygon.map(ring => ring.map(([lng, lat], index) =>
      `${index ? 'L' : 'M'}${(90 + (lng + 180) * 4.5).toFixed(2)},${(245 + (90 - lat) * 4.5).toFixed(2)}`).join('') + 'Z')).join('');
    return { id: String(feature.id), path };
  });
  return cachedPaths;
}

export function posterSVG(countries, destinations, { size = 'a3', theme = 'light', title = 'Meu mundo, revisitado' } = {}) {
  const dimensions = POSTER_SIZES[size];
  if (!dimensions || !themes[theme]) throw new Error('Formato de pôster inválido.');
  const colors = themes[theme], height = 1800 * dimensions.height / dimensions.width;
  const visited = visitedDestinations(destinations).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng));
  const countryIds = new Set(visited.map(d => String(d.countryId)).filter(id => id !== 'null' && id !== 'undefined'));
  const safeTitle = xml(String(title).trim().slice(0, 60) || 'Meu mundo, revisitado');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}mm" height="${dimensions.height}mm" viewBox="0 0 1800 ${height.toFixed(2)}" role="img" aria-labelledby="poster-title poster-description">
<title id="poster-title">${safeTitle}</title><desc id="poster-description">Mapa pessoal com ${visited.length} lugares e ${countryIds.size} países visitados.</desc>
<rect width="1800" height="${height}" fill="${colors.paper}"/>
<g font-family="Georgia, serif" fill="${colors.ink}"><text x="90" y="102" font-family="Arial, sans-serif" font-size="20" letter-spacing="6">ATLAS PESSOAL</text><text x="90" y="178" font-size="48">${safeTitle}</text>
<path d="M90 214H1710" stroke="${colors.accent}" stroke-width="2"/>
<g fill-rule="evenodd" stroke="${colors.line}" stroke-width=".65" stroke-linejoin="round">${countryPaths(countries).map(({ id, path }) => `<path data-country="${xml(id)}" d="${path}" fill="${countryIds.has(id) ? colors.accent : colors.land}"/>`).join('')}</g>
<g fill="${colors.dot}" stroke="${colors.paper}" stroke-width="1.4">${visited.map(d => `<circle data-place="visited" cx="${(90 + (d.lng + 180) * 4.5).toFixed(2)}" cy="${(245 + (90 - d.lat) * 4.5).toFixed(2)}" r="4.5"/>`).join('')}</g>
<path d="M90 1100H1710" stroke="${colors.accent}"/>
<text x="90" y="1150" font-size="27">${visited.length} ${visited.length === 1 ? 'lugar visitado' : 'lugares visitados'} · ${countryIds.size} ${countryIds.size === 1 ? 'país' : 'países'}</text>
<text x="90" y="1190" font-family="Arial, sans-serif" font-size="17">Cada lugar guarda uma parte de mim.</text>
<text x="1710" y="${height - 43}" text-anchor="end" font-family="Arial, sans-serif" font-size="13">Cartografia: Natural Earth · Projeção equiretangular</text></g></svg>`;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Canvas defaults to 96 dpi. A PNG pHYs chunk records the actual print density.
export async function pngWithPrintDensity(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
  view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
  view.setUint32(8, 11811); view.setUint32(12, 11811); chunk[16] = 1;
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const parts = [bytes.subarray(0, 33), chunk];
  for (let offset = 33; offset < bytes.length;) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0) + 12;
    if (String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)) !== 'pHYs') parts.push(bytes.subarray(offset, offset + length));
    offset += length;
  }
  return new Blob(parts, { type: 'image/png' });
}

export async function posterPNG(svg, size) {
  const dimensions = POSTER_SIZES[size];
  if (!dimensions) throw new Error('Formato de pôster inválido.');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const canvas = document.createElement('canvas');
  try {
    const image = new Image(); image.src = url; await image.decode();
    [canvas.width, canvas.height] = dimensions.pixels;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível criar o PNG. Tente o SVG vetorial.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('O navegador ficou sem memória. Tente A4 ou SVG vetorial.');
    return await pngWithPrintDensity(blob);
  } finally { URL.revokeObjectURL(url); canvas.width = canvas.height = 1; }
}
