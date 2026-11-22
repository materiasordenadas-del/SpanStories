// Desmonte por la izquierda, procedimental y biomecánico, a la medida del caballo real (solo visualización).
//
// El clip «Rider Mount Dismount Left» de Horse Animset Pro está hecho para otro caballo: con Rocinante la pierna
// derecha y el cuerpo lo atravesaban. Aquí se construye la secuencia clásica con IK sobre las medidas reales de la
// silla (asiento, borrén, arzón, estribos) y del cuerpo del caballo (altura de la grupa, ancho del barril):
//   A 0.0–0.5 s  se prepara: inclina el tronco, mano izquierda con las riendas al cuello, derecha al borrén, saca
//                los dos pies de los estribos;
//   B 0.5–1.3 s  carga el peso en las manos, sube la cadera y pasa la pierna derecha ESTIRADA en arco por encima de
//                la grupa (la trayectoria del pie gira alrededor de la cadera); la izquierda cuelga por fuera;
//   C 1.3–1.6 s  queda tumbado sobre la silla mirando al caballo, las dos piernas colgando rectas, la mano derecha
//                pasa al arzón;
//   D 1.6–2.0 s  se desliza pegado al costado con las puntas abajo, buscando el suelo;
//   E 2.0–2.5 s  aterriza sobre las dos plantas y amortigua flexionando rodillas y cadera;
//   F 2.3–3.0 s  suelta las manos y se aparta con dos pasos reales (pie izquierdo, luego derecho) girando hacia
//                delante: los pies apoyados nunca patinan.
// Trayectorias con curvas de Hermite (tangentes Catmull-Rom en el tiempo): velocidad continua, sin paradas en las
// claves. Coordenadas del caballo en reposo: x = su izquierda, y = arriba, z = adelante.
import * as THREE from 'three';
import { solveTwoBone, setWorldQuat } from './ik.js';

const DEG = Math.PI / 180;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const rampa = (t, a, b) => smooth((t - a) / (b - a));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Hermite con tangentes de Catmull-Rom no uniformes en el tiempo. keys: [[t, número|Vector3]] */
function curva(keys, t) {
  const n = keys.length, val = (p) => (typeof p === 'number' ? p : p.clone());
  if (t <= keys[0][0]) return val(keys[0][1]);
  if (t >= keys[n - 1][0]) return val(keys[n - 1][1]);
  let i = 0; while (t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1], h = t1 - t0, u = (t - t0) / h;
  const tan = (k) => {
    if (k <= 0 || k >= n - 1) return null;
    const [ta, a] = keys[k - 1], [tb, b] = keys[k + 1];
    return typeof a === 'number' ? (b - a) / (tb - ta) : b.clone().sub(a).divideScalar(tb - ta);
  };
  const m0 = tan(i), m1 = tan(i + 1);
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = -2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
  if (typeof p0 === 'number') return h00 * p0 + h01 * p1 + h * (h10 * (m0 ?? 0) + h11 * (m1 ?? 0));
  const r = new THREE.Vector3().addScaledVector(p0, h00).addScaledVector(p1, h01);
  if (m0) r.addScaledVector(m0, h * h10);
  if (m1) r.addScaledVector(m1, h * h11);
  return r;
}
const yawQ = (deg) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), deg * DEG);

export class Desmonte {
  static T = 3.0;
  /**
   * rig, holder: el jinete. fisica: RiderPhysics (puños). silla: medirSilla (estribos, borrén, arzón).
   * seat: { rest }. cuerpo: { ancho, grupa } del caballo en reposo. P0: cadera sentada (coordenadas del caballo).
   */
  constructor({ rig, holder, fisica, silla, seat, cuerpo, P0 }) {
    this.rig = rig; this.holder = holder; this.fisica = fisica; this.silla = silla;
    const esc = holder.scale.x || 1, rp = rig.restWorldPos;
    const L = (a, b) => (rp[a] && rp[b] ? rp[a].distanceTo(rp[b]) * esc : 0.45);
    this.pierna = L('upperLegL', 'lowerLegL') + L('lowerLegL', 'footL');
    this.tobillo = Math.min(rp.footL?.y ?? 0.08, rp.footR?.y ?? 0.08) * esc;
    const Hs = (rp.hips?.y ?? 1) * esc; // cadera de pie
    const S = seat.rest, W = cuerpo.ancho, pomo = silla.pomo, arzon = silla.arzon;
    // Cadera (hueso hips).
    this.cadera = [
      [0.0, P0.clone()],
      [0.5, P0.clone().add(V(0.02, 0.01, 0.08))],
      [0.95, V(0.1, S.y + 0.2, S.z + 0.05)],
      [1.3, V(W * 0.78, S.y + 0.08, S.z)],
      [1.65, V(W + 0.1, S.y - 0.16, S.z)],
      [2.0, V(W + 0.13, Hs * 0.99, S.z + 0.02)],
      [2.18, V(W + 0.15, Hs - 0.12, S.z + 0.02)],
      [2.5, V(W + 0.17, Hs - 0.025, S.z + 0.03)],
      [3.0, V(W + 0.32, Hs, S.z + 0.1)],
    ];
    // Giro (0 = mirando adelante, −90 = mirando al caballo) e inclinación del tronco hacia donde mira.
    this.giro = [[0, 0], [0.5, -4], [0.95, -45], [1.3, -90], [2.45, -90], [3.0, -35]];
    this.incl = [[0, 0], [0.5, 20], [0.95, 44], [1.3, 52], [1.65, 34], [2.0, 14], [2.18, 22], [2.5, 7], [3.0, 2]];
    // Piernas: dirección del pie respecto a su cadera (marco del caballo) mientras cuelgan o pasan por encima.
    this.dirI = [[0.3, V(0.25, -1, 0.2)], [0.9, V(0.42, -1, 0.12)], [1.3, V(0.3, -1, 0.08)], [1.95, V(0.12, -1, 0.04)]];
    this.dirD = [[0.3, V(-0.25, -1, 0.2)], [0.55, V(-0.3, -1, -0.15)], [0.75, V(-0.45, -0.35, -0.8)], [0.95, V(0.05, 0.22, -1)],
      [1.12, V(0.6, 0.05, -0.75)], [1.3, V(0.5, -0.8, -0.25)], [1.6, V(0.25, -1, -0.04)], [1.95, V(0.12, -1, -0.04)]];
    this.alcance = { L: 0.95, R: 0.97 };
    // En el suelo: dónde aterriza cada pie y dónde termina tras los dos pasos (mirando al caballo: su izquierda es +z).
    const a = this.tobillo, fin = V(W + 0.32, a, S.z + 0.1), izq = V(1, 0, 0).applyQuaternion(yawQ(-35));
    this.suelo = {
      L: { ini: V(W + 0.17, a, S.z + 0.12), fin: fin.clone().addScaledVector(izq, 0.11), paso: [2.55, 2.8], giro: [-90, -35] },
      R: { ini: V(W + 0.17, a, S.z - 0.08), fin: fin.clone().addScaledVector(izq, -0.11), paso: [2.75, 3.0], giro: [-90, -35] },
    };
    // Manos: la izquierda (riendas) en el cuello; la derecha en el borrén y luego en el arzón.
    this.manoI = [[0.45, V(0.08, pomo.y - 0.03, pomo.z + 0.08)], [1.0, V(0.07, pomo.y - 0.02, pomo.z + 0.07)], [1.3, V(0.04, pomo.y + 0.03, pomo.z + 0.01)], [1.6, V(0.12, S.y + 0.08, pomo.z - 0.06)], [2.0, V(0.18, S.y - 0.02, pomo.z - 0.04)], [2.15, V(0.2, S.y - 0.1, pomo.z - 0.02)]];
    this.manoD = [[0.45, V(-0.03, pomo.y + 0.04, pomo.z + 0.02)], [0.95, V(-0.02, pomo.y + 0.04, pomo.z + 0.01)],
      [1.12, V(0.03, S.y + 0.2, S.z)], [1.3, V(0.07, arzon.y + 0.03, arzon.z + 0.03)], [1.6, V(0.12, S.y + 0.06, arzon.z + 0.1)], [2.0, V(0.18, S.y - 0.03, arzon.z + 0.1)], [2.12, V(0.2, S.y - 0.1, arzon.z + 0.1)]];
    this.suelta = { L: [2.12, 2.5], R: [2.08, 2.45] };
  }

  /** Pie en el suelo (marco del caballo) en t: posición, giro y altura del paso. */
  pieSuelo(S, t) {
    const s = this.suelo[S], u = rampa(t, s.paso[0], s.paso[1]);
    const p = s.ini.clone().lerp(s.fin, u);
    p.y += 0.07 * Math.sin(Math.PI * clamp01((t - s.paso[0]) / (s.paso[1] - s.paso[0])));
    return { p, giro: s.giro[0] + (s.giro[1] - s.giro[0]) * u, enAire: u > 0 && u < 1 };
  }

  /**
   * Coloca al jinete en el instante t (la pose canónica de base ya está aplicada).
   * ctx: { D: Matrix4 reposo→ahora del hueso de la silla, M: Matrix4 del suelo del caballo, path: Quaternion }
   */
  aplicar(t, { D, M, path }) {
    const rig = this.rig, sil = this.silla;
    const enSuelo = rampa(t, 1.5, 2.1);
    const aMundo = (p, w) => p.clone().applyMatrix4(D).lerp(p.clone().applyMatrix4(M), w);
    const up = V(0, 1, 0).applyQuaternion(path);
    // Cuerpo: giro completo, inclinación repartida entre cadera (45 %) y columna (55 %).
    const yaw = curva(this.giro, t), pitch = curva(this.incl, t) * DEG;
    const cuerpo = path.clone().multiply(yawQ(yaw));
    const izq = V(1, 0, 0).applyQuaternion(cuerpo), fwd = V(0, 0, 1).applyQuaternion(cuerpo);
    const hb = rig.bone('hips');
    const delta = cuerpo.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch * 0.45));
    hb.parent.updateWorldMatrix(true, false);
    setWorldQuat(hb, delta.clone().multiply(hb.getWorldQuaternion(new THREE.Quaternion())));
    hb.position.copy(hb.parent.worldToLocal(aMundo(curva(this.cadera, t), enSuelo)));
    hb.updateMatrixWorld(true);
    const sp = rig.bone('spine') || rig.bone('chest');
    if (sp) { setWorldQuat(sp, new THREE.Quaternion().setFromAxisAngle(izq, pitch * 0.55).multiply(sp.getWorldQuaternion(new THREE.Quaternion()))); sp.updateMatrixWorld(true); }
    const G = delta.clone().multiply(rig.Fq);
    const pieQ = (frame, pitchDeg, yawDeg, S) => frame.clone().multiply(rig.Fq)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchDeg * DEG, yawDeg * DEG, 0, 'YXZ'))).multiply(rig.FqInv).multiply(rig.Tw['foot' + S]);
    // Piernas.
    for (const [S, lado, dirs] of [['L', 1, this.dirI], ['R', -1, this.dirD]]) {
      const ul = rig.bone('upperLeg' + S), ll = rig.bone('lowerLeg' + S), ft = rig.bone('foot' + S);
      if (!ul || !ll || !ft || !rig.Tw['foot' + S]) continue;
      const cadera = ul.getWorldPosition(new THREE.Vector3());
      const wRel = rampa(t, 0.3, 0.5) * (1 - rampa(t, 1.93, 2.03));
      const wSuelo = rampa(t, 1.93, 2.03);
      const est = sil.estribos.find((e) => e.lado === lado).pisada;
      const enEstribo = est.clone().add(V(0, this.tobillo, -0.06)).applyMatrix4(D);
      const ps = this.pieSuelo(S, t);
      const enTierra = ps.p.clone().applyMatrix4(M);
      const dir = curva(dirs, Math.max(t, dirs[0][0])).normalize().applyQuaternion(path);
      const colgando = cadera.clone().addScaledVector(dir, this.alcance[S] * this.pierna);
      const meta = enEstribo.lerp(colgando, wRel);
      if (wSuelo > 0) meta.lerp(enTierra, wSuelo);
      // Rodilla: hacia afuera mientras cuelga o pasa por encima; hacia delante del cuerpo al aterrizar.
      const polo = cadera.clone().addScaledVector(fwd, 0.6 + 0.6 * wSuelo).addScaledVector(V(lado, 0, 0).applyQuaternion(path), 0.5 * (1 - wSuelo)).addScaledVector(up, -0.15);
      // Pie: en el estribo con el talón abajo; colgando con la punta abajo; plano en el suelo, con su propio giro.
      const qEst = pieQ(path, -12, 12 * lado, S), qAire = pieQ(cuerpo, 28, 6 * lado, S), qTierra = pieQ(path.clone().multiply(yawQ(ps.giro)), ps.enAire ? 12 : 0, 8 * lado, S);
      const qPie = qEst.clone().slerp(qAire, wRel).slerp(qTierra, wSuelo);
      solveTwoBone(ul, ll, ft, meta, polo, qPie);
      const toes = rig.bone('toes' + S);
      if (toes && rig.Tw['toes' + S]) {
        const q = qPie.clone().multiply(rig.TwInv['foot' + S]).multiply(rig.Tw['toes' + S]);
        setWorldQuat(toes, q); toes.updateMatrixWorld(true);
      }
    }
    // Brazos: se apoyan en el caballo y luego se sueltan (la pose de base, de pie, los deja caer).
    for (const [S, lado, keys] of [['L', 1, this.manoI], ['R', -1, this.manoD]]) {
      const [s0, s1] = this.suelta[S];
      const peso = rampa(t, 0.05, 0.45) * (1 - rampa(t, s0, s1));
      if (peso <= 0.001) continue;
      const ua = rig.bone('upperArm' + S), la = rig.bone('lowerArm' + S), hd = rig.bone('hand' + S);
      if (!ua || !la || !hd) continue;
      const meta = curva(keys, t).applyMatrix4(D).lerp(hd.getWorldPosition(new THREE.Vector3()), 1 - peso);
      const codo = la.getWorldPosition(new THREE.Vector3());
      const polo = codo.clone().addScaledVector(up, -0.5).addScaledVector(fwd, -0.35).addScaledVector(izq, 0.3 * lado);
      solveTwoBone(ua, la, hd, meta, polo);
      // Agarre por encima (palma abajo) del borrén y del arzón: el pulgar apunta hacia la otra mano.
      this.fisica?.mano(S, lado, G, up, peso, izq.clone().multiplyScalar(-lado).addScaledVector(up, -0.25));
    }
  }
}
