'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {createRelay}=require('./server');
test('camera status is session-bound, monotonic, optional for results and does not extend expiry',async()=>{
 let now=Date.now();const server=createRelay({now:()=>now,ttlMs:1000});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const token=()=>Buffer.from(randomUUID()+','+randomUUID()+',203.0.113.9,portugal').toString('base64');
 const post=async(route,body)=>{const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {code:r.status,...await r.json()};};
 try{
  const a=token(),b=token(),id=randomUUID();await post('/create',{token:a});await post('/create',{token:b});
  assert.equal((await post('/check',{token:a})).status,'PENDING');
  assert.equal((await post('/started',{token:token()})).code,404);
  assert.equal((await post('/started',{token:'invalid'})).code,400);
  assert.equal((await post('/started',{token:a})).status,'STARTED');
  assert.equal((await post('/check',{token:b})).status,'PENDING');
  assert.equal((await post('/started',{token:a})).status,'STARTED');
  await post('/update',{token:a,livenessValue:id});assert.equal((await post('/started',{token:a})).status,'FINISHED');
  assert.equal((await post('/check',{token:a})).LivenessId,id);
  await post('/update',{token:b,livenessValue:randomUUID()});assert.equal((await post('/check',{token:b})).status,'FINISHED');
  now+=900;await post('/started',{token:a});now+=101;assert.equal((await post('/started',{token:a})).code,404);
 }finally{await new Promise(r=>server.close(r));}
});
