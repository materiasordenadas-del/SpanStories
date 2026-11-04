import * as T from './three.js';
import { optimizarObjeto } from './Optimizar.js';
import { crearMaterialToon } from './Luz25D.js';
export const DETAIL={COMPLETO:0,EQUILIBRADO:1,LIGERO:2};
export function crearLOD({completo,equilibrado,ligero}) {
  const lod=new T.LOD();lod.autoUpdate=false;
  for(const [factory,distance] of [[completo,0],[equilibrado,35],[ligero,65]])lod.addLevel(optimizarObjeto(factory()),distance);
  lod.userData.lod=true;return lod;
}
export function aplicarDetalle(root,nivel,camera=null){
  root.traverse(o=>{if(o.userData.detalleMin!==undefined)o.visible=nivel<=o.userData.detalleMin&&!o.userData.ocultoEnCorte&&!o.userData.ocultoUsuario&&!o.userData.corteVista;
    if(o.isLOD){let index=nivel;if(camera&&nivel===0){const d=camera.position.distanceTo(o.getWorldPosition(new T.Vector3()));index=d>65?2:d>35?1:0;}
      for(let i=0;i<o.levels.length;i++)o.levels[i].object.visible=i===index;o.userData.nivelActual=index;}
    if(o.userData.reflejoSuperficie)o.visible=nivel===0;
  });
}
