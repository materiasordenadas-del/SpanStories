// Física secundaria del caballo (solo visualización; no se guarda ni se exporta).
//
//   · Cola: cadena PBD sobre sus huesos (c_tail_00…03 + punta). Cada partícula sigue a la pose animada con un
//     muelle que se ablanda hacia la punta, recibe gravedad y el arrastre del aire, choca con la grupa y los
//     muslos y conserva el largo de cada tramo. El resultado se escribe como rotación de los huesos.
//   · Crin: Rocinante no tiene huesos de crin (los mechones están esculpidos en la malla del cuerpo). Se detectan
//     por su relieve (los mechones son rugosos, la piel es lisa) y se les da un peso que crece de la cresta a la
//     punta. Unos pocos muelles a lo largo del cuello dan la inercia; el sombreador desplaza esos vértices con su
//     muelle y añade una ondulación que viaja de la raíz a la punta y crece con la velocidad (pelo al viento).
//   · Colisionador del cuello y la cabeza para las riendas (vértices en una rejilla hash, empuje por la normal).
//
// Todo cuesta unas decenas de partículas por fotograma y un desplazamiento por vértice en la GPU.
import * as THREE from 'three';
import { setWorldQuat } from './ik.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const NODOS = 6; // muelles de la crin a lo largo del cuello
const clave = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

/** Malla del cuerpo: la piel con más vértices que no es la silla. */
export function cuerpoCaballo(root) {
  let body = null;
  root.traverse((o) => { if (o.isSkinnedMesh && !/silla|saddle/i.test(o.name) && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  return body;
}

/** Topología soldada (los vértices partidos por UV comparten posición), componentes conexas y rugosidad. */
function analizar(geo) {
  const P = geo.attributes.position, N = P.count, I = geo.index;
  const wid = new Int32Array(N), mapa = new Map();
  for (let i = 0; i < N; i++) {
    const k = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    let r = mapa.get(k); if (r === undefined) { r = i; mapa.set(k, i); } wid[i] = r;
  }
  // Vecinos (CSR) y normales de cara acumuladas.
  const tri = I ? I.count : N, idx = (t) => (I ? I.getX(t) : t);
  const grado = new Int32Array(N + 1);
  for (let t = 0; t < tri; t++) grado[wid[idx(t)]] += 2;
  const ini = new Int32Array(N + 1); for (let i = 0; i < N; i++) ini[i + 1] = ini[i] + grado[i];
  const vec = new Int32Array(ini[N]), lleno = new Int32Array(N);
  const fn = new Float32Array(N * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const par = new Int32Array(N).map((_, i) => i), raiz = (x) => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
  for (let t = 0; t < tri; t += 3) {
    const v = [wid[idx(t)], wid[idx(t + 1)], wid[idx(t + 2)]];
    for (let k = 0; k < 3; k++) { const x = v[k]; vec[ini[x] + lleno[x]++] = v[(k + 1) % 3]; vec[ini[x] + lleno[x]++] = v[(k + 2) % 3]; }
    a.fromBufferAttribute(P, v[0]); b.fromBufferAttribute(P, v[1]).sub(a); c.fromBufferAttribute(P, v[2]).sub(a); b.cross(c);
    for (const x of v) { fn[x * 3] += b.x; fn[x * 3 + 1] += b.y; fn[x * 3 + 2] += b.z; }
    const r0 = raiz(v[0]); par[raiz(v[1])] = r0; par[raiz(v[2])] = r0;
  }
  for (let i = 0; i < N; i++) { const l = Math.hypot(fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]) || 1; fn[i * 3] /= l; fn[i * 3 + 1] /= l; fn[i * 3 + 2] /= l; }
  const comp = new Int32Array(N); for (let i = 0; i < N; i++) comp[i] = raiz(wid[i]);
  const media = (src, it) => { // promedio con los vecinos (sobre vértices soldados)
    let x = src;
    for (let k = 0; k < it; k++) {
      const y = new Float32Array(N);
      for (let i = 0; i < N; i++) { if (wid[i] !== i) continue; let s = x[i], n = 1; for (let j = ini[i]; j < ini[i + 1]; j++) { s += x[vec[j]]; n++; } y[i] = s / n; }
      x = y;
    }
    return x;
  };
  let rug = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (wid[i] !== i || ini[i + 1] === ini[i]) continue;
    let s = 0; for (let j = ini[i]; j < ini[i + 1]; j++) { const o = vec[j]; s += fn[i * 3] * fn[o * 3] + fn[i * 3 + 1] * fn[o * 3 + 1] + fn[i * 3 + 2] * fn[o * 3 + 2]; }
    rug[i] = 1 - s / (ini[i + 1] - ini[i]);
  }
  rug = media(rug, 3);
  return { N, wid, comp, fn, rug, media };
}

/** Peso de cada vértice para los huesos cuyo nombre cumple «re». */
function pesoHuesos(mesh, re) {
  const g = mesh.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, B = mesh.skeleton.bones;
  const sel = B.map((b) => re.test(b.name)), out = new Float32Array(SI.count);
  for (let i = 0; i < SI.count; i++) for (let j = 0; j < 4; j++) if (sel[SI.getComponent(i, j)]) out[i] += SW.getComponent(i, j);
  return out;
}

/** Matriz reposo → ahora de un hueso del esqueleto de «mesh» (posición de reposo de la geometría → mundo). */
function matrizHueso(mesh, bi, out) {
  return out.multiplyMatrices(mesh.skeleton.bones[bi].matrixWorld, mesh.skeleton.boneInverses[bi]).multiply(mesh.bindMatrix);
}

export class FisicaCaballo {
  constructor(root) {
    this.root = root;
    const body = (this.body = cuerpoCaballo(root));
    if (!body) return;
    const B = body.skeleton.bones, bi = (re) => B.findIndex((b) => re.test(b.name));
    const geo = body.geometry, P = geo.attributes.position;
    const T = (this.topo = analizar(geo));
    // Componentes: el cuerpo (la mayor) y la cola (la que más pesa en los huesos de la cola).
    const tam = new Map(); for (let i = 0; i < T.N; i++) tam.set(T.comp[i], (tam.get(T.comp[i]) || 0) + 1);
    const cuerpo = [...tam.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const wCola = pesoHuesos(body, /tail/i), wCuello = pesoHuesos(body, /neck|head/i), wOreja = pesoHuesos(body, /ear/i);
    const colaSum = new Map(); for (let i = 0; i < T.N; i++) colaSum.set(T.comp[i], (colaSum.get(T.comp[i]) || 0) + wCola[i]);
    const cola = [...colaSum.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];

    // ---- Cola: huesos y punta ----
    this.cola = null;
    const huesos = B.filter((b) => /tail/i.test(b.name)).sort((x, y) => x.name.localeCompare(y.name));
    if (huesos.length >= 2) {
      const reposo = huesos.map((b) => new THREE.Vector3().setFromMatrixPosition(_m.copy(body.skeleton.boneInverses[B.indexOf(b)]).invert()));
      // Punta: el vértice de la cola más alejado de su raíz.
      let punta = reposo.at(-1).clone(), lejos = 0;
      for (let i = 0; i < T.N; i++) if (T.comp[i] === cola) { _v.fromBufferAttribute(P, i); const d = _v.distanceTo(reposo[0]); if (d > lejos) { lejos = d; punta.copy(_v); } }
      const ult = huesos.at(-1);
      const puntaLocal = punta.clone().applyMatrix4(_m.copy(body.skeleton.boneInverses[B.indexOf(ult)]).multiply(body.bindMatrix));
      const n = huesos.length + 1;
      this.cola = {
        huesos, puntaLocal, n,
        x: Array.from({ length: n }, () => new THREE.Vector3()), v: Array.from({ length: n }, () => new THREE.Vector3()),
        meta: Array.from({ length: n }, () => new THREE.Vector3()), metaPrev: Array.from({ length: n }, () => new THREE.Vector3()),
        largo: new Float32Array(n), anim: huesos.map((b) => b.quaternion.clone()), escrito: huesos.map(() => new THREE.Quaternion(NaN, 0, 0, 0)),
        iMuslo: ['c_thigh_bl', 'c_thigh_br', 'thigh_twistl', 'thigh_twistr', 'upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'hips']
          .map((nm) => B.findIndex((b) => b.name.replace(/[.]/g, '') === nm)),
        listo: false,
      };
    }

    // ---- Crin: máscara por relieve, en el cuello (sin cara ni orejas) ----
    const nombre = (re) => B.findIndex((b) => re.test(b.name));
    const cadena = [...B.filter((b) => /^subneck/i.test(b.name)).sort((x, y) => x.name.localeCompare(y.name)), B[nombre(/^neck$/i)], B[nombre(/^head$/i)]].filter(Boolean);
    const eje = cadena.map((b) => new THREE.Vector3().setFromMatrixPosition(_m.copy(body.skeleton.boneInverses[B.indexOf(b)]).invert()));
    this.eje = eje; this.cadena = cadena;
    const pelo = new Float32Array(T.N), ejeT = new Float32Array(T.N), alto = new Float32Array(T.N);
    const seg = eje.slice(0, -1).map((p, k) => new THREE.Line3(p, eje[k + 1]));
    const largoEje = seg.reduce((s, l) => s + l.distance(), 0) || 1;
    const dirEje = eje.length > 1 ? eje.at(-1).clone().sub(eje[0]).normalize() : new THREE.Vector3(0, 1, 0);
    const proyectar = (p0) => {
      const p = p0.clone(); // parámetro a lo largo del eje (0…1) y distancia dorsal (arriba-atrás)
      let best = Infinity, tt = 0, acc = 0, dors = 0;
      for (const l of seg) {
        const u = l.closestPointToPointParameter(p, true); l.at(u, _w);
        const d = _w.distanceTo(p);
        if (d < best) {
          best = d; tt = (acc + u * l.distance()) / largoEje;
          const dir = new THREE.Vector3().subVectors(l.end, l.start).normalize(), dorsal = new THREE.Vector3(1, 0, 0).cross(dir).negate().normalize();
          dors = new THREE.Vector3().subVectors(p, _w).dot(dorsal);
        }
        acc += l.distance();
      }
      // Más allá de la nuca (la cara) el parámetro sin recortar del último tramo pasa de 1.
      if (seg.length && _w.subVectors(p, eje.at(-1)).dot(dirEje) > 0.12) tt = 2;
      return [tt, dors];
    };
    if (eje.length >= 3) {
      for (let i = 0; i < T.N; i++) {
        const w = T.wid[i];
        if (T.comp[i] === cola) { pelo[i] = smooth(0.06, 0.13, T.rug[w]); continue; }
        if (T.comp[i] !== cuerpo || wCuello[i] < 0.4 || wOreja[i] > 0.15) continue;
        _v.fromBufferAttribute(P, i);
        const [t, d] = proyectar(_v);
        ejeT[i] = t; alto[i] = d;
        if (t > 1.02 || d < -0.03) continue; // más allá de la nuca (cara) o en la garganta
        pelo[i] = smooth(0.06, 0.13, T.rug[w]);
      }
    }
    // Suavizar la máscara (rellena huecos y difumina el borde con la piel).
    for (let i = 0; i < T.N; i++) if (T.wid[i] !== i) pelo[i] = pelo[T.wid[i]];
    const peloS = T.media(pelo, 3);
    // Cresta: el punto más dorsal de la crin en cada tramo del cuello; la distancia a ella da raíz → punta.
    const BINS = 14, cresta = Array.from({ length: BINS }, () => null);
    for (let i = 0; i < T.N; i++) {
      if (T.comp[i] !== cuerpo || pelo[i] < 0.5) continue;
      if (ejeT[i] > 1.02) continue;
      const k = Math.min(BINS - 1, Math.max(0, Math.floor(ejeT[i] * BINS)));
      if (!cresta[k] || alto[i] > cresta[k].d) cresta[k] = { d: alto[i], p: new THREE.Vector3().fromBufferAttribute(P, i) };
    }
    const crestaP = cresta.filter(Boolean).map((c) => c.p);
    const crestaL = crestaP.slice(0, -1).map((p, k) => new THREE.Line3(p, crestaP[k + 1]));
    // Raíz de la cola: su primer hueso.
    const raizCola = this.cola ? new THREE.Vector3().setFromMatrixPosition(_m.copy(body.skeleton.boneInverses[B.indexOf(this.cola.huesos[0])]).invert()) : null;
    // Nodos de la crin: centroides por tramos y el hueso que más los mueve.
    const nodos = Array.from({ length: NODOS }, () => ({ p: new THREE.Vector3(), n: 0, huesos: new Map() }));
    const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
    const attr = new Float32Array(T.N * 3);
    let hayCrin = 0;
    for (let i = 0; i < T.N; i++) {
      const m = peloS[T.wid[i]];
      if (m < 0.02) continue;
      _v.fromBufferAttribute(P, i);
      if (T.comp[i] === cola && raizCola) {
        attr[i * 3] = 0.6 * m * smooth(0.05, 0.6, _v.distanceTo(raizCola)); attr[i * 3 + 1] = NODOS; attr[i * 3 + 2] = 0.35 * _v.distanceTo(raizCola);
        continue;
      }
      if (T.comp[i] !== cuerpo || !crestaL.length || ejeT[i] > 1.02) continue;
      let dr = Infinity; for (const l of crestaL) { l.closestPointToPoint(_v, true, _w); dr = Math.min(dr, _w.distanceTo(_v)); }
      const peso = m * smooth(0.025, 0.2, dr);
      if (peso < 0.01) continue;
      const k = Math.min(NODOS - 1, Math.max(0, ejeT[i] * (NODOS - 1)));
      attr[i * 3] = peso; attr[i * 3 + 1] = k; attr[i * 3 + 2] = dr;
      hayCrin++;
      const nd = nodos[Math.round(k)];
      nd.p.add(_v); nd.n++;
      for (let j = 0; j < 4; j++) { const b = SI.getComponent(i, j), w = SW.getComponent(i, j); if (w > 0) nd.huesos.set(b, (nd.huesos.get(b) || 0) + w); }
    }
    this.crin = null;
    if (hayCrin > 50) {
      const lista = nodos.map((nd, k) => {
        if (!nd.n) { const t = k / (NODOS - 1), f = t * (eje.length - 1), j = Math.min(eje.length - 2, Math.floor(f)); return { p: eje[j].clone().lerp(eje[j + 1], f - j), hueso: B.indexOf(cadena[Math.min(cadena.length - 1, Math.round(f))]) }; }
        return { p: nd.p.divideScalar(nd.n), hueso: [...nd.huesos.entries()].sort((x, y) => y[1] - x[1])[0][0] };
      });
      this.crin = {
        nodos: lista.map((l) => ({ ...l, x: new THREE.Vector3(), v: new THREE.Vector3(), meta: new THREE.Vector3() })),
        off: Array.from({ length: NODOS + 1 }, () => new THREE.Vector3()), listo: false,
      };
      geo.setAttribute('aCrin', new THREE.BufferAttribute(attr, 3));
      this.instalarSombreador(body);
    }
    this.aire = new THREE.Vector3(); this.rumboPrev = null; this.t = 0;
    this.colisionador = new ColisionCuello(body, T, cuerpo, wCuello, pesoHuesos(body, /chest|spine|neck|head/i));
  }

  /** Desplazamiento de la crin (muelles + ondulación) en el sombreador del cuerpo, tras el skinning. */
  instalarSombreador(body) {
    const u = (this.uni = {
      uCrinOff: { value: this.crin.off }, uCrinT: { value: 0 }, uCrinOnda: { value: 0.004 },
      uCrinArriba: { value: new THREE.Vector3(0, 1, 0) }, uCrinAtras: { value: new THREE.Vector3(0, 0, -1) }, uCrinLado: { value: new THREE.Vector3(1, 0, 0) },
    });
    const mats = Array.isArray(body.material) ? body.material : [body.material];
    const nuevos = mats.map((m0) => {
      const m = m0.clone(), prev = m0.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev?.call(m, sh, r);
        Object.assign(sh.uniforms, u);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec3 aCrin;
uniform vec3 uCrinOff[${NODOS + 1}];
uniform float uCrinT, uCrinOnda;
uniform vec3 uCrinArriba, uCrinAtras, uCrinLado;`)
          .replace('#include <skinning_vertex>', `#include <skinning_vertex>
if (aCrin.x > 0.0) {
  int i0 = int(floor(aCrin.y)); int i1 = min(i0 + 1, ${NODOS});
  if (i0 >= ${NODOS}) i1 = i0;
  vec3 crinOff = mix(uCrinOff[i0], uCrinOff[i1], fract(aCrin.y));
  // Ondulación que viaja de la raíz a la punta (dos frecuencias desfasadas por mechón).
  float fase = uCrinT * 6.3 - aCrin.z * 28.0 + aCrin.y * 1.7;
  float semilla = dot(position, vec3(37.1, 17.3, 23.9));
  vec3 onda = uCrinArriba * sin(fase) + uCrinAtras * 0.6 * sin(fase * 1.63 + semilla) + uCrinLado * 0.35 * sin(fase * 0.77 + semilla * 1.3);
  transformed += aCrin.x * (crinOff + uCrinOnda * onda);
}`);
      };
      const key0 = m0.customProgramCacheKey?.bind(m0);
      m.customProgramCacheKey = () => (key0 ? key0() : '') + '|crin' + NODOS;
      return m;
    });
    body.material = Array.isArray(body.material) ? nuevos : nuevos[0];
  }

  /**
   * dt: segundos · o.viento: velocidad del aire respecto al suelo que no se ve en el desplazamiento real (con
   * «En el sitio» el caballo no avanza pero galopa: el aire le llega de frente) · o.reiniciar.
   */
  paso(dt, o = {}) {
    if (!this.body) return;
    dt = Math.min(Math.max(dt || 0, 0), 1 / 20);
    this.root.updateMatrixWorld(true);
    const body = this.body;
    // Marco del caballo (mundo) y escala de la geometría al mundo.
    const rumbo = this.root.getWorldQuaternion(new THREE.Quaternion());
    const arriba = new THREE.Vector3(0, 1, 0), adelante = new THREE.Vector3(0, 0, 1).applyQuaternion(rumbo).setY(0).normalize(), izq = arriba.clone().cross(adelante);
    const esc = new THREE.Vector3().setFromMatrixScale(matrizHueso(body, 0, _m)).x || 1;
    const aire = (this.aire = o.viento ? o.viento.clone() : new THREE.Vector3());
    const reiniciar = o.reiniciar || !(dt > 0);
    if (this.cola) this.pasoCola(dt, aire, esc, reiniciar);
    if (this.crin) this.pasoCrin(dt, aire, esc, reiniciar, { arriba, adelante, izq });
  }

  pasoCola(dt, aire, esc, reiniciar) {
    const C = this.cola, body = this.body, n = C.n;
    // La animación pudo no tocar la cola: se parte de la última pose animada, no de la simulada.
    C.huesos.forEach((b, i) => { if (b.quaternion.equals(C.escrito[i])) b.quaternion.copy(C.anim[i]); else C.anim[i].copy(b.quaternion); });
    C.huesos[0].updateMatrixWorld(true);
    for (let i = 0; i < n - 1; i++) C.huesos[i].getWorldPosition(C.meta[i]);
    C.meta[n - 1].copy(C.puntaLocal).applyMatrix4(C.huesos.at(-1).matrixWorld);
    for (let i = 1; i < n; i++) C.largo[i] = C.meta[i].distanceTo(C.meta[i - 1]);
    const salto = C.listo && C.meta[0].distanceTo(C.x[0]) > 0.6 * esc;
    if (!C.listo || reiniciar || salto) {
      C.x.forEach((x, i) => x.copy(C.meta[i])); C.v.forEach((v) => v.set(0, 0, 0)); C.metaPrev.forEach((m, i) => m.copy(C.meta[i]));
      C.listo = true;
      if (!(dt > 0)) { this.escribirCola(); return; }
    }
    // Colisionadores: grupa (esfera en la cadera) y muslos traseros (cápsulas).
    const B = body.skeleton.bones, pos = (k) => (k >= 0 ? B[k].getWorldPosition(new THREE.Vector3()) : null);
    const [tl, tr, twl, twr, ul, ur, ll, lr, hip] = C.iMuslo.map(pos);
    const caps = [[tl || ul, ll || twl, 0.11], [tr || ur, lr || twr, 0.11]].filter((c) => c[0] && c[1]).map(([a, b, r]) => [a, b, r * esc]);
    const grupa = hip ? [hip, 0.36 * esc] : null;
    const pasos = Math.min(4, Math.max(1, Math.ceil(dt * 120))), h = dt / pasos;
    const omega = [0, 16, 12, 9.5, 7.5, 6], zeta = 0.22, arrastre = 0.9, g = -2.0;
    const pred = new THREE.Vector3(), seg = new THREE.Line3(), cerca = new THREE.Vector3();
    for (let s = 1; s <= pasos; s++) {
      const f = s / pasos;
      for (let i = 0; i < n; i++) {
        const meta = _w.copy(C.metaPrev[i]).lerp(C.meta[i], f);
        if (i === 0) { C.x[0].copy(meta); C.v[0].set(0, 0, 0); continue; }
        const w = omega[Math.min(i, omega.length - 1)];
        const vMeta = _v.subVectors(C.meta[i], C.metaPrev[i]).divideScalar(dt);
        const a = meta.clone().sub(C.x[i]).multiplyScalar(w * w)
          .addScaledVector(vMeta.sub(C.v[i]), 2 * zeta * w)
          .addScaledVector(aire.clone().sub(C.v[i]), arrastre);
        a.y += g;
        C.v[i].addScaledVector(a, h);
      }
      // Predicción, restricciones (largo, choques) y velocidad de la corrección (PBD).
      const ant = C.x.map((x) => x.clone());
      for (let i = 1; i < n; i++) C.x[i].addScaledVector(C.v[i], h);
      for (let it = 0; it < 2; it++) {
        for (let i = 1; i < n; i++) {
          const x = C.x[i];
          for (const [a, b, r] of caps) { seg.set(a, b).closestPointToPoint(x, true, cerca); const d = x.distanceTo(cerca), rr = r + 0.03 * esc; if (d < rr && d > 1e-6) x.sub(cerca).multiplyScalar(rr / d).add(cerca); }
          if (grupa) { const d = x.distanceTo(grupa[0]); if (d < grupa[1] && d > 1e-6) x.sub(grupa[0]).multiplyScalar(grupa[1] / d).add(grupa[0]); }
          pred.subVectors(x, C.x[i - 1]); const l = pred.length() || 1;
          x.copy(C.x[i - 1]).addScaledVector(pred, C.largo[i] / l);
        }
      }
      for (let i = 1; i < n; i++) C.v[i].subVectors(C.x[i], ant[i]).divideScalar(h).multiplyScalar(0.995);
    }
    C.metaPrev.forEach((m, i) => m.copy(C.meta[i]));
    this.escribirCola();
  }

  /** Los huesos de la cola apuntan a las partículas (de la raíz a la punta). */
  escribirCola() {
    const C = this.cola, n = C.n, p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n - 1; i++) {
      const b = C.huesos[i];
      b.updateMatrixWorld(true);
      b.getWorldPosition(p);
      if (i + 1 < n - 1) C.huesos[i + 1].getWorldPosition(q); else q.copy(C.puntaLocal).applyMatrix4(b.matrixWorld);
      const de = q.sub(p).normalize(), a = _v.subVectors(C.x[i + 1], C.x[i]).normalize();
      if (de.lengthSq() > 0 && a.lengthSq() > 0) {
        setWorldQuat(b, _q.setFromUnitVectors(de, a).multiply(b.getWorldQuaternion(new THREE.Quaternion())));
        b.updateMatrixWorld(true);
      }
      C.escrito[i].copy(b.quaternion);
    }
  }

  pasoCrin(dt, aire, esc, reiniciar, { arriba, adelante, izq }) {
    const K = this.crin, body = this.body;
    const inv = new THREE.Matrix3().setFromMatrix4(body.matrixWorld).invert();
    for (const nd of K.nodos) nd.meta.copy(nd.p).applyMatrix4(matrizHueso(body, nd.hueso, _m));
    const salto = K.listo && K.nodos[0].meta.distanceTo(K.nodos[0].x) > 0.6 * esc;
    if (!K.listo || reiniciar || salto) {
      K.nodos.forEach((nd) => { nd.x.copy(nd.meta); nd.v.set(0, 0, 0); nd.prev = nd.meta.clone(); });
      K.listo = true;
    }
    const maxOff = 0.06 * esc, pasos = Math.min(4, Math.max(1, Math.ceil(dt * 120))), h = dt / Math.max(1, pasos);
    if (dt > 0) for (const nd of K.nodos) {
      const vMeta = _w.subVectors(nd.meta, nd.prev).divideScalar(dt).clone();
      for (let s = 1; s <= pasos; s++) {
        const meta = nd.prev.clone().lerp(nd.meta, s / pasos);
        const w = 13, a = meta.sub(nd.x).multiplyScalar(w * w).addScaledVector(_v.subVectors(vMeta, nd.v), 2 * 0.16 * w).addScaledVector(_v.subVectors(aire, nd.v), 0.5);
        nd.v.addScaledVector(a, h); nd.x.addScaledVector(nd.v, h);
      }
      nd.prev.copy(nd.meta);
    }
    // Aire relativo (el del galope real o el simulado «en el sitio»).
    const rapidez = K.nodos[0].v.clone().sub(aire).length();
    K.nodos.forEach((nd, k) => {
      const off = _v.subVectors(nd.x, nd.meta);
      // Hacia los lados el mechón chocaría con el cuello: solo un tercio del desplazamiento lateral.
      const lat = off.dot(izq); off.addScaledVector(izq, -0.65 * lat);
      const l = off.length(); if (l > 1e-6) off.multiplyScalar((maxOff * Math.tanh(l / maxOff)) / l); // saturación suave
      K.off[k].copy(off).applyMatrix3(inv);
    });
    K.off[NODOS].set(0, 0, 0);
    // Ondulación: más amplia cuanto más aire (galope), siempre un poco viva.
    this.t += dt;
    const u = this.uni;
    u.uCrinT.value = this.t;
    u.uCrinOnda.value = (0.0025 + 0.011 * smooth(0, 9, rapidez)) ;
    u.uCrinArriba.value.copy(arriba).applyMatrix3(inv).normalize();
    u.uCrinAtras.value.copy(adelante).negate().applyMatrix3(inv).normalize();
    u.uCrinLado.value.copy(izq).applyMatrix3(inv).normalize();
  }
}

/**
 * Colisionador del cuello, la cabeza y la cruz para las riendas: los vértices del cuerpo (en reposo) en una
 * rejilla hash. Un punto del mundo se lleva a reposo con el hueso más cercano de la cadena del cuello, se empuja
 * fuera por la normal del vértice más próximo y se devuelve al mundo.
 */
class ColisionCuello {
  constructor(body, T, cuerpo, wCuello, wZona) {
    this.body = body;
    const P = body.geometry.attributes.position, B = body.skeleton.bones;
    this.huesos = B.map((b, i) => (/chest|neck|head/i.test(b.name) && !/ear/i.test(b.name) ? i : -1)).filter((i) => i >= 0);
    const celda = (this.celda = 0.05), mapa = (this.mapa = new Map());
    this.pos = []; this.nor = [];
    for (let i = 0; i < T.N; i++) {
      if (T.wid[i] !== i || T.comp[i] !== cuerpo || wZona[i] < 0.35) continue;
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const k = clave(Math.floor(x / celda), Math.floor(y / celda), Math.floor(z / celda));
      const id = this.pos.length / 3;
      this.pos.push(x, y, z); this.nor.push(T.fn[i * 3], T.fn[i * 3 + 1], T.fn[i * 3 + 2]);
      let l = mapa.get(k); if (!l) mapa.set(k, (l = [])); l.push(id);
    }
    this.M = this.huesos.map(() => new THREE.Matrix4()); this.Mi = this.huesos.map(() => new THREE.Matrix4()); this.c = this.huesos.map(() => new THREE.Vector3());
  }
  /** Actualiza las matrices de los huesos (una vez por fotograma). */
  preparar() {
    this.huesos.forEach((bi, k) => { matrizHueso(this.body, bi, this.M[k]); this.Mi[k].copy(this.M[k]).invert(); this.body.skeleton.bones[bi].getWorldPosition(this.c[k]); });
    this.esc = new THREE.Vector3().setFromMatrixScale(this.M[0]).x || 1;
  }
  /** Empuja «p» (mundo) fuera del cuerpo hasta «r» (mundo). Devuelve true si lo movió. */
  empujar(p, r) {
    let k = 0, best = Infinity;
    for (let j = 0; j < this.c.length; j++) { const d = this.c[j].distanceToSquared(p); if (d < best) { best = d; k = j; } }
    const q = _v.copy(p).applyMatrix4(this.Mi[k]), rr = r / this.esc, c = this.celda;
    const cx = Math.floor(q.x / c), cy = Math.floor(q.y / c), cz = Math.floor(q.z / c);
    let mejor = -1, md = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = this.mapa.get(clave(cx + dx, cy + dy, cz + dz)); if (!l) continue;
      for (const id of l) { const ex = q.x - this.pos[id * 3], ey = q.y - this.pos[id * 3 + 1], ez = q.z - this.pos[id * 3 + 2], d = ex * ex + ey * ey + ez * ez; if (d < md) { md = d; mejor = id; } }
    }
    if (mejor < 0) return false;
    const nx = this.nor[mejor * 3], ny = this.nor[mejor * 3 + 1], nz = this.nor[mejor * 3 + 2];
    const s = (q.x - this.pos[mejor * 3]) * nx + (q.y - this.pos[mejor * 3 + 1]) * ny + (q.z - this.pos[mejor * 3 + 2]) * nz;
    if (s >= rr) return false;
    q.x += nx * (rr - s); q.y += ny * (rr - s); q.z += nz * (rr - s);
    p.copy(q.applyMatrix4(this.M[k]));
    return true;
  }
}

/** Cuerda de partículas (PBD) entre dos extremos fijos, con gravedad, aire y choque con el cuello. */
export class Cuerda {
  constructor(n = 14) { this.n = n; this.x = Array.from({ length: n }, () => new THREE.Vector3()); this.v = Array.from({ length: n }, () => new THREE.Vector3()); this.listo = false; }
  /** Coloca la cuerda en una curva inicial (puntos de control) sin velocidad. */
  iniciar(curva) { const c = new THREE.CatmullRomCurve3(curva); this.x.forEach((x, i) => x.copy(c.getPoint(i / (this.n - 1)))); this.v.forEach((v) => v.set(0, 0, 0)); this.listo = true; }
  paso(dt, a, b, largo, { colision = null, radio = 0.006, aire = null } = {}) {
    const n = this.n, l0 = largo / (n - 1);
    this.x[0].copy(a); this.x[n - 1].copy(b);
    if (!(dt > 0)) return;
    const pasos = Math.min(3, Math.max(1, Math.ceil(dt * 90))), h = dt / pasos, ant = this.x.map((x) => x.clone()), d = new THREE.Vector3();
    for (let s = 0; s < pasos; s++) {
      ant.forEach((p, i) => p.copy(this.x[i]));
      for (let i = 1; i < n - 1; i++) {
        this.v[i].y -= 9.8 * h;
        if (aire) this.v[i].addScaledVector(d.subVectors(aire, this.v[i]), 0.8 * h);
        this.x[i].addScaledVector(this.v[i], h);
      }
      for (let it = 0; it < 6; it++) {
        for (let i = 0; i < n - 1; i++) { // largo de cada tramo (los extremos no se mueven)
          const p = this.x[i], q = this.x[i + 1]; d.subVectors(q, p); const l = d.length() || 1e-6, e = (l - l0) / l;
          if (e < 0) continue; // una cuerda se pliega, no empuja
          const wp = i === 0 ? 0 : 1, wq = i + 1 === n - 1 ? 0 : 1, sw = wp + wq; if (!sw) continue;
          p.addScaledVector(d, (e * wp) / sw); q.addScaledVector(d, (-e * wq) / sw);
        }
        if (colision && it % 2) for (let i = 1; i < n - 1; i++) colision.empujar(this.x[i], radio);
      }
      for (let i = 1; i < n - 1; i++) this.v[i].subVectors(this.x[i], ant[i]).divideScalar(h).multiplyScalar(0.985);
    }
  }
}
