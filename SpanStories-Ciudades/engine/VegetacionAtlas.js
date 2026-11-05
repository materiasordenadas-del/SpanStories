import * as T from './three.js';
import {atlasInstanceColors,atlasInstanceOutlines} from './AtlasPlaces.js';

// Catálogo de vegetación y cambio de tipos de árbol de un lugar del Atlas.
// Un tipo = sus InstancedMesh por parte (tronco, hojas). Cambiar un tipo sustituye esas mallas por las del
// destino con las mismas matrices de instancia (posición, giro y escala de cada árbol) y los mismos IDs.
export const CATALOGO_VEGETACION=Object.freeze({
  formato:'spanstories-catalogo-vegetacion',version:1,
  // Relativa a la raíz del visor: serve.py la sirve desde Generador-Mundos/public/assets/arboles/.
  url:'arboles-atlas/catalogo.json',
  maxTipos:4,
  tiposPlanta:['arbol','arbusto','palmera','seto'],
  persistencia:Object.freeze({formato:'spanstories-vegetacion-lugar',version:1,prefijo:'vegetacion:'}),
  // Variación de tono por ejemplar heredada del original, acotada para no apagar ni quemar el destino.
  tono:Object.freeze([.75,1.25]),
  corteHojas:.45,
});
const ID=/^[a-z0-9-]+$/,HEX=/^[0-9a-f]{64}$/,LEAF=/leav|leaf|hoja|sakura|follaje/i,PREFAB=/^arbol:([^:]+):(.*)$/;

export function validarCatalogoVegetacion(c){
  const fail=text=>{throw new Error('Catálogo de vegetación inválido: '+text);};
  if(c?.formato!==CATALOGO_VEGETACION.formato||c.version!==CATALOGO_VEGETACION.version)fail('formato o versión');
  if(!Number.isInteger(c.maxTiposPorLugar)||c.maxTiposPorLugar<1||c.maxTiposPorLugar>CATALOGO_VEGETACION.maxTipos)fail('máximo de tipos');
  if(!Array.isArray(c.tipos)||!c.tipos.length)fail('sin tipos');
  if(c.niveles!=null&&(typeof c.niveles!=='object'||!Object.hasOwn(c.niveles,c.nivelPorDefecto)))fail('niveles de detalle');
  const ids=new Set();
  for(const t of c.tipos){
    if(typeof t.id!=='string'||!ID.test(t.id)||ids.has(t.id))fail('id '+t.id);ids.add(t.id);
    if(typeof t.nombre!=='string'||!t.nombre.trim())fail('nombre de '+t.id);
    if(!CATALOGO_VEGETACION.tiposPlanta.includes(t.tipo))fail('tipo de '+t.id);
    if(!Array.isArray(t.alturaM)||t.alturaM.length!==2||!t.alturaM.every(Number.isFinite)||t.alturaM[0]<=0||t.alturaM[0]>t.alturaM[1])fail('altura de '+t.id);
    const visor=t.archivo?.visor;
    if(typeof visor!=='string'||!/\.glb$/.test(visor)||visor.startsWith('/')||/^[a-z]+:/i.test(visor)||visor.split('/').includes('..'))fail('ruta del visor de '+t.id);
    if(typeof t.archivo.generador!=='string'||!t.archivo.generador.startsWith('/'))fail('ruta del generador de '+t.id);
    if(!Number.isInteger(t.bytes)||t.bytes<=0||!HEX.test(t.sha256??''))fail('bytes o SHA-256 de '+t.id);
    if(!Array.isArray(t.partes)||!t.partes.length||t.partes.some(p=>!['tronco','hojas'].includes(p.rol)||!Number.isInteger(p.triangulos)))fail('partes de '+t.id);
    if(t.partes.reduce((s,p)=>s+p.triangulos,0)!==t.triangulos)fail('triángulos de '+t.id);
    if(!Array.isArray(t.texturas)||!Array.isArray(t.conjuntos)||t.conjuntos.some(s=>!c.conjuntos?.[s]))fail('texturas o conjuntos de '+t.id);
    if(t.niveles!=null){
      for(const nivel of Object.keys(c.niveles??{})){const n=t.niveles[nivel],v=n?.visor;
        if(typeof v!=='string'||!/\.glb$/.test(v)||v.startsWith('/')||v.split('/').includes('..')||!Number.isInteger(n.triangulos)||!Number.isInteger(n.bytes)||!HEX.test(n.sha256??''))fail('nivel '+nivel+' de '+t.id);}
      if(t.niveles[c.nivelPorDefecto]?.visor!==t.archivo.visor)fail('nivel por defecto de '+t.id);
    }
  }
  for(const [id,set]of Object.entries(c.conjuntos??{})){
    if(!Array.isArray(set.tipos)||!set.tipos.length||set.tipos.length>c.maxTiposPorLugar||new Set(set.tipos).size!==set.tipos.length||set.tipos.some(t=>!ids.has(t)))fail('conjunto '+id);
    for(const t of set.tipos)if(!c.tipos.find(x=>x.id===t).conjuntos.includes(id))fail('conjunto '+id+' sin reflejo en '+t);
  }
  if(!Array.isArray(c.otros)||c.otros.some(o=>o.intercambiable!==false||ids.has(o.id)))fail('lista de otros');
  return c;
}

// Cambios origen→destino. Biyectivos: dos tipos no pueden fusionarse (cada tipo conserva sus mallas por
// parte) y el resultado nunca supera el máximo de tipos del lugar.
export function validarCambios(cambios,origenes,catalogo,max=catalogo?.maxTiposPorLugar??CATALOGO_VEGETACION.maxTipos){
  if(cambios==null)return {};
  if(typeof cambios!=='object'||Array.isArray(cambios))throw new Error('Cambios de vegetación inválidos.');
  const known=new Set(catalogo.tipos.map(t=>t.id)),out={};
  for(const [origen,destino]of Object.entries(cambios)){
    if(!origenes.includes(origen))throw new Error('Tipo de árbol desconocido en este lugar: '+origen);
    if(!known.has(destino))throw new Error('Tipo de árbol fuera del catálogo: '+destino);
    if(destino!==origen)out[origen]=destino;
  }
  const finales=origenes.map(o=>out[o]??o);
  if(new Set(finales).size!==finales.length)throw new Error('Cada tipo del lugar debe ser distinto: elige un destino que no esté en uso.');
  if(finales.length>max)throw new Error('Un lugar usa como máximo '+max+' tipos de árbol.');
  return out;
}

export function prefabArbol(object){
  for(let o=object,depth=0;o&&depth<2;o=o.parent,depth++){const m=PREFAB.exec(o.userData?.prefab??'');if(m)return {especie:m[1],parte:m[2]};}
  return null;
}
// Ejemplares por especie según anclas.json (cada parte de un árbol es un ancla en la misma posición).
export function especiesDeAnclas(anclas){
  const seen=new Map();
  for(const a of anclas?.anclas??[]){if(a.tipo!=='arbol')continue;const especie=a.especie??PREFAB.exec(a.resource??'')?.[1];if(!especie)continue;seen.set(especie+'|'+(+a.x).toFixed(2)+'|'+(+a.z).toFixed(2),especie);}
  const out=new Map();for(const e of seen.values())out.set(e,(out.get(e)??0)+1);return out;
}
// Mallas originales de cada especie en una raíz de sector (las sustitutas se excluyen).
export function mallasPorEspecie(root){
  const out=new Map();
  root.traverse(o=>{if(!o.isInstancedMesh||o.userData.cityOutline||o.userData.vegetacionSustituto)return;const p=prefabArbol(o);if(!p)return;
    if(!out.has(p.especie))out.set(p.especie,[]);out.get(p.especie).push(o);});
  return out;
}
const rolDe=mesh=>mesh.userData.atlasAlphaCutout||[mesh.material].flat().some(m=>m?.alphaTest>0)?'hojas':'tronco';
const clave=(e,o)=>e[o+12].toFixed(3)+'|'+e[o+13].toFixed(3)+'|'+e[o+14].toFixed(3);

// Un ejemplar por posición: matriz de la parte de referencia, IDs de todas sus partes y tono heredado.
export function agruparArboles(meshes){
  const ref=meshes[0],index=new Map(),arboles=[];
  for(let i=0;i<ref.count;i++){index.set(clave(ref.instanceMatrix.array,i*16),i);arboles.push({matriz:new T.Matrix4().fromArray(ref.instanceMatrix.array,i*16),ids:[],porRol:{},color:null});}
  for(const mesh of meshes){const rol=rolDe(mesh),ids=mesh.userData.instanceEntityIds??[];
    for(let j=0;j<mesh.count;j++){const a=arboles[index.get(clave(mesh.instanceMatrix.array,j*16))];if(!a)continue;
      const id=ids[j];if(id!=null&&!a.ids.includes(id))a.ids.push(id);if(id!=null)a.porRol[rol]??=id;
      if(rol==='hojas'&&!a.color&&mesh.instanceColor)a.color=new T.Color().fromArray(mesh.instanceColor.array,j*3);}
  }
  const tinted=arboles.filter(a=>a.color),mean=new T.Color(0,0,0);
  for(const a of tinted){mean.r+=a.color.r/tinted.length;mean.g+=a.color.g/tinted.length;mean.b+=a.color.b/tinted.length;}
  const [lo,hi]=CATALOGO_VEGETACION.tono,clamp=(v,m)=>m>0?T.MathUtils.clamp(v/m,lo,hi):1;
  for(const a of arboles)a.tono=a.color?new T.Color(clamp(a.color.r,mean.r),clamp(a.color.g,mean.g),clamp(a.color.b,mean.b)):new T.Color(1,1,1);
  return {referencia:ref,arboles};
}
export function alturaNativa(meshes){
  const box=new T.Box3();for(const m of meshes){m.geometry.computeBoundingBox();box.union(m.geometry.boundingBox);}return box.max.y-box.min.y;
}
// Altura del destino = altura de cada ejemplar × (altura media del destino / altura media del origen).
export function factorEscala({alturaOrigen,origen,destino,alturaDestinoNativa}){
  const mid=t=>(t.alturaM[0]+t.alturaM[1])/2;
  return mid(destino)/mid(origen)*alturaOrigen/alturaDestinoNativa;
}

// Atributos cuantizados a Float32, como el generador: el exportador y el estilo esperan valores directos.
function toFloat(g){for(const [name,a]of Object.entries(g.attributes)){if(a.array instanceof Float32Array&&!a.normalized&&!a.isInterleavedBufferAttribute)continue;
  const k=name==='color'?Math.min(3,a.itemSize):a.itemSize,out=new Float32Array(a.count*k);for(let i=0;i<a.count;i++)for(let c=0;c<k;c++)out[i*k+c]=a.getComponent(i,c);g.setAttribute(name,new T.BufferAttribute(out,k));}
  const color=g.getAttribute('color');if(color?.itemSize===4){const out=new Float32Array(color.count*3);for(let i=0;i<color.count;i++){out[i*3]=color.getX(i);out[i*3+1]=color.getY(i);out[i*3+2]=color.getZ(i);}g.setAttribute('color',new T.BufferAttribute(out,3));}
  return g;}
// Plantilla de una especie desde su GLB: base en el suelo, centrada en XZ, mismas partes y material que exporta el generador.
export function plantillaEspecie(scene,entry){
  scene.updateMatrixWorld(true);const box=new T.Box3().setFromObject(scene),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2,partes=[];
  scene.traverse(o=>{
    if(!o.isMesh)return;const src=[o.material].flat()[0],hojas=Boolean(src.transparent||src.alphaTest>0||LEAF.test(src.name??''));
    const g=toFloat(o.geometry.clone());g.applyMatrix4(o.matrixWorld);g.translate(-cx,-box.min.y,-cz);
    for(const name of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(name))g.deleteAttribute(name);
    const n=g.attributes.position.count;
    if(entry.origen!=='ez-tree'||!g.attributes.color)g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(n*3).fill(1),3));
    g.setAttribute('_surface',new T.Float32BufferAttribute(new Float32Array(n).fill(hojas?2:0),1));
    const material=new T.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,map:src.map??null,alphaTest:hojas?CATALOGO_VEGETACION.corteHojas:0,side:hojas?T.DoubleSide:T.FrontSide});
    material.name='vegetacion';material.userData={ssCategory:'vegetacion',vegetacionEspecie:entry.id};
    partes.push({nombre:src.name||'parte'+partes.length,rol:hojas?'hojas':'tronco',geometry:g,material,color:src.color?.clone()??new T.Color(1,1,1)});
  });
  if(!partes.length)throw new Error('El GLB de '+entry.id+' no contiene mallas.');
  return {id:entry.id,entry,alturaNativa:box.max.y-box.min.y,partes};
}
function limites(meshes,entities,target=new Map()){
  const m=new T.Matrix4(),b=new T.Box3();
  for(const mesh of meshes){mesh.updateWorldMatrix(true,false);mesh.geometry.computeBoundingBox();const ids=mesh.userData.instanceEntityIds??[];
    for(let i=0;i<mesh.count;i++){const id=entities[ids[i]];if(!id)continue;mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);b.copy(mesh.geometry.boundingBox).applyMatrix4(m);
      if(target.has(id))target.get(id).union(b);else target.set(id,b.clone());}}
  return target;
}
function liberarSustituta(mesh){
  for(const c of [...mesh.children])if(c.userData.cityOutline){c.geometry.dispose();c.removeFromParent();}
  mesh.removeFromParent();mesh.dispose();
}

// Sustituye en una raíz de sector la especie `origen` por la plantilla dada. Devuelve los límites nuevos por ID.
export function sustituirEspecie(root,{origen,plantilla,geometria,style,entities}){
  const originales=mallasPorEspecie(root).get(origen);if(!originales?.length)return {mallas:[],limites:new Map()};
  const {referencia,arboles}=agruparArboles(originales),parent=referencia.parent,temp=new T.Group(),mallas=[];
  plantilla.partes.forEach((parte,k)=>{
    const mesh=new T.InstancedMesh(geometria[k],parte.material,arboles.length);mesh.name='prefab_arbol_vegetacion_t1';
    arboles.forEach((a,i)=>{mesh.setMatrixAt(i,a.matriz);mesh.setColorAt(i,parte.color.clone().multiply(parte.rol==='hojas'?a.tono:new T.Color(1,1,1)));});
    mesh.position.copy(referencia.position);mesh.quaternion.copy(referencia.quaternion);mesh.scale.copy(referencia.scale);
    mesh.userData={prefab:'arbol:'+plantilla.id+':'+parte.nombre,tipo:'arbol',vegetacionSustituto:origen,atlasAlphaCutout:parte.rol==='hojas',
      instanceEntityIds:arboles.map(a=>a.porRol[parte.rol]??a.ids[0])};
    mesh.castShadow=referencia.castShadow;mesh.receiveShadow=referencia.receiveShadow;mesh.frustumCulled=referencia.frustumCulled;
    mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();temp.add(mesh);mallas.push(mesh);
  });
  if(style){style.adapt(temp);atlasInstanceColors(style,temp);atlasInstanceOutlines(temp);}
  for(const mesh of mallas)parent.add(mesh);
  for(const o of originales){o.userData.vegetacionVisible??=o.visible;o.visible=false;}
  // Un ejemplar conserva todas sus identidades: las de partes que el destino no tiene apuntan al árbol entero.
  root.updateMatrixWorld(true);const porArbol=new Map(),m=new T.Matrix4(),b=new T.Box3();
  arboles.forEach((a,i)=>{const box=new T.Box3();for(const mesh of mallas){mesh.getMatrixAt(i,m);m.premultiply(mesh.matrixWorld);mesh.geometry.computeBoundingBox();box.union(b.copy(mesh.geometry.boundingBox).applyMatrix4(m));}
    for(const id of a.ids){const key=entities[id];if(!key)continue;if(porArbol.has(key))porArbol.get(key).union(box);else porArbol.set(key,box.clone());}});
  return {mallas,limites:porArbol};
}
export function restaurarEspecie(root,{origen,entities}){
  const fuera=[];root.traverse(o=>{if(o.isInstancedMesh&&o.userData.vegetacionSustituto===origen)fuera.push(o);});
  for(const mesh of fuera)liberarSustituta(mesh);
  const originales=mallasPorEspecie(root).get(origen)??[];
  for(const o of originales){o.visible=o.userData.vegetacionVisible??true;delete o.userData.vegetacionVisible;}
  return limites(originales,entities);
}

// Persistencia junto a los ajustes del editor (IndexedDB spanstories.ciudades.editor/projects), clave propia por lugar.
export function registroPersistido(zoneId,revision,cambios,detalle=null){
  const P=CATALOGO_VEGETACION.persistencia;return {formato:P.formato,version:P.version,lugar:zoneId,revision,cambios:{...cambios},detalle,actualizado:new Date().toISOString()};
}
export function leerPersistido(value,zoneId){
  const P=CATALOGO_VEGETACION.persistencia;if(value==null)return null;
  if(value.formato!==P.formato||value.version!==P.version||value.lugar!==zoneId||!value.cambios||typeof value.cambios!=='object')throw new Error('Ajuste de vegetación incompatible o de otro lugar.');
  return value;
}
export function validarDetalle(nivel,catalogo){
  if(!Object.hasOwn(catalogo.niveles??{},nivel))throw new Error('Nivel de detalle desconocido: '+nivel);return nivel;
}
// Archivo de un tipo en un nivel de detalle (uno fijo para todo el lugar).
export function archivoNivel(tipo,nivel){return tipo.niveles?.[nivel]??{visor:tipo.archivo.visor,triangulos:tipo.triangulos,bytes:tipo.bytes};}

export class VegetacionAtlas{
  constructor({zoneId,revision=null,manifestUrl,baseUrl,entities,loader,style,store=null,fetcher=globalThis.fetch?.bind(globalThis),cargarEspecie=null,
    detalleExportado=null,records=()=>[],actualizarLimites=()=>{},status=()=>{},alCambiar=()=>{}}){
    Object.assign(this,{zoneId,revision,manifestUrl,baseUrl,entities,loader,style,store,fetcher,records,actualizarLimites,status,alCambiar});
    this.cargarEspecieExterna=cargarEspecie;this.catalogo=null;this.origenes=new Map();this.cambios={};this.plantillas=new Map();this.resueltas=new Map();this.pares=new Map();
    // Nivel con el que se hornearon los árboles del lugar exportado (medio si el lugar no lo declara).
    this.detalleExportado=detalleExportado;this.detalle=detalleExportado;
    this.alturasOrigen=new Map();this.retenidos=new T.Group();this.retenidos.name='vegetacion:recursos';this.retenidos.visible=false;this.retenidos.userData.ignorarSeleccion=true;
    this.error=null;this.listo=null;this.disposed=false;
  }
  get clave(){return CATALOGO_VEGETACION.persistencia.prefijo+this.zoneId;}
  iniciar(){
    this.listo??=(async()=>{
      try{
        const r=await this.fetcher(new URL(CATALOGO_VEGETACION.url,this.baseUrl),{cache:'no-store'});if(!r.ok)throw new Error('catálogo no disponible ('+r.status+')');
        this.catalogo=validarCatalogoVegetacion(await r.json());
      }catch(e){this.error='Catálogo de vegetación: '+e.message;this.status(this.error);return false;}
      if(!Object.hasOwn(this.catalogo.niveles??{},this.detalleExportado))this.detalleExportado=this.catalogo.nivelPorDefecto??null;
      this.detalle=this.detalleExportado;
      try{const r=await this.fetcher(new URL('anclas.json',this.manifestUrl));if(r.ok)for(const [e,n]of especiesDeAnclas(await r.json()))this.origenes.set(e,n);}catch(e){console.warn(e);}
      try{const saved=leerPersistido(await this.store?.load(this.clave),this.zoneId);
        // Sin anclas, los orígenes guardados se aceptan hasta que los sectores confirmen sus especies.
        if(saved){const conocidos=this.origenes.size;if(!conocidos)for(const o of Object.keys(saved.cambios))this.origenes.set(o,0);
          this.cambios=validarCambios(Object.fromEntries(Object.entries(saved.cambios).filter(([o])=>this.origenes.has(o))),[...this.origenes.keys()],this.catalogo);
          if(saved.detalle!=null)this.detalle=validarDetalle(saved.detalle,this.catalogo);}}
      catch(e){this.status('No se pudo restaurar la vegetación guardada: '+e.message);}
      return true;
    })();
    return this.listo;
  }
  tipo(id){return this.catalogo?.tipos.find(t=>t.id===id)??null;}
  // Tipos del lugar (máximo 4): origen, ejemplares, tipo vigente y triángulos en el nivel elegido.
  tiposLugar(){return [...this.origenes].map(([origen,ejemplares])=>{const actual=this.cambios[origen]??origen,tipo=this.tipo(actual);
    return {origen,ejemplares,actual,tipo,detalle:this.detalle,triangulos:tipo?archivoNivel(tipo,this.detalle).triangulos:null};});}
  // Clave tipo@nivel que debe mostrarse en lugar del origen, o null si lo exportado ya es eso mismo.
  claveDeseada(origen,cambios=this.cambios,detalle=this.detalle){
    const actual=cambios[origen]??origen,tipo=this.tipo(actual);if(!tipo)return null;
    if(actual===origen){const exportado=this.detalleExportado;if(detalle===exportado||!detalle)return null;
      if(archivoNivel(tipo,detalle).visor===archivoNivel(tipo,exportado).visor)return null;}
    return actual+'@'+(detalle??'');
  }
  deseado(){const out={};for(const origen of this.origenes.keys()){const k=this.claveDeseada(origen);if(k)out[origen]=k;}return out;}
  async especie(key){
    if(!key.includes('@'))key+='@'+(this.detalle??'');
    if(!this.plantillas.has(key))this.plantillas.set(key,(async()=>{
      const [id,nivel]=key.split('@'),entry=this.tipo(id);if(!entry)throw new Error('Tipo fuera del catálogo: '+id);
      const url=archivoNivel(entry,nivel).visor;
      const plantilla=this.cargarEspecieExterna?await this.cargarEspecieExterna(entry,nivel):plantillaEspecie((await this.loader.loadAsync(new URL(url,this.baseUrl).href)).scene,entry);
      plantilla.clave=key;plantilla.nivel=nivel;
      // Retener material y textura: liberar un sector no debe cerrar la imagen que usan los demás.
      for(const p of plantilla.partes){const holder=new T.Mesh(p.geometry,p.material);holder.raycast=()=>{};holder.userData.ignorarSeleccion=true;this.retenidos.add(holder);}
      this.resueltas.set(key,plantilla);return plantilla;
    })().catch(e=>{this.plantillas.delete(key);throw e;}));
    return this.plantillas.get(key);
  }
  geometriaPar(origen,plantilla){
    const key=origen+'>'+plantilla.clave;
    if(!this.pares.has(key)){
      const f=factorEscala({alturaOrigen:this.alturasOrigen.get(origen),origen:this.tipo(origen)??{alturaM:plantilla.entry.alturaM},destino:plantilla.entry,alturaDestinoNativa:plantilla.alturaNativa});
      const geometria=plantilla.partes.map(p=>{const g=p.geometry.clone().scale(f,f,f);g.computeBoundingBox();g.computeBoundingSphere();return g;});
      const holders=geometria.map((g,k)=>{const h=new T.Mesh(g,plantilla.partes[k].material);h.raycast=()=>{};this.retenidos.add(h);return h;});
      this.pares.set(key,{geometria,holders,factor:f});
    }
    return this.pares.get(key).geometria;
  }
  // Aplica a un sector el estado deseado. Idempotente: compara lo aplicado con lo pedido.
  async sincronizar(record){
    if(!await this.iniciar())return null;
    for(;;){
      if(record.root)for(const [e,meshes]of mallasPorEspecie(record.root)){if(!this.origenes.has(e))this.origenes.set(e,meshes[0].count);if(!this.alturasOrigen.has(e))this.alturasOrigen.set(e,alturaNativa(meshes));}
      const deseado=this.deseado();
      await Promise.all(Object.values(deseado).map(k=>this.especie(k)));
      if(this.disposed||!record.root||record.controller?.signal.aborted)return null;
      if(JSON.stringify(deseado)===JSON.stringify(this.deseado()))return this.aplicar(record,deseado);
    }
  }
  aplicar(record,deseado){
    const aplicado=record.vegetacion??={},nuevos=new Map();
    for(const origen of new Set([...Object.keys(aplicado),...Object.keys(deseado)])){
      if(aplicado[origen]===deseado[origen])continue;
      if(aplicado[origen]){for(const [id,b]of restaurarEspecie(record.root,{origen,entities:this.entities}))nuevos.set(id,b);delete aplicado[origen];}
      const plantilla=this.resueltas.get(deseado[origen]);
      if(plantilla&&this.alturasOrigen.has(origen)){
        const {limites:boxes}=sustituirEspecie(record.root,{origen,plantilla,geometria:this.geometriaPar(origen,plantilla),style:this.style,entities:this.entities});
        for(const [id,b]of boxes)nuevos.set(id,b);aplicado[origen]=deseado[origen];
      }
    }
    if(nuevos.size)this.actualizarLimites(record,nuevos);
    return nuevos;
  }
  async aplicarTodo(){await Promise.all(this.records().map(r=>this.sincronizar(r)));await this.guardar();this.alCambiar(this.tiposLugar());return this.tiposLugar();}
  // Cambia un tipo del lugar en todos los sectores cargados y lo guarda. destino=origen restablece.
  async cambiar(origen,destino){
    if(!await this.iniciar())throw new Error(this.error);
    const siguiente=validarCambios({...this.cambios,[origen]:destino},[...this.origenes.keys()],this.catalogo);
    const k=this.claveDeseada(origen,siguiente);if(k)await this.especie(k);this.cambios=siguiente;
    return this.aplicarTodo();
  }
  // Nivel de detalle único para todo el lugar (no depende de la distancia).
  async cambiarDetalle(nivel){
    if(!await this.iniciar())throw new Error(this.error);
    validarDetalle(nivel,this.catalogo);
    await Promise.all([...this.origenes.keys()].map(o=>this.claveDeseada(o,this.cambios,nivel)).filter(Boolean).map(k=>this.especie(k)));
    this.detalle=nivel;return this.aplicarTodo();
  }
  async restablecer(){
    if(!await this.iniciar())throw new Error(this.error);
    this.cambios={};this.detalle=this.detalleExportado;return this.aplicarTodo();
  }
  async guardar(){if(this.store)await this.store.save(this.clave,registroPersistido(this.zoneId,this.revision,this.cambios,this.detalle));}
  retainedRoots(){return [this.retenidos];}
  snapshot(){return {cambios:{...this.cambios},detalle:this.detalle,detalleExportado:this.detalleExportado,tipos:this.tiposLugar().map(t=>({origen:t.origen,actual:t.actual,ejemplares:t.ejemplares,triangulos:t.triangulos})),plantillas:[...this.resueltas.keys()],geometrias:this.pares.size};}
  dispose(){this.disposed=true;this.retenidos.removeFromParent();for(const {geometria}of this.pares.values())for(const g of geometria)g.dispose();this.pares.clear();}
}
