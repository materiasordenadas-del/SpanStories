export async function fetchCityGLBDirect(url,{gzipUrl=null,signal,sha256}={}) {
  const fallback=new URL(url,typeof location==='undefined'?'http://localhost/':location.href);if(sha256)fallback.searchParams.set('v',sha256.slice(0,16));
  let packed=Boolean(gzipUrl&&typeof DecompressionStream!=='undefined');
  let response=await fetch(packed?gzipUrl:fallback.href,{signal});
  if(!response.ok&&packed){response=await fetch(fallback.href,{signal});packed=false;}
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  let buffer=await response.arrayBuffer();
  const transferBytes=Number(response.headers?.get('Content-Length'))||buffer.byteLength;
  // Content-Encoding may already have decoded the body in the browser.
  const signature=new Uint8Array(buffer,0,Math.min(2,buffer.byteLength));
  if(packed&&signature[0]===0x1f&&signature[1]===0x8b)
    buffer=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  signal?.throwIfAborted();return {buffer,transferBytes};
}
