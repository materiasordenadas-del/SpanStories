import * as T from './three.js';

export function puntoDeSuelta({scene,camera,canvas,ground,target},event){
  const rect=canvas.getBoundingClientRect(),ray=new T.Raycaster();
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObjects(scene.children,true).find(h=>{
    for(let node=h.object;node;node=node.parent)if(!node.visible||node.userData.ignorarSeleccion||node.userData.storyActorId)return false;
    return true;
  });
  const point=hit?.point??target;
  return [point.x,ground(point.x,point.z),point.z];
}
/** Un archivo soltado se dirige al modo activo, nunca al editor que haya quedado detrás. */
export function montarImportacionArrastre({host,mode,importObjects,importCharacters,status=()=>{}}){
  const files=e=>Array.from(e.dataTransfer?.types??[]).includes('Files');
  const over=e=>{if(!files(e))return;e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=mode()?'copy':'none';};
  const drop=async e=>{
    if(!files(e))return;e.preventDefault();e.stopPropagation();
    const current=mode(),items=Array.from(e.dataTransfer.files??[]);
    if(!current){status('Espera a que el escenario esté listo y activa el modo de edición.');return;}
    if(!items.length)return;
    if(items.some(file=>!/\.glb$/i.test(file.name))){status('Solo se pueden añadir archivos .glb.');return;}
    try{if(current==='studio')await importCharacters(items,e);else await importObjects(items,e);}
    catch(error){status('No se pudo importar: '+error.message);}
  };
  host.addEventListener('dragover',over);host.addEventListener('drop',drop);
  return ()=>{host.removeEventListener('dragover',over);host.removeEventListener('drop',drop);};
}
