import { randomUUID } from 'node:crypto';
export function requireRecentLogin(user, now=Date.now()) {
 const last=Date.parse(user.last_sign_in_at);
 if(!Number.isFinite(last)||now-last>10*60000||last>now+60000)throw Object.assign(new Error('Entre novamente na mesma conta nos últimos 10 minutos antes de excluir.'),{status:403});
}
export function createPrivacy({db,repo,stripe,admin}) {
 async function requestDeletion(user,confirmation) {
  if(confirmation!=='EXCLUIR MINHA CONTA')throw Object.assign(new Error('Digite EXCLUIR MINHA CONTA para confirmar.'),{status:400});
  requireRecentLogin(user);
  if(!admin)throw Object.assign(new Error('Exclusão indisponível até a configuração do serviço. Nenhum dado foi removido.'),{status:503});
  return repo.lockUser(user.id,async tx=>{
   await tx.db.query('insert into atlas_commercial.accounts(user_id,deletion_requested_at) values($1,now()) on conflict(user_id) do update set deletion_requested_at=coalesce(atlas_commercial.accounts.deletion_requested_at,now())',[user.id]);
   await tx.db.query('insert into atlas_commercial.deletion_jobs(user_id) values($1) on conflict do nothing',[user.id]);
   const row=(await tx.db.query('select deadline from atlas_commercial.deletion_jobs where user_id=$1',[user.id])).rows[0];
   return {requested:true,deadline:row.deadline,message:'Acesso bloqueado. Remoção em processamento, prevista em até 7 dias. Backups e registros fiscais seguem a política aprovada.'};
  });
 }
 async function workOnce() {
  if(!admin)return false;
  const job=(await db.query(`update atlas_commercial.deletion_jobs set locked_until=now()+interval '5 minutes',attempts=attempts+1
    where user_id=(select user_id from atlas_commercial.deletion_jobs where next_attempt<=now() and (locked_until is null or locked_until<now()) order by requested_at for update skip locked limit 1) returning *`)).rows[0];
  if(!job)return false;
  try {
   await admin.ban(job.user_id); // prevents refresh; RLS already blocks rows even for still-valid JWTs
   if(job.stage==='billing') {
    const customer=await repo.customer(job.user_id);
    if(customer)for await(const sub of stripe.subscriptions.list({customer,status:'all',limit:100})) {
     if(!['canceled','incomplete_expired'].includes(sub.status))await stripe.subscriptions.cancel(sub.id,{}, {idempotencyKey:`delete-${job.user_id}-${sub.id}`});
    }
    await db.query("update atlas_commercial.deletion_jobs set stage='media' where user_id=$1",[job.user_id]);
   } else if(job.stage==='media') {
    const objects=(await db.query("select bucket_id,name from storage.objects where bucket_id in ('atlas-media','atlas-trip-media','atlas-avatars') and split_part(name,'/',1)=$1 limit 100",[job.user_id])).rows;
    for(const bucket of new Set(objects.map(o=>o.bucket_id)))await admin.remove(bucket,objects.filter(o=>o.bucket_id===bucket).map(o=>o.name));
    if(!objects.length)await db.query("update atlas_commercial.deletion_jobs set stage='identity' where user_id=$1",[job.user_id]);
   } else {
    // Auth delete cascades profiles, destinations, memberships and commercial PII; never delete storage rows directly.
    await admin.deleteUser(job.user_id);
    return true;
   }
   await db.query("update atlas_commercial.deletion_jobs set locked_until=null,next_attempt=now()+interval '5 seconds' where user_id=$1",[job.user_id]);
  } catch {
   await db.query("update atlas_commercial.deletion_jobs set locked_until=null,next_attempt=now()+interval '5 minutes' where user_id=$1",[job.user_id]);
   // Only an operation identifier is logged. No email, path, token or user ID.
   console.error(JSON.stringify({code:'ACCOUNT_DELETION_RETRY',operation:randomUUID()}));
  }
  return true;
 }
 async function portability(user) {
  if(await repo.deleting(user.id))throw Object.assign(new Error('Conta em exclusão.'),{status:409});
  const records={};
  for(const [table,column] of [['profiles','id'],['destinations','owner_id'],['photos','owner_id'],['wishlists','owner_id'],['trip_members','user_id'],['trip_photos','uploader_id'],['trip_publications','user_id'],['trip_saves','user_id'],['trip_join_requests','user_id']])
   records[table]=(await db.query(`select * from public.${table} where ${column}=$1`,[user.id])).rows;
  records.trips=(await db.query("select * from public.trips where owner_id=$1 or id in (select trip_id from public.trip_members where user_id=$1 and status='accepted')",[user.id])).rows;
  const objects=(await db.query("select bucket_id,name,metadata from storage.objects where bucket_id in ('atlas-media','atlas-trip-media','atlas-avatars') and split_part(name,'/',1)=$1 order by bucket_id,name",[user.id])).rows;
  const media=[];
  for(const object of objects)media.push({...object,...(admin?{url:await admin.signedURL(object.bucket_id,object.name,3600)}:{})});
  return {format:'atlas-portability',version:1,generatedAt:new Date().toISOString(),mediaLinksExpireInSeconds:3600,records,media,
   note:'Este manifesto inclui dados da nuvem e links temporários. Exporte também o backup local com arquivos incorporados; o manifesto não substitui esse backup.'};
 }
 async function moderate(user,{action,targetType,targetId,reason,blockedId}) {
  if(targetType==='profile' && !/^[a-f0-9-]{36}$/i.test(targetId||'')) {
   const profile=(await db.query('select id from public.profiles where username=$1 and is_public',[targetId])).rows[0];
   if(!profile)throw Object.assign(new Error('Perfil não encontrado.'),{status:404});
   targetId=profile.id;blockedId=profile.id;
  }
  if(action==='block'||action==='unblock') {
   if(!/^[a-f0-9-]{36}$/i.test(blockedId||'')||blockedId===user.id)throw Object.assign(new Error('Usuário inválido.'),{status:400});
   if(action==='block')await db.query('insert into atlas_commercial.blocks(blocker,blocked) values($1,$2) on conflict do nothing',[user.id,blockedId]);
   else await db.query('delete from atlas_commercial.blocks where blocker=$1 and blocked=$2',[user.id,blockedId]);
  } else if(action==='report') {
   if(!['profile','destination','trip'].includes(targetType)||typeof targetId!=='string'||!targetId.trim()||targetId.length>128||!['privacy','harassment','illegal','other'].includes(reason))throw Object.assign(new Error('Denúncia inválida.'),{status:400});
   const count=(await db.query("select count(*)::int as n from atlas_commercial.reports where reporter=$1 and created_at>now()-interval '1 day'",[user.id])).rows[0].n;
   if(count>=10)throw Object.assign(new Error('Limite diário de denúncias atingido.'),{status:429});
   await db.query('insert into atlas_commercial.reports(reporter,target_type,target_id,reason) values($1,$2,$3,$4)',[user.id,targetType,targetId,reason]);
  } else throw Object.assign(new Error('Ação inválida.'),{status:400});
  return {ok:true};
 }
 return {requestDeletion,workOnce,portability,moderate};
}
