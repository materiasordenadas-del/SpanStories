// Motor de actuaciones (cuerpo). Reproduce las recetas de ActingLibrary.mjs sobre cualquier
// esqueleto humanoide mapeado (Mixamo y compatibles), de forma determinista y con búsqueda libre.
//
// · Las poses se escriben con direcciones y contactos, no con rotaciones del personaje de origen:
//   columna y cabeza como giros desde el reposo propio de cada rig; brazos como direcciones de
//   brazo/antebrazo o como contactos IK sobre puntos medidos en el receptor (mentón, boca, pecho…).
// · Entre poses hay anticipación, sobrepaso y asentamiento, y cada articulación llega con su propio
//   retraso (cadera → columna → cabeza → brazo → mano → dedos) para que nada se mueva en bloque.
// · La cadera se desplaza y los pies quedan plantados por IK; los contactos de mano se vuelven a
//   resolver en cada fotograma para que sigan a la cabeza o al pecho.
// · La intensidad escala postura, amplitud y ritmo; los contactos se conservan.
import * as T from 'three';
import {CANON,CANON_BY_ID} from './humanoid.js';
import {makeClip,newPose} from './clip.js';
import {solveTwoBone} from './ik.js';
import {withOriginalSkin} from './skinfix.js';

export const INTENSITY_REFERENCE=.75;
const RAD=Math.PI/180,SIDES=[['L',1],['R',-1]],FINGERS=['thumb','index','middle','ring','little'],NECK=.62,SPINE={spine:.26,chest:.34,upperChest:.4};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),Q=()=>new T.Quaternion();
const vec=(a,sx=1)=>V(a[0]*sx,a[1],a[2]);
const euler=(e,k=1)=>e?Q().setFromEuler(new T.Euler(e[0]*RAD*k,e[1]*RAD*k,e[2]*RAD*k,'YXZ')):Q();
const sum=(a,k,b)=>[(a?.[0]||0)*k+(b?.[0]||0),(a?.[1]||0)*k+(b?.[1]||0),(a?.[2]||0)*k+(b?.[2]||0)];
const norm=n=>n.toLowerCase().replace(/[^a-z0-9]/g,'');
function basis(x,y){const X=x.clone().normalize(),Y=y.clone().addScaledVector(X,-y.dot(X)).normalize(),Z=X.clone().cross(Y);return Q().setFromRotationMatrix(new T.Matrix4().makeBasis(X,Y,Z));}
function slerpU(a,b,t,out=Q()){
  let bx=b.x,by=b.y,bz=b.z,bw=b.w,cos=a.x*bx+a.y*by+a.z*bz+a.w*bw;if(cos<0){cos=-cos;bx=-bx;by=-by;bz=-bz;bw=-bw;}
  let ka=1-t,kb=t;if(cos<.999999){const th=Math.acos(cos),s=Math.sin(th);ka=Math.sin((1-t)*th)/s;kb=Math.sin(t*th)/s;}
  return out.set(a.x*ka+bx*kb,a.y*ka+by*kb,a.z*ka+bz*kb,a.w*ka+bw*kb).normalize();
}

// ---------- Medidas del personaje receptor ----------
// Posición de reposo de un vértice en el mundo, tal como se dibuja (con skinning). No vale la geometría por la
// matriz del objeto: un GLB puede colgar la malla de un nodo desplazado con bindMatrix identidad, y three.js
// anula esa matriz al deformar (Mia: la malla cuelga 0,83 m por encima de su sitio).
function restVertex(o,i,out){out.fromBufferAttribute(o.geometry.attributes.position,i);if(o.isSkinnedMesh&&o.geometry.attributes.skinIndex)o.applyBoneTransform(i,out);return out.applyMatrix4(o.matrixWorld);}
// Los puntos de contacto salen de sus propias shape keys faciales (ojos, boca, mentón) y de su malla
// (grosor de pecho y cadera). Sin malla ni morphs se estiman por proporciones del esqueleto.
const measured=new WeakMap();
function faceFromMorphs(rig,toChar){
  let mesh=null;
  rig.root.traverse(o=>{if(o.isMesh&&o.morphTargetDictionary&&o.geometry?.morphAttributes?.position&&Object.keys(o.morphTargetDictionary).some(n=>norm(n)==='eyeblinkleft')&&(!mesh||o.geometry.attributes.position.count>mesh.geometry.attributes.position.count))mesh=o;});
  if(!mesh)return {};
  const g=mesh.geometry,pos=g.attributes.position,v=V(),d=V();
  function moved(name,share=.5){
    const key=Object.keys(mesh.morphTargetDictionary).find(n=>norm(n)===norm(name)),a=key===undefined?null:g.morphAttributes.position[mesh.morphTargetDictionary[key]];if(!a)return null;
    const m=new Float32Array(a.count);let max=0;
    for(let i=0;i<a.count;i++){d.fromBufferAttribute(a,i);if(!g.morphTargetsRelative)d.sub(v.fromBufferAttribute(pos,i));m[i]=d.length();if(m[i]>max)max=m[i];}
    if(max<1e-7)return null;
    const points=[],center=V();let total=0;
    for(let i=0;i<a.count;i++)if(m[i]>=max*share){const p=toChar(restVertex(mesh,i,v));points.push(p);center.addScaledVector(p,m[i]);total+=m[i];}
    return {points,center:center.multiplyScalar(1/total)};
  }
  const out={eyeL:moved('eyeBlinkLeft')?.center,eyeR:moved('eyeBlinkRight')?.center,mouth:(moved('mouthPucker')||moved('mouthFunnel'))?.center};
  const jaw=moved('jawOpen',.6);
  if(jaw&&out.eyeL&&out.eyeR){
    const iod=out.eyeL.distanceTo(out.eyeR),low=Math.min(...jaw.points.map(p=>p.y)),near=jaw.points.filter(p=>p.y<low+iod*.18&&Math.abs(p.x)<iod*.5);
    if(near.length)out.chin=V(0,low,Math.max(...near.map(p=>p.z)));
  }
  return out;
}
export function measureBody(rig){
  const known=measured.get(rig);if(known&&known.mapping===rig.mapping)return known;
  // Con pesos suavizados al cargar (skinfix) se mide con los originales: mismas medidas que sin suavizar.
  return withOriginalSkin(rig.root,()=>measureBodyNow(rig));
}
function measureBodyNow(rig){
  rig.resetToRest();rig.root.updateMatrixWorld(true);
  const rest=rig.captureCanonical({q:{},hips:V()}).q,origin=rig.restWorldPos.hips.clone(),h=rig.hipsHeight;
  const toChar=w=>w.clone().sub(origin).applyQuaternion(rig.FqInv),toWorld=c=>c.clone().applyQuaternion(rig.Fq).add(origin);
  const p=Object.fromEntries(CANON.map(d=>[d.id,rig.restWorldPos[d.id]?toChar(rig.restWorldPos[d.id]):null]));
  const dist=(a,b)=>p[a]&&p[b]?p[a].distanceTo(p[b]):0;
  const SW=p.upperArmL&&p.upperArmR?p.upperArmL.distanceTo(p.upperArmR):.36*h,arm={},hand={};
  for(const [S,sx] of SIDES){
    const Lu=dist('upperArm'+S,'lowerArm'+S)||.3*h,Lf=dist('lowerArm'+S,'hand'+S)||.27*h,Lp=dist('hand'+S,'middle1'+S)||.3*Lf,Lg=(dist('middle1'+S,'middle2'+S)+dist('middle2'+S,'middle3'+S))*1.45||.9*Lp;
    arm[S]={Lu,Lf,Lp,Lg,U:Lp+Lg};
    // Puntos de la mano en su pose T canónica (dedos sobre ±X, palma hacia −Y).
    hand[S]={wrist:V(),heel:V(sx*.15*Lp,-.16*Lp,0),palm:V(sx*.62*Lp,-.18*Lp,0),back:V(sx*.6*Lp,.14*Lp,0),knuckles:V(sx*Lp,.1*Lp,0),pads:V(sx*(Lp+.5*Lg),-.1*Lp,0),tips:V(sx*(Lp+.92*Lg),-.04*Lp,0),index:V(sx*(Lp+.9*Lg),-.04*Lp,.22*Lp),thumb:V(sx*.55*Lp,-.05*Lp,.75*Lp)};
  }
  // Superficie de tronco y piernas en pose de enlace.
  const pts=[],v=V(),limbPts={armL:[],armR:[],legL:[],legR:[]};
  rig.root.traverse(o=>{
    const g=o.geometry;if(!o.isSkinnedMesh||!g?.attributes.skinIndex||!g.attributes.skinWeight)return;
    const groups=o.skeleton.bones.map(b=>rig.groupOf.get(b)),pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
    for(let i=0;i<pos.count;i++){
      let j=0;for(let k=1;k<4;k++)if(sw.getComponent(i,k)>sw.getComponent(i,j))j=k;
      const group=groups[si.getComponent(i,j)];if(group!=='torso'&&group!=='legL'&&group!=='legR'&&group!=='armL'&&group!=='armR')continue;
      restVertex(o,i,v).sub(origin).applyQuaternion(rig.FqInv);
      if(limbPts[group])limbPts[group].push(v.x,v.y,v.z);if(group!=='armL'&&group!=='armR')pts.push(v.x,v.y,v.z);
    }
  });
  const yN=p.neck?.y??.55*h,yU=p.upperChest?.y??.4*h,yC=p.chest?.y??.25*h,yS=p.spine?.y??.12*h,bh=.045*yN,depth=.3*SW;
  function band(y,half,xmax=Infinity){let front=-Infinity,side=0;for(let i=0;i<pts.length;i+=3)if(Math.abs(pts[i+1]-y)<=half){if(Math.abs(pts[i])<=xmax)front=Math.max(front,pts[i+2]);side=Math.max(side,Math.abs(pts[i]));}return {front,side};}
  const front=(y,xmax,ref)=>{const f=band(y,bh,xmax).front;return Number.isFinite(f)?f:(ref?.z||0)+depth;},side=(y,ref)=>band(y,bh).side||ref;
  const lm={},put=(name,bone,c)=>{const b=rig.bone(bone);if(b&&c)lm[name]={bone,local:b.worldToLocal(toWorld(c))};};
  // Cabeza.
  const headBone=rig.bone('head'),topBone=headBone?.children.find(c=>/headtop/i.test(c.name))||headBone?.children.find(c=>/top|_end$/i.test(c.name)),head=p.head||V(0,yN+.1*h,0);
  const top=topBone?toChar(topBone.getWorldPosition(V())):null,HH=top?top.y-head.y:.5*SW,face=faceFromMorphs(rig,toChar);
  const eyes=face.eyeL&&face.eyeR?face.eyeL.clone().add(face.eyeR).multiplyScalar(.5):head.clone().add(V(0,.33*HH,.4*HH)),iod=face.eyeL&&face.eyeR?face.eyeL.distanceTo(face.eyeR):.278*HH;
  eyes.x=0;
  const mouth=face.mouth?V(0,face.mouth.y,face.mouth.z):head.clone().add(V(0,.1*HH,.51*HH)),chin=face.chin||head.clone().add(V(0,-.05*HH,.45*HH));
  put('eyes','head',eyes);put('forehead','head',eyes.clone().add(V(0,.95*iod,.02*iod)));put('nose','head',V(0,(eyes.y+mouth.y)/2,mouth.z+.22*iod));put('mouth','head',mouth);put('chin','head',chin);
  put('crown','head',top?top.clone().add(V(0,.1*iod,.5*iod)):eyes.clone().add(V(0,2.3*iod,-1.2*iod)));
  for(const [S,sx] of SIDES){
    put('eye'+S,'head',eyes.clone().add(V(sx*.5*iod,0,0)));put('cheek'+S,'head',V(sx*.8*iod,(eyes.y+mouth.y)/2,eyes.z-.12*iod));put('jaw'+S,'head',V(sx*.72*iod,chin.y+.35*iod,chin.z-.75*iod));
    put('ear'+S,'head',V(sx*1.3*iod,eyes.y-.2*iod,eyes.z-1.5*iod));put('temple'+S,'head',V(sx*1.08*iod,eyes.y+.5*iod,eyes.z-.5*iod));put('scalp'+S,'head',V(sx*.95*iod,eyes.y+1.75*iod,eyes.z-1.3*iod));
  }
  const neck=p.neck||V(0,yN,0);put('nape','neck',neck.clone().add(V(0,.45*iod,-.95*iod)));put('throat','neck',neck.clone().add(V(0,.1*iod,.8*iod)));
  // Tronco.
  const yT=yU+.4*(yN-yU),zT=front(yT,.12*SW,p.upperChest),zB=front(yS,.2*SW,p.spine),zC=front(yC,.2*SW,p.chest),yW=yS+.3*(yC-yS),xW=side(yW,.55*SW),xH=side(0,.6*SW);
  put('sternum','upperChest',V(0,yT,zT));put('chest','upperChest',V(0,yU,front(yU,.3*SW,p.upperChest)));put('solar','chest',V(0,yC,zC));put('belly','spine',V(0,yS,zB));
  for(const [S,sx] of SIDES){
    put('heart'+S,'upperChest',V(sx*.2*SW,yT,zT));put('waist'+S,'hips',V(sx*xW,yW,(p.spine?.z||0)*.5));put('hip'+S,'hips',V(sx*xH,0,0));
    put('shoulder'+S,'upperChest',p['upperArm'+S]?p['upperArm'+S].clone().add(V(0,.35*arm[S].Lp,0)):null);
    if(p['upperArm'+S]&&p['lowerArm'+S])put('bicep'+S,'upperArm'+S,p['upperArm'+S].clone().lerp(p['lowerArm'+S],.55).add(V(0,0,.16*SW)));
    if(p['upperLeg'+S]&&p['lowerLeg'+S]){
      // Muslo: sobre la superficie delantera real de la pierna (pantalón incluido). Con una proporción fija,
      // en un pantalón ancho (bombachos) la mano apoyada se hundía en la tela.
      const c=p['upperLeg'+S].clone().lerp(p['lowerLeg'+S],.6),L=limbPts['leg'+S];let zf=-Infinity;
      for(let i=0;i<L.length;i+=3)if(Math.abs(L[i+1]-c.y)<.04*h&&Math.abs(L[i]-c.x)<.06*h&&L[i+2]>zf)zf=L[i+2];
      put('thigh'+S,'upperLeg'+S,Number.isFinite(zf)&&zf>c.z?V(c.x,c.y,zf):c.add(V(0,0,.2*SW)));
    }
  }
  // Separación natural del brazo en reposo: la mano libra la cadera del propio personaje.
  const reach=arm.L.Lu+arm.L.Lf,sx0=Math.abs(p.upperArmL?.x??SW/2),yHand=(p.upperArmL?.y??yN)-reach*.96;
  const abduct=clamp(Math.asin(clamp((side(yHand,.6*SW)+arm.L.Lp*.5-sx0)/reach,-1,1))/RAD,5,24);
  // Marco del suelo: el «arriba» del personaje (cadera→cabeza) se inclina si su reposo se inclina;
  // los pasos y apoyos se miden sobre el suelo real para que un pie nunca se hunda al retroceder.
  const groundUp=V(0,1,0),groundLeft=rig.frame.left.clone().addScaledVector(groundUp,-rig.frame.left.dot(groundUp)).normalize();
  const level=basis(groundLeft,groundUp);
  // Volumen del cuerpo para que los brazos no lo atraviesen: rejilla x·y con la superficie delantera de
  // tronco, cadera y muslos, en la pose de enlace. Se consulta en el espacio del pecho, así sigue al tronco inclinado.
  const grid={x0:-SW*1.1,dx:SW*2.2/16,nx:16,y0:-.45*h,dy:(yN+.45*h)/32,ny:32,z:new Float32Array(16*32).fill(-Infinity),back:new Float32Array(16*32).fill(Infinity),xlo:new Float32Array(32).fill(Infinity),xhi:new Float32Array(32).fill(-Infinity)};
  // Solo tronco y pelvis: los muslos cambian de sitio al sentarse o dar un paso y no sirven medidos de pie.
  // `xlo`/`xhi`: contorno lateral real de cada fila. Las columnas son gruesas (1/16 del ancho): sin el
  // contorno, una mano apoyada en el costado de una cintura estrecha cuenta como «dentro» y se empuja delante.
  for(let i=0;i<pts.length;i+=3){if(pts[i+1]<-.14*h)continue;const gx=Math.floor((pts[i]-grid.x0)/grid.dx),gy=Math.floor((pts[i+1]-grid.y0)/grid.dy);if(gx>=0&&gx<grid.nx&&gy>=0&&gy<grid.ny){const k=gy*grid.nx+gx;if(pts[i+2]>grid.z[k])grid.z[k]=pts[i+2];if(pts[i+2]<grid.back[k])grid.back[k]=pts[i+2];if(pts[i]<grid.xlo[gy])grid.xlo[gy]=pts[i];if(pts[i]>grid.xhi[gy])grid.xhi[gy]=pts[i];}}
  const chestId=rig.bone('chest')?'chest':'spine',chestBone=rig.bone(chestId);
  const body=chestBone&&pts.length?{grid,bone:chestId,rest:chestBone.matrixWorld.clone(),origin,radius:.2*SW}:null;
  // Grosor de muslos (pantalón incluido) y antebrazos, medido en la malla: radio del 80 % de los vértices
  // alrededor de cada hueso. Sirve para que el antebrazo y la mano no atraviesen el pantalón ni el otro brazo.
  function segR(list,a,b,lo,hi,maxd){
    if(!a||!b||!list.length)return 0;const ab=b.clone().sub(a),L2=ab.lengthSq(),q=V(),d=[];
    for(let i=0;i<list.length;i+=3){q.set(list[i],list[i+1],list[i+2]).sub(a);const t=q.dot(ab)/L2;if(t<lo||t>hi)continue;const r=q.addScaledVector(ab,-t).length();if(r<maxd)d.push(r);}
    if(d.length<12)return 0;d.sort((x,y)=>x-y);return d[Math.floor(d.length*.8)];
  }
  const limbs=pts.length?{leg:{},fore:{}}:null;
  if(limbs)for(const [S] of SIDES){
    limbs.leg[S]=segR(limbPts['leg'+S],p['upperLeg'+S],p['lowerLeg'+S],.15,.9,.45*SW)||.085*h;
    limbs.fore[S]=segR(limbPts['arm'+S],p['lowerArm'+S],p['hand'+S],.15,.85,.45*arm[S].Lf)||.12*arm[S].Lf;
  }
  // Grosor del brazo para la guarda del tronco: el medido en la malla (manga incluida), no una proporción fija.
  if(body&&limbs)body.radius=Math.min(.2*SW,1.2*Math.max(limbs.fore.L,limbs.fore.R));
  const M={mapping:rig.mapping,rest,h,SW,iod,arm,hand,lm,abduct,level,body,limbs,recipes:new Map(),idle:null};
  M.limits=armLimits(rig);M.idle=resolveKey(rig,M,{});measured.set(rig,M);return M;
}

/**
 * Cuánto se mete el brazo (codo → muñeca) dentro del cuerpo. depth > 0: hay que sacarlo hacia delante;
 * depth < 0: hacia atrás (manos a la espalda). 0 = libra el cuerpo. elbow: lo mismo, solo junto al codo.
 */
function armDepth(rig,M,S,until=.9){
  const B=M.body;if(!B)return {depth:0,elbow:0};
  const bone=rig.bone(B.bone),inv=bone.matrixWorld.clone().invert(),g=B.grid,a=rig.bone('lowerArm'+S).getWorldPosition(V()),b=rig.bone('hand'+S).getWorldPosition(V());
  let depth=0,elbow=0;const keep=(d,t)=>{if(Math.abs(d)>Math.abs(depth))depth=d;if(t<.15&&Math.abs(d)>Math.abs(elbow))elbow=d;};
  // Sin contacto también se vigilan los nudillos (un puño junto al pecho no debe hundirse en él).
  const knuckle=until>.7&&rig.bone('middle1'+S)?rig.bone('middle1'+S).getWorldPosition(V()):null,kw=clamp((until-.7)/.2);
  for(let i=0;i<=(knuckle?9:8);i++){
    const t=i/8*until,p=(i===9?knuckle.clone():a.clone().lerp(b,t)).applyMatrix4(inv).applyMatrix4(B.rest).sub(B.origin).applyQuaternion(rig.FqInv);
    const gx=Math.floor((p.x-g.x0)/g.dx),gy=Math.floor((p.y-g.y0)/g.dy);if(gx<0||gx>=g.nx||gy<0||gy>=g.ny)continue;
    // Solo cuenta si el punto está entre la cara trasera y la delantera de esa columna del cuerpo
    // (un brazo al lado o detrás no lo atraviesa); el grosor del brazo se suma por delante.
    const k=gy*g.nx+gx,front=g.z[k],back=g.back[k];if(!Number.isFinite(front))continue;
    const R=i===9?B.radius*.45:B.radius;
    // Al lado del cuerpo (fuera de su contorno en esa altura) no lo atraviesa: empujarlo delante no sirve.
    if(g.xlo&&(p.x>g.xhi[gy]+R*.35||p.x<g.xlo[gy]-R*.35))continue;
    if(p.z<back-R||p.z>front+R)continue;
    // Los nudillos entran en la cuenta poco a poco (con `until` continuo, sin saltos al soltar un contacto).
    const out=front+R-p.z,behind=p.z-(back-R),w=i===9?kw:1;keep((out<=behind?out:-behind)*w,t);
  }
  return {depth,elbow};
}

// ---------- De la descripción de una pose a rotaciones canónicas ----------
const SHAPES={
  relax:{c:[.3,.2,.28,.36,.44],s:.1,ta:.1},open:{c:[.06,.04,.07,.1,.13],s:.55,ta:-.4},splay:{c:[-.05,-.08,-.08,-.08,-.06],s:1,ta:-.9},flat:{c:[0,0,0,0,0],s:0,ta:.5},
  fist:{c:[.75,1,1,1,1],s:0,ta:.7},loose:{c:[.5,.6,.68,.75,.8],s:.05,ta:.45},point:{c:[.75,0,1,1,1],s:0,ta:.7},cup:{c:[.3,.42,.45,.48,.5],s:.15,ta:0,j:[.7,.8,.6]},
  claw:{c:[.4,.6,.6,.6,.6],s:.7,ta:-.6,j:[.15,1,1]},thumb:{c:[-.1,1,1,1,1],s:0,ta:-1},peace:{c:[.8,0,0,1,1],s:.75,ta:.65},hold:{c:[.35,.6,.64,.68,.72],s:.05,ta:.3},soft:{c:[.15,.1,.16,.22,.28],s:.25,ta:-.1}
};
function fingerLocals(shape,sx){
  const s=typeof shape==='string'?SHAPES[shape]||SHAPES.relax:{...SHAPES.relax,...shape},j=s.j||[.78,1,.72],spread=[0,-12,-2,8,18],out={};
  FINGERS.forEach((f,i)=>{
    const c=s.c[i];
    if(f==='thumb'){
      out.thumb1=Q().setFromAxisAngle(V(0,1,0),sx*(s.ta??.1)*30*RAD).multiply(Q().setFromAxisAngle(V(1,0,0),Math.max(0,c)*38*RAD));
      out.thumb2=Q().setFromAxisAngle(V(0,1,0),sx*c*32*RAD).multiply(Q().setFromAxisAngle(V(1,0,0),Math.max(0,c)*12*RAD));
      out.thumb3=Q().setFromAxisAngle(V(0,1,0),sx*c*48*RAD);
    }else for(let n=1;n<=3;n++){
      const curl=Q().setFromAxisAngle(V(0,0,1),-sx*c*j[n-1]*[78,98,80][n-1]*RAD);
      out[f+n]=n===1?Q().setFromAxisAngle(V(0,1,0),-sx*spread[i]*(s.s||0)*RAD).multiply(curl):curl;
    }
  });
  return out;
}
/** Brazo a partir de la dirección del brazo y del antebrazo, con la torsión repartida entre antebrazo y mano. */
function armQuats(sx,dU,dF,hint,palm,fingers){
  dU=dU.clone().normalize();dF=dF.clone().normalize();
  let b=dF.clone().addScaledVector(dU,-dF.dot(dU));
  if(b.length()<.1){b=hint.clone().addScaledVector(dU,-hint.dot(dU));if(b.lengthSq()<1e-6)b.set(0,0,1).addScaledVector(dU,-dU.z);b.normalize();dF.copy(dU).addScaledVector(b,.1).normalize();}
  b.normalize();
  const Xu=dU.clone().multiplyScalar(sx),hinge=b.clone().cross(Xu).normalize(),qU=basis(Xu,hinge),qF0=basis(dF.clone().multiplyScalar(sx),hinge);
  const Xh=(fingers||dF).clone().normalize().multiplyScalar(sx),Y=(palm||hinge.clone().negate()).clone().negate();Y.addScaledVector(Xh,-Y.dot(Xh));if(Y.lengthSq()<1e-6)Y.copy(hinge);
  const qH=basis(Xh,Y),rel=qF0.clone().invert().multiply(qH),twist=((2*Math.atan2(rel.x,rel.w)+Math.PI*3)%(Math.PI*2))-Math.PI;
  return {qU,qF:qF0.multiply(Q().setFromAxisAngle(V(1,0,0),clamp(twist,-2.2,2.2)*.42)),qH,dU,dF};
}
const part=(spec,name,S)=>spec[name+S]??spec[name+'s']??spec[name]??null;
function idleArm(M){const s=Math.sin(M.abduct*RAD),c=Math.cos(M.abduct*RAD);return {u:[s,-c,-.05],f:[s*.75,-c,.2],palm:[-.93,0,-.36],g:1};}
function buildPose(M,spec){
  const P={q:{},Wd:{},hipsT:V(...(spec.hipsT||[0,0,0])),feet:{},pin:{L:null,R:null},contact:{L:false,R:false}},Wd=P.Wd,rest=M.rest,set=(c,q)=>{if(rest[c])P.q[c]=q;};
  Wd.hips=euler(spec.hips);
  Wd.spine=Wd.hips.clone().multiply(euler(sum(spec.torso,SPINE.spine,spec.spine)));
  Wd.chest=Wd.spine.clone().multiply(euler(sum(spec.torso,SPINE.chest,spec.chest)));
  Wd.upperChest=Wd.chest.clone().multiply(euler(sum(spec.torso,SPINE.upperChest,spec.upperChest)));
  Wd.neck=Wd.upperChest.clone().multiply(euler(sum(spec.head,NECK,spec.neck)));
  Wd.head=Wd.neck.clone().multiply(euler(sum(spec.head,1-NECK,spec.skull)));
  for(const c of ['hips','spine','chest','upperChest','neck','head'])set(c,Wd[c].clone().multiply(rest[c]||Q()));
  for(const [S,sx] of SIDES){
    for(const c of ['upperLeg','lowerLeg','foot','toes'])set(c+S,(rest[c+S]||Q()).clone());
    // `idle:true` = la caída natural de este personaje (separación medida en su malla), con los ajustes que lleve.
    const raw=part(spec,'arm',S),a=raw?.idle?{...idleArm(M),...raw}:raw||idleArm(M),fk=a.u?a:idleArm(M),space=slerpU(Q(),Wd.upperChest,1-(fk.g??0));
    P.arm??={};P.arm[S]={spec:a,sx};
    applyArm(M,P,S,sx,armQuats(sx,vec(fk.u,sx).applyQuaternion(space),vec(fk.f,sx).applyQuaternion(space),vec(a.bend||[-.25,0,1],sx).applyQuaternion(space),fk.palm?vec(fk.palm,sx).applyQuaternion(space):null,fk.fingers?vec(fk.fingers,sx).applyQuaternion(space):null),part(spec,'hand',S)||'relax',part(spec,'sh',S));
    const foot=part(spec,'foot',S)||(spec.feet??null);
    P.feet[S]={off:V(...(foot?.off||[0,0,0])),heel:foot?.heel||0,yaw:foot?.yaw||0,knee:foot?.knee||0};
  }
  return P;
}
function applyArm(M,P,S,sx,a,shape,sh){
  const uc=P.Wd.upperChest,local=a.dU.clone().applyQuaternion(uc.clone().invert()),elevation=Math.acos(clamp(-local.y,-1,1))/RAD;
  // La clavícula acompaña al brazo (ritmo escápulo-humeral): empieza a subir pasados ~35° y aporta
  // ~30° con el brazo arriba, para que la axila no se estire de más; se adelanta al cruzarlo o extenderlo.
  const cl=M.limits||WRIST_LIMITS,up=(sh?.[0]||0)+Math.max(0,elevation-cl.clavicleFrom)*cl.clavicleShare,fwd=(sh?.[1]||0)+10*Math.max(0,local.z)+12*Math.max(0,-local.x*sx);
  if(M.rest['shoulder'+S])P.q['shoulder'+S]=uc.clone().multiply(Q().setFromAxisAngle(V(0,0,1),sx*up*RAD)).multiply(Q().setFromAxisAngle(V(0,1,0),-sx*fwd*RAD)).multiply(M.rest['shoulder'+S]);
  P.q['upperArm'+S]=a.qU;P.q['lowerArm'+S]=a.qF;P.q['hand'+S]=a.qH;
  const f=fingerLocals(shape,sx);
  for(const name of FINGERS){let w=a.qH;for(let n=1;n<=3;n++){w=w.clone().multiply(f[name+n]);P.q[name+n+S]=w;}}
}
const pose=P=>({q:P.q,hips:P.hipsT});
/** Resuelve en el personaje receptor los contactos de una pose y la deja en rotaciones locales interpolables. */
function resolveKey(rig,M,spec){
  const P=buildPose(M,spec);
  for(const [S,sx] of SIDES){
    const a=P.arm[S].spec;if(!a.to)continue;
    const other=a.to.startsWith('x:'),name=other?a.to.slice(2):a.to,mark=M.lm[name+(other?(S==='L'?'R':'L'):S)]||M.lm[name];
    const shoulder=rig.bone('upperArm'+S),anchor=mark&&rig.bone(mark.bone);if(!shoulder||!anchor)continue;
    const m=M.arm[S],uc=P.Wd.upperChest,dir=v=>vec(v,sx).applyQuaternion(uc);
    const fingers=dir(a.fingers||[0,1,0]),palm=dir(a.palm||[0,0,-1]),Xh=fingers.clone().normalize().multiplyScalar(sx),Y=palm.clone().negate();Y.addScaledVector(Xh,-Y.dot(Xh));
    const qH=basis(Xh,Y),local=M.hand[S][a.with||'palm'];let tip=local.clone().applyQuaternion(qH).applyQuaternion(rig.Fq);
    P.contact[S]=!a.free;
    // En un contacto la muñeca está donde debe (sobre la piel, el mentón, el otro brazo): solo se vigila
    // la mitad del antebrazo junto al codo.
    const until=.5,forward=dir([0,0,1]).applyQuaternion(rig.Fq);
    let push=0,elbowPush=0;
    // Contacto en la pierna: la pierna se resuelve con los pies plantados, como al reproducir; si no, el brazo
    // se calculaba contra un muslo en otro sitio y en movimiento la mano entraba en él.
    const onLeg=/^(upperLeg|lowerLeg|foot)/.test(mark.bone),place=()=>{rig.applyCanonical(pose(P));rig.root.updateMatrixWorld(true);if(onLeg&&M.level)plantFeet(rig,M.level,P.feet);};
    for(let pass=0;pass<9;pass++){
      place();
      if(pass>=3){const pen=armDepth(rig,M,S,until);if(Math.abs(pen.depth)<.002*M.h)break;push+=pen.depth+Math.sign(pen.depth)*.004*M.h;elbowPush+=pen.elbow*1.5;}
      const off=vec(a.off||[0,0,0],sx).multiplyScalar(m.U).applyQuaternion(P.Wd[mark.bone]||uc).applyQuaternion(rig.Fq),target=anchor.localToWorld(mark.local.clone()).add(off).sub(tip).addScaledVector(forward,push);
      const origin=shoulder.getWorldPosition(V()),d=target.clone().sub(origin),L=clamp(d.length(),Math.abs(m.Lu-m.Lf)+1e-5,(m.Lu+m.Lf)*.995),n=d.clone().normalize();
      const pole=dir(a.elbow||[.6,-.7,-.3]).applyQuaternion(rig.Fq).addScaledVector(forward,elbowPush/(m.Lu||1)),bend=pole.addScaledVector(n,-pole.dot(n)).normalize(),cos=(m.Lu*m.Lu+L*L-m.Lf*m.Lf)/(2*m.Lu*L);
      const elbow=n.clone().multiplyScalar(cos*m.Lu).addScaledVector(bend,Math.sqrt(Math.max(0,1-cos*cos))*m.Lu),dF=n.clone().multiplyScalar(L).sub(elbow);
      const solved=armQuats(sx,elbow.applyQuaternion(rig.FqInv),dF.applyQuaternion(rig.FqInv),dir(a.bend||[-.25,0,1]),palm,fingers);
      applyArm(M,P,S,sx,solved,part(spec,'hand',S)||'relax',part(spec,'sh',S));
      // La mano se apoya con la muñeca dentro de su rango: el punto de apoyo se recalcula con la mano corregida.
      if(ANATOMY.on&&ANATOMY.contacts!==false&&naturalArmQuats(P.q,S,sx,armLimits(rig)))tip=local.clone().applyQuaternion(P.q['hand'+S]).applyQuaternion(rig.Fq);
    }
    if(a.pin!==false&&!a.free){place();P.pin[S]={bone:mark.bone,local:anchor.worldToLocal(rig.bone('hand'+S).getWorldPosition(V()))};}
  }
  const loc={};
  for(const def of CANON){const q=P.q[def.id];if(!q)continue;const parent=def.parent&&P.q[def.parent];loc[def.id]=parent?parent.clone().invert().multiply(q):q.clone();}
  return {t:spec.t||0,ease:spec.ease,ov:spec.ov||0,at:spec.at,loc,hipsT:P.hipsT,feet:P.feet,pin:P.pin,contact:P.contact};
}

// ---------- Tiempo: curvas, arrastre e intensidad ----------
const GROUP=Object.fromEntries(CANON.map(d=>{
  const m=d.id.match(/^(shoulder|upperArm|lowerArm|hand|upperLeg|lowerLeg|foot|toes|thumb|index|middle|ring|little)\d?([LR])$/);
  const group=m?({shoulder:'sh',upperArm:'ua',lowerArm:'la',hand:'hd',upperLeg:'root',lowerLeg:'root',foot:'root',toes:'root'}[m[1]]||'fg'):({hips:'root',upperChest:'chest2'}[d.id]||d.id);
  return [d.id,{group,side:m?m[2]:''}];
}));
const LAG={root:0,spine:.02,chest:.035,chest2:.05,neck:.08,head:.1,sh:.06,ua:.08,la:.12,hd:.16,fg:.21},LOOSE={root:.5,spine:.6,chest:.7,chest2:.75,neck:.8,head:.9,sh:.9,ua:1,la:1.2,hd:1.5,fg:1.7};
// io: entrada y salida suaves (por defecto) · c: lo mismo, más seco · o/oo: llega frenando · i/ii: sale acelerando (caídas).
const EASE={lin:u=>u,io:u=>u*u*u*(u*(u*6-15)+10),c:u=>u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2,s:smooth,o:u=>1-Math.pow(1-u,3),oo:u=>1-Math.pow(1-u,4),i:u=>u*u*u,ii:u=>u*u};
function weight(B,u,loose){const e=EASE[B.ease]||EASE.io,ov=B.ov*loose;if(!ov)return e(u);const p=B.at||.7;return u<p?(1+ov)*e(u/p):1+ov*(1-smooth((u-p)/(1-p)));}
function resolveRecipe(rig,M,recipe){
  let R=M.recipes.get(recipe);if(R)return R;
  // `base` es la postura de partida y de llegada cuando no es estar de pie (por ejemplo, sentado).
  const body=recipe.body||{},keys=[...(body.keys||[])].sort((a,b)=>a.t-b.t).map(k=>resolveKey(rig,M,k)),D=recipe.duration,base=body.base?resolveKey(rig,M,body.base):M.idle;
  if(!keys.length||keys[0].t>1e-6)keys.unshift({...base,t:0});
  if(keys.at(-1).t<D-1e-6)keys.push({...base,t:D,ease:body.settle||'io',ov:0});
  let seed=0;for(const c of recipe.id)seed=(seed*31+c.charCodeAt(0))%9973;
  // `lead`: lado que adelanta (el otro llega 30 ms tarde); 'both' = los dos a la vez (aplausos, manos juntas).
  R={keys,D,base,layers:body.layers||[],drag:body.drag??1,late:body.lead==='R'?'L':body.lead==='both'?'':'R',life:body.life??1,breath:body.breath??1,seed,scaled:new Map()};
  M.recipes.set(recipe,R);return R;
}
/** Giro de mundo (espacio del personaje) de un hueso a partir de giros locales, como en sampleRecipe. */
function worldQ(loc,id){
  const l=loc[id];if(!l)return null;const parent=CANON_BY_ID[id].parent,p=parent&&loc[parent]?worldQ(loc,parent):null;
  return p?p.clone().multiply(l):l.clone();
}
/**
 * Brazo a media intensidad. Interpolar los giros del hombro entre «brazo abajo» y «brazo arriba» pasa
 * por el brazo en cruz; un animador acorta el gesto acercando la mano y doblando el codo. Aquí se
 * interpola la posición de la mano y del codo (respecto a la clavícula, para que siga al tronco) y se
 * resuelve el brazo con su longitud real; la orientación de la mano y los dedos se conservan.
 */
function reachArm(M,S,sx,fa,idleLoc,keyLoc,out){
  const m=M.arm[S],ids=['shoulder'+S,'upperArm'+S,'lowerArm'+S,'hand'+S];
  if(!ids.every(c=>idleLoc[c]&&keyLoc[c]&&out[c]))return;
  const X=V(sx,0,0),rel=loc=>{
    const inv=worldQ(loc,ids[0]).invert(),elbow=X.clone().applyQuaternion(worldQ(loc,ids[1])).multiplyScalar(m.Lu);
    return {elbow:elbow.clone().applyQuaternion(inv),hand:elbow.add(X.clone().applyQuaternion(worldQ(loc,ids[2])).multiplyScalar(m.Lf)).applyQuaternion(inv)};
  };
  const a=rel(idleLoc),b=rel(keyLoc);if(a.hand.distanceTo(b.hand)<.03*m.Lu)return;
  const sh=worldQ(out,ids[0]),target=a.hand.lerp(b.hand,fa).applyQuaternion(sh),pole=a.elbow.lerp(b.elbow,fa).applyQuaternion(sh);
  const L=clamp(target.length(),Math.abs(m.Lu-m.Lf)+1e-5,(m.Lu+m.Lf)*.995),n=target.clone().normalize(),bend=pole.clone().addScaledVector(n,-pole.dot(n));
  if(bend.lengthSq()<1e-10)return;bend.normalize();
  const cos=clamp((m.Lu*m.Lu+L*L-m.Lf*m.Lf)/(2*m.Lu*L),-1,1),elbow=n.clone().multiplyScalar(cos*m.Lu).addScaledVector(bend,Math.sqrt(1-cos*cos)*m.Lu),dF=n.clone().multiplyScalar(L).sub(elbow);
  const qH=worldQ(out,ids[3]),solved=armQuats(sx,elbow,dF,bend,V(0,-1,0).applyQuaternion(qH),V(1,0,0).applyQuaternion(qH).multiplyScalar(sx));
  out[ids[1]]=sh.clone().invert().multiply(solved.qU);out[ids[2]]=solved.qU.clone().invert().multiply(solved.qF);out[ids[3]]=solved.qF.clone().invert().multiply(solved.qH);
}
/** Poses de una receta a una intensidad: postura y amplitud escalan; los contactos se mantienen. */
function scaled(M,R,e){
  let keys=R.scaled.get(e);if(keys)return keys;
  const k=e/INTENSITY_REFERENCE,reach=smooth(e/.3),idle=R.base,fa=Math.min(1,Math.pow(k,.6));
  keys=R.keys.map(K=>{
    const loc={};
    for(const c in K.loc){
      const {group,side}=GROUP[c],arm=group==='ua'||group==='la'||group==='hd';
      // Los brazos no se extrapolan: por encima de la referencia crecen el tronco, la cabeza, los hombros y el peso.
      const f=arm?(K.contact[side]?reach:fa):group==='fg'?clamp(k*1.4):Math.min(k,1.34);
      loc[c]=slerpU(idle.loc[c],K.loc[c],f);
    }
    if(fa>1e-6&&fa<.999)for(const [S,sx] of SIDES)if(!K.contact[S])reachArm(M,S,sx,fa,idle.loc,K.loc,loc);
    const feet={},mid=(a,b,m)=>a+(b-a)*m;for(const [S] of SIDES){const f=K.feet[S],o=idle.feet[S],m=Math.min(k,1.2);feet[S]={off:o.off.clone().lerp(f.off,m),heel:mid(o.heel,f.heel,m),yaw:mid(o.yaw,f.yaw,m),knee:mid(o.knee,f.knee,m)};}
    return {...K,loc,hipsT:idle.hipsT.clone().lerp(K.hipsT,Math.min(k,1.25)),feet};
  });
  R.scaled.set(e,keys);if(R.scaled.size>24)R.scaled.delete(R.scaled.keys().next().value);return keys;
}
function wave(L,t){
  const t0=L.t0||0,t1=L.t1??Infinity;if(t<t0||t>t1)return 0;
  const env=smooth((t-t0)/(L.in??.15))*smooth((t1-t)/(L.out??.25))*(L.decay?Math.exp(-L.decay*(t-t0)):1),x=2*Math.PI*L.f*(t-t0)+(L.ph||0)*2*Math.PI;
  return env*(L.shape==='pulse'?(1-Math.cos(x))/2:L.shape==='tri'?2/Math.PI*Math.asin(Math.sin(x)):Math.sin(x));
}
const mirror=v=>[v[0],-(v[1]||0),-(v[2]||0)];
function sampleRecipe(M,R,t,e){
  const keys=scaled(M,R,e),D=R.D,k=e/INTENSITY_REFERENCE,cache={};
  const param=(group,side)=>{
    const id=group+side;if(cache[id])return cache[id];
    const lag=(LAG[group]+(side&&side===R.late?.03:0))*R.drag,tt=clamp(t-lag*smooth((D-t)/(lag*3+.3)),0,D);
    let i=1;while(i<keys.length-1&&keys[i].t<=tt)i++;
    const A=keys[i-1],B=keys[i];return cache[id]={A,B,w:weight(B,clamp((tt-A.t)/(B.t-A.t||1)),LOOSE[group])};
  };
  const loc={};for(const c in M.idle.loc){const {group,side}=GROUP[c],{A,B,w}=param(group,side);loc[c]=slerpU(A.loc[c],B.loc[c],w);}
  const root=param('root',''),u=clamp(root.w),hipsT=root.A.hipsT.clone().lerp(root.B.hipsT,root.w),feet={},pins=[];
  for(const [S] of SIDES){
    const a=root.A.feet[S],b=root.B.feet[S],off=a.off.clone().lerp(b.off,u),step=Math.hypot(b.off.x-a.off.x,b.off.z-a.off.z);
    off.y+=Math.sin(Math.PI*u)*step*.3;feet[S]={off,heel:a.heel+(b.heel-a.heel)*u,yaw:a.yaw+(b.yaw-a.yaw)*u,knee:a.knee+(b.knee-a.knee)*u};
    // El anclaje va con el reloj del antebrazo: la muñeca la ponen brazo y antebrazo, y con el reloj de la mano
    // (que llega más tarde) el anclaje soltaba cuando el brazo ya se había ido y la mano saltaba.
    const hand=param('la',S),pa=hand.A.pin[S],pb=hand.B.pin[S],w=clamp(hand.w),reach=smooth(e/.3);
    // `approach`: cuánto va la mano hacia (o viene de) un contacto buscado. Las guardas entre brazos se relajan
    // con él de forma continua; con el peso del anclaje solo se apagarían de golpe (la mano saltaba).
    if(pa&&pb)pins.push({S,a:pa,b:pb,mix:w,weight:reach,approach:reach});else if(pb)pins.push({S,a:pb,b:pb,mix:1,weight:smooth((w-.55)/.45)*reach,approach:w*reach});else if(pa)pins.push({S,a:pa,b:pa,mix:0,weight:(1-smooth(w/.8))*reach,approach:(1-w)*reach});
  }
  // Capas rítmicas (risa, sollozo, saludo…) y vida: respiración y microdesplazamientos durante las pausas.
  const alive=smooth(t/.45)*smooth((D-t)/.45)*Math.min(1,e*4),add=(c,v,s)=>{if(loc[c]&&s)loc[c].multiply(euler(v,s));};
  const chain=(v,s)=>{for(const c in SPINE)add(c,v,s*SPINE[c]);},headTurn=(v,s)=>{add('neck',v,s*NECK);add('head',v,s*(1-NECK));};
  const shrug=(S,sx,up,fwd)=>{const c='shoulder'+S;if(loc[c])loc[c].premultiply(Q().setFromAxisAngle(V(0,0,1),sx*up*RAD).multiply(Q().setFromAxisAngle(V(0,1,0),-sx*fwd*RAD)));};
  for(const L of R.layers){
    const s=wave(L,t-(L.lag||0))*(L.fixed?1:Math.min(k,1.34));if(!s)continue;
    if(L.on==='torso')chain(L.v,s);else if(L.on==='head')headTurn(L.v,s);else if(L.on==='hipsT')hipsT.add(V(...L.v).multiplyScalar(s));
    else if(L.on==='sh'||L.on==='shL'||L.on==='shR'){for(const [S,sx] of SIDES)if(L.on==='sh'||L.on==='sh'+S)shrug(S,sx,L.v[0]*s,(L.v[1]||0)*s);}
    else if(loc[L.on])add(L.on,L.v,s);
    else for(const [S,sx] of SIDES)add(L.on+S,sx>0?L.v:mirror(L.v),s*(S===R.late?(L.late??1):1));
  }
  if(alive){
    const n=(i,f)=>Math.sin(t*f*1.7+R.seed*.37+i*2.1)*.6+Math.sin(t*f*.83+R.seed*.11+i*4.3)*.4,life=alive*R.life,breath=Math.sin(t*1.75*R.breath+R.seed)*alive*R.breath;
    chain([n(1,.9)*.7-breath*1.1,n(2,.7)*.8,n(3,.8)*.5],life);headTurn([n(4,1.1)*.9+breath*.5,n(5,.9)*1.1,n(6,1)*.7],life);
    for(const [S,sx] of SIDES){shrug(S,sx,breath*.9,0);add('upperArm'+S,[n(7+sx,.8)*.9,n(9+sx,.9)*.6,n(11+sx,.7)*.8],life);}
  }
  const q={};for(const def of CANON){const l=loc[def.id];if(l)q[def.id]=def.parent&&q[def.parent]?q[def.parent].clone().multiply(l):l.clone();}
  return {q,hips:hipsT,feet,pins};
}

// ---------- Proyecto → esqueleto ----------
/** Pose canónica de un proyecto en un instante. Determinista: no guarda estado entre llamadas. */
export function sampleActingProject(rig,project,time,recipes){
  const M=measureBody(rig),idle=sampleIdle(M),out={q:Object.fromEntries(Object.entries(idle.q).map(([c,q])=>[c,q.clone()])),hips:V(),feet:idle.feet,pins:[],active:false};
  for(const i of [...(project?.instances||[])].sort((a,b)=>a.priority-b.priority||a.start-b.start||a.id.localeCompare(b.id))){
    if(!i.acting)continue;
    // Cada actuación puede tener estilo (femenino «F» / masculino «M»): su receta está en `id@estilo`.
    const recipe=(i.acting.style&&recipes.get(i.acting.id+'@'+i.acting.style))||recipes.get(i.acting.id),preset=project.presets.find(p=>p.id===i.presetId),elapsed=time-i.start;
    if(!recipe||!preset||elapsed<0||elapsed>i.duration+1e-9)continue;
    const span=i.trimEnd-i.trimStart,local=i.trimStart+(i.loop&&elapsed<i.duration?elapsed%span:elapsed/i.duration*span),t=clamp(local/preset.duration)*recipe.duration;
    const fade=(i.fadeIn?smooth(elapsed/i.fadeIn):1)*(i.fadeOut?smooth((i.duration-elapsed)/i.fadeOut):1),s=sampleRecipe(M,resolveRecipe(rig,M,recipe),t,i.acting.intensity);
    for(const c in s.q){
      if(i.blend==='additive'){const delta=idle.q[c].clone().invert().multiply(s.q[c]);out.q[c].multiply(slerpU(Q(),delta,fade));}
      else out.q[c].slerp(s.q[c],fade);
    }
    out.hips.lerp(s.hips,fade);out.feet=Object.fromEntries(SIDES.map(([S])=>[S,{off:out.feet[S].off.clone().lerp(s.feet[S].off,fade),heel:s.feet[S].heel*fade,yaw:s.feet[S].yaw*fade,knee:s.feet[S].knee*fade}]));
    out.pins=s.pins.map(p=>({...p,weight:p.weight*fade,approach:(p.approach??p.weight)*fade}));out.active=true;
  }
  return out;
}
function sampleIdle(M){
  if(!M.idleSample){const q={};for(const def of CANON){const l=M.idle.loc[def.id];if(l)q[def.id]=def.parent&&q[def.parent]?q[def.parent].clone().multiply(l):l.clone();}M.idleSample={q,feet:M.idle.feet};}
  return M.idleSample;
}
/** Aplica el proyecto al personaje: pose, pies plantados y contactos de mano. */
export function applyActingProject(rig,project,time,recipes){
  const s=sampleActingProject(rig,project,time,recipes);
  rig.applyCanonical(s);rig.root.updateMatrixWorld(true);
  plantFeet(rig,measureBody(rig).level,s.feet);
  for(const p of s.pins){
    if(p.weight<=.001)continue;
    const bones=['upperArm','lowerArm','hand'].map(n=>rig.bone(n+p.S)),A=rig.bone(p.a.bone),B=rig.bone(p.b.bone);if(!bones.every(Boolean)||!A||!B)continue;
    const current=bones[2].getWorldPosition(V()),target=A.localToWorld(p.a.local.clone()).lerp(B.localToWorld(p.b.local.clone()),p.mix);
    solveTwoBone(...bones,current.lerp(target,p.weight),bones[1].getWorldPosition(V()),bones[2].getWorldQuaternion(Q()));
  }
  return finishArms(rig,s);
}
/** Pies plantados por IK (paso, talón, giro y rodilla de cada pie) sobre el suelo del personaje. */
function plantFeet(rig,level,feet){
  const h=rig.hipsHeight,world=v=>v.clone().applyQuaternion(level);
  for(const [S,sx] of SIDES){
    const bones=['upperLeg','lowerLeg','foot'].map(n=>rig.bone(n+S)),toes=rig.bone('toes'+S),f=feet[S];if(!bones.every(Boolean)||!f)continue;
    const ankle=rig.restWorldPos['foot'+S].clone(),toe=rig.restWorldPos['toes'+S],turn=Q().setFromAxisAngle(V(0,1,0),sx*f.yaw*RAD);
    if(toe&&f.heel){const lift=Q().setFromAxisAngle(rig.frame.left,f.heel*RAD);ankle.sub(toe).applyQuaternion(lift).add(toe);turn.multiply(lift);}
    ankle.add(world(V(f.off.x*sx,f.off.y,f.off.z)).multiplyScalar(h));
    const hip=bones[0].getWorldPosition(V()),pole=hip.clone().add(world(V(sx*(.16+f.knee),-.3,1)).multiplyScalar(h));
    solveTwoBone(...bones,ankle,pole,turn.clone().multiply(rig.restWorldQ['foot'+S]));
    if(toes&&f.heel){toes.parent.updateWorldMatrix(true,false);toes.quaternion.copy(toes.parent.getWorldQuaternion(Q()).invert().multiply(Q().setFromAxisAngle(V(0,1,0),sx*f.yaw*RAD).multiply(rig.restWorldQ['toes'+S])));}
  }
  rig.root.updateMatrixWorld(true);
}
function finishArms(rig,s){
  const h=rig.hipsHeight;
  // Articulaciones naturales (húmero, antebrazo, muñeca) antes de las guardas, que luego apartan el brazo.
  // El húmero solo rota en un brazo libre: se apaga de forma gradual a medida que la mano entra en un contacto.
  const pinW=S=>s.pins.filter(p=>p.S===S).reduce((m,p)=>Math.max(m,p.weight),0);
  naturalArms(rig,{L:smooth(pinW('L')/.4),R:smooth(pinW('R')/.4)});
  // Guarda final: en transiciones y gestos sin contacto el antebrazo no debe entrar en el cuerpo.
  const M=measureBody(rig);
  if(M.body&&ANATOMY.guards!==false){
    const chest=rig.bone(M.body.bone),turn=chest.getWorldQuaternion(Q()).multiply(Q().setFromRotationMatrix(M.body.rest).invert()),forward=V(0,0,1).applyQuaternion(rig.Fq).applyQuaternion(turn);
    for(const [S] of SIDES){
      const bones=['upperArm','lowerArm','hand'].map(n=>rig.bone(n+S));if(!bones.every(Boolean))continue;
      // Con la mano en un contacto solo se vigila la mitad del antebrazo junto al codo; al soltarlo, la vigilancia
      // se extiende poco a poco hasta los nudillos (antes cambiaba de golpe al 50 % y el brazo saltaba).
      const pw=s.pins.reduce((m,p)=>p.S===S?Math.max(m,p.weight):m,0),until=.9-.4*smooth((pw-.3)/.4);
      // Detrás del cuerpo (manos a la espalda con mochila, por ejemplo) hacen falta más pasadas: hay más volumen.
      for(let pass=0;pass<4;pass++){
        const pen=armDepth(rig,M,S,until);if(Math.abs(pen.depth)<.001*h)break;
        const shift=pen.depth+Math.sign(pen.depth)*.003*h,target=bones[2].getWorldPosition(V()).addScaledVector(forward,shift),pole=bones[1].getWorldPosition(V()).addScaledVector(forward,shift+pen.elbow);
        solveTwoBone(...bones,target,pole,bones[2].getWorldQuaternion(Q()));rig.root.updateMatrixWorld(true);
      }
    }
  }
  if(ANATOMY.guards!==false)limbGuard(rig,M,s);
  rig.root.updateMatrixWorld(true);
  // El IK de las guardas conserva el giro de la mano: muñeca y antebrazo vuelven a su rango (el húmero ya no rota).
  naturalArms(rig,{L:1,R:1});
  return s;
}

// ---------- Anatomía de hombro, antebrazo y muñeca ----------
/**
 * Límites (grados). Prono-supinación medida desde la posición neutra (pulgar hacia donde dobla el
 * codo, palma hacia el muslo con el brazo caído): pronación negativa, supinación positiva.
 * Muñeca: extensión, flexión, desviación cubital y radial. `humerus`: cuánto exceso de giro puede
 * absorber la rotación del húmero en un brazo libre (palmas arriba al encogerse de hombros, por ejemplo).
 * `clavicleFrom`/`clavicleShare`: la clavícula sube desde esa elevación del brazo, esa fracción de lo que sube.
 * Cada personaje puede ajustar estos valores con su perfil (`setArmLimits`).
 */
export const WRIST_LIMITS=Object.freeze({ext:60,flex:70,ulnar:30,radial:20,supMin:-90,supMax:95,forearmShare:.75,handTwist:22,humerus:40,clavicleFrom:35,clavicleShare:.22});
const FINGER_IDS=FINGERS.flatMap(f=>[1,2,3].map(n=>f+n));
/** Ajustes de un personaje concreto sobre los límites generales (datos del perfil, nunca código por personaje). */
const limitsByRig=new WeakMap();
export function setArmLimits(rig,overrides){measured.delete(rig);if(!overrides){limitsByRig.delete(rig);return WRIST_LIMITS;}const L=Object.freeze({...WRIST_LIMITS,...overrides});limitsByRig.set(rig,L);return L;}
export const armLimits=rig=>limitsByRig.get(rig)||WRIST_LIMITS;
const twistX=a=>Q().setFromAxisAngle(V(1,0,0),a);
const wrapAround=(a,mid)=>((a-mid+Math.PI*3)%(Math.PI*2))-Math.PI+mid;
/**
 * Límite continuo en un círculo: dentro de [lo, hi] no cambia; fuera vuelve hacia el centro a medida que se
 * acerca al lado opuesto (±180° del centro), donde las dos ramas coinciden. Recortar sin más al límite más
 * cercano salta de un extremo al otro justo en ese punto (palma completamente del revés).
 */
function softLimit(a,lo,hi){
  const mid=(lo+hi)/2,far=mid+Math.PI;
  if(a>hi)return hi+(mid-hi)*smooth((a-hi)/(far-hi));
  if(a<lo)return lo+(mid-lo)*smooth((lo-a)/(lo-(mid-Math.PI)));
  return a;
}
/** Marco del antebrazo sin torsión (X por el hueso, Y = eje del codo) y giro de prono-supinación de la mano. */
function forearmState(U,F,H,sx,L){
  const X=V(1,0,0).applyQuaternion(F),Xu=V(1,0,0).applyQuaternion(U),b=X.clone().addScaledVector(Xu,-X.dot(Xu));
  // Eje del codo: normal del plano brazo-antebrazo (como en armQuats).
  // Con el codo casi recto el plano no existe: la referencia pasa a ser el propio antebrazo (en la pose
  // muestreada lleva menos de la mitad del giro de la mano, así que la mezcla nunca es ambigua).
  const hu=V(0,1,0).applyQuaternion(F),k=smooth((Xu.angleTo(X)/RAD-10)/35);
  hu.addScaledVector(X,-hu.dot(X));if(hu.lengthSq()<1e-8)return null;hu.normalize();
  let hinge=hu;
  if(k>0){
    // Mezcla por giro alrededor del antebrazo (sumar los dos ejes pasaría por cero si son casi opuestos).
    const hg=b.multiplyScalar(sx).cross(Xu);hg.addScaledVector(X,-hg.dot(X));
    if(hg.lengthSq()>1e-10){hg.normalize();const phi=Math.atan2(X.dot(hu.clone().cross(hg)),hu.dot(hg));hinge=hu.clone().applyAxisAngle(X,phi*k);}
  }
  const F0=basis(X,hinge),Rh=F0.clone().invert().multiply(H);if(Rh.w<0){Rh.x*=-1;Rh.y*=-1;Rh.z*=-1;Rh.w*=-1;}
  // Codo casi recto: el húmero puede rotar y absorber el giro, así que el rango crece.
  const bend=Xu.angleTo(X)/RAD,free=90*(1-smooth(bend/25)),lo=(L.supMin-free)*RAD,hi=(L.supMax+free)*RAD;
  // Supinar es girar en −X en los dos lados: el marco canónico tiene X = +x en ambos. El giro se lee
  // alrededor del centro del rango, así nunca da la vuelta por el lado corto (±180°).
  const tau=2*Math.atan2(Rh.x,Rh.w),sup=wrapAround(-tau,(lo+hi)/2);
  return {F0,Rh,tau,sup,lo,hi,bend,straight:1-k,excess:sup<lo?sup-lo:sup>hi?sup-hi:0};
}
/**
 * Corrige en un mapa de giros canónicos (de mundo) hombro, antebrazo, mano y dedos de un lado.
 * · Brazo libre con la palma más girada de lo posible: primero rota el húmero (el codo cambia de
 *   dirección y la mano conserva su orientación), como hace el cuerpo.
 * · El resto del giro de la palma lo hace el antebrazo; la muñeca solo conserva un resto pequeño.
 * · Flexión/extensión y desviación de la muñeca quedan dentro de una elipse anatómica.
 */
export function naturalArmQuats(q,S,sx,L=WRIST_LIMITS,report=null,{free=0}={}){
  const U=q['upperArm'+S],F=q['lowerArm'+S],H=q['hand'+S];if(!U||!F||!H)return false;
  let st=forearmState(U,F,H,sx,L);if(!st)return false;
  if(report)report[S]={sup:st.sup/RAD,bend:st.bend};
  if(free>0&&st.excess&&L.humerus){
    // Cuánto puede rotar el húmero: nada con el codo recto (no cambiaría nada) y nada en un contacto.
    const axis=V(1,0,0).applyQuaternion(U),limit=L.humerus*RAD*Number(free)*smooth((st.bend-15)/20)*(1-smooth((Math.abs(st.excess)/RAD-40)/40));let best=null;
    for(const sign of [1,-1]){
      if(limit<1e-4)break;const a=sign*Math.min(Math.abs(st.excess),limit),R=Q().setFromAxisAngle(axis,a),U2=R.clone().multiply(U),F2=R.clone().multiply(F),s2=forearmState(U2,F2,H,sx,L);
      if(s2&&Math.abs(s2.excess)<Math.abs(st.excess)-1e-4&&(!best||Math.abs(s2.excess)<Math.abs(best.s.excess)))best={U2,F2,s:s2};
    }
    if(best){U.copy(best.U2);F.copy(best.F2);st=best.s;}
  }
  const sup=softLimit(st.sup,st.lo,st.hi),tauC=-sup,swing=twistX(st.tau).invert().multiply(st.Rh);
  // Giro de la muñeca en su propio marco: Z = flexión/extensión, Y = desviación.
  if(swing.w<0){swing.x*=-1;swing.y*=-1;swing.z*=-1;swing.w*=-1;}
  const ang=2*Math.acos(clamp(swing.w,-1,1)),sn=Math.sqrt(Math.max(1e-12,1-swing.w*swing.w));
  let ext=ang*swing.z/sn*sx/RAD,uln=ang*swing.y/sn*sx/RAD;
  if(report)Object.assign(report[S],{ext,uln});
  // Con el codo recto la dirección del antebrazo la decide la guarda de colisión y puede cambiar de golpe:
  // la mano conserva entonces su orientación (el límite actúa en proporción a lo doblado que esté el codo).
  const r=Math.hypot(ext/(ext>=0?L.ext:L.flex),uln/(uln>=0?L.ulnar:L.radial));if(r>1){const f=1+(1/r-1)*(1-st.straight);ext*=f;uln*=f;}
  const ax=V(0,uln*sx,ext*sx),deg=ax.length(),swingC=deg>1e-6?Q().setFromAxisAngle(ax.normalize(),deg*RAD):Q();
  const th=clamp(tauC*(1-L.forearmShare),-L.handTwist*RAD,L.handTwist*RAD),Fn=st.F0.clone().multiply(twistX(tauC-th)),Hn=Fn.clone().multiply(twistX(th)).multiply(swingC);
  // Los dedos siguen a la mano como un sólido.
  const carry=Hn.clone().multiply(H.clone().invert());
  for(const c of FINGER_IDS)if(q[c+S])q[c+S].premultiply(carry);
  F.copy(Fn);H.copy(Hn);return true;
}
const ARM_CHAIN=['upperArm','lowerArm','hand',...FINGER_IDS];
/** Ángulos de antebrazo y muñeca de la pose actual (grados), sin corregir: diagnóstico. */
export function wristAngles(rig){const c=rig.captureCanonical(),out={};for(const [S,sx] of SIDES)naturalArmQuats(c.q,S,sx,armLimits(rig),out);return out;}
/**
 * Pasada final sobre el esqueleto: lee los giros, los corrige y escribe solo brazo, antebrazo, mano y
 * dedos. `pinned[S]` (0–1) = cuánto está la mano en un contacto: el húmero no rota (movería la mano del contacto).
 */
/** Interruptores para comparar en pruebas: pasada anatómica y guardas de colisión. */
export const ANATOMY={on:true,guards:true,contacts:true};
export function naturalArms(rig,pinned={}){
  if(!rig.humanoid||!ANATOMY.on)return;
  const c=rig.captureCanonical();
  for(const [S,sx] of SIDES){
    if(!naturalArmQuats(c.q,S,sx,armLimits(rig),null,{free:1-(+pinned[S]||0)}))continue;
    for(const n of ARM_CHAIN){
      const id=n+S,b=rig.bone(id);if(!b||!c.q[id]||!rig.Tw[id])continue;
      const W=rig.canonToWorldQ(c.q[id]).multiply(rig.Tw[id]);b.parent.updateWorldMatrix(true,false);
      b.quaternion.copy(b.parent.getWorldQuaternion(Q()).invert().multiply(W));b.updateMatrixWorld(true);
    }
  }
}
/**
 * Muslos y el otro brazo. El antebrazo (codo → muñeca) y la mano (muñeca → nudillos) se tratan como
 * cápsulas con el grosor medido en la malla; los muslos, como cápsulas cadera → rodilla con el radio del
 * pantalón. Si se tocan, la mano y el codo se desplazan lo justo hacia fuera y el brazo se resuelve con IK.
 * Un brazo con contacto intencionado (mano en el muslo, en el otro brazo…) no se toca.
 */
function limbCollisions(rig,M,s){
  const out={thigh:{L:0,R:0},arm:{L:0,R:0},push:{L:null,R:null}};if(!M.limbs)return out;
  const P=n=>rig.bone(n)?.getWorldPosition(V()),seg={};
  for(const [S] of SIDES)seg[S]={e:P('lowerArm'+S),w:P('hand'+S),k:P('middle1'+S),hip:P('upperLeg'+S),knee:P('lowerLeg'+S)};
  const closest=(q,a,b)=>{const ab=b.clone().sub(a),t=clamp(q.clone().sub(a).dot(ab)/Math.max(ab.lengthSq(),1e-12));return a.clone().addScaledVector(ab,t);};
  const fwd=V(0,0,1).applyQuaternion(rig.Fq);
  // Anclaje y aproximación por lado: una mano anclada no se aparta; mientras las manos van a un contacto
  // buscado (aplauso, manos juntas, la otra en el brazo) la guarda entre brazos se relaja poco a poco.
  // La guarda de muslos solo se relaja si la mano se apoya en la pierna (soltar la cintura no debe dejar
  // que el antebrazo atraviese el pantalón al bajar).
  const pw={L:0,R:0},leg={L:0,R:0},ap={L:0,R:0};
  for(const p of s?.pins||[]){pw[p.S]=Math.max(pw[p.S],p.weight);ap[p.S]=Math.max(ap[p.S],p.approach??p.weight);if(/^(upperLeg|lowerLeg)/.test(p.a.bone)||/^(upperLeg|lowerLeg)/.test(p.b.bone))leg[p.S]=Math.max(leg[p.S],p.weight);}
  const free=S=>1-smooth(pw[S]/.6);
  for(const [S] of SIDES){
    const A=seg[S],fS=1-smooth(leg[S]/.6);if(!A.e||!A.w)continue;
    const rA=M.limbs.fore[S],samples=[];
    for(let i=2;i<=8;i++)samples.push([A.e.clone().lerp(A.w,i/8),rA,'fore']);
    if(A.k)for(const t of [.5,1])samples.push([A.w.clone().lerp(A.k,t),rA*.75,'hand']);
    let best=null,depth=0;
    const consider=(q,c,need,kind)=>{const d=q.distanceTo(c);if(d>=need)return;const dir=d>1e-6?q.clone().sub(c).multiplyScalar(1/d):fwd.clone(),amt=need-d;if(amt>depth){depth=amt;best=dir.multiplyScalar(amt);}if(kind==='thigh')out.thigh[S]=Math.max(out.thigh[S],amt);else out.arm[S]=Math.max(out.arm[S],amt);};
    for(const [T] of SIDES){const L=seg[T];if(!L.hip||!L.knee)continue;for(const [q,r] of samples)consider(q,closest(q,L.hip,L.knee),(r+M.limbs.leg[T])*fS,'thigh');}
    const O=seg[S==='L'?'R':'L'],oS=S==='L'?'R':'L',kArm=free(S)*free(oS)*(1-smooth(Math.max(ap[S],ap[oS])/.7));
    if(O.e&&O.w&&kArm>.01)for(const [q,r,kind] of samples)if(kind==='fore')consider(q,closest(q,O.e,O.w),((r+M.limbs.fore[oS])*.5+.5*r)*kArm,'arm');
    out.push[S]=best;
  }
  return out;
}
function limbGuard(rig,M,s){
  if(!M.limbs)return;
  for(let pass=0;pass<3;pass++){
    const c=limbCollisions(rig,M,s);let moved=false;
    for(const [S] of SIDES){
      const push=c.push[S];if(!push||push.length()<.001*M.h)continue;
      const bones=['upperArm','lowerArm','hand'].map(n=>rig.bone(n+S));if(!bones.every(Boolean))continue;
      push.multiplyScalar(1+.15/(pass+1));
      solveTwoBone(...bones,bones[2].getWorldPosition(V()).add(push),bones[1].getWorldPosition(V()).add(push),bones[2].getWorldQuaternion(Q()));
      rig.root.updateMatrixWorld(true);moved=true;
    }
    if(!moved)break;
  }
}
/** Diagnóstico: cuánto entra cada antebrazo/mano en los muslos y en el otro brazo (unidades del mundo). */
export function limbPenetration(rig){const M=measureBody(rig),c=limbCollisions(rig,M,null);return {thigh:c.thigh,arm:c.arm};}
export function bakeActingClip(rig,project,recipes,{id='acting:combined',name='Actuación',fps=30}={}){
  const duration=Math.max(.1,...project.instances.map(i=>i.start+i.duration)),frames=Math.round(duration*fps)+1;
  const tracks=Object.fromEntries(Object.keys(rig.Tw).map(c=>[c,new Float32Array(frames*4)])),hips=new Float32Array(frames*3),pose=newPose();
  for(let f=0;f<frames;f++){
    applyActingProject(rig,project,f/fps,recipes);rig.captureCanonical(pose);
    for(const c in tracks){const q=pose.q[c],a=tracks[c];if(f&&a[f*4-4]*q.x+a[f*4-3]*q.y+a[f*4-2]*q.z+a[f*4-1]*q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(a,f*4);}
    pose.hips.toArray(hips,f*3);
  }
  rig.resetToRest();
  return makeClip({id,name,fps,frames,loop:false,source:'actuación',author:'SpanStories',tags:['gestos','cuerpo + rostro'],tracks,hips});
}
/** Para herramientas de autoría: pose suelta sobre el personaje (sin receta) y puntos de contacto medidos. */
export function applyActingPose(rig,spec){
  const M=measureBody(rig),K=resolveKey(rig,M,spec),recipe={id:'pose',duration:1,body:{keys:[],life:0,breath:0}},R={keys:[{...K,t:0},{...K,t:1}],D:1,base:M.idle,layers:[],drag:0,late:'R',life:0,breath:0,seed:0,scaled:new Map()};
  M.recipes.set(recipe,R);const project={presets:[{id:'p',duration:1}],instances:[{id:'i',presetId:'p',start:0,duration:1,trimStart:0,trimEnd:1,priority:0,blend:'override',loop:false,acting:{id:'pose',intensity:INTENSITY_REFERENCE}}]};
  try{return applyActingProject(rig,project,.5,new Map([['pose',recipe]]));}finally{M.recipes.delete(recipe);}
}
/** Diagnóstico: cuánto atraviesa cada antebrazo el cuerpo en la pose actual (en unidades del mundo). */
/**
 * Guarda de colisión para cualquier pose: si un antebrazo o una mano se meten en el cuerpo (medido en la malla,
 * ropa incluida), saca el brazo hacia fuera conservando el giro de la mano. Devuelve false si no hay malla que medir.
 */
export function guardArms(rig){
  const M=measureBody(rig);if(!M.body)return false;
  const h=rig.hipsHeight,chest=rig.bone(M.body.bone),turn=chest.getWorldQuaternion(Q()).multiply(Q().setFromRotationMatrix(M.body.rest).invert()),forward=V(0,0,1).applyQuaternion(rig.Fq).applyQuaternion(turn);
  for(const [S] of SIDES){
    const bones=['upperArm','lowerArm','hand'].map(n=>rig.bone(n+S));if(!bones.every(Boolean))continue;
    for(let pass=0;pass<4;pass++){
      const pen=armDepth(rig,M,S,.9);if(Math.abs(pen.depth)<.001*h)break;
      const shift=pen.depth+Math.sign(pen.depth)*.003*h,target=bones[2].getWorldPosition(V()).addScaledVector(forward,shift),pole=bones[1].getWorldPosition(V()).addScaledVector(forward,shift+pen.elbow);
      solveTwoBone(...bones,target,pole,bones[2].getWorldQuaternion(Q()));rig.root.updateMatrixWorld(true);
    }
  }
  return true;
}
export function armPenetration(rig){const M=measureBody(rig);return Object.fromEntries(SIDES.map(([S])=>[S,armDepth(rig,M,S,.9).depth]));}
