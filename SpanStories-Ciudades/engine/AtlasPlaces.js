import * as T from './three.js';
import {CityAssets} from './CityAssets.js';
import {fetchCityGLB} from './CityTransport.js';
import {luz} from './Luz25D.js';
import {captureAtlasCommerce,adaptAtlasCommerce} from './AtlasCommerce.js';

export async function generatedZones(base,fetcher=fetch){
  const url=new URL('./Mundo/Generados/catalogo.json',base),r=await fetcher(url,{cache:'no-store'});
  if(r.status===404)return [];
  if(!r.ok)throw Error('No se pudo leer la biblioteca de lugares');
  const catalog=await r.json();if(catalog.format!=='spanstories-lugares'||catalog.version!==1||!Array.isArray(catalog.places))throw Error('Biblioteca de lugares incompatible');
  return catalog.places.map(p=>{
    if(!/^atlas-[a-z0-9-]+$/.test(p.id)||!new RegExp('^'+p.id+'/revisiones/[a-z0-9-]+/zona\\.json$').test(p.manifest))throw Error('Ruta de lugar inválida');
    const params=new URL(base).searchParams,revision=params.get('revision');
    if(params.get('zone')===p.id&&revision){if(!/^[a-z0-9-]+$/.test(revision)||!p.history?.some(h=>h.revision===revision))throw Error('Versión de lugar desconocida');p={...p,manifest:p.id+'/revisiones/'+revision+'/zona.json'};}
    return {...p,atlas:true,countryId:'generados',cityId:'atlas',countryLabel:'Generador',cityLabel:'Lugares',manifestUrl:new URL(p.manifest,url).href,lexiconUrl:null};
  });
}
export function atlasGround(g,x,z){
  const n=g.n,fx=Math.min(n-1,Math.max(0,(x/g.width+.5)*(n-1))),fz=Math.min(n-1,Math.max(0,(z/g.depth+.5)*(n-1))),i=Math.min(n-2,Math.floor(fx)),j=Math.min(n-2,Math.floor(fz)),u=fx-i,v=fz-j,h=g.h;
  return (h[j*n+i]*(1-u)+h[j*n+i+1]*u)*(1-v)+(h[(j+1)*n+i]*(1-u)+h[(j+1)*n+i+1]*u)*v;
}
export function atlasEntity(hit,entities){
  for(let o=hit?.object;o;o=o.parent){if(o.userData.ignorarSeleccion)return null;}
  for(let o=hit?.object;o;o=o.parent){if(o.userData.entityId)return o.userData.entityId;if(hit.instanceId!=null&&o.userData.instanceEntityIds)return entities[o.userData.instanceEntityIds[hit.instanceId]]??null;}
  const a=hit?.object.geometry?.getAttribute('_entity_id')??hit?.object.geometry?.getAttribute('__entity_id');
  return a&&hit.face?entities[Math.round(a.getX(hit.face.a))]??null:null;
}
export function atlasInstanceColors(style,root){
  root.traverse(o=>{if(!o.isInstancedMesh||!o.instanceColor||o.userData.cityOutline)return;
    for(const material of [o.material].flat())if(!material.userData.atlasInstanceColors){
      if(material.vertexColors)style.extendMaterial(material,{vertex:shader=>shader.replace('vCityColor = vec4(color, 1.0);\n#endif','vCityColor = vec4(color, 1.0);\n#endif\n#ifdef USE_INSTANCING_COLOR\nvCityColor.rgb *= instanceColor;\n#endif')});
      else style.extendMaterial(material,{vertex:shader=>'varying vec3 vAtlasInstanceColor;\n'+shader.replace('void main() {','void main() {\nvAtlasInstanceColor=vec3(1.0);\n#ifdef USE_INSTANCING_COLOR\nvAtlasInstanceColor=instanceColor;\n#endif'),fragment:shader=>'varying vec3 vAtlasInstanceColor;\n'+shader.replace('vec3 N = normalize(vNor);','albedo *= vAtlasInstanceColor;\nvec3 N = normalize(vNor);')});material.userData.atlasInstanceColors=true;
    }
  });
}
export function atlasInstanceOutlines(root){
  const meshes=[];root.traverse(o=>{if(o.isInstancedMesh&&!o.userData.cityOutline)meshes.push(o);});
  for(const mesh of meshes)for(const shell of mesh.children.filter(c=>c.userData.cityOutline)){
    // Un casco de Mesh suelta aparece en el origen, no en cada instancia.
    // Los recortes de hojas no admiten un casco opaco sin su máscara alfa.
    shell.removeFromParent();if(mesh.userData.atlasAlphaCutout||mesh.userData.ss_noOutline||[mesh.material].flat().some(m=>m.transparent||m.userData.ss_noOutline))continue;
    const geometry=shell.geometry.clone();geometry.setAttribute('aNivel',new T.InstancedBufferAttribute(new Float32Array(mesh.count).fill(1),1));
    const outline=new T.InstancedMesh(geometry,shell.material,mesh.count);outline.instanceMatrix=mesh.instanceMatrix;outline.name=shell.name;outline.userData={...shell.userData};outline.raycast=()=>{};mesh.add(outline);
  }
}
// Raíces semánticas independientes de los sectores: seleccionar no deshace los batches.
export function atlasBounds(root,entities){
  const boxes=new Map(),v=new T.Vector3(),matrix=new T.Matrix4();root.updateMatrixWorld(true);
  const expand=(id,p)=>{if(!id)return;if(!boxes.has(id))boxes.set(id,new T.Box3());boxes.get(id).expandByPoint(p);};
  root.traverse(o=>{
    if(!o.isMesh||o.userData.ignorarSeleccion)return;
    const p=o.geometry.getAttribute('position'),a=o.geometry.getAttribute('_entity_id')??o.geometry.getAttribute('__entity_id');
    if(o.isInstancedMesh){o.geometry.computeBoundingBox();for(let i=0;i<o.count;i++){const id=entities[o.userData.instanceEntityIds?.[i]];if(!id)continue;o.getMatrixAt(i,matrix);matrix.premultiply(o.matrixWorld);const b=o.geometry.boundingBox.clone().applyMatrix4(matrix);expand(id,b.min);expand(id,b.max);}}
    else{let id=null;for(let parent=o;parent;parent=parent.parent)if(parent.userData.entityId){id=parent.userData.entityId;break;}
      for(let i=0;i<p.count;i++)expand(id??(a?entities[Math.round(a.getX(i))]:null),v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));}
  });return boxes;
}
export class AtlasAssets extends CityAssets{
  constructor(options){super(options);this.manifest=options.manifest;this.parts=new Map();this.previousResolver=this.objetos.resolver;
    this.shopNight={value:0};this.releaseShopLight=luz.alCambiar(A=>{this.shopNight.value=A.brilloNoche??0;});
    this.objetos.resolver=(hit,index)=>{const id=atlasEntity(hit,this.manifest.entities);return id?this.objetos.entries.get(id)??null:this.previousResolver.call(this.objetos,hit,index);};
  }
  setOptimized(){this.optimized=true;}
  async prepare({record,url}){
    let preparingRoot;
    try{
      record.state='loading';const {buffer,json,binary,transferBytes}=await fetchCityGLB(url,{signal:record.controller.signal,sha256:record.sector.sha256,prepareForParse:true});
      const gltf=await this.loader.parseAsync(json||buffer,new URL('.',url).href,binary||null);record.root=gltf.scene;
      record.controller.signal.throwIfAborted();if(this.disposed)throw new DOMException('Cancelado','AbortError');
      record.entityBounds=atlasBounds(record.root,this.manifest.entities);
      const originals=new Set();record.root.traverse(o=>{if(o.isMesh){for(const m of [o.material].flat())originals.add(m);o.userData.atlasAlphaCutout=[o.material].flat().some(m=>m.alphaTest>0);if(o.name==='estructura_terreno')o.userData.ssType='terrain';}});
      preparingRoot=record.root;this.preparingRoots.add(preparingRoot);
      const commerce=captureAtlasCommerce(record.root);await this.style.adaptAsync(record.root,gltf,{signal:record.controller.signal});adaptAtlasCommerce(this.style,commerce,this.shopNight);atlasInstanceColors(this.style,record.root);atlasInstanceOutlines(record.root);for(const m of originals)m.dispose();
      record.controller.signal.throwIfAborted();this.scene.add(record.root);
      for(const [id,bounds]of record.entityBounds){
        if(!this.parts.has(id))this.parts.set(id,new Map());this.parts.get(id).set(record.sector.id,bounds);
        if(!this.objetos.obtener(id)){const proxy=new T.Group();proxy.userData.atlasBounds=new T.Box3();const item=this.manifest.objects.find(o=>o.id===id);this.objetos.registrar(proxy,{id,tipo:item?.type??'elemento',etiqueta:item?.name??id,sector:record.sector.id});}
        const box=this.objetos.obtener(id).userData.atlasBounds;box.makeEmpty();for(const b of this.parts.get(id).values())box.union(b);
      }
      this.loadedBytes+=transferBytes;record.transferBytes=transferBytes;record.state='ready';this.errors=this.errors.filter(e=>e.sector!==record.sector.id);this.onLoad(record);record.resolve(record);
    }catch(e){if(record.root){this.preparingRoots.delete(record.root);this.detach(record);this.release(record.root);record.root=null;}record.state=e.name==='AbortError'?'cancelled':'error';record.retryAt=performance.now()+1000;record.error=e.message;if(e.name!=='AbortError'){this.errors.push({sector:record.sector.id,error:e.message});this.status('No se pudo cargar el lugar: '+e.message);}record.reject(e);}
    finally{this.preparingRoots.delete(preparingRoot);}
  }
  detach(record){
    for(const id of record.entityBounds?.keys()??[]){const parts=this.parts.get(id);parts?.delete(record.sector.id);if(!parts?.size){this.objetos.retirar(id);this.parts.delete(id);}else{const box=this.objetos.obtener(id).userData.atlasBounds;box.makeEmpty();for(const b of parts.values())box.union(b);}}
    record.root?.removeFromParent();
  }
  dispose(){this.releaseShopLight?.();this.objetos.resolver=this.previousResolver;for(const id of this.parts.keys())this.objetos.retirar(id);this.parts.clear();super.dispose();}
}

export function atlasSourcePanel({host,manifest,objetos,navigation}){
  const description=document.createElement('p');description.textContent='Lugar del generador · selecciona un elemento para editar su proyecto fuente.';
  const select=document.createElement('select');select.setAttribute('aria-label','Elemento del lugar');select.add(new Option('Selecciona un elemento',''));
  for(const id of Object.values(manifest.entities))select.add(new Option(manifest.objects.find(o=>o.id===id)?.name??id,id));
  const link=document.createElement('a');link.textContent='Editar lugar en el generador';link.target='_blank';link.rel='noopener';
  const previous=objetos.onChange;const update=entry=>{previous?.(entry);select.value=entry?.id??'';const url=new URL('http://127.0.0.1:5179/');url.searchParams.set('lugar',manifest.id);if(new URLSearchParams(location.search).has('revision'))url.searchParams.set('revision',manifest.revision);if(entry)url.searchParams.set('entidad',entry.id);link.href=url.href;link.textContent=entry?'Editar selección en el generador':'Editar lugar en el generador';};
  objetos.onChange=update;select.onchange=()=>{if(select.value&&!objetos.obtener(select.value)){description.textContent='Acerca la cámara o pulsa Vista general para cargar este elemento.';return;}objetos.seleccionar(select.value||null);const b=objetos.obtener(select.value)?.userData.atlasBounds;if(b)navigation.focus(b);};
  host.append(description,select,document.createElement('br'),link);update(null);
  return ()=>{if(objetos.onChange===update)objetos.onChange=previous;};
}
