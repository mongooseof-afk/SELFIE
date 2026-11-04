const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {normalizeIp,generationContext,observeRequest}=require('./network-context');
const {createRelay}=require('./server');
const client=crypto.randomUUID();
test('IP parsing handles IPv4, equivalent IPv6 and mapped addresses',()=>{
 assert.equal(normalizeIp('2001:0db8:0:0:0:0:0:1'),'2001:db8::1');
 assert.equal(normalizeIp('::ffff:192.0.2.10'),'192.0.2.10');
 for(const ip of ['',null,'192.0.2.999','1.2.3','127.0.0.1:80','fe80::1%eth0'])assert.equal(normalizeIp(ip),null);
});
test('generation clock validation falls back to relay time without rejecting the session',()=>{
 const now=1700000000000;
 assert.equal(generationContext('192.0.2.10',now-5,now).generatedAt,now-5);
 for(const supplied of [undefined,NaN,'bad',now+60001,now-300001]){
  const result=generationContext('192.0.2.10',supplied,now);
  assert.equal(result.generatedAt,now);assert.equal(result.generationTimeSource,'relay-code-created');
 }
});
test('ordinary deployment ignores caller-supplied forwarded headers',()=>{
 const req={headers:{'x-forwarded-for':'192.0.2.99'},socket:{remoteAddress:'::ffff:127.0.0.1'}};
 assert.deepEqual(observeRequest(req,42,{managedProxy:false}),{observedIp:'127.0.0.1',observedAt:42,observationSource:'transport-peer'});
 assert.equal(observeRequest(req,42,{managedProxy:true}).observationSource,'render-forwarded-for');
});
test('claimed sessions retain first generation time; IP difference never changes result delivery',async t=>{
 let now=1700000000000;const server=createRelay({now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const call=async(path,body)=>{const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/json','x-client-id':client},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const token=Buffer.from([crypto.randomUUID(),crypto.randomUUID(),'192.0.2.10','portugal'].join(',')).toString('base64');
 const {body:created}=await call('/create',{token,generatedAt:now-50});now+=100;
 assert.equal((await call('/create',{token,generatedAt:now})).body.pin,created.pin);
 const claim=await call('/pincheck',{pin:created.pin});assert.equal(claim.status,200);
 assert.equal(claim.body.networkContext.generatedAt,now-150);assert.equal(claim.body.networkContext.recordedIp,'192.0.2.10');
 assert.equal(claim.body.networkContext.diagnosticOnly,true);assert.equal(claim.body.networkContext.observedIp,'127.0.0.1');
 const id=crypto.randomUUID();assert.equal((await call('/update',{token,livenessValue:id})).status,200);
 assert.equal((await call('/check',{token})).body.LivenessId,id);
});
