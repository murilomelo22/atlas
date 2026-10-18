import {spawn} from 'node:child_process';
import {stat} from 'node:fs/promises';
export function execute(binary,args,{timeout=45000}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],shell:false});let stdout='',stderr='',done=false;
  const timer=setTimeout(()=>{child.kill('SIGKILL');finish(new Error('MEDIA_TIMEOUT'));},timeout);
  const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);error?reject(error):resolve(stdout);};
  child.on('error',()=>finish(new Error('MEDIA_EXECUTABLE_UNAVAILABLE')));
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>65536){child.kill('SIGKILL');finish(new Error('MEDIA_OUTPUT_LIMIT'));}});
  child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>65536)stderr=stderr.slice(-65536);});
  child.on('close',code=>finish(code===0?null:new Error('MEDIA_PROCESSING_FAILED')));
 });
}
export async function transcodeVideo(input,output,thumbnail,{ffmpeg='ffmpeg',ffprobe='ffprobe'}={}) {
 const info=JSON.parse(await execute(ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_entries','stream=codec_type,width,height:format=duration','-of','json',input],{timeout:10000}));
 const stream=info.streams?.find(s=>s.codec_type==='video'),duration=Number(info.format?.duration),size=(await stat(input)).size;
 if(!stream||!Number.isFinite(duration)||duration<=0||duration>600||!stream.width||stream.width*stream.height>100000000||size>50*1024*1024)throw new Error('MEDIA_INVALID_LIMIT');
 await execute(ffmpeg,['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',input,'-map','0:v:0','-map','0:a:0?',
  '-vf',"scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",'-c:v','libx264','-preset','veryfast','-crf','28','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-movflags','+faststart','-map_metadata','-1','-threads','1',output]);
 await execute(ffmpeg,['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-i',input,'-frames:v','1','-vf','scale=240:240:force_original_aspect_ratio=decrease','-map_metadata','-1',thumbnail],{timeout:15000});
 const compressedBytes=(await stat(output)).size;
 return {duration,width:stream.width,height:stream.height,sourceBytes:size,compressedBytes,useCompressed:compressedBytes<size};
}
