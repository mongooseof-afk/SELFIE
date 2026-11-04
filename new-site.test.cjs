const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRelay}=require('./server');
const {ADAPTER,RESULT_ENDPOINT}=require('./session-schema');
function config(now=Date.now()) {return {v:1,sessionToken:'fixture-sdk-token-'+crypto.randomUUID(),transactionId:crypto.randomUUID(),webAdapterUrl:ADAPTER,
  appointmentId:123,issuedAt:now,resultChannel:{endpoint:RESULT_ENDPOINT,sessionId:crypto.randomBytes(32).toString('hex')}};}
async function setup(t,options) {
 const server=createRelay(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 return async(path,body,headers={})=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
}
test('new session codes preserve the SDK configuration and claim one installation',async t=>{
 const call=await setup(t),configuration=config(),client=crypto.randomUUID();
 const made=await call('/v3/create',{configuration});assert.equal(made.status,200);assert.match(made.body.pin,/^\d{4}$/);
 assert.equal((await call('/v3/create',{configuration})).body.pin,made.body.pin);
 const claim=await call('/pincheck',{pin:made.body.pin},{'x-client-id':client});assert.equal(claim.body.kind,'oz-session-token');assert.equal(claim.body.country,'morocco-new');assert.deepEqual(claim.body.configuration,configuration);
 assert.equal((await call('/pincheck',{pin:made.body.pin},{'x-client-id':crypto.randomUUID()})).status,404);
 assert.equal((await call('/pincheck',{pin:made.body.pin},{'x-client-id':client})).status,200);
 const result=crypto.randomUUID();assert.equal((await call('/v1/liveness-result',{result},{'x-session-id':configuration.resultChannel.sessionId})).status,200);
 assert.equal((await call('/v1/liveness-result',undefined,{'x-session-id':configuration.resultChannel.sessionId})).body.result,result);
});
test('invalid destinations, old/future sessions and expired JWT tokens are rejected',async t=>{
 const now=1800000000000,call=await setup(t,{now:()=>now});
 const cases=[{webAdapterUrl:'https://example.com/'},{issuedAt:now-300001},{issuedAt:now+60001},{appointmentId:0},
  {resultChannel:{endpoint:'https://example.com/',sessionId:'a'.repeat(64)}},{sessionToken:'x.'+Buffer.from(JSON.stringify({exp:now/1000-1})).toString('base64url')+'.x'}];
 for(const invalid of cases)assert.equal((await call('/v3/create',{configuration:{...config(now),...invalid}})).status,400);
});
test('code lifetime respects both the SDK expiration and server TTL',async t=>{
 let now=1800000000000;const call=await setup(t,{ttlMs:60000,now:()=>now}),configuration=config(now);
 configuration.sessionToken='x.'+Buffer.from(JSON.stringify({exp:now/1000+10})).toString('base64url')+'.x';
 const made=await call('/v3/create',{configuration});assert.equal(made.body.expiresAt,now+10000);
 now+=10001;assert.equal((await call('/pincheck',{pin:made.body.pin},{'x-client-id':crypto.randomUUID()})).status,404);
});
test('new tokens larger than legacy CSV payloads remain supported',async t=>{
 const call=await setup(t),configuration=config();configuration.sessionToken='a'.repeat(24000);
 assert.equal((await call('/v3/create',{configuration})).status,200);
 assert.equal((await call('/v3/health')).body.protocol,3);assert.equal((await call('/v2/health')).body.protocol,2);
});
