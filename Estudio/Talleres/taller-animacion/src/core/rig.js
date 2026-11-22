// Rig: envuelve un personaje cargado (GLB/FBX/maniquí) y traduce entre sus huesos reales
// y el espacio canónico (rotaciones de mundo relativas a una pose T ideal).
import * as THREE from 'three';
import { CANON, CANON_BY_ID, CANON_CHILD, detectMapping } from './humanoid.js';
import { isARPHorse } from './quadruped.js';
import { prepareHorseHierarchy, horseMapping } from './horse-editor.js';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** Pose del escenario en el espacio del modelo, independiente de la jerarquía local de edición. */
export function applySceneBoneMatrices(root, bones, matrices, matched) {
  const indices = new Map(bones.map((bone, i) => [bone, i]));
  const local = new THREE.Matrix4(), model = new THREE.Matrix4();
  root.updateWorldMatrix(true, true);
  root.traverse(bone => {
    const i = indices.get(bone);
    if (i === undefined || matched && !matched[i]) return;
    bone.parent.updateWorldMatrix(true, false);
    local.copy(bone.parent.matrixWorld).invert().multiply(root.matrixWorld).multiply(model.fromArray(matrices, i * 16))
      .decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateWorldMatrix(false, false);
  });
}

export function collectBones(root) {
  const skinned = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) o.skeleton.bones.forEach((b) => skinned.add(b));
  });
  const out = [];
  root.traverse((o) => {
    if (o === root) return;
    if (o.isBone || skinned.has(o)) out.push(o);
  });
  if (out.length) return { bones: out, skinned };
  // Sin huesos: nodos vacíos (animación exportada sin malla).
  root.traverse((o) => {
    if (o !== root && !o.isMesh && !o.isLight && !o.isCamera && o.children !== undefined) out.push(o);
  });
  return { bones: out, skinned };
}

/**
 * Pone los huesos en la pose de enlace (la de la piel: la T real del rig de Mixamo).
 * En los FBX con piel la pose guardada en los nodos puede ser otra (primer fotograma,
 * agachado…), y medir desde ahí deforma las animaciones al pasarlas a otro personaje.
 */
export function poseToBind(root) {
  const world = new Map();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    // Bind relativo a donde está ahora la malla: si el personaje se giró o escaló tras cargarlo
    // (p. ej. un FBX Z-arriba enderezado), los huesos siguen a la malla.
    // Pero el GLTFLoader enlaza la malla antes de calcular la jerarquía (bindMatrix = identidad): en un GLB con el
    // armature girado y escalado (Don Quijote: +90° en X, ×0,01) esa corrección aplicaría el giro dos veces y lo tumbaría.
    // Se usa la referencia (con o sin corrección) que deja los huesos donde están ahora, al cargarlos.
    const corregido = new THREE.Matrix4().copy(o.matrixWorld).multiply(new THREE.Matrix4().copy(o.bindMatrix).invert());
    const error = (m) => {
      let e = 0;
      o.skeleton.bones.forEach((b, i) => {
        const inv = o.skeleton.boneInverses[i];
        if (!b || !inv) return;
        _v.setFromMatrixPosition(_m.copy(m).multiply(_m2.copy(inv).invert()));
        e += _v.distanceTo(_v2.setFromMatrixPosition(b.matrixWorld));
      });
      return e;
    };
    const desde = error(corregido) <= error(new THREE.Matrix4()) ? corregido : new THREE.Matrix4();
    o.skeleton.bones.forEach((b, i) => {
      const inv = o.skeleton.boneInverses[i];
      if (b && inv && !world.has(b)) world.set(b, desde.clone().multiply(new THREE.Matrix4().copy(inv).invert()));
    });
  });
  if (!world.size) return false;
  const done = new Set();
  const visit = (b) => {
    if (done.has(b) || !world.has(b)) return;
    if (b.parent && world.has(b.parent)) visit(b.parent);
    const pw = b.parent ? b.parent.matrixWorld : new THREE.Matrix4();
    _m.copy(pw).invert().multiply(world.get(b));
    _m.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
    done.add(b);
  };
  [...world.keys()].forEach(visit);
  return true;
}

export class Rig {
  constructor(root, { mapping = null } = {}) {
    this.root = root;
    this.kind = isARPHorse(root) ? 'quadruped' : 'humanoid';
    if (!root.userData.enBind) {
      poseToBind(root);
      root.userData.enBind = true;
    }
    // La escena conserva la jerarquía del GLB; el editor reconecta ramas para FK/IK.
    this.sourceParents = new Map();
    if (this.kind === 'quadruped') {
      prepareHorseHierarchy(root);
      const names = root.userData.horseSourceParents || {};
      const byName = new Map();
      root.traverse(o => { if (!byName.has(o.name)) byName.set(o.name, o); });
      root.traverse(b => {
        if (!b.isBone) return;
        this.sourceParents.set(b, byName.get(names[b.name]) || b.parent);
      });
    }
    const { bones, skinned } = collectBones(root);
    this.bones = bones;
    this.index = new Map(bones.map((b, i) => [b, i]));
    this.byName = new Map();
    bones.forEach((b) => {
      if (!this.byName.has(b.name)) this.byName.set(b.name, b);
    });
    this.restQ = bones.map((b) => b.quaternion.clone());
    this.restP = bones.map((b) => b.position.clone());
    this.restS = bones.map((b) => b.scale.clone());
    const names = [...bones].sort((a, b) => (skinned.has(b) ? 1 : 0) - (skinned.has(a) ? 1 : 0)).map((b) => b.name);
    if (this.kind === 'quadruped') {
      this.mapping = horseMapping(root);
      this.convention = 'autorig-pro-quadruped';
    } else if (mapping) {
      this.mapping = { ...mapping };
      this.convention = 'manual';
    } else {
      const det = detectMapping(names);
      this.mapping = det.mapping;
      this.convention = det.convention;
    }
    this._worldQ = bones.map(() => new THREE.Quaternion());
    this.computeFrames();
  }

  /** Marco (izquierda, arriba, delante) de la pose actual (matrixWorld al día). */
  currentFrame() {
    const P = (c) => {
      const b = this.bone(c);
      return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null;
    };
    const hips = P('hips');
    const aL = P('upperArmL') || P('upperLegL');
    const aR = P('upperArmR') || P('upperLegR');
    const top = P('head') || P('neck') || P('upperChest') || P('chest');
    if (!hips || !aL || !aR || !top) return null;
    const left = aL.sub(aR).normalize();
    const up = top.sub(hips);
    up.addScaledVector(left, -up.dot(left)).normalize();
    const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd));
  }

  /**
   * Si la animación tiene el cuerpo girado 90° o 180° respecto al reposo (FBX de Mixamo
   * con el esqueleto tumbado en Z en la pose de enlace), endereza el reposo para que
   * las medidas de cadera y huesos salgan en el mismo marco que la animación.
   * Fq0: marco del cuerpo en el primer fotograma.
   */
  alignRestTo(Fq0) {
    const D = Fq0.clone().multiply(this.FqInv);
    const e = new THREE.Matrix4().makeRotationFromQuaternion(D).elements;
    const m = [0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => e[i]);
    const r = m.map((v) => (Math.abs(v) > 0.7 ? Math.sign(v) : Math.abs(v) < 0.3 ? 0 : NaN));
    if (r.some(Number.isNaN)) return false;
    const S = new THREE.Matrix4().set(r[0], r[3], r[6], 0, r[1], r[4], r[7], 0, r[2], r[5], r[8], 0, 0, 0, 0, 1);
    if (Math.abs(S.determinant() - 1) > 1e-6) return false;
    const Sq = new THREE.Quaternion().setFromRotationMatrix(S);
    if (Math.abs(Sq.w) > 0.999) return false; // ya coincide
    this.resetToRest();
    this.root.updateMatrixWorld(true);
    const tops = this.bones.filter((b) => !b.parent || !this.index.has(b.parent));
    for (const b of tops) {
      const w = new THREE.Matrix4().makeRotationFromQuaternion(Sq).multiply(b.matrixWorld);
      const pw = b.parent ? b.parent.matrixWorld.clone().invert() : new THREE.Matrix4();
      pw.multiply(w).decompose(b.position, b.quaternion, b.scale);
      const i = this.index.get(b);
      this.restQ[i].copy(b.quaternion);
      this.restP[i].copy(b.position);
      this.restS[i].copy(b.scale);
    }
    this.computeFrames();
    return true;
  }

  setMapping(mapping) {
    if (this.kind === 'quadruped') return;
    this.mapping = { ...mapping };
    this.convention = 'manual';
    this.computeFrames();
  }

  bone(canon) {
    const n = this.mapping[canon];
    return n ? this.byName.get(n) || null : null;
  }

  resetToRest() {
    this.bones.forEach((b, i) => {
      b.quaternion.copy(this.restQ[i]);
      b.position.copy(this.restP[i]);
      b.scale.copy(this.restS[i]);
    });
  }

  computeFrames() {
    this.canonOf = new Map();
    for (const [c, n] of Object.entries(this.mapping)) {
      const b = this.byName.get(n);
      if (b) this.canonOf.set(b, c);
      else delete this.mapping[c];
    }
    this.resetToRest();
    this.root.updateMatrixWorld(true);
    const wp = {};
    const wq = {};
    for (const c of Object.keys(this.mapping)) {
      const b = this.bone(c);
      b.matrixWorld.decompose(_v, _q, _s);
      wp[c] = _v.clone();
      wq[c] = _q.clone();
    }
    this.restWorldPos = wp;
    this.restWorldQ = wq;
    const has = (c) => !!wp[c];
    this.humanoid = this.kind !== 'quadruped' && has('hips') && (has('upperArmL') || has('upperLegL')) && (has('upperArmR') || has('upperLegR'));
    if (this.kind === 'quadruped') this.horseRestWorld = new Map(this.bones.map(b => [b, b.matrixWorld.clone()]));
    // Marco del personaje: X = su izquierda, Y = arriba, Z = delante.
    const left = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    if (this.humanoid) {
      if (has('upperArmL') && has('upperArmR')) left.copy(wp.upperArmL).sub(wp.upperArmR);
      else left.copy(wp.upperLegL).sub(wp.upperLegR);
      const top = ['head', 'neck', 'upperChest', 'chest', 'spine'].find(has);
      if (top) up.copy(wp[top]).sub(wp.hips);
      left.normalize();
      up.addScaledVector(left, -up.dot(left)).normalize();
      if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
    }
    const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
    this.frame = { left, up, fwd };
    this.Fq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd));
    this.FqInv = this.Fq.clone().invert();
    // Corrección de cada hueso hacia la pose T ideal.
    this.Tw = {};
    const corr = {};
    for (const def of CANON) {
      const c = def.id;
      if (!has(c)) continue;
      let C = null;
      const kids = CANON_CHILD[c] || [];
      const kid = kids.find(has);
      // Clavícula: cada esqueleto la tiene en un ángulo distinto (Quaternius hacia atrás,
      // Mixamo hacia abajo). Se mide desde su propio reposo, unida al pecho, para no
      // levantar ni sacar los hombros al pasar animaciones de un esqueleto a otro.
      if (kid && !/^shoulder[LR]$/.test(c)) {
        const d = _v.copy(wp[kid]).sub(wp[c]);
        if (d.lengthSq() > 1e-10) {
          d.normalize();
          const ideal = _v2.fromArray(def.dir).normalize().applyQuaternion(this.Fq);
          C = new THREE.Quaternion().setFromUnitVectors(d, ideal);
        }
      }
      if (!C) {
        let p = def.parent;
        while (p && !corr[p]) p = CANON_BY_ID[p].parent;
        C = p ? corr[p].clone() : new THREE.Quaternion();
      }
      corr[c] = C;
      this.Tw[c] = C.clone().multiply(wq[c]);
    }
    this.TwInv = Object.fromEntries(Object.entries(this.Tw).map(([k, q]) => [k, q.clone().invert()]));
    // Altura de cadera (unidad de las traslaciones canónicas).
    let h = 1;
    if (has('hips')) {
      const feet = ['footL', 'footR', 'toesL', 'toesR'].filter(has);
      if (feet.length) {
        const lo = Math.min(...feet.map((f) => _v.copy(wp[f]).dot(up)));
        h = wp.hips.dot(up) - lo;
        if (has('footL')) h += 0.05 * h; // el tobillo no es el suelo
      } else if (has('head')) h = wp.head.distanceTo(wp.hips) * 1.4;
    }
    this.hipsHeight = h > 1e-6 ? h : 1;
    // Grupo de cada hueso (para máscaras): el del ancestro canónico más cercano.
    this.groupOf = new Map();
    for (const b of this.bones) {
      let o = b;
      let g = null;
      while (o && !g) {
        const c = this.canonOf.get(o);
        if (c) g = CANON_BY_ID[c].group;
        o = o.parent;
      }
      this.groupOf.set(b, g || 'torso');
    }
    // Suelo: la altura más baja de los huesos en reposo.
    this.root.updateMatrixWorld(true);
  }

  /** Aplica una pose canónica {q:{canon:Quaternion}, hips:Vector3|null} a los huesos (parte de la pose de reposo). */
  applyCanonical(pose) {
    this.resetToRest();
    if (!pose || !this.humanoid) return;
    const bones = this.bones;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      const p = b.parent;
      const pi = this.index.get(p);
      const pq = pi !== undefined ? this._worldQ[pi] : p ? p.getWorldQuaternion(_q2) : _q2.identity();
      const c = this.canonOf.get(b);
      const qc = c && pose.q[c];
      const W = this._worldQ[i];
      if (qc) {
        W.copy(this.Fq).multiply(qc).multiply(this.FqInv).multiply(this.Tw[c]);
        b.quaternion.copy(pq).invert().multiply(W);
      } else {
        W.copy(pq).multiply(this.restQ[i]);
      }
    }
    const hb = this.bone('hips');
    if (hb && pose.hips) {
      _v.copy(pose.hips).applyQuaternion(this.Fq).multiplyScalar(this.hipsHeight).add(this.restWorldPos.hips);
      if (hb.parent) {
        hb.parent.updateWorldMatrix(true, false);
        _m.copy(hb.parent.matrixWorld).invert();
        _v.applyMatrix4(_m);
      }
      hb.position.copy(_v);
    }
  }

  /** Lee la pose actual de los huesos (matrixWorld al día) en espacio canónico. */
  captureCanonical(out = { q: {}, hips: new THREE.Vector3() }) {
    for (const c of Object.keys(this.Tw)) {
      const b = this.bone(c);
      b.matrixWorld.decompose(_v, _q, _s);
      const q = out.q[c] || (out.q[c] = new THREE.Quaternion());
      q.copy(_q).multiply(this.TwInv[c]);
      q.premultiply(this.FqInv).multiply(this.Fq);
    }
    const hb = this.bone('hips');
    if (hb) {
      hb.matrixWorld.decompose(_v, _q, _s);
      out.hips.copy(_v).sub(this.restWorldPos.hips).applyQuaternion(this.FqInv).divideScalar(this.hipsHeight);
    }
    return out;
  }

  /** Convierte una dirección/vector canónico normalizado a mundo. */
  canonToWorldVec(v, out = new THREE.Vector3()) {
    return out.copy(v).applyQuaternion(this.Fq).multiplyScalar(this.hipsHeight);
  }
  worldToCanonVec(v, out = new THREE.Vector3()) {
    return out.copy(v).divideScalar(this.hipsHeight).applyQuaternion(this.FqInv);
  }
  canonToWorldQ(q, out = new THREE.Quaternion()) {
    return out.copy(this.Fq).multiply(q).multiply(this.FqInv);
  }
  worldToCanonQ(q, out = new THREE.Quaternion()) {
    return out.copy(this.FqInv).multiply(q).multiply(this.Fq);
  }

  worldPos(bone, out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(bone.matrixWorld);
  }
}
