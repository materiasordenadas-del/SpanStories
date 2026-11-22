import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {Rig} from '../src/core/rig.js';
import {applyActingProject,sampleActingProject,bakeActingClip,measureBody,INTENSITY_REFERENCE,wristAngles,naturalArmQuats,WRIST_LIMITS} from '../src/core/acting.js';
import {jointLimitsFrom} from '../src/core/bodyprofile.js';
import {setArmLimits,armLimits} from '../src/core/acting.js';
import {ACTINGS,ACTING_BY_ID,actingProject,channelPeak,STYLES,VARIANTS,actingFor} from '../facial/ActingLibrary.mjs';
import {ARKIT,validateProject,evaluate,curve,FacialPlayer,suggestGain,validateGain} from '../facial/FacialCore.mjs';

// Read original GLB joint hierarchies in memory; leave geometry/materials/files intact.
function skeleton(file){
  const bytes=fs.readFileSync(file),data=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),joints=new Set(data.skins.flatMap(s=>s.joints));
  const nodes=data.nodes.map((n,i)=>{const o=joints.has(i)?new T.Bone():new T.Group();o.name=n.name||'node'+i;if(n.matrix)new T.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);if(n.translation)o.position.fromArray(n.translation);if(n.rotation)o.quaternion.fromArray(n.rotation);if(n.scale)o.scale.fromArray(n.scale);return o;});
  data.nodes.forEach((n,i)=>n.children?.forEach(c=>nodes[i].add(nodes[c])));const root=new T.Group();data.scenes[data.scene||0].nodes.forEach(n=>root.add(nodes[n]));return new Rig(root);
}
const rachel=()=>skeleton(new URL('../../../../SpanStories-Ciudades/assets/avatar/rachel.glb',import.meta.url));
const other=()=>skeleton(new URL('../biblioteca/personajes/Anciano Meshy (Mixamo).glb',import.meta.url));
const signature=pose=>JSON.stringify(Object.fromEntries(Object.entries(pose.q).map(([k,v])=>[k,v.toArray().map(x=>+Math.abs(x).toFixed(4))])));
const world=(rig,c)=>rig.bone(c).getWorldPosition(new T.Vector3());

test('las 50 conservan identidad y orden, y cada una tiene rostro y cuerpo propios, acotados y neutros en los extremos',()=>{
  const catalog=JSON.parse(fs.readFileSync(new URL('../public/comportamientos/catalogo.json',import.meta.url)));
  assert.deepEqual(ACTINGS.map(a=>[a.id,a.name]),catalog.behaviors.map(a=>[a.id,a.name]));
  const faces=new Set(),bodies=new Set(),rig=rachel();
  for(const a of ACTINGS){
    const p=validateProject(actingProject(a.id)),duration=a.duration,baseline=signature(sampleActingProject(rig,p,0,ACTING_BY_ID));
    assert.equal(signature(sampleActingProject(rig,p,duration,ACTING_BY_ID)),baseline,a.id+' vuelve a su postura de partida');
    const body=[],face=[];
    for(let f=0;f<=60;f++){
      const t=f/60*duration,w=evaluate(p.presets,p.instances,t);assert(Object.values(w).every(x=>x>=0&&x<=1),a.id);
      const pose=sampleActingProject(rig,p,t,ACTING_BY_ID);assert(Object.values(pose.q).every(q=>Math.abs(q.length()-1)<1e-6));
      applyActingProject(rig,p,t,ACTING_BY_ID);body.push(signature(rig.captureCanonical()));face.push(w);
    }
    assert(body.some(x=>x!==body[0]),a.id+' necesita gesto corporal');
    faces.add(JSON.stringify(face));bodies.add(JSON.stringify(body));
    assert(Object.values(evaluate(p.presets,p.instances,0)).every(x=>x===0));assert(Object.values(evaluate(p.presets,p.instances,duration)).every(x=>x===0));
    assert(Object.keys(p.presets[0].channels).length>=8,a.id+' usa pocas shape keys para leerse');
  }
  assert.equal(faces.size,50);assert.equal(bodies.size,50);
});
test('búsqueda libre, recorte, duración e intensidad sobreviven a JSON; intensidad 0 deja la postura neutra',()=>{
  const rig=rachel(),p=actingProject('behavior-40'),i=p.instances[0];i.start=1;i.duration=6;i.trimStart=.3;i.trimEnd=2.8;i.fadeIn=.2;i.fadeOut=.3;
  const encoded=validateProject(JSON.parse(JSON.stringify(p))),expected=signature(sampleActingProject(rig,encoded,3.2,ACTING_BY_ID));
  for(const t of [0,6.5,2.1,7,3.2])sampleActingProject(rig,encoded,t,ACTING_BY_ID);
  assert.equal(signature(sampleActingProject(rig,encoded,3.2,ACTING_BY_ID)),expected);
  i.acting.intensity=0;assert.equal(signature(sampleActingProject(rig,p,3.2,ACTING_BY_ID)),signature(sampleActingProject(rig,p,0,ACTING_BY_ID)));
  assert.deepEqual(evaluate(p.presets,p.instances,3.2),evaluate(encoded.presets,encoded.instances,3.2));
  assert.throws(()=>validateProject({...p,instances:[{...i,acting:{version:1,id:'unknown',intensity:1}}]}));
});
test('la intensidad general exagera o suaviza rostro y cuerpo; parpadeos y contactos se conservan',()=>{
  const rig=rachel(),at=(id,e,t)=>{const p=actingProject(id,e);applyActingProject(rig,p,t,ACTING_BY_ID);return {p,w:evaluate(p.presets,p.instances,t)};};
  // Rostro: a la intensidad de referencia la curva vale lo guardado; por encima crece y por debajo baja.
  const t=ACTING_BY_ID.get('behavior-11').duration*.45,low=at('behavior-11',.3,t).w,mid=at('behavior-11',INTENSITY_REFERENCE,t),high=at('behavior-11',1,t).w;
  assert(low.browInnerUp<mid.w.browInnerUp&&mid.w.browInnerUp<=high.browInnerUp);
  assert(Math.abs(mid.w.browInnerUp-curve(mid.p.presets[0].channels.browInnerUp,t,'spline'))<1e-9);
  // Cuerpo: la cabeza se hunde más al subir la intensidad.
  const drop=e=>{at('behavior-11',e,t);return world(rig,'head').y;};
  assert(drop(.3)>drop(INTENSITY_REFERENCE)&&drop(INTENSITY_REFERENCE)>drop(1));
  // Un parpadeo sigue cerrando el ojo aunque la actuación sea sutil.
  const blink=actingProject('behavior-01',.3),keys=blink.presets[0].channels.eyeBlinkLeft,closed=keys.find(k=>k[1]===1)[0];
  assert(evaluate(blink.presets,blink.instances,closed).eyeBlinkLeft>.7);
  // La mano de «Pensar» sigue en el mentón a media intensidad y al máximo.
  const chin=e=>{at('behavior-26',e,2);const M=measureBody(rig),mark=M.lm.chin;return world(rig,'handR').distanceTo(rig.bone(mark.bone).localToWorld(mark.local.clone()))/M.arm.R.U;};
  assert(chin(.5)<1.3&&chin(INTENSITY_REFERENCE)<1.3&&chin(1)<1.3,'la mano se separa del mentón');
});
test('editar el pico de una shape key conserva tiempos, extremos neutros y los demás canales',()=>{
  const p=actingProject('behavior-31').presets[0],before=JSON.stringify(p.channels),keys=channelPeak(p,'jawOpen',.31);
  assert.equal(Math.max(...keys.map(k=>k[1])),.31);assert.deepEqual(keys.map(k=>k[0]),p.channels.jawOpen.map(k=>k[0]));assert.equal(keys[0][1],0);assert.equal(keys.at(-1)[1],0);assert.equal(JSON.stringify(p.channels),before);
  p.channels.jawOpen=keys;validateProject({...actingProject('behavior-31'),presets:[p]});assert.equal(channelPeak(p,'mouthPucker',.5).at(-1)[1],0);
});
test('la curva continua pasa por sus claves sin salirse del rango',()=>{
  const keys=[[0,0],[.4,1],[.6,.9],[1.2,.95],[2,0]];
  for(const [t,v] of keys)assert(Math.abs(curve(keys,t,'spline')-v)<1e-9);
  for(let i=0;i<=200;i++){const v=curve(keys,i/100,'spline');assert(v>=0&&v<=1);}
  assert(curve(keys,.5,'spline')>=.9&&curve(keys,.5,'spline')<=1);
});
test('la fuerza por shape key se valida, se aplica por personaje y refuerza solo lo que se mueve poco',()=>{
  const morph=(index,size)=>({count:2,getX:()=>0,getY:v=>v===index?size:0,getZ:()=>0});
  const base={count:2,getX:v=>v?1:-1,getY:()=>0,getZ:()=>0};
  const mesh={morphTargetInfluences:[0,0,0,0],matrixWorld:new T.Matrix4(),geometry:{morphTargetsRelative:true,attributes:{position:base},morphAttributes:{position:[morph(0,.3),morph(1,.3),morph(0,.05),morph(0,1)]}}};
  const bindings={eyeBlinkLeft:[{mesh,index:0}],eyeBlinkRight:[{mesh,index:1}],browInnerUp:[{mesh,index:2}],mouthSmileLeft:[{mesh,index:3}]};
  const gain=suggestGain(bindings);
  assert(gain.browInnerUp>1&&gain.browInnerUp<=3,'una ceja débil se refuerza');assert.equal(gain.mouthSmileLeft,undefined,'una sonrisa amplia se deja como está');assert.equal(gain.eyeBlinkLeft,undefined);
  validateGain({browInnerUp:2.4,all:1.2});assert.throws(()=>validateGain({browInnerUp:9}));assert.throws(()=>validateGain({noExiste:1}));
  const player=Object.assign(Object.create(FacialPlayer.prototype),{bindings:Object.fromEntries(ARKIT.map(n=>[n,bindings[n]||[]])),enabled:false,saved:null,gain:{}});
  player.setGain({browInnerUp:2,all:1.5});player.apply({browInnerUp:.5,eyeBlinkLeft:1});
  assert.equal(mesh.morphTargetInfluences[2],1.5);assert.equal(mesh.morphTargetInfluences[0],1,'el parpadeo no se exagera con la fuerza general');
  player.restore();assert.equal(mesh.morphTargetInfluences[2],0);
  const p=actingProject('behavior-03');p.rigGain={browInnerUp:2.4};validateProject(p);p.rigGain={browInnerUp:-1};assert.throws(()=>validateProject(p));
});
test('las 50 se adaptan a Rachel y a otro esqueleto Mixamo de otro tamaño: pies donde deben y sin acumular estado',()=>{
  for(const rig of [rachel(),other()]){
    assert(rig.humanoid);const rest=new Map(['L','R'].map(s=>[s,rig.restWorldPos['foot'+s].clone()])),h=rig.hipsHeight;
    for(const a of ACTINGS){
      const p=actingProject(a.id),moves=a.body.keys.some(k=>k.footL||k.footR||k.feet)||a.seated;
      for(const u of [.15,.36,.65,.9,0]){
        applyActingProject(rig,p,a.duration*u,ACTING_BY_ID);
        for(const b of rig.bones)assert([...b.quaternion.toArray(),...b.position.toArray()].every(Number.isFinite),a.id);
        // Sin pasos ni talones levantados, los pies no se deslizan; con ellos, nunca se hunden bajo el suelo ni se alejan.
        for(const s of ['L','R']){const foot=world(rig,'foot'+s),d=foot.distanceTo(rest.get(s));assert(moves?d<h*.36:d<h*.015,a.id+' pie '+s+' '+(d/h).toFixed(3));assert(foot.y>rest.get(s).y-h*.01,a.id+' pie bajo el suelo');}
      }
    }
    const p=actingProject('behavior-26');applyActingProject(rig,p,2,ACTING_BY_ID);const expected=rig.bones.map(b=>b.quaternion.toArray());
    applyActingProject(rig,actingProject('behavior-08'),2,ACTING_BY_ID);applyActingProject(rig,p,2,ACTING_BY_ID);assert.deepEqual(rig.bones.map(b=>b.quaternion.toArray()),expected);
  }
});
test('los contactos se resuelven con las proporciones de cada personaje',()=>{
  for(const rig of [rachel(),other()]){
    const M=measureBody(rig);
    const near=(id,t,hand,mark,limit)=>{
      applyActingProject(rig,actingProject(id),t,ACTING_BY_ID);
      const m=M.lm[mark],d=world(rig,hand).distanceTo(rig.bone(m.bone).localToWorld(m.local.clone()))/M.arm.R.U;
      assert(d<limit,id+' '+hand+' → '+mark+': '+d.toFixed(2)+' manos');
    };
    near('behavior-26',2,'handR','chin',1.3);near('behavior-31',2.2,'handR','mouth',1.4);near('behavior-09',1.6,'handR','sternum',1.2);near('behavior-48',2,'handR','earR',1.5);
    // Aplauso: en el golpe las muñecas quedan juntas; entre golpes, separadas.
    const gap=t=>{applyActingProject(rig,actingProject('behavior-06'),t,ACTING_BY_ID);return world(rig,'handL').distanceTo(world(rig,'handR'))/M.arm.R.U;};
    const hit=.75+.28*3;
    assert(gap(hit)<.75,'las palmas no se encuentran: '+gap(hit).toFixed(2));assert(gap(hit-.14)>gap(hit)+.25,'el aplauso no se abre');
  }
});
test('sin saltos: ninguna articulación gira más de lo que un gesto rápido permite entre fotogramas',()=>{
  const rig=rachel();
  for(const a of ACTINGS){
    const p=actingProject(a.id),fps=60;let prev=null;
    for(let f=0;f<=Math.round(a.duration*fps);f++){
      applyActingProject(rig,p,f/fps,ACTING_BY_ID);rig.root.updateMatrixWorld(true);
      const now=Object.fromEntries(['head','upperChest','upperArmL','upperArmR','lowerArmL','lowerArmR','handL','handR'].map(c=>[c,rig.bone(c).getWorldQuaternion(new T.Quaternion())]));
      if(prev)for(const c in now)assert(now[c].angleTo(prev[c])*180/Math.PI*fps<3200,a.id+' '+c+' salta en '+(f/fps).toFixed(2)+' s');
      prev=now;
    }
  }
});
test('la receta conjunta se hornea a un clip canónico con cabeza, manos y tronco, y conserva su duración',()=>{
  const rig=rachel(),p=actingProject('behavior-41'),clip=bakeActingClip(rig,p,ACTING_BY_ID);
  assert.equal(clip.duration,4.2);for(const c of ['head','chest','upperArmR','lowerArmR','handR']){assert(clip.tracks[c]);assert(new Set([...clip.tracks[c]].map(x=>x.toFixed(4))).size>4,c);}
  // La actuación sentada empieza y termina sentada, también en el último fotograma horneado.
  const seated=bakeActingClip(rig,actingProject('behavior-07'),ACTING_BY_ID),n=seated.frames-1;
  assert(seated.hips[1]<-.3&&seated.hips[n*3+1]<-.3);
});

test('estilo femenino y masculino: las 50 existen en los dos, se distinguen, son neutras en los extremos y no saltan',()=>{
  const rig=rachel(),fps=30;
  for(const a of ACTINGS){
    const sig={};
    for(const {id:S} of STYLES){
      const r=actingFor(a.id,S),p=validateProject(actingProject(a.id,INTENSITY_REFERENCE,S));
      assert.equal(p.instances[0].acting.style,S);assert.equal(ACTING_BY_ID.get(a.id+'@'+S).style,S);
      assert(Object.values(evaluate(p.presets,p.instances,0)).every(x=>x===0)&&Object.values(evaluate(p.presets,p.instances,r.duration)).every(x=>x===0),a.id+S+' rostro neutro en los extremos');
      const start=signature(sampleActingProject(rig,p,0,ACTING_BY_ID));assert.equal(signature(sampleActingProject(rig,p,r.duration,ACTING_BY_ID)),start,a.id+S+' vuelve a su postura');
      let prev=null;const frames=[];
      for(let f=0;f<=Math.round(r.duration*fps);f++){
        const w=evaluate(p.presets,p.instances,f/fps);assert(Object.values(w).every(x=>x>=0&&x<=1),a.id+S);
        applyActingProject(rig,p,f/fps,ACTING_BY_ID);rig.root.updateMatrixWorld(true);
        const now=Object.fromEntries(['head','upperChest','lowerArmL','lowerArmR','handL','handR'].map(c=>[c,rig.bone(c).getWorldQuaternion(new T.Quaternion())]));
        if(prev)for(const c in now)assert(now[c].angleTo(prev[c])*180/Math.PI*fps<3200,a.id+S+' '+c+' salta en '+(f/fps).toFixed(2));
        prev=now;if(f%6===0)frames.push(signature(rig.captureCanonical()));
        for(const s of ['L','R'])assert(world(rig,'foot'+s).y>rig.restWorldPos['foot'+s].y-rig.hipsHeight*.01,a.id+S+' pie bajo el suelo');
      }
      sig[S]=JSON.stringify(frames);
    }
    assert.notEqual(sig.F,sig.M,a.id+' femenino y masculino deben distinguirse');
  }
  assert(Object.keys(VARIANTS).length>=10,'variantes de autor');
});
test('las variantes femeninas de autor mantienen sus contactos en dos esqueletos',()=>{
  for(const rig of [rachel(),other()]){
    const M=measureBody(rig),near=(id,t,hand,mark,limit)=>{
      applyActingProject(rig,actingProject(id,INTENSITY_REFERENCE,'F'),t,ACTING_BY_ID);
      const m=M.lm[mark],d=world(rig,hand).distanceTo(rig.bone(m.bone).localToWorld(m.local.clone()))/M.arm.R.U;
      assert(d<limit,id+' F '+hand+' → '+mark+': '+d.toFixed(2));
    };
    near('behavior-04',1.2,'handR','mouth',1.4);near('behavior-10',2.2,'handR','waistR',1.3);near('behavior-10',2.2,'handL','heartL',1.3);near('behavior-38',1.8,'handR','eyeR',1.4);
  }
});

test('articulaciones naturales: la muñeca no pasa de su rango y la palma no da la vuelta en las 50 (F y M)',()=>{
  // Con el codo doblado (el eje del codo está definido) se exige el rango completo; con el codo recto la
  // mano conserva su orientación a propósito (ver naturalArmQuats).
  for(const rig of [rachel(),other()])for(const a of ACTINGS)for(const {id:S} of STYLES){
    const r=actingFor(a.id,S),p=actingProject(a.id,undefined,S);
    for(let i=0;i<=24;i++){
      applyActingProject(rig,p,r.duration*i/24,ACTING_BY_ID);const w=wristAngles(rig);
      for(const side of ['L','R']){const x=w[side];if(x.bend<50)continue;
        const e=Math.hypot(x.ext/(x.ext>=0?WRIST_LIMITS.ext:WRIST_LIMITS.flex),x.uln/(x.uln>=0?WRIST_LIMITS.ulnar:WRIST_LIMITS.radial));
        assert(e<1.25,a.id+S+' muñeca '+side+' fuera de rango ('+x.ext.toFixed(0)+'°, '+x.uln.toFixed(0)+'°) en '+(r.duration*i/24).toFixed(2)+' s');
        assert(x.sup>WRIST_LIMITS.supMin-25&&x.sup<WRIST_LIMITS.supMax+25,a.id+S+' antebrazo '+side+' girado '+x.sup.toFixed(0)+'°');}
    }
  }
});
test('el límite de prono-supinación es continuo: ningún giro de la mano salta al cruzar la palma del revés',()=>{
  const q={upperArmL:new T.Quaternion(),lowerArmL:new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-1.2),handL:new T.Quaternion()},out=[];
  for(let d=150;d<=210;d+=2){const c={upperArmL:q.upperArmL.clone(),lowerArmL:q.lowerArmL.clone(),handL:q.lowerArmL.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),d*Math.PI/180))};naturalArmQuats(c,'L',1);out.push(c.handL);}
  for(let i=1;i<out.length;i++)assert(out[i].angleTo(out[i-1])*180/Math.PI<12,'salto de '+(out[i].angleTo(out[i-1])*180/Math.PI).toFixed(1)+'° en '+(150+2*i)+'°');
});

test('ajustes por personaje: el perfil cambia los límites de ese modelo y no los de los demás',()=>{
  assert.deepEqual(jointLimitsFrom({articulaciones:{cubital:15,pronacion:70,claviculaParte:.3}}),{ulnar:15,clavicleShare:.3,supMin:-70});
  assert.equal(jointLimitsFrom({}),null);
  const a=rachel(),b=other();setArmLimits(a,{ulnar:12,radial:10});
  assert.equal(armLimits(a).ulnar,12);assert.equal(armLimits(b).ulnar,WRIST_LIMITS.ulnar);
  for(const a2 of ACTINGS.slice(0,12)){const r=actingFor(a2.id,'F'),p=actingProject(a2.id,undefined,'F');
    for(let i=0;i<=12;i++){applyActingProject(a,p,r.duration*i/12,ACTING_BY_ID);const w=wristAngles(a);
      for(const s of ['L','R'])if(w[s].bend>=50)assert(w[s].uln<12*1.25+1&&w[s].uln>-10*1.25-1,a2.id+' cubital/radial '+w[s].uln.toFixed(1));}}
  setArmLimits(a,null);assert.equal(armLimits(a),WRIST_LIMITS);
});
