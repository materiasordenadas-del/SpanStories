import * as T from './three.js';
import { luz } from './Luz25D.js';
import { PALETA, ilustracion } from './Kit.js';
import { PRODUCTOS } from './Surtido.js';
import { formatear, formatearPeso } from './Moneda.js';

/* Señalización de La Estrella (ilustraciones sin relighting, teñidas por el
   ambiente, ESTILO.md §3).  Los carteles con precio se registran para
   repintarse al cambiar de moneda. */

const FUENTE = 'system-ui, "Segoe UI", sans-serif';
export const nombreCorto = id => {
  const n = PRODUCTOS[id]?.nombre ?? id;
  const s = n.replace(/^(el|la|los|las|un|una) /, '');
  return s[0].toUpperCase() + s.slice(1);
};
export const precioDe = (id, moneda) => {
  const p = PRODUCTOS[id];
  return p.libra ? formatearPeso(p.libra, moneda) : formatear(p.cop, moneda);
};

// Texto que se encoge hasta caber en `ancho`.
function texto(c, t, x, y, ancho, px, peso = 'bold') {
  let s = px;
  do { c.font = `${peso} ${s}px ${FUENTE}`; s -= 1; } while (c.measureText(t).width > ancho && s > 6);
  c.fillText(t, x, y);
}

export function estrella(c, x, y, R, color) {
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? R * .45 : R, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); c.fill();
}

/** Aviso con un precio fijo en COP (bolsa, etc.): se repinta con la moneda. */
export function avisoPrecio(txt, cop, { ancho = .34, alto = .2 } = {}) {
  const m = ilustracion(ancho, alto, 320, () => {}, 'cartel', { doble: true });
  m.userData.pintar = mon => m.userData.redibujar((c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(0, 0, w, h, 14); c.fill();
    c.fillStyle = '#2a2c2f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    texto(c, txt, w / 2, h * .32, w * .9, h * .26, '700');
    c.fillStyle = PALETA.rojoOscuro; texto(c, formatear(cop, mon), w / 2, h * .7, w * .9, h * .4, '900');
  });
  m.userData.nombre = `${txt}: `; m.userData.cop = cop;
  return m;
}

/* ── Atlas de etiquetas de precio: una malla, una textura para todas ───── */
const CW = 240, CH = 100, COLS = 8;
export function crearEtiquetas(grupo, lista, moneda) {
  const ids = [...new Set(lista.map(e => e.id))];
  const celda = new Map(ids.map((id, i) => [id, i]));
  const filas = Math.max(1, Math.ceil(ids.length / COLS));
  const canvas = document.createElement('canvas'); canvas.width = CW * COLS; canvas.height = CH * filas;
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace; map.anisotropy = 8;
  map.minFilter = T.LinearMipmapLinearFilter;
  function pintar(mon) {
    const c = canvas.getContext('2d');
    ids.forEach((id, i) => {
      const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH, fruta = !!PRODUCTOS[id].libra;
      c.fillStyle = fruta ? '#fbe7a1' : '#ffffff'; c.fillRect(x, y, CW, CH);
      c.fillStyle = PALETA.rojo; c.fillRect(x, y, CW, 8);
      c.fillStyle = '#2a2c2f'; c.textAlign = 'left'; c.textBaseline = 'middle';
      texto(c, nombreCorto(id), x + 10, y + 30, CW - 20, 26, '600');
      c.fillStyle = PALETA.rojoOscuro;
      texto(c, precioDe(id, mon), x + 10, y + 70, CW - 20, 42, '900');
      c.strokeStyle = '#c8ccd0'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, CW - 2, CH - 2);
    });
    map.needsUpdate = true;
  }
  pintar(moneda);
  // Geometría: un quad por etiqueta en el marco de su estante
  const pos = [], uv = [], idx = [], v = new T.Vector3();
  lista.forEach((e, k) => {
    const i = celda.get(e.id), u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS;
    const v1 = 1 - Math.floor(i / COLS) / filas, v0 = v1 - 1 / filas;
    const w = e.fruta ? .2 : .12, h = w * CH / CW;
    const oy = e.fruta ? .16 : 0;
    for (const [x, y, uu, vv] of [[-w / 2, -h / 2, u0, v0], [w / 2, -h / 2, u1, v0], [w / 2, h / 2, u1, v1], [-w / 2, h / 2, u0, v1]]) {
      v.set(x, y + oy, 0).applyMatrix4(e.matriz); pos.push(v.x, v.y, v.z); uv.push(uu, vv);
    }
    idx.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
  });
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new T.MeshBasicMaterial({ map, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  mat.userData.sinTrazo = true; luz.tintar(mat, 'cartel');
  const mesh = new T.Mesh(geo, mat); mesh.name = 'etiquetas-precio';
  mesh.userData.nombre = 'la etiqueta del precio';
  grupo.add(mesh);
  return { mesh, repintar: pintar, total: lista.length };
}

/* ── Carteles ─────────────────────────────────────────────────────────── */

/** Cartel colgante de pasillo (dos caras): número y sección. */
export function cartelPasillo(n, [a, b]) {
  return ilustracion(1.5, .56, 768, (c, w, h) => {
    c.fillStyle = PALETA.rojo; c.beginPath(); c.roundRect(0, 0, w, h, 26); c.fill();
    c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(h * .5, h * .5, h * .34, 0, Math.PI * 2); c.fill();
    c.fillStyle = PALETA.rojo; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${h * .42}px ${FUENTE}`; c.fillText(String(n), h * .5, h * .53);
    c.fillStyle = '#fffaf0'; c.textAlign = 'left';
    texto(c, a, h * .98, b ? h * .36 : h * .52, w - h * 1.1, h * .34, '900');
    if (b) { c.fillStyle = PALETA.amarilloClaro; texto(c, b, h * .98, h * .72, w - h * 1.1, h * .24, '700'); }
    c.fillStyle = PALETA.amarillo; c.font = `bold ${h * .12}px ${FUENTE}`; c.textAlign = 'right'; c.fillText(`PASILLO ${n}`, w - 22, h * .14);
  }, 'cartel', { doble: true });
}

/** Rótulo de pared (una cara): franja amarilla con texto oscuro y estrella. */
export function cartelPared(txt, ancho = 3, alto = .42) {
  return ilustracion(ancho, alto, 1024, (c, w, h) => {
    c.fillStyle = PALETA.amarillo; c.beginPath(); c.roundRect(0, 0, w, h, h * .3); c.fill();
    estrella(c, h * .55, h * .5, h * .3, PALETA.rojo);
    c.fillStyle = '#3a2a1a'; c.textAlign = 'left'; c.textBaseline = 'middle';
    texto(c, txt, h * 1.05, h * .54, w - h * 1.3, h * .55, '900');
  });
}

/** Panel de cabecera del refrigerador (luminoso, azul). */
export function cartelFrio(txt, ancho) {
  return ilustracion(ancho, .22, 1024, (c, w, h) => {
    c.fillStyle = '#1f5f9c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#eaf6ff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    texto(c, `❄  ${txt}  ❄`, w / 2, h * .55, w * .9, h * .62, '900');
  });
}

/** Cartel de oferta (estallido amarillo) con producto y precio: se repinta con la moneda. */
export function cartelOferta(id, oferta, ancho = .8, alto = .5, doble = false) {
  const m = ilustracion(ancho, alto, 512, () => {}, 'cartel', { doble });
  m.userData.pintar = mon => m.userData.redibujar((c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = PALETA.amarillo; c.beginPath(); c.roundRect(0, 0, w, h, 22); c.fill();
    c.fillStyle = PALETA.rojo; c.fillRect(0, 0, w, h * .3);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    texto(c, '¡OFERTA!', w / 2, h * .16, w * .9, h * .22, '900');
    c.fillStyle = PALETA.rojoOscuro; texto(c, oferta, w / 2, h * .47, w * .9, h * .24, '900');
    c.fillStyle = '#2a2c2f'; texto(c, nombreCorto(id), w / 2, h * .68, w * .9, h * .12, '700');
    c.fillStyle = PALETA.rojoOscuro; texto(c, precioDe(id, mon), w / 2, h * .85, w * .9, h * .16, '900');
  });
  m.userData.nombre = `la oferta: ${oferta} en ${PRODUCTOS[id].nombre}`;
  return m;
}

/** Cartel grande de la isla o del escaparate: título, subtítulo y tres precios. */
export function cartelLista(titulo, sub, ids, ancho = .9, alto = .6, doble = false) {
  const m = ilustracion(ancho, alto, 640, () => {}, 'cartel', { doble });
  m.userData.pintar = mon => m.userData.redibujar((c, w, h) => {
    c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, h);
    c.fillStyle = PALETA.rojo; c.fillRect(0, 0, w, h * .3);
    estrella(c, h * .15, h * .15, h * .1, PALETA.amarillo);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    texto(c, titulo, h * .3, h * .12, w - h * .4, h * .15, '900');
    c.fillStyle = PALETA.amarilloClaro; texto(c, sub, h * .3, h * .23, w - h * .4, h * .08, '700');
    ids.slice(0, 3).forEach((id, i) => {
      const y = h * (.42 + i * .2);
      c.fillStyle = '#2a2c2f'; c.textAlign = 'left'; texto(c, nombreCorto(id), w * .06, y, w * .5, h * .09, '700');
      c.fillStyle = PALETA.rojoOscuro; c.textAlign = 'right'; texto(c, precioDe(id, mon), w * .94, y, w * .4, h * .11, '900');
      c.fillStyle = '#e3dccb'; c.fillRect(w * .06, y + h * .08, w * .88, 2);
    });
  });
  m.userData.nombre = `el cartel «${titulo}»`;
  return m;
}

/** Aviso sencillo de una línea (colores a elegir). */
export function aviso(txt, { ancho = .9, alto = .26, fondo = '#ffffff', tinta = '#2a2c2f', doble = false, sub = '' } = {}) {
  const m = ilustracion(ancho, alto, 512, (c, w, h) => {
    c.fillStyle = fondo; c.beginPath(); c.roundRect(0, 0, w, h, h * .16); c.fill();
    c.fillStyle = tinta; c.textAlign = 'center'; c.textBaseline = 'middle';
    texto(c, txt, w / 2, sub ? h * .38 : h * .54, w * .9, sub ? h * .42 : h * .6, '900');
    if (sub) texto(c, sub, w / 2, h * .76, w * .9, h * .22, '600');
  }, 'cartel', { doble });
  m.userData.nombre = `el aviso «${txt}»`;
  return m;
}

/** Salida de emergencia verde con flecha y persona. */
export function cartelSalida(flecha = '←') {
  const m = ilustracion(.7, .26, 512, (c, w, h) => {
    c.fillStyle = '#1f8a4c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.font = `900 ${h * .6}px ${FUENTE}`; c.fillText(flecha, h * .45, h * .52);
    texto(c, 'SALIDA', w * .58, h * .54, w * .6, h * .56, '900');
  }, 'cartel', { doble: true });
  m.userData.nombre = 'el letrero de salida';
  return m;
}

/** Pone un cartel (pulsable) en el mundo; `ry` en radianes. */
export function colocar(ctx, m, x, y, z, ry = 0) {
  m.position.set(x, y, z); m.rotation.y = ry; ctx.grupo.add(m); ctx.pulsables.push(m);
  if (!m.userData.nombre) m.userData.nombre = 'un cartel';
  return m;
}
