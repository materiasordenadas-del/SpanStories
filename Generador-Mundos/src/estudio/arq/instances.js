// Conjunto de instancias de elementos: agrupa por tipo + medidas (cuantizadas) y crea un
// InstancedMesh por grupo con dos tintes por instancia (carpintería/forja y piedra/losa).
// Los elementos que se pueden estirar (escaparates, toldos, rótulos, balcones corridos)
// se modelan a un ancho nominal y se escalan en X: muchas menos mallas distintas.
import * as THREE from 'three';
import {elementGeometry} from './elements.js';

const q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),m=new THREE.Matrix4(),s=new THREE.Vector3(1,1,1),p=new THREE.Vector3();
// Solo proyectan sombra los elementos que vuelan o son altos; las ventanas no (ahorra media escena).
const CASTS=new Set(['balcony','awning','colonialBalcony','mirador','lamp','trafficLight','busStop','kiosk','fountain','statue','parkedCar','dormer','chimney','bladeSign','flagpole','metro']);
const STRETCH={shopfront:3,awning:3,sign:2.5,colonialBalcony:2.4,mirador:2};
const COLOR_KEYS=['slabColor','wallColor','stoneColor','baseColor'];
// Variantes raras que se pueden fusionar (los escaparates y puertas no: los usa el detalle cercano).
const BAKE=new Set(['window','balcony','arcadeBay','pillar','dormer','sign','bladeSign','awning','acUnit','mirador','colonialBalcony','rose','chimney','wallLamp','terrace']);
const nmat=new THREE.Matrix3(),vv=new THREE.Vector3();
const STEP={w:.1,h:.1,depth:.05,r:.1,blind:.25,l:.5};
function quantize(params){
  const out={};
  for(const [k,v]of Object.entries(params)){
    if(v===undefined||v===null||v===false)continue;
    if(typeof v==='number'){const st=STEP[k]??.05;out[k]=Math.round(Math.round(v/st)*st*1000)/1000;}
    else if(Array.isArray(v))out[k]=v.map(x=>typeof x==='number'?Math.round(x*10)/10:x);
    else if(typeof v==='object'){out[k]=quantize(v);}
    else out[k]=v;
  }
  return out;
}

export class InstanceSet{
  constructor(){this.groups=new Map();this.count=0;this.currentBuilding=-1;this.currentOpening=null;this.suppressedTypes={};this.shopfronts=[];}
  // pos [x,y,z] en mundo, yaw: giro Y que lleva +Z local a la normal exterior del muro.
  add(type,params,pos,yaw,tint,{scale=null,tint2=null,building=this.currentBuilding}={}){
    // Límite cuadrado del lugar: nada se coloca fuera (bordes rectos, sin piezas sueltas más allá).
    const B=this.bounds;if(B&&(pos[0]<B[0]-.01||pos[0]>B[2]+.01||pos[2]<B[1]-.01||pos[2]>B[3]+.01))return false;
    const opening=this.currentOpening;
    if(opening&&['door','shopfront','window'].includes(type)){
      const dx=pos[0]-opening.center[0],dz=pos[2]-opening.center[1],along=Math.abs(dx*opening.entry.d[0]+dz*opening.entry.d[1]),off=Math.abs(dx*opening.entry.n[0]+dz*opening.entry.n[1]);
      if(off<.5&&along<opening.width/2+(params.w??1)/2&&pos[1]<opening.floor+opening.doorHeight&&pos[1]+(params.h??1)>opening.floor){this.suppressedTypes[type]=(this.suppressedTypes[type]??0)+1;return false;}
    }
    if(this.currentFacadeOpenings&&['door','shopfront'].includes(type))this.currentFacadeOpenings.push({position:[...pos],yaw,w:params.w,h:params.h});
    params={...params};
    if(params.surround?.color){tint2??=params.surround.color;params.surround={...params.surround};delete params.surround.color;}
    for(const k of COLOR_KEYS)if(params[k]){tint2??=params[k];delete params[k];}
    let sx=scale?.[0]??1;
    if(STRETCH[type]&&params.w){sx*=params.w/STRETCH[type];params.w=STRETCH[type];}
    if(type==='balcony'&&params.w>2.4){sx*=params.w/3;params.w=3;}
    if(type==='sign'&&params.text)params.text=params.text.length>1&&params.text[0]>.4?[.5,.3]:[.35,.2];
    const pr=quantize(params),key=type+'|'+JSON.stringify(pr);
    let g=this.groups.get(key);
    if(!g){g={type,params:pr,matrices:[],colors:[],colors2:[],buildings:[]};this.groups.set(key,g);}
    q.setFromAxisAngle(up,yaw);p.set(pos[0],pos[1],pos[2]);
    s.set(sx,scale?.[1]??1,scale?.[2]??1);
    m.compose(p,q,s);
    g.matrices.push(...m.elements);
    const c=tint instanceof THREE.Color?tint:new THREE.Color(tint??'#ffffff');
    const c2=tint2 instanceof THREE.Color?tint2:new THREE.Color(tint2??'#ece3d2');
    g.colors.push(c.r,c.g,c.b);g.colors2.push(c2.r,c2.g,c2.b);g.buildings.push(building);
    this.count++;
    return true;
  }
  build(makeMaterial){
    const meshes=[];
    for(const [key,g]of this.groups){
      const base=elementGeometry(g.type,g.params),n=g.matrices.length/16;
      const geometry=new THREE.BufferGeometry();
      for(const [name,attr]of Object.entries(base.attributes))geometry.setAttribute(name,attr.clone());
      if(base.index)geometry.setIndex(base.index.clone());
      geometry.setAttribute('aTint2',new THREE.InstancedBufferAttribute(new Float32Array(g.colors2),3));
      geometry.boundingBox=base.boundingBox;geometry.userData.key=base.userData.key;geometry.userData.shared=true;
      const mesh=new THREE.InstancedMesh(geometry,makeMaterial(g.type,g.params),n);
      mesh.instanceMatrix.array.set(g.matrices);mesh.instanceMatrix.needsUpdate=true;
      mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(g.colors),3);
      mesh.name='elemento:'+key;mesh.userData={kind:'element',type:g.type,params:g.params,buildings:g.buildings,...(g.commerceIds?{commerceIds:g.commerceIds}:{})};
      mesh.castShadow=CASTS.has(g.type);mesh.receiveShadow=true;
      mesh.computeBoundingSphere();
      meshes.push(mesh);
    }
    return meshes;
  }
  // Una variante con pocas instancias costaba una llamada de dibujo (y otra lejana). Se fusiona en una malla
  // estática por sector: mismas piezas y medidas, color ya resuelto y aId = edificio+1, como los muros,
  // así la selección y la exportación por ID siguen funcionando.
  bakeRare({max=12,sector=100}={}){
    const out=new Map();
    for(const [key,g]of [...this.groups]){
      const n=g.matrices.length/16;if(n>max||!BAKE.has(g.type))continue;
      const base=elementGeometry(g.type,g.params),A=base.attributes,P=A.position.array,N=A.normal.array,C=A.color.array,S=A.aSurf.array,T=A.aTint.array,cast=CASTS.has(g.type);
      for(let i=0;i<n;i++){
        m.fromArray(g.matrices,i*16);nmat.getNormalMatrix(m);
        const k=Math.floor(m.elements[12]/sector)+':'+Math.floor(m.elements[14]/sector)+':'+(cast?'s':'n');
        const b=out.get(k)??out.set(k,{cast,p:[],n:[],c:[],s:[],id:[]}).get(k),id=g.buildings[i]>=0?g.buildings[i]+1:0;
        for(let v=0;v<A.position.count;v++){
          vv.fromArray(P,v*3).applyMatrix4(m);b.p.push(vv.x,vv.y,vv.z);
          vv.fromArray(N,v*3).applyMatrix3(nmat).normalize();b.n.push(vv.x,vv.y,vv.z);
          const t=T[v],tint=t<.5?null:t<1.5?g.colors:g.colors2;
          for(let c=0;c<3;c++)b.c.push(C[v*3+c]*(tint?tint[i*3+c]:1));
          b.s.push(S[v]);b.id.push(id);
        }
      }
      this.groups.delete(key);this.baked=(this.baked??0)+1;
    }
    return [...out].map(([k,b])=>{const geometry=new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));geometry.setAttribute('aSurf',new THREE.Float32BufferAttribute(b.s,1));
      geometry.setAttribute('aId',new THREE.Float32BufferAttribute(b.id,1));geometry.setAttribute('aTint',new THREE.Float32BufferAttribute(new Float32Array(b.s.length),1));
      geometry.computeBoundingSphere();geometry.computeBoundingBox();
      return {key:'elementos-fusionados:'+k,cast:b.cast,geometry};});
  }
  get triangles(){let t=0;for(const g of this.groups.values()){const geo=elementGeometry(g.type,g.params);t+=geo.attributes.position.count/3*(g.matrices.length/16);}return t;}
}
