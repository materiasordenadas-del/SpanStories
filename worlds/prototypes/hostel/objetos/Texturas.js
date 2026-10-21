import * as T from '../engine/three.js';
import { crearMaterialToon, normalDesdeAltura } from '../engine/Luz25D.js';
import { COLORS as C } from '../engine/dimensions.js';

// Texturas pintadas en lienzo: SOLO albedo neutro (sin luz, sin sombras); el relieve de juntas va
// en un normal map sacado de un mapa de alturas (blanco = pieza, negro = junta). Cada textura
// declara cuántos metros cubre (`metros`): los suelos usan UV en metros del mundo, así un único
// material sirve para todos los tramos sin costuras.
const cache = new Map();
function lienzo(px, dibujar) { const c = document.createElement('canvas'); c.width = c.height = px; dibujar(c.getContext('2d'), px); return c; }
function textura(c) { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4; return t; }
let semilla = 11; const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
function variar(hex, k) { const c = new T.Color(hex); c.offsetHSL(0, 0, (azar() - .5) * k); return '#' + c.getHexString(); }

const DEF = {
  // Baldosa hidráulica (interiores PB): motor de 20 cm, flor de cuatro pétalos. 4 × 4 piezas por lienzo.
  hidraulica: { metros: .8, px: 512, juntas: 4, dibujar(g, n) {
    const s = n / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const x = i * s, y = j * s;
      g.fillStyle = '#efe6d2'; g.fillRect(x, y, s, s);
      g.fillStyle = '#2f6f6c'; for (const [cx, cy] of [[0, 0], [s, 0], [0, s], [s, s]]) { g.beginPath(); g.arc(x + cx, y + cy, s * .32, 0, 7); g.fill(); }
      g.fillStyle = '#c4643f'; for (let k = 0; k < 4; k++) { g.save(); g.translate(x + s / 2, y + s / 2); g.rotate(k * Math.PI / 2); g.beginPath(); g.ellipse(0, -s * .2, s * .09, s * .19, 0, 0, 7); g.fill(); g.restore(); }
      g.fillStyle = '#e5b44f'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * .08, 0, 7); g.fill();
    } } },
  // Baldosa de barro de 30 cm (galerías, patio, azotea), tono variado pieza a pieza.
  barro: { metros: 1.2, px: 512, juntas: 4, dibujar(g, n) { const s = n / 4; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = variar(C.barro, .07); g.fillRect(i * s, j * s, s, s); } } },
  // Entablado de madera (galería alta y dormitorio): tablas de 15 cm con juntas a tope desfasadas.
  tablas: { metros: 1.2, px: 512, juntas: 0, dibujar(g, n, h) { const s = n / 8;
    for (let i = 0; i < 8; i++) { const off = (i % 2) * n / 2; for (const y0 of [off - n, off]) { g.fillStyle = variar('#b98557', .06); g.fillRect(i * s, y0, s, n); }
      h.fillStyle = '#000'; h.fillRect(i * s, 0, 2, n); h.fillRect(i * s, off % n, s, 2); } } },
  // Laja de piedra (patio delantero): piezas irregulares en hiladas.
  laja: { metros: 2, px: 512, juntas: 0, dibujar(g, n, h) { let y = 0;
    while (y < n) { const fila = 50 + azar() * 40; let x = -azar() * 60; while (x < n) { const w = 60 + azar() * 90; g.fillStyle = variar(C.laja, .08); g.fillRect(x, y, w, fila); h.fillStyle = '#000'; h.fillRect(x, y, 3, fila); h.fillRect(x, y, w, 3); x += w; } y += fila; }
    h.fillRect(0, n - 3, n, 3); } },
  // Acera de cemento con juntas cada 1 m.
  acera: { metros: 2, px: 256, juntas: 2, dibujar(g, n) { g.fillStyle = C.acera; g.fillRect(0, 0, n, n); for (let k = 0; k < 160; k++) { g.fillStyle = variar(C.acera, .05); g.fillRect(azar() * n, azar() * n, 3, 3); } } },
  // Asfalto de la calle (sin coches: calle peatonal tranquila).
  asfalto: { metros: 4, px: 256, juntas: 0, dibujar(g, n) { g.fillStyle = C.asfalto; g.fillRect(0, 0, n, n); for (let k = 0; k < 500; k++) { g.fillStyle = variar(C.asfalto, .12); g.fillRect(azar() * n, azar() * n, 2, 2); } } },
  // Azulejo de piscina de 10 cm.
  azulejo: { metros: .8, px: 256, juntas: 8, dibujar(g, n) { const s = n / 8; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = variar(C.azulejo, .04); g.fillRect(i * s, j * s, s, s); } } },
  // Agua: base turquesa con líneas claras de cáustica (ilustración plana).
  agua: { metros: 2.4, px: 256, juntas: 0, dibujar(g, n) { g.fillStyle = C.agua; g.fillRect(0, 0, n, n); g.strokeStyle = C.aguaClara; g.lineWidth = 3;
    for (let k = 0; k < 9; k++) { g.beginPath(); const y = k * n / 9 + 8; g.moveTo(0, y); for (let x = 0; x <= n; x += 16) g.lineTo(x, y + Math.sin(x / n * Math.PI * 4 + k) * 6); g.stroke(); } } },
  // Caña brava bajo la teja (cielo de la galería alta): cañas paralelas.
  cana: { metros: 1, px: 256, juntas: 0, dibujar(g, n, h) { const s = n / 24; for (let i = 0; i < 24; i++) { g.fillStyle = variar('#d2b483', .08); g.fillRect(i * s, 0, s, n); h.fillStyle = '#000'; h.fillRect(i * s, 0, 1.5, n); } } },
  // Teja de barro en canales.
  teja: { metros: 1.2, px: 256, juntas: 0, dibujar(g, n, h) { const s = n / 8;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c27453' : '#a95d42'; g.fillRect(i * s, 0, s, n); h.fillStyle = i % 2 ? '#fff' : '#777'; h.fillRect(i * s, 0, s, n); }
    for (let j = 0; j < 4; j++) { g.fillStyle = '#8c4a35'; g.fillRect(0, j * n / 4, n, 3); h.fillStyle = '#000'; h.fillRect(0, j * n / 4, n, 3); } } },
};

/** Material toon con albedo + relieve de una textura con nombre (compartido). */
export function materialTextura(nombre, { bandas = 2, doble = false } = {}) {
  const key = nombre + bandas + doble;
  if (cache.has(key)) return cache.get(key);
  const d = DEF[nombre], alt = lienzo(d.px, (g, n) => { g.fillStyle = '#fff'; g.fillRect(0, 0, n, n); });
  const hg = alt.getContext('2d');
  const color = lienzo(d.px, (g, n) => d.dibujar(g, n, hg));
  if (d.juntas) { const s = d.px / d.juntas; hg.fillStyle = '#000'; for (let i = 0; i < d.juntas; i++) { hg.fillRect(i * s, 0, 3, d.px); hg.fillRect(0, i * s, d.px, 3); }
    const g = color.getContext('2d'); g.fillStyle = '#00000022'; for (let i = 0; i < d.juntas; i++) { g.fillRect(i * s, 0, 3, d.px); g.fillRect(0, i * s, d.px, 3); } }
  const m = crearMaterialToon({ albedo: textura(color), normal: normalDesdeAltura(alt, { fuerza: 1.6, suavizado: .8, repetir: true }), fuerzaNormal: .8, bandas, doble });
  m.userData.metros = d.metros; cache.set(key, m); return m;
}

/** Plano horizontal (cara arriba) de un rectángulo del mundo, con UV en metros/`metros`. */
export function planoSuelo({ x0, z0, x1, z1 }, y, material, abajo = false) {
  const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(abajo ? Math.PI / 2 : -Math.PI / 2);
  const m = material.userData.metros || 1, p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) / m, -(p.getZ(i) + (z0 + z1) / 2) / m);
  const mesh = new T.Mesh(g, material); mesh.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); mesh.name = 'suelo'; return mesh;
}
/** UV en metros para una geometría ya colocada (paredes de la piscina, tejadillo…). */
export function uvMetros(geometry, metros, ejes = 'xz') {
  const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setXY(i, p['get' + ejes[0].toUpperCase()](i) / metros, p['get' + ejes[1].toUpperCase()](i) / metros);
  return geometry;
}
