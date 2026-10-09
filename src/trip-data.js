import { normalizeCoordinates } from './geography.js';
import { dateDays } from './dates.js';
export function cleanTrip(raw) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 120) throw new Error('Informe um nome de até 120 caracteres para a trip.');
  if (!Array.isArray(raw.stops) || raw.stops.length > 200) throw new Error('Use até 200 destinos no roteiro.');
  const stops = raw.stops.map((stop) => {
    if (!stop || typeof stop.name !== 'string' || !stop.name.trim() || stop.name.length > 120) throw new Error('Cada parada precisa de um nome de até 120 caracteres.');
    const coordinates = normalizeCoordinates(stop.lat,stop.lng), date = String(stop.date || '');
    if (date && dateDays(date) == null) throw new Error('A data de uma parada é inválida.');
    if (String(stop.notes || '').length > 2000) throw new Error('Use até 2.000 caracteres nas notas de cada parada.');
    return { id: typeof stop.id === 'string' ? stop.id.slice(0,128) : crypto.randomUUID(), name:stop.name.trim(), ...coordinates, date, notes:String(stop.notes || '') };
  });
  if (String(raw.notes || '').length > 5000) throw new Error('Use até 5.000 caracteres na descrição da trip.');
  const cover = typeof raw.cover_data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.cover_data) && raw.cover_data.length <= 1500000 ? raw.cover_data : null;
  return { id: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.id || '') ? raw.id : crypto.randomUUID(), name:raw.name.trim(), notes:String(raw.notes || ''), stops, is_public:raw.is_public === true, cover_data:cover };
}
