import * as T from '../three.js';
import { luz } from '../Luz25D.js';
import { lienzo } from '../Kit.js';

/* ── Rótulos, carteles y viniles ──────────────────────────────────────────
   Ilustraciones planas sin relighting (ESTILO.md §3): se tiñen con el
   ambiente (`luz.tintar`).  El contorno, cuando lo llevan, va dibujado en
   el propio canvas.  Nombres genéricos: la farmacia es «Farmacia del Barrio». */

const FUENTE = '"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';
export const VERDE = '#1f8a5b', VERDE_OSC = '#136845', MENTA = '#d9efe2';

export function texto(c, t, x, y, px, color, { peso = 800, alinear = 'center', max = 1e5, base = 'middle', fuente = FUENTE } = {}) {
  c.font = `${peso} ${px}px ${fuente}`; c.fillStyle = color; c.textAlign = alinear; c.textBaseline = base;
  c.fillText(t, x, y, max);
}
export function cruz(c, x, y, lado, color, borde = null) {
  const b = lado / 3;
  c.beginPath();
  c.moveTo(x - b / 2, y - lado / 2); c.lineTo(x + b / 2, y - lado / 2); c.lineTo(x + b / 2, y - b / 2); c.lineTo(x + lado / 2, y - b / 2);
  c.lineTo(x + lado / 2, y + b / 2); c.lineTo(x + b / 2, y + b / 2); c.lineTo(x + b / 2, y + lado / 2); c.lineTo(x - b / 2, y + lado / 2);
  c.lineTo(x - b / 2, y + b / 2); c.lineTo(x - lado / 2, y + b / 2); c.lineTo(x - lado / 2, y - b / 2); c.lineTo(x - b / 2, y - b / 2);
  c.closePath();
  if (borde) { c.lineWidth = lado * .08; c.strokeStyle = borde; c.lineJoin = 'round'; c.stroke(); }
  c.fillStyle = color; c.fill();
}

/** Plano ilustrado.  `transparente`: recorte por alfa (viniles, letras sueltas).
 *  `doble`: dos caras (carteles colgantes). */
export function cartel(ancho, alto, pxAncho, dibujar, { tipo = 'cartel', transparente = false, doble = false, nombre = null } = {}) {
  const map = lienzo(pxAncho, Math.round(pxAncho * alto / ancho), dibujar);
  const material = new T.MeshBasicMaterial({ map, transparent: transparente, alphaTest: transparente ? .02 : 0,
    side: doble ? T.DoubleSide : T.FrontSide, depthWrite: !transparente });
  material.userData.sinTrazo = true;
  luz.tintar(material, tipo);
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, alto), material);
  if (transparente) mesh.renderOrder = 4;
  if (nombre) mesh.userData.nombre = nombre;
  return mesh;
}

/* ── Fachada ──────────────────────────────────────────────────────────── */

// Caja de luz del letrero principal: cara blanca, marco verde, cruz y nombre.
export function letreroPrincipal(ancho, alto) {
  return cartel(ancho, alto, 2048, (c, w, h) => {
    c.fillStyle = '#fbfcfa'; c.fillRect(0, 0, w, h);
    c.fillStyle = VERDE; c.fillRect(0, 0, w, h * .1); c.fillRect(0, h * .9, w, h * .1);
    c.fillStyle = MENTA; c.fillRect(0, h * .1, w, h * .03); c.fillRect(0, h * .87, w, h * .03);
    // logotipo: cruz verde en un círculo
    const cx = h * .62, cy = h / 2;
    c.fillStyle = VERDE; c.beginPath(); c.arc(cx, cy, h * .34, 0, Math.PI * 2); c.fill();
    cruz(c, cx, cy, h * .42, '#ffffff');
    texto(c, 'FARMACIA', w * .5 + h * .2, h * .44, h * .44, VERDE, { peso: 900, max: w * .62 });
    texto(c, 'del Barrio', w * .5 + h * .2, h * .74, h * .2, '#2f6f55', { peso: 700, fuente: '"Segoe Script", "Brush Script MT", cursive' });
    // a la derecha: servicios
    const sx = w - h * .95;
    c.fillStyle = VERDE; c.beginPath(); c.roundRect(sx - h * .55, h * .2, h * 1.1, h * .6, h * .1); c.fill();
    texto(c, 'GENÉRICOS', sx, h * .35, h * .12, '#ffffff', { peso: 900 });
    texto(c, 'Y PATENTE', sx, h * .5, h * .12, '#ffffff', { peso: 900 });
    texto(c, 'CONSULTORIO', sx, h * .66, h * .1, '#fff3b0', { peso: 800 });
  }, { nombre: 'Letrero · Farmacia del Barrio' });
}

// Cruz verde de bandera (caja de luz a dos caras).
export function caraBandera(lado) {
  return cartel(lado, lado, 512, (c, w, h) => {
    c.fillStyle = '#f7faf8'; c.fillRect(0, 0, w, h);
    c.strokeStyle = VERDE; c.lineWidth = w * .05; c.strokeRect(w * .025, h * .025, w * .95, h * .95);
    cruz(c, w / 2, h / 2, w * .7, VERDE, VERDE_OSC);
    c.fillStyle = 'rgba(255,255,255,.35)';                 // rejilla de LED
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) c.fillRect(w * (.14 + i * .045), h * (.14 + j * .045), 3, 3);
  }, { tipo: 'cartel', nombre: 'Cruz verde luminosa' });
}

// Vinil del aparador: banda esmerilada abajo con servicios y cintillo de ofertas arriba.
export function vinilAparador(ancho, alto) {
  return cartel(ancho, alto, 2048, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.78)'; c.fillRect(0, h * .78, w, h * .22);
    c.fillStyle = VERDE; c.fillRect(0, h * .78, w, h * .015);
    const servicios = ['Genéricos', 'Patente', 'Perfumería', 'Botanas', 'Bebidas frías', 'Recargas'];
    c.font = `800 ${h * .05}px ${FUENTE}`;
    const anchos = servicios.map(s => c.measureText(s).width), cr = h * .055, sep = h * .03;
    const total = anchos.reduce((a, b) => a + b + cr + sep, 0), hueco = (w * .94 - total) / (servicios.length - 1);
    let x = w * .03;
    servicios.forEach((s, i) => {
      cruz(c, x + cr / 2, h * .89, cr, VERDE);
      texto(c, s, x + cr + sep, h * .89, h * .05, '#1c4f3a', { peso: 800, alinear: 'left' });
      x += cr + sep + anchos[i] + hueco;
    });
    // cintillo superior de oferta
    c.fillStyle = '#e8412f'; c.beginPath(); c.roundRect(w * .56, h * .05, w * .4, h * .15, h * .03); c.fill();
    texto(c, '2 × 1 en vitaminas', w * .76, h * .125, h * .075, '#ffffff', { peso: 900 });
    c.fillStyle = '#f4c430'; c.beginPath(); c.arc(w * .1, h * .17, h * .12, 0, Math.PI * 2); c.fill();
    texto(c, 'TOMA DE', w * .1, h * .13, h * .036, '#7a2c14', { peso: 900 });
    texto(c, 'PRESIÓN', w * .1, h * .17, h * .036, '#7a2c14', { peso: 900 });
    texto(c, 'GRATIS', w * .1, h * .215, h * .04, '#d2352c', { peso: 900 });
  }, { transparente: true, nombre: 'Vinil del aparador' });
}

// Viniles de la puerta: horario, abierto, empuje/jale.
export function vinilPuerta(ancho, alto, lado) {
  return cartel(ancho, alto, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    if (lado === 'izq') {
      c.fillStyle = 'rgba(255,255,255,.88)'; c.beginPath(); c.roundRect(w * .12, h * .3, w * .76, h * .2, 18); c.fill();
      texto(c, 'HORARIO', w / 2, h * .34, h * .03, VERDE, { peso: 900 });
      texto(c, 'Lun a Dom', w / 2, h * .39, h * .026, '#26323a', { peso: 700 });
      texto(c, '8:00 a 23:00', w / 2, h * .44, h * .032, '#26323a', { peso: 900 });
    } else {
      c.fillStyle = '#e8412f'; c.beginPath(); c.roundRect(w * .15, h * .32, w * .7, h * .09, 16); c.fill();
      texto(c, 'ABIERTO', w / 2, h * .365, h * .05, '#ffffff', { peso: 900 });
    }
    c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(0, h * .6, w, h * .012);
    texto(c, lado === 'izq' ? 'EMPUJE' : 'JALE', w / 2, h * .64, h * .026, 'rgba(255,255,255,.95)', { peso: 900 });
  }, { transparente: true, nombre: 'Vinil de la puerta' });
}

/* ── Interior ─────────────────────────────────────────────────────────── */

// Friso de categoría (sobre anaqueles y góndolas).
export function friso(ancho, alto, titulo, { color = VERDE, icono = true } = {}) {
  return cartel(ancho, alto, Math.round(360 * ancho / alto), (c, w, h) => {
    c.fillStyle = color; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(0, h * .82, w, h * .06);
    if (icono) cruz(c, h * .6, h * .45, h * .5, '#ffffff');
    texto(c, titulo, w / 2 + (icono ? h * .3 : 0), h * .46, h * .46, '#ffffff', { peso: 900, max: w - h * 1.6 });
  }, { nombre: `Friso · ${titulo}` });
}

// Cartel colgante de pasillo (dos caras).
export function cartelPasillo(ancho, alto, titulo, sub, color = VERDE) {
  // dos láminas espalda con espalda: se lee derecho desde ambos lados
  const cara = () => cartel(ancho, alto, 1024, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(0, 0, w, h, h * .12); c.fill();
    c.fillStyle = color; c.beginPath(); c.roundRect(w * .02, h * .06, w * .96, h * .88, h * .1); c.fill();
    texto(c, titulo, w / 2, h * .42, h * .34, '#ffffff', { peso: 900, max: w * .9 });
    texto(c, sub, w / 2, h * .74, h * .18, '#e9fff3', { peso: 700, max: w * .9 });
  }, { nombre: `Pasillo · ${titulo}` });
  const g = new T.Group(), a = cara(), b = cara();
  b.rotation.y = Math.PI; a.position.z = .003; b.position.z = -.003;
  g.add(a, b); g.userData.nombre = `Pasillo · ${titulo}`;
  return g;
}

// Tira de precios (canto de entrepaño): blanca con etiquetas amarillas.
let tiraPrecios = null;
export function texturaPrecios() {
  tiraPrecios ??= lienzo(512, 32, (c, w, h) => {
    c.fillStyle = '#f7f7f4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d7d9d6'; c.fillRect(0, 0, w, 2); c.fillRect(0, h - 2, w, 2);
    const precios = ['$29', '$45', '$18', '$62', '$35', '$99', '$24', '$57'];
    for (let i = 0; i < 4; i++) {
      const x = i * 128 + 18;
      c.fillStyle = i % 3 === 1 ? '#ffe45c' : '#fff6c4'; c.fillRect(x, 5, 58, h - 10);
      c.fillStyle = '#e8412f'; c.fillRect(x, 5, 6, h - 10);
      texto(c, precios[(i * 3) % precios.length], x + 34, h / 2 + 1, 17, '#26323a', { peso: 900 });
    }
  }, { repetir: true });
  return tiraPrecios;
}

// Carteles de pared (salud pública, genéricos).
export function poster(ancho, alto, tipo) {
  return cartel(ancho, alto, 640, (c, w, h) => {
    const marco = (fondo) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = fondo; c.fillRect(w * .03, w * .03, w * .94, h - w * .06); };
    if (tipo === 'presion') {
      marco('#e6f4ff');
      texto(c, 'TOMA DE', w / 2, h * .12, w * .12, '#1f5fa8', { peso: 900 });
      texto(c, 'PRESIÓN', w / 2, h * .23, w * .15, '#1f5fa8', { peso: 900 });
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h * .5, w * .24, 0, Math.PI * 2); c.fill();
      c.lineWidth = w * .03; c.strokeStyle = '#1f5fa8'; c.stroke();
      c.strokeStyle = '#e8412f'; c.lineWidth = w * .02; c.beginPath(); c.moveTo(w / 2, h * .5); c.lineTo(w * .64, h * .42); c.stroke();
      for (let i = 0; i < 9; i++) { const a = Math.PI * (1.15 - i * .16); c.fillStyle = '#1f5fa8'; c.fillRect(w / 2 + Math.cos(a) * w * .19, h * .5 - Math.sin(a) * w * .19, 6, 6); }
      c.fillStyle = '#e8412f'; c.beginPath(); c.roundRect(w * .15, h * .78, w * .7, h * .12, 20); c.fill();
      texto(c, '¡GRATIS!', w / 2, h * .84, w * .1, '#ffffff', { peso: 900 });
    } else if (tipo === 'hidratate') {
      marco('#fff1e6');
      texto(c, 'HIDRÁTATE', w / 2, h * .13, w * .13, '#e8412f', { peso: 900 });
      for (const [x, col] of [[.3, '#e8415a'], [.5, '#2a7fd6'], [.7, '#7a3fb0']]) {
        c.fillStyle = col; c.beginPath(); c.roundRect(w * (x - .08), h * .3, w * .16, h * .42, 18); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(w * (x - .08), h * .45, w * .16, h * .1);
        c.fillStyle = '#26323a'; c.fillRect(w * (x - .04), h * .25, w * .08, h * .06);
      }
      texto(c, 'Suero oral en', w / 2, h * .8, w * .07, '#7a2c14', { peso: 700 });
      texto(c, 'todos los sabores', w / 2, h * .88, w * .07, '#7a2c14', { peso: 800 });
    } else if (tipo === 'vacuna') {
      marco('#e9f7ef');
      texto(c, 'CAMPAÑA DE', w / 2, h * .12, w * .09, VERDE, { peso: 800 });
      texto(c, 'VACUNACIÓN', w / 2, h * .22, w * .13, VERDE_OSC, { peso: 900 });
      c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(w * .2, h * .32, w * .6, h * .4, 30); c.fill();
      c.save(); c.translate(w / 2, h * .52); c.rotate(-.6);
      c.fillStyle = '#9ad0f0'; c.fillRect(-w * .2, -w * .05, w * .3, w * .1); c.fillStyle = '#5b6b78'; c.fillRect(w * .1, -w * .02, w * .14, w * .04);
      c.fillStyle = '#2f6fb7'; c.fillRect(-w * .26, -w * .07, w * .06, w * .14); c.restore();
      texto(c, 'Pregunta en el', w / 2, h * .8, w * .07, '#26323a', { peso: 700 });
      texto(c, 'mostrador', w / 2, h * .88, w * .08, '#26323a', { peso: 900 });
    } else if (tipo === 'genericos') {
      marco(VERDE);
      texto(c, 'MISMA', w / 2, h * .16, w * .14, '#ffffff', { peso: 900 });
      texto(c, 'SUSTANCIA', w / 2, h * .28, w * .12, '#ffffff', { peso: 900 });
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(w / 2, h * .52, w * .3, w * .16, 0, 0, Math.PI * 2); c.fill();
      texto(c, 'GI', w / 2, h * .525, w * .18, VERDE, { peso: 900 });
      texto(c, 'menor precio', w / 2, h * .76, w * .09, '#fff3b0', { peso: 800 });
      texto(c, 'Genéricos intercambiables', w / 2, h * .86, w * .055, '#e9fff3', { peso: 700 });
    }
  }, { nombre: `Cartel · ${tipo}` });
}

// Letrero de puerta (consultorio, bodega).
export function letreroPuerta(ancho, alto, titulo, sub, color = VERDE) {
  return cartel(ancho, alto, 512, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(0, 0, w, h, h * .12); c.fill();
    c.fillStyle = color; c.beginPath(); c.roundRect(w * .03, h * .06, w * .94, h * .88, h * .1); c.fill();
    cruz(c, h * .45, h / 2, h * .42, '#ffffff');
    texto(c, titulo, w / 2 + h * .2, h * .4, h * .26, '#ffffff', { peso: 900, max: w - h });
    texto(c, sub, w / 2 + h * .2, h * .7, h * .17, '#e9fff3', { peso: 700, max: w - h });
  }, { nombre: `Puerta · ${titulo}` });
}

// Pizarrón de caballete en la acera.
export function pizarron(ancho, alto) {
  return cartel(ancho, alto, 512, (c, w, h) => {
    c.fillStyle = '#8a5a32'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2d3a33'; c.fillRect(w * .07, w * .07, w * .86, h - w * .14);
    const tiza = (t, y, px, col = '#f4f1e6') => texto(c, t, w / 2, h * y, px, col, { peso: 700, fuente: '"Segoe Print", "Comic Sans MS", cursive' });
    tiza('Consulta', .16, 58); tiza('médica', .26, 58);
    tiza('$60', .42, 96, '#ffe45c');
    tiza('Toma de', .6, 40); tiza('presión', .68, 40); tiza('GRATIS', .78, 48, '#9fe0b8');
    cruz(c, w * .5, h * .9, 44, '#9fe0b8');
  }, { nombre: 'Pizarrón · Consulta médica' });
}

// Carátula de la báscula (moneda de 1 peso).
export function caratulaBascula(diam) {
  return cartel(diam, diam, 512, (c, w) => {
    c.clearRect(0, 0, w, w);
    c.fillStyle = '#fbfaf5'; c.beginPath(); c.arc(w / 2, w / 2, w * .49, 0, Math.PI * 2); c.fill();
    c.lineWidth = w * .04; c.strokeStyle = '#c8322a'; c.stroke();
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI * (1.25 - i * 1.5 / 30), r0 = w * (i % 5 ? .38 : .34), r1 = w * .43;
      c.strokeStyle = '#26323a'; c.lineWidth = i % 5 ? 3 : 6; c.beginPath();
      c.moveTo(w / 2 + Math.cos(a) * r0, w / 2 - Math.sin(a) * r0); c.lineTo(w / 2 + Math.cos(a) * r1, w / 2 - Math.sin(a) * r1); c.stroke();
      if (!(i % 5)) texto(c, `${i * 5}`, w / 2 + Math.cos(a) * w * .27, w / 2 - Math.sin(a) * w * .27, 30, '#26323a', { peso: 800 });
    }
    c.strokeStyle = '#c8322a'; c.lineWidth = 7; c.beginPath(); c.moveTo(w / 2, w / 2); c.lineTo(w * .7, w * .32); c.stroke();
    c.fillStyle = '#26323a'; c.beginPath(); c.arc(w / 2, w / 2, 14, 0, Math.PI * 2); c.fill();
    texto(c, 'SU PESO', w / 2, w * .66, 34, '#c8322a', { peso: 900 });
    texto(c, 'kg', w / 2, w * .75, 26, '#26323a', { peso: 700 });
  }, { transparente: true, nombre: 'Báscula · carátula' });
}

// Cabecera luminosa del refrigerador.
export function cabeceraRefri(ancho, alto) {
  return cartel(ancho, alto, 1024, (c, w, h) => {
    c.fillStyle = '#1d4f8f'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9f5ff'; c.beginPath(); c.roundRect(w * .02, h * .12, w * .96, h * .76, h * .2); c.fill();
    texto(c, 'BEBIDAS FRÍAS', w * .55, h * .52, h * .46, '#1d4f8f', { peso: 900 });
    c.fillStyle = '#5fb2e6';
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.fillRect(w * .1 + Math.cos(a) * h * .25 - 4, h * .5 - Math.sin(a) * h * .25 - 4, 8, 8); }
    c.strokeStyle = '#5fb2e6'; c.lineWidth = 6;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(w * .1 - Math.cos(a) * h * .3, h * .5 + Math.sin(a) * h * .3); c.lineTo(w * .1 + Math.cos(a) * h * .3, h * .5 - Math.sin(a) * h * .3); c.stroke(); }
  }, { nombre: 'Refrigerador · Bebidas frías' });
}

// Pantalla del punto de venta.
export function pantallaCaja(ancho, alto) {
  return cartel(ancho, alto, 256, (c, w, h) => {
    c.fillStyle = '#e8f1f6'; c.fillRect(0, 0, w, h);
    c.fillStyle = VERDE; c.fillRect(0, 0, w, h * .16);
    texto(c, 'VENTA', w * .2, h * .08, h * .1, '#ffffff', { peso: 900 });
    c.fillStyle = '#9fb3c1'; for (let i = 0; i < 6; i++) c.fillRect(w * .06, h * (.24 + i * .1), w * (.55 - (i % 3) * .1), h * .04);
    c.fillStyle = '#26323a'; c.fillRect(w * .66, h * .7, w * .3, h * .2);
    texto(c, '$ 87.50', w * .81, h * .8, h * .09, '#9fe0b8', { peso: 900 });
  }, { tipo: 'cartel', nombre: 'Punto de venta' });
}

// Franja de piso ante el mostrador (vinil antiderrapante).
export function lineaTurno(ancho, alto) {
  const m = cartel(ancho, alto, 1024, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#f4c430'; c.beginPath(); c.roundRect(0, 0, w, h, h * .2); c.fill();
    c.fillStyle = '#26282b';
    for (let x = -h; x < w; x += h * .8) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + h * .35, h); c.lineTo(x + h * .75, 0); c.lineTo(x + h * .4, 0); c.fill(); }
    c.fillStyle = '#f4c430'; c.fillRect(w * .2, h * .16, w * .6, h * .68);
    texto(c, 'ESPERE AQUÍ SU TURNO', w / 2, h * .52, h * .42, '#26282b', { peso: 900, max: w * .56 });
  }, { transparente: true, nombre: 'Espere aquí su turno' });
  m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -2;
  return m;
}

/* ── Calle ────────────────────────────────────────────────────────────── */

// Fondo pintado de la acera de enfrente (2D plano, lejos): casas de colores.
export function fondoEnfrente(ancho, alto) {
  return cartel(ancho, alto, 4096, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const casas = [['#e7c07a', 3.6], ['#9cc3d1', 5.4], ['#f0d9b5', 3.2], ['#d98f6a', 3.9], ['#b9d39a', 5.6], ['#efe3c6', 3.4], ['#c9a3c9', 4.2], ['#e9b36b', 3.6], ['#a7c9b8', 5.2], ['#f1cf8a', 3.8]];
    const k = h / 7; let x = 0; let i = 0;
    while (x < w) {
      const [col, alt] = casas[i % casas.length], ancho = k * (3.2 + (i * 7 % 5) * .6);
      const y = h - alt * k;
      c.fillStyle = col; c.fillRect(x, y, ancho + 1, h - y);
      c.fillStyle = 'rgba(0,0,0,.08)'; c.fillRect(x, y, ancho, k * .18);
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x, y - k * .12, ancho, k * .12);
      // puerta/cortina y ventanas
      c.fillStyle = i % 3 === 0 ? '#9aa3aa' : '#6b4a32'; c.fillRect(x + ancho * .15, h - k * 2.3, ancho * (i % 3 === 0 ? .6 : .22), k * 2.3);
      c.fillStyle = '#4c6a7a';
      if (i % 3) { c.fillRect(x + ancho * .5, h - k * 2, ancho * .32, k * 1.1); c.fillStyle = '#2d3235'; for (let b = 0; b < 5; b++) c.fillRect(x + ancho * (.5 + b * .08), h - k * 2, 3, k * 1.1); }
      if (alt > 5) { c.fillStyle = '#4c6a7a'; c.fillRect(x + ancho * .2, y + k * .8, ancho * .25, k * 1); c.fillRect(x + ancho * .6, y + k * .8, ancho * .25, k * 1); }
      c.strokeStyle = 'rgba(40,40,40,.35)'; c.lineWidth = 3; c.strokeRect(x, y, ancho, h - y);
      x += ancho; i++;
    }
  }, { tipo: 'fondo', transparente: true, nombre: 'Casas de enfrente' });
}

// Cielo pintado en degradado (fondo de la escena).
export function texturaCielo(colores) {
  return lienzo(4, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colores[0]); g.addColorStop(.55, colores[1]); g.addColorStop(1, colores[2]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

// Letrero del vecino (papelería) y vinil de su cortina.
export function letreroVecino(ancho, alto) {
  return cartel(ancho, alto, 1024, (c, w, h) => {
    c.fillStyle = '#f4c430'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#2f6fb7'; c.fillRect(0, h * .82, w, h * .18);
    texto(c, 'PAPELERÍA', w / 2, h * .42, h * .5, '#2f6fb7', { peso: 900 });
    texto(c, 'copias · regalos', w / 2, h * .91, h * .14, '#ffffff', { peso: 800 });
  }, { nombre: 'Papelería de al lado' });
}
