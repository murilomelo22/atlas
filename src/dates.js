const DAY = 86400000;
export function dateDays(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map(Number);
  const time = Date.UTC(y, m - 1, d);
  return new Date(time).toISOString().slice(0, 10) === value ? time / DAY : null;
}
export function visitDays(visit) {
  if (visit.manualDays != null && visit.manualDays !== '') return Number(visit.manualDays);
  const start = dateDays(visit.arrival), end = dateDays(visit.departure);
  return start == null || end == null ? 0 : Math.max(0, end - start + 1);
}
export const totalDays = (destination) => destination.visits.reduce((sum, visit) => sum + visitDays(visit), 0);
export function durationLabel(days) {
  if (!days) return 'Tempo não informado';
  const weeks = Math.floor(days / 7), rest = days % 7;
  if (!weeks) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}${rest ? ` e ${rest} ${rest === 1 ? 'dia' : 'dias'}` : ''}`;
}
export function displayDate(value) {
  return dateDays(value) == null ? 'Sem data' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(`${value}T12:00:00Z`));
}
export function validateVisits(visits) {
  for (const visit of visits) {
    if (visit.manualDays != null && visit.manualDays !== '') {
      if (!Number.isInteger(Number(visit.manualDays)) || Number(visit.manualDays) < 1 || Number(visit.manualDays) > 365000) throw new Error('Informe uma duração inteira de 1 a 365.000 dias.');
    } else if (visit.arrival || visit.departure) {
      if (dateDays(visit.arrival) == null || dateDays(visit.departure) == null) throw new Error('Preencha as duas datas da visita ou informe a duração manual.');
      if (visit.departure < visit.arrival) throw new Error('A partida não pode ser anterior à chegada.');
    }
  }
}
