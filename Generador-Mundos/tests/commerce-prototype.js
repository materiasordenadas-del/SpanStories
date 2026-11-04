// Banco visual; utiliza la fábrica vigente, no una implementación paralela del efecto.
// Modos: pareja (panadería + otra categoría) y catálogo (las 17 categorías en una calle).
import * as T from 'three';
import {Viewer} from '../src/estudio/render/viewer.js';
import {buildCommerceScene,updateCommerceLight} from '../src/estudio/render/commerce-scene.js';
import {InstanceSet} from '../src/estudio/arq/instances.js';
import {createGMaterial} from '../src/estudio/render/gmaterial.js';
import {MeshBuilder,SURF} from '../src/estudio/geom/mesh.js';
import {disposeScene} from '../src/estudio/render/resources.js';
import {SHOP_CATEGORIES} from '../src/estudio/data/shop-categories.js';
import {loadCommerceBlenderKit} from '../src/estudio/render/commerce-blender-scene.js';
const blenderKit=await loadCommerceBlenderKit();
const viewer=new Viewer(document.querySelector('#view'));viewer.grass.setConfig({enabled:false});viewer.setMode('spanstories');viewer.pipeline.params.outline=.6;viewer.pipeline.params.hazeDensity=.0001;
const H=2.95,STEP=4.6,SHOPS={panaderia:'bakery',ropa:'clothes'},label=id=>SHOP_CATEGORIES.find(s=>s.id===id).label;
const state={mode:'pareja',category:'farmacia',layout:'auto',seed:'',width:3.4,closed:false,design:'claude'};
let built,root,xs=[];
const shopList=()=>state.mode==='catalogo'?SHOP_CATEGORIES.map(c=>c.id):['panaderia',state.category];
function rebuild(){if(root){viewer.scene.remove(root);disposeScene(root);}root=new T.Group();const cats=shopList(),W=state.width,n=cats.length,half=n*STEP/2;xs=cats.map((_,i)=>-half+STEP*(i+.5));
  const model={seed:'taller',buildings:[{id:'demo:fachada',sourceRef:'muestra-procedural',rings:[[[-half-2,-4],[half+2,-4],[half+2,0],[-half-2,0]]],shops:cats.map((c,i)=>({id:'demo:'+i+':'+c,x:xs[i],z:-1,shop:SHOPS[c]??'yes',name:label(c)}))}],context:{region:'espana',profile:'general'}};
  model.comercios=Object.fromEntries(cats.map((c,i)=>['demo:'+i+':'+c+':escaparate',{category:c,state:state.closed?'closed':'open',name:label(c),...(state.layout==='auto'?{}:{layout:Number(state.layout)}),...(state.seed?{seed:state.seed+':'+i}:{})}]));
  const openings=xs.map(x=>({buildingId:'demo:fachada',position:[x,.14,0],yaw:0,w:W,h:H}));built=buildCommerceScene(model,openings,{sun:viewer.sunDir,blenderKit:state.design==='blender'?blenderKit:null});root.add(built.group);viewer.lod=built.lod;
  const inst=new InstanceSet();for(const [i,c]of built.entries.entries()){if(built.assemblies?.some(a=>a.id===c.id&&a.kit))continue;inst.add('shopfront',{w:W,h:H,layered:true},c.position,0,c.frame,{building:0});if(c.awning)inst.add('awning',{w:W+.12,depth:.95,drop:.35,striped:true},[xs[i],H+.23,0],0,'#913c36');}
  inst.build(()=>createGMaterial({sun:viewer.sunDir,instanceTint:true})).forEach(m=>root.add(m));
  const mb=new MeshBuilder(),wall=new T.Color('#e4d2ac'),stone=new T.Color('#c8b58f'),len=n*STEP+8;mb.box(0,4.6,-.17,len/2,1.5,.17,0,wall,SURF.wall);
  // Machones entre vanos (MeshBuilder.box recibe semiejes).
  for(let i=0;i<=n;i++){const l=i===0?-half-4:xs[i-1]+W/2,r=i===n?half+4:xs[i]-W/2;mb.box((l+r)/2,1.6,-.17,(r-l)/2,1.6,.17,0,wall,SURF.wall);}
  mb.box(0,4.10,-.04,len/2,.08,.18,0,stone,SURF.trim);mb.box(0,.05,1.6,len/2+2,.07,2.6,0,new T.Color('#bbb6a7'),SURF.paving);root.add(new T.Mesh(mb.build(),createGMaterial({sun:viewer.sunDir})));
  viewer.scene.add(root);viewer.content=root;viewer.fitShadow(new T.Vector3(0,2,0),Math.max(20,len));viewer.dirty=true;}
function view(which,index=1){const x=which==='street'?0:xs[Math.min(index,xs.length-1)]??0,d=which==='street'?(state.mode==='catalogo'?26:11):5.1;viewer.camera.position.set(x+(which==='angle'?3.6:0),which==='street'?2.65:1.8,d);viewer.controls.target.set(x,1.65,0);viewer.setLens(which==='street'?28:26);viewer.camera.near=.08;viewer.controls.update();viewer.dirty=true;}
const $=s=>document.querySelector(s);
$('#day').onclick=()=>{viewer.pipeline.setAmbient('mediodia');viewer.dirty=true;};$('#night').onclick=()=>{viewer.pipeline.setAmbient('noche');viewer.dirty=true;};
$('#closed').onclick=e=>{state.closed=!state.closed;e.target.textContent=state.closed?'Abrir tiendas':'Cerrar tiendas';rebuild();};
$('#street').onclick=()=>view('street');$('#bakery').onclick=()=>view('front',0);$('#clothes').onclick=()=>view('front',1);$('#angle').onclick=()=>view('angle',focus);
const bar=document.createElement('div');bar.className='controls';document.querySelector('header').append(bar);
const design=document.createElement('select');design.add(new Option('Claude · pintado','claude'));design.add(new Option('Blender · volumen','blender'));design.setAttribute('aria-label','Diseño de los comercios');design.onchange=()=>{state.design=design.value;rebuild();};bar.append(design);
function control(name,el,on,after){el.setAttribute('aria-label',name);el.title=name;el.onchange=()=>{on(el.value);rebuild();after?.();};bar.append(el);return el;}
const picker=document.createElement('select');for(const c of SHOP_CATEGORIES)picker.add(new Option(c.label,c.id));picker.value=state.category;
const mode=document.createElement('select');[['pareja','Pareja'],['catalogo','Catálogo 17']].forEach(([v,t])=>mode.add(new Option(t,v)));
control('Categoría de la muestra',picker,v=>{state.category=v;state.mode='pareja';mode.value='pareja';},()=>{focus=1;view('front',1);});
control('Modo',mode,v=>state.mode=v,()=>view('street'));
const layout=document.createElement('select');[['auto','Layout auto'],['0','Layout 1'],['1','Layout 2'],['2','Layout 3']].forEach(([v,t])=>layout.add(new Option(t,v)));control('Composición',layout,v=>state.layout=v);
const width=document.createElement('select');[2.4,3.0,3.4,4.2].forEach(v=>width.add(new Option(v+' m',v)));width.value='3.4';control('Ancho del vano',width,v=>state.width=Number(v));
const seed=document.createElement('input');seed.placeholder='semilla';seed.size=8;control('Semilla',seed,v=>state.seed=v.trim());
// ← → recorren las tiendas una a una.
let focus=1;addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){focus=Math.max(0,Math.min(xs.length-1,focus+(e.key==='ArrowRight'?1:-1)));view('front',focus);}});
viewer.onWorldFrame=()=>updateCommerceLight(root,viewer.pipeline.composite.uniforms.uNight.value);
setInterval(()=>{const tris=built.group.children.reduce((s,m)=>s+(m.geometry.attributes.position.count/3)*(m.isInstancedMesh?m.count:1),0);$('#stats').textContent=`${built.entries.length} escaparates · ${built.stats.prefabVariants} variantes · ${Math.round(tris/Math.max(1,built.entries.length))} triángulos/vano (con rótulo y vidrio) · ${viewer.stats.calls} llamadas`;},750);
rebuild();view('street');window.taller={viewer,state,get built(){return built;},get root(){return root;},view,rebuild,focus:i=>{focus=i;view('front',i);}};
