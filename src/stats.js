import { totalDays } from './dates.js';
export function chronologicalStops(destinations) {
  return destinations.flatMap((destination) => destination.visits.filter((visit) => visit.arrival).map((visit) => ({ ...destination, date: visit.arrival }))).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
export function haversine(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const value = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}
export function statistics(destinations) {
  const stops = chronologicalStops(destinations);
  return {
    countries: new Set(destinations.map((d) => d.countryId).filter(Boolean)).size,
    cities: destinations.length,
    days: destinations.reduce((sum, d) => sum + totalDays(d), 0),
    continents: new Set(destinations.map((d) => d.continent).filter(Boolean)).size,
    distance: Math.round(stops.slice(1).reduce((sum, d, i) => sum + haversine(stops[i], d), 0)),
  };
}
