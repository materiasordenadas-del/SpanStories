import * as T from '../engine/three.js';
import { luz, crearMaterialToon } from '../engine/Luz25D.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Ciudad simulada detrás del muro de calle (ESTILO §1: lejos = 2D plano, sin relighting, teñido).
// · Casas vecinas: volumen sencillo + fachada pintada (están cerca, reciben la luz).
// · Fachadas de enfrente: un plano pintado al otro lado de la calle.
// · Horizonte: anillo pintado con tejados, cúpula y la Sierra Nevada; el cielo es el fondo de la escena.
const PALETA = ['#e9a7a0', '#9fcfc6', '#f2d27c', '#b9c9e8', '#f1b98a', '#c8e0a8', '#e7c3e0', '#f4e3b8'];
let semilla = 3; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;

/** Pinta una fachada colonial de dos plantas en (x0..x0+w) del lienzo. */
function pintarCasa(g, x0, w, H, alto, color, { puertas = 1 } = {}) {
  const y0 = H - alto; g.fillStyle = color; g.fillRect(x0, y0, w, alto);
  g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x0, H - alto * .09, w, alto * .09);              // zócalo
  g.fillStyle = '#fbf3e3'; g.fillRect(x0, y0, w, alto * .045); g.fillRect(x0, y0 + alto * .5, w, alto * .025);   // cornisa e imposta
  const vanos = Math.max(2, Math.round(w / (alto * .32)));
  for (let i = 0; i < vanos; i++) {
    const cx = x0 + (i + .5) * w / vanos, vw = Math.min(w / vanos * .5, alto * .14);
    // Planta alta: balconera con postigos verdes y balcón de madera.
    g.fillStyle = '#2f7a5f'; g.fillRect(cx - vw * .9, y0 + alto * .14, vw * .45, alto * .26); g.fillRect(cx + vw * .45, y0 + alto * .14, vw * .45, alto * .26);
    g.fillStyle = '#3d5560'; g.fillRect(cx - vw / 2, y0 + alto * .14, vw, alto * .26);
    if (i % 2 === 0) { g.fillStyle = '#6a4a35'; g.fillRect(cx - vw * .8, y0 + alto * .36, vw * 1.6, alto * .025); for (let k = 0; k <= 6; k++) g.fillRect(cx - vw * .8 + k * vw * 1.6 / 6, y0 + alto * .3, 3, alto * .06); }
    // Planta baja: ventana con reja o puerta.
    const puerta = i === Math.floor(vanos / 2) && puertas;
    g.fillStyle = puerta ? '#6a4a35' : '#3d5560';
    if (puerta) g.fillRect(cx - vw * .6, y0 + alto * .66, vw * 1.2, alto * .34 - alto * .09 + alto * .09);
    else { g.fillRect(cx - vw / 2, y0 + alto * .62, vw, alto * .22); g.fillStyle = '#5e4231'; for (let k = 0; k <= 5; k++) g.fillRect(cx - vw / 2 + k * vw / 5 - 1, y0 + alto * .62, 3, alto * .22); }
  }
}
function texturaLienzo(c) { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }

/** Casas vecinas a ambos lados, alineadas con el muro de calle (fachada en zFrente). */
export function crearVecinos({ zFrente, zFondo, xDesde, ancho, alto, n }) {
  const r = new T.Group();
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
    const h = alto * (.92 + azar() * .16), color = PALETA[(i * 3 + (s > 0 ? 1 : 4)) % PALETA.length], x0 = xDesde + i * ancho, cx = s * (x0 + ancho / 2), fondo = zFrente - zFondo;
    caja(r, 'casa', ancho, h, fondo, color, cx, h / 2, zFrente - fondo / 2, false);
    caja(r, 'pretil', ancho, .5, .3, '#fbf3e3', cx, h + .25, zFrente - .15, 'fino');
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / ancho); const g = c.getContext('2d');
    pintarCasa(g, 0, c.width, c.height, c.height, color, { puertas: 1 });
    const frente = new T.Mesh(new T.PlaneGeometry(ancho, h), crearMaterialToon({ albedo: texturaLienzo(c), bandas: 2 }));
    frente.position.set(cx, h / 2, zFrente + .01); frente.name = 'fachada-pintada'; r.add(frente);
  }
  return r;
}

/** Fachadas de enfrente: plano pintado de casas de colores, de cara a la casa (mira a −z). */
export function crearFachadasEnfrente({ z, ancho = 110, alto = 9 }) {
  const c = document.createElement('canvas'); c.width = 4096; c.height = Math.round(4096 * alto / ancho); const g = c.getContext('2d'), H = c.height;
  let x = 0, k = 0; while (x < c.width) { const w = 260 + azar() * 260, h = H * (.72 + azar() * .26); pintarCasa(g, x, w, H, h, PALETA[k++ % PALETA.length]); x += w; }
  const mat = new T.MeshBasicMaterial({ map: texturaLienzo(c), transparent: true, alphaTest: .5 }); luz.tintar(mat, 'fondo');
  const m = new T.Mesh(new T.PlaneGeometry(ancho, alto), mat); m.position.set(0, alto / 2, z); m.rotation.y = Math.PI; m.name = 'fachadas-de-enfrente';
  return m;
}

/** Horizonte en anillo (cara interior): tejados, cúpula, campanario y sierra. Sin cielo: transparente arriba. */
export function crearHorizonte({ radio = 140, alto = 48, centro = [0, -10] } = {}) {
  const W = 4096, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  // Sierra Nevada lejana (azul grisáceo) con nieve en las cumbres más altas.
  g.fillStyle = '#9fb3c8'; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 32) g.lineTo(x, H * .5 - Math.abs(Math.sin(x / 520)) * H * .22 - Math.sin(x / 140) * H * .03);
  g.lineTo(W, H); g.fill();
  g.fillStyle = '#eef3f6'; for (let x = 0; x < W; x += 32) { const y = H * .5 - Math.abs(Math.sin(x / 520)) * H * .22 - Math.sin(x / 140) * H * .03; if (y < H * .32) g.fillRect(x, y, 32, H * .035); }
  // Cerros verdes intermedios.
  g.fillStyle = '#9db88e'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 40) g.lineTo(x, H * .68 - Math.sin(x / 300 + 1) * H * .05); g.lineTo(W, H); g.fill();
  // Tejados y casas de la ciudad, con una iglesia (cúpula + campanario) cada cierto tramo.
  let x = 0; while (x < W) {
    const w = 60 + azar() * 110, h = H * (.1 + azar() * .1), y = H * .86 - h;
    g.fillStyle = PALETA[Math.floor(azar() * PALETA.length)]; g.fillRect(x, y, w, H - y);
    g.fillStyle = azar() < .6 ? '#b8633f' : '#f4ecdc'; g.fillRect(x - 3, y - 6, w + 6, 8);
    if (azar() < .07) { const cx = x + w / 2; g.fillStyle = '#f4ecdc'; g.fillRect(cx - 22, y - 120, 44, 120); g.fillStyle = '#d98b6a'; g.beginPath(); g.arc(cx, y - 120, 30, Math.PI, 0); g.fill(); g.fillStyle = '#f4ecdc'; g.fillRect(cx + 40, y - 170, 26, 170); g.fillStyle = '#b8633f'; g.beginPath(); g.moveTo(cx + 36, y - 170); g.lineTo(cx + 53, y - 205); g.lineTo(cx + 70, y - 170); g.fill(); }
    x += w;
  }
  const t = texturaLienzo(c); t.wrapS = T.RepeatWrapping;
  const mat = new T.MeshBasicMaterial({ map: t, transparent: true, alphaTest: .5, side: T.BackSide }); luz.tintar(mat, 'fondo');
  const m = new T.Mesh(new T.CylinderGeometry(radio, radio, alto, 64, 1, true), mat); m.position.set(centro[0], alto / 2 - 2, centro[1]); m.name = 'horizonte';
  m.raycast = () => {}; return m;
}
