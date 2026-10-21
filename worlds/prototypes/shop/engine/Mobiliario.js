import * as T from './three.js';
import { PALETA, ilustracion } from './Kit.js';
import { LOCAL, GONDOLAS, largoGondola, CAJAS, carrilCaja, ISLA, ESCAPARATE, BANCA, CANASTAS, ALMACEN,
  MURAL, FRIO, FRESCOS } from './config.js';

/* Mobiliario de La Estrella.  Cada mueble registra sus ESTANTES (superficies
   donde el surtido coloca productos) en ctx.estantes con un marco local:
   los productos se alinean en x local (−largo/2 … largo/2) y miran a +z local;
   `ry` lleva ese marco al mundo.  Así Surtido no sabe nada de la planta. */

const estante = (ctx, zona, x, y, z, ry, largo, fondo, altoLibre, extra = {}) =>
  ctx.estantes.push({ zona, x, y, z, ry, largo, fondo, altoLibre, ...extra });
const rect = (ctx, x0, z0, x1, z1) => ctx.colisiones.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

// ── Góndolas dobles con cabeceras ──────────────────────────────────────
export function construirGondolas(ctx) {
  const { lote } = ctx, G = GONDOLAS, L = largoGondola(), w = G.ancho, cab = G.cabecera;
  G.x.forEach((x, i) => {
    const zc = G.z0 + L / 2, n = i + 1;
    lote.en(x, 0, zc, 0, () => {
      lote.bloque('grafito', -w / 2 + .03, 0, -L / 2, w / 2 - .03, G.zocalo, L / 2, { nombre: `la góndola ${n}` });
      lote.bloque('gondolaFondo', -.03, G.zocalo, -L / 2, .03, G.alto, L / 2, { nombre: `la góndola ${n}` });
      lote.bloque('gondola', -.05, G.alto - .04, -L / 2 - cab, .05, G.alto, L / 2 + cab);
      for (let m = 0; m <= G.modulos; m++) lote.bloque('gondola', -.05, G.zocalo, -L / 2 + m * G.modulo - .025, .05, G.alto, -L / 2 + m * G.modulo + .025);
      for (const lado of [-1, 1]) G.baldas.forEach((y, k) => {
        const x0 = lado * .03, x1 = lado * (w / 2);
        lote.bloque('balda', x0, y - .03, -L / 2, x1, y, L / 2, { nombre: 'una balda' });
        lote.bloque('riel', x1 - lado * .012, y - .055, -L / 2, x1, y, L / 2, { contorno: false });
      });
      // Cabeceras: dos extremos, estantes mirando a ±z
      for (const s of [-1, 1]) {
        const z0 = s * L / 2, z1 = s * (L / 2 + cab);
        lote.bloque('grafito', -w / 2 + .03, 0, z0, w / 2 - .03, G.zocalo, z1 - s * .03);
        lote.bloque('rojo', -w / 2, G.zocalo, z0, -w / 2 + .04, G.alto, z1, { nombre: 'la cabecera de la góndola' });
        lote.bloque('rojo', w / 2 - .04, G.zocalo, z0, w / 2, G.alto, z1, { nombre: 'la cabecera de la góndola' });
        lote.bloque('gondolaFondo', -w / 2, G.zocalo, z0, w / 2, G.alto, z0 + s * .04);
        for (const y of G.baldas) {
          lote.bloque('balda', -w / 2 + .04, y - .03, z0 + s * .04, w / 2 - .04, y, z1);
          lote.bloque('riel', -w / 2 + .04, y - .055, z1 - s * .012, w / 2 - .04, y, z1, { contorno: false });
        }
      }
      lote.sombra(0, 0, w + .3, L + 2 * cab + .3);
    });
    // Estantes (mundo): lados este/oeste y cabeceras sur/norte
    G.baldas.forEach((y, k) => {
      const libre = (G.baldas[k + 1] ?? G.alto + .05) - y - .06;
      estante(ctx, `g${n}e`, x + w / 4 + .01, y, zc, Math.PI / 2, L - .04, w / 2 - .06, libre, { gondola: n, lado: 'e', nivel: k });
      estante(ctx, `g${n}o`, x - w / 4 - .01, y, zc, -Math.PI / 2, L - .04, w / 2 - .06, libre, { gondola: n, lado: 'o', nivel: k });
      estante(ctx, `g${n}s`, x, y, zc + L / 2 + cab / 2 + .02, 0, w - .1, cab - .08, libre, { gondola: n, lado: 's', nivel: k, cabecera: true });
      estante(ctx, `g${n}n`, x, y, zc - L / 2 - cab / 2 - .02, Math.PI, w - .1, cab - .08, libre, { gondola: n, lado: 'n', nivel: k, cabecera: true });
    });
    rect(ctx, x - w / 2, zc - L / 2 - cab, x + w / 2, zc + L / 2 + cab);
  });
}

// ── Estantería mural (pared oeste): baldas o panel ranurado arriba ────────
export function construirMural(ctx, { colgados = false } = {}) {
  const { lote } = ctx, M = MURAL, L = M.modulos * M.modulo, x0 = M.x0, x1 = M.x0 + M.fondo, zc = M.z0 + L / 2;
  lote.bloque('gondolaFondo', x0, .1, M.z0, x0 + .04, M.alto, M.z0 + L, { nombre: 'la estantería de la pared' });
  lote.bloque('grafito', x0, 0, M.z0, x1 - .02, .12, M.z0 + L);
  lote.bloque('gondola', x0, M.alto - .05, M.z0, x1, M.alto, M.z0 + L);
  for (let m = 0; m <= M.modulos; m++) lote.bloque('gondola', x0 + .04, .12, M.z0 + m * M.modulo - .025, x1, M.alto, M.z0 + m * M.modulo + .025);
  const baldas = colgados ? M.baldas.slice(0, 3) : M.baldas;
  if (colgados) {   // panel ranurado con ganchos (productos colgados)
    lote.bloque('madera', x0 + .04, 1.1, M.z0, x0 + .06, M.alto - .05, M.z0 + L, { nombre: 'el panel de ganchos', contorno: false });
  }
  baldas.forEach((y, k) => {
    lote.bloque('balda', x0 + .04, y - .03, M.z0, x1, y, M.z0 + L, { nombre: 'una balda' });
    lote.bloque('riel', x1 - .012, y - .055, M.z0, x1, y, M.z0 + L, { contorno: false });
    const libre = (baldas[k + 1] ?? (colgados ? 1.08 : M.alto)) - y - .06;
    estante(ctx, 'mural', (x0 + .04 + x1) / 2, y, zc, Math.PI / 2, L - .04, M.fondo - .08, libre, { nivel: k });
  });
  if (colgados) {
    const filas = [1.3, 1.62];
    filas.forEach((y, k) => estante(ctx, 'colgados', x0 + .06, y, zc, Math.PI / 2, L - .1, .1, .28, { nivel: k, colgado: true }));
  }
  rect(ctx, x0, M.z0, x1, M.z0 + L);
}

// ── Refrigeradores verticales de puertas de vidrio (fondo, modo súper) ─────
export function construirFrio(ctx) {
  const { lote, kit } = ctx, F = FRIO, z1 = F.z0 + F.fondo;
  const baldas = [.2, .62, 1.02, 1.42];
  for (let i = 0; i < F.n; i++) {
    const x0 = F.x0 + i * F.ancho, x1 = x0 + F.ancho, xc = (x0 + x1) / 2;
    lote.bloque('blanco', x0, 0, F.z0, x0 + .05, F.alto, z1, { nombre: 'el refrigerador' });
    lote.bloque('blanco', x1 - .05, 0, F.z0, x1, F.alto, z1, { nombre: 'el refrigerador' });
    lote.bloque('grafito', x0, 0, F.z0 + .1, x1, .18, z1);
    lote.bloque('blanco', x0, F.alto - .3, F.z0, x1, F.alto, z1, { nombre: 'el refrigerador' });
    lote.bloque('grisClaro', x0 + .05, .18, F.z0, x1 - .05, F.alto - .3, F.z0 + .04, { contorno: false });
    lote.caja(kit.emisivo('#eaf6ff'), xc, F.alto - .33, F.z0 + .35, F.ancho - .2, .02, .05);        // tira LED interior
    for (const y of baldas.slice(1)) lote.bloque('acero', x0 + .05, y - .02, F.z0 + .04, x1 - .05, y, z1 - .08, { contorno: false });
    baldas.forEach((y, k) => estante(ctx, 'frio', xc, y, F.z0 + (F.fondo - .04) / 2, 0, F.ancho - .14, F.fondo - .16, (baldas[k + 1] ?? F.alto - .3) - y - .05, { nivel: k, puerta: i }));
    // Dos puertas de vidrio con tirador
    for (const s of [0, 1]) {
      const px0 = x0 + .05 + s * (F.ancho - .1) / 2, px1 = px0 + (F.ancho - .1) / 2;
      lote.bloque('aceroOscuro', px0, .18, z1 - .03, px0 + .03, F.alto - .3, z1);
      lote.bloque('aceroOscuro', px1 - .03, .18, z1 - .03, px1, F.alto - .3, z1);
      lote.bloque('acero', s ? px0 + .06 : px1 - .09, .8, z1, s ? px0 + .09 : px1 - .06, 1.5, z1 + .04, { nombre: 'la puerta del refrigerador' });
    }
  }
  const vidrio = new T.Mesh(ctx.kit.geo.plano, ctx.kit.vidrio('#d8f0ff', .16));
  vidrio.scale.set(F.n * F.ancho - .1, F.alto - .48, 1); vidrio.position.set(F.x0 + F.n * F.ancho / 2, .18 + (F.alto - .48) / 2, z1 - .015);
  vidrio.renderOrder = 4; vidrio.name = 'vidrio-frio'; ctx.grupo.add(vidrio);
  rect(ctx, F.x0, F.z0, F.x0 + F.n * F.ancho, z1 + .05);
}

// ── Frescos: escalones inclinados con cajones (pared este, modo súper) ─────
export function construirFrescos(ctx) {
  const { lote } = ctx, F = FRESCOS, x1 = F.x1, x0 = F.x1 - F.fondo, L = F.modulos * F.modulo, zc = F.z0 + L / 2;
  const escalones = [{ y: .72, x: x0 + .02, f: .45 }, { y: .98, x: x0 + .42, f: .42 }, { y: 1.24, x: x0 + .8, f: .42 }];
  lote.bloque('maderaOscura', x0, 0, F.z0, x1, .7, F.z0 + L, { nombre: 'el mueble de frutas y verduras' });
  lote.bloque('verdeOscuro', x0 - .005, .08, F.z0, x0, .6, F.z0 + L, { contorno: false });
  lote.bloque('maderaOscura', x1 - .1, 0, F.z0, x1, 1.6, F.z0 + L);        // respaldo: por debajo del rótulo de pared
  for (const e of escalones) {
    lote.bloque('madera', e.x, e.y - .08, F.z0, e.x + e.f, e.y, F.z0 + L, { contorno: 'medio' });
    for (let m = 0; m < F.modulos; m++) for (const k of [0, 1]) {   // cajones
      const za = F.z0 + m * F.modulo + k * F.modulo / 2 + .03, zb = za + F.modulo / 2 - .06;
      lote.bloque('madera', e.x + .02, e.y, za, e.x + e.f - .02, e.y + .1, za + .02);
      lote.bloque('madera', e.x + .02, e.y, zb - .02, e.x + e.f - .02, e.y + .1, zb);
      lote.bloque('madera', e.x + .02, e.y, za, e.x + .04, e.y + .08, zb);
      estante(ctx, 'fresco', e.x + e.f / 2, e.y, (za + zb) / 2, -Math.PI / 2, zb - za - .06, e.f - .08, .2, { cajon: m * 2 + k, escalon: escalones.indexOf(e) });
    }
  }
  // báscula en el extremo sur
  lote.bloque('acero', x0 + .1, .7, F.z0 + L - .5, x0 + .45, .74, F.z0 + L - .15, { nombre: 'la báscula' });
  lote.bloque('grafito', x0 + .15, .74, F.z0 + L - .2, x0 + .4, .95, F.z0 + L - .17, { nombre: 'la báscula' });
  rect(ctx, x0, F.z0, x1, F.z0 + L);
}

// ── Pared este en modo general: estantería de regalos ──────────────────
export function construirVitrinaEste(ctx) {
  const { lote } = ctx, F = FRESCOS, x1 = F.x1, x0 = F.x1 - .55, L = F.modulos * F.modulo, zc = F.z0 + L / 2;
  const baldas = [.12, .55, .98, 1.41];
  lote.bloque('maderaOscura', x1 - .04, .1, F.z0, x1, 1.9, F.z0 + L, { nombre: 'la estantería de regalos' });
  lote.bloque('madera', x0, 1.85, F.z0, x1, 1.9, F.z0 + L);
  for (let m = 0; m <= F.modulos; m++) lote.bloque('madera', x0, 0, F.z0 + m * F.modulo - .025, x1, 1.9, F.z0 + m * F.modulo + .025);
  baldas.forEach((y, k) => {
    lote.bloque('madera', x0, y - .03, F.z0, x1 - .04, y, F.z0 + L, { nombre: 'una balda' });
    estante(ctx, 'este', (x0 + x1 - .04) / 2, y, zc, -Math.PI / 2, L - .04, .47, (baldas[k + 1] ?? 1.85) - y - .06, { nivel: k });
  });
  rect(ctx, x0, F.z0, x1, F.z0 + L);
}

// ── Exposición especial (fondo, modo general): tarimas escalonadas ────────
export function construirExposicion(ctx) {
  const { lote } = ctx, F = FRIO, x0 = F.x0, x1 = F.x0 + F.n * F.ancho, z0 = F.z0;
  lote.bloque('crema', x0, 0, z0, x1, 2.4, z0 + .06, { nombre: 'el panel de la exposición', contorno: false });
  const tarimas = [{ z: z0 + .06, f: .45, y: .6 }, { z: z0 + .51, f: .45, y: .35 }];
  for (const t of tarimas) {
    lote.bloque('blanco', x0, 0, t.z, x1, t.y, t.z + t.f, { nombre: 'la tarima de exposición' });
    lote.bloque('rojo', x0, t.y - .02, t.z + t.f - .01, x1, t.y, t.z + t.f, { contorno: false });
  }
  const n = 7, paso = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const xc = x0 + paso * (i + .5);
    estante(ctx, 'expo', xc, .6, z0 + .06 + .225, 0, paso - .3, .36, .9, { hueco: i, fila: 0 });
    estante(ctx, 'expo', xc, .35, z0 + .51 + .225, 0, paso - .3, .36, .7, { hueco: i, fila: 1 });
  }
  rect(ctx, x0, z0, x1, z0 + .96);
}

// ── Caja: dos muebles de caja con carril, fila y rack de impulso ──────────
export function construirCajas(ctx) {
  const { lote, kit } = ctx, C = CAJAS;
  C.x.forEach((x, i) => {
    const n = i + 1, xa = x - C.ancho / 2, xb = x + C.ancho / 2, carril = carrilCaja(i);
    // Mueble
    lote.bloque('blanco', xa, 0, C.z0, xb, C.alto - .03, C.z1, { nombre: `la caja ${n}` });
    lote.bloque('rojo', xb - .01, .1, C.z0, xb + .005, C.alto - .1, C.z1, { contorno: false });
    lote.bloque('grisClaro', xa - .02, C.alto - .03, C.z0 - .02, xb + .02, C.alto, C.z1 + .02, { nombre: 'el mostrador' });
    lote.bloque('negro', xa + .06, C.alto, C.z0 + .02, xb - .06, C.alto + .02, C.z0 + C.cinta, { nombre: 'la banda de la caja' });
    lote.bloque('grafito', xb - .04, C.alto, C.z0, xb - .01, C.alto + .06, C.z0 + C.cinta);
    lote.caja(kit.emisivo('#ff5a4a'), x, C.alto + .005, C.z0 + C.cinta + .15, .22, .01, .16);             // lector de código de barras
    // Registradora: pantalla hacia el cajero (oeste) y visor al cliente (este)
    const zr = C.z1 - .55;
    lote.bloque('grafito', xa - .02, C.alto, zr - .2, xa + .32, C.alto + .1, zr + .2, { nombre: 'la caja registradora' });
    lote.en(xa + .18, C.alto + .1, zr, 0, () => {
      lote.cil('grafito', 0, .12, 0, .04, .24);
      lote.caja('negro', 0, .32, 0, .05, .22, .34, { rz: -.2, nombre: 'la pantalla de la caja' });
      lote.caja(kit.emisivo('#8fd0ff'), -.03, .32, 0, .005, .18, .3, { rz: -.2 });
      lote.caja('negro', .22, .22, .12, .04, .08, .14, { nombre: 'el visor del cliente' });
      lote.caja(kit.emisivo('#b9f2a8'), .245, .22, .12, .005, .06, .12);
    });
    lote.bloque('gris', xa - .02, C.alto - .16, zr - .22, xa + .3, C.alto - .04, zr + .22, { nombre: 'el cajón del dinero' });
    // Datáfono en su soporte, del lado del cliente
    lote.en(xb - .06, C.alto, zr + .35, 0, () => {
      lote.cil('acero', 0, .08, 0, .03, .16);
      lote.caja('grafito', 0, .2, 0, .09, .03, .17, { rx: 0, rz: .5, nombre: 'el datáfono' });
      lote.caja(kit.emisivo('#bfe8ff'), .01, .218, -.03, .06, .003, .07, { rz: .5 });
    });
    // Zona de embolsar al final (sur) con bolsas
    lote.bloque('acero', xa + .05, C.alto, C.z1 - .02, xb - .05, C.alto + .5, C.z1);
    for (let k = 0; k < 4; k++) lote.caja(k % 2 ? 'blanco' : 'rojo', x - .12 + k * .08, C.alto + .12, C.z1 - .12, .06, .22, .16, { nombre: 'las bolsas', contorno: false });
    // Rack de impulso en el borde este del carril
    const rx0 = carril + C.carril / 2, rx1 = rx0 + .36, rz0 = C.z0, rz1 = C.z0 + 1.0;
    lote.bloque('grafito', rx0, 0, rz0, rx1, .1, rz1, { nombre: 'el exhibidor de dulces' });
    lote.bloque('gondolaFondo', rx1 - .03, .1, rz0, rx1, 1.25, rz1);
    for (const y of [.35, .65, .95]) {
      lote.bloque('balda', rx0, y - .02, rz0, rx1 - .03, y, rz1, { nombre: 'el exhibidor de dulces' });
      estante(ctx, 'impulso', (rx0 + rx1 - .03) / 2, y, (rz0 + rz1) / 2, -Math.PI / 2, rz1 - rz0 - .04, rx1 - rx0 - .08, .24, { caja: n });
    }
    rect(ctx, rx0, rz0, rx1, rz1);
    // Poste con número de caja
    lote.cil('aceroOscuro', xb - .05, 1.15, C.z0 + .05, .05, 2.3 - C.alto, { lados: 8 });
    const num = ilustracion(.36, .36, 256, (c, w, h) => {
      c.fillStyle = PALETA.rojo; c.beginPath(); c.roundRect(0, 0, w, h, 34); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `bold ${h * .2}px system-ui, sans-serif`; c.fillText('CAJA', w / 2, h * .25);
      c.font = `900 ${h * .56}px system-ui, sans-serif`; c.fillText(String(n), w / 2, h * .64);
    }, 'cartel', { doble: true });
    num.position.set(xb - .05, 2.45, C.z0 + .05); num.userData.nombre = `la caja ${n}`;
    ctx.grupo.add(num); ctx.pulsables.push(num);
    // Fila: línea «Espere aquí» y postes con cinta
    lote.bloque('amarillo', carril - C.carril / 2 + .05, 0, C.espera - .04, carril + C.carril / 2 - .05, .006, C.espera + .04, { contorno: false, nombre: 'la línea de espera' });
    const txt = ilustracion(.9, .22, 512, (c, w, h) => {
      c.fillStyle = PALETA.amarillo; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2c2f';
      c.font = `bold ${h * .5}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ESPERE AQUÍ', w / 2, h * .54);
    });
    txt.rotation.x = -Math.PI / 2; txt.rotation.z = Math.PI; txt.position.set(carril, .008, C.espera - .22);
    txt.userData.nombre = 'el aviso «Espere aquí»'; ctx.grupo.add(txt); ctx.pulsables.push(txt);
    for (const z of [C.espera - .05, C.espera - C.fila]) for (const xs of [carril - C.carril / 2 + .06, carril + C.carril / 2 - .06]) {
      if (i === 0 && xs < carril && z === C.espera - .05) continue;
      lote.cil('aceroOscuro', xs, .5, z, .05, 1.0, { lados: 8, nombre: 'el poste de la fila' });
      lote.cil('grafito', xs, .02, z, .3, .04, { lados: 16 });
    }
    lote.bloque('rojo', carril + C.carril / 2 - .075, .86, C.espera - C.fila, carril + C.carril / 2 - .045, .92, C.espera - .05, { nombre: 'la cinta de la fila', contorno: false });
    rect(ctx, xa - .8, C.z0, xb, C.z1);        // mueble + puesto del cajero
    lote.sombra(x, (C.z0 + C.z1) / 2, C.ancho + .3, C.z1 - C.z0 + .3);
  });
}

// ── Isla de promoción: mesa con peldaño central y poste de cartel ─────────
export function construirIsla(ctx) {
  const { lote } = ctx, I = ISLA;
  lote.en(I.x, 0, I.z, 0, () => {
    lote.bloque('maderaOscura', -I.ancho / 2 + .05, 0, -I.fondo / 2 + .05, I.ancho / 2 - .05, I.alto - .04, I.fondo / 2 - .05, { nombre: 'la mesa de ofertas' });
    lote.bloque('madera', -I.ancho / 2, I.alto - .04, -I.fondo / 2, I.ancho / 2, I.alto, I.fondo / 2, { nombre: 'la mesa de ofertas' });
    lote.bloque('madera', -.45, I.alto, -.2, .45, I.alto + I.peldaño, .2, { nombre: 'la mesa de ofertas' });
    lote.bloque('rojo', -I.ancho / 2 + .05, .12, I.fondo / 2 - .06, I.ancho / 2 - .05, I.alto - .12, I.fondo / 2 - .04, { contorno: false });
    // El poste acaba en el borde inferior del cartel (Modo lo cuelga en ISLA.cartelY, un poco al sur)
    const pie = I.alto + I.peldaño, tope = I.cartelY - I.cartel[1] / 2 + .08;
    lote.cil('aceroOscuro', 0, (pie + tope) / 2, 0, .04, tope - pie, { lados: 8 });
    lote.sombra(0, 0, I.ancho + .3, I.fondo + .3);
  });
  // Estantes de la mesa: tablero bajo (sur y norte) y peldaño central
  estante(ctx, 'isla', I.x, I.alto, I.z + .35, 0, I.ancho - .1, .32, .3, { nivel: 0 });
  estante(ctx, 'isla', I.x, I.alto, I.z - .35, Math.PI, I.ancho - .1, .32, .3, { nivel: 0 });
  estante(ctx, 'isla', I.x, I.alto + I.peldaño, I.z, 0, .86, .36, .3, { nivel: 1 });
  rect(ctx, I.x - I.ancho / 2, I.z - I.fondo / 2, I.x + I.ancho / 2, I.z + I.fondo / 2);
}

// ── Escaparate (plataforma interior), banca de espera y canastas ──────────
export function construirEntrada(ctx) {
  const { lote } = ctx, E = ESCAPARATE, zf = LOCAL.z1;
  lote.bloque('madera', E.x0, 0, zf - E.fondo, E.x1, E.y0, zf, { nombre: 'la plataforma del escaparate' });
  lote.bloque('rojo', E.x0, E.y0 - .02, zf - E.fondo, E.x1, E.y0, zf - E.fondo + .02, { contorno: false });
  estante(ctx, 'escaparate', (E.x0 + E.x1) / 2, E.y0, zf - E.fondo / 2, 0, E.x1 - E.x0 - .2, E.fondo - .2, 1.6, {});
  rect(ctx, E.x0, zf - E.fondo, E.x1, zf);
  // Banca
  const B = BANCA;
  lote.en(B.x, 0, B.z, 0, () => {
    for (const z of [-B.largo / 2 + .1, B.largo / 2 - .1]) lote.bloque('aceroOscuro', -B.fondo / 2 + .04, 0, z - .03, B.fondo / 2 - .04, .42, z + .03);
    for (let k = 0; k < 4; k++) lote.bloque('madera', -B.fondo / 2 + k * B.fondo / 4 + .01, .42, -B.largo / 2, -B.fondo / 2 + (k + 1) * B.fondo / 4 - .01, .46, B.largo / 2, { nombre: 'la banca' });
    lote.bloque('madera', B.fondo / 2 - .05, .5, -B.largo / 2, B.fondo / 2 - .02, .85, B.largo / 2, { nombre: 'la banca' });
    lote.sombra(0, 0, B.fondo + .2, B.largo + .2);
  });
  rect(ctx, B.x - B.fondo / 2, B.z - B.largo / 2, B.x + B.fondo / 2, B.z + B.largo / 2);
  // Canastas apiladas
  const K = CANASTAS;
  for (let k = 0; k < 7; k++) lote.en(K.x, .02 + k * .09, K.z, 0, () => {
    lote.bloque('rojo', -.2, 0, -.15, .2, .2, .15, { nombre: 'las canastas', contorno: k === 6 ? 'medio' : false });
    lote.bloque('rojoOscuro', -.21, .19, -.16, .21, .21, .16, { contorno: false });
  });
  lote.bloque('grafito', K.x - .24, 0, K.z - .19, K.x + .24, .02, K.z + .19);
  rect(ctx, K.x - .25, K.z - .2, K.x + .25, K.z + .2);
}

// ── Almacén: racks metálicos, cajas de cartón y estiba ─────────────────────
export function construirAlmacen(ctx) {
  const { lote } = ctx, A = ALMACEN;
  const rack = (x0, z0, x1, z1, niveles = [.15, .8, 1.45, 2.1]) => {
    for (const [px, pz] of [[x0, z0], [x1 - .05, z0], [x0, z1 - .05], [x1 - .05, z1 - .05]]) lote.bloque('azul', px, 0, pz, px + .05, 2.4, pz + .05);
    for (const y of niveles) lote.bloque('naranja', x0, y - .04, z0, x1, y, z1, { nombre: 'el estante del almacén' });
    for (const y of niveles) estante(ctx, 'almacen', (x0 + x1) / 2, y, (z0 + z1) / 2, 0, x1 - x0 - .1, z1 - z0 - .1, .5, {});
    rect(ctx, x0, z0, x1, z1);
  };
  rack(A.x0 + .15, A.z0 + .05, A.x0 + 2.0, A.z0 + .65);
  rack(A.x0 + 2.1, A.z0 + .05, A.x1 - .1, A.z0 + .65);
  rack(A.x0 + .05, A.z0 + 1.1, A.x0 + .65, A.z1 - .15, [.15, .8, 1.45]);
  // Estiba con cajas
  const ex = A.x0 + 1.6, ez = -12.45;
  lote.bloque('estiba', ex - .5, 0, ez - .4, ex + .5, .14, ez + .4, { nombre: 'la estiba' });
  const r = [[-.24, -.2, 0], [.24, -.2, 0], [-.24, .2, 0], [.24, .2, 0], [-.24, -.2, 1], [.24, .2, 1], [0, 0, 2]];
  for (const [dx, dz, k] of r) lote.caja(k % 2 ? 'cartonOscuro' : 'carton', ex + dx, .14 + .19 + k * .38, ez + dz, .46, .38, .38, { nombre: 'una caja de mercancía' });
  rect(ctx, ex - .5, ez - .4, ex + .5, ez + .4);
  // Carretilla de carga
  lote.en(A.x1 - .6, 0, A.z1 - .55, .4, () => {
    lote.bloque('rojo', -.02, .05, -.2, .02, 1.2, -.17); lote.bloque('rojo', -.02, .05, .17, .02, 1.2, .2);
    lote.bloque('aceroOscuro', 0, 0, -.2, .25, .03, .2, { nombre: 'la carretilla' });
    lote.cil('negro', -.05, .1, -.24, .2, .06, { rx: Math.PI / 2 }); lote.cil('negro', -.05, .1, .24, .2, .06, { rx: Math.PI / 2 });
  });
  rect(ctx, A.x1 - .85, A.z1 - .8, A.x1 - .35, A.z1 - .3);
}
