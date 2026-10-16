const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRelay } = require('./server');
const token = country => Buffer.from([crypto.randomUUID(),crypto.randomUUID(),'192.0.2.1',country].join(',')).toString('base64');
const client = crypto.randomUUID();
async function setup(t, options) {
  const server = createRelay(options); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>server.close());
  return async (path,body,headers={}) => {
    const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  };
}
test('both countries: create, claim, result, check and shared relay',async t=>{
  const call=await setup(t);
  for(const country of ['spain','portugal']){
    const value=token(country),created=await call('/create',{token:value});
    assert.equal(created.status,200);assert.match(created.body.pin,/^\d{4}$/);
    const again=await call('/create',{token:value});assert.equal(again.body.pin,created.body.pin);
    const claim=await call('/pincheck',{pin:created.body.pin},{'x-client-id':client});
    assert.equal(claim.body.token,value);assert.equal(claim.body.country,country);
    assert.equal((await call('/pincheck',{pin:created.body.pin},{'x-client-id':crypto.randomUUID()})).status,404);
    assert.equal((await call('/pincheck',{pin:created.body.pin},{'x-client-id':client})).status,200);
    const id=crypto.randomUUID();assert.equal((await call('/update',{token:value,livenessValue:id})).status,200);
    assert.equal((await call('/check',{token:value})).body.LivenessId,id);
    const session=crypto.createHash('sha256').update(value).digest('hex');
    assert.equal((await call('/v1/liveness-result',undefined,{'x-session-id':session})).body.result,id);
  }
});
test('invalid tokens, malformed codes, expired sessions and client requirements',async t=>{
  let now=0;const call=await setup(t,{ttlMs:100,now:()=>now});
  for(const value of ['bad',null,Buffer.from('x,y,192.0.2.1,portugal').toString('base64')])assert.equal((await call('/create',{token:value})).status,400);
  const value=token('portugal');const {body}=await call('/create',{token:value});
  assert.equal((await call('/pincheck',{pin:body.pin})).status,400);
  assert.equal((await call('/update',{token:value,livenessValue:'fake'})).status,400);
  now=101;
  assert.equal((await call('/pincheck',{pin:body.pin},{'x-client-id':client})).status,404);
  assert.equal((await call('/check',{token:value})).status,404);
});
test('concurrent session creation reserves unique four-digit codes',async t=>{
  const call=await setup(t);
  const replies=await Promise.all(Array.from({length:100},()=>call('/create',{token:token('spain')})));
  assert(replies.every(r=>r.status===200));assert.equal(new Set(replies.map(r=>r.body.pin)).size,100);
});
test('short-code lookups are rate limited',async t=>{
  const call=await setup(t);let last;
  for(let n=0;n<31;n++)last=await call('/pincheck',{pin:'0000'},{'x-client-id':client});
  assert.equal(last.status,429);
});
test('capability endpoint identifies the new protocol',async t=>{
  const call=await setup(t);assert.equal((await call('/v2/health')).body.protocol,2);
});
