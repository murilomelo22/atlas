import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {transcodeVideo} from './transcode.mjs';
export function mediaWorker({db,storage,transcode=transcodeVideo}) {
 return async function once() {
  const job=(await db.query(`update atlas_commercial.media_jobs set status='processing',attempts=attempts+1,locked_until=now()+interval '5 minutes'
   where (bucket,path)=(select bucket,path from atlas_commercial.media_jobs where attempts<3 and (status='pending' or status='processing' and locked_until<now()) order by attempts for update skip locked limit 1) returning *`)).rows[0];
  if(!job)return false;
  let temp;
  try {
   if((await db.query('select 1 from atlas_commercial.accounts where user_id=$1 and deletion_requested_at is not null',[job.owner_id])).rows.length)throw new Error('ACCOUNT_DELETING');
   temp=await mkdtemp(path.join(tmpdir(),'atlas-transcode-'));
   const input=path.join(temp,'source.bin'),output=path.join(temp,'compressed.mp4'),thumb=path.join(temp,'thumbnail.jpg');
   const bytes=await storage.download(job.bucket,job.path);if(bytes.length>50*1024*1024)throw new Error('MEDIA_FILE_LIMIT');await writeFile(input,bytes);
   const result=await transcode(input,output,thumb),base=`${job.owner_id}/_derived/${createHash('sha256').update(`${job.bucket}/${job.path}`).digest('hex')}`;
   await storage.upload(job.bucket,`${base}.jpg`,await readFile(thumb),'image/jpeg');
   if(result.useCompressed)await storage.upload(job.bucket,`${base}.mp4`,await readFile(output),'video/mp4');
   await db.query("update atlas_commercial.media_jobs set status='ready',locked_until=null,compressed_path=$3,thumbnail_path=$4 where bucket=$1 and path=$2",[job.bucket,job.path,result.useCompressed?`${base}.mp4`:null,`${base}.jpg`]);
  } catch {
   await db.query("update atlas_commercial.media_jobs set status=case when attempts>=3 then 'failed' else 'pending' end,locked_until=null where bucket=$1 and path=$2",[job.bucket,job.path]);
  } finally {if(temp)await rm(temp,{recursive:true,force:true});}
  return true;
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const {default:pg}=await import('pg'),env=process.env;
 for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'])if(!env[key])throw new Error(`Configure ${key} apenas no worker.`);
 if(env.ALLOW_MEDIA_PROCESSING!=='true')throw new Error('Habilite o worker somente após configurar limites de CPU/memória.');
 const db=new pg.Pool({connectionString:env.DATABASE_URL,max:1}),headers={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`};
 const url=(bucket,key)=>`${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
 const storage={
  download:async(bucket,key)=>{const r=await fetch(url(bucket,key),{headers,signal:AbortSignal.timeout(30000)});if(!r.ok||Number(r.headers.get('content-length'))>50*1024*1024)throw new Error('MEDIA_DOWNLOAD_FAILED');return Buffer.from(await r.arrayBuffer());},
  upload:async(bucket,key,body,type)=>{const r=await fetch(url(bucket,key),{method:'POST',headers:{...headers,'Content-Type':type,'x-upsert':'false'},body,signal:AbortSignal.timeout(30000)});if(!r.ok&&r.status!==409)throw new Error('MEDIA_UPLOAD_FAILED');},
 };
 const once=mediaWorker({db,storage});let running=false;
 setInterval(async()=>{if(running)return;running=true;try{await once();}catch{console.error('MEDIA_WORKER_UNAVAILABLE');}finally{running=false;}},5000);
}
