// IK analítico de dos huesos (brazo / pierna) con polo.
import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _nb = new THREE.Vector3();
const _nc = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

export function getWorldQuat(o, out = new THREE.Quaternion()) {
  return o.getWorldQuaternion(out);
}

export function setWorldQuat(o, q) {
  if (o.parent) {
    o.parent.getWorldQuaternion(_qp);
    o.quaternion.copy(_qp.invert().multiply(q));
  } else o.quaternion.copy(q);
}

/**
 * Resuelve upper→lower→end para que end llegue a target, doblando hacia pole.
 * endQuat (opcional): rotación de mundo deseada para el hueso final.
 * Requiere matrixWorld al día. Devuelve la posición del codo/rodilla resultante.
 */
export function solveTwoBone(upper, lower, end, target, pole, endQuat = null) {
  _a.setFromMatrixPosition(upper.matrixWorld);
  _b.setFromMatrixPosition(lower.matrixWorld);
  _c.setFromMatrixPosition(end.matrixWorld);
  const lab = _a.distanceTo(_b);
  const lbc = _b.distanceTo(_c);
  if (lab < 1e-9 || lbc < 1e-9) return null;
  _dir.copy(target).sub(_a);
  let d = _dir.length();
  if (d < 1e-9) return null;
  _dir.divideScalar(d);
  d = THREE.MathUtils.clamp(d, Math.abs(lab - lbc) + 1e-5, lab + lbc - 1e-5);
  _bend.copy(pole).sub(_a);
  _bend.addScaledVector(_dir, -_bend.dot(_dir));
  if (_bend.lengthSq() < 1e-12) {
    _bend.copy(_b).sub(_a);
    _bend.addScaledVector(_dir, -_bend.dot(_dir));
  }
  if (_bend.lengthSq() < 1e-12) _bend.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  _bend.normalize();
  const cosA = THREE.MathUtils.clamp((lab * lab + d * d - lbc * lbc) / (2 * lab * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _nb.copy(_a).addScaledVector(_dir, cosA * lab).addScaledVector(_bend, sinA * lab);
  _nc.copy(_a).addScaledVector(_dir, d);
  // Hueso superior
  _u.copy(_b).sub(_a).normalize();
  _w.copy(_nb).sub(_a).normalize();
  _q.setFromUnitVectors(_u, _w);
  getWorldQuat(upper, _qw);
  setWorldQuat(upper, _qw.premultiply(_q));
  upper.updateMatrixWorld(true);
  // Hueso inferior
  _b.setFromMatrixPosition(lower.matrixWorld);
  _c.setFromMatrixPosition(end.matrixWorld);
  _u.copy(_c).sub(_b).normalize();
  _w.copy(_nc).sub(_b).normalize();
  _q.setFromUnitVectors(_u, _w);
  getWorldQuat(lower, _qw);
  setWorldQuat(lower, _qw.premultiply(_q));
  lower.updateMatrixWorld(true);
  if (endQuat) {
    setWorldQuat(end, endQuat);
    end.updateMatrixWorld(true);
  }
  return _nb.clone();
}

// ---------------------------------------------------------------------------
// IK de miembro con bisagra anatómica (piernas y brazos del editor).
//
// El solver de arriba solo «apunta» cada hueso (swing): la torsión del muslo no se corrige y la rodilla
// acaba doblando de lado o al revés. Este parte siempre de la pose FK y la corrige en dos pasos:
//   1. la rodilla/codo se dobla SOLO alrededor de su eje anatómico (un grado de libertad, 0°…150°)
//      hasta que el tobillo/muñeca queda a la distancia del objetivo (solución cerrada);
//   2. el miembro entero gira alrededor del hombro/cadera hasta el plano del polo (dirección + torsión a la vez).
// Sin ediciones (objetivo = FK, polo por defecto) el resultado es exactamente la animación.
// El polo por defecto viaja con el miembro (transporte paralelo) y en las piernas sigue el giro del pie,
// como en Blender/Herramientas (Temp IK) e iClone: la rodilla mira hacia donde va el pie.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;
const _infoCache = new WeakMap();
const smooth = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * Datos fijos de la cadena para este rig: eje de bisagra del hueso medio en su espacio local
 * (sale del espacio canónico, así que existe aunque la pierna esté recta), límites de flexión y
 * cuánto sigue la rodilla al giro del pie.
 */
export function limbInfo(rig, chain, def) {
  let per = _infoCache.get(rig);
  if (!per || per.Tw !== rig.Tw) _infoCache.set(rig, (per = { Tw: rig.Tw }));
  if (per[chain]) return per[chain];
  const [cu, cl] = def.bones;
  if (!rig.Tw?.[cl] || !rig.Tw?.[cu]) return null;
  const leg = chain.startsWith('foot');
  const sx = chain.endsWith('R') ? -1 : 1;
  // Canónico (pose T: x = izquierda, y = arriba, z = delante). Flexión positiva = hacia donde dobla de verdad.
  // Pierna: el hueso apunta a −y y la espinilla va hacia atrás (−z) → eje +x.
  // Brazo: el hueso apunta a ±x y el antebrazo va hacia delante (+z) → eje (0, −sx, 0).
  const hc = leg ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, -sx, 0);
  const hT = hc.applyQuaternion(rig.Fq);
  const info = {
    leg,
    lhLower: hT.clone().applyQuaternion(rig.TwInv[cl]).normalize(),
    maxFlex: 150 * DEG,
    minFlex: 0,
    follow: leg ? 0.75 : 0,
  };
  per[chain] = info;
  return info;
}

/** Eje de bisagra del hueso medio en el mundo (requiere matrixWorld al día). */
function hingeWorld(lower, info, out) {
  return out.copy(info.lhLower).applyQuaternion(lower.getWorldQuaternion(_qw)).normalize();
}

/**
 * Hacia dónde apunta la rodilla/codo, perpendicular al eje hombro→mano (n).
 * Con el miembro doblado manda la geometría; casi recto, el eje anatómico (nunca hay ambigüedad ni cambio brusco).
 */
function kneeForward(A, B, n, hW, L1, out) {
  const u1 = _u.copy(B).sub(A).normalize();
  const kh = out.copy(u1).cross(hW);
  kh.addScaledVector(n, -kh.dot(n));
  if (kh.lengthSq() > 1e-12) kh.normalize();
  const kg = _w.copy(B).sub(A);
  kg.addScaledVector(n, -kg.dot(n));
  const g = kg.length() / (L1 || 1);
  if (g < 1e-9 || kh.lengthSq() < 1e-12) {
    if (kh.lengthSq() < 1e-12 && g >= 1e-9) out.copy(kg).normalize();
    return out;
  }
  kg.divideScalar(g * (L1 || 1));
  // hiperextendida (la geometría apunta al revés): manda el eje anatómico
  const w = kg.dot(kh) >= 0 ? smooth(0.06, 0.25, g) : 0;
  out.multiplyScalar(1 - w).addScaledVector(kg, w);
  if (out.lengthSq() < 1e-12) out.copy(kg);
  return out.normalize();
}

/** Ángulo de flexión con signo (positivo = dobla hacia donde dobla una articulación real). */
function signedFlex(u1, u2, hW) {
  return Math.atan2(hW.dot(_c.copy(u1).cross(u2)), u1.dot(u2));
}

/** Torsión de q alrededor del eje (unitario), escalada por k. */
function twistAbout(q, axis, k, out) {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  out.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  if (out.lengthSq() < 1e-12) return out.identity();
  out.normalize();
  if (k !== 1) out.slerp(_qp.identity(), 1 - k);
  return out;
}

function basisQuat(x, y, out) {
  const z = _c.copy(x).cross(y).normalize();
  const m = _m4.makeBasis(x, y, z);
  return out.setFromRotationMatrix(m);
}
const _m4 = new THREE.Matrix4();
const _f0 = new THREE.Quaternion();
const _f1 = new THREE.Quaternion();
const _rot = new THREE.Quaternion();

/**
 * Pose FK actual de la cadena (antes de resolver): posiciones, largos, eje y hacia dónde mira la rodilla.
 * poleDist: a qué distancia de la rodilla se dibuja el polo por defecto.
 */
export function limbFrame(upper, lower, end, info, poleDist) {
  const A = new THREE.Vector3().setFromMatrixPosition(upper.matrixWorld);
  const B = new THREE.Vector3().setFromMatrixPosition(lower.matrixWorld);
  const C = new THREE.Vector3().setFromMatrixPosition(end.matrixWorld);
  const L1 = A.distanceTo(B);
  const L2 = B.distanceTo(C);
  const n = C.clone().sub(A);
  const d = n.length();
  if (d > 1e-12) n.divideScalar(d);
  else n.set(0, -1, 0);
  const hW = hingeWorld(lower, info, new THREE.Vector3());
  const kf = kneeForward(A, B, n, hW, L1, new THREE.Vector3());
  const pole = B.clone().addScaledVector(kf, poleDist);
  return { A, B, C, L1, L2, d, n, kf, hW, pole, poleDist };
}

/**
 * Resuelve la cadena hacia T. fr: limbFrame() de la pose FK.
 * o.poleOff: desplazamiento del polo en el mundo (sobre el polo por defecto, que viaja con el miembro).
 * o.followQ: giro del efector respecto a la FK (en el mundo); la rodilla lo sigue en info.follow.
 * o.endQ: rotación de mundo del pie/mano. Devuelve el polo usado (mundo) y si el objetivo quedó fuera de alcance.
 */
export function solveLimb(upper, lower, end, info, fr, T, o = {}) {
  const { A, B, L1, L2 } = fr;
  if (L1 < 1e-9 || L2 < 1e-9) return null;
  // 1. Rodilla: solo alrededor de su bisagra, lo justo para que A–C mida lo que A–T.
  const hW = hingeWorld(lower, info, new THREE.Vector3());
  const r = _a.copy(B).sub(A);
  const v = _b.copy(fr.C).sub(B);
  const want = A.distanceTo(T);
  const K = (want * want - r.lengthSq() - v.lengthSq()) / 2;
  const vPar = hW.dot(v);
  const vPerp = _nb.copy(v).addScaledVector(hW, -vPar);
  const k0 = r.dot(hW) * vPar;
  const k1 = r.dot(vPerp);
  const k2 = r.dot(_nc.copy(hW).cross(v));
  const R = Math.hypot(k1, k2);
  // límites: entre 0 y 150° (si la animación ya venía fuera, no se la obliga a volver)
  const u1 = _u.copy(B).sub(A).normalize();
  const u2 = _w.copy(fr.C).sub(B).normalize();
  const flex0 = signedFlex(u1, u2, hW);
  const lo = Math.min(flex0, info.minFlex);
  const hi = Math.max(flex0, info.maxFlex);
  const clampT = (t) => Math.min(hi, Math.max(lo, flex0 + t)) - flex0;
  let theta = 0;
  if (R > 1e-12) {
    const ph = Math.atan2(k2, k1);
    const c = Math.min(1, Math.max(-1, (K - k0) / R));
    const ac = Math.acos(c);
    const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    // de las dos soluciones (doblar hacia un lado u otro) gana la que, dentro de los límites, deja el pie
    // más cerca de su distancia; a igualdad, la que menos cambia
    const err = (t) => Math.abs(k1 * Math.cos(t) + k2 * Math.sin(t) - (K - k0));
    const cands = [wrap(ph + ac), wrap(ph - ac)].map(clampT);
    cands.sort((x, y) => err(x) - err(y) || Math.abs(x) - Math.abs(y));
    theta = Math.abs(err(cands[0]) - err(cands[1])) < 1e-9 * (R + 1) && Math.abs(cands[1]) < Math.abs(cands[0]) ? cands[1] : cands[0];
  }
  if (Math.abs(theta) > 1e-9) {
    getWorldQuat(lower, _qw);
    setWorldQuat(lower, _qw.premultiply(_q.setFromAxisAngle(hW, theta)));
    lower.updateMatrixWorld(true);
  }
  // 2. Miembro entero: del plano actual al plano del polo, girando alrededor de A.
  const C1 = new THREE.Vector3().setFromMatrixPosition(end.matrixWorld);
  const nCur = C1.clone().sub(A);
  if (nCur.lengthSq() < 1e-14) return null;
  nCur.normalize();
  const kCur = kneeForward(A, B, nCur, hW, L1, new THREE.Vector3());
  kCur.addScaledVector(nCur, -kCur.dot(nCur));
  if (kCur.lengthSq() < 1e-12) return null;
  kCur.normalize();
  const nNew = T.clone().sub(A);
  const dT = nNew.length();
  if (dT < 1e-9) nNew.copy(nCur);
  else nNew.divideScalar(dT);
  // polo por defecto: la dirección de la rodilla FK, transportada al nuevo eje y girada con el pie
  const pT = fr.kf.clone().applyQuaternion(_rot.setFromUnitVectors(fr.n, nNew));
  if (o.followQ && info.follow > 0) pT.applyQuaternion(twistAbout(o.followQ, nNew, info.follow, _f1));
  pT.addScaledVector(nNew, -pT.dot(nNew));
  if (pT.lengthSq() < 1e-12) pT.copy(kCur);
  pT.normalize();
  const dd = Math.min(dT, L1 + L2);
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * (dd || 1))));
  const sinA = Math.sqrt(1 - cosA * cosA);
  const pole = A.clone().addScaledVector(nNew, L1 * cosA).addScaledVector(pT, L1 * sinA + fr.poleDist);
  if (o.poleOff) pole.add(o.poleOff);
  const pN = pole.clone().sub(A);
  pN.addScaledVector(nNew, -pN.dot(nNew));
  const pl = pN.length();
  const pNew = pT.clone();
  if (pl > 1e-9) {
    // polo casi sobre el eje: se mezcla con la dirección transportada (sin saltos)
    const w = smooth(0.02 * fr.poleDist, 0.12 * fr.poleDist, pl);
    pNew.multiplyScalar(1 - w).addScaledVector(pN.divideScalar(pl), w).normalize();
  }
  basisQuat(nCur, kCur, _f0);
  basisQuat(nNew, pNew, _f1);
  const R1 = _f1.multiply(_f0.invert());
  if (1 - Math.abs(R1.w) > 1e-12) {
    getWorldQuat(upper, _qw);
    setWorldQuat(upper, _qw.premultiply(R1));
    upper.updateMatrixWorld(true);
  }
  if (o.endQ) {
    setWorldQuat(end, o.endQ);
    end.updateMatrixWorld(true);
  }
  return { pole, out: want > L1 + L2 + 1e-6 };
}
