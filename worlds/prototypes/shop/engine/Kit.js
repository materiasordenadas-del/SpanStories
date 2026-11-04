import * as T from './three.js';
import { luz, crearMaterialToon, crearMaterialContorno, conNormalContorno, NIVELES_CONTORNO, normalDesdeAltura } from './Luz25D.js';

/* ── Kit del Comercio ────────────────────────────────────────────────
   Recortado del Banco (mismo contrato visual, ESTILO.md §3): volúmenes toon de
   3 bandas con la luz compartida, contorno por casco invertido con jerarquía y
   albedo neutro.  Sin reflejos de entorno.  Añade el lote de COLOR POR
   INSTANCIA para los productos (una malla por forma, miles de instancias). */

export const PALETA = {
  // marca La Estrella
  rojo: '#d8453a', rojoOscuro: '#a8322a', amarillo: '#f4c542', amarilloClaro: '#fbe7a1', crema: '#f3ead8',
  // arquitectura
  pared: '#f1ece2', techo: '#f5f3ee', zocalo: '#4a4f55', perfil: '#6d7479', aluminio: '#c3c8cc',
  ladrillo: '#b8674a', piedra: '#d6cfc1', menta: '#cfe6dc',
  // mobiliario
  gondola: '#e9ebe8', gondolaFondo: '#d9ddd9', balda: '#f7f7f4', riel: '#c8342c', acero: '#b8bec3', aceroOscuro: '#80878d',
  negro: '#2a2c2f', grafito: '#3a3d41', gris: '#8d9296', grisClaro: '#d7dadc', blanco: '#f6f6f3',
  madera: '#b98a57', maderaOscura: '#8a6038', carton: '#c49a64', cartonOscuro: '#a57c4b', estiba: '#b08a5a',
  verde: '#4f8a4a', verdeOscuro: '#2f5f3a', azul: '#2f6fb0', naranja: '#e8873a',
  // calle
  acera: '#cfc8bb', bordillo: '#a9a397', asfalto: '#5d6066', raya: '#f2efe6',
};

export function lienzo(ancho, alto, dibujar, { repetir = false, espacio = T.SRGBColorSpace } = {}) {
  const c = document.createElement('canvas'); c.width = ancho; c.height = alto;
  dibujar(c.getContext('2d'), ancho, alto);
  const t = new T.CanvasTexture(c); t.colorSpace = espacio; t.anisotropy = 8;
  t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
  if (repetir) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.userData.canvas = c;
  return t;
}

// Aleatorio determinista: la escena es la misma en cada carga.
export function azar(semilla = 1) {
  let s = semilla >>> 0 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Baldosa de piso (albedo + relieve de junta), un módulo por textura. */
export function texturaBaldosa({ a = '#eeeae1', b = '#e3ddd0', junta = '#bdb5a6', lado = 256 } = {}) {
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const g = albedo.getContext('2d'), h = altura.getContext('2d'), m = lado / 2, j = 3;
  g.fillStyle = junta; g.fillRect(0, 0, lado, lado); h.fillStyle = '#000'; h.fillRect(0, 0, lado, lado);
  for (const [x, y, c] of [[0, 0, a], [m, 0, b], [0, m, b], [m, m, a]]) {
    g.fillStyle = c; g.fillRect(x + j, y + j, m - 2 * j, m - 2 * j);
    h.fillStyle = '#fff'; h.fillRect(x + j, y + j, m - 2 * j, m - 2 * j);
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2.2, suavizado: .7, repetir: true }) };
}

/* ── Kit: geometrías y materiales compartidos ─────────────────────────── */

export function crearKit() {
  const geo = {
    caja: conNormalContorno(new T.BoxGeometry(1, 1, 1)),
    cil8: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 8)),
    cil16: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 16)),
    esfera: conNormalContorno(new T.SphereGeometry(.5, 12, 9)),
    plano: new T.PlaneGeometry(1, 1),
  };
  const materiales = new Map();
  const mat = clave => {
    if (typeof clave !== 'string') return clave;
    if (!materiales.has(clave)) {
      const m = crearMaterialToon({ color: PALETA[clave] ?? clave, bandas: 3 });
      m.userData.trazo = PALETA[clave] ?? clave;
      materiales.set(clave, m);
    }
    return materiales.get(clave);
  };
  // Emisivo: tubos, pantallas, interior iluminado de las neveras.  No se reilumina.
  const emisivos = new Map();
  const emisivo = color => {
    if (!emisivos.has(color)) { const m = new T.MeshBasicMaterial({ color }); m.userData.sinTrazo = true; emisivos.set(color, m); }
    return emisivos.get(color);
  };
  // Vidrio: ilustración translúcida teñida por el ambiente (sin reflejos).
  const vidrios = new Map();
  const vidrio = (color = '#bfe3ee', opacidad = .22) => {
    const k = `${color}|${opacidad}`;
    if (!vidrios.has(k)) {
      const m = new T.MeshBasicMaterial({ color, transparent: true, opacity: opacidad, depthWrite: false, side: T.DoubleSide });
      m.userData.sinTrazo = true; m.userData.vidrio = true; luz.tintar(m, 'vidrio'); m.color.set(color);
      vidrios.set(k, m);
    }
    return vidrios.get(k);
  };
  const trazos = new Map();
  const trazo = (color, nivel = 'medio') => {
    const k = `${color}|${nivel}`;
    if (!trazos.has(k)) trazos.set(k, crearMaterialContorno(color, nivel));
    return trazos.get(k);
  };
  // Material blanco para el lote de color por instancia (el color va en instanceColor).
  const inst = crearMaterialToon({ color: '#ffffff', bandas: 3 });
  const trazoInst = crearMaterialContorno('#ffffff', 'medio');
  return { geo, mat, emisivo, vidrio, trazo, inst, trazoInst, PALETA };
}

// Nivel del trazo por tamaño: mobiliario «medio», arquitectura grande «fino»;
// piezas diminutas o planas y muros enteros sin trazo (ESTILO.md §3).
export function nivelContorno(w, h, d) {
  const min = Math.min(w, h, d), max = Math.max(w, h, d);
  if (min < .012 || max >= 7 || max < .06) return null;
  return max >= 2.6 ? 'fino' : 'medio';
}

/** Lote: acumula piezas (geometría × material) con una pila de marcos locales y
 *  las instancia al final — un draw call por pareja, más uno de contorno. */
export function crearLote(kit) {
  const grupos = new Map(), pila = [new T.Matrix4()], sombras = [];
  const p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
  const lote = {
    en(x, y, z, ry, fn) {
      const m = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), s.set(1, 1, 1));
      pila.push(pila.at(-1).clone().multiply(m));
      try { fn(); } finally { pila.pop(); }
    },
    matriz(x, y, z, sx, sy, sz, o = {}) {
      e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      return new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e), s.set(sx, sy, sz)).premultiply(pila.at(-1));
    },
    pieza(geometria, material, x, y, z, sx, sy, sz, o = {}) {
      const m = kit.mat(material), matriz = lote.matriz(x, y, z, sx, sy, sz, o);
      const k = `${geometria.uuid}|${m.uuid}`;
      if (!grupos.has(k)) grupos.set(k, { geometria, material: m, items: [] });
      const ws = new T.Vector3(); matriz.decompose(new T.Vector3(), new T.Quaternion(), ws);
      const sinTrazo = o.contorno === false || m.userData.sinTrazo || m.transparent;
      const nivel = sinTrazo ? null : (typeof o.contorno === 'string' ? o.contorno : nivelContorno(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)));
      grupos.get(k).items.push({ matriz, nivel, nombre: o.nombre || null, trazo: o.trazo || m.userData.trazo || '#888888' });
      return lote;
    },
    caja(material, x, y, z, w, h, d, o) { return lote.pieza(kit.geo.caja, material, x, y, z, w, h, d, o); },
    /** Caja por bordes (min/max) en el marco actual: evita calcular centros a mano. */
    bloque(material, x0, y0, z0, x1, y1, z1, o) {
      return lote.caja(material, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);
    },
    cil(material, x, y, z, diam, h, o = {}) {
      const g = o.lados === 8 ? kit.geo.cil8 : kit.geo.cil16;
      return lote.pieza(g, material, x, y, z, diam, h, o.diamZ || diam, o);
    },
    esfera(material, x, y, z, dx, dy = dx, dz = dx, o) { return lote.pieza(kit.geo.esfera, material, x, y, z, dx, dy, dz, o); },
    /** Sombra de contacto (mancha multiplicada bajo un mueble). */
    sombra(x, z, w, d, y = .004) {
      sombras.push(new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(-Math.PI / 2, 0, 0)), s.set(w, d, 1)).premultiply(pila.at(-1)));
      return lote;
    },
    construir(grupo, pulsables = []) {
      for (const { geometria, material, items } of grupos.values()) {
        const mesh = new T.InstancedMesh(geometria, material, items.length);
        items.forEach((it, i) => mesh.setMatrixAt(i, it.matriz));
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
        if (items.some(it => it.nombre)) { mesh.userData.nombres = items.map(it => it.nombre); pulsables.push(mesh); }
        if (material.transparent) mesh.renderOrder = 3;
        grupo.add(mesh);
        const porTrazo = new Map();
        for (const it of items) if (it.nivel) {
          if (!porTrazo.has(it.trazo)) porTrazo.set(it.trazo, []);
          porTrazo.get(it.trazo).push(it);
        }
        for (const [color, lista] of porTrazo) {
          const casco = geometria.clone();
          casco.setAttribute('aNivel', new T.InstancedBufferAttribute(new Float32Array(lista.map(it => NIVELES_CONTORNO[it.nivel])), 1));
          const hull = new T.InstancedMesh(casco, kit.trazo(color, 'medio'), lista.length);
          lista.forEach((it, i) => hull.setMatrixAt(i, it.matriz));
          hull.instanceMatrix.needsUpdate = true; hull.computeBoundingSphere();
          hull.raycast = () => {}; hull.name = 'contorno';
          grupo.add(hull);
        }
      }
      if (sombras.length) grupo.add(mallaSombras(kit, sombras));
      grupos.clear(); sombras.length = 0;
      return pulsables;
    },
  };
  return lote;
}

/** Lote de COLOR POR INSTANCIA: productos.  Agrupa por geometría; cada instancia
 *  lleva su color y un id (para decir su nombre al pulsarla). */
export function crearLoteColor(kit) {
  const grupos = new Map(), c = new T.Color();
  const lote = {
    poner(geometria, matriz, color, { id = null, nivel = null } = {}) {
      if (!grupos.has(geometria)) grupos.set(geometria, []);
      grupos.get(geometria).push({ matriz, color, id, nivel });
    },
    get total() { let n = 0; for (const l of grupos.values()) n += l.length; return n; },
    construir(grupo, pulsables = []) {
      for (const [geometria, items] of grupos) {
        const mesh = new T.InstancedMesh(geometria, kit.inst, items.length);
        items.forEach((it, i) => { mesh.setMatrixAt(i, it.matriz); mesh.setColorAt(i, c.set(it.color)); });
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere(); mesh.computeBoundingBox();
        mesh.name = 'productos';
        if (items.some(it => it.id)) { mesh.userData.ids = items.map(it => it.id); pulsables.push(mesh); }
        grupo.add(mesh);
        const conTrazo = items.filter(it => it.nivel);
        if (conTrazo.length) {
          const casco = geometria.clone();
          casco.setAttribute('aNivel', new T.InstancedBufferAttribute(new Float32Array(conTrazo.map(it => NIVELES_CONTORNO[it.nivel])), 1));
          const hull = new T.InstancedMesh(casco, kit.trazoInst, conTrazo.length);
          conTrazo.forEach((it, i) => { hull.setMatrixAt(i, it.matriz); hull.setColorAt(i, c.set(it.color)); });
          hull.instanceMatrix.needsUpdate = true; hull.instanceColor.needsUpdate = true; hull.computeBoundingSphere();
          hull.raycast = () => {}; hull.name = 'contorno';
          grupo.add(hull);
        }
      }
      grupos.clear();
      return pulsables;
    },
  };
  return lote;
}

// Manchas de contacto: blanco fuera, tono frío dentro, fundidas por MULTIPLICAR.
let texturaSombra = null;
function mallaSombras(kit, lista) {
  texturaSombra ??= lienzo(128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#b3a8c2'); g.addColorStop(.5, '#d0c8d8'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const material = new T.MeshBasicMaterial({ map: texturaSombra, blending: T.MultiplyBlending, transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.userData.sinTrazo = true;
  const mesh = new T.InstancedMesh(kit.geo.plano, material, lista.length);
  lista.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.renderOrder = 1; mesh.raycast = () => {}; mesh.name = 'sombras';
  return mesh;
}

/** Plano ilustrado (cartel, letrero): sin relighting, teñido por el ambiente. */
export function ilustracion(ancho, alto, pxAncho, dibujar, tipo = 'cartel', { doble = false } = {}) {
  const map = lienzo(pxAncho, Math.round(pxAncho * alto / ancho), dibujar);
  const material = new T.MeshBasicMaterial({ map });
  material.userData.sinTrazo = true;
  luz.tintar(material, tipo);
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, alto), material);
  // Dos caras = dos planos espalda con espalda: el texto se lee bien desde ambos lados.
  if (doble) { const dorso = new T.Mesh(mesh.geometry, material); dorso.rotation.y = Math.PI; dorso.position.z = -.002; dorso.raycast = () => {}; mesh.add(dorso); }
  mesh.userData.redibujar = fn => { fn(map.userData.canvas.getContext('2d'), map.image.width, map.image.height); map.needsUpdate = true; };
  return mesh;
}
