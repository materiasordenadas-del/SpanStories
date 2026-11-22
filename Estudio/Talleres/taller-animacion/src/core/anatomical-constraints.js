import * as T from 'three';
import { horseChains, horseControlPoints, horseNodes, sampleHorseClip, applyHorsePose, repairHorseDeformation } from './horse-editor.js';

const D = Math.PI / 180;
const systems = new WeakMap();
const pos = b => b.getWorldPosition(new T.Vector3());
const quat = b => b.getWorldQuaternion(new T.Quaternion());
const bendAngle = (bones,i) => pos(bones[i]).sub(pos(bones[i-1])).angleTo(pos(bones[i+1]).sub(pos(bones[i])));
const clamp = T.MathUtils.clamp;
// Closest distance between two closed segments, including parallel/zero cases.
function segmentDistance(a,b,c,d) {
  const u=b.clone().sub(a),v=d.clone().sub(c),w=a.clone().sub(c);
  const A=u.dot(u),B=u.dot(v),C=v.dot(v),E=u.dot(w),F=v.dot(w);
  let s=A*C-B*B>1e-12?clamp((B*F-C*E)/(A*C-B*B),0,1):0;
  let t=C>1e-12?clamp((B*s+F)/C,0,1):0;
  s=A>1e-12?clamp((B*t-E)/A,0,1):0;
  t=C>1e-12?clamp((B*s+F)/C,0,1):0;
  return a.clone().addScaledVector(u,s).distanceTo(c.clone().addScaledVector(v,t));
}
export const ANATOMICAL_MODES = ['anatomico', 'estilizado', 'libre'];

// Conservative EDITOR envelopes, relative to the fitted reference rig. These
// are not veterinary physiological maxima and are not gait ROM measurements.
const PROFILES = {
  shoulder: { flex:100, secondary:25 }, hip: { flex:100, secondary:25 },
  elbow: { flex:155, secondary:0 }, stifle: { flex:155, secondary:7 },
  carpus: { flex:160, secondary:7 }, hock: { flex:155, secondary:7 },
  fetlock: { flex:95, secondary:10 }, hoof: { flex:45, secondary:8 },
  spine: { flex:12, secondary:10 }, neck: { flex:35, secondary:35 },
  head: { flex:60, secondary:55 },
  pelvis: { flex:20, secondary:15 }, tailBase: { flex:60, secondary:35 },
  tail: { flex:40, secondary:25 }, ear: { flex:75, secondary:70 },
};

// Swing-twist decomposition in the bone's reference local anatomical frame.
export function splitAnatomical(q, axis) {
  const p = q.x*axis.x + q.y*axis.y + q.z*axis.z;
  const twist = new T.Quaternion(axis.x*p, axis.y*p, axis.z*p, q.w);
  if (twist.lengthSq() < 1e-14) twist.identity(); else twist.normalize();
  if (twist.w < 0) twist.set(-twist.x,-twist.y,-twist.z,-twist.w);
  const angle = 2*Math.atan2(twist.x*axis.x + twist.y*axis.y + twist.z*axis.z, twist.w);
  return { angle, swing:q.clone().multiply(twist.clone().invert()).normalize() };
}

export function anatomicalSystem(rig) {
  if (rig.kind !== 'quadruped') return null;
  let system = systems.get(rig);
  if (!system || system.rest !== rig.restQ) systems.set(rig, system = new AnatomicalConstraintSystem(rig));
  return system;
}

export class AnatomicalConstraintSystem {
  constructor(rig) {
    this.rig = rig; this.rest = rig.restQ; this.mode = 'anatomico';
    this.chains = horseChains(rig); this.joints = new Map(); this.baseline = new Map();
    this.status = new Map(); this.curves = new Map(); this.curveCache = new WeakMap();
    const world = rig.horseRestWorld;
    const P = b => new T.Vector3().setFromMatrixPosition(world.get(b));
    const Q = b => new T.Quaternion().setFromRotationMatrix(new T.Matrix4().extractRotation(world.get(b)));
    const lateral = rig.restWorldPos.upperLegL?.clone().sub(rig.restWorldPos.upperLegR || new T.Vector3()).normalize() || new T.Vector3(1,0,0);
    const add = (bone, type, axis, restBend=0) => {
      if (!bone || !world.has(bone)) return;
      const i = rig.index.get(bone), profile = PROFILES[type];
      this.joints.set(bone, { bone, type, axis:axis.clone().applyQuaternion(Q(bone).invert()).normalize(),
        q:rig.restQ[i].clone(), p:rig.restP[i].clone(), s:rig.restS[i].clone(), restBend, ...profile });
    };
    for (const [chain,bones] of Object.entries(this.chains)) {
      const front = chain.startsWith('hand');
      for (let i=0;i<bones.length;i++) {
        const a = bones[i-1], b = bones[i], c = bones[i+1];
        const u = a && P(b).sub(P(a)).normalize(), v = c && P(c).sub(P(b)).normalize();
        const axis = u && v ? new T.Vector3().crossVectors(u,v) : lateral.clone();
        const bend = u && v ? u.angleTo(v) : 0;
        if (axis.lengthSq()<1e-8) axis.copy(lateral);
        add(b, i===0 ? front?'shoulder':'hip' : i===1 ? front?'elbow':'stifle' : i===2 ? front?'carpus':'hock' : 'fetlock',axis.normalize(),bend);
      }
    }
    for (const p of horseControlPoints(rig)) {
      if (/Hoof|^toes/.test(p.canon)) add(p.bone,'hoof',lateral);
      else if (['hips','spine','chest','neck','head'].includes(p.canon)) add(p.bone,p.canon==='hips'?'pelvis':p.canon==='chest'?'spine':p.canon,lateral);
    }
    for(const b of rig.bones) {
      if(/^c_tail_0/.test(b.name))add(b,/00/.test(b.name)?'tailBase':'tail',lateral);
      if(/^c_ear_0/.test(b.name))add(b,'ear',lateral);
    }
    // Rigid split segments, not extra joints. Preserve their animation baseline
    // and disallow independent user translation/scale/torsion in constrained modes.
    this.helpers = [];
    for (const [name,b] of horseNodes(rig.root)) if (/^(thigh_stretch|leg_twist)/.test(name) && !this.joints.has(b) && !this.helpers.includes(b)) this.helpers.push(b);
  }

  parts(b,q) {
    const j = this.joints.get(b);
    return j && splitAnatomical(j.q.clone().invert().multiply(q),j.axis);
  }

  calibrate(clip) {
    if (!clip?.native) { this.curves=new Map();return; }
    if(this.curveCache.has(clip)) { this.curves=this.curveCache.get(clip);return; }
    const saved = this.rig.bones.map(b => ({p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
    const samples = new Map(Object.keys(this.chains).filter(c => c.startsWith('foot')).map(c => [c,[]]));
    for (let i=0;i<=24;i++) {
      const pose = sampleHorseClip(clip,clip.duration*i/24,{hips:new T.Vector3()});
      applyHorsePose(this.rig,pose);
      if(pose.nativeNeedsRepair)repairHorseDeformation(this.rig);
      for (const [c,points] of samples) {
        const bones = this.chains[c];
        // Measure the actual three joint centers. In legacy ARP clips the
        // twist branch inherited the proximal orientation; that quaternion
        // alone cannot measure stifle flexion.
        points.push([bendAngle(bones,1),bendAngle(bones,2)]);
      }
    }
    this.curves = samples;
    for(const [c,values] of this.curves) if(Math.max(...values.map(p=>p[0]))-Math.min(...values.map(p=>p[0]))<5*D) this.curves.delete(c);
    for(const values of this.curves.values()) values.sort((a,b)=>a[0]-b[0]);
    this.curveCache.set(clip,this.curves);
    this.rig.bones.forEach((b,i) => {b.position.copy(saved[i].p);b.quaternion.copy(saved[i].q);b.scale.copy(saved[i].s);});
    this.rig.root.updateMatrixWorld(true);
  }

  begin(mode='anatomico',clip=null) {
    this.mode = ANATOMICAL_MODES.includes(mode) ? mode : 'anatomico';
    this.calibrate(clip); this.baseline.clear(); this.status.clear();
    for (const b of [...this.joints.keys(),...this.helpers]) this.baseline.set(b,{p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()});
    this.basePoints=new Map(Object.entries(this.chains).map(([c,b])=>[c,b.map(pos)]));
    this.baseBends=new Map(Object.entries(this.chains).map(([c,b])=>[c,bendAngle(b,1)]));
    this.obstacles=new Map();
  }

  constrain(b,q=b.quaternion,soft=false) {
    const j = this.joints.get(b), base = this.baseline.get(b);
    if (!j || this.mode==='libre') return q.clone();
    const start = base?.q || j.q;
    if (q.angleTo(start)<1e-8) return q.clone();
    const factor = this.mode==='estilizado'?1.45:1;
    const a = this.parts(b,q), ref = this.parts(b,start);
    const hinge = ['elbow','stifle','carpus','hock'].includes(j.type);
    const lo = hinge ? -j.restBend+.5*D : -j.flex*D*factor;
    const hi = hinge ? j.flex*D*factor-j.restBend : j.flex*D*factor;
    const low = Math.min(lo,ref.angle), high = Math.max(hi,ref.angle);
    // Do not invalidate an authored base pose outside the editor envelope.
    let angle = clamp(a.angle,low,high);
    // Soft resistance depends on distance to the envelope, not on the number
    // of evaluations or drag events. The source pose is an exact fixed point.
    const band=8*D, upper=Math.max(ref.angle,high-band), lower=Math.min(ref.angle,low+band);
    if(soft&&angle>upper&&high>upper) angle=upper+(high-upper)*Math.tanh((angle-upper)/(high-upper));
    if(soft&&angle<lower&&lower>low) angle=lower-(lower-low)*Math.tanh((lower-angle)/(lower-low));
    const residual = ref.swing.clone().invert().multiply(a.swing);
    const swingAngle = residual.angleTo(new T.Quaternion());
    const maxSwing = j.secondary*D*factor;
    const limited = swingAngle>maxSwing && swingAngle>1e-10;
    if (limited) residual.slerp(new T.Quaternion(),1-maxSwing/swingAngle);
    const swing = ref.swing.clone().multiply(residual);
    const out = j.q.clone().multiply(swing).multiply(new T.Quaternion().setFromAxisAngle(j.axis,angle)).normalize();
    const previous=this.status.get(b);
    this.status.set(b,{ limited:previous?.limited||limited||Math.abs(a.angle-angle)>1e-7, near:Math.min(angle-low,high-angle)<8*D, type:j.type });
    return out;
  }

  apply(bones=null) {
    if (this.mode==='libre') return;
    for (const b of bones || this.joints.keys()) {
      const base = this.baseline.get(b); if (!base) continue;
      b.quaternion.copy(this.constrain(b));
      // Limb lengths follow the source clip; an editor target cannot stretch them.
      if (!['pelvis','spine','neck','head','tailBase','tail','ear'].includes(this.joints.get(b)?.type)) {
        b.position.copy(base.p); b.scale.copy(base.s);
      }
      b.updateMatrixWorld(true);
    }
    for (const b of this.helpers) {
      const base = this.baseline.get(b); if (!base) continue;
      b.position.copy(base.p);b.quaternion.copy(base.q);b.scale.copy(base.s);b.updateMatrixWorld(true);
    }
    for(const [chain,limb] of Object.entries(this.chains)) {
      this.prepareObstacles(chain);
      for(const b of limb.slice(0,-1)) this.avoidCollision(chain,b,this.baseline.get(b)?.q);
    }
  }

  prepareObstacles(chain) {
    if(this.mode==='libre'||!this.basePoints)return;
    const base=this.basePoints.get(chain),obstacles=[];
    for(let i=1;i<base.length-1;i++) {
      const radius=Math.max(.006,base[i].distanceTo(base[i+1])*.05);
      for(const [other,bones] of Object.entries(this.chains)) {
        if(other===chain)continue;
        const rest=this.basePoints.get(other),now=bones.map(pos);
        for(let j=1;j<now.length-1;j++) {
          const r=radius+Math.max(.006,rest[j].distanceTo(rest[j+1])*.05);
          const old=segmentDistance(base[i],base[i+1],rest[j],rest[j+1]);
          obstacles.push({i,a:now[j],b:now[j+1],r:Math.min(r,old)});
        }
      }
      const hips=this.rig.bone('hips'),chest=this.rig.bone('chest');
      if(hips&&chest) {
        const a=pos(hips),b=pos(chest),r=this.rig.hipsHeight*.15;
        // Distal limb versus torso capsule. This is a conservative proxy,
        // not a fitted muscle surface or a medical collision model.
        const old=segmentDistance(base[i],base[i+1],a,b);
        obstacles.push({i,a,b,r:Math.min(r,old)});
      }
    }
    this.obstacles.set(chain,obstacles);
  }

  collision(chain) {
    if(this.mode==='libre'||!this.basePoints)return 0;
    const points=this.chains[chain].map(pos);
    let extra=0;
    for(const {i,a,b,r} of this.obstacles.get(chain)||[]) {
      const p=points[i],q=points[i+1];
      // Broad phase avoids distance calculations for separated limbs.
      if(['x','y','z'].some(k=>Math.max(Math.min(p[k],q[k])-Math.max(a[k],b[k]),Math.min(a[k],b[k])-Math.max(p[k],q[k]))>=r))continue;
      extra=Math.max(extra,r-segmentDistance(p,q,a,b));
    }
    return extra;
  }

  avoidCollision(chain,b,previous) {
    if(!previous||this.collision(chain)<.0005)return;
    const desired=b.quaternion.clone();
    for(const amount of [.5,.25,0]) {
      b.quaternion.copy(previous).slerp(desired,amount);b.updateMatrixWorld(true);
      if(this.collision(chain)<.0005)break;
    }
    this.status.set(b,{...this.status.get(b),limited:true,collision:true});
  }

  couple(chain) {
    if (this.mode==='libre' || !chain.startsWith('foot')) return;
    const bones = this.chains[chain], samples = this.curves.get(chain);
    if (!samples?.length) return; // no invented physiological coupling ratio
    const a=bones[1], b=bones[2], baseA=this.parts(a,this.baseline.get(a).q).angle;
    const baseB=this.parts(b,this.baseline.get(b).q).angle;
    const curve = x => {
      const sorted = samples;
      let i=sorted.findIndex(p=>p[0]>=x); if(i<=0)return sorted[i<0?sorted.length-1:0][1];
      const [x0,y0]=sorted[i-1],[x1,y1]=sorted[i];
      return y0+(y1-y0)*clamp((x-x0)/(x1-x0||1),0,1);
    };
    const geometricBase=this.baseBends.get(chain);
    const desired = baseB+curve(geometricBase+this.parts(a,a.quaternion).angle-baseA)-curve(geometricBase);
    const p=this.parts(b,b.quaternion), tolerance=(this.mode==='estilizado'?18:7)*D;
    const angle=clamp(p.angle,desired-tolerance,desired+tolerance);
    b.quaternion.copy(this.joints.get(b).q).multiply(p.swing).multiply(new T.Quaternion().setFromAxisAngle(this.joints.get(b).axis,angle));
    b.quaternion.copy(this.constrain(b)); b.updateMatrixWorld(true);
  }

  solve(chain,target,poleOffset,rotation) {
    const bones=this.chains[chain], end=bones.at(-1), initial=pos(end), endQ=rotation.clone().multiply(quat(end));
    const points=bones.map(pos), lengths=points.slice(1).map((p,i)=>p.distanceTo(points[i]));
    const total=lengths.reduce((a,b)=>a+b,0), goal=target.clone(), root=points[0];
    if (goal.distanceTo(root)>total*.9999) goal.sub(root).setLength(total*.9999).add(root);
    if (initial.distanceTo(goal)<1e-8 && poleOffset.lengthSq()<1e-12 && rotation.angleTo(new T.Quaternion())<1e-8) return {error:0};
    this.prepareObstacles(chain);
    const axis=goal.clone().sub(root).normalize(),baseAxis=points.at(-1).clone().sub(root).normalize();
    const preferred=points[1].clone().sub(root).projectOnPlane(baseAxis);
    if(preferred.lengthSq()<1e-10) preferred.copy(this.joints.get(bones[1]).axis).applyQuaternion(quat(bones[1])).cross(baseAxis);
    preferred.normalize().applyQuaternion(new T.Quaternion().setFromUnitVectors(baseAxis,axis));
    const inHemisphere=()=>{
      const bend=pos(bones[1]).sub(root).projectOnPlane(axis);
      return bend.lengthSq()<1e-10||bend.dot(preferred)>=-1e-7;
    };
    // CCD projects onto the SAME local joint constraints at every iteration.
    // Near singular poses use the reference axes, never an arbitrary knee flip.
    for(let pass=0;pass<56;pass++) {
      for(let i=bones.length-2;i>=0;i--) {
        const b=bones[i], center=pos(b), from=pos(end).sub(center), to=goal.clone().sub(center);
        if(from.lengthSq()<1e-12||to.lengthSq()<1e-12)continue;
        const delta=new T.Quaternion().setFromUnitVectors(from.normalize(),to.normalize());
        delta.slerp(new T.Quaternion(),.2);
        const local=quat(b.parent).invert().multiply(delta.multiply(quat(b)));
        const previous=b.quaternion.clone();
        b.quaternion.copy(this.constrain(b,local));b.updateMatrixWorld(true);
        if(!inHemisphere()){b.quaternion.copy(previous);b.updateMatrixWorld(true);}
        this.avoidCollision(chain,b,previous);
      }
      if (poleOffset.lengthSq()>1e-12) {
        const axis=goal.clone().sub(root).normalize(), knee=pos(bones[1]);
        const from=knee.clone().sub(root).projectOnPlane(axis), to=from.clone().add(poleOffset).projectOnPlane(axis);
        if(from.lengthSq()>1e-10&&to.lengthSq()>1e-10) {
          const angle=Math.atan2(axis.dot(from.clone().cross(to)),from.dot(to));
          const b=bones[0], local=quat(b.parent).invert().multiply(new T.Quaternion().setFromAxisAngle(axis,clamp(angle,-.04,.04)).multiply(quat(b)));
          const previous=b.quaternion.clone();b.quaternion.copy(this.constrain(b,local));b.updateMatrixWorld(true);
          if(!inHemisphere()){b.quaternion.copy(previous);b.updateMatrixWorld(true);}
          this.avoidCollision(chain,b,previous);
        }
      }
      const before=bones[2].quaternion.clone();this.couple(chain);this.avoidCollision(chain,bones[2],before);
      if(pos(end).distanceTo(goal)<.0002)break;
    }
    end.quaternion.copy(this.constrain(end,quat(end.parent).invert().multiply(endQ)));
    end.updateMatrixWorld(true);
    return {error:pos(end).distanceTo(target),out:target.distanceTo(root)>total};
  }

  report() {
    const nodes=horseNodes(this.rig.root),segments=[];
    for(const [chain,bones] of Object.entries(this.chains)) {
      const suffix=chain.startsWith('hand')?'_dupli_001':'',side=chain.at(-1).toLowerCase();
      for(const [name,i] of [[`thigh_stretch${suffix}${side}`,1],[`leg_twist${suffix}${side}`,2]]) {
        const helper=nodes.get(name);if(!helper)continue;
        const a=pos(bones[i]),b=pos(bones[i+1]),p=pos(helper);
        segments.push({chain,helper:helper.name,joint:bones[i].name,
          centerlineError:new T.Line3(a,b).closestPointToPoint(p,true,new T.Vector3()).distanceTo(p),length:a.distanceTo(b)});
      }
    }
    return {species:'caballo', mode:this.mode, calibration:'editor envelopes; reciprocal curve sampled from source clip',
      joints:[...this.joints.values()].map(j=>({bone:j.bone.name,joint:j.type,axis:j.axis.toArray(),...this.status.get(j.bone)})),
      reciprocal:[...this.curves].map(([chain,samples])=>({chain,samples:samples.length})),
      segments,
      collision:'conservative distal limb/torso capsules; source intersections retained',
      unavailable:['independent scapula slide','separate pastern/coffin joints','independent cervical vertebrae','jaw bone (facial morphs)','musculoskeletal collision surfaces']};
  }
}
