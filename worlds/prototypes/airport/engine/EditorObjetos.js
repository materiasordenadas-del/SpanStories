import * as T from './three.js';

// Modo edición para el mobiliario de las salas. Las salas se construyen como
// mallas sueltas dentro del grupo de detalle, sin un "objeto" que las agrupe:
// aquí se agrupan por contacto (cajas que se tocan = un mismo objeto) y cada
// grupo se envuelve en un pivote con matriz propia. Las mallas conservan sus
// coordenadas locales, así que las animaciones que las mueven no se rompen.
// Las ediciones se identifican por sala + caja original, no por índice.

const TOL = .03;                     // contacto entre cajas (m)
const UP = new T.Vector3(0, 1, 0);
const esEstructura = caja => {
  const t = caja.getSize(new T.Vector3());
  const largo = Math.max(t.x, t.z);
  return largo > 5 || (t.y < .25 && t.x * t.z > 6) || (t.y > 3.5 && largo > 2);   // paredes, techos, pisos
};
const r2 = v => Math.round(v * 20) / 20;

export class EditorObjetos {
  constructor({ nombres = {} } = {}) {
    this.nombres = nombres;
    this.guardado = {};              // clave → { x, y, z, s, r, d }
    this.analizados = new WeakMap(); // detalle → { clusters, porUnidad }
    this.alCambiar = () => {};
  }

  // Ediciones guardadas (claves `obj:…` del archivo compartido de posiciones).
  cargar(datos) {
    for (const [k, v] of Object.entries(datos || {})) if (k.startsWith('obj:')) this.guardado[k] = v;
  }
  exportar() {
    const out = {};
    for (const [k, v] of Object.entries(this.guardado)) if (v.s !== 1 || v.r || v.d || v.x || v.y || v.z) out[k] = v;
    return out;
  }

  // Analiza (una sola vez por detalle) y aplica lo guardado. Llamar con la sala activa.
  preparar(zona, detalle, colliders, raiz) {
    if (!detalle) return null;
    if (this.analizados.has(detalle)) return this.analizados.get(detalle);
    raiz.updateMatrixWorld(true); detalle.updateWorldMatrix(true, true);
    const unidades = [], seguidores = new Set();
    // El interior de D00 cuelga de un grupo `D00:hall` (transformación identidad): se recorre por dentro.
    const nodos = detalle.children.flatMap(n => n.isGroup && /:hall$/.test(n.name) && !n.userData?.movable ? n.children : [n]);
    for (const nodo of nodos) for (const f of nodo.userData?.movable?.followers || []) seguidores.add(f);
    for (const nodo of nodos) {
      if (nodo.isLight || nodo.userData?.movable || seguidores.has(nodo)) continue;
      // Cada instancia de un InstancedMesh (materos, sillas, postes…) es una unidad propia.
      if (nodo.isInstancedMesh) {
        if (nodo.count > 150) continue;   // teselas y rejillas decorativas
        nodo.geometry.boundingBox || nodo.geometry.computeBoundingBox();
        for (let idx = 0; idx < nodo.count; idx++) {
          const m0 = new T.Matrix4(); nodo.getMatrixAt(idx, m0);
          const caja = nodo.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(nodo.matrixWorld, m0));
          if (!esEstructura(caja)) unidades.push({ nodo, idx, m0, caja });
        }
        continue;
      }
      const caja = new T.Box3().setFromObject(nodo);
      if (caja.isEmpty()) continue;
      if (!esEstructura(caja)) unidades.push({ nodo, caja });
    }
    // Componentes por contacto de cajas.
    const padre = unidades.map((_, i) => i);
    const raizDe = i => { while (padre[i] !== i) i = padre[i] = padre[padre[i]]; return i; };
    const une = (a, b) => { padre[raizDe(a)] = raizDe(b); };
    const toca = (a, b, tol) => a.min.x <= b.max.x + tol && a.max.x >= b.min.x - tol && a.min.y <= b.max.y + tol && a.max.y >= b.min.y - tol && a.min.z <= b.max.z + tol && a.max.z >= b.min.z - tol;
    const casiIgual = (a, b) => Math.abs(a.min.x - b.min.x) + Math.abs(a.max.x - b.max.x) + Math.abs(a.min.z - b.min.z) + Math.abs(a.max.z - b.max.z) + Math.abs(a.max.y - b.max.y) < .3;
    // Cada planta (maceta + tierra + hojas, una instancia por planta) es un objeto propio: no se une por contacto con la pared ni el mobiliario.
    const clase = u => /^(planta|pot:)/.test(u.nodo.name) && u.idx !== undefined ? `p${u.idx}` : 'x';
    for (let i = 0; i < unidades.length; i++) for (let j = i + 1; j < unidades.length; j++) if (clase(unidades[i]) === clase(unidades[j]) && toca(unidades[i].caja, unidades[j].caja, TOL)) une(i, j);
    let grupos = new Map();
    unidades.forEach((u, i) => { const r = raizDe(i); (grupos.get(r) || grupos.set(r, []).get(r)).push(u); });
    // Un componente enorme es una cadena de piezas sueltas (zócalos, barandas…):
    // se parte y solo se vuelven a unir las copias casi idénticas (contornos).
    const finales = [];
    for (const g of grupos.values()) {
      const total = g.reduce((c, u) => c.union(u.caja), new T.Box3()), t = total.getSize(new T.Vector3());
      if (Math.max(t.x, t.z) <= 8 && g.length <= 60) { finales.push(g); continue; }
      const usado = new Set();
      for (const u of g) {
        if (usado.has(u)) continue;
        const par = g.filter(v => !usado.has(v) && (v === u || casiIgual(u.caja, v.caja)));
        par.forEach(v => usado.add(v)); finales.push(par);
      }
    }
    const clusters = [], porUnidad = new Map();
    for (const g of finales) {
      const caja = g.reduce((c, u) => c.union(u.caja), new T.Box3());
      const centro = new T.Vector3((caja.min.x + caja.max.x) / 2, caja.min.y, (caja.min.z + caja.max.z) / 2);
      const t = caja.getSize(new T.Vector3());
      const sid = g.map(u => u.nodo.userData?.semanticId).find(Boolean);
      const local = centro.clone().sub(raiz.position);
      const c = {
        isCluster: true, zona, unidades: g, caja, centro, local,
        clave: `obj:${zona}|${r2(local.x)}|${r2(local.z)}|${r2(caja.min.y)}|${r2(t.x)}|${r2(t.z)}|${r2(t.y)}`,
        etiqueta: (sid && this.nombres[sid]) || (g.every(u => clase(u) !== 'x') ? 'Planta' : g.length <= 8 && g.some(u => /^pot/.test(u.nodo.name)) ? 'Matero' : 'objeto'),
        off: new T.Vector3(), s: 1, r: 0, d: false, pivote: null, colisiones: [], raiz,
      };
      c.colisiones = colliders.filter(b => {
        const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
        return cx >= caja.min.x - .1 && cx <= caja.max.x + .1 && cz >= caja.min.z - .1 && cz <= caja.max.z + .1
          && b.max.x - b.min.x <= t.x + .4 && b.max.z - b.min.z <= t.z + .4;
      }).map(b => ({ box: b, orig: b.clone() }));
      clusters.push(c);
      for (const u of c.unidades) {
        if (u.idx === undefined) porUnidad.set(u.nodo, c);
        else (porUnidad.get(u.nodo) || porUnidad.set(u.nodo, new Map()).get(u.nodo)).set(u.idx, c);
      }
    }
    const info = { clusters, porUnidad, detalle };
    this.analizados.set(detalle, info);
    for (const c of clusters) {
      const v = this.guardado[c.clave];
      if (v) this.poner(c, { ...v, off: new T.Vector3(v.x || 0, v.y || 0, v.z || 0) }, false);
    }
    return info;
  }

  reaplicar(detalle) {
    for (const c of this.analizados.get(detalle)?.clusters || []) {
      const v = this.guardado[c.clave];
      if (v) this.poner(c, { off: new T.Vector3(v.x || 0, v.y || 0, v.z || 0), s: v.s ?? 1, r: v.r ?? 0, d: !!v.d }, false);
    }
  }

  // Cluster bajo un impacto de rayo (o null si es estructura / no editable).
  deImpacto(detalle, objeto, instancia) {
    const info = this.analizados.get(detalle);
    if (!info) return null;
    for (let n = objeto; n; n = n.parent) {
      if (n.userData?.pivoteEdicion) return n.userData.pivoteEdicion;
      const c = info.porUnidad.get(n);
      if (c instanceof Map) return instancia === undefined ? null : c.get(instancia) || null;
      if (c) return c;
      if (n === detalle) break;
    }
    return null;
  }

  // Estado absoluto: desplazamiento, escala, giros de 90° y borrado.
  poner(c, { off = c.off, s = c.s, r = c.r, d = c.d }, guardar = true) {
    c.off.copy(off); c.s = s; c.r = r; c.d = d;
    const sueltas = c.unidades.filter(u => u.idx === undefined), instancias = c.unidades.filter(u => u.idx !== undefined);
    if (sueltas.length && !c.pivote) {
      const detalle = sueltas[0].nodo.parent;
      c.pivote = new T.Group(); c.pivote.name = 'edicion'; c.pivote.matrixAutoUpdate = false;
      c.pivote.userData.pivoteEdicion = c;
      detalle.add(c.pivote); for (const u of sueltas) c.pivote.add(u.nodo);
    }
    const arma = centro => new T.Matrix4().makeTranslation(centro.x + c.off.x, centro.y + c.off.y, centro.z + c.off.z)
      .multiply(new T.Matrix4().makeRotationAxis(UP, c.r * Math.PI / 2))
      .multiply(new T.Matrix4().makeScale(c.s, c.s, c.s))
      .multiply(new T.Matrix4().makeTranslation(-centro.x, -centro.y, -centro.z));
    const P = arma(c.local);
    if (c.pivote) { c.pivote.matrix.copy(P); c.pivote.matrixWorldNeedsUpdate = true; c.pivote.visible = !c.d; }
    const tocadas = new Set();
    for (const u of instancias) {
      const malla = u.nodo, L = malla.matrix, m = new T.Matrix4();
      if (c.d) m.makeScale(0, 0, 0);
      else m.copy(L).invert().multiply(P).multiply(L).multiply(u.m0);
      malla.setMatrixAt(u.idx, m); tocadas.add(malla);
    }
    for (const malla of tocadas) { malla.instanceMatrix.needsUpdate = true; malla.frustumCulled = false; }
    const mundo = arma(c.centro);
    for (const { box, orig } of c.colisiones) { if (c.d) box.makeEmpty(); else box.copy(orig).applyMatrix4(mundo); }
    if (guardar) { this.guardado[c.clave] = { x: c.off.x, y: c.off.y, z: c.off.z, s: +c.s.toFixed(4), r: c.r, d: c.d }; this.alCambiar(); }
  }
  vivo(c) { return c.pivote ? !!c.pivote.parent : c.unidades.some(u => u.nodo.parent); }
  mover(c, delta) { this.poner(c, { off: c.off.clone().add(delta) }); }
  escalar(c, factor) { this.poner(c, { s: Math.min(6, Math.max(.2, c.s * factor)) }); }
  girar(c, pasos) { this.poner(c, { r: c.r + pasos }); }
  borrar(c) { this.poner(c, { d: true }); }

  // Centro del objeto en el mundo (para el marcador amarillo).
  centroMundo(c, salida = new T.Vector3()) {
    const t = c.caja.getSize(new T.Vector3());
    return salida.set(c.centro.x + c.off.x, c.centro.y + c.off.y + t.y * c.s / 2, c.centro.z + c.off.z);
  }
}
