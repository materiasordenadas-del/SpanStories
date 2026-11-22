// Same-origin commands, explicitly scoped to one facial workshop session.
export function webcamCommand({accion='estado',sesion}={}){
  if(!/^[\w-]{8,}$/.test(sesion||''))throw Error('Indica sesion: workshopSession de la URL del Taller facial.');
  if(!['estado','iniciar','detener'].includes(accion))throw Error('Acción webcam desconocida.');
  return new Promise((resolve,reject)=>{
    const bus=new BroadcastChannel('spanstories.webcam:'+sesion),id=crypto.randomUUID();
    const timer=setTimeout(()=>{bus.close();reject(Error('El Taller facial de esa sesión no respondió.'));},15000);
    bus.onmessage=({data})=>{if(data?.id!==id||data.type!=='RESULT')return;clearTimeout(timer);bus.close();if(data.error)reject(Error(data.error));else resolve(data.state);};
    bus.postMessage({id,type:'COMMAND',accion});
  });
}
