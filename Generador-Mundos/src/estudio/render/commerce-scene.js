import * as T from 'three';
import {resolveCommerces,commerceMetadata,commerceVariety} from '../data/commerces.js';
import {SHOP_CATEGORIES} from '../data/shop-categories.js';
import {commerceAtlas,tileUV,signAtlas,isReferenceCategory} from './commerce-atlas.js';
import {KIT_LAYOUTS,KIT_SIZES,kitUV} from './commerce-kit.js';
import {createGMaterial} from './gmaterial.js';
import {buildBlenderCommerceScene} from './commerce-blender-scene.js';

function builder(){const p=[],uv=[],ids=[];return {quad(points,coords,id=0){for(const i of [0,1,2,0,2,3]){p.push(...points[i]);uv.push(...coords[i]);ids.push(id);}},geometry(){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('aId',new T.Float32BufferAttribute(ids,1));g.setAttribute('color',new T.Float32BufferAttribute(new Float32Array(p.length).fill(1),3));g.setAttribute('aSurf',new T.Float32BufferAttribute(new Float32Array(ids.length),1));g.computeVertexNormals();g.computeBoundingSphere();return g;}};}
const front=(x0,y0,x1,y1,z)=>[[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]];
// Kit modular: caja con suelo, techo y laterales pintados y piezas recortadas de ancho parcial.
// El layout recompone qué módulos van y dónde; 9–10 quads por variante.
function kitPrefab(layout,mirror){
  const b=builder(),W=.47,y0=.001,H=.96,D=1,spec=KIT_LAYOUTS[layout]??KIT_LAYOUTS[0],RW=3.4/(2*W),RH=2.95/H;
  b.quad(front(-W,y0,W,H,-D),kitUV(spec.back,mirror));
  b.quad([[-W,y0,0],[W,y0,0],[W,y0,-D],[-W,y0,-D]],kitUV('floor',mirror));
  b.quad([[-W,H,-D],[W,H,-D],[W,H,0],[-W,H,0]],kitUV('ceil'));
  // Laterales: la celda está girada (u = altura, v = profundidad, arriba = fondo).
  const [[u0,v0],,[u1,v1]]=kitUV('side');
  b.quad([[-W,y0,-D],[-W,H,-D],[-W,H,0],[-W,y0,0]],[[u0,v1],[u1,v1],[u1,v0],[u0,v0]]);
  b.quad([[W,y0,0],[W,H,0],[W,H,-D],[W,y0,-D]],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
  for(const [name,cx,z] of spec.layers){const win=name.startsWith('win'),size=name==='lamps'?KIT_SIZES.lamps:KIT_SIZES[name.slice(0,-1)],w=size[0]/RW/2,h=size[1]/RH,x=Math.max(-W+w,Math.min(W-w,win||!mirror?cx:-cx));
    const top=name==='lamps'?H:y0+h,bottom=name==='lamps'?H-h:y0;b.quad(front(x-w,bottom,x+w,top,-z),kitUV(name,mirror&&!win));}
  return b.geometry();
}
export function commercePrefab(category,layout=0,mirror=false){
  if(!isReferenceCategory(category))return kitPrefab(layout,mirror);
  const row=SHOP_CATEGORIES.findIndex(c=>c.id===category),b=builder(),W=.47,y0=.001,H=.96,D=1;
  b.quad(front(-W,y0,W,H,-D),tileUV(row,0,mirror));
  b.quad([[-W,y0,0],[W,y0,0],[W,y0,-D],[-W,y0,-D]],tileUV(17,0));
  b.quad([[-W,H,-D],[W,H,-D],[W,H,0],[-W,H,0]],tileUV(17,1));
  b.quad([[-W,y0,-D],[-W,H,-D],[-W,H,0],[-W,y0,0]],tileUV(17,1));
  b.quad([[W,y0,0],[W,H,0],[W,H,-D],[W,y0,-D]],tileUV(17,1));
  // El espejo solo cambia UV/colocación: nunca invierte normales de instancias glTF.
  const depths=[[.22,.50,.78],[.31,.61,.85],[.16,.44,.72]][layout];
  for(const [i,z]of depths.entries())b.quad(front(-W,y0,W,H,-z),tileUV(row,3-i,mirror));
  return b.geometry();
}
function original(role,{map=null,cutout=false,closed=false}={}){const m=new T.MeshStandardMaterial({map,alphaTest:cutout?.45:0,side:T.DoubleSide,roughness:.88,metalness:0,vertexColors:true});m.name='ss_'+role;m.userData={ss_rol:role,ss_noOutline:true};if(role==='luz_interior'||role==='letrero_luminoso'){m.emissive.set('#ffe6be');m.emissiveMap=map;m.emissiveIntensity=closed?0:role==='luz_interior'?.28:.12;}return m;}
function gmaterial(source,sun){const m=createGMaterial({sun,map:source.map,alphaTest:source.alphaTest,doubleSided:true,emissive:source.emissiveIntensity/2.5,surf:source.userData.ss_rol==='luz_interior'?26:-1});m.userData={...m.userData,...source.userData};return m;}
function instanced(geometry,items,source,sun,role,model){const im=new T.InstancedMesh(geometry,gmaterial(source,sun),items.length),matrix=new T.Matrix4(),q=new T.Quaternion();items.forEach((c,i)=>{q.setFromAxisAngle(new T.Vector3(0,1,0),c.yaw);matrix.compose(new T.Vector3(...c.position),q,new T.Vector3(c.w,c.h,c.depth));im.setMatrixAt(i,matrix);im.setColorAt(i,new T.Color(c.closed?'#62636a':c.palette===0?'#ffffff':c.palette===1?'#f5e9d5':'#e0edf0'));});im.name='comercio_'+role;im.userData={kind:'commerce',ss_rol:role,ss_noOutline:true,commerceIds:items.map(c=>c.id),buildings:items.map(c=>model.buildings.findIndex(b=>b.id===c.buildingId)),prefab:items[0]?.variant};im.castShadow=false;im.receiveShadow=false;im._ssOriginalMaterial=source;im.computeBoundingSphere();return im;}
export function buildCommerceScene(model,openings,{sun,blenderKit=null}={}){
  const entries=resolveCommerces(openings,model),group=new T.Group();group.name='comercios-procedurales';if(!entries.length)return {group,entries,metadata:[],stats:commerceVariety([])};
  if(blenderKit)return buildBlenderCommerceScene(model,entries,{kit:blenderKit,sun});
  const groups=new Map();for(const c of entries){if(c.blocked)continue;const key=[c.variant,c.mirror,c.closed].join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
  const interiorMaterials=new Map();for(const [key,items]of groups){const c=items[0],k=c.category+':'+!!c.closed;if(!interiorMaterials.has(k))interiorMaterials.set(k,original('luz_interior',{map:commerceAtlas(c.category),cutout:true,closed:c.closed}));const im=instanced(commercePrefab(c.category,c.layout,c.mirror),items,interiorMaterials.get(k),sun,'luz_interior',model);im.name+='_'+key;group.add(im);}
  const glassGeometry=builder();glassGeometry.quad(front(-.46,.15,.46,.95,.045),[[0,0],[1,0],[1,1],[0,1]]);const glassOriginal=new T.MeshStandardMaterial({color:'#b6d9e5',transparent:true,opacity:.11,depthWrite:false,roughness:.22,metalness:.15,side:T.DoubleSide,vertexColors:true});glassOriginal.name='ss_vidrio_escaparate';glassOriginal.userData={ss_rol:'vidrio_escaparate',ss_noOutline:true};
  const glass=instanced(glassGeometry.geometry(),entries,glassOriginal,sun,'vidrio_escaparate',model);glass.material.dispose();glass.material=glassForwardMaterial();glass.layers.set(3);glass.renderOrder=5;group.add(glass);
  // La persiana se pinta en el atlas de cada categoría; se agrupa por atlas para no mezclar celdas.
  const closedBy=new Map();for(const c of entries.filter(c=>c.closed)){const k=isReferenceCategory(c.category)?c.category:'kit:'+c.category;if(!closedBy.has(k))closedBy.set(k,[]);closedBy.get(k).push(c);}
  for(const items of closedBy.values()){const c=items[0],b=builder();b.quad(front(-.46,.015,.46,.96,.09),isReferenceCategory(c.category)?tileUV(17,2):kitUV('persiana'));group.add(instanced(b.geometry(),items,original('persiana',{map:commerceAtlas(c.category)}),sun,'persiana',model));}
  const bySector=new Map();for(const c of entries){const key=Math.floor(c.position[0]/50)+'_'+Math.floor(c.position[2]/50);if(!bySector.has(key))bySector.set(key,[]);bySector.get(key).push(c);}
  for(const [sector,items]of bySector){const atlas=signAtlas(items),b=builder(),v=new T.Vector3(),q=new T.Quaternion(),matrix=new T.Matrix4();for(const [index,c]of items.entries()){q.setFromAxisAngle(new T.Vector3(0,1,0),c.yaw);matrix.compose(new T.Vector3(...c.position),q,new T.Vector3(1,1,1));const world=points=>points.map(p=>v.fromArray(p).applyMatrix4(matrix).toArray());b.quad(world(front(-c.w*.48,c.h+.12,c.w*.48,c.h+.67,.13)),atlas.uv.get(c.id).sign,index+1);const doorX=(1.5-1.05/2-.25)*c.w/3;b.quad(world(front(doorX-.25,1.42,doorX+.25,1.66,.13)),atlas.uv.get(c.id).status,index+1);b.quad(world(front(-c.w*.42,.60,-c.w*.07,.82,.13)),atlas.uv.get(c.id).tagline,index+1);}
    const source=original('letrero_luminoso',{map:atlas.texture,cutout:true}),mesh=new T.Mesh(b.geometry(),gmaterial(source,sun));mesh.name='rotulos_'+sector;mesh.userData={kind:'commerce',ss_rol:'letrero_luminoso',ss_noOutline:true,commerceIds:items.map(c=>c.id),sector};mesh._ssOriginalMaterial=source;group.add(mesh);
  }
  return {group,entries,metadata:entries.map(commerceMetadata),stats:commerceVariety(entries)};
}
// Vidrio ligero después del pase diferido; usa su profundidad para no atravesar edificios.
function glassForwardMaterial(){return new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,side:T.DoubleSide,uniforms:{tDepth:{value:null},uSize:{value:new T.Vector2(1,1)}},vertexShader:`varying float vDepth;varying vec3 vN;varying vec3 vEye;void main(){vec4 p=vec4(position,1.0);vec3 n=normal;
#ifdef USE_INSTANCING
p=instanceMatrix*p;n=mat3(instanceMatrix)*n;
#endif
vec4 mv=modelViewMatrix*p;vDepth=-mv.z;vN=normalize(normalMatrix*n);vEye=-mv.xyz;gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform sampler2D tDepth;uniform vec2 uSize;varying float vDepth;varying vec3 vN;varying vec3 vEye;void main(){float d=texture2D(tDepth,gl_FragCoord.xy/uSize).a;if(d>0.0&&vDepth>d+.12)discard;float f=pow(1.0-abs(dot(normalize(vN),normalize(vEye))),3.0);gl_FragColor=vec4(.67,.82,.87,.07+f*.16);}`});}
export function updateCommerceLight(root,night=0){root?.traverse(o=>{if(o.userData.ss_rol==='luz_interior'||o.userData.ss_rol==='letrero_luminoso'){const source=o._ssOriginalMaterial,u=o.material?.uniforms?.uEmissive;if(u&&source)u.value=source.emissiveIntensity/2.5*(.40+night*.85);}});}
