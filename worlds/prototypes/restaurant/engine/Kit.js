import * as T from './three.js';
import { luz, crearMaterialToon, crearMaterialContorno, conNormalContorno, NIVELES_CONTORNO, normalDesdeAltura } from './Luz25D.js';

/* ── Kit del restaurante ──────────────────────────────────────────────────
   Mismo contrato visual que el aeropuerto (ESTILO.md §3): volúmenes toon de
   3 bandas con la luz compartida, contorno por casco invertido con jerarquía
   y albedo neutro (sin luz pintada).  Aquí además: metales y vidrio que
   reflejan el entorno capturado (Entorno.js) y espejos planos reales. */

export const PALETA = {
  // arquitectura
  estuco: '#e6c48e', estucoClaro: '#f0dcb2', techo: '#f3e6cc', viga: '#5b3a22', vigaClara: '#6e4a2c',
  nogal: '#6a4127', nogalOscuro: '#452817', moldura: '#7b4c2c', roble: '#b07a45', zocalo: '#3f2616',
  ladrillo: '#b4603e', ladrilloOscuro: '#8e4630', junta: '#d9c7a8', piedra: '#d8cbb3', marco: '#2f5a42',
  // mobiliario
  mantel: '#f7f2e8', cuadroRojo: '#c23b30', silla: '#5e3a20', enea: '#c9a262', cuero: '#2f5a42', cueroRojo: '#7d2a24',
  barra: '#5a341d', marmol: '#efeae1', marmolGris: '#d9d4cb', laton: '#d3a24a', negro: '#26211d', hierro: '#3a3633',
  pizarra: '#2b2f2c', lienzo: '#efe4cf', terracota: '#c0633d', maceta: '#b85c38', hoja: '#4f8a4a', hojaOscura: '#3a6b3a',
  tronco: '#7a5a3e', loza: '#fbf8f1', pan: '#d9a45c', vinoTinto: '#6d1522', vidrioVerde: '#2f6b3c', paja: '#d2ac5e',
  vela: '#f6ecd6', papel: '#f4efe4', cortina: '#8e2a2a',
  // baños
  azulejo: '#f4f1ea', salvia: '#bfcdb3', verdeBano: '#3f6f55', loza2: '#fdfdfb', cromo: '#d7dde2',
  // fachada / calle
  verdeTienda: '#1f4b36', verdeTiendaClaro: '#2c6149', dorado: '#e0b24f', fachada: '#e2a969', fachadaClara: '#efc58e',
  cornisa: '#f2e3c6', persiana: '#3f7a4e', acera: '#cfc8bb', bordillo: '#a9a397', asfalto: '#5d6066', geranio: '#d8413b',
  toldoRojo: '#b3322b', toldoCrema: '#f3ead6', farola: '#2c3a36',
};

export const hex = c => (typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c);

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

/* ── Texturas de superficie (albedo neutro + relieve) ─────────────────── */

// Tablones de roble: 16 tablones de 18 cm por textura (2,88 m), largos al azar,
// vetas y nudos suaves.  El canvas de altura da las juntas al normal map.
export function texturaMadera({ tonos = ['#b27a45', '#a86f3d', '#bb8550', '#9f6737', '#b98049'], lado = 1024, tablones = 16 } = {}) {
  const r = azar(11), ancho = lado / tablones;
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = altura.width = albedo.height = altura.height = lado;
  const a = albedo.getContext('2d'), h = altura.getContext('2d');
  h.fillStyle = '#ffffff'; h.fillRect(0, 0, lado, lado);
  for (let i = 0; i < tablones; i++) {
    let y = -r() * lado;
    while (y < lado) {
      const largo = lado * (.35 + r() * .45), x = i * ancho;
      const base = tonos[Math.floor(r() * tonos.length)];
      a.fillStyle = base; a.fillRect(x, y, ancho, largo);
      // vetas: líneas largas finas, algo onduladas
      for (let v = 0; v < 7; v++) {
        a.strokeStyle = r() > .5 ? 'rgba(90,50,20,.13)' : 'rgba(255,225,180,.10)';
        a.lineWidth = 1 + r() * 1.6; a.beginPath();
        const vx = x + 4 + r() * (ancho - 8);
        a.moveTo(vx, y);
        for (let k = 1; k <= 8; k++) a.lineTo(vx + Math.sin(k * 1.3 + v) * 2.2, y + largo * k / 8);
        a.stroke();
      }
      if (r() > .72) {   // nudo
        const nx = x + ancho * (.3 + r() * .4), ny = y + largo * (.2 + r() * .6);
        a.strokeStyle = 'rgba(80,42,18,.28)'; a.lineWidth = 1.5;
        for (let k = 1; k < 4; k++) { a.beginPath(); a.ellipse(nx, ny, 2.5 * k, 6 * k, 0, 0, Math.PI * 2); a.stroke(); }
      }
      // juntas: canto del tablón y testa
      a.fillStyle = 'rgba(60,32,14,.55)'; a.fillRect(x, y, ancho, 2); a.fillRect(x, y, 1.5, largo);
      h.fillStyle = '#000000'; h.fillRect(x, y, ancho, 2); h.fillRect(x, y, 2, largo);
      y += largo;
    }
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  const normal = normalDesdeAltura(altura, { fuerza: 2.4, suavizado: .6, repetir: true });
  return { map, normal, metros: 2.88 };
}

// Estuco ocre con manchas suaves (albedo, no luz).
export function texturaEstuco(base = '#e6c48e', semilla = 3, fuerza = 1) {
  return lienzo(512, 512, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const r = azar(semilla);
    for (let i = 0; i < 160; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 70;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const tono = r() > .5 ? '255,240,210' : '170,120,70';
      g.addColorStop(0, `rgba(${tono},${(.05 + r() * .06) * fuerza})`); g.addColorStop(1, `rgba(${tono},0)`);
      c.fillStyle = g;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { c.save(); c.translate(dx, dy); c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore(); }
    }
  }, { repetir: true });
}

// Azulejo de pared (metro 10×20) o baldosa cuadrada; devuelve albedo y relieve.
export function texturaAzulejo({ color = '#f4f1ea', junta = '#cfc8bb', columnas = 5, filas = 10, trabado = true, lado = 512, variar = .03 } = {}) {
  const r = azar(7), cw = lado / columnas, ch = lado / filas;
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const a = albedo.getContext('2d'), h = altura.getContext('2d');
  a.fillStyle = junta; a.fillRect(0, 0, lado, lado); h.fillStyle = '#000'; h.fillRect(0, 0, lado, lado);
  const base = new T.Color(color);
  for (let j = 0; j < filas; j++) for (let i = -1; i <= columnas; i++) {
    const x = i * cw + (trabado && j % 2 ? cw / 2 : 0), y = j * ch;
    const k = 1 + (r() - .5) * variar * 2;
    a.fillStyle = `#${base.clone().multiplyScalar(k).getHexString()}`;
    a.beginPath(); a.roundRect(x + 2, y + 2, cw - 4, ch - 4, 3); a.fill();
    h.fillStyle = '#fff'; h.beginPath(); h.roundRect(x + 2, y + 2, cw - 4, ch - 4, 5); h.fill();
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping; map.anisotropy = 8;
  map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2.5, suavizado: .8, repetir: true }) };
}

/* ── Kit: geometrías, materiales y lote instanciado ───────────────────── */

export function crearKit() {
  const geo = {
    caja: conNormalContorno(new T.BoxGeometry(1, 1, 1)),
    cil8: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 8)),
    cil16: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 16)),
    cil24: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 24)),
    esfera: conNormalContorno(new T.SphereGeometry(.5, 16, 12)),
    cono: conNormalContorno(new T.CylinderGeometry(0, .5, 1, 16)),
    plano: new T.PlaneGeometry(1, 1),
    disco: new T.CircleGeometry(.5, 40),
    tambor: conNormalContorno(new T.CylinderGeometry(.5, .64, 1, 20, 1, true)),
    nido: conNormalContorno(new T.TorusGeometry(.5, .16, 8, 28).rotateX(Math.PI / 2)),
    aro: conNormalContorno(new T.TorusGeometry(.5, .035, 8, 40).rotateX(Math.PI / 2)),
  };
  const materiales = new Map();
  // Volumen toon de 3 bandas por color de la paleta (o hex suelto).
  const mat = clave => {
    if (typeof clave !== 'string') return clave;
    if (!materiales.has(clave)) {
      const m = crearMaterialToon({ color: PALETA[clave] ?? clave, bandas: 3 });
      m.userData.trazo = PALETA[clave] ?? clave;
      materiales.set(clave, m);
    }
    return materiales.get(clave);
  };
  // Metal pulido: toon + reflejo del entorno (latón, cromo, acero).
  const metales = new Map();
  const metal = (clave, reflejo = .55, nitidez = 1.5) => {
    const k = `${clave}|${reflejo}|${nitidez}`;
    if (!metales.has(k)) {
      const color = PALETA[clave] ?? clave;
      const m = crearMaterialToon({ color, bandas: 3, reflejo, nitidez, colorReflejo: color });
      m.userData.trazo = color; metales.set(k, m);
    }
    return metales.get(k);
  };
  // Loza vidriada / mármol pulido / cuero: color propio con un reflejo más tenue y blanco.
  const esmalte = (clave, reflejo = .22, nitidez = 3) => {
    const k = `esmalte|${clave}|${reflejo}`;
    if (!metales.has(k)) {
      const color = PALETA[clave] ?? clave;
      const m = crearMaterialToon({ color, bandas: 3, reflejo, nitidez });
      m.userData.trazo = color; metales.set(k, m);
    }
    return metales.get(k);
  };
  // Emisivo: bombillas, llamas, pantallas encendidas.  No se relumbra.
  const emisivos = new Map();
  const emisivo = color => {
    if (!emisivos.has(color)) { const m = new T.MeshBasicMaterial({ color }); m.userData.sinTrazo = true; emisivos.set(color, m); }
    return emisivos.get(color);
  };
  // Pantalla de tela encendida: se ve iluminada desde dentro, con trazo propio.
  const pantalla = new T.MeshBasicMaterial({ color: '#ffe7bf', side: T.DoubleSide });
  pantalla.userData.trazo = '#c79a55';
  const trazos = new Map();
  const trazo = (color, nivel = 'medio') => {
    const k = `${color}|${nivel}`;
    if (!trazos.has(k)) trazos.set(k, crearMaterialContorno(color, nivel));
    return trazos.get(k);
  };
  return { geo, mat, metal, esmalte, emisivo, trazo, pantalla, PALETA };
}

// Nivel del trazo por tamaño: mobiliario «medio», arquitectura grande «fino»;
// piezas diminutas o planas y muros enteros sin trazo (ESTILO.md §3).
export function nivelContorno(w, h, d) {
  const min = Math.min(w, h, d), max = Math.max(w, h, d);
  if (min < .012 || max >= 7) return null;
  if (max < .06) return null;
  return max >= 2.6 ? 'fino' : 'medio';
}

/** Lote: acumula piezas (geometría × material) con una pila de transformaciones
 *  y las instancia al final — un draw call por pareja, más uno de contorno.
 *  Cada instancia puede llevar un nombre (se muestra al pulsarla). */
export function crearLote(kit) {
  const grupos = new Map();
  const pila = [new T.Matrix4()];
  const p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
  const sombras = [];
  const lote = {
    /** Ejecuta `fn` en un marco local (posición + giro en Y). */
    en(x, y, z, ry, fn) {
      const m = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), s.set(1, 1, 1));
      pila.push(pila.at(-1).clone().multiply(m));
      try { fn(); } finally { pila.pop(); }
    },
    /** Marco local con escala uniforme (para objetos modelados a otra medida). */
    escalado(k, fn) {
      pila.push(pila.at(-1).clone().multiply(new T.Matrix4().makeScale(k, k, k)));
      try { fn(); } finally { pila.pop(); }
    },
    pieza(geometria, material, x, y, z, sx, sy, sz, o = {}) {
      const m = kit.mat(material);
      e.set(o.rx || 0, o.ry || 0, o.rz || 0);
      const matriz = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e), s.set(sx, sy, sz)).premultiply(pila.at(-1));
      const k = `${geometria.uuid}|${m.uuid}`;
      if (!grupos.has(k)) grupos.set(k, { geometria, material: m, items: [] });
      // tamaño en el mundo para decidir el trazo
      const ws = new T.Vector3(); matriz.decompose(new T.Vector3(), new T.Quaternion(), ws);
      const sinTrazo = o.contorno === false || m.userData.sinTrazo || m.transparent;
      const nivel = sinTrazo ? null : (typeof o.contorno === 'string' ? o.contorno : nivelContorno(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)));
      grupos.get(k).items.push({ matriz, nivel, nombre: o.nombre || null, trazo: o.trazo || m.userData.trazo || '#888888' });
      return lote;
    },
    caja(material, x, y, z, w, h, d, o) { return lote.pieza(kit.geo.caja, material, x, y, z, w, h, d, o); },
    cil(material, x, y, z, diam, h, o = {}) {
      const g = o.lados === 24 ? kit.geo.cil24 : o.lados === 8 ? kit.geo.cil8 : kit.geo.cil16;
      return lote.pieza(g, material, x, y, z, o.diamZ ? diam : diam, h, o.diamZ || diam, o);
    },
    esfera(material, x, y, z, dx, dy = dx, dz = dx, o) { return lote.pieza(kit.geo.esfera, material, x, y, z, dx, dy, dz, o); },
    /** Sombra de contacto (mancha multiplicada bajo un mueble), en coordenadas locales. */
    sombra(x, z, w, d, fuerza = 1, y = .004) {
      const matriz = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(-Math.PI / 2, 0, 0)), s.set(w, d, 1)).premultiply(pila.at(-1));
      sombras.push({ matriz, fuerza });
      return lote;
    },
    /** Crea las mallas instanciadas en `grupo`; devuelve las pulsables. */
    construir(grupo, pulsables = []) {
      const pos = new T.Vector3(), rot = new T.Quaternion(), esc = new T.Vector3();
      for (const { geometria, material, items } of grupos.values()) {
        const mesh = new T.InstancedMesh(geometria, material, items.length);
        items.forEach((it, i) => mesh.setMatrixAt(i, it.matriz));
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
        if (items.some(it => it.nombre)) { mesh.userData.nombres = items.map(it => it.nombre); pulsables.push(mesh); }
        if (material.transparent) mesh.renderOrder = 3;
        grupo.add(mesh);
        // Contorno: una malla instanciada por color de trazo, nivel por instancia.
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

// Manchas de contacto: blanco fuera, tono frío dentro, fundidas por MULTIPLICAR
// (la sombra tiñe el suelo hacia el frío del ambiente, nunca hacia el negro).
let texturaSombra = null;
function mallaSombras(kit, lista) {
  texturaSombra ??= lienzo(128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#a99cb8'); g.addColorStop(.45, '#c6bccf'); g.addColorStop(1, '#ffffff');
    c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); c.fill();
  });
  const material = new T.MeshBasicMaterial({ map: texturaSombra, blending: T.MultiplyBlending, transparent: true, premultipliedAlpha: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.userData.sinTrazo = true;
  const mesh = new T.InstancedMesh(kit.geo.plano, material, lista.length);
  lista.forEach((it, i) => mesh.setMatrixAt(i, it.matriz));
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.renderOrder = 1; mesh.raycast = () => {}; mesh.name = 'sombras';
  return mesh;
}

/** Plano ilustrado (cuadro, cartel, pizarra): sin relighting, teñido por el ambiente. */
export function ilustracion(ancho, alto, pxAncho, dibujar, tipo = 'cartel') {
  const map = lienzo(pxAncho, Math.round(pxAncho * alto / ancho), dibujar);
  const material = new T.MeshBasicMaterial({ map });
  luz.tintar(material, tipo);
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, alto), material);
  return mesh;
}

/** Material toon texturizado en metros del mundo (paredes, suelos). */
export function materialSuperficie({ map, normal = null, metros = 1, metrosNormal = metros, color = '#ffffff', fuerzaNormal = .8, bandas = 2, reflejo = 0, nitidez = 3 }) {
  return crearMaterialToon({ albedo: map, normal, color, mundo: true, repetir: [1 / metros, 1 / metros], repetirNormal: [1 / metrosNormal, 1 / metrosNormal],
    fuerzaNormal, bandas, reflejo, nitidez });
}
