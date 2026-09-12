'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRelay } = require('./server');

const session = 'a'.repeat(64);
const result = '26fc7682-cc11-4f45-8de7-5c0c554700ea';

async function request(server, method, body, headers = {}) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}/v1/liveness-result`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

test('relay stores a validated result and returns it to the same session only', async t => {
  const server = createRelay();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const headers = { 'x-session-id': session };
  assert.equal((await request(server, 'GET', undefined, headers)).status, 200);
  assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result: null });
  assert.equal((await request(server, 'POST', { result }, headers)).status, 200);
  assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result });
  assert.deepEqual(await (await request(server, 'GET', undefined, { 'x-session-id': 'b'.repeat(64) })).json(), { result: null });
});

test('relay rejects malformed sessions and malformed values', async t => {
  const server = createRelay();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  assert.equal((await request(server, 'POST', { result }, { 'x-session-id': 'bad' })).status, 400);
  assert.equal((await request(server, 'POST', { result: 'not-a-uuid' }, { 'x-session-id': session })).status, 400);
  assert.equal((await request(server, 'POST', { result }, { 'x-session-id': session })).status, 200);
});

test('same-link retries replace the result and delayed duplicates cannot roll it back', async t => {
  const server = createRelay();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const headers = { 'x-session-id': session };
  const retry = '6f9671bf-1cef-463f-8c23-d575f790c9ef';
  const third = '33333333-3333-4333-8333-333333333333';
  for (const [sent, expected] of [
    [result, result], [result.toUpperCase(), result],
    [retry, retry], [result, retry], [retry.toUpperCase(), retry],
    [third, third], [retry, third], [result, third]
  ]) {
    assert.equal((await request(server, 'POST', { result: sent }, headers)).status, 200);
    assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result: expected });
  }
});

test('new attempts refresh expiry but duplicate delivery does not', async t => {
  let clock = 0;
  const server = createRelay({ ttlMs: 100, now: () => clock });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const headers = { 'x-session-id': session };
  const retry = '6f9671bf-1cef-463f-8c23-d575f790c9ef';
  assert.equal((await request(server, 'POST', { result }, headers)).status, 200);
  clock = 80;
  assert.equal((await request(server, 'POST', { result: retry }, headers)).status, 200);
  clock = 120;
  assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result: retry });
  clock = 170;
  assert.equal((await request(server, 'POST', { result }, headers)).status, 200);
  assert.equal((await request(server, 'POST', { result: retry }, headers)).status, 200);
  clock = 181;
  assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result: null });
});

test('attempt history is bounded while duplicate delivery stays idempotent', async t => {
  const server = createRelay();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const headers = { 'x-session-id': session };
  const values = Array.from({ length: 65 }, (_, i) => `${i.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`);
  for (const value of values.slice(0, 64)) {
    assert.equal((await request(server, 'POST', { result: value }, headers)).status, 200);
  }
  assert.equal((await request(server, 'POST', { result: values[64] }, headers)).status, 429);
  assert.equal((await request(server, 'POST', { result: values[0] }, headers)).status, 200);
  assert.deepEqual(await (await request(server, 'GET', undefined, headers)).json(), { result: values[63] });
});

test('health check needs no session and has no cacheable state', async t => {
  const server = createRelay();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
