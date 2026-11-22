// FisicaCuerpo — colisionadores del cuerpo que siguen a los huesos (Rapier) y resolución de autopenetraciones.
//  · Tronco y cadera = cajas orientadas medidas en la malla (un torso es ancho y plano: una cápsula no lo describe).
//  · Brazos, manos, piernas, cuello y cráneo = cápsulas.
//  · Los brazos no atraviesan el tronco: Rapier da el contacto exacto y se gira el hombro (o el codo) lo justo.
//  · La trenza (Trenza en LifeCharacter.js) usa estos mismos colisionadores con empujar().
// Este mismo mundo de Rapier es donde el visor de mundos pondrá suelos, paredes y objetos.
import * as THREE from 'three';

const _a = new THREE.Vector3(), _d = new THREE.Vector3();
const EJE_Y = new THREE.Vector3(0, 1, 0);
const posMundo = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);

export function puntoSegmento(p, a, b, out) {
  _d.subVectors(b, a); const l2 = _d.lengthSq();
  const t = l2 > 1e-12 ? Math.min(1, Math.max(0, _a.subVectors(p, a).dot(_d) / l2)) : 0;
  return out.copy(a).addScaledVector(_d, t);
}
const pct = (arr, f) => { const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))]; };

export class FisicaCuerpo {
  constructor(vida, RAPIER, opc = {}) {
    this.vida = vida; this.R = RAPIER;
    this.mundoPropio = !opc.mundo;
    this.mundo = opc.mundo || new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.activo = true;
    this.capsulas = [];
    const v = vida, h = v.altura;
    const L = v.lados.find(l => l.signo > 0), Rr = v.lados.find(l => l.signo < 0);
    const P = o => () => posMundo(o);
    const mas = (o, hijo, f) => () => { const a = posMundo(o), b = posMundo(hijo); return a.addScaledVector(b.sub(a), f); };
    const cr = v.pelo?.centro?.clone() || posMundo(v.cabeza).add(new THREE.Vector3(0, 0.07 * h, -0.014 * h));
    const crLocal = v.cabeza.worldToLocal(cr.clone());
    const craneo = () => v.cabeza.localToWorld(crLocal.clone());

    const def = [];
    // cajas: marco = hueso que las mueve; medir = huesos cuyos vértices definen su tamaño
    if (v.cadera) def.push({ id: 'cadera', tipo: 'caja', marco: v.cadera, medir: [v.cadera] });
    if (v.lumbar && v.espalda) def.push({ id: 'abdomen', tipo: 'caja', marco: v.espalda, medir: [v.lumbar, v.espalda] });
    if (v.pecho) def.push({ id: 'pecho', tipo: 'caja', marco: v.pecho, medir: [v.pecho] });
    if (v.cuello && v.cabeza) def.push({ id: 'cuello', a: P(v.cuello), b: P(v.cabeza), hueso: v.cuello });
    def.push({ id: 'craneo', a: craneo, b: craneo, rFijo: (opc.radioCraneo || 0.083) * h });
    for (const S of [L, Rr]) {
      if (!S) continue;
      const s = S.signo > 0 ? 'L' : 'R';
      const medio = S.dedos?.[1]?.[0];
      if (S.brazo && S.antebrazo) def.push({ id: 'brazo' + s, a: P(S.brazo), b: P(S.antebrazo), hueso: S.brazo, lado: S });
      if (S.antebrazo && S.mano) def.push({ id: 'antebrazo' + s, a: P(S.antebrazo), b: P(S.mano), hueso: S.antebrazo, lado: S });
      // la mano llega hasta la punta del dedo corazón (con los dedos curvados, la cápsula sigue la curva)
      const punta = S.dedos?.[1]?.at(-1);
      if (S.mano && medio) def.push({ id: 'mano' + s, a: P(S.mano), b: punta ? mas(punta.parent, punta, 1.8) : mas(S.mano, medio, 1.4), hueso: S.mano, lado: S, escala: 0.8 });
      // piernas: eje desplazado al centro real de la malla y radio hasta la superficie de la ropa (vaqueros holgados)
      if (S.muslo && S.pierna) def.push({ id: 'muslo' + s, a: P(S.muslo), b: P(S.pierna), hueso: S.muslo, lado: S, centrar: true, pct: 0.8, escala: 1 });
      if (S.pierna && S.pie) def.push({ id: 'pierna' + s, a: P(S.pierna), b: P(S.pie), hueso: S.pierna, lado: S, centrar: true, pct: 0.8, escala: 1 });
    }
    this._medir(def);
    for (const d of def) {
      if (d.tipo === 'caja') { d.col = this.mundo.createCollider(RAPIER.ColliderDesc.cuboid(d.half.x, d.half.y, d.half.z)); d.r = 0; }
      else {
        const A = d.a(), B = d.b(); d.mitad = A.distanceTo(B) / 2;
        d.col = this.mundo.createCollider(d.mitad > 1e-4 ? RAPIER.ColliderDesc.capsule(d.mitad, d.r) : RAPIER.ColliderDesc.ball(d.r));
      }
      this.capsulas.push(d);
    }
    this.porId = Object.fromEntries(this.capsulas.map(c => [c.id, c]));
    // pares que no pueden atravesarse (los contiguos no: el brazo nace en el pecho)
    const cuerpo = ['cadera', 'abdomen', 'pecho', 'musloL', 'musloR', 'craneo', 'cuello'];
    this.pares = [];
    for (const s of ['L', 'R']) {
      const o = s === 'L' ? 'R' : 'L';
      for (const m of ['brazo', 'antebrazo', 'mano']) for (const c of cuerpo) {
        if (m === 'brazo' && (c === 'pecho' || c === 'cuello' || c === 'abdomen')) continue;
        if (this.porId[m + s] && this.porId[c]) this.pares.push([m + s, c, s]);
      }
      if (s === 'L') for (const m of ['antebrazo', 'mano']) for (const m2 of ['antebrazo', 'mano'])
        if (this.porId[m + s] && this.porId[m2 + o]) this.pares.push([m + s, m2 + o, 'LR']);
    }
    // en reposo (pose A) nada se toca; si algún par ya se toca, se ignora esa holgura
    this.contactos = 0;
    this.actualizar();
    this.holgura = new Map();
    for (const [a, b] of this.pares) { const c = this.porId[a].col.contactCollider(this.porId[b].col, 0); if (c && c.distance < 0) this.holgura.set(a + '|' + b, -c.distance); }
  }

  _medir(def) {
    let malla = null, n = 0;
    this.vida.root.traverse(o => { if (o.isSkinnedMesh && o.geometry.attributes.position.count > n) { malla = o; n = o.geometry.attributes.position.count; } });
    const g = malla.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = malla.skeleton.bones;
    const dom = new Int32Array(n);
    for (let i = 0; i < n; i++) { let bw = 0, bi = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } dom[i] = bw > 0.6 ? bi : -1; }
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const d of def) {
      if (d.rFijo) { d.r = d.rFijo; continue; }
      if (d.tipo === 'caja') {
        // todas las mallas con piel (la ropa es otra malla: la camiseta da el volumen real del tronco)
        const xs = [], ys = [], zs = [];
        this.vida.root.traverse(o => {
          if (!o.isSkinnedMesh) return;
          const gg = o.geometry, s2 = gg.attributes.skinIndex, w2 = gg.attributes.skinWeight, bs = o.skeleton.bones;
          const ids = new Set(d.medir.map(b => bs.indexOf(b)));
          for (let i = 0; i < gg.attributes.position.count; i++) {
            let bw = 0, bi = -1; for (let k = 0; k < 4; k++) { const w = w2.getComponent(i, k); if (w > bw) { bw = w; bi = s2.getComponent(i, k); } }
            if (bw < 0.5 || !ids.has(bi)) continue;
            o.getVertexPosition(i, p); o.localToWorld(p); d.marco.worldToLocal(p); xs.push(p.x); ys.push(p.y); zs.push(p.z);
          }
        });
        // un poco por dentro de la piel/ropa
        const lim = (a) => [pct(a, 0.06), pct(a, 0.94)];
        const [x0, x1] = lim(xs), [y0, y1] = lim(ys), [z0, z1] = lim(zs);
        d.centro = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        d.half = new THREE.Vector3((x1 - x0) / 2 * 0.95, (y1 - y0) / 2 * 0.95, (z1 - z0) / 2 * 0.92);
        continue;
      }
      const ib = d.hueso ? bones.indexOf(d.hueso) : -1;
      const A = d.a(), B = d.b(), ds = [], pts = [];
      for (let i = 0; i < n; i++) if (dom[i] === ib) { malla.getVertexPosition(i, p); malla.localToWorld(p); pts.push(p.clone()); }
      if (d.centrar && pts.length > 30) {
        // desplazamiento medio perpendicular al hueso (zona central del segmento), guardado en el espacio del hueso
        const off = new THREE.Vector3(); let c = 0; const ab = B.clone().sub(A), l2 = ab.lengthSq();
        for (const v of pts) { const t = v.clone().sub(A).dot(ab) / l2; if (t < 0.15 || t > 0.85) continue; off.add(v.clone().sub(puntoSegmento(v, A, B, q))); c++; }
        if (c) { off.divideScalar(c); d.off = off.clone().applyQuaternion(d.hueso.getWorldQuaternion(new THREE.Quaternion()).invert()); A.add(off); B.add(off); }
      }
      for (const v of pts) { const t = v.clone().sub(A).dot(B.clone().sub(A)) / Math.max(1e-9, B.distanceToSquared(A)); if (d.centrar && (t < 0.1 || t > 0.9)) continue; ds.push(v.distanceTo(puntoSegmento(v, A, B, q))); }
      // brazos: algo por dentro de la piel (0,45 · 0,9) · piernas: hasta la ropa (pct propio, sin reducir)
      const fr = d.pct ? 1 : 0.9 * (d.escala || 1);
      d.r = Math.max(0.008 * this.vida.altura, (ds.length ? pct(ds, d.pct || 0.45) : 0.03 * this.vida.altura) * fr);
    }
  }

  /** Libera la memoria WASM del mundo de Rapier (solo si lo creó este cuerpo). Tras esto, el cuerpo queda inactivo. */
  liberar() {
    this.activo = false;
    if (this.mundoPropio && this.mundo) { try { this.mundo.free(); } catch { /* ya liberado */ } }
    this.mundo = null;
  }

  actualizar() {
    if (!this.mundo) return;
    this.vida.root.updateMatrixWorld(true);
    const q = new THREE.Quaternion();
    for (const c of this.capsulas) {
      if (c.tipo === 'caja') {
        c.pos = c.marco.localToWorld(c.centro.clone()); c.rot = c.marco.getWorldQuaternion(new THREE.Quaternion());
        c.col.setTranslation(c.pos, true); c.col.setRotation(c.rot, true);
        c.inv = new THREE.Matrix4().compose(c.pos, c.rot, new THREE.Vector3(1, 1, 1)).invert();
        continue;
      }
      c.A = c.a(); c.B = c.b();
      if (c.off) { const o = c.off.clone().applyQuaternion(c.hueso.getWorldQuaternion(q)); c.A.add(o); c.B.add(o); }
      c.col.setTranslation(c.A.clone().add(c.B).multiplyScalar(0.5), true);
      if (c.mitad > 1e-4) { q.setFromUnitVectors(EJE_Y, c.B.clone().sub(c.A).normalize()); c.col.setRotation(q, true); }
    }
  }

  // recoloca un solo colisionador (cápsula) con la pose actual, sin tocar Rapier
  refrescar(c) {
    if (!c || c.tipo === 'caja') return c;
    c.A = c.a(); c.B = c.b();
    if (c.off) { const o = c.off.clone().applyQuaternion(c.hueso.getWorldQuaternion(new THREE.Quaternion())); c.A.add(o); c.B.add(o); }
    return c;
  }
  // distancia con signo de un punto a la superficie del colisionador j, y la normal hacia fuera
  distancia(p, c, n = new THREE.Vector3()) {
    if (c.tipo === 'caja') {
      const l = p.clone().applyMatrix4(c.inv), hf = c.half;
      const qx = Math.max(-hf.x, Math.min(hf.x, l.x)), qy = Math.max(-hf.y, Math.min(hf.y, l.y)), qz = Math.max(-hf.z, Math.min(hf.z, l.z));
      const fuera = new THREE.Vector3(l.x - qx, l.y - qy, l.z - qz), d = fuera.length();
      if (d > 1e-7) { n.copy(fuera.divideScalar(d)).applyQuaternion(c.rot); return d; }
      const px = hf.x - Math.abs(l.x), py = hf.y - Math.abs(l.y), pz = hf.z - Math.abs(l.z), m = Math.min(px, py, pz);   // dentro
      n.set(m === px ? Math.sign(l.x) || 1 : 0, m === py ? Math.sign(l.y) || 1 : 0, m === pz ? Math.sign(l.z) || 1 : 0).applyQuaternion(c.rot);
      return -m;
    }
    const q = puntoSegmento(p, c.A, c.B, new THREE.Vector3());
    n.subVectors(p, q); const d = n.length(); if (d > 1e-7) n.divideScalar(d); else n.set(0, 1, 0);
    return d - c.r;
  }
  // saca la esfera (p, radio) del colisionador; usa el lado donde estaba antes (prev) para no atravesar en un paso
  empujar(p, prev, radio, c, holgura = 0) {
    const n = new THREE.Vector3(), d = this.distancia(p, c, n), min = radio - holgura;
    if (d >= min) return false;
    const np = new THREE.Vector3(), dp = prev ? this.distancia(prev, c, np) : -1;
    if (dp >= min - 0.002 && n.dot(np) < 0.2) { p.copy(prev); return true; }   // lo cruzaría en un paso: se queda donde estaba
    p.addScaledVector(n, min - d);
    return true;
  }

  // brazos/manos fuera del tronco: se gira el hombro (y el codo si toca la mano) lo justo
  resolver(iter = 8) {
    if (!this.mundo) return;
    if (!this.activo) return;
    const v = this.vida;
    this.contactos = 0;
    // un gesto que junta las manos (tocaManos) las deja tocarse: separarlas cada fotograma las hacía temblar
    const manosLibres = v.eventos?.some(e => e.def.tocaManos);
    for (let it = 0; it < iter; it++) {
      let hubo = false;
      for (const [ia, ib, s] of this.pares) {
        if (s === 'LR' && manosLibres) continue;
        const A = this.porId[ia], B = this.porId[ib];
        const c = A.col.contactCollider(B.col, 0);
        const hol = this.holgura.get(ia + '|' + ib) || 0;
        if (!c || c.distance >= -hol - 0.0005) continue;
        hubo = true; this.contactos++;
        const prof = -c.distance - hol + 0.001 * v.altura;
        const n1 = new THREE.Vector3(c.normal1.x, c.normal1.y, c.normal1.z);
        const p1 = new THREE.Vector3(c.point1.x, c.point1.y, c.point1.z);
        if (s === 'LR') {
          this._girarPara(A.lado.brazo, p1, n1.clone().multiplyScalar(-prof / 2));
          const p2 = new THREE.Vector3(c.point2.x, c.point2.y, c.point2.z);
          this._girarPara(B.lado.brazo, p2, n1.clone().multiplyScalar(prof / 2));
          continue;
        }
        const lado = A.lado, empuje = n1.multiplyScalar(-prof);
        if (ia.startsWith('mano') && lado.antebrazo) { this._girarPara(lado.antebrazo, p1, empuje.clone().multiplyScalar(0.4)); this._girarPara(lado.brazo, p1, empuje.multiplyScalar(0.6)); }
        else this._girarPara(lado.brazo, p1, empuje);
      }
      if (!hubo) break;
      this.actualizar();
    }
  }
  _girarPara(hueso, p, delta) {
    if (!hueso) return;
    const piv = posMundo(hueso), r = p.clone().sub(piv);
    if (r.lengthSq() < 1e-8) return;
    const q = new THREE.Quaternion().setFromUnitVectors(r.clone().normalize(), r.clone().add(delta).normalize());
    hueso.parent.getWorldQuaternion(_q2);
    const inv = _q2.clone().invert();
    hueso.quaternion.premultiply(inv.multiply(q).multiply(_q2));
    hueso.updateWorldMatrix(false, true);
  }

  get lista() { return this.capsulas; }

  depurar(escena) {
    // Sin escena: quitar la ayuda visual (al reconstruir o cambiar de personaje).
    if (!escena) { if (this.malla) { this.malla.parent?.remove(this.malla); this.malla = null; } return; }
    if (this.malla) { this.malla.visible = !this.malla.visible; return; }
    this.malla = new THREE.Group(); escena.add(this.malla);
    const mat = new THREE.MeshBasicMaterial({ color: 0x33ddff, wireframe: true, transparent: true, opacity: 0.35 });
    for (const c of this.capsulas) {
      const geo = c.tipo === 'caja' ? new THREE.BoxGeometry(c.half.x * 2, c.half.y * 2, c.half.z * 2) : new THREE.CapsuleGeometry(c.r, (c.mitad || 0) * 2, 4, 10);
      c.vis = new THREE.Mesh(geo, mat); this.malla.add(c.vis);
    }
  }
  pintar() {
    if (!this.malla?.visible) return;
    for (const c of this.capsulas) if (c.vis) { const t = c.col.translation(), r = c.col.rotation(); c.vis.position.set(t.x, t.y, t.z); c.vis.quaternion.set(r.x, r.y, r.z, r.w); }
  }
}
const _q2 = new THREE.Quaternion();
