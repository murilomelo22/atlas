import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createRequire} from 'node:module';
import {schemaTransition} from '../../src/schema.js';
const require=createRequire(import.meta.url),{verifyFeed,serveVerifiedManifest}=require('../../desktop/signed-feed.cjs');
test('signed update feed rejects tamper, wrong key, replay, downgrade and foreign artifacts',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519').publicKey;
 const manifest={version:'0.1.2',files:[{url:'https://github.com/murilomelo22/atlas/releases/download/desktop-v0.1.2/Atlas-Pessoal-0.1.2-universal.zip',sha512:Buffer.alloc(64,1).toString('base64'),size:123}]};
 const envelope=m=>{const payload=JSON.stringify(m);return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};
 const key=publicKey.export({type:'spki',format:'pem'}),valid=envelope(manifest);
 assert.deepEqual(verifyFeed(valid,key,'0.1.1'),manifest);
 assert.throws(()=>verifyFeed({...valid,payload:valid.payload+' '},key,'0.1.1'),/Assinatura/);
 assert.throws(()=>verifyFeed(valid,other.export({type:'spki',format:'pem'}),'0.1.1'),/Assinatura/);
 assert.throws(()=>verifyFeed(valid,key,'0.1.2'),/mais recente/);assert.throws(()=>verifyFeed(valid,key,'0.2.0'),/mais recente/);
 assert.throws(()=>verifyFeed(envelope({...manifest,files:[{...manifest.files[0],url:'https://evil.test/evil-universal.zip'}]}),key,'0.1.1'),/Destino/);
 assert.throws(()=>verifyFeed(envelope({...manifest,files:[{...manifest.files[0],sha512:'invalid'}]}),key,'0.1.1'),/Integridade/);
 const local=await serveVerifiedManifest(manifest);
 try{assert.deepEqual(await(await fetch(local.url+'latest-mac.yml')).json(),manifest);assert.equal((await fetch(local.url+'../secret')).status,404);}finally{local.close();}
});
test('metadata schema supports repeat upgrade and rollback, refuses unknown future data',()=>{
 assert.equal(schemaTransition(1,2).changed,true);assert.equal(schemaTransition(2,2).changed,false);assert.equal(schemaTransition(2,1).version,1);assert.throws(()=>schemaTransition(3,2),/não suportada/);
});
