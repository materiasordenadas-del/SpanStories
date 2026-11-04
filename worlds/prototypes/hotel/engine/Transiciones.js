// Una única operación pendiente: los intentos repetidos no compiten con la carga.
export function crearControlTransiciones({capture,restore,lock,unlock,onError}){
  let busy=false;
  return {get ocupada(){return busy;},async ejecutar(operation){
    if(busy)return false;busy=true;let snapshot;
    try{snapshot=capture();lock();await operation();return true;}
    catch(error){if(snapshot)await restore(snapshot);onError(error);return false;}
    finally{busy=false;unlock();}
  }};
}
