import { request, currentUser } from './cloud.js';

export function sameTripPlace(a, b) {
  return Boolean(a && b && (a.sourceDestinationId && a.sourceDestinationId === b.sourceDestinationId ||
    Math.abs(Number(a.lat) - Number(b.lat)) < .00001 && Math.abs(Number(a.lng) - Number(b.lng)) < .00001));
}
export function stopForDestination(trip, destination) {
  return trip.stops.find(stop => stop.sourceDestinationId === destination.id || sameTripPlace(stop, destination));
}
export function photosForTripStop(trip, photos, stop) {
  return photos.filter(photo => photo.stop_id === stop.id || sameTripPlace(trip.stops.find(place => place.id === photo.stop_id), stop));
}
export async function assignTripPhotoStops(trip, links, valid = () => true) {
  if (!links.length) return;
  const actor = currentUser()?.id;
  if (!actor || !valid()) throw new DOMException('A trip mudou.', 'AbortError');
  await request('/rest/v1/rpc/atlas_assign_trip_photo_stops', { method: 'POST', authenticated: true, body: { p_trip: trip.id, p_links: links } });
  if (currentUser()?.id !== actor || !valid()) throw new DOMException('A conta ou a trip mudou.', 'AbortError');
}
