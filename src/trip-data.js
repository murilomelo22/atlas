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
    const departure = String(stop.departure || '');
    if (departure && (dateDays(departure) == null || date && departure < date)) throw new Error('A partida de uma viagem realizada deve ser uma data válida após a chegada.');
    const manualDays = stop.manualDays == null ? null : Number(stop.manualDays);
    if (manualDays != null && (!Number.isInteger(manualDays) || manualDays < 1 || manualDays > 365000)) throw new Error('A duração da viagem realizada é inválida.');
    return { id: typeof stop.id === 'string' ? stop.id.slice(0,128) : crypto.randomUUID(), name:stop.name.trim(), ...coordinates, date, notes:String(stop.notes || ''),
      ...(stop.completed === true ? { completed:true, departure, manualDays, sourceDestinationId:String(stop.sourceDestinationId || '').slice(0,128), sourceVisitId:String(stop.sourceVisitId || '').slice(0,128) } : {}) };
  });
  if (String(raw.notes || '').length > 5000) throw new Error('Use até 5.000 caracteres na descrição da trip.');
  const cover = typeof raw.cover_data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.cover_data) && raw.cover_data.length <= 1500000 ? raw.cover_data : null;
  return { id: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(raw.id || '') ? raw.id : crypto.randomUUID(), name:raw.name.trim(), notes:String(raw.notes || ''), stops, is_public:raw.is_public === true, cover_data:cover };
}
export function recordedVisits(destinations, today) {
  if (!today) { const now = new Date(); today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
  return destinations.filter(d=>d.kind!=='home' && !d.example).flatMap(d=>(d.visits.length?d.visits:[{}]).map((v,i)=>({ destination:d, visit:v,
    stop:{ id:crypto.randomUUID(), name:d.name, lat:d.lat, lng:d.lng, date:v.arrival || '', departure:v.departure || '', manualDays:v.manualDays ?? null, notes:'', completed:true, sourceDestinationId:d.id, sourceVisitId:String(v.id || i) } })))
    .filter(row=>(!row.stop.date || row.stop.date<=today) && (!row.stop.departure || row.stop.departure<=today)).sort((a,b)=>a.stop.date.localeCompare(b.stop.date) || a.stop.name.localeCompare(b.stop.name,'pt-BR'));
}
