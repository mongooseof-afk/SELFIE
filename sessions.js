'use strict';
const { createHash, randomInt } = require('node:crypto');
const { isIP } = require('node:net');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hash = value => createHash('sha256').update(value).digest('hex');
const CAMERA_TEST_CODES = new Set(['1010', '2008', '2027', '0101']);
function generatePin(pins, random = () => randomInt(10000)) {
  let pin;
  do { pin = String(random()).padStart(4, '0'); } while (pins.has(pin) || CAMERA_TEST_CODES.has(pin));
  return pin;
}

function decodeSession(token) {
  if (typeof token !== 'string' || token.length > 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return null;
  const parts = Buffer.from(token, 'base64').toString('utf8').split(',');
  if (parts.length < 3 || parts.length > 4 || !UUID.test(parts[0]) || !UUID.test(parts[1]) || !isIP(parts[2])) return null;
  const country = parts[3] || 'spain';
  if (!['spain', 'portugal'].includes(country)) return null;
  return { country };
}

function createSessions({ ttlMs, now, results }) {
  const sessions = new Map();
  const pins = new Map();
  const limits = new Map();
  const prune = () => {
    for (const [id, value] of sessions) if (value.expiresAt <= now()) {
      sessions.delete(id); pins.delete(value.pin);
    }
    for (const [id, value] of limits) if (value.until <= now()) limits.delete(id);
  };
  function limited(req, kind, maximum) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').at(-1).trim();
    const key = kind + ':' + ip;
    let item = limits.get(key);
    if (!item) {
      if (limits.size >= 20000) return true;
      limits.set(key, item = { count: 0, until: now() + 5 * 60 * 1000 });
    }
    return ++item.count > maximum;
  }
  return async function handle(req, res, { send, readJson }) {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!['/create', '/pincheck', '/update', '/check'].includes(path)) return false;
    prune();
    const reply = (status, body) => { send(req, res, status, body); return true; };
    if (req.method !== 'POST') return reply(405, { success: false, error: 'POST required.' });
    try {
      const body = await readJson(req);
      if (path === '/pincheck') {
        const client = String(req.headers['x-client-id'] || '');
        if (!/^[a-f0-9-]{32,36}$/i.test(client) || !/^\d{4}$/.test(body.pin || '')) {
          return reply(400, { success: false, error: 'Invalid access code or device.' });
        }
        // A short code can be claimed by one APK installation only.
        if (limited(req, 'lookup', 30)) return reply(429, { success: false, error: 'Too many code checks. Wait five minutes.' });
        const item = sessions.get(pins.get(body.pin));
        if (!item || (item.client && item.client !== client)) return reply(404, { success: false, error: 'Invalid, used or expired code.' });
        item.client = client;
        return reply(200, { success: true, token: item.token, country: item.country, expiresAt: item.expiresAt });
      }
      const token = body.token;
      const decoded = decodeSession(token);
      if (!decoded) return reply(400, { success: false, error: 'Invalid Tornado session.' });
      const id = hash(token);
      if (path === '/create') {
        let item = sessions.get(id);
        if (!item) {
          if (limited(req, 'create', 120)) return reply(429, { success: false, error: 'Too many new sessions. Wait five minutes.' });
          if (sessions.size >= 9000) return reply(503, { success: false, error: 'Code service is busy. Try later.' });
          const pin = generatePin(pins);
          item = { token, country: decoded.country, pin, client: null, expiresAt: now() + ttlMs };
          sessions.set(id, item); pins.set(pin, id);
        }
        return reply(200, { success: true, pin: item.pin, expiresAt: item.expiresAt });
      }
      const item = sessions.get(id);
      if (!item) return reply(404, { success: false, error: 'Session expired. Generate a new selfie link.' });
      if (path === '/check') return reply(200, { success: true, LivenessId: results.get(id)?.result || null });
      const result = typeof body.livenessValue === 'string' ? body.livenessValue.trim().toLowerCase() : '';
      if (!UUID.test(result)) return reply(400, { success: false, error: 'Invalid Liveness ID.' });
      const existing = results.get(id);
      if (existing?.seen.has(result)) return reply(200, { success: true });
      if (existing && existing.seen.size >= 64) return reply(429, { success: false, error: 'Too many results for this session.' });
      const seen = existing?.seen || new Set(); seen.add(result);
      results.set(id, { result, seen, createdAt: now() });
      return reply(200, { success: true });
    } catch (error) {
      return reply(error.status || 400, { success: false, error: 'Invalid request.' });
    }
  };
}
module.exports = { createSessions, decodeSession, generatePin };
