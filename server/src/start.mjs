import { createServer } from 'node:http';
import pg from 'pg';
import Stripe from 'stripe';
import { Repository } from './repository.mjs';
import { createBilling } from './billing.mjs';
import { createHandler } from './http.mjs';
import { createPrivacy } from './privacy.mjs';
import { createAdmin } from './admin.mjs';
import { readBody } from './http.mjs';
import { storeTelemetry } from './telemetry.mjs';
const env = process.env;
for (const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_ID'])
  if (!env[key]) throw new Error(`Configure ${key} no servidor.`);
const mode = env.BILLING_MODE || 'test';
if (!['test','live'].includes(mode) || !env.STRIPE_SECRET_KEY.startsWith(`sk_${mode}_`) || mode === 'live' && env.ALLOW_LIVE_BILLING !== 'true') throw new Error('Modo de cobrança não autorizado.');
const graceDays = Number(env.GRACE_DAYS || 3);
if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 7) throw new Error('GRACE_DAYS deve estar entre 0 e 7.');
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', maxNetworkRetries: 2, timeout: 15000 });
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5, statement_timeout: 20000 });
const repo = new Repository(pool);
const billing = createBilling({ repo, stripe, priceId: env.STRIPE_PRICE_ID, graceDays, mode, siteURL: env.PUBLIC_SITE_URL });
const authenticate = async token => {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  return r.ok ? r.json() : null;
};
const privacy=createPrivacy({db:pool,repo,stripe,admin:env.SUPABASE_SERVICE_ROLE_KEY?createAdmin({url:env.SUPABASE_URL,key:env.SUPABASE_SERVICE_ROLE_KEY}):null});
const extension=async({path,req,user})=>{
 if(await repo.deleting(user.id))throw Object.assign(new Error('Conta em exclusão.'),{status:403});
 if(path==='/v1/telemetry'&&req.method==='POST')return {body:await storeTelemetry(repo,user,JSON.parse(await readBody(req,2048)))};
 if(path==='/v1/export'&&req.method==='GET')return {body:await privacy.portability(user)};
 if(path==='/v1/account/delete'&&req.method==='POST')return {status:202,body:await privacy.requestDeletion(user,JSON.parse(await readBody(req)).confirmation)};
 if(path==='/v1/moderation'&&req.method==='POST')return {body:await privacy.moderate(user,JSON.parse(await readBody(req)))};
};
let working=false;
const worker=setInterval(async()=>{if(working)return;working=true;try{await privacy.workOnce();}catch{console.error('ACCOUNT_WORKER_UNAVAILABLE');}finally{working=false;}},5000);worker.unref();
const server = createServer(createHandler({ billing, stripe, webhookSecret: env.STRIPE_WEBHOOK_SECRET, authenticate, origins: (env.ALLOWED_ORIGINS || '').split(','),extension }));
server.requestTimeout = 30000; server.headersTimeout = 15000;
server.listen(Number(env.PORT || 8787), env.HOST || '127.0.0.1', () => console.log('Atlas commercial API iniciada; segredos e dados pessoais não são registrados.'));
process.on('SIGTERM', () => server.close(() => pool.end()));
