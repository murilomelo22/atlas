import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {transcodeVideo,execute} from '../src/transcode.mjs';
test('real FFmpeg produces bounded H264 and thumbnail while preserving original synthetic media',async t=>{
 try{await execute('ffmpeg',['-version']);await execute('ffprobe',['-version']);}catch(error){if(process.env.ATLAS_REQUIRE_MEDIA_TOOLS==='true')throw error;t.skip('FFmpeg não instalado neste runner; teste deve ser executado no worker antes do deploy.');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'atlas-transcode-test-')),input=new URL('../../tests/fixtures/memory.mp4',import.meta.url),before=await readFile(input);
 try{
  const video=path.join(dir,'out.mp4'),thumb=path.join(dir,'thumb.jpg');
  const result=await transcodeVideo(input.pathname,video,thumb);assert.equal(result.width,320);assert.equal(result.height,180);assert.equal(result.duration,2);assert.ok((await readFile(thumb)).length>0);assert.deepEqual(await readFile(input),before);
  const probe=JSON.parse(await execute('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json',video]));assert.equal(probe.streams[0].codec_name,'h264');assert.ok(probe.streams[0].width<=1280&&probe.streams[0].height<=720);
  await assert.rejects(transcodeVideo('/not-a-real-file',video,thumb),/MEDIA_/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
