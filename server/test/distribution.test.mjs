import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {distributionConfig} from '../../tools/prepare-distribution.mjs';
test('release requires complete Apple credentials and matching Ed25519 trust key',()=>{
 assert.throws(()=>distributionConfig({}),/CSC_LINK/);
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const env={CSC_LINK:'fixture-only',CSC_KEY_PASSWORD:'fixture-only',APPLE_ID:'fixture@example.invalid',APPLE_APP_SPECIFIC_PASSWORD:'fixture-only',APPLE_TEAM_ID:'TESTTEAM12',APPLE_SIGNING_IDENTITY:'Developer ID Application: Fixture (TESTTEAM12)',ATLAS_UPDATE_PUBLIC_KEY:publicKey.export({type:'spki',format:'pem'}),ATLAS_UPDATE_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'}),ATLAS_UPDATE_FEED_URL:'https://example.invalid/atlas-update.json'};
 const config=distributionConfig(env);assert.equal(config.mac.hardenedRuntime,true);assert.equal(config.mac.identity,env.APPLE_SIGNING_IDENTITY);
 assert.ok(!JSON.stringify(config).includes('PRIVATE KEY'));
 assert.throws(()=>distributionConfig({...env,APPLE_SIGNING_IDENTITY:'-'}),/Developer ID/);
 assert.throws(()=>distributionConfig({...env,ATLAS_UPDATE_FEED_URL:'http://example.invalid'}),/HTTPS/);
});
