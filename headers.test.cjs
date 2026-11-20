const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createRelay}=require('./server');
const {normalize}=require('./header-context');
const makeToken=()=>Buffer.from([crypto.randomUUID(),crypto.randomUUID(),'192.0.2.44','portugal'].join(',')).toString('base64');
const context=()=>({version:1,capturedAt:Date.now(),ipAddress:'192.0.2.44',UserAgent:'Fixture Chrome/140.0.0.0',BrowserData:'"Chromium";v="140", "Not_A Brand";v="99"',Platform:'"Windows"',isMobile:'?0',userUrl:'https://morocco.blsportugal.com/MAR/Appointment/Liveness?data=fixture'});
test('header schema rejects injection, wrong session IP/country, stale values and boolean mobile',()=>{
 const c=context();assert.deepEqual(normalize(c,c.ipAddress,'portugal',Date.now()),c);
 for(const patch of [{UserAgent:'x\r\ny'},{ipAddress:'192.0.2.9'},{version:2},{isMobile:false},{Platform:'Win32'},{capturedAt:Date.now()-3600000},{userUrl:'https://example.invalid/'},{userUrl:'https://www.blsspainmorocco.net/MAR/Appointment/Liveness'}]) assert.equal(normalize({...c,...patch},c.ipAddress,'portugal',Date.now()),null);
 assert.equal(normalize({...c,Cookie:'ignored'},c.ipAddress,'portugal',Date.now()).Cookie,undefined);
});
test('metadata survives exact PIN handoff, stays immutable, expires, and legacy sessions still work',async t=>{
 let now=Date.now();const server=createRelay({now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 async function call(path,body,client){const r=await fetch('http://127.0.0.1:'+server.address().port+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(client?{'x-client-id':client}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
 const token=makeToken(),headerContext=context(),client=crypto.randomUUID();
 const created=await call('/create',{token,headerContext});assert.equal(created.status,200);assert.equal(created.body.headerContextVersion,1);
 const claim=await call('/pincheck',{pin:created.body.pin},client);assert.equal(claim.body.token,token);assert.deepEqual(claim.body.headerContext,headerContext);
 assert.equal((await call('/pincheck',{pin:created.body.pin},crypto.randomUUID())).status,404);
 assert.equal((await call('/create',{token,headerContext:{...headerContext,UserAgent:'Changed'}})).status,409);
 assert.equal((await call('/create',{token,headerContext:{...headerContext,capturedAt:now+1}})).body.pin,created.body.pin);
 const legacy=await call('/create',{token:makeToken()});assert.equal(legacy.body.headerContextVersion,undefined);assert.equal((await call('/pincheck',{pin:legacy.body.pin},client)).body.headerContext,undefined);
 assert((await call('/v2/health')).body.capabilities.includes('session-headers-v1'));
 now+=900001;assert.equal((await call('/pincheck',{pin:created.body.pin},client)).status,404);
});
