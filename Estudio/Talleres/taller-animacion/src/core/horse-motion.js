import * as T from 'three';
import { isARPHorse } from './quadruped.js';

const V = () => new T.Vector3();
const Q = () => new T.Quaternion();
const pos = o => o.getWorldPosition(V());
const quat = o => o.getWorldQuaternion(Q());
const key = n => n.replace(/[.]/g, '');
function nodes(root) {
  const m = new Map();
  root.traverse(o => { if (!m.has(key(o.name))) m.set(key(o.name), o); });
  if(isARPHorse(root)) {
    const aliases={rootx:'hips',spine_01x:'spine',spine_02x:'chest',neckx:'neck',headx:'head'};
    for(const s of ['l','r']) {
      const S=s.toUpperCase();
      Object.assign(aliases,{['thigh_stretch'+s]:'upperLeg'+S,['leg_stretch'+s]:'lowerLeg'+S,['foot'+s]:'foot'+S,['toes_01'+s]:'toes'+S,['thigh_stretch_dupli_001'+s]:'upperArm'+S,['leg_stretch_dupli_001'+s]:'lowerArm'+S,['foot_dupli_001'+s]:'hand'+S});
    }
    for(const [n,alias] of Object.entries(aliases))if(m.has(n)&&!m.has(alias))m.set(alias,m.get(n));
  }
  return m;
}
function snapshot(root) {
  root.updateMatrixWorld(true);
  return new Map([...nodes(root)].map(([n,o]) => [n, { p:pos(o), q:quat(o), lp:o.position.clone(), lq:o.quaternion.clone(), ls:o.scale.clone() }]));
}

export const HORSE_LEGS = [
  { id:'traseraL', source:['L_Thigh','L_Calf','L_HorseLink','L_Foot','L_Toe0'], target:['c_thigh_bl','upperLegL','lowerLegL','footL','toesL'], support:['thigh_twistl','leg_twistl'] },
  { id:'traseraR', source:['R_Thigh','R_Calf','R_HorseLink','R_Foot','R_Toe0'], target:['c_thigh_br','upperLegR','lowerLegR','footR','toesR'], support:['thigh_twistr','leg_twistr'] },
  { id:'delanteraL', source:['L_Clavicle','L_UpperArm','L_Forearm','L_Hand','L_Finger0'], target:['c_thigh_b_dupli_001l','upperArmL','lowerArmL','handL','toes_01_dupli_001l'], support:['thigh_twist_dupli_001l','leg_twist_dupli_001l'] },
  { id:'delanteraR', source:['R_Clavicle','R_UpperArm','R_Forearm','R_Hand','R_Finger0'], target:['c_thigh_b_dupli_001r','upperArmR','lowerArmR','handR','toes_01_dupli_001r'], support:['thigh_twist_dupli_001r','leg_twist_dupli_001r'] },
];

// Distal joint angle (carpus / hock) is kept from the animated pose, so the
// stance correction never folds it the wrong way. The proximal joint (elbow /
// stifle) is a two-bone analytic solve that preserves its bend side and plane.
// Only if the goal is out of reach does the distal joint open, up to `maxSpan`.
// FABRIK used to reshape all three joints freely and could hyperextend the carpus.
const axisFallback = new T.Vector3(1, 0, 0);
function openDistal(p1, p2, p3, l1, l2, span) {
  const m = V().subVectors(p2, p1).cross(V().subVectors(p3, p2));
  if (m.lengthSq() < 1e-12) return;
  m.normalize();
  const want = Math.acos(T.MathUtils.clamp((l1*l1 + l2*l2 - span*span) / (2*l1*l2), -1, 1));
  const now = V().subVectors(p1, p2).angleTo(V().subVectors(p3, p2));
  const seg = V().subVectors(p3, p2);
  const a = seg.clone().applyAxisAngle(m, want - now).add(p2), b = seg.clone().applyAxisAngle(m, now - want).add(p2);
  p3.copy(Math.abs(a.distanceTo(p1) - span) < Math.abs(b.distanceTo(p1) - span) ? a : b);
}
export function horseLegReach(points, lengths, maxSpan) {
  const span = Math.max(points[3].distanceTo(points[1]), maxSpan ?? 0);
  return lengths[0] + Math.min(span, lengths[1] + lengths[2]);
}
export function solveHorseLeg(points, goal, lengths, { maxSpan } = {}) {
  const [l0, l1, l2] = lengths;
  const p0 = points[0];
  // Restore rest lengths along the current directions (rigid segments).
  for (let i = 1; i < 4; i++) points[i].sub(points[i-1]).setLength(lengths[i-1]).add(points[i-1]);
  const [, p1, p2, p3] = points;
  const oldAxis = V().subVectors(p3, p0);
  let normal = V().subVectors(p1, p0).cross(oldAxis);
  if (normal.lengthSq() < 1e-12) normal = V().subVectors(p2, p0).cross(oldAxis);
  if (normal.lengthSq() < 1e-12) normal.copy(axisFallback);
  normal.normalize();
  let span = p3.distanceTo(p1);
  const D0 = goal.distanceTo(p0);
  if (D0 > (l0 + span) * .9995 && (maxSpan ?? 0) > span) {
    span = Math.min(maxSpan, l1 + l2 * .9999, D0 - l0 * .02);
    openDistal(p1, p2, p3, l1, l2, span);
    span = p3.distanceTo(p1);
  }
  const axis = V().subVectors(goal, p0);
  const D = T.MathUtils.clamp(axis.length(), Math.abs(l0 - span) + 1e-6, (l0 + span) * .9999);
  axis.normalize();
  // Bend side: the old elbow/stifle offset, kept perpendicular to the new axis.
  let side = V().subVectors(p1, p0).projectOnPlane(oldAxis.clone().normalize());
  if (side.lengthSq() < 1e-12) side = normal.clone().cross(oldAxis);
  side.projectOnPlane(axis);
  if (side.lengthSq() < 1e-12) side = normal.clone().cross(axis);
  side.normalize();
  const x = (l0*l0 + D*D - span*span) / (2*D), h = Math.sqrt(Math.max(0, l0*l0 - x*x));
  const q1 = p0.clone().addScaledVector(axis, x).addScaledVector(side, h);
  const end = p0.clone().addScaledVector(axis, D);
  // Rigid distal sub-chain: map the old (p1→p3, plane normal) frame to the new one.
  const frame = (u, n) => { const w = V().crossVectors(u, n).normalize(); const v = V().crossVectors(w, u); return new T.Matrix4().makeBasis(u, v, w); };
  const nNew = V().subVectors(q1, p0).cross(V().subVectors(end, p0));
  const nOld = V().subVectors(p1, p0).cross(V().subVectors(p3, p0));
  const uOld = V().subVectors(p3, p1).normalize(), uNew = V().subVectors(end, q1).normalize();
  const B0 = frame(uOld, nOld.lengthSq() > 1e-12 ? nOld.normalize() : normal), B1 = frame(uNew, nNew.lengthSq() > 1e-12 ? nNew.normalize() : normal);
  const R = B1.multiply(B0.transpose());
  const r2 = V().subVectors(p2, p1).applyMatrix4(R), r3 = V().subVectors(p3, p1).applyMatrix4(R);
  p1.copy(q1); p2.copy(q1).add(r2); p3.copy(q1).add(r3);
  return points;
}

export function closeHorseCycle(original) {
  const clip=original.clone();
  for(const t of clip.tracks) {
    const n=t.getValueSize(),last=t.values.length-n;
    const end=t.times.at(-1)||clip.duration;
    if(n===4&&t.name.endsWith('.quaternion')) {
      const delta=Q().fromArray(t.values,last).invert().multiply(Q().fromArray(t.values,0));
      for(let i=0;i<t.times.length;i++) {
        const u=t.times[i]/end,w=u*u*(3-2*u);
        Q().fromArray(t.values,i*4).multiply(Q().slerp(delta,w)).normalize().toArray(t.values,i*4);
      }
    } else if(n===3&&t.name.endsWith('.position')) {
      const drift=V().fromArray(t.values,last).sub(V().fromArray(t.values));
      for(let i=0;i<t.times.length;i++)V().fromArray(t.values,i*3).addScaledVector(drift,-t.times[i]/end).toArray(t.values,i*3);
    }
  }
  return clip;
}

/** FBX Horse Animset → original AutoRig Pro deform bones, including disconnected
 * stretch/twist branches. Never changes geometry, skin weights or bind matrices. */
export class HorseMotion {
  constructor(target, source, reference, clip, { ground=true, cyclic=true }={}) {
    if (!isARPHorse(target)) throw Error('El caballo elegido no tiene un perfil AutoRig Pro de cuatro patas compatible.');
    this.target=target; this.source=source; this.clip=cyclic?closeHorseCycle(clip):clip; this.ground=ground;
    this.tn=nodes(target); this.sn=nodes(source);
    this.tr=snapshot(target); this.sr=snapshot(reference);
    for (const [n,o] of this.sn) {
      const r=this.sr.get(n);
      if (r) { o.position.copy(r.lp); o.quaternion.copy(r.lq); o.scale.copy(r.ls); }
    }
    this.mixer=new T.AnimationMixer(source);
    this.action=this.mixer.clipAction(this.clip).setLoop(T.LoopOnce,1).play();
    this.action.clampWhenFinished=true;
    this.scale=this.tr.get('hips').p.y / this.sr.get('Pelvis').p.y;
    this.legs=HORSE_LEGS.map(l=>{
      const target = [...l.target];
      // The true elbow/stifle is the proximal twist head, not the stretch
      // half halfway down the forearm/tibia (verified against the .blend).
      if (this.tn.has(l.support[0])) target[1] = l.support[0];
      return {...l, target, lengths:target.slice(1).map((n,i)=>this.tr.get(n).p.distanceTo(this.tr.get(target[i]).p)), restSpan:this.tr.get(target[3]).p.distanceTo(this.tr.get(target[1]).p)};
    });
    this.soles=this.findSoles();
    this.duration=clip.duration;
    this.frames=Math.max(2,Math.ceil(this.duration*120));
    this.samples=Array.from({length:this.frames+1},(_,i)=>{
      this.sampleSource(i*this.duration/this.frames);
      return this.legs.map(l=>pos(this.sn.get(l.source.at(-1))));
    });
    // Stance is measured independently for each hoof, retaining genuine aerial
    // phases of gallop. Estimate travel from its backward speed while planted.
    this.contacts=this.legs.map((l,j)=>{
      const ys=this.samples.map(s=>s[j].y);
      const min=Math.min(...ys), max=Math.max(...ys);
      const threshold=min+Math.max((max-min)*.12,2);
      return ys.map(y=>y<=threshold);
    });
    this.fk=Array.from({length:this.frames+1},(_,i)=>{
      this.reset();this.sampleSource(i*this.duration/this.frames);
      this.body();return this.legs.map(l=>this.legPoints(l));
    });
    const speeds=[];
    for(let j=0;j<4;j++) for(let i=1;i<this.frames;i++) if(this.contacts[j][i]&&this.contacts[j][i-1]) {
      const speed=(this.fk[i-1][j][3].z-this.fk[i][j][3].z)*this.frames/this.duration;
      if(speed>.05) speeds.push(speed);
    }
    speeds.sort((a,b)=>a-b);
    this.speed=speeds.length?speeds[Math.floor(speeds.length/2)]:0;
    this.drops=new Map();
    this.time=0; this.radius=0; this.lastReport=null;
    this.evaluate(0);
  }

  findSoles() {
    const out=this.legs.map(()=>[]);
    this.target.updateMatrixWorld(true);
    this.target.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      o.skeleton.update();
      const {skinIndex:ix,skinWeight:w,position:p}=o.geometry.attributes;
      if(!ix||!w)return;
      for(let i=0;i<p.count;i++) {
        let best=-1,weight=0;
        for(let c=0;c<4;c++) {
          const n=key(o.skeleton.bones[ix.getComponent(i,c)]?.name||'');
          const j=this.legs.findIndex(l=>l.target.slice(-2).includes(n));
          if(j>=0&&w.getComponent(i,c)>weight){weight=w.getComponent(i,c);best=j;}
        }
        if(best<0||weight<.2)continue;
        const v=o.getVertexPosition(i,V()).applyMatrix4(o.matrixWorld);
        out[best].push({mesh:o,index:i,y:v.y});
      }
    });
    return out.map((a,j)=>{
      if(!a.length)throw Error(`No se encontraron vértices de casco: ${this.legs[j].id}`);
      const min=Math.min(...a.map(v=>v.y));
      // Retain the full hoof surface for penetration measurements (incl. toes).
      return { vertices:a, min, ankleHeight:this.tr.get(this.legs[j].target[3]).p.y-min };
    });
  }

  reset() {
    for(const [n,o] of this.tn) {const r=this.tr.get(n);o.position.copy(r.lp);o.quaternion.copy(r.lq);o.scale.copy(r.ls);}
    this.target.updateMatrixWorld(true);
  }
  dispose() {
    this.reset();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.source);
  }
  sampleSource(time) {
    this.action.enabled=true;this.action.paused=false;this.action.time=time;
    this.mixer.update(0);this.source.updateMatrixWorld(true);
  }
  delta(name) {return quat(this.sn.get(name)).multiply(this.sr.get(name).q.clone().invert());}
  world(name,p,q) {
    const o=this.tn.get(name); if(!o)return;
    o.parent?.updateWorldMatrix(true,false);
    const m=new T.Matrix4().compose(p,q,V().set(1,1,1));
    if(o.parent)m.premultiply(o.parent.matrixWorld.clone().invert());
    m.decompose(o.position,o.quaternion,o.scale);
    // Keep the bone's own rest scale: a scaled model (real height) must not shrink.
    const r=this.tr.get(name);if(r)o.scale.copy(r.ls);
    o.updateMatrixWorld(true);
  }
  setSegment(name,p,next) {
    const r=this.tr.get(name), childRest=this.segmentEnd.get(name);
    const q=new T.Quaternion().setFromUnitVectors(childRest.clone().sub(r.p).normalize(),next.clone().sub(p).normalize()).multiply(r.q);
    this.world(name,p,q);
  }
  body() {
    const pelvis=this.tr.get('hips');
    const dp=pos(this.sn.get('Pelvis')).sub(this.sr.get('Pelvis').p).multiplyScalar(this.scale);
    dp.x=0;dp.z=0; // path is applied once, outside the skeleton
    dp.y-=this.bodyDrop||0;
    const hp=pelvis.p.clone().add(dp), hq=this.delta('Pelvis');
    // The Biped "Pelvis" yaws/rolls up to ~20°/34° around the hip joints (its
    // thighs sit at its pivot) while the spine stays level. Rocinante's root.x
    // pivot is 25 cm ahead of the hip joints: rotate the croup about the hip
    // joint centre instead, and do not carry that rotation into the torso.
    this.hipCentre||=['c_thigh_bl','c_thigh_br'].map(n=>this.tr.get(n)?.p).filter(Boolean).reduce((a,b,_,l)=>a.addScaledVector(b,1/l.length),V());
    const lever=this.hipCentre.lengthSq()?this.hipCentre.clone().sub(pelvis.p):V();
    this.world('hips',hp.clone().add(lever).sub(lever.clone().applyQuaternion(hq)),hq.clone().multiply(pelvis.q));
    // Torso: the spine segment follows the source spine, not the pelvis.
    // The Biped trunk pitches ~30° per gallop stride around a pivot level with
    // its back. Rocinante's spine bone sits 0.45 m under the saddle, so the same
    // angle rocks the saddle 23 cm fore-aft and throws the rider. A real gallop
    // pitches the trunk ~10–15°: keep 60% of the source trunk rotation.
    const trunk=q=>Q().slerp(q,this.trunkPitch??.5);
    const sr=this.tr.get('spine'),sq=trunk(this.delta('Spine'));
    const sp=sr.p.clone().sub(pelvis.p).add(hp);
    this.world('spine',sp,sq.clone().multiply(sr.q));
    const chr=this.tr.get('chest');
    this.world('chest',chr.p.clone().sub(sr.p).applyQuaternion(sq).add(sp),trunk(this.delta('Spine2')).multiply(chr.q));
    const cr=this.tr.get('chest'), cp=pos(this.tn.get('chest')), cq=Q().slerp(this.delta('Spine2'),this.trunkPitch??.5);
    const nq=this.delta('Neck1');
    const headRest=this.tr.get('head');
    const headP=headRest.p.clone().sub(cr.p).applyQuaternion(nq).add(cp);
    for(const n of ['neck','subneck_twist_1x','subneck_twist_2x','subneck_twist_3x']) {
      const r=this.tr.get(n);
      this.world(n,r.p.clone().sub(cr.p).applyQuaternion(nq).add(cp),nq.clone().multiply(r.q));
    }
    this.world('head',headP,this.delta('Head').multiply(headRest.q));
    for(let i=0;i<4;i++) {
      const n=`c_tail_0${i}x`,r=this.tr.get(n),s=`Tail0${i+1}`;
      const parent=i?`c_tail_0${i-1}x`:'hips';
      const parentDelta=i?this.delta(`Tail0${i}`):hq;
      const p=r.p.clone().sub(this.tr.get(parent).p).applyQuaternion(parentDelta).add(pos(this.tn.get(parent)));
      this.world(n,p,this.delta(s).multiply(r.q));
    }
    // Ear bones remain relative to the animated head; no facial curves are overwritten.
    this.bodyFrames={hp,hq,cp,cq};
  }
  legPoints(l) {
    const parent=l.id.startsWith('trasera')?'hips':'chest';
    const d=l.id.startsWith('trasera')?this.bodyFrames.hq:this.bodyFrames.cq;
    const p=this.tr.get(l.target[0]).p.clone().sub(this.tr.get(parent).p).applyQuaternion(d).add(pos(this.tn.get(parent)));
    const points=[p];
    for(let i=0;i<4;i++) {
      const s=l.source[i],next=l.source[i+1];
      const rest=this.sr.get(next).p.clone().sub(this.sr.get(s).p).normalize();
      const now=pos(this.sn.get(next)).sub(pos(this.sn.get(s))).normalize();
      const delta=Q().setFromUnitVectors(rest,now);
      const v=this.tr.get(l.target[i+1]).p.clone().sub(this.tr.get(l.target[i]).p).applyQuaternion(delta);
      points.push(points.at(-1).clone().add(v));
    }
    // Lateral limit (body frame, x = side): a hoof never comes closer to the
    // midline than 60% of its rest track. The source right foreleg goes almost
    // to the midline in stance, which makes Rocinante's leg cross in front of
    // the chest. The leg is re-solved, so lengths and bend sides are kept.
    const restX=this.tr.get(l.target[3]).p.x, minX=Math.abs(restX)*.6, side=Math.sign(restX)||1;
    if(side*points[3].x<minX) {
      const shift=side*minX-points[3].x, goal=points[3].clone();goal.x+=shift;
      const hoof=points[4].clone().sub(points[3]);
      solveHorseLeg(points.slice(0,4),goal,l.lengths.slice(0,3),{maxSpan:l.restSpan});
      points[4].copy(points[3]).add(hoof);
    }
    return points;
  }
  path(time) {
    if(!this.radius)return {p:V(),q:Q()};
    const angle=time*this.speed/this.radius;
    return {p:V().set(this.radius*(1-Math.cos(angle)),0,this.radius*Math.sin(angle)),q:Q().setFromAxisAngle(V().set(0,1,0),angle)};
  }
  stance(j,time) {
    const phase=((time%this.duration)+this.duration)%this.duration;
    const i=Math.min(this.frames-1,Math.floor(phase/this.duration*this.frames));
    if(!this.contacts[j][i])return null;
    let count=0;
    while(count<this.frames&&this.contacts[j][(i-count+this.frames)%this.frames])count++;
    return {start:time-phase+(i-count+1)*this.duration/this.frames,phase,index:i};
  }
  anchor(j,start,time) {
    const phase=((start%this.duration)+this.duration)%this.duration;
    const i=Math.round(phase/this.duration*this.frames)%this.frames;
    const p=this.fk[i][j][3].clone();
    p.y=this.soles[j].ankleHeight;
    const begin=this.path(start),now=this.path(time);
    return p.applyQuaternion(begin.q).add(begin.p).sub(now.p).applyQuaternion(now.q.clone().invert());
  }
  swingGoal(j,time,current) {
    const step=this.duration/this.frames;
    const globalFrame=Math.floor(time/step),i=((globalFrame%this.frames)+this.frames)%this.frames;
    const contact=k=>this.contacts[j][((k%this.frames)+this.frames)%this.frames];
    let back=1,forward=1;
    while(back<this.frames&&!contact(i-back))back++;
    while(forward<this.frames&&!contact(i+forward))forward++;
    if(back===this.frames||forward===this.frames)return current;
    const endFrame=globalFrame-back+1,nextFrame=globalFrame+forward;
    let beginFrame=endFrame-1;
    while(endFrame-beginFrame<this.frames&&contact(beginFrame-1))beginFrame--;
    const end=endFrame*step,next=nextFrame*step;
    const u=T.MathUtils.clamp((time-end)/(next-end),0,1),blend=u*u*(3-2*u);
    const previous=this.anchor(j,beginFrame*step,end);
    const rawEnd=this.fk[((endFrame%this.frames)+this.frames)%this.frames][j][3];
    const offset=previous.sub(rawEnd);
    const endPath=this.path(end),nowPath=this.path(time);
    offset.applyQuaternion(endPath.q).applyQuaternion(nowPath.q.clone().invert());
    const nextRaw=this.fk[((nextFrame%this.frames)+this.frames)%this.frames][j][3];
    const nextOffset=V().set(0,this.soles[j].ankleHeight-nextRaw.y,0);
    return current.clone().add(V().set(0,this.bodyDrop||0,0)).add(offset.multiplyScalar(1-blend)).add(nextOffset.multiplyScalar(blend));
  }
  bodyClearance(circle,phase) {
    if(!this.drops.has(circle)) {
      const raw=Array.from({length:this.frames},(_,i)=>{
        const time=i*this.duration/this.frames;
        let drop=0;
        for(let j=0;j<4;j++) {
          const stance=this.stance(j,time);if(!stance)continue;
          const goal=circle?this.anchor(j,stance.start,time):this.fk[i][j][3].clone();
          goal.y=this.soles[j].ankleHeight;
          const root=this.fk[i][j][0],length=horseLegReach(this.fk[i][j],this.legs[j].lengths,this.legs[j].restSpan)*.985;
          const horizontal=(root.x-goal.x)**2+(root.z-goal.z)**2;
          const available=Math.sqrt(Math.max(.01,length*length-horizontal));
          drop=Math.max(drop,root.y-goal.y-available);
        }
        return Math.max(0,drop);
      });
      // Preload support before touchdown and release it gradually after liftoff.
      const wide=raw.map((v,i)=>Math.max(...Array.from({length:9},(_,k)=>raw[(i+k-4+this.frames)%this.frames])));
      const smooth=wide.map((v,i)=>Array.from({length:5},(_,k)=>wide[(i+k-2+this.frames)%this.frames]).reduce((a,b)=>a+b,0)/5);
      this.drops.set(circle,smooth);
    }
    const f=phase/this.duration*this.frames,i=Math.floor(f),u=f-i,a=this.drops.get(circle);
    return a[i%this.frames]*(1-u)+a[(i+1)%this.frames]*u;
  }
  writeLeg(l,points) {
    for(let i=0;i<4;i++)this.setSegment(l.target[i],points[i],points[i+1]);
    const n=l.target[4];
    const q=quat(this.tn.get(l.target[3])).multiply(this.tr.get(l.target[3]).q.clone().invert()).multiply(this.tr.get(n).q);
    this.world(n,points[4],q);
    const split = HORSE_LEGS.find(leg => leg.id === l.id).target[1];
    for(const [n,i] of [[l.target[1] === l.support[0] ? split : l.support[0],1],[l.support[1],2]]) {
      const delta=quat(this.tn.get(l.target[i])).multiply(this.tr.get(l.target[i]).q.clone().invert());
      const r=this.tr.get(n), p=r.p.clone().sub(this.tr.get(l.target[i]).p).applyQuaternion(delta).add(points[i]);
      this.world(n,p,delta.multiply(r.q));
    }
  }
  soleY(j) {
    const a=this.soles[j].vertices;
    for(const o of new Set(a.map(v=>v.mesh)))o.skeleton.update();
    let min=Infinity;
    for(const {mesh,index} of a) min=Math.min(min,mesh.getVertexPosition(index,V()).applyMatrix4(mesh.matrixWorld).y);
    return min;
  }
  evaluate(time,{circle=0}={}) {
    this.time=time;this.radius=circle;
    const phase=((time%this.duration)+this.duration)%this.duration;
    this.bodyDrop=this.ground?this.bodyClearance(circle,phase):0;
    this.reset();this.sampleSource(phase);
    this.body();
    this.segmentEnd=new Map(this.legs.flatMap(l=>l.target.slice(0,4).map((n,i)=>[n,this.tr.get(l.target[i+1]).p])));
    const path=this.path(time),report=[];
    for(let j=0;j<4;j++) {
      const l=this.legs[j],p=this.legPoints(l),stance=this.ground?this.stance(j,time):null;
      let desired=null;
      if(stance) {
        // Anchor on the actual circle at touchdown, then transform back to the
        // current body frame. A planted hoof stays in the same world position.
        let goal=this.anchor(j,stance.start,time);
        if(!circle)goal=p[3].clone();
        goal.y=this.soles[j].ankleHeight;
        desired=goal.clone();
        // Keep the hoof upright while planted; solve the three joints above it.
        solveHorseLeg(p.slice(0,4),goal,l.lengths.slice(0,3),{maxSpan:l.restSpan});
        p[4].copy(p[3]).add(this.tr.get(l.target[4]).p.clone().sub(this.tr.get(l.target[3]).p));
      } else if(this.ground&&circle) {
        const goal=this.swingGoal(j,time,p[3]);
        desired=goal.clone();
        solveHorseLeg(p.slice(0,4),goal,l.lengths.slice(0,3),{maxSpan:l.restSpan});
        const hoof=this.tr.get(l.target[4]).p.clone().sub(this.tr.get(l.target[3]).p);
        p[4].copy(p[3]).add(hoof);
      }
      this.writeLeg(l,p);
      if(this.ground)for(let k=0;k<3;k++) {
        const y=this.soleY(j);
        if(y>=-.001&&(!stance||y<.003))break;
        const goal=p[3].clone();goal.y-=y;
        // In swing, keep the animated hoof angle: forcing it upright flips the fetlock.
        const hoof=stance?this.tr.get(l.target[4]).p.clone().sub(this.tr.get(l.target[3]).p):p[4].clone().sub(p[3]);
        solveHorseLeg(p.slice(0,4),goal,l.lengths.slice(0,3),{maxSpan:l.restSpan});
        p[4].copy(p[3]).add(hoof);
        this.writeLeg(l,p);
      }
      report.push({id:l.id,contact:!!stance,soleY:this.soleY(j),ankle:p[3].toArray(),world:p[3].clone().applyQuaternion(path.q).add(path.p).toArray(),goal:desired?.toArray(),reachError:desired?p[3].distanceTo(desired):0});
    }
    this.target.updateMatrixWorld(true);
    this.lastReport={time,phase,speed:this.speed,circle,path:{position:path.p.toArray(),quaternion:path.q.toArray()},legs:report};
    return this.lastReport;
  }
}
