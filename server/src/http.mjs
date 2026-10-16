export async function readBody(req, max = 256 * 1024) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw Object.assign(new Error('Pedido excede o limite.'), { status: 413 }); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export function createHandler({ billing, stripe, webhookSecret, authenticate, origins = [], extension }) {
  return async (req, res) => {
    const origin = req.headers.origin;
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
    try {
      const path = new URL(req.url, 'http://local').pathname;
      if (path === '/webhooks/stripe' && req.method === 'POST') {
        const body = await readBody(req);
        let event;
        try { event = stripe.webhooks.constructEvent(body, req.headers['stripe-signature'], webhookSecret); }
        catch { return send(400, { error: 'Assinatura de webhook inválida.' }); }
        return send(200, await billing.webhook(event));
      }
      if (origin && !origins.includes(origin)) return send(403, { error: 'Origem não autorizada.' });
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type'); return send(204, null);
      }
      const token = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) return send(401, { error: 'Entre na sua conta.' });
      const user = await authenticate(token);
      if (!user?.id) return send(401, { error: 'Sessão inválida. Entre novamente.' });
      if (path === '/v1/plan' && req.method === 'GET') return send(200, await billing.plan(user));
      if (path === '/v1/checkout' && req.method === 'POST') return send(200, await billing.checkout(user));
      if (path === '/v1/portal' && req.method === 'POST') return send(200, await billing.portal(user));
      if (extension) { const result = await extension({ path, req, user, token }); if (result) return send(result.status || 200, result.body); }
      return send(404, { error: 'Operação não encontrada.' });
    } catch (error) { return send(error.status || 503, { error: error.status && error.status < 500 ? error.message : 'Serviço temporariamente indisponível. Seus dados locais foram preservados.' }); }
  };
}
