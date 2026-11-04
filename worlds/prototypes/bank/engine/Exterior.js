import * as T from './three.js';
import { ALTO_TECHO as H, PUERTAS, VENTANAS, VENTANA_Y, EDIFICIO } from './config.js';
import { lienzo, azar, materialSuperficie, ilustracion } from './Kit.js';
import { crearReceptorSombra } from './Luz25D.js';
import { crearVidrio } from './Reflejos.js';
import { tramos, HUECOS_FACHADA } from './Arquitectura.js';
import { plano } from './Planos.js';
import * as R from './Rotulos.js';

/* ── Fachada, acera y calle ───────────────────────────────────────────────
   Cerca y protagonista → 3D: chapado de piedra, zócalo de granito, ventanales
   con montantes, banda teal del rótulo, marquesina de la entrada, mobiliario
   urbano.  El banco ocupa la planta baja de un edificio de oficinas; los
   pisos altos y los vecinos son volúmenes simples con la fachada pintada
   (lejos o por encima de la vista → 2D, ESTILO.md §1). */

const ZF = .15;                         // cara exterior del muro de fachada
const TOPE = H + .7;                    // coronación de la planta baja

function texturaLosas() {
  return lienzo(512, 512, (c, w) => {
    c.fillStyle = '#aaa294'; c.fillRect(0, 0, w, w);
    const r = azar(5), n = 4, t = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = 198 + r() * 18;
      c.fillStyle = `rgb(${k},${k - 5},${k - 14})`; c.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      for (let m = 0; m < 40; m++) { c.fillStyle = `rgba(120,110,95,${r() * .12})`; c.fillRect(i * t + r() * t, j * t + r() * t, 2, 2); }
    }
  }, { repetir: true });
}
function texturaAsfalto() {
  return lienzo(256, 256, (c, w) => {
    c.fillStyle = '#5d6066'; c.fillRect(0, 0, w, w);
    const r = azar(9);
    for (let i = 0; i < 1400; i++) { const k = r(); c.fillStyle = k > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.1)'; c.fillRect(r() * w, r() * w, 1.5, 1.5); }
  }, { repetir: true });
}
function texturaPiedra() {           // placas de piedra caliza de 60 × 120 cm, trabadas
  return lienzo(512, 512, (c, w) => {
    c.fillStyle = '#b9b0a2'; c.fillRect(0, 0, w, w);
    const r = azar(15), cols = 4, filas = 2, cw = w / cols, ch = w / filas;
    for (let j = 0; j < filas; j++) for (let i = -1; i <= cols; i++) {
      const x = i * cw + (j % 2 ? cw / 2 : 0), k = 222 + r() * 12;
      c.fillStyle = `rgb(${k},${k - 6},${k - 18})`; c.fillRect(x + 2, j * ch + 2, cw - 4, ch - 4);
      for (let m = 0; m < 60; m++) { c.fillStyle = `rgba(150,135,110,${r() * .14})`; c.beginPath(); c.arc(x + r() * cw, j * ch + r() * ch, r() * 2.2, 0, 7); c.fill(); }
    }
  }, { repetir: true });
}
// Fachada pintada de oficinas (pisos altos del mismo edificio y vecinos).
function fachadaOficinas(base, vidrio, semilla, cols = 6, filas = 2) {
  return (c, w, h) => {
    const r = azar(semilla);
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let f = 0; f < filas; f++) for (let k = 0; k < cols; k++) {
      const x = k * w / cols + w / cols * .12, y = f * h / filas + h / filas * .22, ww = w / cols * .76, hh = h / filas * .56;
      c.fillStyle = vidrio; c.fillRect(x, y, ww, hh);
      c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.moveTo(x, y + hh * .6); c.lineTo(x + ww * .5, y); c.lineTo(x + ww * .75, y); c.lineTo(x, y + hh); c.fill();
      if (r() > .55) { c.fillStyle = 'rgba(240,235,220,.85)'; c.fillRect(x, y, ww, hh * (.2 + r() * .4)); }
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x - 3, y + hh, ww + 6, 5);
    }
  };
}
// Escaparate de una tienda vecina: rótulo, vidrieras y puerta (ilustración).
function escaparate(nombre, color, letra, lema) {
  return (c, w, h) => {
    c.fillStyle = '#5d5a55'; c.fillRect(0, 0, w, h);
    c.fillStyle = color; c.fillRect(0, 0, w, h * .2);
    c.fillStyle = letra; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${h * .09}px 'Segoe UI', Arial, sans-serif`; c.fillText(nombre, w / 2, h * .08);
    c.font = `400 ${h * .045}px 'Segoe UI', Arial, sans-serif`; c.fillText(lema, w / 2, h * .165);
    const n = 4, pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw + pw * .06, puerta = i === 1;
      c.fillStyle = '#9fb9c2'; c.fillRect(x, h * .26, pw * .88, h * (puerta ? .74 : .6));
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x, h * .7); c.lineTo(x + pw * .4, h * .26); c.lineTo(x + pw * .55, h * .26); c.lineTo(x, h * .86); c.fill();
      if (!puerta) {        // estantes y género del escaparate
        for (let e = 0; e < 3; e++) {
          c.fillStyle = 'rgba(80,60,40,.5)'; c.fillRect(x + pw * .05, h * (.42 + e * .14), pw * .78, h * .012);
          for (let k = 0; k < 6; k++) { c.fillStyle = ['#c2393a', '#e2a93b', '#4f8a4a', '#f6f6f3', '#2f6fb0'][(i + e + k) % 5]; c.fillRect(x + pw * (.08 + k * .13), h * (.35 + e * .14), pw * .08, h * .07); }
        }
      } else { c.fillStyle = '#3a3d41'; c.fillRect(x + pw * .42, h * .58, pw * .04, h * .08); }
      c.strokeStyle = '#2c2d30'; c.lineWidth = w * .004; c.strokeRect(x, h * .26, pw * .88, h * (puerta ? .74 : .6));
    }
  };
}
function dibujarEnfrente(c, w, h) {
  const r = azar(33);
  c.clearRect(0, 0, w, h);
  const colores = ['#d8c6a8', '#c9a784', '#e3d4b8', '#b9a48c', '#d9b98f', '#c4b39c', '#e6cfa6', '#a99a88'];
  let x = 0, i = 0;
  while (x < w) {
    const ancho = w * (.06 + r() * .05), alto = h * (.45 + r() * .5), y0 = h - alto;
    c.fillStyle = colores[i++ % colores.length]; c.fillRect(x, y0, ancho + 1, alto);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y0, ancho, h * .01);
    const cols = Math.max(2, Math.round(ancho / (w * .018))), filas = Math.floor((alto - h * .16) / (h * .1));
    for (let f = 0; f < filas; f++) for (let k = 0; k < cols; k++) {
      const vx = x + ancho * (k + .5) / cols, vy = y0 + h * .05 + f * h * .1;
      c.fillStyle = r() > .3 ? '#6f8fa6' : '#8fb0c2'; c.fillRect(vx - w * .004, vy, w * .008, h * .055);
    }
    // bajos comerciales con toldos de colores
    c.fillStyle = '#4b4f55'; c.fillRect(x + ancho * .1, h - h * .12, ancho * .8, h * .12);
    c.fillStyle = ['#c2393a', '#2f6fb0', '#4f8a4a', '#e2a93b'][i % 4]; c.fillRect(x + ancho * .06, h - h * .14, ancho * .88, h * .03);
    x += ancho;
  }
}

export function construirExterior(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const acero = kit.metal('acero', .45, 1.8);

  // ── Suelo: acera, bordillo, calzada con paso de cebra, acera de enfrente ──
  const acera = materialSuperficie({ map: texturaLosas(), metros: 2.4 });
  const asfalto = materialSuperficie({ map: texturaAsfalto(), metros: 3 });
  lote.caja(acera, 0, -.06, 2.25, 80, .12, 4.3, { contorno: false });
  lote.caja('bordillo', 0, -.08, 4.47, 80, .16, .24, { contorno: 'fino' });
  lote.caja(asfalto, 0, -.2, 8.1, 80, .1, 7.1, { contorno: false });
  lote.caja('bordillo', 0, -.08, 11.73, 80, .16, .24, { contorno: 'fino' });
  lote.caja(acera, 0, -.06, 13.9, 80, .12, 4.1, { contorno: false });
  // líneas de la calzada y paso de cebra frente a la entrada
  for (let x = -38; x < 38; x += 4) if (Math.abs(x - PUERTAS.exterior.x) > 3.6) lote.caja('blanco', x, -.148, 8.1, 2, .005, .14, { contorno: false });
  for (let k = 0; k < 8; k++) lote.caja('blanco', PUERTAS.exterior.x - 2.45 + k * .7, -.148, 8.1, .4, .005, 6.6, { contorno: false, nombre: 'el paso de peatones' });
  // receptor de la sombra del sol en la acera y en la fachada
  const receptor = new T.Mesh(new T.PlaneGeometry(40, 16), crearReceptorSombra(1));
  receptor.rotation.x = -Math.PI / 2; receptor.position.set(0, .002, 6); receptor.receiveShadow = true; receptor.raycast = () => {}; grupo.add(receptor);
  colisiones.push([-40, 15.6, 40, 16]);                             // límite: la fachada pintada de enfrente

  // ── Fachada ─────────────────────────────────────────────────────────
  const piedra = materialSuperficie({ map: texturaPiedra(), metros: 2.4, bandas: 3 });
  const huecos = HUECOS_FACHADA.map(h => ({ ...h, a0: h.a0 - .06, a1: h.a1 + .06, y1: h.puerta ? h.y1 : h.y1 + .06, y0: h.puerta ? h.y0 : h.y0 - .06 }));
  for (const [u0, u1, y0, y1] of tramos(EDIFICIO.x0 - .3, EDIFICIO.x1 + .3, 0, 3.2, huecos)) {
    lote.caja(y1 <= .5 ? ctx.materiales.granito : piedra, (u0 + u1) / 2, (y0 + y1) / 2, ZF + .04, u1 - u0, y1 - y0, .08, { contorno: false });
  }
  // zócalo de granito corrido y albardillas de las ventanas
  for (const [x0, x1] of VENTANAS) {
    lote.caja(ctx.materiales.granito, (x0 + x1) / 2, VENTANA_Y[0] - .03, ZF + .08, x1 - x0 + .2, .06, .16, { contorno: 'fino', trazo: '#4a4c4f' });
  }
  lote.caja(ctx.materiales.granito, 0, .2, ZF + .09, 18.6, .4, .02, { contorno: false });
  // banda teal del rótulo (3,2 m → coronación) y cornisa dorada
  lote.caja('teal', 0, (3.2 + TOPE) / 2, ZF + .12, 18.6, TOPE - 3.2, .24, { contorno: 'fino' });
  lote.caja('oro', 0, 3.22, ZF + .25, 18.6, .05, .06, { contorno: false });
  lote.caja('tealOscuro', 0, TOPE + .03, ZF + .1, 18.8, .06, .32, { contorno: false });
  plano(ctx, 8.2, 1.05, 2048, R.rotuloFachada, { x: 2.4, y: 3.85, z: ZF + .245, nombre: 'el rótulo del banco', tipo: 'cartel' });
  plano(ctx, 3.3, .7, 1024, R.rotuloCajeros24, { x: PUERTAS.exterior.x, y: 3.85, z: ZF + .245, nombre: 'el rótulo «Cajeros automáticos 24 h»' });
  // logo en bandera (perpendicular a la fachada), visible desde la acera
  lote.caja('tealOscuro', 8.6, 3.85, ZF + .6, .06, .9, .9, { contorno: 'medio', nombre: 'el logotipo del banco' });
  for (const s of [1, -1]) plano(ctx, .8, .8, 256, (c, w, h) => R.logo(c, w / 2, h / 2, w * .46, { fondo: '#0f5f66' }), { x: 8.6 + s * .032, y: 3.85, z: ZF + .6, ry: s * Math.PI / 2, alfa: true, nombre: 'el logotipo del banco' });
  lote.caja(acero, 8.6, 3.85, ZF + .2, .04, .04, .3, { contorno: false });

  // ── Ventanales: vidrio, montantes y travesaño, vinilos ────────────────
  const vidrio = crearVidrio({ tinte: '#cfe3e6', opacidad: .12, fuerza: 1, brillos: .55, fuera: [0, 0, 1] });
  for (const [x0, x1] of VENTANAS) {
    const [y0, y1] = VENTANA_Y, w = x1 - x0;
    const lam = new T.Mesh(new T.PlaneGeometry(w, y1 - y0), vidrio);
    lam.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); lam.renderOrder = 3; lam.userData.nombre = 'el ventanal'; ctx.pulsables.push(lam); grupo.add(lam);
    const n = Math.max(1, Math.round(w / 1.3));
    for (let k = 0; k <= n; k++) lote.caja('perfil', x0 + w * k / n, (y0 + y1) / 2, .02, .06, y1 - y0, .12, { contorno: 'fino' });
    lote.caja('perfil', (x0 + x1) / 2, y0 + .02, .02, w, .05, .12, { contorno: false });
    lote.caja('perfil', (x0 + x1) / 2, y1 - .02, .02, w, .05, .12, { contorno: false });
    lote.caja('perfil', (x0 + x1) / 2, 2.55, .02, w, .05, .12, { contorno: 'fino' });
    // franja de seguridad esmerilada con logos (por fuera y por dentro)
    plano(ctx, w - .1, .16, 900, R.franjaVidrio, { x: (x0 + x1) / 2, y: 1.45, z: .012, alfa: true, doble: true });
  }
  // Horario en vinilo en el paño junto a la puerta; tarjeta de acceso nocturno.
  plano(ctx, .8, .52, 500, (c, w, h) => R.horario(c, w, h, { vinilo: true }), { x: -4.42, y: 1.55, z: .014, alfa: true, nombre: 'el horario de atención' });
  plano(ctx, .52, .66, 520, R.avisoGorra, { x: -7.98, y: 1.55, z: .014, nombre: 'el aviso «Retírese gorra, gafas y casco»' });
  lote.caja('grafito', -7.62, 1.2, ZF + .1, .12, .18, .05, { contorno: 'medio', nombre: 'el lector de tarjetas (acceso nocturno)' });
  lote.caja(kit.emisivo('#62e28c'), -7.62, 1.25, ZF + .126, .02, .02, .004, { contorno: false });
  lote.caja('negro', -7.62, 1.17, ZF + .126, .07, .01, .004, { contorno: false });

  // ── Marquesina sobre la entrada ─────────────────────────────────────
  const mx = PUERTAS.exterior.x, vuelo = 1.7, ym = 2.95;
  lote.caja('tealOscuro', mx, ym, ZF + vuelo / 2, 3.4, .16, vuelo, { contorno: 'fino', nombre: 'la marquesina' });
  lote.caja('oro', mx, ym - .09, ZF + vuelo - .02, 3.42, .03, .05, { contorno: false });
  for (const s of [-1, 1]) lote.caja('tealOscuro', mx + s * 1.62, ym - .02, ZF + vuelo / 2, .06, .2, vuelo, { contorno: false, nombre: 'la marquesina' });
  const focos = [];
  for (const s of [-1, 0, 1]) {
    lote.cil(kit.emisivo('#fff3d6'), mx + s * 1.05, ym - .085, ZF + vuelo * .55, .12, .01, { contorno: false });
    focos.push({ pos: [mx + s * 1.05, 2.2, ZF + 1.5], color: '#ffe4b8', intensidad: 1, radio: 1.55, exterior: true });
  }
  ctx.lamparas.push(...focos);

  // ── Mobiliario urbano ───────────────────────────────────────────────
  // bolardos de acero a lo largo del bordillo
  for (let x = -10.5; x <= 10.5; x += 1.5) {
    if (Math.abs(x - mx) < 1.2) continue;
    lote.cil(acero, x, .4, 3.85, .14, .8, { contorno: 'medio', nombre: 'el bolardo' });
    lote.cil('amarillo', x, .72, 3.85, .145, .05, { contorno: false });
    colisiones.push([x - .1, 3.75, x + .1, 3.95]);
  }
  // farolas
  for (const x of [-11.5, 5.5]) {
    lote.cil('farola', x, 2.3, 4.0, .12, 4.6, { contorno: 'medio', nombre: 'la farola' });
    lote.caja('farola', x, 4.55, 3.55, .1, .08, .9, { contorno: 'medio', nombre: 'la farola' });
    lote.caja('farola', x, 4.5, 3.05, .34, .12, .5, { contorno: 'medio', nombre: 'la farola' });
    lote.caja(kit.emisivo('#fff1cf'), x, 4.43, 3.05, .3, .02, .44, { contorno: false });
    ctx.lamparas.push({ pos: [x, 3.2, 3.5], color: '#ffe0a8', intensidad: 1.1, radio: 2.9, exterior: true });
    colisiones.push([x - .12, 3.88, x + .12, 4.12]);
  }
  // banca de la calle y papelera
  lote.en(1.6, 0, 2.9, Math.PI, () => {
    for (let k = 0; k < 4; k++) lote.caja('roble', 0, .44, -.18 + k * .12, 1.8, .04, .09, { contorno: 'medio', nombre: 'la banca' });
    for (let k = 0; k < 3; k++) lote.caja('roble', 0, .6 + k * .12, .24, 1.8, .09, .04, { rx: -.2, contorno: 'medio', nombre: 'la banca' });
    for (const s of [-1, 1]) { lote.caja('farola', s * .78, .22, 0, .06, .44, .5, { contorno: 'medio' }); lote.caja('farola', s * .78, .62, .22, .06, .5, .05, { rx: -.2, contorno: false }); }
    lote.sombra(0, 0, 2.2, .9, .9);
  });
  colisiones.push([.7, 2.6, 2.5, 3.2]);
  lote.cil('farola', 3.1, .45, 3.7, .38, .9, { lados: 16, contorno: 'medio', nombre: 'la papelera' });
  lote.cil('grafito', 3.1, .92, 3.7, .42, .05, { lados: 16, contorno: false });
  // jardineras con arbustos junto a la fachada
  for (const x of [-1.6, 4.7]) {
    lote.caja(ctx.materiales.granito, x, .3, .75, 1.6, .6, .6, { contorno: 'medio', trazo: '#4a4c4f', nombre: 'la jardinera' });
    lote.caja('tierra', x, .59, .75, 1.5, .02, .5, { contorno: false });
    for (let k = 0; k < 5; k++) lote.esfera(k % 2 ? 'hoja' : 'hojaOscura', x - .6 + k * .3, .78 + (k % 2) * .08, .75, .42, .4, .42, { contorno: 'medio', nombre: 'el arbusto' });
    colisiones.push([x - .8, .45, x + .8, 1.05]);
  }

  // ── Pisos altos del edificio y vecinos (volúmenes con fachada pintada) ──
  const alto = 7.2;
  lote.caja(materialSuperficie({ map: lienzo(1024, 1024, fachadaOficinas('#e5dccb', '#7f9fb2', 3, 6, 2), { repetir: true }), metros: 7.2, bandas: 2 }),
    0, TOPE + alto / 2 + .06, ZF - .05, 18.8, alto, .3, { contorno: false });
  lote.caja('crema', 0, TOPE + alto + .15, ZF, 19, .2, .5, { contorno: 'fino' });
  const vecino = (x0, x1, h, base, semilla, bajo, tienda, nombreTienda) => {
    lote.caja(materialSuperficie({ map: lienzo(1024, 1024, fachadaOficinas(base, '#86a3b4', semilla, 6, 3), { repetir: true }), metros: 9.6, bandas: 2 }),
      (x0 + x1) / 2, h / 2 + 3.2, -7, x1 - x0, h - 3.2, 14.3, { contorno: false });
    // planta baja: escaparate de la tienda vecina (secundario → ilustración plana)
    lote.caja(bajo, (x0 + x1) / 2, 1.6, -7.1, x1 - x0, 3.2, 14.1, { contorno: false });
    plano(ctx, x1 - x0 - .6, 3, 1400, tienda, { x: (x0 + x1) / 2, y: 1.5, z: .02, nombre: `la tienda de al lado: ${nombreTienda}` });
    colisiones.push([Math.min(x0, x1), -15, Math.max(x0, x1), .3]);
  };
  vecino(-22, -9.25, 12.8, '#d9c3a3', 7, 'piedraOscura', escaparate('Cafetería La Esquina', '#7a4a2c', '#f3cf7a', 'Café · Pan dulce · Desayunos'), 'la cafetería');
  vecino(9.25, 22, 9.6, '#c9d0cf', 11, 'granito', escaparate('Papelería Lápiz', '#2f6fb0', '#ffffff', 'Copias · Útiles · Regalos'), 'la papelería');

  // Enfrente: ilustración plana (lejos → 2D).
  const enfrente = ilustracion(80, 16, 4096, dibujarEnfrente, 'fondo');
  enfrente.position.set(0, 7.9, 16.2); enfrente.rotation.y = Math.PI; grupo.add(enfrente);
  enfrente.material.transparent = true; enfrente.material.alphaTest = .02;
}
