import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {telemetryPayload} from '../src/telemetry.mjs';
import {supportMailto,diagnosticEntry,diagnosticSnapshot} from '../../src/diagnostics.js';
const require=createRequire(import.meta.url),{externalURL}=require('../../desktop/protocol.cjs');
test('diagnostics whitelist excludes personal content and mail needs separate permission',()=>{
 assert.equal(diagnosticEntry('alice@example.invalid/token/photo.jpg'),null);
 diagnosticEntry('UNHANDLED_ERROR');
 const logs=[...diagnosticSnapshot(),{code:'UNHANDLED_ERROR',email:'secret@example.invalid',token:'secret'}];
 const no=supportMailto({email:'support@example.invalid',logs});assert.ok(!decodeURIComponent(no).includes('UNHANDLED_ERROR'));
 const yes=supportMailto({email:'support@example.invalid',includeLogs:true,logs});assert.ok(decodeURIComponent(yes).includes('UNHANDLED_ERROR'));assert.ok(!decodeURIComponent(yes).includes('secret'));
 assert.equal(externalURL(yes),true);assert.equal(externalURL('mailto:support@example.invalid?bcc=evil@example.invalid'),false);assert.equal(externalURL('file:///tmp/secret'),false);
 assert.throws(()=>supportMailto({email:''}),/configurado/);
 assert.deepEqual(telemetryPayload({event:'app_open',version:'0.1.2'}),{event:'app_open',version:'0.1.2'});
 assert.throws(()=>telemetryPayload({event:'app_open',version:'0.1.2',email:'private'}),/inválido/);
 assert.throws(()=>telemetryPayload({event:'anything',version:'0.1.2'}),/inválido/);
});
