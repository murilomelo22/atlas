import {test} from 'node:test';
import assert from 'node:assert/strict';
import {costModel} from '../../tools/cost-model.mjs';
test('cost includes free users, currency and fees and rejects unsustainable denominators',()=>{
 const a=costModel(),b=costModel({freeUsers:0});assert.ok(a.minimumBRL>b.minimumBRL);
 assert.ok(costModel({storageGiB:10,egressGiB:20}).minimumBRL>a.minimumBRL);
 assert.throws(()=>costModel({margin:1}),/inválidas/);assert.throws(()=>costModel({payers:0}),/inválidas/);assert.throws(()=>costModel({fx:NaN}),/inválidas/);
 assert.equal(costModel({storageGiB:0,egressGiB:0,operations:0,fixedUSD:0,freeUsers:0,supportUSD:0,fixedFeeBRL:0}).minimumBRL,0);
});
