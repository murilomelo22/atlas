import { dateDays, visitDays } from './dates.js';

// Saved visits are observations at a place, not GPS tracks between places.
export function heatPoints(destinations, mode = 'visits', today = new Date().toISOString().slice(0, 10)) {
  const end = dateDays(today);
  return destinations.filter(d => d.kind !== 'home' && !d.example).flatMap(d => {
    let weight = 0;
    for (const visit of d.visits || []) {
      const start = dateDays(visit.arrival), departure = dateDays(visit.departure);
      if (start != null && start > end) continue;
      weight += mode === 'days' ? start != null && departure != null
        ? Math.max(0, Math.min(departure, end) - start + 1) : visitDays(visit) : 1;
    }
    return weight > 0 && Number.isFinite(d.lat) && Number.isFinite(d.lng) ? [{ lat: d.lat, lng: d.lng, weight }] : [];
  });
}

export function createHeatLayer(map) {
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas-heatmap'; canvas.setAttribute('aria-hidden', 'true');
  let points = [], visible = false, frame = null;
  const palette = document.createElement('canvas'); palette.width = 256; palette.height = 1;
  const paletteContext = palette.getContext('2d'), gradient = paletteContext.createLinearGradient(0, 0, 256, 0);
  [[0, '#338cff'], [.3, '#29cdd0'], [.55, '#70dc69'], [.75, '#ffda54'], [1, '#ff654d']].forEach(([stop, color]) => gradient.addColorStop(stop, color));
  paletteContext.fillStyle = gradient; paletteContext.fillRect(0, 0, 256, 1);
  const colors = paletteContext.getImageData(0, 0, 256, 1).data;
  function draw() {
    frame = null;
    if (!visible) return;
    const size = map.getSize(), origin = map.containerPointToLayerPoint([0, 0]);
    canvas.width = size.x; canvas.height = size.y; L.DomUtil.setPosition(canvas, origin);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const radius = 64, bins = new Map();
    for (const point of points) {
      let lng = point.lng;
      while (lng - map.getCenter().lng > 180) lng -= 360;
      while (lng - map.getCenter().lng < -180) lng += 360;
      const pixel = map.latLngToContainerPoint([point.lat, lng]);
      if (pixel.x < -radius || pixel.y < -radius || pixel.x > size.x + radius || pixel.y > size.y + radius) continue;
      const key = `${Math.round(pixel.x / 4)},${Math.round(pixel.y / 4)}`;
      const bin = bins.get(key) || { x: pixel.x, y: pixel.y, weight: 0 };
      bin.weight += point.weight; bins.set(key, bin);
    }
    const max = Math.max(1, ...[...bins.values()].map(p => p.weight));
    for (const point of bins.values()) {
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      glow.addColorStop(0, `rgba(0,0,0,${.9 * point.weight / max})`);
      glow.addColorStop(.2, `rgba(0,0,0,${.9 * point.weight / max})`); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    }
    if (size.x && size.y) {
      const pixels = ctx.getImageData(0, 0, size.x, size.y);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const alpha = pixels.data[i + 3]; if (!alpha) continue;
        pixels.data[i] = colors[alpha * 4]; pixels.data[i + 1] = colors[alpha * 4 + 1]; pixels.data[i + 2] = colors[alpha * 4 + 2];
        pixels.data[i + 3] = Math.round(alpha * .82);
      }
      ctx.putImageData(pixels, 0, 0);
    }
    canvas.dataset.points = String(points.length); canvas.dataset.weight = String(points.reduce((sum, p) => sum + p.weight, 0));
    canvas.hidden = false;
  }
  const schedule = () => { if (visible && frame == null) frame = requestAnimationFrame(draw); };
  map.on('movestart zoomstart', () => { canvas.hidden = true; });
  map.on('moveend zoomend resize', schedule);
  return {
    update(next) { points = next; schedule(); },
    show(value) {
      visible = Boolean(value);
      if (visible) { map.getPanes().overlayPane.append(canvas); schedule(); }
      else { canvas.remove(); if (frame != null) cancelAnimationFrame(frame); frame = null; }
    },
  };
}
