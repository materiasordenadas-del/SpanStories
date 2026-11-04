import { PALETA as P } from './Kit.js';

/* ── Rótulos, carteles y pantallas del banco ──────────────────────────────
   Todo se dibuja en canvas (albedo neutro, sin luz pintada).  El texto es lo
   que el estudiante lee: español real de sucursal.  Cada función recibe
   (contexto 2D, ancho, alto) y es la «ilustración» de un plano. */

export const FUENTE = `'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const f = (peso, px) => `${peso} ${Math.round(px)}px ${FUENTE}`;

function textoAjustado(c, texto, x, y, maxAncho, peso, px) {
  let t = px;
  c.font = f(peso, t);
  while (c.measureText(texto).width > maxAncho && t > 6) { t *= .94; c.font = f(peso, t); }
  c.fillText(texto, x, y);
}
function redondo(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

/** Logotipo: sol dorado que asoma sobre el horizonte (tres líneas). */
export function logo(c, cx, cy, r, { fondo = P.teal, sol = P.oro, lineas = '#ffffff' } = {}) {
  c.save();
  c.fillStyle = fondo; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(cx, cy, r * .96, 0, Math.PI * 2); c.clip();
  c.fillStyle = sol; c.beginPath(); c.arc(cx, cy + r * .12, r * .46, Math.PI, 0); c.fill();
  // rayos
  c.strokeStyle = sol; c.lineWidth = r * .07; c.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = Math.PI + (k + .5) * Math.PI / 7;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r * .58, cy + r * .12 + Math.sin(a) * r * .58);
    c.lineTo(cx + Math.cos(a) * r * .74, cy + r * .12 + Math.sin(a) * r * .74); c.stroke();
  }
  c.fillStyle = lineas;
  for (let k = 0; k < 3; k++) { const y = cy + r * (.2 + k * .17), a = r * (.9 - k * .16); c.fillRect(cx - a, y, a * 2, r * .08); }
  c.restore();
}

/** Marca completa: logo + «Banco Horizonte». */
export function marca(c, x, y, alto, { color = '#ffffff', acento = P.oro, fondoLogo = P.teal, lema = true, alinear = 'left' } = {}) {
  c.save();
  c.font = f(700, alto * .62);
  const ancho = alto * 1.1 + c.measureText('Banco Horizonte').width;
  const x0 = alinear === 'center' ? x - ancho / 2 : x;
  logo(c, x0 + alto * .45, y, alto * .45, { fondo: fondoLogo, sol: acento });
  c.fillStyle = color; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = f(300, alto * .62); c.fillText('Banco', x0 + alto * 1.1, y - (lema ? alto * .1 : 0));
  const wb = c.measureText('Banco ').width;
  c.font = f(700, alto * .62); c.fillText('Horizonte', x0 + alto * 1.1 + wb, y - (lema ? alto * .1 : 0));
  if (lema) { c.fillStyle = acento; c.font = f(500, alto * .2); c.fillText('Tu banco, cerca de ti', x0 + alto * 1.12, y + alto * .36); }
  c.restore();
}

/* ── Fachada ─────────────────────────────────────────────────────────── */

export function rotuloFachada(c, w, h) {
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
  c.fillStyle = P.oro; c.fillRect(0, h - h * .06, w, h * .06);
  marca(c, w * .5, h * .47, h * .8, { alinear: 'center', fondoLogo: P.tealOscuro });
}
export function rotuloCajeros24(c, w, h) {
  c.fillStyle = P.tealOscuro; c.fillRect(0, 0, w, h);
  c.fillStyle = P.oro; redondo(c, h * .12, h * .12, h * .76, h * .76, h * .12); c.fill();
  c.fillStyle = P.tealOscuro; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = f(800, h * .36);
  c.fillText('24h', h * .5, h * .52);
  c.fillStyle = '#ffffff'; c.textAlign = 'left'; textoAjustado(c, 'Cajeros automáticos', h * 1.05, h * .52, w - h * 1.15, 600, h * .42);
}

export function horario(c, w, h, { vinilo = false } = {}) {
  if (!vinilo) { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .2); }
  else c.clearRect(0, 0, w, h);
  const col = vinilo ? '#ffffff' : P.grafito;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffffff'; c.font = f(700, h * .1); c.fillText('Horario de atención', w / 2, h * .1);
  const filas = [['Lunes a viernes', '8:30 – 16:00'], ['Sábados', '9:00 – 13:00'], ['Domingos y festivos', 'Cerrado']];
  filas.forEach(([d, hh], i) => {
    const y = h * (.34 + i * .17);
    c.fillStyle = col; c.textAlign = 'left'; c.font = f(500, h * .085); c.fillText(d, w * .07, y);
    c.textAlign = 'right'; c.font = f(700, h * .085); c.fillText(hh, w * .93, y);
    c.fillStyle = vinilo ? 'rgba(255,255,255,.5)' : '#d6dcdc'; c.fillRect(w * .07, y + h * .07, w * .86, 2);
  });
  c.textAlign = 'center'; c.fillStyle = vinilo ? P.oroClaro : P.teal; c.font = f(600, h * .07);
  c.fillText('Cajeros automáticos: 24 horas', w / 2, h * .9);
}

/* ── Pictogramas ─────────────────────────────────────────────────────── */

function prohibido(c, cx, cy, r, dibujo) {
  c.save();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.save(); c.translate(cx, cy); c.fillStyle = P.grafito; c.strokeStyle = P.grafito; dibujo(c, r); c.restore();
  c.strokeStyle = P.rojo; c.lineWidth = r * .16;
  c.beginPath(); c.arc(cx, cy, r * .9, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(cx - r * .64, cy - r * .64); c.lineTo(cx + r * .64, cy + r * .64); c.stroke();
  c.restore();
}
const gorra = (c, r) => {
  c.beginPath(); c.arc(0, r * .1, r * .42, Math.PI, 0); c.fill();
  c.fillRect(r * .2, r * .02, r * .5, r * .12);
};
const gafas = (c, r) => {
  c.lineWidth = r * .07;
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * r * .26, 0, r * .2, r * .15, 0, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.moveTo(-r * .06, -r * .04); c.lineTo(r * .06, -r * .04); c.stroke();
};
const casco = (c, r) => {
  c.beginPath(); c.arc(0, r * .12, r * .45, Math.PI, 0); c.lineTo(r * .45, r * .3); c.lineTo(-r * .2, r * .3); c.lineTo(-r * .45, r * .12); c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(r * .05, -r * .02, r * .36, r * .16);
};
const celular = (c, r) => {
  redondo(c, -r * .22, -r * .42, r * .44, r * .84, r * .08); c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(-r * .16, -r * .32, r * .32, r * .56);
};
const cigarro = (c, r) => { c.fillRect(-r * .5, -r * .06, r * .8, r * .14); c.fillRect(r * .34, -r * .06, r * .14, r * .14); c.lineWidth = r * .05; c.beginPath(); c.moveTo(r * .38, -r * .14); c.quadraticCurveTo(r * .3, -r * .35, r * .45, -r * .5); c.stroke(); };

/** «Por su seguridad, retírese gorra, gafas de sol y casco». */
export function avisoGorra(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .22);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Por su seguridad', w / 2, h * .11, w * .9, 700, h * .12);
  const r = w * .13;
  prohibido(c, w * .2, h * .46, r, gorra); prohibido(c, w * .5, h * .46, r, gafas); prohibido(c, w * .8, h * .46, r, casco);
  c.fillStyle = P.grafito;
  textoAjustado(c, 'retírese gorra, gafas de sol y casco', w / 2, h * .75, w * .9, 600, h * .085);
  c.fillStyle = P.gris; textoAjustado(c, 'antes de entrar a la sucursal', w / 2, h * .87, w * .9, 400, h * .065);
}
export function avisoCelular(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  prohibido(c, w / 2, h * .36, w * .26, celular);
  c.fillStyle = P.grafito; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Evite usar el celular', w / 2, h * .74, w * .9, 700, h * .08);
  c.fillStyle = P.gris; textoAjustado(c, 'dentro de la sucursal', w / 2, h * .85, w * .9, 400, h * .065);
}
export function avisoFumar(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  prohibido(c, w / 2, h * .4, w * .3, cigarro);
  c.fillStyle = P.grafito; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Prohibido fumar', w / 2, h * .84, w * .9, 700, h * .1);
}

// Iconos de la fila preferencial: embarazada, adulto mayor, silla de ruedas.
function iconoPersona(c, cx, cy, r, tipo, color = '#ffffff') {
  c.save(); c.translate(cx, cy); c.fillStyle = color; c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = r * .16;
  c.beginPath(); c.arc(0, -r * .7, r * .17, 0, Math.PI * 2); c.fill();
  if (tipo === 'silla') {
    c.beginPath(); c.moveTo(0, -r * .45); c.lineTo(0, 0); c.lineTo(r * .4, 0); c.lineTo(r * .5, r * .45); c.stroke();
    c.lineWidth = r * .1; c.beginPath(); c.arc(-r * .05, r * .3, r * .38, Math.PI * .1, Math.PI * 1.55); c.stroke();
  } else if (tipo === 'embarazada') {
    c.beginPath(); c.moveTo(0, -r * .45); c.lineTo(0, r * .15); c.stroke();
    c.beginPath(); c.arc(r * .08, -r * .08, r * .24, -Math.PI / 2, Math.PI / 2); c.fill();
    c.beginPath(); c.moveTo(0, r * .15); c.lineTo(-r * .12, r * .8); c.moveTo(0, r * .15); c.lineTo(r * .14, r * .8); c.stroke();
  } else {
    c.beginPath(); c.moveTo(0, -r * .45); c.quadraticCurveTo(r * .12, -r * .1, 0, r * .15); c.stroke();
    c.beginPath(); c.moveTo(0, r * .15); c.lineTo(-r * .16, r * .8); c.moveTo(0, r * .15); c.lineTo(r * .14, r * .8); c.stroke();
    c.lineWidth = r * .09; c.beginPath(); c.moveTo(r * .05, -r * .25); c.lineTo(r * .4, -r * .05); c.lineTo(r * .45, r * .8); c.stroke();
  }
  c.restore();
}

/* ── La fila ─────────────────────────────────────────────────────────── */

/** Cartel de poste (A4 horizontal en su marco). */
export function cartelFila(texto, sub = '', flecha = null) {
  return (c, w, h) => {
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    let x = w / 2, ancho = w * .88;
    if (flecha) {
      const ax = flecha === 'izq' ? w * .12 : w * .88; ancho = w * .7; x = flecha === 'izq' ? w * .56 : w * .44;
      c.fillStyle = P.oro; c.beginPath();
      const s = flecha === 'izq' ? -1 : 1;
      c.moveTo(ax + s * h * .18, h * .5); c.lineTo(ax - s * h * .06, h * .28); c.lineTo(ax - s * h * .06, h * .42); c.lineTo(ax - s * h * .2, h * .42);
      c.lineTo(ax - s * h * .2, h * .58); c.lineTo(ax - s * h * .06, h * .58); c.lineTo(ax - s * h * .06, h * .72); c.fill();
      c.fillStyle = '#ffffff';
    }
    textoAjustado(c, texto, x, sub ? h * .4 : h * .5, ancho, 700, h * .26);
    if (sub) { c.fillStyle = P.menta; textoAjustado(c, sub, x, h * .72, ancho, 400, h * .13); }
  };
}
export function cartelPreferencial(c, w, h) {
  c.fillStyle = P.azul; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Fila preferencial', w / 2, h * .16, w * .9, 700, h * .15);
  iconoPersona(c, w * .22, h * .55, h * .28, 'embarazada'); iconoPersona(c, w * .5, h * .55, h * .28, 'mayor'); iconoPersona(c, w * .78, h * .55, h * .28, 'silla');
  c.font = f(400, h * .075);
  c.fillText('Embarazadas · Adultos mayores · Personas con discapacidad', w / 2, h * .9);
}

/** Vinilo de suelo: huellas y «Espere aquí hasta que se le llame» (con alfa). */
export function esperaAqui(c, w, h) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = P.amarillo; c.fillRect(0, h * .05, w, h * .1);
  c.fillStyle = P.grafito;
  for (let i = 0; i < 9; i++) c.fillRect(i * w / 9 + w / 36, h * .05, w / 18, h * .1);
  const huella = (x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s, 1);
    c.beginPath(); c.ellipse(0, 0, h * .07, h * .13, -.08, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(-h * .005, h * .19, h * .055, h * .07, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  };
  c.fillStyle = P.teal; huella(w * .42, h * .42, -1); huella(w * .58, h * .42, 1);
  c.fillStyle = P.tealOscuro; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Espere aquí', w / 2, h * .76, w * .9, 800, h * .15);
  textoAjustado(c, 'hasta que se le llame', w / 2, h * .9, w * .9, 500, h * .1);
}

/* ── Mostrador ───────────────────────────────────────────────────────── */

/** Número de caja sobre la ventanilla.  `llama`: encendido en verde. */
export function numeroCaja(n, { llama = false, cerrada = false, preferente = false } = {}) {
  return (c, w, h) => {
    c.fillStyle = cerrada ? '#4b5155' : llama ? '#1f9d55' : P.tealOscuro; c.fillRect(0, 0, w, h);
    c.fillStyle = llama ? '#e9ffef' : '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = f(300, h * .26); c.fillText('CAJA', w * .3, h * .5);
    c.font = f(800, h * .7); c.fillText(String(n), w * .66, h * .54);
    if (preferente) iconoPersona(c, w * .9, h * .55, h * .3, 'silla', P.oroClaro);
    if (llama) { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w * .05, h * .5); c.lineTo(w * .1, h * .3); c.lineTo(w * .1, h * .7); c.fill(); }
  };
}
export function cartelCajas(c, w, h) {
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
  c.fillStyle = P.oro; c.fillRect(0, h * .9, w, h * .1);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Cajas', w / 2, h * .38, w * .9, 700, h * .42);
  c.fillStyle = P.menta; textoAjustado(c, 'Depósitos · Retiros · Pagos', w / 2, h * .72, w * .9, 400, h * .17);
}
export function cartelColgante(texto, sub, flecha) {
  return (c, w, h) => {
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const x = flecha ? w * .56 : w / 2;
    textoAjustado(c, texto, x, sub ? h * .4 : h * .52, w * .75, 700, h * .36);
    if (sub) { c.fillStyle = P.menta; textoAjustado(c, sub, x, h * .75, w * .75, 400, h * .17); }
    if (flecha) {
      c.save(); c.translate(w * .1, h * .5); c.rotate(flecha); c.fillStyle = P.oro;
      c.beginPath(); c.moveTo(h * .26, 0); c.lineTo(0, -h * .24); c.lineTo(0, -h * .1); c.lineTo(-h * .24, -h * .1); c.lineTo(-h * .24, h * .1); c.lineTo(0, h * .1); c.lineTo(0, h * .24); c.fill();
      c.restore();
    }
  };
}
export function cuenteDinero(c, w, h) {
  c.fillStyle = P.oroClaro; c.fillRect(0, 0, w, h);
  c.strokeStyle = P.nogal; c.lineWidth = h * .05; c.strokeRect(h * .06, h * .06, w - h * .12, h - h * .12);
  c.fillStyle = P.nogal; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Cuente su dinero antes de', w / 2, h * .37, w * .88, 700, h * .24);
  textoAjustado(c, 'retirarse de la ventanilla', w / 2, h * .66, w * .88, 700, h * .24);
}
export function cajaCerrada(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.rojo; c.fillRect(0, 0, w, h * .12); c.fillRect(0, h * .88, w, h * .12);
  c.fillStyle = P.rojo; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Caja cerrada', w / 2, h * .42, w * .88, 800, h * .3);
  c.fillStyle = P.grafito; textoAjustado(c, 'Por favor, pase a otra ventanilla', w / 2, h * .7, w * .88, 400, h * .12);
}
export function soloPersonal(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.rojo; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Solo personal autorizado', w / 2, h * .5, w * .9, 700, h * .4);
}
export function placaModulo(n) {
  return (c, w, h) => {
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = f(300, h * .4); c.fillText('MÓDULO', w * .38, h * .52);
    c.font = f(800, h * .7); c.fillText(String(n), w * .82, h * .55);
  };
}
export function cartelInformacion(c, w, h) {
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(h * .5, h * .5, h * .34, 0, Math.PI * 2); c.fill();
  c.fillStyle = P.teal; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `italic 700 ${h * .5}px Georgia, serif`; c.fillText('i', h * .5, h * .54);
  c.fillStyle = '#ffffff'; c.textAlign = 'left'; textoAjustado(c, 'Información', h * .98, h * .52, w - h * 1.1, 600, h * .5);
}

/* ── Paredes: tipo de cambio, publicidad ─────────────────────────────── */

export function tipoCambio(c, w, h) {
  c.fillStyle = '#16191b'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .17);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Tipo de cambio', w / 2, h * .085, w * .9, 700, h * .1);
  c.fillStyle = '#8fa3a8'; c.font = f(600, h * .055);
  c.fillText('Compra', w * .6, h * .25); c.fillText('Venta', w * .84, h * .25);
  const filas = [['US', 'Dólar', '17.85', '18.62'], ['EU', 'Euro', '19.40', '20.55'], ['CA', 'Dólar canadiense', '12.90', '13.70']];
  filas.forEach(([cod, nom, cp, vt], i) => {
    const y = h * (.4 + i * .19);
    c.fillStyle = cod === 'US' ? '#2f6fb0' : cod === 'EU' ? '#2f4fb0' : '#c2393a';
    redondo(c, w * .05, y - h * .06, w * .09, h * .12, 4); c.fill();
    c.fillStyle = '#ffffff'; c.font = f(700, h * .055); c.textAlign = 'center'; c.fillText(cod, w * .095, y);
    c.textAlign = 'left'; textoAjustado(c, nom, w * .17, y, w * .3, 500, h * .07);
    c.fillStyle = '#ffb638'; c.textAlign = 'center'; c.font = `700 ${h * .1}px Consolas, 'Courier New', monospace`;
    c.fillText(cp, w * .6, y); c.fillText(vt, w * .84, y);
  });
  c.fillStyle = '#6f7e82'; c.textAlign = 'center'; c.font = f(400, h * .045);
  c.fillText('Pesos por unidad · Actualizado hoy 8:30', w / 2, h * .94);
}

export function posterAhorro(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, P.tealClaro); g.addColorStop(1, P.teal);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // hucha (cerdito)
  c.fillStyle = '#f2a7b8'; c.beginPath(); c.ellipse(w * .5, h * .4, w * .26, h * .14, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(w * .74, h * .4, w * .06, h * .05, 0, 0, Math.PI * 2); c.fill();
  for (const x of [.38, .46, .56, .64]) c.fillRect(w * x, h * .48, w * .05, h * .08);
  c.beginPath(); c.moveTo(w * .56, h * .28); c.lineTo(w * .6, h * .21); c.lineTo(w * .64, h * .29); c.fill();
  c.fillStyle = '#7a3d4b'; c.fillRect(w * .44, h * .27, w * .12, h * .012);
  c.beginPath(); c.arc(w * .66, h * .36, w * .012, 0, Math.PI * 2); c.fill();
  c.fillStyle = P.oro; c.beginPath(); c.ellipse(w * .5, h * .19, w * .06, h * .035, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Cuenta de ahorro', w / 2, h * .66, w * .88, 700, h * .07);
  c.fillStyle = P.oroClaro; textoAjustado(c, 'Abra su cuenta sin comisiones', w / 2, h * .74, w * .88, 400, h * .042);
  c.fillStyle = '#ffffff'; textoAjustado(c, 'Pregunte en Atención al cliente', w / 2, h * .82, w * .88, 400, h * .036);
  marca(c, w / 2, h * .92, h * .07, { alinear: 'center', lema: false, fondoLogo: P.tealOscuro });
}
export function posterPrestamo(c, w, h) {
  c.fillStyle = P.cremaClaro; c.fillRect(0, 0, w, h);
  c.fillStyle = P.oro; c.fillRect(0, 0, w, h * .56);
  // casa y llave
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(w * .5, h * .12); c.lineTo(w * .78, h * .3); c.lineTo(w * .22, h * .3); c.fill();
  c.fillRect(w * .28, h * .3, w * .44, h * .19);
  c.fillStyle = P.teal; c.fillRect(w * .45, h * .37, w * .1, h * .12); c.fillRect(w * .32, h * .34, w * .08, h * .06); c.fillRect(w * .6, h * .34, w * .08, h * .06);
  c.fillStyle = P.teal; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Préstamo personal', w / 2, h * .64, w * .88, 700, h * .065);
  c.fillStyle = P.grafito; textoAjustado(c, 'Su proyecto empieza hoy', w / 2, h * .72, w * .88, 400, h * .042);
  c.fillStyle = P.tealOscuro; textoAjustado(c, 'Tasa fija · Hasta 60 meses', w / 2, h * .79, w * .88, 600, h * .036);
  marca(c, w / 2, h * .91, h * .07, { alinear: 'center', lema: false, color: P.teal });
}
export function posterTarjeta(c, w, h) {
  c.fillStyle = P.tealOscuro; c.fillRect(0, 0, w, h);
  c.save(); c.translate(w * .5, h * .3); c.rotate(-.18);
  c.fillStyle = P.oro; redondo(c, -w * .32, -h * .12, w * .64, h * .24, w * .04); c.fill();
  c.fillStyle = '#d7b35b'; redondo(c, -w * .24, -h * .05, w * .1, h * .06, 4); c.fill();
  c.fillStyle = P.tealOscuro; c.font = `600 ${h * .03}px Consolas, monospace`; c.fillText('4152  ••••  ••••  2026', -w * .25, h * .06);
  c.restore();
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Tarjeta de crédito', w / 2, h * .62, w * .88, 700, h * .065);
  c.fillStyle = P.menta; textoAjustado(c, 'Sin anualidad el primer año', w / 2, h * .7, w * .88, 400, h * .042);
  marca(c, w / 2, h * .9, h * .07, { alinear: 'center', lema: false, fondoLogo: P.teal });
}
export function avisoTeclado(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.oro; c.fillRect(0, 0, w, h * .18);
  c.fillStyle = P.tealOscuro; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Proteja su clave', w / 2, h * .09, w * .9, 700, h * .11);
  // teclado y mano
  c.fillStyle = P.grisClaro; redondo(c, w * .32, h * .28, w * .36, h * .36, 8); c.fill();
  c.fillStyle = P.gris; for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) c.fillRect(w * (.36 + i * .1), h * (.31 + j * .08), w * .07, h * .055);
  c.fillStyle = '#e0b08a'; c.beginPath(); c.ellipse(w * .6, h * .38, w * .16, h * .1, -.4, 0, Math.PI * 2); c.fill();
  c.fillStyle = P.grafito;
  textoAjustado(c, 'Cubra el teclado al digitar su NIP', w / 2, h * .74, w * .9, 600, h * .07);
  c.fillStyle = P.gris; textoAjustado(c, 'No acepte ayuda de desconocidos', w / 2, h * .86, w * .9, 400, h * .06);
}

/* ── Pantallas (emisivas) ────────────────────────────────────────────── */

export function pantallaCajero(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#12707a'); g.addColorStop(1, '#0a434a');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  marca(c, w / 2, h * .2, h * .16, { alinear: 'center', lema: false, fondoLogo: '#0a434a' });
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Bienvenido', w / 2, h * .45, w * .9, 700, h * .12);
  c.fillStyle = P.menta; textoAjustado(c, 'Inserte su tarjeta', w / 2, h * .6, w * .9, 400, h * .08);
  c.strokeStyle = P.oro; c.lineWidth = h * .015; redondo(c, w * .4, h * .7, w * .2, h * .16, 6); c.stroke();
  c.fillStyle = P.oro; c.fillRect(w * .43, h * .76, w * .14, h * .02);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = f(400, h * .045); c.fillText('Retiro · Consulta de saldo · Depósito · Pago de servicios', w / 2, h * .94);
}
export function pantallaCajeroTeller(c, w, h) {
  c.fillStyle = '#e9eef0'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .1);
  c.fillStyle = '#ffffff'; c.font = f(600, h * .06); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Sistema de caja · Operaciones', w * .03, h * .05);
  const filas = ['Depósito en efectivo', 'Retiro', 'Pago de servicios', 'Cambio de divisas', 'Consulta de saldo'];
  filas.forEach((t, i) => {
    c.fillStyle = i === 0 ? '#cfe6e2' : '#ffffff'; c.fillRect(w * .04, h * (.16 + i * .12), w * .4, h * .1);
    c.fillStyle = P.grafito; c.font = f(400, h * .05); c.fillText(t, w * .06, h * (.21 + i * .12));
  });
  c.fillStyle = '#ffffff'; c.fillRect(w * .5, h * .16, w * .46, h * .58);
  c.fillStyle = P.gris; for (let i = 0; i < 6; i++) c.fillRect(w * .53, h * (.22 + i * .08), w * (.2 + (i * 37 % 20) / 100), h * .025);
  c.fillStyle = P.teal; c.fillRect(w * .72, h * .8, w * .24, h * .1);
}
export function pantallaDatafono(c, w, h) {
  c.fillStyle = '#9fc8b8'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#1b2f28'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${h * .22}px Consolas, monospace`; c.fillText('DIGITE SU NIP', w / 2, h * .36);
  c.font = `700 ${h * .26}px Consolas, monospace`; c.fillText('_ _ _ _', w / 2, h * .7);
}
export function pantallaKiosco(estado = {}) {
  return (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8f1ef');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .14);
    marca(c, w / 2, h * .07, h * .1, { alinear: 'center', lema: false, fondoLogo: P.tealOscuro });
    c.fillStyle = P.grafito; c.textAlign = 'center'; c.textBaseline = 'middle';
    textoAjustado(c, estado.mensaje || 'Bienvenido. Elija un servicio:', w / 2, h * .22, w * .9, 600, h * .055);
    BOTONES_KIOSCO.forEach((b, i) => {
      const y = h * (.29 + i * .25), activo = estado.pulsado === b.letra;
      c.fillStyle = activo ? P.oro : b.color; redondo(c, w * .08, y, w * .84, h * .21, h * .03); c.fill();
      c.fillStyle = '#ffffff'; c.textAlign = 'left';
      c.font = f(800, h * .11); c.fillText(b.letra, w * .13, y + h * .105);
      textoAjustado(c, b.texto, w * .27, y + h * .08, w * .6, 700, h * .058);
      c.fillStyle = 'rgba(255,255,255,.88)'; textoAjustado(c, b.sub, w * .27, y + h * .145, w * .62, 400, h * .036);
    });
    c.fillStyle = P.tealOscuro; c.textAlign = 'center'; c.font = f(700, h * .04);
    c.fillText('Para cajas, haga la fila única', w / 2, h * .84);
    c.fillStyle = P.gris; c.font = f(400, h * .034);
    c.fillText('Toque la pantalla · Retire su tique abajo', w / 2, h * .92);
  };
}
export const BOTONES_KIOSCO = [
  { letra: 'A', texto: 'Atención al cliente', sub: 'Cuentas, tarjetas y préstamos', color: P.teal },
  { letra: 'P', texto: 'Caja preferencial', sub: 'Embarazadas, mayores, discapacidad', color: P.azul },
];
export function tique(t) {
  return (c, w, h) => {
    c.fillStyle = '#fbfaf5'; c.fillRect(0, 0, w, h);
    marca(c, w / 2, h * .1, h * .08, { alinear: 'center', lema: false, color: P.teal });
    c.fillStyle = P.grafito; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = f(400, h * .05); c.fillText('Su turno es', w / 2, h * .24);
    c.font = f(800, h * .2); c.fillText(t.codigo, w / 2, h * .4);
    c.font = f(600, h * .055); c.fillText(t.servicio, w / 2, h * .56);
    c.font = f(400, h * .045); c.fillText(`Turnos antes de usted: ${t.delante}`, w / 2, h * .66);
    c.fillText('Espere a ser llamado en la pantalla', w / 2, h * .74);
    c.fillStyle = P.gris; c.font = f(400, h * .038); c.fillText(t.fecha, w / 2, h * .86);
    c.fillText('¡Gracias por su visita!', w / 2, h * .92);
  };
}

/** Pantalla de turnos: último llamado grande + historial. */
export function pantallaTurnos(estado) {
  return (c, w, h) => {
    c.fillStyle = '#0d1f22'; c.fillRect(0, 0, w, h);
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .14);
    c.fillStyle = '#ffffff'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.font = f(700, h * .075);
    c.fillText('TURNO', w * .06, h * .07); c.textAlign = 'right'; c.fillText('PASE A', w * .94, h * .07);
    const [ultimo, ...resto] = estado.llamados;
    if (ultimo) {
      c.fillStyle = estado.parpadeo ? P.oro : '#1f5e5a'; c.fillRect(0, h * .15, w, h * .3);
      c.fillStyle = estado.parpadeo ? P.tealOscuro : '#ffffff';
      c.textAlign = 'left'; c.font = f(800, h * .2); c.fillText(ultimo.codigo, w * .06, h * .3);
      c.textAlign = 'right'; c.font = f(700, h * .12); c.fillText(ultimo.destino, w * .94, h * .3);
    }
    resto.slice(0, 4).forEach((t, i) => {
      const y = h * (.53 + i * .11);
      c.fillStyle = i % 2 ? '#10272b' : '#132e33'; c.fillRect(0, y - h * .05, w, h * .1);
      c.fillStyle = t.mio ? P.oroClaro : '#d6e6e4'; c.textAlign = 'left'; c.font = f(700, h * .075); c.fillText(t.codigo, w * .06, y);
      c.textAlign = 'right'; c.font = f(500, h * .065); c.fillText(t.destino, w * .94, y);
    });
    c.fillStyle = '#7fa19d'; c.textAlign = 'center'; c.font = f(400, h * .04);
    c.fillText(estado.hora || '', w / 2, h * .97);
  };
}
/** Letrero de llamada sobre el mostrador: «Pase a la caja 3». */
export function panelLlamada(estado) {
  return (c, w, h) => {
    c.fillStyle = '#0d1f22'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (estado.caja) {
      c.fillStyle = estado.parpadeo ? '#43d17a' : '#2fae62';
      c.font = f(700, h * .42); c.fillText(`${estado.codigo}  ►  Caja ${estado.caja}`, w / 2, h * .52);
    } else { c.fillStyle = '#4f6b68'; c.font = f(500, h * .34); c.fillText('Por favor, espere su turno', w / 2, h * .52); }
  };
}

/* ── Otros ───────────────────────────────────────────────────────────── */

export function folleto(titulo, color) {
  return (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = color; c.fillRect(0, 0, w, h * .62);
    c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.arc(w * .75, h * .3, w * .3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.textAlign = 'left'; c.textBaseline = 'middle';
    textoAjustado(c, titulo, w * .08, h * .5, w * .84, 700, h * .09);
    logo(c, w * .16, h * .8, h * .08);
  };
}
export function comprobantes(c, w, h) {
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Comprobantes', w / 2, h * .5, w * .88, 700, h * .5);
}
export function fichaDeposito(c, w, h) {
  c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, w, h);
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h * .14);
  c.fillStyle = '#ffffff'; c.font = f(700, h * .08); c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Ficha de depósito', w * .05, h * .07);
  c.strokeStyle = '#9fb3b2'; c.lineWidth = 2;
  ['Nombre', 'N.º de cuenta', 'Importe', 'Firma'].forEach((t, i) => {
    const y = h * (.32 + i * .18);
    c.fillStyle = P.gris; c.font = f(400, h * .06); c.fillText(t, w * .05, y - h * .05);
    c.beginPath(); c.moveTo(w * .05, y + h * .04); c.lineTo(w * .95, y + h * .04); c.stroke();
  });
}
export function etiquetaFichas(texto) {
  return (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = P.tealOscuro; c.textAlign = 'center'; c.textBaseline = 'middle';
    textoAjustado(c, texto, w / 2, h * .52, w * .9, 700, h * .6);
  };
}
export function reloj(fecha = new Date()) {
  return (c, w, h) => {
    const r = w / 2;
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(r, r, r * .96, 0, Math.PI * 2); c.fill();
    c.strokeStyle = P.grafito; c.lineWidth = r * .07; c.stroke();
    c.fillStyle = P.grafito;
    for (let i = 0; i < 12; i++) { c.save(); c.translate(r, r); c.rotate(i * Math.PI / 6); c.fillRect(-r * .02, -r * .82, r * .04, r * (i % 3 ? .08 : .14)); c.restore(); }
    logo(c, r, r * 1.45, r * .12);
    const hh = fecha.getHours() % 12 + fecha.getMinutes() / 60, mm = fecha.getMinutes() + fecha.getSeconds() / 60;
    const aguja = (ang, largo, ancho, color) => { c.save(); c.translate(r, r); c.rotate(ang); c.fillStyle = color; c.fillRect(-ancho / 2, -largo, ancho, largo + r * .1); c.restore(); };
    aguja(hh * Math.PI / 6, r * .5, r * .07, P.grafito); aguja(mm * Math.PI / 30, r * .72, r * .045, P.grafito);
    aguja(fecha.getSeconds() * Math.PI / 30, r * .76, r * .018, P.rojo);
    c.fillStyle = P.grafito; c.beginPath(); c.arc(r, r, r * .05, 0, Math.PI * 2); c.fill();
  };
}
export function puertaAutomatica(c, w, h) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.92)'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Puerta automática', w / 2, h * .5, w * .95, 600, h * .5);
}
export function franjaVidrio(c, w, h) {
  // franja de seguridad esmerilada con logos (para que nadie choque con el vidrio)
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(235,245,244,.85)'; c.fillRect(0, h * .2, w, h * .6);
  for (let x = h * .5; x < w; x += h * 2.4) logo(c, x, h * .5, h * .26, { fondo: 'rgba(15,95,102,.8)' });
}
export function cartelModulos(c, w, h) {
  c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  textoAjustado(c, 'Atención al cliente', w / 2, h * .4, w * .9, 700, h * .36);
  c.fillStyle = P.menta; textoAjustado(c, 'Cuentas · Tarjetas · Préstamos · Aclaraciones', w / 2, h * .76, w * .9, 400, h * .16);
}
export function marcaFondo(c, w, h) {
  c.clearRect(0, 0, w, h);
  marca(c, w / 2, h / 2, h * .6, { alinear: 'center', color: '#ffffff', fondoLogo: P.teal });
}
