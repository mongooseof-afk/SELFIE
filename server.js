'use strict';

const http = require('node:http');
const { createSessions } = require('./sessions');

const MAX_BODY_BYTES = 2048;
const RESULT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_RE = /^[0-9a-f]{64}$/i;
const ALLOWED_ORIGINS = new Set([
  'https://www.blsspainmorocco.net',
  'https://blsspainmorocco.net',
  'https://morocco.blsportugal.com'
]);

function createRelay({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const results = new Map();
  const sessionRoutes = createSessions({ ttlMs, now, results });

  function prune() {
    const cutoff = now() - ttlMs;
    for (const [session, item] of results) if (item.createdAt < cutoff) results.delete(session);
  }

  function send(req, res, status, body) {
    const origin = String(req.headers.origin || '');
    const allowOrigin = ALLOWED_ORIGINS.has(origin) || /^moz-extension:\/\/[a-z0-9-]+$/i.test(origin)
      ? origin
      : 'https://www.blsspainmorocco.net';
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': allowOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, x-session-id, x-client-id',
      'vary': 'Origin'
    });
    res.end(JSON.stringify(body));
  }

  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY_BYTES) {
          reject(Object.assign(new Error('Body too large.'), { status: 413 }));
          req.destroy();
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        try { resolve(JSON.parse(body || '{}')); }
        catch { reject(Object.assign(new Error('Invalid JSON.'), { status: 400 })); }
      });
      req.on('error', () => reject(Object.assign(new Error('Invalid request.'), { status: 400 })));
    });
  }

  return http.createServer(async (req, res) => {
    prune();
    if (req.method === 'GET' && req.url === '/healthz') return send(req, res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/v2/health') return send(req, res, 200, { ok: true, protocol: 2, capabilities: ['create', 'pincheck', 'update', 'check', 'liveness-result'] });
    if (req.method === 'OPTIONS') return send(req, res, 204, {});
    if (await sessionRoutes(req, res, { send, readJson })) return;
    if (req.url !== '/v1/liveness-result') return send(req, res, 404, { error: 'Not found.' });

    const session = String(req.headers['x-session-id'] || '');
    if (!SESSION_RE.test(session)) return send(req, res, 400, { error: 'Invalid session.' });

    if (req.method === 'GET') {
      const item = results.get(session);
      return send(req, res, 200, item ? { result: item.result } : { result: null });
    }
    if (req.method !== 'POST') return send(req, res, 405, { error: 'Method not allowed.' });

    try {
      const body = await readJson(req);
      const result = typeof body.result === 'string' ? body.result.trim().toLowerCase() : '';
      if (!RESULT_RE.test(result)) return send(req, res, 400, { error: 'Invalid result.' });
      const existing = results.get(session);
      // Duplicate delivery from another transport or an old tab must not
      // replace a newer retry result or extend its lifetime.
      if (existing?.seen.has(result)) return send(req, res, 200, { ok: true });
      if (existing && existing.seen.size >= 64) return send(req, res, 429, { error: 'Too many attempts for this session.' });
      const seen = existing?.seen || new Set();
      seen.add(result);
      results.set(session, { result, seen, createdAt: now() });
      return send(req, res, 200, { ok: true });
    } catch (error) {
      return send(req, res, error.status || 400, { error: error.message });
    }
  });
}

function start({ port = Number(process.env.PORT || 8787), host = process.env.HOST || '0.0.0.0' } = {}) {
  const server = createRelay();
  server.listen(port, host, () => console.log(`Liveness relay listening on http://${host}:${port}`));
  return server;
}

if (require.main === module) {
  const server = start();
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { createRelay, start, RESULT_RE, SESSION_RE };
