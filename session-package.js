(function(root){
  'use strict';
  const origin='https://bls-liveness-relay.onrender.com';
  const camera={sdkUrl:'https://web-sdk.spain.prod.ozforensics.com/blsinternational/plugin_liveness.php?',lang:'en',overlay_options:false,action:['video_selfie_blank'],result_mode:'safe'};
  const canonical=value=>JSON.stringify(sort(value));
  function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,sort(value[k])]));return value;}
  function make(token,headerContext){
    const parts=atob(token).split(',');
    if(parts.length!==4||!['spain','portugal'].includes(parts[3]))throw new Error('Invalid session package.');
    return {schema:'tornado-session-package-v1',token,userId:parts[0],transactionId:parts[1],ipAddress:parts[2],country:parts[3],sourceUrl:headerContext.userUrl,headerContext,camera:JSON.parse(JSON.stringify(camera))};
  }
  function validate(value,normalize,now,maxAge=1800000){
    try{
      if(!value||typeof value.token!=='string'||value.token.length>1024)return null;
      const parts=atob(value.token).split(',');
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if(parts.length!==4||!uuid.test(parts[0])||!uuid.test(parts[1]))return null;
      const headers=normalize(value.headerContext,parts[2],parts[3],now,maxAge);
      if(!headers)return null;
      const expected=make(value.token,headers);
      return canonical(expected)===canonical(value)?expected:null;
    }catch{return null;}
  }
  async function fingerprint(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('tornado-session-package-v1:'+canonical(value)))),n=>n.toString(16).padStart(2,'0')).join('');}
  function parseLink(text){
    try{
      if(typeof text!=='string'||text.length>512)return null;
      const u=new URL(text.trim());
      if(u.origin!==origin||u.pathname!=='/session'||u.search||u.username||u.password)return null;
      const match=/^#s=([A-Za-z0-9_-]{43})&h=([a-f0-9]{64})$/.exec(u.hash);
      return match?{accessKey:match[1],fingerprint:match[2]}:null;
    }catch{return null;}
  }
  const api={make,validate,canonical,fingerprint,parseLink,origin};
  if(typeof module!=='undefined')module.exports=api;else root.TornadoSessionPackage=api;
})(globalThis);
