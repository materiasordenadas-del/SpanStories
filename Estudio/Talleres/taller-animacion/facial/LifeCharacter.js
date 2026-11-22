// LifeCharacter — personaje vivo para SpanStories (three.js)
//
// Capa ADITIVA sobre la historia: los clips del mixer y los morphs fijados con vida.morph() mandan;
// LifeCharacter suma encima respiración, parpadeo, mirada, cabeza, postura relajada, cambios de peso,
// gestos de reposo, cara viva por estado de ánimo, habla en español con visemas, reacciones y pelo.
//
// Uso:
//   const vida = new LifeCharacter(gltf.scene, contrato, { camara, pelo: { color: [31, 75, 175] } });
//   bucle:  vida.antes();  mixer.update(dt);  /* capa de la historia */  vida.update(dt);
//   vida.hablar('¡Hola! ¿Qué tal?', { voz: true });  vida.reaccionar('acierto');  vida.animo = 'contenta';
//
// Contrato: spanstories.personaje.glb/1 (huesos.cabeza, ojo_L, ojo_R; morphs ARKit + visemas vis_*).
import * as THREE from 'three';
import { FisicaCuerpo } from './FisicaCuerpo.js?v=7';
import { ExpresionesVida } from './ExpresionesVida.js?v=4';

// ------------------------------------------------------------------ utilidades
const san = n => THREE.PropertyBinding.sanitizeNodeName(n);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const azar = (a, b) => a + Math.random() * (b - a);
const elegir = arr => arr[Math.floor(Math.random() * arr.length)];
const amort = (dt, tau) => 1 - Math.exp(-dt / tau);
const suave = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const salida = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);                 // ease-out cúbico
const DEG = Math.PI / 180;
// envolvente: sube en a, baja en r (fracciones de u ∈ [0,1])
const env = (u, a = 0.2, r = 0.3) => (u <= 0 || u >= 1) ? 0 : suave(u / a) * (1 - suave((u - (1 - r)) / r));
// bache suave centrado (para pulsos)
const bache = (u) => (u <= 0 || u >= 1) ? 0 : Math.sin(Math.PI * u) ** 2;

function hash(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function ruido1(t, s) { const i = Math.floor(t), f = t - i; return hash(i, s) + (hash(i + 1, s) - hash(i, s)) * suave(f); }
function ruido(t, s) { return ruido1(t, s) * 0.7 + ruido1(t * 2.3 + 17, s + 5) * 0.3; }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();
const EJE_X = new THREE.Vector3(1, 0, 0), EJE_Y = new THREE.Vector3(0, 1, 0), EJE_Z = new THREE.Vector3(0, 0, 1);

// gira un hueso alrededor de un eje en MUNDO
function girarMundo(hueso, ejeMundo, ang) {
  if (!hueso || !ang) return;
  hueso.parent.getWorldQuaternion(_q2);
  _v.copy(ejeMundo).applyQuaternion(_q2.invert());
  _q.setFromAxisAngle(_v.normalize(), ang);
  hueso.quaternion.premultiply(_q);
}
// aplica un cuaternión expresado en mundo a un hueso
function aplicarMundo(hueso, qMundo) {
  hueso.parent.getWorldQuaternion(_q2);
  const inv = _q2.clone().invert();
  hueso.quaternion.premultiply(inv.multiply(qMundo).multiply(_q2));
}
const posMundo = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);

// ------------------------------------------------------------------ estados de ánimo
// cara: morphs ARKit de tono base · postura en grados (hombros + = arriba, pecho + = encorvado, cabeza + = abajo)
export const ANIMOS = {
// Valores de partida medidos con morphs ARKit sutiles (cada personaje los corrige con su ganancia `rigGain`): (sonrisa completa ≈ 11 mm, browInnerUp ≈ 3 mm),
// así que el tono base tiene que ser alto para que el ánimo se lea a distancia normal de cámara.
  tranquila: { resp: 14, ampResp: 1.0, parpadeo: [1.8, 5], mirada: [1.5, 4], fidget: 1.1, peso: [6, 14], deambula: 0.25,
    cara: { mouthSmileLeft: 0.18, mouthSmileRight: 0.15, cheekSquintLeft: 0.08, cheekSquintRight: 0.08 },
    postura: { hombros: 0, pecho: 0, cabeza: 0, inclina: 0 }, cabezaParte: 0.65, micro: 1 },
  contenta: { resp: 16, ampResp: 1.1, parpadeo: [1.5, 4.4], mirada: [1, 2.6], fidget: 1.4, peso: [5, 11], deambula: 0.2,
    cara: { mouthSmileLeft: 0.72, mouthSmileRight: 0.66, cheekSquintLeft: 0.45, cheekSquintRight: 0.42, eyeSquintLeft: 0.25, eyeSquintRight: 0.25, browOuterUpLeft: 0.3, browOuterUpRight: 0.28 },
    postura: { hombros: 1, pecho: -4, cabeza: -4, inclina: 6 }, cabezaParte: 0.7, micro: 1.2 },
  nerviosa: { resp: 22, ampResp: 0.8, parpadeo: [0.45, 1.7], mirada: [0.3, 1.0], fidget: 2.6, peso: [3, 7], deambula: 0.55,
    cara: { browInnerUp: 0.7, mouthPressLeft: 0.45, mouthPressRight: 0.5, mouthStretchLeft: 0.2, mouthStretchRight: 0.24, eyeWideLeft: 0.32, eyeWideRight: 0.32 },
    postura: { hombros: 7, pecho: 3, cabeza: 3, inclina: 0 }, cabezaParte: 0.55, micro: 1.6, muerdeLabio: true },
  triste: { resp: 11, ampResp: 1.2, parpadeo: [2, 5.5], mirada: [2, 5], fidget: 0.5, peso: [12, 25], deambula: 0.6, miraAbajo: true,
    cara: { browInnerUp: 0.95, mouthFrownLeft: 0.65, mouthFrownRight: 0.6, mouthShrugLower: 0.3, eyeLookDownLeft: 0.2, eyeLookDownRight: 0.2, eyeBlinkLeft: 0.22, eyeBlinkRight: 0.22 },
    postura: { hombros: -6, pecho: 10, cabeza: 12, inclina: 5 }, cabezaParte: 0.45, micro: 0.7, suspiros: 2.2 },
  cansada: { resp: 11, ampResp: 1.35, parpadeo: [1.4, 3.4], mirada: [2.5, 6], fidget: 0.6, peso: [8, 16], deambula: 0.4, parpadeoLento: 1.9,
    cara: { eyeBlinkLeft: 0.5, eyeBlinkRight: 0.53, browInnerUp: 0.25, mouthShrugLower: 0.12, jawOpen: 0.03 },
    postura: { hombros: -5, pecho: 9, cabeza: 9, inclina: 7 }, cabezaParte: 0.4, micro: 0.6, bostezos: 3 },
  atenta: { resp: 12, ampResp: 0.75, parpadeo: [3, 6.5], mirada: [2.4, 5], fidget: 0.5, peso: [14, 28], deambula: 0.05,
    cara: { eyeWideLeft: 0.32, eyeWideRight: 0.32, browOuterUpLeft: 0.3, browOuterUpRight: 0.3, mouthSmileLeft: 0.1, mouthSmileRight: 0.1 },
    postura: { hombros: 1, pecho: -5, cabeza: -2, inclina: 3, adelante: 5 }, cabezaParte: 0.75, micro: 0.6 },
};
const NUMS = ['resp', 'ampResp', 'fidget', 'deambula', 'cabezaParte', 'micro', 'parpadeoLento', 'suspiros', 'bostezos'];

// ------------------------------------------------------------------ habla: español → visemas
const VOCAL = { a: 'vis_A', á: 'vis_A', e: 'vis_E', é: 'vis_E', i: 'vis_I', í: 'vis_I', o: 'vis_O', ó: 'vis_O', u: 'vis_U', ú: 'vis_U', ü: 'vis_U' };
const APERTURA = { vis_A: 1, vis_O: 0.85, vis_E: 0.8, vis_I: 0.65, vis_U: 0.7 };
export function textoAVisemas(texto, variante = 'latam') {
  const t = texto.toLowerCase();
  const out = []; // {vis, dur, vocal, tonica, fin, palabra, pausa}
  const palabras = t.match(/[a-záéíóúüñ]+|[.,;:!?¡¿…]/g) || [];
  let iPal = 0;
  for (const p of palabras) {
    if (/^[.,;:!?…]$/.test(p)) { out.push({ pausa: /[,;:]/.test(p) ? 0.22 : 0.42, signo: p }); continue; }
    if (/^[¡¿]$/.test(p)) { out.push({ apertura: p }); continue; }
    // vocal tónica: tilde, o regla llana/aguda
    const nucleos = []; for (let i = 0; i < p.length; i++) if ('aeiouáéíóúü'.includes(p[i]) && !(p[i] === 'u' && (p[i - 1] === 'q' || (p[i - 1] === 'g' && 'eiéí'.includes(p[i + 1] || ''))))) {
      if (nucleos.length && nucleos[nucleos.length - 1].fin === i - 1 && !'aeoáéó'.includes(p[i]) | !'aeoáéó'.includes(p[i - 1])) { nucleos[nucleos.length - 1].fin = i; if ('aeoáéó'.includes(p[i])) nucleos[nucleos.length - 1].fuerte = i; }
      else nucleos.push({ ini: i, fin: i, fuerte: i });
    }
    let tonica = nucleos.findIndex(n => /[áéíóú]/.test(p.slice(n.ini, n.fin + 1)));
    if (tonica < 0) tonica = /[aeiouns]$/.test(p) ? Math.max(0, nucleos.length - 2) : nucleos.length - 1;
    const posTonica = nucleos[tonica]?.fuerte ?? -1;
    const nucleoDe = i => nucleos.find(n => i >= n.ini && i <= n.fin);
    for (let i = 0; i < p.length; i++) {
      const c = p[i], s = p[i + 1] || '', d2 = c + s;
      const push = (vis, dur, extra = {}) => out.push({ vis, dur, palabra: iPal, ...extra });
      if (VOCAL[c]) {
        const n = nucleoDe(i);
        if (c === 'u' && (p[i - 1] === 'q' || (p[i - 1] === 'g' && 'eiéí'.includes(s)))) continue;     // u muda
        if (n && i !== n.fuerte) { push(VOCAL[c], 0.045, { vocal: true, glide: true }); continue; }     // diptongo
        const ton = i === posTonica;
        push(VOCAL[c], ton ? 0.12 : 0.085, { vocal: true, tonica: ton });
        continue;
      }
      if (d2 === 'ch') { push('vis_CH', 0.08); i++; continue; }
      if (d2 === 'll') { push('vis_CH', 0.07); i++; continue; }
      if (d2 === 'rr') { push('vis_TDNL', 0.09); i++; continue; }
      if (d2 === 'qu') { push('vis_K', 0.065); i++; continue; }
      switch (c) {
        case 'h': break;
        case 'b': case 'v': case 'm': case 'p': push('vis_MBP', 0.075); break;
        case 'f': push('vis_FV', 0.08); break;
        case 's': push('vis_S', 0.08); break;
        case 'z': push(variante === 'es' ? 'vis_TH' : 'vis_S', 0.08); break;
        case 'c': if ('eiéí'.includes(s)) push(variante === 'es' ? 'vis_TH' : 'vis_S', 0.08); else push('vis_K', 0.065); break;
        case 'g': case 'j': case 'k': push('vis_K', 0.065); break;
        case 'x': push('vis_K', 0.05); push('vis_S', 0.07); break;
        case 'y': if (!s || !'aeiouáéíóú'.includes(s)) push('vis_I', 0.07, { vocal: true }); else push('vis_CH', 0.07); break;
        case 'w': push('vis_U', 0.06, { vocal: true }); break;
        case 'd': case 't': case 'n': case 'l': case 'r': case 'ñ': push('vis_TDNL', c === 'r' ? 0.05 : 0.065); break;
        default: break;
      }
    }
    out.push({ finPalabra: iPal, larga: nucleos.length >= 2 });
    iPal++;
  }
  return out;
}

// ------------------------------------------------------------------ pelo: dinámica secundaria en el shader
export class PeloDinamico {
  // malla con textura; pelo = vértices del color dado, pesados a la cabeza; peso de movimiento por distancia al cráneo
  constructor(malla, cabeza, opc = {}) {
    this.malla = malla; this.cabeza = cabeza;
    this.altura = opc.altura || 1;
    const g = malla.geometry, uv = g.attributes.uv, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const ib = malla.skeleton.bones.indexOf(cabeza);
    const img = malla.material.map?.image;
    const W = 1024, cv = document.createElement('canvas'); cv.width = cv.height = W;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, W);
    const px = cx.getImageData(0, 0, W, W).data;
    const [cr, cg, cb] = opc.color || [31, 75, 175], tol = opc.tolerancia || 60;
    // centro del cráneo: entre los ojos, algo detrás y arriba (en el espacio de la malla, pose de reposo)
    const centro = opc.centro ? new THREE.Vector3(...opc.centro) : null;
    const r0 = (opc.radio || 0.095) * this.altura, largo = (opc.largo || 0.22) * this.altura;
    const peso = new Float32Array(pos.count);
    const trenzaAttr = new Float32Array(pos.count * 2);
    const tz = opc.trenza || null;                             // {zMax, xMin, yTop, yBot, paso}: caja de la trenza en reposo
    const enTrenza = (x, y, z) => tz && z < tz.zMax && x > tz.xMin && y < tz.yTop && y > tz.yBot - 0.05;
    const verticesTrenza = [];
    let n = 0;
    const c = centro || (() => { const p = new THREE.Vector3(); cabeza.getWorldPosition(p); malla.worldToLocal(p); p.y += 0.07 * this.altura; p.z -= 0.014 * this.altura; return p; })();
    this.centro = c.clone();
    for (let i = 0; i < pos.count; i++) {
      let hw = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === ib) hw += sw.getComponent(i, k);
      if (hw < 0.5) continue;
      // dentro de la caja de la trenza va todo lo que cuelga de la cabeza, sea del color que sea (la goma es marrón)
      if (enTrenza(pos.getX(i), pos.getY(i), pos.getZ(i))) { verticesTrenza.push(i); continue; }
      const u = uv.getX(i), v = uv.getY(i);
      const k = ((clamp((malla.material.map.flipY ? 1 - v : v) * W | 0, 0, W - 1)) * W + clamp(u * W | 0, 0, W - 1)) * 4;
      const dc = Math.hypot(px[k] - cr, px[k + 1] - cg, px[k + 2] - cb);
      if (dc > tol) continue;
      const d = Math.hypot(pos.getX(i) - c.x, pos.getY(i) - c.y, pos.getZ(i) - c.z);
      const w = suave((d - r0) / largo);
      if (w > 0.001) { peso[i] = w * hw; n++; }
    }
    this.vertices = n;
    g.setAttribute('aPelo', new THREE.BufferAttribute(peso, 1));
    // trenza: cadena de nodos (centro de la trenza por franjas de altura); cada vértice se ata a dos nodos
    this.trenza = null;
    if (tz && verticesTrenza.length > 20) {
      const paso = tz.paso, nN = Math.min(16, Math.round((tz.yTop - tz.yBot) / paso) + 1);
      const nodos = [];
      for (let k = 0; k < nN; k++) {
        const yc = tz.yTop - k * paso, acc = new THREE.Vector3(); let cnt = 0;
        for (const i of verticesTrenza) if (Math.abs(pos.getY(i) - yc) < paso * 0.6) { acc.x += pos.getX(i); acc.y += pos.getY(i); acc.z += pos.getZ(i); cnt++; }
        nodos.push(cnt ? acc.divideScalar(cnt) : (nodos[k - 1] || new THREE.Vector3(0, yc, tz.zMax)).clone().setY(yc));
      }
      for (const i of verticesTrenza) {
        const f = clamp((tz.yTop - pos.getY(i)) / paso, 0, nN - 1.001);
        trenzaAttr[i * 2] = f; trenzaAttr[i * 2 + 1] = 1;
      }
      this.trenza = new Trenza(nodos.map(v => malla.localToWorld(v.clone())), cabeza, { altura: this.altura, radio: tz.radio || 0.02, espalda: opc.espalda });
    }
    g.setAttribute('aTrenza', new THREE.BufferAttribute(trenzaAttr, 2));
    this.u = {
      uPivote: { value: new THREE.Vector3() }, uRotMedio: { value: new THREE.Vector3() }, uRotPuntas: { value: new THREE.Vector3() },
      uDesp: { value: new THREE.Vector3() }, uT: { value: 0 }, uBrisa: { value: 0.0012 * this.altura },
      uTrenza: { value: Array.from({ length: 16 }, () => new THREE.Vector3()) },
    };
    const u = this.u, mat = malla.material;
    const previo = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      previo?.(sh, r);
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aPelo; attribute vec2 aTrenza; uniform vec3 uTrenza[16];
uniform vec3 uPivote; uniform vec3 uRotMedio; uniform vec3 uRotPuntas; uniform vec3 uDesp; uniform float uT; uniform float uBrisa;`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
if (aPelo > 0.0) {
  float w = aPelo;
  vec3 rel = transformed - uPivote;
  vec3 r = mix(uRotMedio, uRotPuntas, w) * w;           // el mechón se dobla: la punta va más atrasada
  transformed += cross(r, rel) + cross(r, cross(r, rel)) * 0.5 + uDesp * w * w;
  float ph = dot(rel, vec3(21.0, 29.0, 17.0));
  transformed += uBrisa * w * w * vec3(sin(uT * 1.7 + ph), 0.35 * sin(uT * 1.3 + ph * 1.3), cos(uT * 1.45 + ph * 0.7));
}
if (aTrenza.y > 0.0) {
  int i = int(floor(aTrenza.x)); float f = fract(aTrenza.x);
  transformed += mix(uTrenza[i], uTrenza[min(i + 1, 15)], f) * aTrenza.y;
}`);
    };
    const clavePrevia = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () => (clavePrevia?.() || '') + '|peloDinamico';
    mat.needsUpdate = true;

    // estado de los muelles
    this.qPrev = new THREE.Quaternion(); this.pPrev = new THREE.Vector3(); this.vPrev = new THREE.Vector3(); this.wPrev = new THREE.Vector3();
    this.qReposo = null;
    this.medio = { th: new THREE.Vector3(), vel: new THREE.Vector3(), w: 2 * Math.PI * 1.6, z: 0.32, g: 0.12 };
    this.puntas = { th: new THREE.Vector3(), vel: new THREE.Vector3(), w: 2 * Math.PI * 0.95, z: 0.22, g: 0.32 };
    this.lin = { o: new THREE.Vector3(), vel: new THREE.Vector3(), w: 2 * Math.PI * 1.3, z: 0.3 };
    this.t = 0; this.inicial = true; this.activo = true; this.fuerza = 1;
  }
  update(dt, semilla = 0, capsulas = null, suelo = null) {
    if (this.trenza) {
      this.trenza.update(this.activo ? dt : 0, capsulas, suelo);
      const inv = this.malla.matrixWorld.clone().invert(), rotInv = new THREE.Quaternion().setFromRotationMatrix(inv);
      this.trenza.desplazamientos.forEach((d, k) => this.u.uTrenza.value[k].copy(d).applyQuaternion(rotInv).multiplyScalar(this.activo ? 1 : 0));
    }
    const cab = this.cabeza;
    const P = cab.getWorldPosition(new THREE.Vector3()), Q = cab.getWorldQuaternion(new THREE.Quaternion());
    if (this.inicial || dt <= 0) {
      if (this.inicial) { this.qReposo = Q.clone(); this.inicial = false; }
      this.pPrev.copy(P); this.qPrev.copy(Q);
      if (dt <= 0) return this._uniformes(P);
    }
    this.t += dt;
    // velocidades y aceleraciones de la cabeza
    const v = P.clone().sub(this.pPrev).divideScalar(dt);
    const a = v.clone().sub(this.vPrev).divideScalar(dt);
    const dq = Q.clone().multiply(this.qPrev.clone().invert());
    if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
    const ang = 2 * Math.acos(clamp(dq.w, -1, 1)), s = Math.sqrt(Math.max(1e-9, 1 - dq.w * dq.w));
    const w = new THREE.Vector3(dq.x / s, dq.y / s, dq.z / s).multiplyScalar(ang > 1e-6 ? ang / dt : 0);
    const alfa = w.clone().sub(this.wPrev).divideScalar(dt);
    this.pPrev.copy(P); this.qPrev.copy(Q); this.vPrev.lerp(v, 0.6); this.wPrev.lerp(w, 0.6);
    alfa.clampLength(0, 40); a.clampLength(0, 8);
    // gravedad: el pelo tiende a colgar aunque la cabeza se incline (solo cabeceo y alabeo)
    const rel = Q.clone().multiply(this.qReposo.clone().invert());
    if (rel.w < 0) { rel.x *= -1; rel.y *= -1; rel.z *= -1; rel.w *= -1; }
    const ra = 2 * Math.acos(clamp(rel.w, -1, 1)), rs = Math.sqrt(Math.max(1e-9, 1 - rel.w * rel.w));
    const incl = new THREE.Vector3(rel.x / rs, rel.y / rs, rel.z / rs).multiplyScalar(ra > 1e-6 ? ra : 0);
    incl.y = 0;
    const brisa = new THREE.Vector3(ruido(this.t * 0.35, semilla + 9), ruido(this.t * 0.3, semilla + 10) * 0.4, ruido(this.t * 0.33, semilla + 11)).multiplyScalar(0.9 * DEG);
    const pasos = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / pasos;
    for (const m of [this.medio, this.puntas]) {
      const objetivo = incl.clone().multiplyScalar(-m.g).add(brisa.clone().multiplyScalar(m === this.puntas ? 1 : 0.4));
      for (let i = 0; i < pasos; i++) {
        const acc = m.th.clone().sub(objetivo).multiplyScalar(-m.w * m.w).addScaledVector(m.vel, -2 * m.z * m.w).addScaledVector(alfa, -0.9 * this.fuerza);
        m.vel.addScaledVector(acc, h); m.th.addScaledVector(m.vel, h);
      }
      m.th.clampLength(0, 0.3);
    }
    const L = this.lin;
    for (let i = 0; i < pasos; i++) {
      const acc = L.o.clone().multiplyScalar(-L.w * L.w).addScaledVector(L.vel, -2 * L.z * L.w).addScaledVector(a, -1 * this.fuerza);
      L.vel.addScaledVector(acc, h); L.o.addScaledVector(L.vel, h);
    }
    L.o.clampLength(0, 0.035 * this.altura);
    this._uniformes(P);
  }
  _uniformes(P) {
    const u = this.u, inv = this.malla.matrixWorld.clone().invert();
    const rotInv = new THREE.Quaternion().setFromRotationMatrix(inv);
    u.uPivote.value.copy(P).applyMatrix4(inv);
    const on = this.activo ? 1 : 0;
    u.uRotMedio.value.copy(this.medio.th).applyQuaternion(rotInv).multiplyScalar(on);
    u.uRotPuntas.value.copy(this.puntas.th).applyQuaternion(rotInv).multiplyScalar(on);
    u.uDesp.value.copy(this.lin.o).applyQuaternion(rotInv).multiplyScalar(on);
    u.uT.value = this.t * on;
  }
}

// ------------------------------------------------------------------ trenza: cadena física que no atraviesa el cuerpo
// Cadena de nodos estilo «spring bone»: inercia, memoria de su forma respecto a la cabeza, gravedad cuando la
// cabeza se inclina y colisión contra las cápsulas del cuerpo (espalda, hombros, brazos) y el suelo.
export class Trenza {
  constructor(nodosMundo, cabeza, opc = {}) {
    this.cabeza = cabeza; this.n = nodosMundo.length;
    this.altura = opc.altura || 1; this.radio = (opc.radio || 0.02) * this.altura;
    this.local = nodosMundo.map(p => cabeza.worldToLocal(p.clone()));
    // la forma de la trenza se apoya en la espalda (no gira con la cabeza); solo la raíz va con la cabeza
    this.espalda = opc.espalda || cabeza;
    const qe = this.espalda.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.dirLocal = nodosMundo.map((p, k) => k ? p.clone().sub(nodosMundo[k - 1]).applyQuaternion(qe) : new THREE.Vector3());
    this.x = nodosMundo.map(p => p.clone()); this.prev = nodosMundo.map(p => p.clone());
    this.largo = nodosMundo.map((p, k) => k ? p.distanceTo(nodosMundo[k - 1]) : 0);
    this.desplazamientos = nodosMundo.map(() => new THREE.Vector3());
    // dirección «abajo» del mundo vista desde la cabeza en reposo: la forma de reposo ya cuelga así
    this.abajoLocal = new THREE.Vector3(0, -1, 0).applyQuaternion(this.espalda.getWorldQuaternion(new THREE.Quaternion()).invert());
    this.margen = null; this.reiniciar = true;
    // una trenza es gruesa y pesada: se balancea entera desde la nuca, no latiguea la punta (eso parecía un pez).
    // rigidez de doblado casi uniforme + memoria de la forma completa (respecto a la espalda) + más amortiguación
    this.rigidez = Array.from({ length: this.n }, (_, k) => 0.3 - 0.08 * (k / Math.max(1, this.n - 1)));
    this.forma = opc.forma ?? 0.06;                             // cuánto vuelve cada nodo a su sitio de reposo (por paso a 60 Hz)
    this.arrastre = 0.22; this.gravedad = 7 * this.altura;
  }
  update(dt, cuerpo, suelo) {
    const capsulas = cuerpo?.lista || null;
    const M = this.cabeza.matrixWorld, n = this.n;
    const reposo = this.local.map(p => p.clone().applyMatrix4(M));
    // a pocos fps se simula con paso recortado en vez de congelar la trenza; solo un salto enorme la reinicia
    if (dt > 0 && dt < 0.25) dt = Math.min(dt, 1 / 20);
    if (dt <= 0 || dt >= 0.25 || this.reiniciar) {
      for (let k = 0; k < n; k++) { this.x[k].copy(reposo[k]); this.prev[k].copy(reposo[k]); this.desplazamientos[k].set(0, 0, 0); }
      if (this.reiniciar && capsulas) {                          // margen de reposo: lo que ya toca en reposo no se empuja
        this.margen = this.x.map(p => capsulas.map(c => Math.max(0, this.radio - cuerpo.distancia(p, c))));
        this.reiniciar = false;
      }
      return;
    }
    const qc = this.espalda.getWorldQuaternion(new THREE.Quaternion());
    const dirs = this.dirLocal.map(d => d.clone().applyQuaternion(qc));
    // gravedad «extra»: solo la diferencia entre el abajo real y el abajo con el que se modeló
    const g = new THREE.Vector3(0, -1, 0).sub(this.abajoLocal.clone().applyQuaternion(qc)).multiplyScalar(this.gravedad);
    const pasos = dt > 1 / 50 ? 3 : 2, h = dt / pasos, f60 = h * 60;
    const tmp = new THREE.Vector3();
    const chocar = (k, desde) => {
      const p = this.x[k];
      if (capsulas) capsulas.forEach((c, j) => cuerpo.empujar(p, desde, this.radio, c, this.margen?.[k]?.[j] || 0));
      if (suelo !== null && suelo !== undefined) p.y = Math.max(p.y, (typeof suelo === 'function' ? suelo(p.x, p.z) : suelo) + this.radio);
    };
    const antes = this.x.map(p => p.clone());
    for (let s = 0; s < pasos; s++) {
      this.x[0].copy(reposo[0]); this.prev[0].copy(reposo[0]);
      // 1) predicción: inercia + memoria de forma (local: ángulo con el nodo anterior; global: la trenza entera
      //    colgando de la raíz como en reposo, orientada con la espalda) + gravedad
      const sg = 1 - Math.pow(1 - this.forma, f60), global = this.x[0].clone();
      for (let k = 1; k < n; k++) {
        const x = this.x[k];
        antes[k].copy(x);
        global.add(dirs[k]);
        const inercia = tmp.subVectors(x, this.prev[k]).multiplyScalar(Math.pow(1 - this.arrastre, f60));
        const objetivo = this.x[k - 1].clone().add(dirs[k]);
        const st = 1 - Math.pow(1 - this.rigidez[k], f60);
        x.add(inercia).add(objetivo.sub(x).multiplyScalar(st)).addScaledVector(global.clone().sub(x), sg).addScaledVector(g, h * h * (k / (n - 1)));
      }
      // 2) restricciones: longitud y colisión, varias pasadas
      for (let it = 0; it < 3; it++) for (let k = 1; k < n; k++) {
        const x = this.x[k], dir = x.clone().sub(this.x[k - 1]);
        x.copy(this.x[k - 1]).addScaledVector(dir, this.largo[k] / (dir.length() || 1));
        chocar(k, antes[k]);
      }
      // 3) la colisión tiene la última palabra (puede estirar un milímetro, nunca atravesar)
      for (let k = 1; k < n; k++) chocar(k, antes[k]);
      for (let k = 1; k < n; k++) this.prev[k].copy(antes[k]);
    }
    for (let k = 0; k < n; k++) this.desplazamientos[k].subVectors(this.x[k], reposo[k]);
  }
}

// ------------------------------------------------------------------ LifeCharacter
export class LifeCharacter {
  constructor(root, contrato, opciones = {}) {
    this.root = root;
    this.camara = opciones.camara || null;
    this.energia = opciones.energia ?? 0.5;                     // 0 = sin fuerzas (encorvada, párpados caídos, lenta) · 1 = muy activa
    this._e = this.energia;                                     // energía suavizada (sin saltos al mover el control)
    this.intensidad = opciones.intensidad ?? 1;                 // multiplica el tono de cara y postura del ánimo
    this._animo = opciones.animo || 'tranquila';
    this.activo = { respiracion: true, parpadeo: true, mirada: true, cabeza: true, postura: true, peso: true, gestos: true, cara: true, habla: true, pelo: true, colisiones: true, inercia: true, ...(opciones.activo || {}) };
    // inercia de brazos: frecuencia (Hz) y amortiguación del codo y de la muñeca
    this.inercia = { codo: [1.2, 0.45], muneca: [1.7, 0.4], ...(opciones.inercia || {}) };
    this._brazos = [];
    this.modoMirada = opciones.modoMirada || 'camara';         // camara | cursor | deambular | punto | objeto
    this.punto = new THREE.Vector3(); this.objeto = null;
    this.velocidad = 1;
    this.variante = opciones.variante || 'latam';               // 'es' → z/ce/ci como TH
    this.historia = {};

    const huesos = {}; root.traverse(o => { if (o.isBone) huesos[o.name] = o; });
    this.huesos = huesos;
    const H = contrato.huesos;
    const b = n => huesos[n] || null;
    // contrato.mapa: hueso canónico (hips, upperArmL…) → nombre real, el mismo mapeo del Taller.
    // Sirve para Mixamo, AccuRig/Reallusion (CC_Base_…), Unreal, Rigify o VRM sin nombres fijos.
    const M = contrato.mapa || null;
    const c = id => (M && M[id] ? huesos[M[id]] || huesos[san(M[id])] || null : null);
    this.cabeza = huesos[san(H.cabeza)];
    this.cuello = this.cabeza?.parent?.isBone ? this.cabeza.parent : null;
    const tronco = ['upperChest', 'chest', 'spine', 'hips'].map(c);
    if (tronco.every(Boolean) && new Set([this.cuello, ...tronco]).size === 5) {
      // Por el mapa: AccuRig tiene dos huesos de cuello y Hip → Pelvis, y subir de padre en padre
      // desde la cabeza confundiría el cuello con el pecho y la cintura con la cadera.
      [this.pecho, this.espalda, this.lumbar, this.cadera] = tronco;
    } else {
      this.pecho = this.cuello?.parent?.isBone ? this.cuello.parent : null;
      this.espalda = this.pecho?.parent?.isBone ? this.pecho.parent : null;
      this.lumbar = this.espalda?.parent?.isBone ? this.espalda.parent : null;
      this.cadera = this.lumbar?.parent?.isBone ? this.lumbar.parent : null;
    }
    this.ojos = [huesos[san(H.ojo_L)], huesos[san(H.ojo_R)]];
    // la cara lleva pesos repartidos entre el cuello y los huesos de la cabeza: si la cabeza gira respecto
    // al cuello, barbilla, nariz y cejas se estiran. Por eso todo giro de cabeza va al cuello (cabeza rígida).
    this.cabezaRigida = opciones.cabezaRigida ?? true;
    this.giroCabeza = this.cabezaRigida && this.cuello ? this.cuello : this.cabeza;
    // Lados por el mapa canónico (L = izquierda del personaje = +X); sin mapa, nombres de Mixamo.
    const ladoMapa = (S) => ({
      hombro: c(`shoulder${S}`), brazo: c(`upperArm${S}`), antebrazo: c(`lowerArm${S}`), mano: c(`hand${S}`),
      muslo: c(`upperLeg${S}`), pierna: c(`lowerLeg${S}`), pie: c(`foot${S}`), punta: c(`toes${S}`),
      dedos: ['index', 'middle', 'ring', 'little'].map(d => [1, 2, 3].map(k => c(`${d}${k}${S}`)).filter(Boolean)),
      pulgar: [1, 2, 3].map(k => c(`thumb${k}${S}`)).filter(Boolean),
      signo: S === 'L' ? 1 : -1,
    });
    const lado = (pre) => M && c(`upperArm${pre === 'Left' ? 'L' : 'R'}`) ? ladoMapa(pre === 'Left' ? 'L' : 'R') : ({
      hombro: b(`mixamorig${pre}Shoulder`), brazo: b(`mixamorig${pre}Arm`), antebrazo: b(`mixamorig${pre}ForeArm`), mano: b(`mixamorig${pre}Hand`),
      muslo: b(`mixamorig${pre}UpLeg`), pierna: b(`mixamorig${pre}Leg`), pie: b(`mixamorig${pre}Foot`), punta: b(`mixamorig${pre}ToeBase`),
      dedos: ['Index', 'Middle', 'Ring', 'Pinky'].map(d => [1, 2, 3].map(k => b(`mixamorig${pre}Hand${d}${k}`)).filter(Boolean)),
      pulgar: [1, 2, 3].map(k => b(`mixamorig${pre}HandThumb${k}`)).filter(Boolean),
      signo: pre === 'Left' ? 1 : -1,
    });
    this.lados = [lado('Left'), lado('Right')].filter(l => l.brazo);
    this.hombros = this.lados.map(l => l.hombro).filter(Boolean);

    this.tocados = [this.cadera, this.lumbar, this.espalda, this.pecho, this.cuello, this.cabeza, ...this.ojos].filter(Boolean);
    for (const l of this.lados) this.tocados.push(...[l.hombro, l.brazo, l.antebrazo, l.mano, l.muslo, l.pierna, l.pie, ...l.dedos.flat(), ...l.pulgar].filter(Boolean));
    this.reposo = new Map(this.tocados.map(h => [h, h.quaternion.clone()]));
    this.reposoPos = this.cadera ? this.cadera.position.clone() : null;

    // marco del cuerpo (en reposo): adelante = +Z del root, lado = +X
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    this.altura = (box.max.y - box.min.y) || 1;
    this.pies = this.lados.map(l => l.pie ? { pos: posMundo(l.pie), q: l.pie.getWorldQuaternion(new THREE.Quaternion()) } : null);
    this._contactos(root);
    // suelo: número (altura) o función (x, z) => altura. Por defecto, donde pisa en reposo.
    this.suelo = opciones.suelo ?? this.sueloReposo;
    this.pegarAlSuelo = false;                                  // con clips: el pie más bajo siempre toca el suelo

    // morphs: índice por nombre → [malla, índice]
    this.mallas = []; root.traverse(o => { if (o.isMesh && o.morphTargetDictionary) this.mallas.push(o); });
    this.indice = {};
    for (const m of this.mallas) for (const [n, i] of Object.entries(m.morphTargetDictionary)) (this.indice[n] ||= []).push([m, i]);
    this.nombresVida = Object.keys(this.indice).filter(n => !/^faceit_|Interior/.test(n));
    this.vm = {};
    // Modelos sin huesos de ojo (p. ej. un rig Faceit sobre una malla Tripo de una pieza): la mirada se hace con
    // sus shape keys eyeLook*. Se colocan dos «ojos virtuales» en la cabeza (centro de lo que mueve cada eyeLookOut)
    // para medir hacia dónde mirar con la misma lógica que los huesos.
    this.ojosMorph = this.ojos.some(Boolean) ? null : this._ojosPorMorph(root);
    if (this.ojosMorph) this.ojos = [this.ojosMorph.Left.ojo, this.ojosMorph.Right.ojo];

    // pelo
    this.pelo = null;
    if (opciones.pelo !== false && opciones.pelo) {
      let malla = null; root.traverse(o => { if (!malla && o.isSkinnedMesh && o.material?.map && (!opciones.pelo.malla || o.name === opciones.pelo.malla)) malla = o; });
      if (malla) try { this.pelo = new PeloDinamico(malla, this.cabeza, { ...opciones.pelo, altura: this.altura, espalda: this.pecho }); } catch (e) { console.warn('LifeCharacter: pelo', e); }
    }

    // física: cápsulas del cuerpo con Rapier (brazos que no atraviesan el tronco; la trenza choca con ellas)
    this.cuerpo = null;
    if (opciones.rapier) try { this.cuerpo = new FisicaCuerpo(this, opciones.rapier); } catch (e) { console.warn('LifeCharacter: física', e); }

    // estado
    this.t = 0; this.semilla = Math.random() * 100;
    this.p = this._copiaAnimo(ANIMOS[this._animo]);           // parámetros mezclados en curso
    this.resp = { fase: azar(0, 0.6), dur: 4.2, amp: 1, suspiro: 0, proxSuspiro: azar(25, 60), extra: 0 };
    // respiración visible: el pecho se expande (escala uniforme pequeña) y sus hijos lo compensan para no crecer
    this.respHijos = this.pecho ? this.pecho.children.filter(c => c.isBone) : [];
    this.reposoEscala = new Map([this.pecho, ...this.respHijos].filter(Boolean).map(h => [h, h.scale.clone()]));
    this.parp = { prox: azar(0.4, 1.6), t: -1, dur: 0.19, pico: 1, desfase: 0.008, enCola: 0, post: -1 };
    this.mir = { objetivo: new THREE.Vector3(), fijacion: new THREE.Vector3(), sac: null, prox: 0, micro: [0, 0], proxMicro: 0,
      sub: new THREE.Vector2(), proxSub: 0, inicial: true, yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, anula: null,
      // reajustes posturales de la cabeza: pequeños cambios de sitio cada pocos segundos (con arco y asentamiento)
      ajuste: { y: 0, p: 0, r: 0, prox: azar(0.8, 2.5) }, roll: 0, vroll: 0,
      // persecución: velocidad del objetivo (para adelantarse) y vistazos que interrumpen una fijación larga
      tPrev: null, tVel: new THREE.Vector3(), vistazo: null, proxVistazo: azar(2.5, 5), deteccion: -9 };
    this.cursor = null;
    // atención al cursor: cuánto se mueve, cuánto lleva quieto, cuánto interés despierta
    this.cur = { prev: null, vel: 0, quieto: 0, interes: 0, arrastre: false, proxAtencion: azar(1, 3) };
    this.ultimaCabeza = { yaw: 0, pitch: 0 }; this.pitchOjos = 0;
    this.peso = { actual: 0, vel: 0, objetivo: 0, prox: azar(2, 5) };
    this.gestos = []; this.proxGesto = azar(3, 7);
    this.aburrimiento = 0;
    this.cara = { proxTragar: azar(15, 40), proxMorder: azar(8, 20) };
    this.habla = null;
    this.eventos = [];                                          // reacciones y gestos con envolvente
    this.limiteMorph = {};                                      // máximo por morph (por defecto 1): morphs débiles pueden pasar de 1
    this.expr = new ExpresionesVida(this);
  }

  // ---------------------------------------------------------------- API pública
  get animo() { return this._animo; }
  set animo(n) { if (ANIMOS[n]) this._animo = n; }
  morph(nombre, valor) { this.historia[nombre] = valor; this._escribir(nombre, valor); }
  parpadear(pico = 1) { this.parp.prox = 0; this.parp.picoForzado = pico; }
  suspirar() { this.resp.proxSuspiro = 0; }
  mirarA(destino) {                                            // Vector3 fijo u Object3D que se mueve
    if (destino?.isObject3D) { this.modoMirada = 'objeto'; this.objeto = destino; }
    else { this.modoMirada = 'punto'; this.punto.copy(destino); }
    this.mir.prox = 0;
  }
  // cursor en el mundo (o null si sale). opc.arrastre: el usuario está arrastrando (orbitar la cámara), no «señalando»
  ponerCursor(v3, opc = {}) {
    const c = this.cur, m = this.mir;
    if (!v3) {
      if (this.cursor) { m.vistazo = null; m.prox = 0; if (this.modoMirada === 'cursor' && this.parp.t < 0 && Math.random() < 0.6) this.parp.enCola = 0.05; }
      this.cursor = null; c.prev = null; c.vel = 0; return;
    }
    const aparece = !this.cursor;
    this.cursor = (this.cursor || new THREE.Vector3()).copy(v3);
    c.arrastre = !!opc.arrastre;
    // reaparece o se mueve tras un rato quieto: «¡ah, ahí está!» (cejas y ojos un instante, y lo busca)
    if (this.modoMirada === 'cursor' && (aparece || c.quieto > 1.6) && this.t - m.deteccion > 1.2) {
      m.deteccion = this.t; m.vistazo = null;
      if (this.parp.t < 0 && Math.random() < 0.45) this.parp.enCola = 0.06;
    }
    this.interaccion(0.2);
  }
  interaccion(cuanto = 1) { this.aburrimiento = Math.max(0, this.aburrimiento - cuanto * 60); }
  gesto(nombre) { const g = GESTOS[nombre]; if (g) this._lanzar(nombre, g); }
  expresion(nombre) { return this.expr.poner(nombre); }   // neutral devuelve el control al reposo vivo
  reaccionar(nombre) { const r = REACCIONES[nombre]; if (r) { this._lanzar(nombre, r); this.interaccion(); } }
  tocar(puntoMundo) {
    this.interaccion();
    const cuelloY = this.cuello ? posMundo(this.cuello).y : Infinity;
    this.mir.anula = { punto: puntoMundo.clone(), hasta: this.t + 0.7 };
    this.reaccionar(puntoMundo.y > cuelloY ? 'susto' : 'sorpresaLeve');
  }

  // habla: devuelve una promesa que se resuelve al terminar
  hablar(texto, opc = {}) {
    this.callar();
    const segs = textoAVisemas(texto, this.variante);
    const ritmo = opc.ritmo || 1;
    const linea = []; let t = 0.35; const tonicas = [], pausas = [], palabras = []; let pregunta = false, exclama = false;
    for (const s of segs) {
      if (s.pausa) { pausas.push({ t, dur: s.pausa }); if (s.signo === '?') pregunta = true; if (s.signo === '!') exclama = true; t += s.pausa / ritmo; continue; }
      if (s.apertura) { if (s.apertura === '¿') pregunta = true; else exclama = true; continue; }
      if (s.finPalabra !== undefined) { palabras.push({ i: s.finPalabra, fin: t }); continue; }
      const dur = s.dur / ritmo;
      linea.push({ vis: s.vis, t0: t, t1: t + dur, vocal: s.vocal, peso: s.vocal ? (APERTURA[s.vis] || 0.8) * (s.glide ? 0.6 : 1) : 1 });
      if (s.tonica) tonicas.push({ t: t + dur * 0.4, palabra: s.palabra });
      t += dur;
    }
    // sílabas finales de frase más largas
    const total = t + 0.15;
    this.habla = { linea, tonicas, pausas, palabras, t: 0, total, pregunta, exclama, vis: {}, voz: null, fin: null,
      mirarFuera: total > 2 && Math.random() < 0.45 ? azar(0.5, 1.0) : 0, texto };
    this.interaccion();
    // inspiración antes de hablar
    this.resp.fase = 0; this.resp.dur = 0.9; this.resp.amp = 1.3; this.resp.hablando = true;
    const prom = new Promise(res => this.habla.fin = res);
    if (opc.voz && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(texto);
      const voces = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang));
      const pref = this.variante === 'es' ? /es-ES/i : /es-(MX|US|419|CO|AR)/i;
      u.voice = voces.find(v => pref.test(v.lang) && /female|mujer|helena|sabina|paulina|monica|elvira|dalia/i.test(v.name)) || voces.find(v => pref.test(v.lang)) || voces[0] || null;
      u.lang = u.voice?.lang || (this.variante === 'es' ? 'es-ES' : 'es-MX');
      u.rate = ritmo; u.pitch = 1.05;
      const h = this.habla; h.voz = u; h.esperaVoz = true;
      // sincronizar con los límites de palabra que da el sintetizador
      let iPal = 0;
      u.onstart = () => { h.esperaVoz = false; h.t = 0.35; };
      u.onboundary = (e) => { if (e.name !== 'word' || h !== this.habla) return; const p = h.palabras[iPal - 1]; iPal++; if (p && Math.abs(h.t - p.fin) > 0.06) h.t = p.fin; };
      u.onend = () => { if (h === this.habla) h.t = Math.max(h.t, h.total - 0.1); };
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      setTimeout(() => { if (h.esperaVoz) h.esperaVoz = false; }, 1500);   // sin voz: seguir solo
    }
    return prom;
  }
  callar() { if (this.habla) { this.habla.fin?.(); this.habla = null; } if ('speechSynthesis' in window) speechSynthesis.cancel(); this.resp.hablando = false; }

  // ---------------------------------------------------------------- bucle
  antes() {
    for (const [h, q] of this.reposo) h.quaternion.copy(q);
    for (const [h, s] of this.reposoEscala) h.scale.copy(s);
    if (this.cadera && this.reposoPos) this.cadera.position.copy(this.reposoPos);
    for (const n of this.nombresVida) this._escribir(n, this.historia[n] || 0);
  }

  update(dtReal) {
    const dt = Math.min(dtReal, 0.1) * this.velocidad;
    this.t += dt;
    for (const n of this.nombresVida) this.vm[n] = 0;
    this._mezclarAnimo(dt);
    this.aburrimiento += dt;
    this.root.updateMatrixWorld(true);
    this.giros = new Map();                                     // giros acumulados en mundo por hueso [eje, ang]

    if (this.activo.postura) this._postura(dt);
    this.expr.cuerpo(dt, this.activo.postura);                // expresión: columna, cadera, clavículas, brazos y dedos
    if (this.activo.respiracion) this._respirar(dt);
    if (this.activo.peso && this.activo.postura) this._peso(dt);
    this._separarBrazos();                                      // la pose base ya libra el muslo: los gestos salen y vuelven a ella
    if (this.activo.gestos) this._programarGestos(dt);
    this._eventos(dt);                                          // gestos y reacciones en curso
    this._apoyar();                                             // nunca atravesar el suelo
    if (this.activo.inercia) this._inerciaBrazos(dt);           // los brazos arrastran y se asientan (no van rígidos)
    if (this.activo.habla) this._hablar(dt);
    if (this.activo.mirada || this.activo.cabeza) this._mirar(dt);
    this.expr.despuesMirada();                                  // manos a la cara: siguen a la cabeza
    if (this.activo.cara) this._cara(dt);
    if (this.activo.parpadeo) this._parpadear(dt);

    for (const n of this.nombresVida) { const a = this.vm[n]; if (a) this._escribir(n, clamp(this._leer(n) + a, 0, this.limiteMorph[n] ?? 1)); }
    if (this.cuerpo) { this.cuerpo.actualizar(); if (this.activo.colisiones) this.cuerpo.resolver(); }
    if (this.pelo) {
      this.pelo.activo = this.activo.pelo; this.root.updateMatrixWorld(true);
      this.pelo.update(dt, this.semilla, this.cuerpo && this.activo.colisiones ? this.cuerpo : null, this.suelo);
    }
  }

  // ---------------------------------------------------------------- internos: morphs y ánimo
  _escribir(n, v) { const l = this.indice[n]; if (l) for (const [m, i] of l) m.morphTargetInfluences[i] = v; }
  _leer(n) { const l = this.indice[n]; return l ? l[0][0].morphTargetInfluences[l[0][1]] : 0; }
  _sumar(n, v) { if (n in this.vm) this.vm[n] += v; }
  _copiaAnimo(a) { return { ...a, parpadeo: [...a.parpadeo], mirada: [...a.mirada], peso: [...a.peso], cara: { ...a.cara }, postura: { adelante: 0, ...a.postura } }; }
  _mezclarAnimo(dt) {
    const obj = ANIMOS[this._animo], p = this.p, k = amort(dt, 1.2);
    for (const n of NUMS) p[n] = (p[n] ?? obj[n] ?? (n === 'parpadeoLento' ? 1 : 0)) + ((obj[n] ?? (n === 'parpadeoLento' ? 1 : 0)) - (p[n] ?? 0)) * k;
    for (const n of ['parpadeo', 'mirada', 'peso']) for (let i = 0; i < 2; i++) p[n][i] += (obj[n][i] - p[n][i]) * k;
    for (const n of new Set([...Object.keys(p.cara), ...Object.keys(obj.cara)])) p.cara[n] = (p.cara[n] || 0) + ((obj.cara[n] || 0) - (p.cara[n] || 0)) * k;
    for (const n of new Set([...Object.keys(p.postura), ...Object.keys(obj.postura)])) p.postura[n] = (p.postura[n] || 0) + ((obj.postura[n] || 0) - (p.postura[n] || 0)) * k;
    p.miraAbajo = obj.miraAbajo; p.muerdeLabio = obj.muerdeLabio;
    this._e += (clamp(this.energia, 0, 1) - this._e) * amort(dt, 0.6);
  }
  _ejes() {
    const q = this.root.getWorldQuaternion(new THREE.Quaternion());
    return { lado: EJE_X.clone().applyQuaternion(q), arriba: EJE_Y.clone().applyQuaternion(q), frente: EJE_Z.clone().applyQuaternion(q) };
  }

  // ---------------------------------------------------------------- suelo
  // puntos de apoyo (talón y punta de cada pie), medidos en la malla en reposo y guardados en el espacio del hueso
  _contactos(root) {
    let malla = null, n = 0;
    root.traverse(o => { if (o.isSkinnedMesh && o.geometry.attributes.position.count > n) { malla = o; n = o.geometry.attributes.position.count; } });
    this.contactos = [];
    if (!malla) { this.sueloReposo = 0; return; }
    const g = malla.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = malla.skeleton.bones;
    const p = new THREE.Vector3();
    for (const L of this.lados) {
      if (!L.pie) continue;
      const iPie = bones.indexOf(L.pie), iPunta = L.punta ? bones.indexOf(L.punta) : -1;
      let talon = null, punta = null;
      for (let i = 0; i < n; i++) {
        let wp = 0, wt = 0;
        for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), w = sw.getComponent(i, k); if (b === iPie) wp += w; else if (b === iPunta) wt += w; }
        if (wp < 0.5 && wt < 0.5) continue;
        malla.getVertexPosition(i, p); malla.localToWorld(p);
        if (wp >= 0.5 && (!talon || p.y < talon.y - 1e-4 || (Math.abs(p.y - talon.y) < 0.004 * this.altura && p.z < talon.z))) talon = p.clone();
        if (wt >= 0.5 && (!punta || p.y < punta.y - 1e-4 || (Math.abs(p.y - punta.y) < 0.004 * this.altura && p.z > punta.z))) punta = p.clone();
      }
      if (talon) this.contactos.push({ hueso: L.pie, local: L.pie.worldToLocal(talon.clone()), lado: L });
      if (punta && L.punta) this.contactos.push({ hueso: L.punta, local: L.punta.worldToLocal(punta.clone()), lado: L });
    }
    this.sueloReposo = this.contactos.length ? Math.min(...this.contactos.map(c => c.hueso.localToWorld(c.local.clone()).y)) : 0;
    this.pies.forEach((pie, i) => { if (pie) { const cs = this.contactos.filter(c => c.lado === this.lados[i]); pie.suela = cs.length ? Math.min(...cs.map(c => c.hueso.localToWorld(c.local.clone()).y)) : pie.pos.y; } });
  }
  _alturaSuelo(x, z) { return typeof this.suelo === 'function' ? this.suelo(x, z) : (this.suelo ?? 0); }
  // nada atraviesa el suelo: si un apoyo queda por debajo, sube la cadera; con clips, además, el pie más bajo se apoya
  _apoyar() {
    this.hundido = 0;
    if (!this.cadera || !this.contactos.length || this.suelo === null) return;
    this.root.updateMatrixWorld(true);
    let peor = -Infinity, minGap = Infinity;
    for (const c of this.contactos) {
      const w = c.hueso.localToWorld(c.local.clone());
      const gap = w.y - this._alturaSuelo(w.x, w.z);
      peor = Math.max(peor, -gap); minGap = Math.min(minGap, gap);
    }
    const subir = this.pegarAlSuelo ? -minGap : Math.max(0, peor);
    if (Math.abs(subir) < 1e-5) return;
    const pW = posMundo(this.cadera).add(new THREE.Vector3(0, subir, 0));
    this.cadera.position.copy(pW.applyMatrix4(this.cadera.parent.matrixWorld.clone().invert()));
    this.root.updateMatrixWorld(true);
    this.hundido = subir;
  }

  // ---------------------------------------------------------------- postura relajada (brazos abajo, dedos sueltos)
  _postura(dt) {
    const { lado, arriba, frente } = this._ejes();
    const po = this.p.postura, I = this.intensidad, e = this._e - 0.5;
    // ánimo + energía: con poca energía se encorva, baja los hombros y la cabeza; con mucha se yergue
    const pecho = po.pecho * I - e * 8, cabeza = po.cabeza * I - e * 6, hombros = po.hombros * I + e * 6;
    const inclina = po.inclina * I, adelante = (po.adelante || 0) * I;
    girarMundo(this.lumbar, lado, (pecho * 0.3 + adelante * 0.5) * DEG);
    girarMundo(this.espalda, lado, pecho * 0.35 * DEG);
    girarMundo(this.pecho, lado, pecho * 0.35 * DEG);
    girarMundo(this.cuello, lado, (cabeza * 0.4 - pecho * 0.5) * DEG);
    girarMundo(this.giroCabeza, lado, cabeza * 0.6 * DEG);
    girarMundo(this.giroCabeza, frente, inclina * DEG * (Math.sin(this.semilla) > 0 ? 1 : -1));
    const t = this.t, s = this.semilla;
    for (const L of this.lados) {
      const sg = L.signo;
      if (L.hombro) girarMundo(L.hombro, frente, sg * hombros * DEG);
      if (!L.brazo || !L.antebrazo || !L.mano) continue;
      // brazo: colgando, un poco separado y adelantado; deriva lenta
      L.brazo.updateWorldMatrix(true, true);
      const A = posMundo(L.brazo), B = posMundo(L.antebrazo);
      const dentro = (pecho > 3 ? 0.03 : 0);
      const dir = lado.clone().multiplyScalar(sg * (0.16 - dentro + ruido(t * 0.15, s + sg * 3) * 0.02))
        .addScaledVector(arriba, -1).addScaledVector(frente, 0.03 + dentro * 2 + ruido(t * 0.13, s + sg * 4) * 0.025).normalize();
      aplicarMundo(L.brazo, new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), dir));
      // giro del brazo para que la palma mire al muslo
      L.brazo.updateWorldMatrix(true, true);
      girarMundo(L.brazo, dir, -sg * 8 * DEG);
      // codo: ligeramente doblado hacia delante
      L.antebrazo.updateWorldMatrix(true, true);
      const B2 = posMundo(L.antebrazo), C = posMundo(L.mano);
      const dir2 = dir.clone().addScaledVector(frente, 0.2 + 0.03 * ruido(t * 0.2, s + sg)).normalize();
      aplicarMundo(L.antebrazo, new THREE.Quaternion().setFromUnitVectors(C.clone().sub(B2).normalize(), dir2));
      // muñeca suelta
      girarMundo(L.mano, lado, -sg * 0 * DEG);
      // dedos: curvatura relajada, distinta en cada dedo, con microvariación
      this._curvarDedos(L, 1);
    }
  }
  // ---------------------------------------------------------------- inercia de brazos (movimiento secundario)
  // Sobre la pose ya calculada (postura, gestos, clips): el codo y la muñeca siguen su sitio con un muelle
  // amortiguado en el MUNDO. Si el hombro o el cuerpo se mueven, el brazo se retrasa, rebasa un poco y se asienta.
  // abre el brazo (giro hacia fuera en el hombro) lo justo para que antebrazo, mano y puntas de los dedos no entren
  // en el muslo. Se hace sobre la pose final, así el resolvedor de colisiones no tiene que pelear cada fotograma.
  _separarBrazos() {
    const F = this.cuerpo; if (!F || !this.activo.colisiones) return;
    const { frente } = this._ejes(), h = this.altura, margen = 0.004 * h, rDedo = 0.008 * h;
    this.root.updateMatrixWorld(true);
    this.lados.forEach((L) => {
      const muslo = F.porId['muslo' + (L.signo > 0 ? 'L' : 'R')], mano = F.porId['mano' + (L.signo > 0 ? 'L' : 'R')];
      if (!muslo || !L.brazo || !L.mano) return;
      const largo = posMundo(L.brazo).distanceTo(posMundo(L.mano)) || 0.4 * h;
      for (let it = 0; it < 3; it++) {
        F.refrescar(muslo);
        const pts = [[posMundo(L.mano), mano?.r || rDedo], [posMundo(L.antebrazo).lerp(posMundo(L.mano), 0.6), F.porId['antebrazo' + (L.signo > 0 ? 'L' : 'R')]?.r || rDedo]];
        for (const cad of [...L.dedos, L.pulgar]) { const u = cad.at(-1); if (u) pts.push([posMundo(u).lerp(posMundo(u.parent), -0.8), rDedo]); }
        let peor = Infinity; for (const [p, r] of pts) peor = Math.min(peor, F.distancia(p, muslo) - r);
        if (peor >= margen) break;
        girarMundo(L.brazo, frente, L.signo * (margen - peor) / largo * 1.15);
        L.brazo.updateWorldMatrix(false, true);
      }
    });
  }
  _inerciaBrazos(dt) {
    this.root.updateMatrixWorld(true);
    const reinicio = dt <= 0 || dt > 0.1;
    const muelle = (x, v, obj, [f, z]) => {
      const w = 2 * Math.PI * f, pasos = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / pasos;
      for (let i = 0; i < pasos; i++) { const a = obj.clone().sub(x).multiplyScalar(w * w).addScaledVector(v, -2 * z * w); v.addScaledVector(a, h); x.addScaledVector(v, h); }
    };
    this.lados.forEach((L, i) => {
      if (!L.brazo || !L.antebrazo || !L.mano) return;
      L.brazo.updateWorldMatrix(true, true);
      const A = posMundo(L.brazo), B = posMundo(L.antebrazo), C = posMundo(L.mano);
      let s = this._brazos[i];
      if (!s || reinicio) { this._brazos[i] = { e: B.clone(), ev: new THREE.Vector3(), w: C.clone(), wv: new THREE.Vector3() }; return; }
      // codo
      const l1 = B.distanceTo(A);
      muelle(s.e, s.ev, B, this.inercia.codo);
      s.e.sub(A).setLength(l1).add(A);                          // el brazo no se estira
      aplicarMundo(L.brazo, new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), s.e.clone().sub(A).normalize()));
      L.brazo.updateWorldMatrix(false, true);
      // muñeca, respecto al codo ya movido
      const B2 = posMundo(L.antebrazo), C2 = posMundo(L.mano), l2 = C2.distanceTo(B2);
      muelle(s.w, s.wv, C2, this.inercia.muneca);
      s.w.sub(B2).setLength(l2).add(B2);
      aplicarMundo(L.antebrazo, new THREE.Quaternion().setFromUnitVectors(C2.clone().sub(B2).normalize(), s.w.clone().sub(B2).normalize()));
      L.antebrazo.updateWorldMatrix(false, true);
    });
  }
  _palma(L) {
    const m = L.mano, i1 = L.dedos[0]?.[0], p1 = L.dedos[3]?.[0], m1 = L.dedos[1]?.[0];
    if (!m || !i1 || !p1 || !m1) return null;
    m.updateWorldMatrix(true, true);
    const a = posMundo(m1).sub(posMundo(m)).normalize(), x = posMundo(i1).sub(posMundo(p1)).normalize();
    return new THREE.Vector3().crossVectors(a, x).multiplyScalar(L.signo).normalize();
  }
  _curvarDedos(L, factor, extra = 0) {
    const palma = this._palma(L); if (!palma) return;
    const t = this.t, s = this.semilla;
    const base = [14, 18, 22, 26];                              // índice más recto, meñique más cerrado
    L.dedos.forEach((cadena, d) => {
      const var_ = ruido(t * 0.25, s + d * 7 + L.signo * 31) * 5;
      cadena.forEach((h, k) => {
        const hijo = cadena[k + 1] || h.children.find(c => c.isBone); if (!hijo) return;
        h.updateWorldMatrix(true, true);
        const dirD = posMundo(hijo).sub(posMundo(h)).normalize();
        const eje = new THREE.Vector3().crossVectors(dirD, palma).normalize();
        const ang = ((base[d] + var_) * [0.8, 1.1, 0.8][k] * factor + extra * [1, 1.2, 0.8][k]) * DEG;
        girarMundo(h, eje, ang);
      });
    });
    const p0 = L.pulgar[0], p1 = L.pulgar[1];
    if (p0 && p1) { p0.updateWorldMatrix(true, true); const d = posMundo(p1).sub(posMundo(p0)).normalize(); girarMundo(p0, new THREE.Vector3().crossVectors(d, palma).normalize(), (8 * factor + extra * 0.5) * DEG); }
  }

  // ---------------------------------------------------------------- respiración
  _respirar(dt) {
    const r = this.resp, p = this.p;
    const porMin = p.resp * (0.65 + 0.8 * this._e);
    r.fase += dt / r.dur;
    r.proxSuspiro -= dt;
    if (r.fase >= 1) {
      r.fase -= 1;
      if (r.hablando && this.habla) { r.fase = 0.4; r.dur = 99; }                       // al hablar: espiración lenta durante la frase
      else if (r.proxSuspiro <= 0) { r.suspiro = 1; r.proxSuspiro = azar(25, 70) / (p.suspiros || 1); r.dur = 60 / porMin * 1.9; r.amp = 2.6; }
      else { r.suspiro = 0; r.hablando = false; r.dur = 60 / porMin * azar(0.85, 1.15); r.amp = azar(0.8, 1.2); }
    }
    if (r.proxSuspiro <= 0 && r.suspiro === 0 && r.fase > 0.9 && !this.habla) r.fase = 1;
    const f = r.fase;
    let b;
    if (r.dur === 99) b = Math.max(0.15, 1 - (this.habla ? this.habla.t / this.habla.total : 1));   // se vacía hablando
    // inspiración activa (36 %), espiración pasiva que se frena al final (50 %) y pausa en vacío (14 %)
    else b = f < 0.36 ? 0.5 - 0.5 * Math.cos(Math.PI * f / 0.36) : f < 0.86 ? 1 - suave((f - 0.36) / 0.5) ** 0.85 : 0;
    if (r.dur === 99 && !this.habla) { r.dur = 1.2; r.fase = 0.4; r.hablando = false; }
    let caida = 0;
    if (r.suspiro && f > 0.55) caida = Math.sin(Math.PI * (f - 0.55) / 0.45) * 0.6;
    const a = b * r.amp * p.ampResp * (0.75 + 0.5 * this._e) * (this.ampRespiracion ?? 1) + r.extra;
    r.extra *= 1 - amort(dt, 0.4);
    const { lado, frente } = this._ejes();
    // el pecho se abre hacia atrás y arriba; el cuello solo lo compensa en parte, así la cabeza
    // acompaña la inspiración con un cabeceo mínimo (antes se anulaba del todo y la cabeza parecía clavada)
    girarMundo(this.lumbar, lado, -0.3 * DEG * a);
    girarMundo(this.espalda, lado, -0.9 * DEG * a);
    girarMundo(this.pecho, lado, -1.9 * DEG * a);
    girarMundo(this.cuello, lado, 2.5 * DEG * a);
    girarMundo(this.giroCabeza, lado, -0.25 * DEG * a);
    // los hombros suben al llenar y caen al soltar el aire (en el suspiro, más); uno un poco antes que el otro
    for (const L of this.lados) if (L.hombro) girarMundo(L.hombro, frente, L.signo * (2.6 * a * (L.signo > 0 ? 1 : 0.92) - 1.4 * caida) * DEG);
    // expansión del tórax: escala uniforme pequeña del pecho; los hijos (cuello, clavículas) la deshacen
    // para que cabeza y brazos no crezcan, pero suben y se abren lo que se expande la caja torácica
    if (this.pecho && this.reposoEscala.size) {
      const k = 1 + 0.014 * clamp(a, 0, 1.8);
      this.pecho.scale.copy(this.reposoEscala.get(this.pecho)).multiplyScalar(k);
      for (const h of this.respHijos) h.scale.copy(this.reposoEscala.get(h)).multiplyScalar(1 / k);
    }
    // aletas de la nariz en cada inspiración (más con respiración agitada o suspiro) y labios que se sueltan al espirar
    const nariz = (p.resp > 18 || r.suspiro ? 0.07 : 0.035) * b;
    this._sumar('noseSneerLeft', nariz); this._sumar('noseSneerRight', nariz * 0.9);
    if (!this.habla && f > 0.4 && f < 0.86) this._sumar('jawOpen', 0.012 * Math.sin(Math.PI * (f - 0.4) / 0.46) * r.amp);
    if (r.suspiro && f > 0.4) this._sumar('jawOpen', 0.06 * Math.sin(Math.PI * (f - 0.4) / 0.6));
    this.respiracion = b;
  }

  // ---------------------------------------------------------------- peso: contrapposto con pies fijos (IK)
  _peso(dt) {
    const w = this.peso, p = this.p;
    w.prox -= dt * (0.3 + 1.4 * this._e);
    if (w.prox <= 0) {
      w.objetivo = Math.abs(w.objetivo) > 0.3 && Math.random() < 0.75 ? -Math.sign(w.objetivo) * azar(0.6, 1) : elegir([-1, 1]) * azar(0.2, 1);
      if (Math.random() < 0.2) w.objetivo = azar(-0.2, 0.2);    // a veces, repartido
      w.prox = azar(p.peso[0], p.peso[1]);
    }
    // muelle casi crítico: el cambio de apoyo arranca despacio, cruza y se asienta con un rebase mínimo
    // (la exponencial de antes salía de golpe y se arrastraba al final)
    { const wn = 2 * Math.PI * 0.42, z = 0.82, pasos = Math.max(1, Math.ceil(dt / (1 / 60))), hh = dt / pasos;
      for (let i = 0; i < pasos; i++) { w.vel += (wn * wn * (w.objetivo - w.actual) - 2 * z * wn * w.vel) * hh; w.actual += w.vel * hh; } }
    const h = this.altura, x = w.actual, t = this.t, s = this.semilla;
    const { lado, arriba, frente } = this._ejes();
    // la cadera va hacia la pierna de apoyo, cae del lado libre, y hay un vaivén mínimo constante
    const vaiven = ruido(t * 0.25, s + 20) * 0.0055 * h, vaivenZ = ruido(t * 0.2, s + 21) * 0.0045 * h;
    const desp = lado.clone().multiplyScalar(x * 0.018 * h + vaiven).addScaledVector(frente, vaivenZ).addScaledVector(arriba, -Math.abs(x) * 0.006 * h);
    // el cuerpo baja o sube con el suelo (si un pie pisa más alto, esa pierna se dobla)
    const ajustes = this.pies.filter(Boolean).map(pie => this._alturaSuelo(pie.pos.x, pie.pos.z) - pie.suela);
    if (ajustes.length) desp.y += Math.min(...ajustes);
    if (this.cadera) {
      const padreInv = this.cadera.parent.matrixWorld.clone().invert();
      const pW = posMundo(this.cadera).add(desp);
      this.cadera.position.copy(pW.applyMatrix4(padreInv));
      girarMundo(this.cadera, frente, x * 3.2 * DEG);
      girarMundo(this.cadera, arriba, x * 2 * DEG + ruido(t * 0.18, s + 22) * 0.8 * DEG);
    }
    // la columna compensa para que los hombros queden casi nivelados
    girarMundo(this.lumbar, frente, -x * 1.6 * DEG);
    girarMundo(this.espalda, frente, -x * 1.4 * DEG);
    girarMundo(this.pecho, frente, -x * 0.9 * DEG + ruido(t * 0.22, s + 23) * 0.5 * DEG);
    girarMundo(this.cuello, frente, -x * 0.5 * DEG);
    // el tronco nunca está clavado: torsión y balanceo lentos (la mirada, que se calcula después, se mantiene en su sitio)
    girarMundo(this.espalda, arriba, ruido(t * 0.16, s + 24) * 1.1 * DEG);
    girarMundo(this.lumbar, lado, ruido(t * 0.19, s + 25) * 0.6 * DEG);
    // pies plantados sobre el suelo (que puede estar a otra altura o ser irregular)
    this.root.updateMatrixWorld(true);
    this.lados.forEach((L, i) => {
      const pie = this.pies[i]; if (!(pie && L.muslo && L.pierna && L.pie)) return;
      const obj = pie.pos.clone(); obj.y += this._alturaSuelo(obj.x, obj.z) - pie.suela;
      this._ik(L.muslo, L.pierna, L.pie, obj, pie.q, frente);
    });
  }
  _ik(a, b, c, objetivo, qPie, polo) {
    a.updateWorldMatrix(true, true);
    const A = posMundo(a), B = posMundo(b), C = posMundo(c);
    const l1 = B.distanceTo(A), l2 = C.distanceTo(B);
    const T = objetivo.clone(), d = clamp(T.distanceTo(A), 0.01, (l1 + l2) * 0.9995);
    const n = T.clone().sub(A).normalize();
    const a1 = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a1 * a1));
    const pd = polo.clone().addScaledVector(n, -polo.dot(n)).normalize();
    const K = A.clone().addScaledVector(n, a1).addScaledVector(pd, hh);
    aplicarMundo(a, new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), K.clone().sub(A).normalize()));
    a.updateWorldMatrix(true, true);
    const B2 = posMundo(b), C2 = posMundo(c);
    aplicarMundo(b, new THREE.Quaternion().setFromUnitVectors(C2.clone().sub(B2).normalize(), T.clone().sub(B2).normalize()));
    b.updateWorldMatrix(true, true);
    c.parent.getWorldQuaternion(_q2);
    c.quaternion.copy(_q2.invert().multiply(qPie));
  }

  // ---------------------------------------------------------------- gestos y reacciones (eventos con envolvente)
  _lanzar(nombre, def) {
    if (def.unico && this.eventos.some(e => e.nombre === nombre)) return;
    const dur = typeof def.dur === 'function' ? def.dur(this) : def.dur;
    const ev = { nombre, def, t: 0, dur, lado: Math.random() < 0.5 ? 1 : -1, datos: {} };
    def.inicio?.(this, ev);
    this.eventos.push(ev);
  }
  _eventos(dt) {
    for (const e of this.eventos) { e.t += dt; e.def.aplicar(this, clamp(e.t / e.dur, 0, 1), e); }
    this.eventos = this.eventos.filter(e => e.t < e.dur);
  }
  _programarGestos(dt) {
    if (this.habla || this.expr.total > .05) return;
    const p = this.p, ab = clamp(this.aburrimiento / 60, 0, 2);
    this.proxGesto -= dt * p.fidget * (0.3 + 1.4 * this._e) * (1 + ab * 0.6);
    if (this.proxGesto > 0 || this.eventos.some(e => e.def.cuerpo)) return;
    const opciones = [['hombros', 1], ['cuello', 0.8], ['mirarAlrededor', 0.9 + ab], ['dedos', 1], ['ajustarPostura', 0.8], ['tragar', 0.5]];
    const brazosLibres = this.expr.sBrazos < 0.2;
    if (!brazosLibres) opciones.splice(opciones.findIndex(o => o[0] === 'dedos'), 1);
    if (this.activo.postura && brazosLibres) opciones.push(['manosJuntas', 0.4]);
    if (ab > 0.8 || (p.bostezos || 0) > 1) opciones.push(['bostezo', 0.5 * ab + (p.bostezos || 0) * 0.3], ...(brazosLibres ? [['estirarse', 0.3 * ab]] : []));
    if (p.muerdeLabio) opciones.push(['morderLabio', 1.2]);
    const tot = opciones.reduce((a, o) => a + o[1], 0); let r = Math.random() * tot;
    const elegido = opciones.find(o => (r -= o[1]) <= 0)?.[0] || 'hombros';
    this.gesto(elegido);
    this.proxGesto = azar(5, 13);
  }

  // ---------------------------------------------------------------- mirada y cabeza
  _puntoCamara(out) {
    if (!this.camara) return out.set(0, 0, 10).applyMatrix4(this.cabeza.matrixWorld);
    return this.camara.getWorldPosition(out);
  }
  _elegirObjetivo() {
    const m = this.mir, p = this.p, out = m.objetivo;
    const cam = this._puntoCamara(new THREE.Vector3());
    const ojo = posMundo(this.cabeza);
    const deambula = this.modoMirada === 'deambular' ? 0.65 : this.modoMirada === 'camara' ? p.deambula * (this.habla ? 0.3 : 1) * (1 - this.expr.total) : 0;
    if (this.modoMirada === 'punto') out.copy(this.punto);
    else if (this.modoMirada === 'objeto' && this.objeto) posMundo(this.objeto, out);
    else if (this.modoMirada === 'cursor' && this.cursor) out.copy(this.cursor);
    else if (Math.random() < deambula) {
      const d = cam.clone().sub(ojo), dist = d.length(); d.normalize();
      const abajo = p.miraAbajo ? -10 : 0;
      const yaw = azar(-28, 28) * DEG, pitch = ((Math.random() < 0.3 ? azar(8, 18) : azar(-16, 6)) + abajo) * DEG;
      d.applyAxisAngle(EJE_Y, yaw);
      d.applyAxisAngle(new THREE.Vector3().crossVectors(d, EJE_Y).normalize(), pitch);
      out.copy(ojo).addScaledVector(d, dist * azar(0.6, 1.2));
    } else out.copy(cam);
    const [a, b] = p.mirada;
    m.prox = azar(a, b) * (1.6 - 1.1 * this._e);
  }
  _objetivoActual() {
    const m = this.mir;
    if (m.anula && this.t < m.anula.hasta) return m.anula.punto;
    if (m.anula) { m.anula = null; m.prox = 0; }
    // vistazo: interrumpe la fijación un momento (a la cámara, a otro sitio o al cursor que pasa) y vuelve
    if (m.vistazo) {
      if (this.t < m.vistazo.hasta) return m.vistazo.sigue && this.cursor ? m.vistazo.punto.copy(this.cursor) : m.vistazo.punto;
      m.vistazo = null;
      if (this.parp.t < 0 && Math.random() < 0.45) this.parp.enCola = 0.03;
    }
    if (this.modoMirada === 'cursor' && this.cursor) return m.objetivo.copy(this.cursor);
    if (this.modoMirada === 'objeto' && this.objeto) return posMundo(this.objeto, m.objetivo);
    if (this.modoMirada === 'camara' && m.prox > 0 && m.objetivoEsCamara) return this._puntoCamara(m.objetivo);
    return m.objetivo;
  }
  // ---- atención al cursor: velocidad, quietud, interés; vistazos que rompen la fijación
  _atencion(dt) {
    const c = this.cur, m = this.mir, h = this.altura;
    if (this.cursor) {
      if (c.prev && dt > 0) { const v = this.cursor.distanceTo(c.prev) / dt; c.vel += (v - c.vel) * amort(dt, 0.12); }
      (c.prev ||= new THREE.Vector3()).copy(this.cursor);
      const mueve = c.vel > 0.05 * h;
      c.quieto = mueve ? 0 : c.quieto + dt;
      c.interes = clamp(c.interes + (mueve ? dt * 1.6 : -dt * 0.12), 0, 1);
      if (mueve && m.vistazo && !m.vistazo.sigue && this.modoMirada === 'cursor') m.vistazo = null;   // se mueve: vuelve a él
    } else { c.quieto += dt; c.interes = Math.max(0, c.interes - dt * 0.3); }
    if (this.habla || m.anula || m.vistazo) return;
    const o = posMundo(this.cabeza);
    if (this.modoMirada === 'cursor' && this.cursor && c.quieto > 2.2) {
      // el cursor lleva rato quieto: no se queda clavado, echa vistazos (a la cámara o a otro sitio) y vuelve
      m.proxVistazo -= dt * (0.6 + 0.4 * this.p.fidget);
      if (m.proxVistazo <= 0) {
        m.proxVistazo = azar(2.2, 5.5);
        let punto;
        if (Math.random() < 0.55) punto = this._puntoCamara(new THREE.Vector3());
        else {
          const d = this.cursor.clone().sub(o), dist = d.length(); d.normalize();
          d.applyAxisAngle(EJE_Y, elegir([-1, 1]) * azar(10, 24) * DEG);
          d.applyAxisAngle(new THREE.Vector3().crossVectors(d, EJE_Y).normalize(), azar(-12, 6) * DEG);
          punto = o.clone().addScaledVector(d, dist);
        }
        m.vistazo = { punto, hasta: this.t + azar(0.5, 1.3) };
      }
    } else if (this.modoMirada === 'camara' && this.cursor && !c.arrastre && this.expr.total < 0.3) {
      // mirando a cámara, un cursor que cruza deprisa le llama la atención: lo sigue un momento y vuelve
      c.proxAtencion -= dt;
      if (c.proxAtencion <= 0 && c.vel > 0.3 * h && Math.random() < dt * 4) {
        c.proxAtencion = azar(3.5, 9);
        m.vistazo = { punto: this.cursor.clone(), sigue: true, hasta: this.t + azar(0.6, 1.4) };
      }
    }
  }
  _mirar(dt) {
    const m = this.mir;
    if (!this.cabeza) return;
    this._atencion(dt);
    m.prox -= dt;
    if (m.prox <= 0 || m.inicial) {
      const antes = m.objetivo.clone();
      this._elegirObjetivo();
      m.objetivoEsCamara = m.objetivo.distanceTo(this._puntoCamara(new THREE.Vector3())) < 1e-4;
      if (m.inicial) { m.fijacion.copy(m.objetivo); m.inicial = false; }
      else {
        const o = posMundo(this.cabeza);
        const ang = antes.clone().sub(o).angleTo(m.objetivo.clone().sub(o));
        if (ang > 12 * DEG && Math.random() < 0.45 && this.parp.t < 0) this.parp.enCola = 0.02;
      }
    }
    // hablando: al empezar una frase larga, aparta la mirada y vuelve
    let T = this._objetivoActual().clone();
    if (this.habla && this.habla.mirarFuera && this.habla.t < this.habla.mirarFuera) {
      const o = posMundo(this.cabeza), d = T.clone().sub(o);
      d.applyAxisAngle(EJE_Y, (this.habla.lado ||= elegir([-1, 1])) * 18 * DEG);
      d.applyAxisAngle(new THREE.Vector3().crossVectors(d, EJE_Y).normalize(), 10 * DEG);
      T = o.add(d);
    }
    // gesto que pide mirar a otro sitio
    for (const e of this.eventos) if (e.datos.mirar) T = e.datos.mirar.clone();
    // expresión: los ojos se van a un lado o abajo (miradaX + = a su izquierda, miradaY + = abajo)
    const ex = this.expr.cab;
    if (Math.abs(ex.mx) + Math.abs(ex.my) > 1e-3) {
      const o = posMundo(this.cabeza), d = T.clone().sub(o);
      d.applyAxisAngle(EJE_Y, ex.mx * 32 * DEG);
      d.applyAxisAngle(new THREE.Vector3().crossVectors(d, EJE_Y).normalize(), ex.my * 24 * DEG);
      T = o.add(d);
    }

    // ---- ojos: sacadas (secuencia principal) y persecución suave
    const o = posMundo(this.cabeza);
    const continuo = m.vistazo ? !!m.vistazo.sigue
      : !!((this.modoMirada === 'cursor' && this.cursor) || (this.modoMirada === 'objeto' && this.objeto));
    // velocidad del objetivo (suavizada): la persecución se adelanta a él en vez de ir siempre detrás
    if (m.tPrev && dt > 0) {
      if (T.distanceTo(m.tPrev) > 0.6 * this.altura) m.tVel.set(0, 0, 0);
      else m.tVel.lerp(T.clone().sub(m.tPrev).divideScalar(dt), amort(dt, 0.1)).clampLength(0, 4 * this.altura);
    }
    (m.tPrev ||= new THREE.Vector3()).copy(T);
    if (!continuo) m.tVel.multiplyScalar(1 - amort(dt, 0.05));
    if (m.sac) {
      // sacada: rapidísima (unos 0,05 s para 10°), con el pico de velocidad al principio y frenada más larga
      m.sac.t += dt; m.sac.to.copy(T).addScaledVector(m.tVel, continuo ? Math.max(0, m.sac.dur - m.sac.t) : 0);
      const u = clamp(m.sac.t / m.sac.dur, 0, 1);
      m.fijacion.lerpVectors(m.sac.from, m.sac.to, suave(Math.pow(u, 0.75)));
      if (u >= 1) m.sac = null;
    } else {
      const err = m.fijacion.clone().sub(o).angleTo(T.clone().sub(o)) / DEG;
      if (err > (continuo ? 3.5 : 1.5)) {
        // sacada (o sacada de recuperación si persigue y se ha quedado atrás)
        m.sac = { from: m.fijacion.clone(), to: T.clone(), t: 0, dur: (0.028 + 0.0024 * Math.min(err, 60)) * (1.25 - 0.5 * this._e) };
        if (err > 15 && Math.random() < 0.5 && this.parp.t < 0) this.parp.enCola = 0.03;
      } else if (continuo) {
        // persecución: va con la velocidad del objetivo (ganancia 0,92) y corrige el error que queda
        m.fijacion.addScaledVector(m.tVel, dt * 0.92).lerp(T, amort(dt, 0.07));
      } else m.fijacion.lerp(T, amort(dt, 0.12));
    }
    // detección: al reaparecer o moverse el cursor tras un rato quieto, cejas arriba y ojos abiertos un instante
    const ud = (this.t - m.deteccion) / 0.8;
    if (ud > 0 && ud < 1) {
      const a = env(ud, 0.12, 0.6);
      this._sumar('browInnerUp', a * 0.14); this._sumar('browOuterUpLeft', a * 0.17); this._sumar('browOuterUpRight', a * 0.15);
      this._sumar('eyeWideLeft', a * 0.12); this._sumar('eyeWideRight', a * 0.12);
    }
    if (this.modoMirada === 'cursor' && this.cursor) { const w = this.cur.interes * 0.06; this._sumar('eyeWideLeft', w); this._sumar('eyeWideRight', w); }

    // ---- cabeza, cuello y torso: muelle crítico hacia una parte del giro
    if (this.activo.cabeza) {
      this.cabeza.updateWorldMatrix(true, false);
      const qc = this.cabeza.getWorldQuaternion(new THREE.Quaternion());
      const d = T.clone().sub(o).applyQuaternion(qc.clone().invert());
      let yaw = Math.atan2(d.x, d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const parte = (a, muerta, f) => Math.sign(a) * Math.max(0, Math.abs(a) - muerta) * f;
      // siguiendo algo que se mueve, la cabeza acompaña más y antes (menos zona muerta, filtro más corto)
      let f = continuo ? Math.max(this.p.cabezaParte, 0.72) : this.p.cabezaParte;
      for (const e of this.eventos) if (e.datos.cabezaParte) f = e.datos.cabezaParte;
      // reajustes posturales: cada pocos segundos la cabeza cambia un pelo de sitio (con arco y asentamiento del muelle)
      const aj = m.ajuste, mi = this.p.micro;
      aj.prox -= dt * (0.5 + this._e);
      if (aj.prox <= 0) {
        aj.y = azar(-2.6, 2.6) * DEG * mi; aj.p = azar(-1.6, 1.4) * DEG * mi; aj.r = azar(-2.6, 2.6) * DEG * mi;
        aj.prox = azar(1.6, 4.5);
        if (Math.random() < 0.12 && this.parp.t < 0) this.parp.enCola = 0.06;   // a veces lo puntúa un parpadeo
      }
      const ty = clamp(parte(yaw, (continuo ? 3.5 : 6) * DEG, f) + ex.yaw + aj.y, -50 * DEG, 50 * DEG);
      const tp = clamp(parte(pitch, 3 * DEG, f * 0.75) + ex.pitch + aj.p, -25 * DEG, 25 * DEG);
      // objetivo filtrado + muelle críticamente amortiguado + velocidad máxima: arranque y frenada en S
      const tauF = continuo ? 0.09 : 0.16;
      m.fy = (m.fy ?? ty) + (ty - (m.fy ?? ty)) * amort(dt, tauF); m.fp = (m.fp ?? tp) + (tp - (m.fp ?? tp)) * amort(dt, tauF);
      const w = continuo ? 4.2 + 4.5 * this._e : 3.2 + 3.8 * this._e, k = w * w, c = 2 * w, vmax = (60 + 110 * this._e) * DEG;
      m.vyaw = clamp(m.vyaw + (k * (m.fy - m.yaw) - c * m.vyaw) * dt, -vmax, vmax); m.yaw += m.vyaw * dt;
      m.vpitch = clamp(m.vpitch + (k * (m.fp - m.pitch) - c * m.vpitch) * dt, -vmax, vmax); m.pitch += m.vpitch * dt;
      // ladeo: el reajuste postural + un poco hacia el lado al que gira (la cabeza entra en el giro)
      const rollObj = aj.r + clamp(-m.yaw * 0.12, -4 * DEG, 4 * DEG);
      m.vroll += (k * (rollObj - m.roll) - c * m.vroll) * dt; m.roll += m.vroll * dt;
      const t = this.t * (0.08 + 0.2 * this._e), s = this.semilla;
      // deriva lenta + temblor fino (nunca del todo quieta)
      const yawT = m.yaw + (ruido(t, s) * 1.5 + ruido(this.t * 0.9, s + 3) * 0.35) * DEG * mi;
      const pitchT = m.pitch + (ruido(t, s + 1) * 1.0 + ruido(this.t * 1.1, s + 4) * 0.25) * DEG * mi;
      const roll = m.roll + ruido(t * 0.8, s + 2) * 1.1 * DEG * mi + ex.roll;   // la cadena reparte el ladeo de la expresión (suma 1)
      const arriba = EJE_Y.clone().applyQuaternion(qc), lado = EJE_X.clone().applyQuaternion(qc), frente = EJE_Z.clone().applyQuaternion(qc);
      const cadena = this.cabezaRigida
        ? [[this.lumbar, 0.05, 0], [this.espalda, 0.1, 0.03], [this.pecho, 0.15, 0.07], [this.cuello, 0.7, 0.9]]
        : [[this.espalda, 0.08, 0], [this.pecho, 0.12, 0.05], [this.cuello, 0.32, 0.4], [this.cabeza, 0.48, 0.55]];
      for (const [h, fy, fp] of cadena) {
        girarMundo(h, arriba, yawT * fy);
        girarMundo(h, lado, -pitchT * fp);
        girarMundo(h, frente, roll * fp);
      }
      this.ultimaCabeza = { yaw: yawT, pitch: pitchT };
    }

    // ---- ojos: cada uno apunta a la fijación (convergencia y reflejo vestíbulo-ocular)
    if (!this.activo.mirada) return;
    m.proxMicro -= dt; m.proxSub -= dt;
    if (m.proxMicro <= 0) { m.micro = [azar(-0.4, 0.4) * DEG, azar(-0.3, 0.3) * DEG]; m.proxMicro = azar(0.25, 0.9); }
    if (m.proxSub <= 0) {
      const r = Math.random();
      m.sub.set(r < 0.45 ? -0.03 : r < 0.9 ? 0.03 : 0, r >= 0.9 ? -0.05 : 0).multiplyScalar(this.altura / 1.0 * 0.6);
      m.proxSub = azar(0.5, 2.2);
    }
    this.cabeza.updateWorldMatrix(true, true);
    const qc = this.cabeza.getWorldQuaternion(new THREE.Quaternion());
    const qInv = qc.clone().invert();
    const fij = m.fijacion.clone();
    if (this.modoMirada === 'camara' && m.objetivoEsCamara) fij.add(new THREE.Vector3(m.sub.x, m.sub.y, 0));
    // mirada conjugada: los dos ojos giran juntos (desde el punto medio), con un límite suave para que el
    // globo no gire tanto que se vea su borde; cada ojo solo añade una convergencia pequeña
    const angulos = (desde) => { const d = fij.clone().sub(desde).applyQuaternion(qInv); return [Math.atan2(d.x, d.z), Math.atan2(d.y, Math.hypot(d.x, d.z))]; };
    const ojosOk = this.ojos.filter(Boolean);
    const medio = ojosOk.reduce((a, oj) => a.add(posMundo(oj)), new THREE.Vector3()).divideScalar(Math.max(1, ojosOk.length));
    const [yawC, pitchC] = angulos(medio);
    const blando = (a, L) => L * Math.tanh(a / L);
    // con los ojos cerrados por la expresión, el globo vuelve al frente: si siguiera mirando,
    // el iris empujaría el párpado cerrado y asomaría por el lagrimal
    const libre = 1 - clamp(this.expr.ojosCerrados || 0, 0, 1);
    const yawS = (blando(yawC, 24 * DEG) + m.micro[0]) * libre;
    const pitchS = ((pitchC > 0 ? blando(pitchC, 16 * DEG) : blando(pitchC, 22 * DEG)) + m.micro[1]) * libre;
    let pitchMedio = 0, n = 0;
    if (this.ojosMorph) {
      // sin huesos: el mismo ángulo, convertido a eyeLook (Out/In según el lado, Up/Down)
      for (const sd of ['Left', 'Right']) {
        const o = this.ojosMorph[sd], [yawI] = angulos(posMundo(o.ojo));
        const yaw = (yawS + clamp(yawI - yawC, -1.5 * DEG, 1.5 * DEG) * libre) * this.ojosMorph.signo, pitch = pitchS;
        const haciaIzq = clamp(yaw / o.rangoX, -1, 1), v = clamp(pitch / o.rangoY, -1, 1);
        // a la izquierda del personaje: el ojo izquierdo mira hacia fuera, el derecho hacia dentro
        if (sd === 'Left') { this._sumar('eyeLookOutLeft', Math.max(0, haciaIzq)); this._sumar('eyeLookInLeft', Math.max(0, -haciaIzq)); }
        else { this._sumar('eyeLookInRight', Math.max(0, haciaIzq)); this._sumar('eyeLookOutRight', Math.max(0, -haciaIzq)); }
        this._sumar('eyeLookUp' + sd, Math.max(0, v)); this._sumar('eyeLookDown' + sd, Math.max(0, -v));
        pitchMedio += pitch; n++;
      }
      this.pitchOjos = pitchMedio / n;
      // los párpados ya siguen a eyeLookDown/Up en estas shape keys; solo un poco de párpado al mirar abajo
      const abajoM = clamp(-this.pitchOjos / (25 * DEG), 0, 1);
      for (const sd of ['Left', 'Right']) this._sumar('eyeBlink' + sd, abajoM * 0.1);
      return;
    }
    for (const ojo of this.ojos) {
      if (!ojo) continue;
      const [yawI] = angulos(posMundo(ojo));
      const yaw = yawS + clamp(yawI - yawC, -1.5 * DEG, 1.5 * DEG) * libre, pitch = pitchS;
      const deseada = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(qc);
      aplicarMundo(ojo, new THREE.Quaternion().setFromUnitVectors(this._frenteOjo(ojo), deseada));
      pitchMedio += pitch; n++;
    }
    pitchMedio /= Math.max(1, n);
    this.pitchOjos = pitchMedio;
    const abajo = clamp(-pitchMedio / (25 * DEG), 0, 1), arriba = clamp(pitchMedio / (20 * DEG), 0, 1);
    for (const sd of ['Left', 'Right']) {
      this._sumar('eyeLookDown' + sd, abajo * 0.55);
      this._sumar('eyeBlink' + sd, abajo * 0.18);
      this._sumar('eyeLookUp' + sd, arriba * 0.45);
    }
  }
  /** Ojos virtuales para modelos sin huesos de ojo: posición (centro de los vértices que mueve eyeLookOut de cada lado)
   * y recorrido angular de las shape keys (desplazamiento máximo frente al radio del globo). null si no hay eyeLook. */
  _ojosPorMorph(root) {
    if (!this.cabeza) return null;
    root.updateMatrixWorld(true);
    const medir = (nombre) => {
      const centro = new THREE.Vector3(), v = new THREE.Vector3(), puntos = []; let maxD = 0;
      for (const [m, i] of this.indice[nombre] || []) {
        const d = m.geometry.morphAttributes?.position?.[i], pos = m.geometry.attributes.position; if (!d) continue;
        m.updateWorldMatrix(true, false);
        const sesgo = m.geometry.morphTargetsRelative ? 0 : 1;
        for (let k = 0; k < pos.count; k++) {
          const dx = d.getX(k) - sesgo * pos.getX(k), dy = d.getY(k) - sesgo * pos.getY(k), dz = d.getZ(k) - sesgo * pos.getZ(k), l = Math.hypot(dx, dy, dz);
          if (l < 1e-6) continue;
          v.fromBufferAttribute(pos, k); if (m.isSkinnedMesh && m.geometry.attributes.skinIndex) m.applyBoneTransform(k, v); v.applyMatrix4(m.matrixWorld);
          puntos.push(v.clone()); centro.add(v); maxD = Math.max(maxD, l * m.matrixWorld.getMaxScaleOnAxis());
        }
      }
      if (puntos.length < 8) return null;
      centro.divideScalar(puntos.length);
      const dist = puntos.map(p => p.distanceTo(centro)).sort((a, b) => a - b), radio = dist[dist.length >> 1] || 1;
      return { centro, rango: clamp(Math.asin(clamp(maxD / radio, 0, 1)), 12 * DEG, 45 * DEG) };
    };
    const out = {};
    for (const sd of ['Left', 'Right']) {
      const h = medir('eyeLookOut' + sd), up = medir('eyeLookUp' + sd); if (!h) return null;
      const ojo = new THREE.Object3D(); ojo.name = 'ojoVirtual' + sd; this.cabeza.add(ojo); ojo.position.copy(this.cabeza.worldToLocal(h.centro.clone()));
      out[sd] = { ojo, rangoX: h.rango, rangoY: up?.rango ?? h.rango };
    }
    // eje lateral de la cabeza hacia la izquierda del personaje (ojo izquierdo − ojo derecho): fija el signo del giro
    out.signo = Math.sign(out.Left.ojo.position.x - out.Right.ojo.position.x) || 1;
    return out;
  }
  _frenteOjo(ojo) {
    if (!ojo.userData.frenteLocal) {
      const qo = ojo.getWorldQuaternion(new THREE.Quaternion());
      const fr = EJE_Z.clone().applyQuaternion(this.cabeza.getWorldQuaternion(new THREE.Quaternion()));
      ojo.userData.frenteLocal = fr.applyQuaternion(qo.invert()).normalize();
    }
    return ojo.userData.frenteLocal.clone().applyQuaternion(ojo.getWorldQuaternion(new THREE.Quaternion()));
  }

  // ---------------------------------------------------------------- cara viva
  _cara(dt) {
    const p = this.p, t = this.t, s = this.semilla, mi = p.micro * (0.5 + this._e), I = this.intensidad;
    const cede = 1 - 0.85 * this.expr.total;                    // con una expresión puesta, el tono del ánimo se aparta
    for (const [n, v] of Object.entries(p.cara)) this._sumar(n, v * I * cede);
    this.expr.cara();
    // energía: párpados pesados cuando falta, ojos abiertos y cejas vivas cuando sobra
    const e = this._e - 0.5;
    if (e < 0) { this._sumar('eyeBlinkLeft', -e * 0.55); this._sumar('eyeBlinkRight', -e * 0.58); this._sumar('mouthShrugLower', -e * 0.1); }
    else { this._sumar('eyeWideLeft', e * 0.5); this._sumar('eyeWideRight', e * 0.5); this._sumar('browOuterUpLeft', e * 0.35); this._sumar('browOuterUpRight', e * 0.35); }
    // microexpresiones: el rostro nunca está congelado; cada lado por su cuenta
    const ru = (k, f, a) => Math.max(0, ruido(t * f, s + k) * a * mi);
    this._sumar('browInnerUp', ru(40, 0.3, 0.06));
    this._sumar('browOuterUpLeft', ru(41, 0.27, 0.05)); this._sumar('browOuterUpRight', ru(42, 0.29, 0.05));
    this._sumar('browDownLeft', ru(43, 0.22, 0.04)); this._sumar('browDownRight', ru(44, 0.24, 0.04));
    this._sumar('mouthSmileLeft', ru(45, 0.2, 0.05)); this._sumar('mouthSmileRight', ru(46, 0.21, 0.05));
    this._sumar('mouthPressLeft', ru(47, 0.18, 0.05)); this._sumar('mouthPressRight', ru(48, 0.19, 0.05));
    this._sumar('eyeSquintLeft', ru(49, 0.25, 0.05)); this._sumar('eyeSquintRight', ru(50, 0.26, 0.05));
    this._sumar('mouthRollLower', ru(51, 0.15, 0.04));
    this._sumar('cheekSquintLeft', ru(52, 0.2, 0.03)); this._sumar('cheekSquintRight', ru(53, 0.2, 0.03));
    // tragar saliva
    const c = this.cara;
    c.proxTragar -= dt;
    if (c.proxTragar <= 0 && !this.habla) { this.gesto('tragar'); c.proxTragar = azar(18, 55); }
  }

  // ---------------------------------------------------------------- habla
  _hablar(dt) {
    const h = this.habla; if (!h) return;
    if (!h.esperaVoz) h.t += dt;
    const t = h.t;
    // visemas con coarticulación: cada fonema empieza a formarse antes y se suelta después
    const obj = {};
    for (const f of h.linea) {
      if (t < f.t0 - 0.07 || t > f.t1 + 0.09) continue;
      const mid = (f.t0 + f.t1) / 2;
      const w = t < mid ? suave((t - (f.t0 - 0.07)) / (mid - f.t0 + 0.07)) : 1 - suave((t - mid) / (f.t1 + 0.09 - mid));
      obj[f.vis] = Math.max(obj[f.vis] || 0, w * f.peso);
    }
    // las bilabiales mandan: la boca tiene que cerrarse de verdad
    if (obj.vis_MBP > 0.4) for (const k in obj) if (k !== 'vis_MBP') obj[k] *= 1 - obj.vis_MBP * 0.8;
    const tot = Object.values(obj).reduce((a, b) => a + b, 0);
    if (tot > 1) for (const k in obj) obj[k] /= tot;
    const mul = h.exclama ? 1.15 : 1;
    for (const k of new Set([...Object.keys(obj), ...Object.keys(h.vis)])) {
      h.vis[k] = (h.vis[k] || 0) + ((obj[k] || 0) * mul - (h.vis[k] || 0)) * amort(dt, 0.028);
      this._sumar(k, clamp(h.vis[k], 0, 1));
    }
    // prosodia: cejas y cabeza marcan las sílabas tónicas
    const { lado, frente } = this._ejes();
    let nod = 0, ceja = 0;
    for (const tn of h.tonicas) {
      const u = (t - tn.t + 0.12) / 0.38;
      if (u > 0 && u < 1) { const b = bache(u) * (0.6 + 0.4 * Math.abs(hash(tn.palabra, this.semilla))); nod += b; if (hash(tn.palabra, 7) > 0.1) ceja += b; }
    }
    const amp = h.exclama ? 1.5 : 1;
    girarMundo(this.giroCabeza, lado, nod * 1.6 * DEG * amp);
    this._sumar('browInnerUp', ceja * 0.14 * amp); this._sumar('browOuterUpLeft', ceja * 0.12 * amp); this._sumar('browOuterUpRight', ceja * 0.1 * amp);
    if (h.exclama) { this._sumar('eyeWideLeft', 0.12); this._sumar('eyeWideRight', 0.12); }
    // pregunta: cejas arriba y cabeza ladeada al final
    if (h.pregunta) {
      const u = clamp((t - (h.total - 1.0)) / 0.6, 0, 1) * (1 - clamp((t - h.total) / 0.5, 0, 1));
      this._sumar('browInnerUp', u * 0.3); this._sumar('browOuterUpLeft', u * 0.25); this._sumar('browOuterUpRight', u * 0.25);
      girarMundo(this.giroCabeza, frente, u * 5 * DEG * (h.lado || 1));
    }
    // pausas: parpadeo y nueva inspiración
    for (const pz of h.pausas) if (!pz.hecha && t >= pz.t) {
      pz.hecha = true;
      if (Math.random() < 0.6) this.parp.enCola = 0.04;
      if (pz.dur > 0.3) this.resp.extra = Math.max(this.resp.extra, 0.6);
    }
    if (t >= h.total) { const fin = h.fin; this.habla = null; this.resp.hablando = false; fin?.(); }
  }

  // ---------------------------------------------------------------- parpadeo
  _parpadear(dt) {
    const k = this.parp, p = this.p;
    k.prox -= dt;
    if (k.enCola > 0) { k.enCola -= dt; if (k.enCola <= 0 && k.t < 0) k.prox = 0; }
    // ojos muy abiertos (sorpresa, susto, fijación): no se parpadea solo; el parpadeo llega al resolverse
    const abiertos = Math.max(this._leer('eyeWideLeft') + (this.vm.eyeWideLeft || 0), this._leer('eyeWideRight') + (this.vm.eyeWideRight || 0));
    if (k.t < 0 && k.prox <= 0 && abiertos > 0.55 && k.picoForzado === undefined) k.prox = azar(0.15, 0.35);
    if (k.t < 0 && k.prox <= 0) {
      // rápido: ~0,19 s con energía media (cierre ~0,06, contacto ~0,025, apertura ~0,1); cansancio = más lento
      const lento = (p.parpadeoLento || 1) * (1.45 - 0.9 * this._e);
      k.t = 0; k.dur = 0.18 * lento * azar(0.92, 1.1);
      k.pico = k.picoForzado ?? (Math.random() < 0.1 ? azar(0.55, 0.8) : 1);
      k.picoForzado = undefined;
      k.desfase = azar(0.004, 0.012) * (Math.random() < 0.5 ? -1 : 1);
      const [a, b] = p.parpadeo;
      // intervalos sesgados (muchos cortos, alguno largo), como en la gente; a veces un doble o un racimo
      const intervalo = () => a + (b - a) * Math.pow(Math.random(), 1.15);
      k.prox = k.doble ? intervalo() : (Math.random() < 0.16 ? k.dur + azar(0.06, 0.14) : intervalo());
      k.doble = !k.doble && k.prox < 0.5;
    }
    let vL = 0, vR = 0, pop = 0;
    if (k.t >= 0) {
      k.t += dt;
      vL = this._curvaParpadeo(k.t, k.dur) * k.pico;
      vR = this._curvaParpadeo(k.t - k.desfase, k.dur) * k.pico;
      if (k.t > k.dur + 0.03) { k.t = -1; if (k.pico > 0.9) k.post = 0; }
    }
    // tras un parpadeo completo el ojo «se refresca»: se abre un pelo más y vuelve
    if (k.post >= 0) { k.post += dt; const u = k.post / 0.28; pop = u < 1 ? bache(u) : 0; if (u >= 1) k.post = -1; }
    // el parpadeo cierra desde donde esté el párpado, sin pasarse
    if ('eyeBlinkLeft' in this.vm) this.vm.eyeBlinkLeft += vL * (1 - clamp(this._leer('eyeBlinkLeft') + this.vm.eyeBlinkLeft, 0, 1));
    if ('eyeBlinkRight' in this.vm) this.vm.eyeBlinkRight += vR * (1 - clamp(this._leer('eyeBlinkRight') + this.vm.eyeBlinkRight, 0, 1));
    // no solo los párpados: la mejilla sube, la ceja baja un pelo, el ojo se entorna y el globo rueda hacia abajo
    this._sumar('cheekSquintLeft', vL * 0.08); this._sumar('cheekSquintRight', vR * 0.08);
    this._sumar('browDownLeft', vL * 0.07); this._sumar('browDownRight', vR * 0.07);
    this._sumar('eyeSquintLeft', vL * 0.06); this._sumar('eyeSquintRight', vR * 0.06);
    this._sumar('eyeLookDownLeft', vL * 0.14); this._sumar('eyeLookDownRight', vR * 0.14);
    this._sumar('eyeWideLeft', pop * 0.07); this._sumar('eyeWideRight', pop * 0.07);
    this.parpadeo = Math.max(vL, vR);
  }
  // cierre con aceleración (ease-in), contacto con rebote 1 → 0,9 y apertura más lenta que frena al final
  _curvaParpadeo(t, d) {
    if (t <= 0 || t >= d) return 0;
    const u = t / d;
    if (u < 0.32) return Math.pow(u / 0.32, 2.2);
    if (u < 0.45) return 1 - 0.1 * suave((u - 0.32) / 0.13);
    return 0.9 * (1 - Math.pow(suave((u - 0.45) / 0.55), 0.8));
  }
}

// ------------------------------------------------------------------ catálogo de gestos de reposo
const GESTOS = {
  hombros: { dur: 1.8, cuerpo: true, aplicar(v, u, e) {        // rodar hombros hacia atrás
    const { arriba, frente } = v._ejes();
    // sin² (arranca y frena con velocidad cero) y un hombro adelantado al otro: nada de espejo perfecto
    let subeMax = 0;
    for (const L of v.lados) if (L.hombro) {
      const lider = L.signo === e.lado, w = u - (lider ? 0 : 0.07), amp = lider ? 1 : 0.82;
      const sube = bache(clamp(w / 0.6, 0, 1)) * amp, atras = bache(clamp((w - 0.2) / 0.8, 0, 1)) * amp;
      girarMundo(L.hombro, frente, L.signo * sube * 6 * DEG); girarMundo(L.hombro, arriba, L.signo * atras * 5 * DEG);
      subeMax = Math.max(subeMax, sube);
    }
    v.resp.extra = Math.max(v.resp.extra, subeMax * 0.5);
  } },
  cuello: { dur: 3.2, cuerpo: true, aplicar(v, u, e) {          // estirar el cuello hacia un lado
    const { frente, lado } = v._ejes();
    const a = env(u, 0.3, 0.35);
    girarMundo(v.giroCabeza, frente, e.lado * a * 11 * DEG);
    girarMundo(v.giroCabeza, lado, a * 3 * DEG);
    v._sumar('eyeBlinkLeft', a * 0.45); v._sumar('eyeBlinkRight', a * 0.45);
    v._sumar('mouthPressLeft', a * 0.15); v._sumar('mouthPressRight', a * 0.15);
  } },
  mirarAlrededor: { dur: () => azar(2.5, 4), aplicar(v, u, e) {  // se distrae con algo
    if (!e.datos.puntos) {
      const o = posMundo(v.cabeza), cam = v._puntoCamara(new THREE.Vector3()), d = cam.sub(o);
      e.datos.puntos = [1, 2].map(i => { const q = d.clone().applyAxisAngle(EJE_Y, e.lado * (i === 1 ? azar(30, 50) : azar(-15, 20)) * DEG); q.applyAxisAngle(EJE_X, azar(-8, 6) * DEG); return o.clone().add(q); });
    }
    e.datos.mirar = u < 0.85 ? e.datos.puntos[u < 0.5 ? 0 : 1] : null;
    e.datos.cabezaParte = 0.8;
  } },
  dedos: { dur: 1.6, aplicar(v, u, e) {                        // mueve los dedos de una mano
    const L = v.lados[e.lado > 0 ? 0 : 1]; if (!L) return;
    const a = env(u, 0.3, 0.4);
    v._curvarDedos(L, 0, a * 25 * (0.6 + 0.4 * Math.sin(u * 12)));
  } },
  ajustarPostura: { dur: 2.2, cuerpo: true, aplicar(v, u, e) { // se recoloca: se yergue un momento
    const { lado } = v._ejes();
    const a = env(u, 0.35, 0.45);
    girarMundo(v.espalda, lado, -a * 2.5 * DEG); girarMundo(v.pecho, lado, -a * 2 * DEG); girarMundo(v.cuello, lado, a * 3 * DEG);
    v.resp.extra = Math.max(v.resp.extra, a * 0.7);
  } },
  // adelante: distancia de las manos por delante de la cadera (con física, fuera del volumen del vientre) · codos: apertura
  manosJuntas: { dur: () => azar(4, 7), cuerpo: true, unico: true, tocaManos: true, adelante: 0.2, codos: 1.0, aplicar(v, u, e) {   // manos juntas delante
    const a = env(u, 0.18, 0.2);
    const { lado, arriba, frente } = v._ejes();
    const cad = posMundo(v.cadera || v.root);
    const centro = cad.clone().addScaledVector(frente, (v.cuerpo && v.activo.colisiones ? this.adelante : 0.11) * v.altura).addScaledVector(arriba, -0.01 * v.altura);
    for (const L of v.lados) {
      if (!L.brazo || !L.antebrazo || !L.mano) continue;
      L.brazo.updateWorldMatrix(true, true);
      const A = posMundo(L.brazo), M0 = posMundo(L.mano);
      const T = centro.clone().addScaledVector(lado, L.signo * 0.038 * v.altura);
      // trayectoria natural y sin cruzar el muslo: primero la mano sale hacia delante, luego va al centro
      // (a la vuelta, al revés: se separa y después baja)
      const D = T.clone().sub(M0), dF = frente.clone().multiplyScalar(D.dot(frente)), dR = D.clone().sub(dF);
      const fin = M0.clone().addScaledVector(dF, suave(a / 0.55)).addScaledVector(dR, suave((a - 0.3) / 0.7))
        .addScaledVector(frente, Math.sin(Math.PI * a) * 0.02 * v.altura);
      // codo: del sitio donde está ahora hacia el del gesto, poco a poco (si no, el IK lo hace saltar al empezar)
      const polo = lado.clone().multiplyScalar(L.signo * this.codos).addScaledVector(arriba, -1).addScaledVector(frente, -0.5).normalize();   // codos abiertos: los antebrazos no entran en el vientre
      const n = M0.clone().sub(A).normalize(), ahora = posMundo(L.antebrazo).sub(A); ahora.addScaledVector(n, -ahora.dot(n));
      if (ahora.lengthSq() > 1e-8) polo.lerpVectors(ahora.normalize(), polo, suave(a / 0.6)).normalize();
      v._ik(L.brazo, L.antebrazo, L.mano, fin, L.mano.getWorldQuaternion(new THREE.Quaternion()), polo);
      L.mano.updateWorldMatrix(true, true);
      // la muñeca gira y los dedos se cierran cuando la mano ya está delante (antes barrían el muslo)
      const giro = suave((a - 0.35) / 0.65);
      girarMundo(L.mano, frente, -L.signo * giro * 25 * DEG);
      v._curvarDedos(L, 0, giro * 12);
    }
  } },
  tragar: { dur: 0.8, aplicar(v, u) {
    const a = bache(u);
    v._sumar('mouthPressLeft', a * 0.3); v._sumar('mouthPressRight', a * 0.3); v._sumar('mouthRollLower', a * 0.12);
    v._sumar('jawForward', a * 0.05);
    girarMundo(v.giroCabeza, v._ejes().lado, a * 2 * DEG);
  } },
  morderLabio: { dur: () => azar(1.5, 2.5), aplicar(v, u) {
    const a = env(u, 0.2, 0.3);
    v._sumar('mouthRollLower', a * 0.45); v._sumar('mouthUpperUpLeft', a * 0.08); v._sumar('mouthUpperUpRight', a * 0.08);
    v._sumar('mouthLeft', a * 0.1);
  } },
  bostezo: { dur: 4.2, cuerpo: true, aplicar(v, u, e) {
    const { lado, frente } = v._ejes();
    const boca = env((u - 0.15) / 0.75, 0.35, 0.35), insp = env(u / 0.6, 0.6, 0.4);
    v._sumar('jawOpen', boca * 0.75); v._sumar('mouthStretchLeft', boca * 0.3); v._sumar('mouthStretchRight', boca * 0.3);
    v._sumar('eyeBlinkLeft', boca * 0.75); v._sumar('eyeBlinkRight', boca * 0.75); v._sumar('browInnerUp', boca * 0.35);
    v._sumar('noseSneerLeft', boca * 0.2); v._sumar('noseSneerRight', boca * 0.2); v._sumar('cheekSquintLeft', boca * 0.3); v._sumar('cheekSquintRight', boca * 0.3);
    girarMundo(v.giroCabeza, lado, -boca * 8 * DEG); girarMundo(v.cuello, lado, -boca * 4 * DEG);
    for (const L of v.lados) if (L.hombro) girarMundo(L.hombro, frente, L.signo * insp * 5 * DEG);
    v.resp.extra = Math.max(v.resp.extra, insp * 1.6);
    e.datos.mirar = boca > 0.3 ? posMundo(v.cabeza).add(new THREE.Vector3(0, 0.4, 1)) : null;
  } },
  estirarse: { dur: 3.4, cuerpo: true, aplicar(v, u, e) {      // estira la espalda y los hombros hacia atrás
    const { lado, arriba } = v._ejes();
    const a = env(u, 0.35, 0.35);
    girarMundo(v.lumbar, lado, -a * 4 * DEG); girarMundo(v.espalda, lado, -a * 5 * DEG); girarMundo(v.giroCabeza, lado, -a * 6 * DEG);
    for (const L of v.lados) {
      const lider = L.signo === e.lado, b = env(u - (lider ? 0 : 0.05), 0.35, 0.35) * (lider ? 1 : 0.85);
      if (L.hombro) girarMundo(L.hombro, arriba, L.signo * b * 8 * DEG); if (L.brazo) girarMundo(L.brazo, lado, b * 10 * DEG);
    }
    v._sumar('eyeBlinkLeft', a * 0.6); v._sumar('eyeBlinkRight', a * 0.6); v._sumar('mouthStretchLeft', a * 0.2); v._sumar('mouthStretchRight', a * 0.2);
    v.resp.extra = Math.max(v.resp.extra, a * 1.2);
  } },
};

// ------------------------------------------------------------------ reacciones
const REACCIONES = {
  sorpresa: { dur: 1.8, aplicar(v, u) {
    const a = env(u, 0.08, 0.6), { lado } = v._ejes();
    v._sumar('eyeWideLeft', a * 0.7); v._sumar('eyeWideRight', a * 0.7); v._sumar('browInnerUp', a * 0.75);
    v._sumar('browOuterUpLeft', a * 0.6); v._sumar('browOuterUpRight', a * 0.6); v._sumar('jawOpen', a * 0.22); v._sumar('mouthFunnel', a * 0.15);
    girarMundo(v.giroCabeza, lado, -a * 5 * DEG); girarMundo(v.pecho, lado, -a * 2 * DEG);
    v.resp.extra = Math.max(v.resp.extra, a * 1.4);
  } },
  sorpresaLeve: { dur: 1.6, aplicar(v, u) {
    const a = env(u, 0.1, 0.6), s = env((u - 0.3) / 0.7, 0.3, 0.5);
    v._sumar('eyeWideLeft', a * 0.35); v._sumar('eyeWideRight', a * 0.35); v._sumar('browInnerUp', a * 0.35);
    v._sumar('mouthSmileLeft', s * 0.45); v._sumar('mouthSmileRight', s * 0.4); v._sumar('cheekSquintLeft', s * 0.2); v._sumar('cheekSquintRight', s * 0.2);
    v.resp.extra = Math.max(v.resp.extra, a * 0.8);
  } },
  susto: { dur: 1.3, aplicar(v, u) {
    const a = env(u, 0.05, 0.65), { lado, frente } = v._ejes();
    v._sumar('eyeWideLeft', a * 0.85); v._sumar('eyeWideRight', a * 0.85); v._sumar('browInnerUp', a * 0.8); v._sumar('browOuterUpLeft', a * 0.6); v._sumar('browOuterUpRight', a * 0.6);
    v._sumar('jawOpen', a * 0.15); v._sumar('mouthStretchLeft', a * 0.3); v._sumar('mouthStretchRight', a * 0.3);
    girarMundo(v.giroCabeza, lado, -a * 7 * DEG); girarMundo(v.cuello, lado, -a * 3 * DEG);
    for (const L of v.lados) if (L.hombro) girarMundo(L.hombro, frente, L.signo * a * 9 * DEG);
    v.resp.extra = Math.max(v.resp.extra, a * 1.8);
    if (u > 0.55 && u < 0.6 && v.parp.t < 0) v.parpadear();
  } },
  acierto: { dur: 2.4, aplicar(v, u, e) {
    const a = env(u, 0.12, 0.35), { lado, frente } = v._ejes();
    v._sumar('mouthSmileLeft', a * 0.8); v._sumar('mouthSmileRight', a * 0.75); v._sumar('cheekSquintLeft', a * 0.5); v._sumar('cheekSquintRight', a * 0.5);
    v._sumar('eyeSquintLeft', a * 0.3); v._sumar('eyeSquintRight', a * 0.3); v._sumar('browOuterUpLeft', a * 0.3); v._sumar('browOuterUpRight', a * 0.3);
    v._sumar('jawOpen', a * 0.12); v._sumar('mouthUpperUpLeft', a * 0.15); v._sumar('mouthUpperUpRight', a * 0.15);
    const un = clamp((u - 0.1) / 0.5, 0, 1);
    const nod = Math.sin(un * Math.PI * 2) * suave(un / 0.25) * (1 - suave(un));
    girarMundo(v.giroCabeza, lado, nod * 6 * DEG); girarMundo(v.giroCabeza, frente, e.lado * a * 5 * DEG);
    for (const L of v.lados) if (L.hombro) { const lider = L.signo === e.lado; girarMundo(L.hombro, frente, L.signo * bache(clamp((u - (lider ? 0 : 0.04)) / 0.35, 0, 1)) * (lider ? 6 : 5) * DEG); }
    v.resp.extra = Math.max(v.resp.extra, a * 1.0);
  } },
  error: { dur: 2.6, aplicar(v, u, e) {                        // empatía: «casi, inténtalo otra vez»
    const a = env(u, 0.2, 0.35), { lado, frente } = v._ejes();
    v._sumar('browInnerUp', a * 0.5); v._sumar('mouthPressLeft', a * 0.25); v._sumar('mouthPressRight', a * 0.25);
    v._sumar('mouthSmileLeft', a * 0.22); v._sumar('mouthSmileRight', a * 0.15); v._sumar('mouthFrownRight', a * 0.1);
    girarMundo(v.giroCabeza, frente, e.lado * a * 7 * DEG);
    const nod = bache(clamp((u - 0.45) / 0.35, 0, 1));
    girarMundo(v.giroCabeza, lado, nod * 5 * DEG);
  } },
  duda: { dur: 2.8, aplicar(v, u, e) {
    const a = env(u, 0.2, 0.3), { frente } = v._ejes();
    const l = e.lado > 0 ? 'Left' : 'Right', r = e.lado > 0 ? 'Right' : 'Left';
    v._sumar('browDown' + l, a * 0.4); v._sumar('browOuterUp' + r, a * 0.45); v._sumar('mouth' + (e.lado > 0 ? 'Left' : 'Right'), a * 0.3);
    v._sumar('mouthPucker', a * 0.15); v._sumar('eyeSquint' + l, a * 0.25);
    girarMundo(v.giroCabeza, frente, -e.lado * a * 6 * DEG);
    e.datos.mirar = a > 0.3 ? posMundo(v.cabeza).add(new THREE.Vector3(e.lado * 0.4, 0.35, 1)) : null;
  } },
  risa: { dur: 2.6, aplicar(v, u, e) {
    const a = env(u, 0.1, 0.35), { lado, frente } = v._ejes();
    const ja = (0.5 + 0.5 * Math.sin(u * Math.PI * 12)) * a;
    v._sumar('mouthSmileLeft', a * 0.85); v._sumar('mouthSmileRight', a * 0.85); v._sumar('cheekSquintLeft', a * 0.6); v._sumar('cheekSquintRight', a * 0.6);
    v._sumar('eyeSquintLeft', a * 0.45); v._sumar('eyeSquintRight', a * 0.45); v._sumar('jawOpen', ja * 0.3); v._sumar('vis_A', ja * 0.3);
    girarMundo(v.giroCabeza, lado, -a * 6 * DEG + ja * 1.5 * DEG); girarMundo(v.giroCabeza, frente, e.lado * a * 4 * DEG);
    for (const L of v.lados) if (L.hombro) girarMundo(L.hombro, frente, L.signo * ja * 4 * DEG);
    v.resp.extra = Math.max(v.resp.extra, ja * 0.8);
  } },
  // vaivenes que entran suaves, se apagan y no son de metrónomo (cada ida algo más lenta que la anterior)
  asentir: { dur: 1.3, aplicar(v, u) { const f = u * (4 - 0.8 * u), s = Math.sin(f * Math.PI) * suave(u / 0.15) * (1 - suave(u)); girarMundo(v.giroCabeza, v._ejes().lado, s * 8 * DEG); girarMundo(v.cuello, v._ejes().lado, s * 3 * DEG); } },
  negar: { dur: 1.5, aplicar(v, u) { const f = u * (5 - 1 * u), s = Math.sin(f * Math.PI) * suave(u / 0.15) * (1 - suave(u)); girarMundo(v.giroCabeza, v._ejes().arriba, s * 12 * DEG); girarMundo(v.cuello, v._ejes().arriba, s * 4 * DEG); const p = env(u, 0.15, 0.4) * 0.2; v._sumar('mouthPressLeft', p); v._sumar('mouthPressRight', p); } },
};
export { GESTOS, REACCIONES };
