'use strict';
const {isIP}=require('node:net');
function normalizeIp(value) {
 if(typeof value!=='string'||!isIP(value)||value.includes('%'))return null;
 const canonical=new URL(isIP(value)===6?'http://['+value+']/':'http://'+value+'/').hostname.replace(/^\[|\]$/g,'').toLowerCase();
 const mapped=canonical.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
 if(mapped){const a=parseInt(mapped[1],16),b=parseInt(mapped[2],16);return [a>>8,a&255,b>>8,b&255].join('.');}
 return canonical;
}
function generationContext(ip,provided,now) {
 const valid=Number.isSafeInteger(provided)&&provided>0&&provided>=now-300000&&provided<=now+60000;
 return {recordedIp:normalizeIp(ip),generatedAt:valid?provided:now,
  generationTimeSource:valid?'extension':'relay-code-created',
  generationTimeStatus:provided===undefined?'not-provided':valid?'valid':'invalid-client-time'};
}
function observeRequest(req,now,{managedProxy=process.env.RENDER==='true'}={}) {
 // This is a provider-reported diagnostic, never an authorization input.
 if(managedProxy){
  const value=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  const ip=normalizeIp(value);
  if(ip)return {observedIp:ip,observedAt:now,observationSource:'render-forwarded-for'};
 }
 return {observedIp:normalizeIp(req.socket?.remoteAddress),observedAt:now,observationSource:'transport-peer'};
}
module.exports={normalizeIp,generationContext,observeRequest};
