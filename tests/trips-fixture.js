import { randomUUID } from 'node:crypto';
import { mockCloud } from './cloud-fixture.js';
// HTTP contracts only. Run verify-trips.sql for actual RLS/definer verification.
export async function mockTrips(page) {
 const state=await mockCloud(page);state.trips=[];state.members=[];
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
  const filter=rows=>rows.filter(row=>[...url.searchParams].every(([k,v])=>!v.startsWith('eq.')||row[k]===v.slice(3)));
  if(path==='/rest/v1/trip_members')return ok(filter(state.members.filter(m=>m.user_id===owner||['owner','editor','viewer'].includes(role(state.trips.find(t=>t.id===m.trip_id))))));
  if(path==='/rest/v1/trips')return ok(filter(state.trips.filter(t=>canRead(t)&&(!url.searchParams.has('or')||t.owner_id===owner||state.members.some(m=>m.trip_id===t.id&&m.user_id===owner)))));
  if(path.endsWith('/atlas_save_trip')) {
   const old=state.trips.find(t=>t.id===body.p_id);
   if(!owner||old&&!['owner','editor'].includes(role(old)))return error('ATLAS_TRIP_FORBIDDEN');
   if((old?.revision||null)!==body.p_expected_revision)return error('ATLAS_TRIP_CONFLICT',409);
   if(old&&role(old)!=='owner'&&old.is_public!==body.p_public)return error('ATLAS_TRIP_FORBIDDEN');
   const trip={id:body.p_id,owner_id:old?.owner_id||owner,name:body.p_name,notes:body.p_notes,stops:body.p_stops,is_public:body.p_public,cover_path:body.p_cover_path,revision:randomUUID()};
   state.trips=state.trips.filter(t=>t!==old);state.trips.push(trip);return ok(trip);
  }
  if(path.endsWith('/atlas_trip_people')) {
   if(!['owner','editor','viewer'].includes(role(state.trips.find(t=>t.id===body.p_trip))))return error('ATLAS_TRIP_FORBIDDEN');
   return ok(state.members.filter(m=>m.trip_id===body.p_trip).map(m=>({...m,username:state.profiles.find(p=>p.id===m.user_id).username})));
  }
  if(path.endsWith('/atlas_invite_trip')) {
   if(role(state.trips.find(t=>t.id===body.p_trip))!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   const person=state.profiles.find(p=>p.username===body.p_username&&p.is_public&&p.id!==owner);
   if(!person)return error('ATLAS_TRIP_USER_NOT_FOUND');
   const old=state.members.find(m=>m.trip_id===body.p_trip&&m.user_id===person.id);
   if(old)old.role=body.p_role;else state.members.push({trip_id:body.p_trip,user_id:person.id,role:body.p_role,status:'invited'});return ok(null,204);
  }
  if(path.endsWith('/atlas_respond_trip_invite')) {
   const member=state.members.find(m=>m.trip_id===body.p_trip&&m.user_id===owner);if(!member)return error('ATLAS_TRIP_FORBIDDEN');
   if(body.p_accept)member.status='accepted';else state.members=state.members.filter(m=>m!==member);return ok(null,204);
  }
  if(path.endsWith('/atlas_remove_trip_member')) {
   if(role(state.trips.find(t=>t.id===body.p_trip))!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   state.members=state.members.filter(m=>!(m.trip_id===body.p_trip&&m.user_id===body.p_user));return ok(null,204);
  }
  if(path.endsWith('/atlas_delete_trip')) {
   const trip=state.trips.find(t=>t.id===body.p_trip);if(role(trip)!=='owner')return error('ATLAS_TRIP_FORBIDDEN');
   if(trip.revision!==body.p_expected_revision)return error('ATLAS_TRIP_CONFLICT',409);
   state.trips=state.trips.filter(t=>t!==trip);state.members=state.members.filter(m=>m.trip_id!==trip.id);return ok(null,204);
  }
  return route.fallback();
 });
 return state;
}
