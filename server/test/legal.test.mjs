import {test} from 'node:test';
import assert from 'node:assert/strict';
import {legalService} from '../src/legal.mjs';
test('legal acceptance is versioned, server-owned and cannot accept draft, old version or forged checkbox',async()=>{
 const ledger=new Set(),db={query:async(sql,args)=>{
  const key=args.join(':');if(sql.startsWith('insert')){ledger.add(key);return {rows:[]};}return {rows:ledger.has(key)?[{}]:[]};
 }},alice={id:'fixture-alice'},bob={id:'fixture-bob'};
 const draft=legalService({db,version:'2026-draft'});assert.equal((await draft.status(alice)).available,false);await assert.rejects(draft.accept(alice,{version:'2026-draft',accepted:true}),/aprovados/);
 const legal=legalService({db,version:'fixture-final-v1'});
 await assert.rejects(legal.requireAccepted(alice),/Revise/);
 await assert.rejects(legal.accept(alice,{version:'fixture-old',accepted:true}),/versão atual/);
 await assert.rejects(legal.accept(alice,{version:'fixture-final-v1',accepted:'true'}),/versão atual/);
 await legal.accept(alice,{version:'fixture-final-v1',accepted:true});await legal.accept(alice,{version:'fixture-final-v1',accepted:true});assert.equal(ledger.size,1);await legal.requireAccepted(alice);await assert.rejects(legal.requireAccepted(bob),/Revise/);
 const newer=legalService({db,version:'fixture-final-v2'});await assert.rejects(newer.requireAccepted(alice),/Revise/);
});
