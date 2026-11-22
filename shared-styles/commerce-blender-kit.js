// Kit modular de escaparates hecho en Blender: carga del GLB y construcción de aperturas con three.
// La colocación vive en commerce-blender-kit-assembly.js (pura). Aquí solo geometría y materiales.
// Las piezas con UV 0-1 por cara (caja, capas, rótulos, persiana, vinilos) declaran un `ss_slot` en su material;
// quien integre el kit pasa `resolverSlot(slot, colocacion) -> {esquinas, mapa}` con la celda del atlas vigente.
// Así el kit no depende de cómo se pinte o empaquete el atlas (cambia entre versiones del taller).
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {crearCatalogo,ensamblar,elegirKit,variedadKit} from './commerce-blender-kit-assembly.js';

export async function cargarKit(base='/assets/kits-escaparate/',{loader=new GLTFLoader(),fetcher=fetch}={}){
  const manifiesto=await(await fetcher(base+'kit.json')).json(),partes=new Map();
  for(const archivo of [manifiesto.archivo,manifiesto.archivo_interior].filter(Boolean)){   // fachada e interior: GLB separados
    const gltf=await loader.loadAsync(base+archivo.nombre);
    for(const nodo of gltf.scene.children){const lista=[];nodo.traverse(o=>{if(o.isMesh)lista.push({geometry:o.geometry,material:o.material});});partes.set(nodo.userData.name??nodo.name,lista);}   // GLTFLoader quita los puntos de nodo.name; el original va en userData.name
  }
  return {catalogo:crearCatalogo(manifiesto),partes};
}

// Esquinas [[u0,v0],[u1,v0],[u1,v1],[u0,v1]] (como tileUV) -> UV afín de una geometría con coordenadas 0-1.
export function remapearUV(geometry,esquinas){
  const uv=geometry.attributes.uv,out=new Float32Array(uv.count*2),[a,b,,d]=esquinas;
  for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=1-uv.getY(i);out[i*2]=a[0]+(b[0]-a[0])*u+(d[0]-a[0])*v;out[i*2+1]=a[1]+(b[1]-a[1])*u+(d[1]-a[1])*v;}
  const g=geometry.clone();g.setAttribute('uv',new T.BufferAttribute(out,2));return g;
}

// Construye un Group con una apertura completa (materiales estándar: el GLB se basta solo).
// opciones: {tintes:{1,2}, resolverSlot, cerrado}
export function construirApertura(kit,ensamble,{tintes={1:'#ffffff',2:'#e9dcc0'},resolverSlot=null,cerrado=false}={}){
  const grupo=new T.Group(),cache=new Map();
  for(const c of ensamble.colocaciones){
    const partes=kit.partes.get(c.modulo);if(!partes)throw Error('Módulo sin malla en el GLB: '+c.modulo);
    for(const p of partes){
      const nombre=p.material.name,def=kit.catalogo.materiales[nombre];let geometry=p.geometry;
      const celda=def.slot&&resolverSlot?resolverSlot(def.slot,c):null;
      if(celda?.esquinas)geometry=remapearUV(geometry,celda.esquinas);
      const clave=nombre+':'+(def.tinte?tintes[def.tinte]:'')+':'+(celda?.mapa?.uuid??''),base=cache.get(clave)??(()=>{
        const m=p.material.clone();if(def.tinte)m.color.set(tintes[def.tinte]??'#ffffff');
        if(celda?.mapa){m.map=celda.mapa;m.color.set('#ffffff');m.alphaTest=.45;}
        if(def.rol==='vidrio_escaparate')m.depthWrite=false;
        cache.set(clave,m);return m;})();
      const mat=def.rol==='luz_interior'&&cerrado?Object.assign(base.clone(),{emissiveIntensity:0}):base;
      const mesh=new T.Mesh(geometry,mat);mesh.position.set(...c.posicion);mesh.scale.set(...c.escala);mesh.rotation.y=c.giro??0;mesh.name=c.modulo;
      mesh.userData={ss_rol:def.rol,modulo:c.modulo,familia:c.familia,...(c.slot?{slot:c.slot}:{})};
      mesh.castShadow=!['vidrio_escaparate','luz_interior','vinilo'].includes(def.rol);mesh.receiveShadow=true;
      grupo.add(mesh);
    }
  }
  return grupo;
}
export {ensamblar,elegirKit,variedadKit,crearCatalogo};
