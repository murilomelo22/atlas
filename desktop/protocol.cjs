const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ORIGIN = 'atlas://app';
function localURL(value) {
  try { const url = new URL(value); return url.protocol === 'atlas:' && url.hostname === 'app' && !url.username && !url.password && !url.port; }
  catch { return false; }
}
function assetPath(root, value) {
  if (!localURL(value)) return null;
  let pathname;
  try { pathname = decodeURIComponent(new URL(value).pathname); } catch { return null; }
  if (pathname.includes('\0') || pathname.includes('\\')) return null;
  const absolute = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return absolute;
}
const policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'";
function assetHandler(root, net) {
  return async request => {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status:405 });
    const file = assetPath(root, request.url);
    if (!file) return new Response('Not found', { status:404 });
    try {
      const response = await net.fetch(pathToFileURL(file).href, { method:request.method });
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', policy);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
    } catch { return new Response('Not found', { status:404 }); }
  };
}
function externalURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
module.exports = { ORIGIN, localURL, assetPath, assetHandler, externalURL };
