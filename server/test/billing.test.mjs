import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import Stripe from 'stripe';
import { createBilling, entitlement } from '../src/billing.mjs';
import { Repository } from '../src/repository.mjs';
import { createHandler } from '../src/http.mjs';
const alice = '10000000-0000-4000-8000-000000000001', bob = '10000000-0000-4000-8000-000000000002';
test('billing ledger, RLS, provider events and HTTP signatures', async t => {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);');
  const sql = await readFile(new URL('../../supabase/commercial-billing.sql', import.meta.url), 'utf8').catch(() => readFile(new URL('../../../supabase/commercial-billing.sql', import.meta.url),'utf8'));
  await db.exec(sql); await db.exec(sql);
  await db.query('insert into auth.users values($1),($2)',[alice,bob]);
  const pool = { query: (...a) => db.query(...a), connect: async () => ({ query: (...a) => db.query(...a), release() {} }) };
  const repo = new Repository(pool);
  await repo.saveCustomer(alice,'cus_alice'); await repo.saveCustomer(bob,'cus_bob');
  let sub = { id:'sub_1',customer:'cus_alice',status:'active',current_period_end:2000000000,items:{data:[{price:{id:'price_test'}}]},latest_invoice:{id:'in_1',status:'paid',amount_paid:100,currency:'brl'} };
  const sdk = new Stripe('sk_test_fixture');
  const stripe = { webhooks:sdk.webhooks, subscriptions:{retrieve:async()=>structuredClone(sub)},
    charges:{retrieve:async()=>({customer:'cus_alice',invoice:'in_1'})},
    customers:{create:async()=>({id:'cus_new'})}, checkout:{sessions:{create:async()=>({id:'cs_test',expires_at:2100000000,url:'https://checkout.stripe.com/c/pay/test'}),retrieve:async()=>({id:'cs_test',status:'open',url:'https://checkout.stripe.com/c/pay/test'})}},
    billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/p/test'})}} };
  const billing = createBilling({repo,stripe,priceId:'price_test',siteURL:'https://example.test/',graceDays:3});
  let n=0;
  const event = (type,object={id:'sub_1',customer:'cus_alice'}) => ({id:`evt_${++n}`,type,livemode:false,data:{object}});
  await t.test('clients cannot read ledger or self grant even with another user ID',async()=>{
    await db.exec('set role authenticated');
    for(const table of ['accounts','subscriptions','events','revocations']) await assert.rejects(db.query(`select * from atlas_commercial.${table}`),e=>e.code==='42501');
    await assert.rejects(db.query("insert into atlas_commercial.subscriptions(subscription_id,user_id,status) values('x',$1,'active')",[bob]),e=>e.code==='42501');
    await db.exec('reset role');
  });
  await t.test('active but unpaid never grants access',async()=>{
    sub.latest_invoice.status='open';await billing.webhook(event('customer.subscription.created'));
    assert.equal((await billing.plan({id:alice})).plan,'free'); sub.latest_invoice.status='paid';
  });
  await t.test('unfinished checkout is reused across time buckets and deletion blocks portal',async()=>{
    const first=await billing.checkout({id:bob}),second=await billing.checkout({id:bob});assert.deepEqual(second,first);
    await db.query('update atlas_commercial.accounts set deletion_requested_at=now() where user_id=$1',[bob]);
    await assert.rejects(billing.portal({id:bob}),/exclusão/);await assert.rejects(billing.checkout({id:bob}),/exclusão/);
    await db.query('update atlas_commercial.accounts set deletion_requested_at=null where user_id=$1',[bob]);
  });
  await t.test('paid, retry, renewal, cancel at period end, isolated accounts',async()=>{
    const e=event('invoice.paid',{subscription:'sub_1',customer:'cus_alice'});
    await billing.webhook(e); assert.deepEqual(await billing.webhook(e),{duplicate:true});
    assert.equal((await billing.plan({id:alice})).plan,'paid');assert.equal((await billing.plan({id:bob})).plan,'free');
    sub.current_period_end+=86400;sub.latest_invoice.id='in_2';sub.cancel_at_period_end=true;
    await billing.webhook(event('customer.subscription.updated'));
    const plan=await billing.plan({id:alice}); assert.equal(plan.validUntil,2000086400);assert.equal(plan.cancelAtPeriodEnd,true);
    // A delayed earlier event still fetches canonical current state.
    await billing.webhook(event('customer.subscription.created'));assert.equal((await billing.plan({id:alice})).validUntil,plan.validUntil);
    await assert.rejects(billing.checkout({id:alice}),/Já existe/);
  });
  await t.test('failure grace anchored to last paid period and no expiry extension',async()=>{
    sub.status='past_due';sub.latest_invoice.status='open';
    await billing.webhook(event('invoice.payment_failed',{subscription:'sub_1',customer:'cus_alice'}));
    const row=(await repo.subscriptions(alice))[0]; assert.equal(Number(row.grace_until),2000086400+259200);
    assert.equal(entitlement([row],2000086401).plan,'paid');assert.equal(entitlement([row],2000086400+259201).plan,'free');
    await billing.webhook(event('invoice.payment_failed',{subscription:'sub_1',customer:'cus_alice'}));
    assert.equal(Number((await repo.subscriptions(alice))[0].grace_until),Number(row.grace_until));
  });
  await t.test('refund before renewal event stays revoked after delayed invoice event',async()=>{
    await billing.webhook(event('charge.refunded',{customer:'cus_alice',invoice:'in_3',amount_refunded:1}));
    sub.status='active';sub.latest_invoice={id:'in_3',status:'paid',amount_paid:100,currency:'brl'};sub.current_period_end+=86400;
    await billing.webhook(event('invoice.paid',{subscription:'sub_1',customer:'cus_alice'}));assert.equal((await billing.plan({id:alice})).plan,'free');
  });
  await t.test('new paid period restores but cancellation and dispute revoke',async()=>{
    sub.latest_invoice.id='in_4';sub.current_period_end+=86400;await billing.webhook(event('customer.subscription.updated'));
    assert.equal((await billing.plan({id:alice})).plan,'paid');
    await billing.webhook(event('charge.refunded',{customer:'cus_alice',invoice:'in_4',amount_refunded:100}));
    assert.equal((await billing.plan({id:alice})).plan,'free');
    sub.status='canceled';await billing.webhook(event('customer.subscription.deleted'));assert.equal((await billing.plan({id:alice})).plan,'free');
  });
  await t.test('wrong mode, forged customer and transactional rollback',async()=>{
    await assert.rejects(billing.webhook({...event('invoice.paid'),livemode:true}),/Modo/);
    await assert.rejects(billing.webhook(event('customer.subscription.updated',{customer:'cus_bob',id:'sub_1'})),/outro cliente/);
    const old=repo.recordEvent;Repository.prototype.recordEvent=async()=>{throw new Error('db unavailable');};
    await assert.rejects(billing.webhook(event('charge.refunded',{customer:'cus_alice',invoice:'in_5',amount_refunded:1})),/db unavailable/);
    Repository.prototype.recordEvent=old;
    assert.equal((await db.query("select * from atlas_commercial.revocations where invoice_id='in_5'")).rows.length,0);
  });
  await t.test('HTTP accepts signed raw body, rejects forged/stale/tampered/oversized and unauthenticated requests',async()=>{
    const secret='whsec_test_fixture_only', handler=createHandler({billing,stripe,webhookSecret:secret,origins:['atlas://app'],authenticate:async token=>token==='test-alice'?{id:alice}:null});
    const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${server.address().port}`;
    try {
      const payload=JSON.stringify(event('unhandled.event'));
      const signature=sdk.webhooks.generateTestHeaderString({payload,secret});
      const send=(body=payload,sig=signature)=>fetch(`${base}/webhooks/stripe`,{method:'POST',body,headers:{'stripe-signature':sig}});
      assert.equal((await send()).status,200);assert.equal((await send(payload+' ')).status,400);
      assert.equal((await send(payload,'forged')).status,400);
      assert.equal((await send(payload,sdk.webhooks.generateTestHeaderString({payload,secret,timestamp:1}))).status,400);
      assert.equal((await send('x'.repeat(300000))).status,413);
      assert.equal((await fetch(`${base}/v1/plan`)).status,401);
      const response=await fetch(`${base}/v1/plan`,{headers:{authorization:'Bearer test-alice',origin:'atlas://app'}});
      assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),'atlas://app');
      assert.equal((await fetch(`${base}/v1/plan`,{headers:{authorization:'Bearer test-alice',origin:'https://evil.test'}})).status,403);
      assert.equal((await fetch(`${base}/v1/grant`,{method:'POST',body:'{"plan":"paid"}',headers:{authorization:'Bearer test-alice'}})).status,404);
    } finally { await new Promise(r=>server.close(r)); }
  });
  await db.close();
});
