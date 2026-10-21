import * as T from '../engine/three.js';
import { aplicarDetalle } from '../engine/Detalle.js';

export function limitesFisicos(root){
  root.updateWorldMatrix(true,true);const bounds=new T.Box3();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.userData.ignorarSeleccion||mesh.material?.name==='contorno')return;
    for(let p=mesh;p&&p!==root;p=p.parent)if(!p.visible)return;
    mesh.geometry.computeBoundingBox();bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
  });return bounds;
}

// Ejecutar en ?dev: auditarHotel(window.__escena). El listado no incluye sombras ni cascos.
export async function auditarHotel(engine){
  const furniture=new Set(['escalera','columna','sofa','butaca','silla','mesa','recepcion','conserjeria','barra','buffet','cama','mesita','escritorio','minibar','lavamanos','sanitario','planta','palmera','fuente','guardaequipajes','taburete','piano','mesa-tactil','kiosco','totem']);
  const result={areas:[],solapamientos:[],mueblesContraMuros:[],palmerasInteriores:[],sinIdentidad:[],lod3:[],pasosBloqueados:[]};
  // Las vistas con `area` (circulación, galería) son cámaras del lobby: no se auditan dos veces.
  for(const id of Object.keys(engine.world.ZONAS).filter(z=>!engine.world.ZONAS[z].area)){
    const group=await engine.world.build(id);aplicarDetalle(group,2,engine.camera);
    const roots=group.children.filter(r=>r.userData.id),items=roots.filter(r=>furniture.has(r.userData.tipo)).map(root=>({root,b:limitesFisicos(root)}));
    result.areas.push({id,objetos:roots.length});
    for(const root of group.children)if(!root.userData.id)result.sinIdentidad.push(id+':'+root.name);
    // Interior = bajo techo: toda el área, salvo que declare su parte cubierta (`cubierta`).
    const cover=engine.world.ZONAS[id].cubierta,underRoof=b=>{const c=b.getCenter(new T.Vector3());return !cover||(c.x>=cover[0]&&c.z>=cover[1]&&c.x<=cover[2]&&c.z<=cover[3]);};
    if(!['fachada','terraza'].includes(id))for(const item of items)if(item.root.userData.tipo==='palmera'&&underRoof(item.b))result.palmerasInteriores.push(item.root.name);
    const view=new T.PerspectiveCamera();view.position.set(...engine.world.ZONAS[id].cam);
    for(const level of [0,1,2]){
      aplicarDetalle(group,level,view);for(const item of items)item.b=limitesFisicos(item.root);
      for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
        const a=items[i],b=items[j],extent=a.b.clone().intersect(b.b).getSize(new T.Vector3());
        if(extent.x>.04&&extent.y>.04&&extent.z>.04)result.solapamientos.push({zona:id,lod:level+1,a:a.root.name,b:b.root.name,penetracion:extent.toArray().map(v=>+v.toFixed(3))});
      }
      for(const wall of roots.filter(r=>r.userData.tipo==='muro'&&r.visible)){
        const inverse=wall.matrixWorld.clone().invert(),wallBox=limitesFisicos(wall).applyMatrix4(inverse);
        for(const item of items){
          const contact=item.b.clone().applyMatrix4(inverse).intersect(wallBox),extent=contact.getSize(new T.Vector3());
          if(extent.x<=.04||extent.y<=.04||extent.z<=.04)continue;
          if(wall.userData.huecos?.some(h=>contact.min.x>=h.x-h.ancho/2&&contact.max.x<=h.x+h.ancho/2&&contact.min.y>=(h.base||0)&&contact.max.y<=(h.base||0)+h.alto))continue;
          result.mueblesContraMuros.push({zona:id,lod:level+1,mueble:item.root.name,muro:wall.name,penetracion:extent.toArray().map(v=>+v.toFixed(3))});
        }
      }
    }
    result.lod3.push({id,objetosVisibles:roots.filter(r=>r.visible).length,lujo:roots.filter(r=>['lustre','alfombra','arte','baranda','balcon'].includes(r.userData.tipo)&&r.visible).map(r=>r.name)});
    const passages=id==='habitacion'?[[3.6,1.7]]:id==='lobby'?[[-17,1.7],[17,1.7],[22.3,5.9]]:[];
    const wall=engine.objetos.obtener(id+'-muro-posterior');if(wall){wall.updateWorldMatrix(true,true);for(const [x,y] of passages){const ray=new T.Raycaster(new T.Vector3(x,y,5),new T.Vector3(0,0,-1));if(ray.intersectObject(wall,true).length)result.pasosBloqueados.push(id+':'+x+':'+y);}}
  }
  result.puertasDeHabitaciones=engine.objetos.listar().filter(o=>o.id==='puerta-201').length;
  return result;
}
