import { randomUUID } from 'node:crypto';
import { mockCloud } from './cloud-fixture.js';
// HTTP contracts only. Run verify-trips.sql for actual RLS/definer verification.
export async function mockTrips(page) {
 const state=await mockCloud(page);state.trips=[];state.members=[];state.tripPhotos=[];state.publications=[];
 await page.route('https://atlas-tests.supabase.co/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(!path.includes('trip'))return route.fallback();
  if(state.failed)return route.abort();
  const auth=req.headers().authorization || '',owner=auth.startsWith('Bearer token-')?auth.slice(13):null;
  let body;try{body=req.postDataJSON();}catch{body={};}
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:data==null?'':JSON.stringify(data)});
  const error=(message,status=403)=>ok({code:status===409?'40001':'42501',message},status);
  const role=trip=>trip?.owner_id===owner&&owner?'owner':state.members.find(m=>m.trip_id===trip?.id&&m.user_id===owner)?.status==='accepted'?state.members.find(m=>m.trip_id===trip?.id&&m.user_id===owner)?.role:null;
  const canRead=trip=>trip.is_public||trip.owner_id===owner||state.members.some(m=>m.trip_id===trip.id&&m.user_id===owner);
  state.requests.push({path,method:req.method(),owner});
  const member=trip=>state.members.find(m=>m.trip_id===trip?.id&&m.user_id===owner&&m.status==='accepted');
  const allowed=(trip,key)=>role(trip)==='owner'||Boolean(member(trip)?.[`can_${key}`] ?? (key.startsWith('edit_')&&member(trip)?.role==='editor'));
  const visiblePublication=p=>{const t=state.trips.find(t=>t.id===p.trip_id);return t?.is_public&&state.profiles.find(u=>u.id===p.user_id)?.is_public&&(t.owner_id===p.user_id||state.members.some(m=>m.trip_id===t.id&&m.user_id===p.user_id&&m.status==='accepted'&&m.can_publish_profile));};
  const filter=rows=>rows.filter(row=>[...url.searchParams].every(([k,v])=>!v.startsWith('eq.')||row[k]===v.slice(3)));
  if(path==='/rest/v1/trip_photos')return ok(filter(state.tripPhotos.filter(p=>canRead(state.trips.find(t=>t.id===p.trip_id)))));
  if(path==='/rest/v1/trip_publications')return ok(filter(state.publications.filter(p=>p.user_id===owner||visiblePublication(p))).map(p=>url.searchParams.get('select')?.includes('trips(')?{...p,trips:state.trips.find(t=>t.id===p.trip_id)}:p));
  if(path==='/rest/v1/trip_members')return ok(filter(state.members.filter(m=>m.user_id===owner||['owner','editor','viewer'].includes(role(state.trips.find(t=>t.id===m.trip_id))))));
  if(path==='/rest/v1/trips')return ok(filter(state.trips.filter(t=>canRead(t)&&(!url.searchParams.has('or')||t.owner_id===owner||state.members.some(m=>m.trip_id===t.id&&m.user_id===owner)))));
  if(path.endsWith('/atlas_save_trip')) {
   const old=state.trips.find(t=>t.id===body.p_id);
   if(!owner||old&&!allowed(old,'edit_itinerary')&&!allowed(old,'edit_description'))return error('ATLAS_TRIP_FORBIDDEN');
   if((old?.revision||null)!==body.p_expected_revision)return error('ATLAS_TRIP_CONFLICT',409);
   if(old&&role(old)!=='owner'&&old.is_public!==body.p_public)return error('ATLAS_TRIP_FORBIDDEN');
   if(old&&role(old)!=='owner') {
    const structure=stops=>JSON.stringify(stops.map(({notes,...rest})=>rest));
    if(!allowed(old,'edit_itinerary')&&(old.name!==body.p_name||old.cover_path!==body.p_cover_path||structure(old.stops)!==structure(body.p_stops)))return error('ATLAS_TRIP_FORBIDDEN');
    if(!allowed(old,'edit_description')&&(old.notes!==body.p_notes||body.p_stops.some(s=>s.notes!==(old.stops.find(o=>o.id===s.id)?.notes||''))))return error('ATLAS_TRIP_FORBIDDEN');
   }
   if(old?.is_public&&!body.p_public)state.publications=state.publications.filter(p=>p.trip_id!==old.id);
   const trip={id:body.p_id,owner_id:old?.owner_id||owner,name:body.p_name,notes:body.p_notes,stops:body.p_stops,is_public:body.p_public,cover_path:body.p_cover_path,revision:randomUUID()};
   state.trips=state.trips.filter(t=>t!==old);state.trips.push(trip);return ok(trip);
  }
  if(path.endsWith('/atlas_trip_people')||path.endsWith('/atlas_trip_collaborators')) {
   if(!['owner','editor','viewer'].includes(role(state.trips.find(t=>t.id===body.p_trip))))return error('ATLAS_TRIP_FORBIDDEN');
   return ok(state.members.filter(m=>m.trip_id===body.p_trip).map(m=>({...m,username:state.profiles.find(p=>p.id===m.user_id).username})));
  }
  if(path.endsWith('/atlas_invite_trip')||path.endsWith('/atlas_invite_trip_permissions')) {
   if(role(state.trips.find(t=>t.id===body.p_trip))!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   const person=state.profiles.find(p=>p.username===body.p_username&&p.is_public&&p.id!==owner);
   if(!person)return error('ATLAS_TRIP_USER_NOT_FOUND');
   const old=state.members.find(m=>m.trip_id===body.p_trip&&m.user_id===person.id);
   const granular=path.endsWith('_permissions');
   const rights={can_edit_itinerary:granular?body.p_itinerary:body.p_role==='editor',can_edit_description:granular?body.p_description:body.p_role==='editor',can_add_photos:granular?body.p_photos:false,can_publish_profile:granular?body.p_publish:false};
   const roleValue=rights.can_edit_itinerary||rights.can_edit_description?'editor':'viewer';
   if(old)Object.assign(old,{role:roleValue,...rights});else state.members.push({trip_id:body.p_trip,user_id:person.id,role:roleValue,status:'invited',...rights});
   if(!rights.can_publish_profile)state.publications=state.publications.filter(p=>!(p.trip_id===body.p_trip&&p.user_id===person.id));return ok(null,204);
  }
  if(path.endsWith('/atlas_respond_trip_invite')) {
   const member=state.members.find(m=>m.trip_id===body.p_trip&&m.user_id===owner);if(!member)return error('ATLAS_TRIP_FORBIDDEN');
   if(body.p_accept)member.status='accepted';else {state.members=state.members.filter(m=>m!==member);state.publications=state.publications.filter(p=>!(p.trip_id===body.p_trip&&p.user_id===owner));}return ok(null,204);
  }
  if(path.endsWith('/atlas_remove_trip_member')) {
   if(role(state.trips.find(t=>t.id===body.p_trip))!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   state.members=state.members.filter(m=>!(m.trip_id===body.p_trip&&m.user_id===body.p_user));state.publications=state.publications.filter(p=>!(p.trip_id===body.p_trip&&p.user_id===body.p_user));return ok(null,204);
  }
  if(path.endsWith('/atlas_set_trip_permissions')) {
   if(role(state.trips.find(t=>t.id===body.p_trip))!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   const target=state.members.find(m=>m.trip_id===body.p_trip&&m.user_id===body.p_user);if(!target)return error('ATLAS_TRIP_USER_NOT_FOUND');
   Object.assign(target,{role:body.p_itinerary||body.p_description?'editor':'viewer',can_edit_itinerary:body.p_itinerary,can_edit_description:body.p_description,can_add_photos:body.p_photos,can_publish_profile:body.p_publish});
   if(!body.p_publish)state.publications=state.publications.filter(p=>!(p.trip_id===body.p_trip&&p.user_id===body.p_user));return ok(null,204);
  }
  if(path.endsWith('/atlas_add_trip_photo')) {
   const trip=state.trips.find(t=>t.id===body.p_trip);if(!allowed(trip,'add_photos'))return error('ATLAS_TRIP_FORBIDDEN');
   if(body.p_path!==`${owner}/${trip.id}/${body.p_id}.jpg`||!state.objects.has(`atlas-trip-media/${body.p_path}`))return error('ATLAS_TRIP_INVALID_PHOTO');
   if(!state.tripPhotos.some(p=>p.id===body.p_id))state.tripPhotos.push({id:body.p_id,trip_id:trip.id,uploader_id:owner,storage_path:body.p_path,caption:body.p_caption});return ok(null,204);
  }
  if(path.endsWith('/atlas_remove_trip_photo')) {
   const photo=state.tripPhotos.find(p=>p.id===body.p_photo),trip=state.trips.find(t=>t.id===photo?.trip_id);
   if(!photo||!(role(trip)==='owner'||photo.uploader_id===owner&&allowed(trip,'add_photos')))return error('ATLAS_TRIP_FORBIDDEN');
   state.tripPhotos=state.tripPhotos.filter(p=>p!==photo);return ok(null,204);
  }
  if(path.endsWith('/atlas_publish_trip_profile')) {
   const trip=state.trips.find(t=>t.id===body.p_trip);
   if(!owner||body.p_publish&&!allowed(trip,'publish_profile'))return error('ATLAS_TRIP_FORBIDDEN');
   const row={trip_id:body.p_trip,user_id:owner};
   if(body.p_publish&&!visiblePublication(row))return error('ATLAS_TRIP_PUBLISH_PUBLIC');
   state.publications=state.publications.filter(p=>!(p.trip_id===row.trip_id&&p.user_id===row.user_id));if(body.p_publish)state.publications.push(row);return ok(null,204);
  }
  if(path.endsWith('/atlas_delete_trip')) {
   const trip=state.trips.find(t=>t.id===body.p_trip);if(role(trip)!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   if(trip.revision!==body.p_expected_revision)return error('ATLAS_TRIP_CONFLICT',409);
   state.trips=state.trips.filter(t=>t!==trip);state.members=state.members.filter(m=>m.trip_id!==trip.id);state.tripPhotos=state.tripPhotos.filter(p=>p.trip_id!==trip.id);state.publications=state.publications.filter(p=>p.trip_id!==trip.id);return ok(null,204);
  }
  return route.fallback();
 });
 return state;
}
