export const ALLOWED_EVENTS=['app_open','backup_export','sync_success','UNHANDLED_ERROR','UNHANDLED_REJECTION'];
export function telemetryPayload(raw) {
 if(!raw||Object.keys(raw).some(k=>!['event','version'].includes(k))||!ALLOWED_EVENTS.includes(raw.event)||!/^\d+\.\d+\.\d+$/.test(raw.version||''))throw Object.assign(new Error('Relatório inválido.'),{status:400});
 return {event:raw.event,version:raw.version};
}
export async function storeTelemetry(repo,user,raw) {
 const payload=telemetryPayload(raw);
 await repo.lockUser(user.id,async tx=>{
  const usage=(await tx.db.query(`insert into atlas_commercial.telemetry_rate(user_id,day,count) values($1,current_date,1)
   on conflict(user_id,day) do update set count=atlas_commercial.telemetry_rate.count+1 returning count`,[user.id])).rows[0];
  if(usage.count>100)throw Object.assign(new Error('Limite de relatórios atingido.'),{status:429});
  await tx.db.query(`insert into atlas_commercial.telemetry_daily(day,event,version,count) values(current_date,$1,$2,1)
   on conflict(day,event,version) do update set count=atlas_commercial.telemetry_daily.count+1`,[payload.event,payload.version]);
 });
 return {received:true};
}
