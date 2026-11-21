const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRelay}=require('./server'),Pack=require('./session-package');
async function setup(t){let now=Date.now();const server=createRelay({now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const origin='http://127.0.0.1:'+server.address().port;
 return {now:()=>now,advance:ms=>now+=ms,origin,call:async(path,body,client)=>{const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(client?{'x-client-id':client}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}};
}
async function make(now,country='portugal'){
 const token=Buffer.from([crypto.randomUUID(),crypto.randomUUID(),'192.0.2.40',country].join(',')).toString('base64');
 const headerContext={version:1,capturedAt:now,ipAddress:'192.0.2.40',UserAgent:'Fixture/157',BrowserData:'"Chromium";v="157"',Platform:'"Windows"',isMobile:'?0',userUrl:'https://'+(country==='portugal'?'morocco.blsportugal.com':'www.blsspainmorocco.net')+'/MAR/Appointment/Liveness?fixture=1'};
 const sessionPackage=Pack.make(token,headerContext);return {token,headerContext,sessionPackage,packageFingerprint:await Pack.fingerprint(sessionPackage)};
}
function claimBody(transfer){const parsed=Pack.parseLink(transfer.url);assert(parsed);return {accessKey:parsed.accessKey,packageFingerprint:parsed.fingerprint};}
test('full package link: immutable snapshot, exact fingerprint, same-device retry and PIN compatibility',async t=>{
 const f=await setup(t),client=crypto.randomUUID();
 for(const country of ['portugal','spain']){
  const data=await make(f.now(),country),created=await f.call('/create',data);assert.equal(created.status,200);assert(created.body.transfer);
  const again=await f.call('/create',data);assert.deepEqual(again.body.transfer,created.body.transfer);
  const claim=claimBody(created.body.transfer),received=await f.call('/session/claim',claim,client);assert.equal(received.status,200);assert.deepEqual(received.body.sessionPackage,data.sessionPackage);assert.equal(await Pack.fingerprint(received.body.sessionPackage),data.packageFingerprint);
  assert.equal((await f.call('/session/claim',claim,client)).status,200);
  assert.equal((await f.call('/pincheck',{pin:created.body.pin},client)).status,200);
  assert.equal((await f.call('/session/claim',claim,crypto.randomUUID())).status,404);
  assert.equal((await f.call('/pincheck',{pin:created.body.pin},crypto.randomUUID())).status,404);
  const result=crypto.randomUUID();assert.equal((await f.call('/update',{token:data.token,livenessValue:result})).status,200);assert.equal((await f.call('/check',{token:data.token})).body.LivenessId,result);
 }
});
test('mismatched fingerprint does not claim; expired link and PIN unavailable',async t=>{
 const f=await setup(t),data=await make(f.now()),created=await f.call('/create',data),body=claimBody(created.body.transfer);
 assert.equal((await f.call('/session/claim',{...body,packageFingerprint:'0'.repeat(64)},crypto.randomUUID())).status,400);
 assert.equal((await f.call('/session/claim',body,crypto.randomUUID())).status,200);
 f.advance(900001);assert.equal((await f.call('/session/claim',body,crypto.randomUUID())).status,404);assert.equal((await f.call('/pincheck',{pin:created.body.pin},crypto.randomUUID())).status,404);
});
test('invalid, extra, mismatched and modified package fields rejected',async t=>{
 const f=await setup(t);
 for(const change of [p=>p.camera.lang='fr',p=>p.ipAddress='198.51.100.1',p=>p.sourceUrl+='&other=1',p=>p.cookies='not-transported',p=>p.headerContext.Platform='Windows']){
  const data=await make(f.now());change(data.sessionPackage);data.packageFingerprint=await Pack.fingerprint(data.sessionPackage);assert.equal((await f.call('/create',data)).status,400);
 }
 const data=await make(f.now());data.packageFingerprint='0'.repeat(64);assert.equal((await f.call('/create',data)).status,400);
});
test('concurrent claims bind one device; fetching landing page never claims',async t=>{
 const f=await setup(t),data=await make(f.now()),created=await f.call('/create',data),body=claimBody(created.body.transfer);
 const page=await fetch(f.origin+'/session');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');assert(!(await page.text()).includes(body.accessKey));
 const claims=await Promise.all([crypto.randomUUID(),crypto.randomUUID()].map(c=>f.call('/session/claim',body,c)));assert.deepEqual(claims.map(r=>r.status).sort(),[200,404]);
});
test('link parser rejects foreign origins, userinfo, queries, missing hash and malformed keys',()=>{
 const good=Pack.origin+'/session#s='+'a'.repeat(43)+'&h='+'b'.repeat(64);assert(Pack.parseLink(good));
 for(const link of [good.replace('bls-liveness-relay.onrender.com','example.com'),good.replace('/session#','/session?x=1#'),good.replace('https://','http://'),good.replace('https://','https://attacker@'),good.replace('#s=','#x='),good.slice(0,-1),good.split('#')[0]])assert.equal(Pack.parseLink(link),null);
});
test('unknown links and missing device rejected; v4 health advertised',async t=>{
 const f=await setup(t),body={accessKey:'a'.repeat(43),packageFingerprint:'b'.repeat(64)};
 assert.equal((await f.call('/session/claim',body)).status,400);assert.equal((await f.call('/session/claim',body,crypto.randomUUID())).status,404);
 assert.equal((await (await fetch(f.origin+'/v4/health')).json()).protocol,4);
});
