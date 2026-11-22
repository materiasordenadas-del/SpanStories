import { fetchCityGLBDirect } from './CityTransportCore.js';

// Download, concatenate and decompress large bodies away from rendering/input.
// The finished ArrayBuffer is transferred, never copied back to the main thread.
// Each request owns its worker; settlement or abort always terminates it.
export async function fetchCityGLB(url,{gzipUrl=null,signal,sha256,prepareForParse=false}={}){
  const options={gzipUrl,signal,sha256};
  if(typeof Worker==='undefined')return fetchCityGLBDirect(url,options);
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    let worker,finished=false;
    const cleanup=()=>{finished=true;signal?.removeEventListener('abort',abort);worker?.terminate();};
    const abort=()=>{if(finished)return;cleanup();reject(signal.reason||new DOMException('Carga cancelada','AbortError'));};
    try{worker=new Worker(new URL('./CityTransportWorker.js',import.meta.url),{type:'module',name:'city-transfer'});}
    catch{fetchCityGLBDirect(url,options).then(resolve,reject);return;}
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage=({data})=>{if(finished)return;cleanup();if(data.ok)resolve({buffer:data.buffer,json:data.json,binary:data.binary,transferBytes:data.transferBytes});else{const error=new Error(data.message);error.name=data.name||'Error';reject(error);}};
    // Keep the direct compatible path for hosts/browsers blocking module workers.
    worker.onerror=event=>{event.preventDefault?.();if(finished)return;cleanup();fetchCityGLBDirect(url,options).then(resolve,reject);};
    const base=typeof location==='undefined'?'http://localhost/':location.href;
    try{worker.postMessage({url:new URL(url,base).href,options:{gzipUrl:gzipUrl?new URL(gzipUrl,base).href:null,sha256,prepareForParse}});}
    catch(error){cleanup();reject(error);}
  });
}
