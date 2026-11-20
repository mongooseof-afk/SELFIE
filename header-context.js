// Shared wire schema. Values are captured per session, never inferred from APK version.
(function(root) {
  'use strict';
  function normalize(value, ip, country, now, maxAge = 15 * 60 * 1000) {
    if (!value || value.version !== 1 || !Number.isSafeInteger(value.capturedAt) ||
        value.capturedAt > now + 60000 || value.capturedAt < now - maxAge) return null;
    const out = {version: 1, capturedAt: value.capturedAt};
    const limits = {ipAddress: 64, UserAgent: 1024, BrowserData: 1024, Platform: 100, isMobile: 2, userUrl: 4096};
    for (const [key, limit] of Object.entries(limits)) {
      if (value[key] === undefined) continue;
      if (typeof value[key] !== 'string' || !value[key] || value[key].length > limit || /[\x00-\x1f\x7f]/.test(value[key])) return null;
      out[key] = value[key];
    }
    if (out.ipAddress !== ip || !out.UserAgent || !out.userUrl) return null;
    if (out.isMobile !== undefined && !['?0','?1'].includes(out.isMobile)) return null;
    if (out.Platform !== undefined && !/^"[^"\\]{1,96}"$/.test(out.Platform)) return null;
    if (out.BrowserData !== undefined && !/^"[^"\\]+";\s*v="[0-9.]+"(?:,\s*"[^"\\]+";\s*v="[0-9.]+")*$/.test(out.BrowserData)) return null;
    try {
      const url = new URL(out.userUrl);
      const hosts = country === 'portugal' ? ['morocco.blsportugal.com'] : ['www.blsspainmorocco.net','blsspainmorocco.net'];
      if (url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password ||
          !/^\/MAR\/Appointment\/(?:liveness|livnessdata)\/?$/i.test(url.pathname)) return null;
      url.hash = ''; out.userUrl = url.href;
    } catch { return null; }
    return out;
  }
  const api = {normalize};
  if (typeof module !== 'undefined') module.exports = api;
  else root.TornadoHeaderContext = api;
})(globalThis);
