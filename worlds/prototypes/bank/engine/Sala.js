import * as T from './three.js';
import { ALTO_TECHO as H, FILA, FILA_PREF, KIOSCO, INFORMACION, ASESORES, SILLAS, MOSTRADOR as M, EDIFICIO } from './config.js';
import { PUERTA_PERSONAL } from './Arquitectura.js';
import { plano, vinilo } from './Planos.js';
import * as R from './Rotulos.js';

/* ── Sala de atención ─────────────────────────────────────────────────────
   Lo que el cliente recorre entre la puerta y la ventanilla: la fila única
   con postes de cinta, la fila preferencial, el kiosco de turnos, el módulo
   de información, la zona de espera con la pantalla de turnos, los módulos
   de atención al cliente y, junto a los ventanales, la mesa de formularios.
   Carteles de pared a la altura de los ojos de quien hace la fila. */

const Z_MURO_CAJAS = M.z - .2;        // cara sur del muro junto a las cajas (-10.7)

export function construirSala(ctx) {
  construirFila(ctx);
  construirKiosco(ctx);
  construirInformacion(ctx);
  construirEspera(ctx);
  construirAsesores(ctx);
  construirVentanales(ctx);
  construirCarteles(ctx);
}

/* ── Fila única y preferencial ───────────────────────────────────────── */

function poste(ctx, x, z, nombre = 'el poste separador') {
  const { lote, kit } = ctx, acero = kit.metal('acero', .6, 1.4);
  lote.cil('grafito', x, .015, z, .32, .03, { lados: 24, contorno: 'medio', trazo: '#3a3d41', nombre });
  lote.cil(acero, x, .5, z, .055, .94, { contorno: 'medio', trazo: '#80878d', nombre });
  lote.cil(acero, x, .98, z, .075, .07, { contorno: 'medio', trazo: '#80878d', nombre });
  lote.sombra(x, z, .5, .5, .8);
}
function cinta(ctx, xa, za, xb, zb) {
  const l = Math.hypot(xb - xa, zb - za), ry = Math.atan2(-(zb - za), xb - xa);
  ctx.lote.caja('teal', (xa + xb) / 2, .93, (za + zb) / 2, l, .05, .006, { ry, contorno: false, nombre: 'la cinta separadora' });
}
// Tramo de cinta con postes intermedios cada ≤ 2,4 m.
function tramoCinta(ctx, xa, za, xb, zb, postes) {
  const l = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.ceil(l / 2.4));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    cinta(ctx, xa + (xb - xa) * t0, za + (zb - za) * t0, xa + (xb - xa) * t1, za + (zb - za) * t1);
  }
  for (let k = 0; k <= n; k++) postes.add(`${(xa + (xb - xa) * k / n).toFixed(3)},${(za + (zb - za) * k / n).toFixed(3)}`);
}
function cartelPoste(ctx, x, z, ry, dibujar, nombre, ancho = .42, alto = .3) {
  const { lote } = ctx;
  lote.en(x, 0, z, ry, () => {
    lote.caja('grafito', 0, 1.2, 0, ancho + .03, alto + .03, .02, { contorno: 'medio', nombre });
    lote.caja(ctx.kit.metal('acero', .5), 0, 1.02, 0, .03, .1, .03, { contorno: false });
  });
  const dz = Math.cos(ry) * .012, dx = Math.sin(ry) * .012;
  plano(ctx, ancho, alto, 420, dibujar, { x: x + dx, y: 1.2, z: z + dz, ry, nombre });
  plano(ctx, ancho, alto, 420, dibujar, { x: x - dx, y: 1.2, z: z - dz, ry: ry + Math.PI, nombre });
}

function construirFila(ctx) {
  const { x0, x1, cintas: [c0, c1, c2, c3] } = FILA, postes = new Set();
  const G = 1.0;                                   // hueco de giro entre carriles
  tramoCinta(ctx, x0, c0, x1, c0, postes);         // sur, entera
  tramoCinta(ctx, x0, c1, x1 - G, c1, postes);     // A → B por el este
  tramoCinta(ctx, x0 + G, c2, x1, c2, postes);     // B → C por el oeste
  tramoCinta(ctx, x0, c3, x1, c3, postes);         // norte, entera
  tramoCinta(ctx, x1, c0, x1, c2, postes);         // cierre este de A y B (C sale por el este)
  tramoCinta(ctx, x0, c1, x0, c3, postes);         // cierre oeste de B y C (A entra por el oeste)
  // Fila preferencial: carril recto sur → norte.
  const { x0: px0, x1: px1, z0: pz0, z1: pz1 } = FILA_PREF;
  tramoCinta(ctx, px0, pz0, px0, pz1, postes);
  tramoCinta(ctx, px1, pz0, px1, pz1, postes);
  for (const k of postes) { const [x, z] = k.split(',').map(Number); poste(ctx, x, z); }

  // Colisiones de las cintas (el estudiante recorre la fila de verdad).
  const col = (xa, za, xb, zb) => ctx.colisiones.push([Math.min(xa, xb) - .05, Math.min(za, zb) - .05, Math.max(xa, xb) + .05, Math.max(za, zb) + .05]);
  col(x0, c0, x1, c0); col(x0, c1, x1 - G, c1); col(x0 + G, c2, x1, c2); col(x0, c3, x1, c3);
  col(x1, c0, x1, c2); col(x0, c1, x0, c3); col(px0, pz0, px0, pz1); col(px1, pz0, px1, pz1);

  // Carteles de la fila.
  const [bx, bz] = FILA.boca;
  cartelPoste(ctx, -6.35, c0 + .32, .25, R.cartelFila('Inicio de la fila', 'Cajas', 'izq'), 'el cartel «Inicio de la fila»', .5, .34);
  poste(ctx, -6.35, c0 + .32, 'el cartel «Inicio de la fila»');
  ctx.colisiones.push([-6.5, c0 + .22, -6.2, c0 + .42]);
  plano(ctx, .5, .16, 400, R.cartelFila('Por favor, espere su turno'), { x: (x0 + x1) / 2, y: 1.12, z: c0 + .01, nombre: 'el cartel «Por favor, espere su turno»' });
  ctx.lote.caja('grafito', (x0 + x1) / 2, 1.12, c0 + .002, .53, .19, .01, { contorno: 'medio' });
  ctx.lote.caja('grafito', (x0 + x1) / 2, .99, c0 + .002, .02, .1, .01, { contorno: false });
  cartelPoste(ctx, (px0 + px1) / 2, pz0 + .35, 0, R.cartelPreferencial, 'el cartel de la fila preferencial', .5, .36);
  // Vinilos del suelo: «Espere aquí» y flechas del recorrido.
  vinilo(ctx, 2.0, .7, 900, R.esperaAqui, { x: FILA.esperaX + .35, z: FILA.esperaZ, nombre: 'la línea «Espere aquí»' });
  const flecha = (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(15,95,102,.85)';
    c.beginPath(); c.moveTo(w * .5, 0); c.lineTo(w, h * .45); c.lineTo(w * .68, h * .45); c.lineTo(w * .68, h); c.lineTo(w * .32, h); c.lineTo(w * .32, h * .45); c.lineTo(0, h * .45); c.fill();
  };
  for (const [x, z, ry] of [[x0 + .6, (c0 + c1) / 2, -Math.PI / 2], [(x0 + x1) / 2, (c1 + c2) / 2, Math.PI / 2], [(x0 + x1) / 2, (c2 + c3) / 2, -Math.PI / 2], [x1 + .45, c3 - .2, 0]])
    vinilo(ctx, .28, .36, 96, flecha, { x, z, ry, nombre: 'la flecha del suelo' });
}

/* ── Kiosco de turnos ────────────────────────────────────────────────── */

function construirKiosco(ctx) {
  const { lote, kit } = ctx, { x, z, ry } = KIOSCO;
  lote.en(x, 0, z, ry, () => {
    lote.caja('teal', 0, .55, 0, .5, 1.1, .34, { contorno: 'medio', nombre: 'el kiosco de turnos' });
    lote.caja('blanco', 0, 1.3, -.05, .5, .5, .24, { contorno: 'medio', nombre: 'el kiosco de turnos' });
    lote.caja('grafito', 0, 1.33, .13, .46, .54, .05, { rx: -.35, contorno: 'medio', nombre: 'el kiosco de turnos' });
    lote.caja('teal', 0, 1.64, -.02, .5, .1, .32, { contorno: false });
    lote.caja('oro', 0, .02, 0, .56, .04, .4, { contorno: false });
    // ranura del tique
    lote.caja('negro', 0, 1.0, .172, .2, .03, .01, { contorno: false, nombre: 'la ranura del tique' });
    lote.sombra(0, 0, .9, .7, 1);
  });
  // Pantalla táctil (emisiva, pulsable por zonas).
  const s = Math.sin(ry), c = Math.cos(ry);
  const pantalla = plano(ctx, .4, .48, 380, R.pantallaKiosco(), { x: x + s * .166, y: 1.335, z: z + c * .166, ry, rx: -.35, emisivo: true, nombre: 'la pantalla del kiosco' });
  pantalla.userData.kiosco = true;
  plano(ctx, .46, .09, 420, (g, w, h) => { g.fillStyle = '#0f5f66'; g.fillRect(0, 0, w, h); R.marca(g, w / 2, h / 2, h * .8, { alinear: 'center', lema: false, color: '#ffffff', fondoLogo: '#0a4349' }); },
    { x: x + s * .162, y: 1.64, z: z + c * .162, ry, nombre: 'el kiosco de turnos' });
  plano(ctx, .44, .2, 420, (g, w, h) => {
    g.fillStyle = '#0f5f66'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${h * .36}px ${R.FUENTE}`; g.fillText('Tome su turno', w / 2, h * .38);
    g.fillStyle = '#bfe0da'; g.font = `400 ${h * .2}px ${R.FUENTE}`; g.fillText('Atención al cliente · Preferencial', w / 2, h * .74);
  }, { x: x + s * .172, y: .7, z: z + c * .172, ry, nombre: 'el kiosco de turnos' });
  ctx.kiosco = { pantalla, x, z, ry };
  // Cartel de pared encima: «Tome su turno aquí».
  plano(ctx, 1.2, .4, 600, R.cartelFila('Tome su turno aquí', 'Atención al cliente', 'izq'), { x: -4.25, y: 2.35, z: -3.69, ry: Math.PI, nombre: 'el cartel «Tome su turno aquí»' });
}

/* ── Módulo de información ───────────────────────────────────────────── */

function construirInformacion(ctx) {
  const { lote, kit } = ctx, { x, z } = INFORMACION, ry = -.6;
  lote.en(x, 0, z, ry, () => {
    // frente curvo: cinco paños teal alrededor de un arco
    const r = 1.1, n = 7;
    for (let k = 0; k < n; k++) {
      const a = -.7 + 1.4 * (k + .5) / n, px = Math.sin(a) * r, pz = Math.cos(a) * r - r + .35;
      lote.caja(k % 2 ? 'teal' : 'tealOscuro', px, .52, pz, 2 * r * Math.sin(.7 / n) + .01, 1.04, .06, { ry: a, contorno: k === 0 || k === n - 1 ? 'medio' : false, nombre: 'el módulo de información' });
      lote.caja(ctx.materiales.granito, Math.sin(a) * (r - .05), 1.06, Math.cos(a) * (r - .05) - r + .35, 2 * r * Math.sin(.7 / n) + .02, .04, .22, { ry: a, contorno: false, nombre: 'el módulo de información' });
    }
    lote.caja('blanco', 0, .38, -.2, 1.5, .76, .6, { contorno: 'fino' });
    lote.caja('plastico', 0, .76, -.25, 1.6, .03, .65, { contorno: false });
    // silla del anfitrión, monitor, timbre, folletos
    silla(lote, 0, -.9, 0, 'tapizOscuro');
    lote.en(.35, .78, -.4, Math.PI + .2, () => {
      lote.caja('negro', 0, .12, 0, .04, .24, .03, { contorno: false });
      lote.caja('grafito', 0, .3, 0, .5, .3, .03, { contorno: 'medio', nombre: 'el monitor' });
    });
    lote.cil(ctx.kit.metal('oro', .6), -.35, 1.1, .12, .08, .04, { lados: 24, contorno: 'medio', nombre: 'el timbre' });
    lote.esfera(ctx.kit.metal('oro', .6), -.35, 1.13, .12, .07, .04, .07, { contorno: false });
    for (let k = 0; k < 3; k++) lote.caja(['teal', 'oro', 'azul'][k], .15 + k * .14, 1.095, .1, .1, .03, .15, { ry: .1, contorno: false, nombre: 'los folletos' });
  });
  const s = Math.sin(ry), c = Math.cos(ry);
  plano(ctx, .9, .22, 600, R.cartelInformacion, { x: x + s * .37, y: .75, z: z + c * .37, ry, nombre: 'el módulo de información' });
  ctx.colisiones.push([x - 1, z - .7, x + 1, z + .5]);
}

function silla(lote, x, z, ry, tapiz = 'tapiz') {
  lote.en(x, 0, z, ry, () => {
    lote.caja(tapiz, 0, .47, 0, .46, .07, .44, { contorno: 'medio', nombre: 'la silla' });
    lote.caja(tapiz, 0, .78, -.2, .44, .42, .06, { rx: -.1, contorno: 'medio', nombre: 'la silla' });
    lote.cil('aceroOscuro', 0, .25, 0, .05, .42, { contorno: false });
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; lote.caja('negro', Math.sin(a) * .18, .04, Math.cos(a) * .18, .05, .04, .36, { ry: a, contorno: false }); }
    for (const sx of [-1, 1]) lote.caja('negro', sx * .24, .62, -.02, .04, .03, .3, { contorno: false });
  });
}

/* ── Zona de espera y pantalla de turnos ─────────────────────────────── */

function construirEspera(ctx) {
  const { lote, kit } = ctx, acero = kit.metal('acero', .45, 1.8);
  // Bancadas de 5 asientos sobre viga de acero, mirando al norte (pantalla y cajas).
  for (const z of SILLAS.filas) {
    const xa = SILLAS.x0, xb = SILLAS.x0 + SILLAS.paso * (SILLAS.n - 1);
    lote.caja(acero, (xa + xb) / 2, .3, z + .05, xb - xa + .5, .05, .06, { contorno: 'medio', nombre: 'la bancada' });
    for (const x of [xa - .1, xb + .1]) {
      lote.caja(acero, x, .15, z + .05, .05, .3, .05, { contorno: false });
      lote.caja(acero, x, .01, z + .05, .08, .02, .5, { contorno: false });
    }
    for (let k = 0; k < SILLAS.n; k++) {
      const x = xa + k * SILLAS.paso;
      lote.caja('tapiz', x, .44, z, .5, .08, .46, { contorno: 'medio', nombre: 'el asiento' });
      lote.caja('tapiz', x, .74, z + .24, .5, .44, .05, { rx: .12, contorno: 'medio', nombre: 'el asiento' });
      lote.caja(acero, x, .38, z + .02, .06, .08, .3, { contorno: false });
      if (k < SILLAS.n - 1) lote.caja('negro', x + SILLAS.paso / 2, .6, z + .02, .05, .03, .36, { contorno: false, nombre: 'el reposabrazos' });
    }
    lote.sombra((xa + xb) / 2, z + .05, xb - xa + 1, .9, .9);
    if (z === SILLAS.filas[0]) plano(ctx, .3, .2, 240, (c, w, h) => {
      c.fillStyle = '#2f6fb0'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `700 ${h * .2}px ${R.FUENTE}`; c.fillText('Asiento preferente', w / 2, h * .2);
      c.font = `400 ${h * .13}px ${R.FUENTE}`; c.fillText('Ceda este lugar a quien', w / 2, h * .6); c.fillText('lo necesite', w / 2, h * .78);
    }, { x: xa, y: .8, z: z + .27, rx: -.12, nombre: 'el asiento preferente' });
    ctx.colisiones.push([xa - .35, z - .25, xb + .35, z + .3]);
  }
  // Pantalla de turnos en el muro junto a las cajas (tramo este) + cartel.
  const xp = 6.3, zp = Z_MURO_CAJAS + .03;
  lote.caja('negro', xp, 2.05, zp, 1.46, .86, .06, { contorno: 'medio', nombre: 'la pantalla de turnos' });
  ctx.pantallaTurnos = plano(ctx, 1.38, .78, 700, (c, w, h) => { c.fillStyle = '#0d1f22'; c.fillRect(0, 0, w, h); },
    { x: xp, y: 2.05, z: zp + .032, emisivo: true, nombre: 'la pantalla de turnos' });
  lote.caja('grafito', xp - .95, 2.3, zp + .02, .14, .22, .1, { contorno: 'medio', nombre: 'el altavoz' });
  // Puerta del personal (cerrada) con su cartel.
  const { x: dx, ancho, alto } = PUERTA_PERSONAL;
  lote.caja('robleOscuro', dx, alto / 2, Z_MURO_CAJAS - .05, ancho - .04, alto - .02, .05, { contorno: 'fino', nombre: 'la puerta del personal' });
  for (const s of [-1, 1]) lote.caja('aluminio', dx + s * ancho / 2, alto / 2, Z_MURO_CAJAS - .02, .05, alto, .08, { contorno: false });
  lote.caja('aluminio', dx, alto + .02, Z_MURO_CAJAS - .02, ancho + .05, .05, .08, { contorno: false });
  lote.caja(ctx.kit.metal('acero', .6), dx + .33, 1.05, Z_MURO_CAJAS - .005, .16, .03, .05, { contorno: 'medio', nombre: 'la manija' });
  lote.caja('negro', dx - .3, 1.3, Z_MURO_CAJAS + .005, .09, .14, .03, { contorno: false, nombre: 'el lector de tarjetas' });
  plano(ctx, .56, .14, 450, R.soloPersonal, { x: dx, y: 1.62, z: Z_MURO_CAJAS - .02, nombre: 'el cartel «Solo personal autorizado»' });
  ctx.colisiones.push([dx - ancho / 2, Z_MURO_CAJAS - .1, dx + ancho / 2, Z_MURO_CAJAS + .02]);

  // Dispensador de agua con vasos de cono y papelera.
  lote.en(8.55, 0, -4.25, -Math.PI / 2, () => {
    lote.caja('blanco', 0, .5, 0, .32, 1, .32, { contorno: 'medio', nombre: 'el dispensador de agua' });
    lote.cil(kit.esmalte('agua', .4, 2), 0, 1.23, 0, .27, .46, { lados: 24, contorno: 'medio', nombre: 'el garrafón de agua' });
    lote.caja('grafito', 0, .72, .165, .2, .12, .02, { contorno: false });
    lote.caja('azul', -.05, .72, .18, .03, .04, .03, { contorno: false, nombre: 'la llave de agua fría' });
    lote.caja('rojo', .05, .72, .18, .03, .04, .03, { contorno: false, nombre: 'la llave de agua caliente' });
    lote.cil('aluminio', .25, .95, 0, .08, .35, { contorno: 'medio', nombre: 'los vasos de papel' });
    lote.cil('grafito', -.35, .22, .05, .3, .44, { lados: 16, contorno: 'medio', nombre: 'la papelera' });
  });
  ctx.colisiones.push([8.2, -4.9, 9, -3.6]);
  lote.en(8.8, 0, -3.1, -Math.PI / 2, () => {
    lote.cil('aceroOscuro', 0, .55, 0, .05, 1.1, { contorno: false });
    lote.caja('teal', 0, 1.25, 0, .34, .4, .22, { contorno: 'medio', nombre: 'el buzón de sugerencias' });
    lote.caja('negro', 0, 1.4, .111, .2, .012, .004, { contorno: false, nombre: 'la ranura del buzón' });
    lote.cil('grafito', 0, .01, 0, .3, .02, { contorno: false });
  });
  plano(ctx, .3, .1, 300, (c, w, h) => { c.fillStyle = '#0f5f66'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${h * .42}px ${R.FUENTE}`; c.fillText('Buzón de sugerencias', w / 2, h * .52); },
    { x: 8.8 - .112, y: 1.22, z: -3.1, ry: -Math.PI / 2, nombre: 'el buzón de sugerencias' });
  ctx.colisiones.push([8.55, -3.3, 9, -2.9]);
}

/* ── Módulos de atención al cliente ──────────────────────────────────── */

function construirAsesores(ctx) {
  const { lote, kit } = ctx, xe = EDIFICIO.x1;
  const vidrioMampara = ctx.vidrio;
  for (const { z, modulo } of ASESORES) {
    lote.en(xe - 1.25, 0, z, -Math.PI / 2, () => {         // +z local mira al oeste (al cliente)
      // escritorio
      lote.caja('roble', 0, .74, 0, 1.6, .04, .8, { contorno: 'medio', nombre: 'el escritorio' });
      lote.caja('blanco', 0, .37, .32, 1.56, .7, .04, { contorno: 'fino', nombre: 'el escritorio' });
      for (const s of [-1, 1]) lote.caja('blanco', s * .77, .37, 0, .04, .72, .76, { contorno: false });
      // monitor, teclado, documentos, tarjetero, lapicero, planta
      lote.en(.35, .76, -.2, .35, () => {
        lote.caja('negro', 0, .12, 0, .04, .24, .03, { contorno: false });
        lote.caja('grafito', 0, .3, 0, .52, .3, .03, { contorno: 'medio', nombre: 'el monitor' });
        lote.caja('#dfe8ea', 0, .3, -.017, .48, .26, .002, { contorno: false });
      });
      lote.caja('negro', .15, .77, -.05, .4, .02, .13, { contorno: false, nombre: 'el teclado' });
      lote.caja('papel', -.3, .765, .12, .21, .006, .3, { ry: .2, contorno: false, nombre: 'el contrato' });
      lote.caja('papel', -.34, .772, .1, .21, .006, .3, { ry: -.1, contorno: false });
      lote.cil('azul', -.12, .77, .18, .01, .14, { rx: Math.PI / 2, rz: .6, contorno: false, nombre: 'el bolígrafo' });
      lote.caja('grafito', .62, .8, .25, .09, .06, .05, { contorno: false, nombre: 'el tarjetero' });
      lote.cil('blanco', -.65, .82, -.25, .1, .12, { contorno: 'medio', nombre: 'la maceta' });
      lote.esfera('hoja', -.65, .93, -.25, .16, .14, .16, { contorno: 'medio', nombre: 'la planta' });
      // placa del módulo sobre la mesa
      lote.caja('teal', 0, .82, .34, .34, .1, .03, { rx: -.2, contorno: 'medio' });
      // silla del asesor y dos sillas de cliente
      silla(lote, 0, -.7, 0, 'tapizOscuro');
      silla(lote, -.4, .85, Math.PI, 'tapiz'); silla(lote, .4, .85, Math.PI, 'tapiz');
    });
    plano(ctx, .32, .09, 320, R.placaModulo(modulo), { x: xe - 1.25 - .352, y: .822, z, ry: -Math.PI / 2, rx: -.2, nombre: `la placa del módulo ${modulo}` });
    ctx.colisiones.push([xe - 1.7, z - .85, xe, z + .85]);
    // Mampara de vidrio esmerilado hacia el sur de cada módulo.
    const zm = z + 1.02;
    lote.caja('aluminio', xe - 1.1, .06, zm, 1.95, .06, .06, { contorno: false });
    lote.caja('aluminio', xe - 1.1, 1.52, zm, 1.95, .04, .06, { contorno: false });
    const m = new T.Mesh(new T.PlaneGeometry(1.95, 1.4), vidrioMampara);
    m.position.set(xe - 1.1, .8, zm); m.renderOrder = 3; ctx.grupo.add(m);
    plano(ctx, 1.9, .3, 600, R.franjaVidrio, { x: xe - 1.1, y: 1.05, z: zm + .005, alfa: true, doble: true, nombre: 'la mampara de vidrio' });
    ctx.colisiones.push([xe - 2.1, zm - .04, xe, zm + .04]);
  }
  // Cartel grande sobre los módulos.
  plano(ctx, 3.2, .55, 1000, R.cartelModulos, { x: xe - .12, y: 2.75, z: -7.15, ry: -Math.PI / 2, nombre: 'el cartel «Atención al cliente»' });
}

/* ── Zona de ventanales ──────────────────────────────────────────────── */

function construirVentanales(ctx) {
  const { lote, kit } = ctx;
  // Mesa de formularios (de pie): granito sobre base de roble, fichas y bolígrafos con cadena.
  const [mx, mz] = [.9, -2.0];
  lote.en(mx, 0, mz, 0, () => {
    lote.caja('roble', 0, .5, 0, 1.6, 1.0, .5, { contorno: 'medio', nombre: 'la mesa de formularios' });
    lote.caja(ctx.materiales.granito, 0, 1.02, 0, 1.9, .04, .8, { contorno: 'medio', trazo: '#4a4c4f', nombre: 'la mesa de formularios' });
    lote.caja('teal', 0, .06, 0, 1.5, .12, .44, { contorno: false });
    // casillero central: lomo con bandejas a los dos lados y las fichas apoyadas
    lote.caja('grafito', 0, 1.2, 0, 1.52, .32, .03, { contorno: 'medio', nombre: 'el casillero de fichas' });
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const x = -.56 + k * .375;
      lote.caja(kit.metal('aluminio', .3), x, 1.07, s * .07, .32, .05, .1, { contorno: 'medio', trazo: '#80878d', nombre: 'la bandeja de fichas' });
    }
    for (const s of [-1, 1]) for (const x of [-.6, .6]) {
      lote.cil('grafito', x, 1.055, s * .3, .04, .03, { contorno: false, nombre: 'la cadenita del bolígrafo' });
      lote.cil('azul', x + .12, 1.05, s * .28, .01, .15, { rx: Math.PI / 2, rz: .8, contorno: false, nombre: 'el bolígrafo con cadena' });
      lote.caja('aceroOscuro', x + .06, 1.045, s * .29, .12, .004, .006, { ry: .3, contorno: false });
    }
  });
  const etiquetas = ['Depósito', 'Retiro', 'Pago de servicios', 'Transferencia'];
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    plano(ctx, .3, .045, 300, R.etiquetaFichas(etiquetas[k]), { x: mx - .56 + k * .375, y: 1.07, z: mz + s * .1205, ry: s > 0 ? 0 : Math.PI, nombre: `las fichas de ${etiquetas[k].toLowerCase()}` });
    plano(ctx, .27, .19, 200, R.fichaDeposito, { x: mx - .56 + k * .375 , y: 1.185, z: mz + s * .054, ry: s > 0 ? 0 : Math.PI, rx: -.18, nombre: 'la ficha de depósito' });
  }
  ctx.colisiones.push([mx - .95, mz - .4, mx + .95, mz + .4]);
  lote.sombra(mx, mz, 2.4, 1.2, .9);

  // Folletero junto a la mampara del vestíbulo.
  lote.en(-3.15, 0, -1.6, Math.PI / 2, () => {
    lote.caja('grafito', 0, .8, 0, .7, 1.6, .06, { contorno: 'medio', nombre: 'el folletero' });
    lote.caja('grafito', 0, .01, .1, .6, .02, .35, { contorno: false });
    for (let f = 0; f < 4; f++) for (let k = 0; k < 3; k++) lote.caja(kit.metal('aluminio', .3), -.22 + k * .22, .42 + f * .32, .06, .2, .02, .08, { contorno: false });
  });
  const folletos = [['Cuenta de ahorro', '#0f5f66'], ['Tarjeta de crédito', '#e2a93b'], ['Préstamo personal', '#2f6fb0'], ['Seguros', '#4f8a4a'], ['Banca en línea', '#2a8a8f'], ['Inversiones', '#6a4a30']];
  for (let f = 0; f < 4; f++) for (let k = 0; k < 3; k++) {
    const [t, col] = folletos[(f * 3 + k) % folletos.length];
    plano(ctx, .18, .26, 128, R.folleto(t, col), { x: -3.15 + .07, y: .56 + f * .32, z: -1.6 - (-.22 + k * .22), ry: Math.PI / 2, rx: 0, nombre: `el folleto «${t}»` });
  }
  ctx.colisiones.push([-3.4, -2, -3.0, -1.2]);

  // Tótem de banca en línea con tableta.
  lote.en(4.6, 0, -1.8, -.3, () => {
    lote.caja('blanco', 0, .5, 0, .3, 1, .3, { contorno: 'medio', nombre: 'el tótem de banca en línea' });
    lote.caja('grafito', 0, 1.1, .05, .34, .26, .03, { rx: -.6, contorno: 'medio', nombre: 'la tableta' });
    lote.caja('teal', 0, .02, 0, .45, .04, .45, { contorno: false });
  });
  plano(ctx, .3, .22, 300, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a8a8f'); g.addColorStop(1, '#0a4349'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${h * .13}px ${R.FUENTE}`; c.fillText('Banca en línea', w / 2, h * .3);
    c.font = `400 ${h * .09}px ${R.FUENTE}`; c.fillText('Descargue la app', w / 2, h * .5);
    c.fillStyle = '#fff'; c.fillRect(w * .4, h * .62, w * .2, h * .28); c.fillStyle = '#0a4349';
    for (let i = 0; i < 25; i++) if ((i * 7) % 3) c.fillRect(w * .41 + (i % 5) * w * .036, h * .64 + Math.floor(i / 5) * h * .05, w * .03, h * .04);
  }, { x: 4.6 + Math.sin(-.3) * .08, y: 1.11, z: -1.8 + Math.cos(-.3) * .08, ry: -.3, rx: -.6, emisivo: true, nombre: 'la tableta' });
  ctx.colisiones.push([4.35, -2.05, 4.85, -1.55]);

  // Plantas grandes y papeleras.
  for (const [x, z] of [[8.4, -.6], [-2.95, -3.1], [8.4, -2.9]]) {
    lote.cil('maceta', x, .3, z, .55, .6, { lados: 24, contorno: 'medio', nombre: 'la maceta' });
    lote.cil('tierra', x, .6, z, .5, .02, { lados: 24, contorno: false });
    for (let k = 0; k < 9; k++) lote.esfera(k % 2 ? 'hoja' : 'hojaOscura', x + Math.sin(k * 2.4) * .22, .9 + (k % 4) * .28, z + Math.cos(k * 2.4) * .22, .42, .5, .42, { contorno: 'medio', nombre: 'la planta' });
    lote.sombra(x, z, .9, .9, 1);
    ctx.colisiones.push([x - .3, z - .3, x + .3, z + .3]);
  }
  lote.cil('grafito', 2.15, .3, -2.0, .32, .6, { lados: 16, contorno: 'medio', nombre: 'la papelera' });
}

/* ── Carteles de pared (a la vista de quien hace la fila) ────────────── */

function construirCarteles(ctx) {
  const { lote } = ctx, xo = EDIFICIO.x0 + .11;
  // Pantalla de tipo de cambio (muro oeste, frente a la fila).
  lote.caja('negro', xo + .03, 1.95, -7.1, .06, .95, 1.45, { contorno: 'medio', nombre: 'la pantalla del tipo de cambio' });
  plano(ctx, 1.38, .88, 700, R.tipoCambio, { x: xo + .065, y: 1.95, z: -7.1, ry: Math.PI / 2, emisivo: true, nombre: 'la pantalla del tipo de cambio' });
  // Publicidad enmarcada.
  const cuadro = (x, y, z, ry, w, h, dibujar, nombre) => {
    lote.en(x, y, z, ry, () => lote.caja('grafito', 0, 0, -.015, w + .06, h + .06, .03, { contorno: 'medio', nombre }));
    plano(ctx, w, h, 600, dibujar, { x: x + Math.sin(ry) * .003, y, z: z + Math.cos(ry) * .003, ry, nombre });
  };
  cuadro(xo + .03, 1.65, -4.9, Math.PI / 2, .7, 1.0, R.posterAhorro, 'el cartel «Cuenta de ahorro»');
  cuadro(xo + .03, 1.65, -9.3, Math.PI / 2, .7, 1.0, R.posterPrestamo, 'el cartel «Préstamo personal»');
  cuadro(-8.1, 1.7, Z_MURO_CAJAS + .03, 0, .7, 1.0, R.posterTarjeta, 'el cartel «Tarjeta de crédito»');
  cuadro(8.87, 1.7, -3.95, -Math.PI / 2, .7, 1.0, R.posterAhorro, 'el cartel «Cuenta de ahorro»');
  // Avisos (placas blancas).
  cuadro(xo + .03, 1.5, -5.95, Math.PI / 2, .34, .44, R.avisoCelular, 'el aviso «Evite usar el celular»');
  cuadro(xo + .03, 1.5, -8.25, Math.PI / 2, .3, .36, R.avisoFumar, 'el aviso «Prohibido fumar»');
  // Horario (muro del vestíbulo, lado sala) y cartel colgante «Salida».
  cuadro(-8.2, 1.6, -3.73, Math.PI, .9, .6, R.horario, 'el horario de atención');
  // Extintor con su señal.
  lote.cil('rojo', xo + .14, .45, -10.3, .16, .55, { lados: 16, contorno: 'medio', nombre: 'el extintor' });
  lote.cil('negro', xo + .14, .78, -10.3, .05, .1, { contorno: false });
  lote.caja('negro', xo + .06, .72, -10.3, .03, .1, .05, { contorno: false });
  plano(ctx, .22, .3, 200, (c, w, h) => {
    c.fillStyle = '#d5302e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillRect(w * .38, h * .18, w * .24, h * .5); c.fillRect(w * .44, h * .1, w * .2, h * .1);
    c.font = `700 ${h * .12}px ${R.FUENTE}`; c.fillText('EXTINTOR', w / 2, h * .85);
  }, { x: xo + .01, y: 1.3, z: -10.3, ry: Math.PI / 2, nombre: 'la señal del extintor' });

  // Carteles colgantes (dos caras) con cables al techo.
  const colgante = (x, z, ry, w, h, dibujar, nombre, y = 3.05) => {
    lote.en(x, y, z, ry, () => {
      lote.caja('teal', 0, 0, 0, w + .04, h + .04, .05, { contorno: 'fino', nombre });
      for (const s of [-1, 1]) lote.cil('acero', s * w * .4, (H - y) / 2 + h / 4, 0, .008, H - y - h / 2, { contorno: false });
    });
    for (const s of [1, -1]) plano(ctx, w, h, 700, dibujar, { x: x + Math.sin(ry) * .027 * s, y, z: z + Math.cos(ry) * .027 * s, ry: s > 0 ? ry : ry + Math.PI, nombre });
  };
  colgante(-3.9, -8.9, 0, 1.9, .55, R.cartelCajas, 'el cartel «Cajas»');
  colgante(5.2, -4.2, -Math.PI / 2.4, 2.1, .5, R.cartelColgante('Atención al cliente', 'Módulos 1 · 2 · 3', 0), 'el cartel «Atención al cliente»');
  colgante(-6.2, -4.3, Math.PI, 1.5, .45, R.cartelColgante('Salida', 'Cajeros automáticos', Math.PI / 2), 'el cartel «Salida»', 3.1);
  // Letrero de llamada sobre la línea de cajas (quién pasa a qué caja).
  lote.caja('negro', 2.2, 3.28, M.z + .23, 2.3, .34, .06, { contorno: 'fino', nombre: 'el letrero de llamada' });
  ctx.panelLlamada = plano(ctx, 2.2, .28, 900, R.panelLlamada({}), { x: 2.2, y: 3.28, z: M.z + .262, emisivo: true, nombre: 'el letrero de llamada' });
}
