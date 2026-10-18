const {verify,createPublicKey,randomBytes}=require('node:crypto');
const {createServer}=require('node:http');
function verifyFeed(envelope,publicKey,currentVersion) {
 if(!envelope||typeof envelope.payload!=='string'||Buffer.byteLength(envelope.payload)>65536||typeof envelope.signature!=='string')throw new Error('Feed inválido.');
 const key=createPublicKey(publicKey);
 if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(envelope.payload),key,Buffer.from(envelope.signature,'base64')))throw new Error('Assinatura do feed inválida.');
 const manifest=JSON.parse(envelope.payload),version=/^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version||'');
 if(!version||!/^\d+\.\d+\.\d+$/.test(currentVersion))throw new Error('Versão inválida.');
 const old=currentVersion.split('.').map(Number),next=version.slice(1).map(Number);
 const newer=next[0]>old[0]||next[0]===old[0]&&(next[1]>old[1]||next[1]===old[1]&&next[2]>old[2]);
 if(!newer)throw Object.assign(new Error('Não há versão mais recente.'),{code:'ATLAS_NO_NEWER_VERSION'});
 if(!Array.isArray(manifest.files)||manifest.files.length!==1)throw new Error('Artefato universal inválido.');
 const file=manifest.files[0],url=new URL(file.url);
 if(url.protocol!=='https:'||url.username||url.password||url.hostname!=='github.com'||url.pathname!==`/murilomelo22/atlas/releases/download/desktop-v${manifest.version}/Atlas-Pessoal-${manifest.version}-universal.zip`||url.search||url.hash)throw new Error('Destino de atualização inválido.');
 if(typeof file.sha512!=='string'||Buffer.from(file.sha512,'base64').length!==64||!Number.isSafeInteger(file.size)||file.size<1||file.size>2*1024**3)throw new Error('Integridade do artefato inválida.');
 return manifest;
}
async function serveVerifiedManifest(manifest) {
 const route=`/${randomBytes(24).toString('hex')}/`,body=JSON.stringify(manifest);
 const server=createServer((req,res)=>{
  if(req.method==='GET'&&req.url===`${route}latest-mac.yml`){res.writeHead(200,{'Content-Type':'application/yaml','Cache-Control':'no-store'});res.end(body);}
  else{res.writeHead(404);res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});server.unref();
 return {url:`http://127.0.0.1:${server.address().port}${route}`,close:()=>server.close()};
}
module.exports={verifyFeed,serveVerifiedManifest};
