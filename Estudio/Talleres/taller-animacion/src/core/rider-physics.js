// Física del jinete sobre la silla (solo visualización; no se guarda ni se exporta).
//
// Después de colocar la pelvis del clip Rider_* sobre el asiento, se corrige el cuerpo con el caballo real:
//   1. contacto: los glúteos descansan en la silla (campo de alturas del asiento, rígido al hueso que la lleva);
//   2. piernas: IK de dos huesos hasta los estribos, rodilla hacia delante y afuera, pie con la punta algo abierta
//      y el talón abajo;
//   3. brazos: IK hasta un punto de riendas estable delante del borrén (manos quietas respecto al caballo, codos
//      abajo y atrás);
//   4. manos: muñeca recta (la mano sigue al antebrazo), pulgar arriba, palmas enfrentadas y puño cerrado sobre la
//      rienda. Devuelve por dónde pasa la rienda dentro de cada puño.
// Todo en espacio de mundo con el escalado del personaje ya aplicado.
import * as THREE from 'three';
import { solveTwoBone, setWorldQuat } from './ik.js';
import { handPoseFrom } from './procedural.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const CELL = 0.015;
const key = (x, z) => `${Math.round(x / CELL)},${Math.round(z / CELL)}`;
const DEG = Math.PI / 180;

/** Asiento, borrén y estribos medidos en la silla en reposo (coordenadas de mundo con el caballo en el origen). */
export function medirSilla(saddle, seatRest) {
  if (saddle.isSkinnedMesh) saddle.skeleton.update();
  const p = saddle.geometry.attributes.position, pts = [];
  for (let i = 0; i < p.count; i++) pts.push((saddle.isSkinnedMesh ? saddle.getVertexPosition(i, _v) : _v.fromBufferAttribute(p, i)).applyMatrix4(saddle.matrixWorld).clone());
  // Campo de alturas de la parte de arriba del asiento (entre borrén y arzón, sin faldones).
  const alto = new Map();
  for (const q of pts) {
    if (Math.abs(q.x) > 0.17 || q.y < seatRest.y - 0.12) continue;
    const k = key(q.x, q.z);
    if (!(alto.get(k) >= q.y)) alto.set(k, q.y);
  }
  // Borrén delantero: el punto más alto por delante del asiento, en el centro.
  let pomo = null;
  for (const q of pts) if (Math.abs(q.x) < 0.06 && q.z > seatRest.z + 0.05 && q.z < seatRest.z + 0.6 && (!pomo || q.y > pomo.y)) pomo = q;
  // Estribos: el fondo de cada uno (la parte más baja de la silla a cada lado).
  const estribos = [1, -1].map((s) => {
    const lado = pts.filter((q) => q.x * s > 0.05);
    const lo = Math.min(...lado.map((q) => q.y));
    const fondo = lado.filter((q) => q.y < lo + 0.02);
    const c = fondo.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(Math.max(1, fondo.length));
    return { lado: s, pisada: c.setY(lo + 0.012) }; // sobre la plancha del estribo
  });
  // Arzón trasero (cantle): el punto más alto por detrás del asiento, en el centro.
  let arzon = null;
  for (const q of pts) if (Math.abs(q.x) < 0.06 && q.z < seatRest.z - 0.05 && q.z > seatRest.z - 0.45 && q.y < seatRest.y + 0.3 && (!arzon || q.y > arzon.y)) arzon = q;
  return { alto, pomo: pomo || seatRest.clone().add(new THREE.Vector3(0, 0.12, 0.3)), arzon: arzon || seatRest.clone().add(new THREE.Vector3(0, 0.1, -0.22)), estribos };
}

const GRIP = handPoseFrom('agarre_rienda', 'Agarre de rienda', { index: 78, middle: 84, ring: 88, little: 92 }, 38, 0);
// Pulgar tendido sobre el puño, apuntando adelante por encima de la rienda (no levantado como «me gusta»):
// en la pose T el pulgar sale a 45° entre los dedos y el frente; se gira hacia los dedos y se dobla un poco.
for (const S of ['L', 'R']) {
  const s = S === 'L' ? -1 : 1;
  const ry = (d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d * DEG);
  const rz = (d) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), d * DEG);
  const t1 = ry(-s * 42).multiply(rz(s * 14)), t2 = t1.clone().multiply(rz(s * 24)), t3 = t2.clone().multiply(rz(s * 20));
  Object.assign(GRIP.q, { ['thumb1' + S]: t1, ['thumb2' + S]: t2, ['thumb3' + S]: t3 });
}

/** Datos fijos del jinete: vértices de los glúteos (para el contacto) y medidas del pie. */
function medirJinete(rig, holder) {
  const hb = rig.bone('hips'), sets = [];
  holder.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible) return;
    const ix = o.geometry.attributes.skinIndex, w = o.geometry.attributes.skinWeight, hi = o.skeleton.bones.indexOf(hb);
    if (hi < 0 || !ix || !w) return;
    const sel = [];
    for (let i = 0; i < ix.count; i += 3) {
      let s = 0; for (let j = 0; j < 4; j++) if (ix.getComponent(i, j) === hi) s += w.getComponent(i, j);
      if (s >= 0.5) sel.push(i);
    }
    if (sel.length) sets.push([o, sel]);
  });
  const rp = rig.restWorldPos;
  const pie = ['L', 'R'].map((s) => (rp['toes' + s] && rp['foot' + s] ? Math.hypot(rp['toes' + s].x - rp['foot' + s].x, rp['toes' + s].z - rp['foot' + s].z) : 0.12));
  const tobillo = Math.min(rp.footL?.y ?? 0.08, rp.footR?.y ?? 0.08);
  return { sets, pie, tobillo };
}

export class RiderPhysics {
  constructor(rig, holder) {
    this.rig = rig; this.holder = holder;
    this.j = medirJinete(rig, holder);
    this.puños = [null, null];
  }

  /**
   * seat: { bone, rest, restInv, silla } · G: rotación de mundo del marco canónico del jinete ya colocado
   * (cadera girada × Fq) · path: rumbo del caballo · o: { contacto: 'pleno'|'subir'|0, piernas, brazos, manos } (0…1).
   */
  aplicar(seat, G, path, o = {}) {
    const rig = this.rig, s = seat.silla, esc = this.holder.scale.x || 1;
    const D = new THREE.Matrix4().copy(seat.bone.matrixWorld).multiply(seat.restInv); // reposo → ahora
    const Dinv = D.clone().invert();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(path), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(path), left = new THREE.Vector3(1, 0, 0).applyQuaternion(path);
    const hb = rig.bone('hips');
    // 1. Contacto con el asiento y 2. piernas a los estribos. El IK de las piernas mueve un poco los glúteos
    // (sus vértices dependen también del muslo): se repiten las dos cosas para que el contacto quede exacto.
    const modo = o.contacto ?? 'pleno', wp = o.piernas ?? 1;
    const contacto = () => {
      this.holder.updateMatrixWorld(true);
      let gap = Infinity;
      for (const [m, sel] of this.j.sets) {
        for (const i of sel) {
          m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).applyMatrix4(Dinv);
          const h = s.alto.get(key(_v.x, _v.z));
          if (h !== undefined && _v.y - h < gap) gap = _v.y - h;
        }
      }
      if (!Number.isFinite(gap)) return;
      let dy = -0.006 - gap; // apenas hundido en el cuero
      if (modo === 'subir') dy = Math.max(0, dy);
      if (Math.abs(dy) < 1e-5) return;
      hb.getWorldPosition(_w).addScaledVector(up, dy);
      hb.parent.updateWorldMatrix(true, false);
      hb.position.copy(hb.parent.worldToLocal(_w));
      hb.updateMatrixWorld(true);
    };
    const piernas = () => {
      for (const e of s.estribos) {
        const S = e.lado > 0 ? 'L' : 'R';
        if (o.editedLegs?.has(S)) continue;
        const ul = rig.bone('upperLeg' + S), ll = rig.bone('lowerLeg' + S), ft = rig.bone('foot' + S);
        if (!ul || !ll || !ft) continue;
        const pisada = e.pisada.clone().applyMatrix4(D);
        const largo = this.j.pie[S === 'L' ? 0 : 1] * esc;
        // La plancha bajo la parte ancha del pie: el tobillo queda detrás y encima.
        const meta = pisada.clone().addScaledVector(fwd, -0.55 * largo).addScaledVector(up, this.j.tobillo * esc).addScaledVector(left, -0.012 * e.lado);
        const actual = ft.getWorldPosition(new THREE.Vector3());
        if (wp < 1) meta.lerp(actual, 1 - wp);
        // Pie animado por el usuario (claves IK): el tobillo va a su objetivo, no al estribo. La rodilla sigue
        // buscando delante y afuera, y la cadena no se estira más allá de su largo (solveTwoBone lo limita).
        const libre = o.libres?.[S];
        if (libre) meta.copy(libre);
        const cadera = ul.getWorldPosition(new THREE.Vector3());
        const polo = cadera.clone().addScaledVector(fwd, 1).addScaledVector(left, 0.45 * e.lado).addScaledVector(up, -0.2);
        const Gp = G.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-12 * DEG, 14 * DEG * e.lado, 0, 'YXZ')));
        solveTwoBone(ul, ll, ft, meta, polo, this.mundo(Gp, 'foot' + S));
        const toes = rig.bone('toes' + S);
        if (toes) { setWorldQuat(toes, this.mundo(Gp, 'toes' + S)); toes.updateMatrixWorld(true); }
      }
    };
    for (let k = 0; k < 2; k++) {
      if (modo) contacto();
      if (wp > 0) piernas();
    }
    // 3. Brazos al punto de riendas, 4. manos cerradas sobre la rienda.
    const wb = o.brazos ?? 1, wm = o.manos ?? 1;
    this.puños = [null, null];
    for (const lado of [1, -1]) {
      const S = lado > 0 ? 'L' : 'R';
      if (o.editedArms?.has(S)) continue;
      const ua = rig.bone('upperArm' + S), la = rig.bone('lowerArm' + S), hd = rig.bone('hand' + S);
      if (!ua || !la || !hd) continue;
      if (wb > 0) {
        const hombro = ua.getWorldPosition(new THREE.Vector3());
        const brazo = (hombro.distanceTo(la.getWorldPosition(_v)) + _v.distanceTo(hd.getWorldPosition(_w)));
        // Manos a un palmo por encima y delante del borrén, separadas ~32 cm (la rienda forma una «U» abierta y
        // no roza el cuello), quietas respecto al caballo.
        const pomo = s.pomo.clone().applyMatrix4(D);
        const meta = pomo.addScaledVector(fwd, 0.07).addScaledVector(up, 0.07).addScaledVector(left, 0.16 * lado);
        const d = meta.clone().sub(hombro), max = 0.86 * brazo;
        if (d.length() > max) meta.copy(hombro).addScaledVector(d.normalize(), max);
        if (wb < 1) meta.lerp(hd.getWorldPosition(_v), 1 - wb);
        const codo = la.getWorldPosition(new THREE.Vector3());
        const polo = codo.clone().addScaledVector(up, -0.6).addScaledVector(fwd, -0.45).addScaledVector(left, 0.18 * lado);
        solveTwoBone(ua, la, hd, meta, polo);
      }
      if (wm > 0) this.puños[lado > 0 ? 0 : 1] = this.mano(S, lado, G, up, wm);
    }
  }

  /** Rotación de mundo de un hueso para una rotación canónica R en el marco G. */
  mundo(G, c, R = null) {
    const rig = this.rig;
    const q = G.clone();
    if (R) q.multiply(R);
    return q.multiply(rig.FqInv).multiply(rig.Tw[c]);
  }

  /** Muñeca recta, pulgar arriba, palma hacia dentro y puño cerrado. Devuelve el canal de la rienda en el puño. */
  mano(S, lado, G, up, peso, pulgar = null) {
    const rig = this.rig, la = rig.bone('lowerArm' + S), hd = rig.bone('hand' + S);
    if (!rig.Tw['hand' + S]) return null;
    const codo = la.getWorldPosition(new THREE.Vector3()), muñeca = hd.getWorldPosition(new THREE.Vector3());
    const d = muñeca.clone().sub(codo).normalize(); // eje del antebrazo = eje de la mano (muñeca recta)
    // Pulgar arriba, con los puños apenas girados hacia dentro (10°), como en la monta clásica.
    // pulgar: dirección deseada del pulgar (p. ej. hacia dentro = agarre por encima, palma abajo, sobre el borrén).
    const ref = pulgar || up;
    const t = ref.clone().addScaledVector(d, -ref.dot(d)).normalize();
    if (!pulgar) t.applyAxisAngle(d, -10 * DEG * lado);
    // En la pose T canónica: dedos hacia ±X (su lado), pulgar hacia delante (+Z).
    const a0 = new THREE.Vector3(lado, 0, 0).applyQuaternion(G), t0 = new THREE.Vector3(0, 0, 1).applyQuaternion(G);
    const B0 = new THREE.Matrix4().makeBasis(a0, t0, a0.clone().cross(t0));
    const B1 = new THREE.Matrix4().makeBasis(d, t, d.clone().cross(t));
    const R = new THREE.Quaternion().setFromRotationMatrix(B1.multiply(B0.transpose()));
    // Mano: Q = R · (G·Fq⁻¹), W = Q · Tw (identidad canónica girada por R).
    const Qh = R.clone().multiply(G).multiply(rig.FqInv);
    const Wh = Qh.clone().multiply(rig.Tw['hand' + S]);
    if (peso < 1) Wh.slerp(hd.getWorldQuaternion(_q), 1 - peso);
    setWorldQuat(hd, Wh); hd.updateMatrixWorld(true);
    // Dedos: la pose de agarre relativa a la mano (como «Poses de mano»).
    const Qw = Wh.clone().multiply(rig.TwInv['hand' + S]);
    const Fq = rig.Fq;
    for (const f of ['thumb', 'index', 'middle', 'ring', 'little']) for (let n = 1; n <= 3; n++) {
      const c = `${f}${n}${S}`, b = rig.bone(c), local = GRIP.q[c];
      if (!b || !local || !rig.Tw[c]) continue;
      const W = Qw.clone().multiply(Fq.clone().multiply(local).multiply(rig.FqInv)).multiply(rig.Tw[c]);
      if (peso < 1) W.slerp(b.getWorldQuaternion(_q), 1 - peso);
      setWorldQuat(b, W); b.updateMatrixWorld(true);
    }
    // Canal de la rienda: entre la palma y los dedos cerrados; entra por el meñique y sale sobre el pulgar.
    const P = (c) => rig.bone(c)?.getWorldPosition(new THREE.Vector3());
    const i1 = P('index1' + S), i2 = P('index2' + S), l1 = P('little1' + S), l2 = P('little2' + S);
    if (!i1 || !l1) return null;
    const centro = i1.clone().add(l1).add(i2 || i1).add(l2 || l1).multiplyScalar(0.25);
    const ancho = i1.distanceTo(l1);
    const salida = centro.clone().addScaledVector(t, 0.8 * ancho);
    // Pulgar sobre la rienda: la yema se apoya encima de la rienda, donde sale del puño sobre el índice, y
    // apunta hacia delante (hacia el bocado). Se apunta la cadena del pulgar a esa meta en vez de usar ángulos
    // fijos, que en cada rig dejaban el pulgar escondido delante del puño o levantado.
    if (peso > 0.5 && i2) this.pulgar(S, salida.clone().addScaledVector(t, 0.16 * ancho).addScaledVector(d, 0.42 * ancho));
    return { centro, eje: t.clone(), entrada: centro.clone().addScaledVector(t, -0.75 * ancho), salida, d };
  }

  /** Gira la base del pulgar para que su yema quede en «meta» (mundo); la flexión de las falanges se conserva. */
  pulgar(S, meta) {
    const rig = this.rig, b = [1, 2, 3].map((n) => rig.bone('thumb' + n + S));
    if (b.some((x) => !x)) return;
    for (let k = 0; k < 2; k++) {
      const p = b.map((x) => x.getWorldPosition(new THREE.Vector3()));
      const yema = p[2].clone().add(p[2].clone().sub(p[1]).multiplyScalar(0.9));
      const de = yema.sub(p[0]).normalize(), a = meta.clone().sub(p[0]).normalize();
      if (de.dot(a) > 0.9995) break;
      _q.setFromUnitVectors(de, a);
      setWorldQuat(b[0], _q.multiply(b[0].getWorldQuaternion(new THREE.Quaternion())));
      b[0].updateMatrixWorld(true);
    }
  }
}

/** Lomo y ancho del barril del caballo en reposo (malla del cuerpo: la piel con más vértices). */
export function medirCuerpo(root) {
  let body = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !/silla|saddle/i.test(o.name) && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  if (!body) return { ancho: 0.3, grupa: 1.37 };
  body.skeleton.update();
  const p = body.geometry.attributes.position;
  let ancho = 0, grupa = 0;
  for (let i = 0; i < p.count; i += 2) {
    body.getVertexPosition(i, _v).applyMatrix4(body.matrixWorld);
    if (_v.y > 0.95 && _v.y < 1.45 && _v.z > -0.7 && _v.z < 0.25) ancho = Math.max(ancho, Math.abs(_v.x));
    if (Math.abs(_v.x) < 0.08 && _v.z > -0.95 && _v.z < -0.35) grupa = Math.max(grupa, _v.y);
  }
  return { ancho: ancho || 0.3, grupa: grupa || 1.37 };
}
