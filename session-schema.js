'use strict';
const ADAPTER = 'https://web-sdk.prod.cdn.spain.ozforensics.com/blsinternational3/';
const RESULT_ENDPOINT = 'https://bls-liveness-relay.onrender.com/v1/liveness-result';
function normalizeSession(value, now) {
  if (!value || value.v !== 1 || !Number.isSafeInteger(value.appointmentId) || value.appointmentId < 1 ||
      !Number.isSafeInteger(value.issuedAt) || value.issuedAt > now + 60000 || value.issuedAt <= now - 300000) return null;
  for (const [name, limit] of [['sessionToken',32768],['transactionId',256]]) {
    if (typeof value[name] !== 'string' || !value[name].trim() || value[name].length > limit || /[\u0000-\u001f\u007f]/.test(value[name])) return null;
  }
  if (![ADAPTER, ADAPTER.slice(0,-1)].includes(value.webAdapterUrl) ||
      value.resultChannel?.endpoint !== RESULT_ENDPOINT || !/^[a-f0-9]{64}$/.test(value.resultChannel?.sessionId || '')) return null;
  let expiresAt = Math.min(now + 300000, value.issuedAt + 300000);
  const parts = value.sessionToken.split('.');
  if (parts.length === 3) {
    try {
      const exp = JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8')).exp;
      if (Number.isSafeInteger(exp) && exp > 0) expiresAt = Math.min(expiresAt, exp * 1000);
    } catch { /* Opaque SDK tokens are also supported; Oz validates the token. */ }
  }
  if (expiresAt <= now) return null;
  return {configuration:{v:1,sessionToken:value.sessionToken,transactionId:value.transactionId,webAdapterUrl:ADAPTER,
    appointmentId:value.appointmentId,issuedAt:value.issuedAt,resultChannel:{endpoint:RESULT_ENDPOINT,sessionId:value.resultChannel.sessionId}},expiresAt};
}
module.exports = {normalizeSession,ADAPTER,RESULT_ENDPOINT};
