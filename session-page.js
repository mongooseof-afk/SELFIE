'use strict';
document.getElementById('copy').onclick=async()=>{
  const status=document.getElementById('status');
  if(!/^#s=[A-Za-z0-9_-]{43}&h=[a-f0-9]{64}$/.test(location.hash)){status.textContent='Invalid link. Generate a new session on your PC.';return;}
  try{await navigator.clipboard.writeText(location.href);status.textContent='Copied. Paste it in Tornado → Open session link.';}catch{status.textContent='Copy the full link from the address bar, then paste it in Tornado.';}
};
