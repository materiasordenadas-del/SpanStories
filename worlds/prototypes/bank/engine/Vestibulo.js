import * as T from './three.js';
import { ALTO_TECHO as H, PUERTAS, EDIFICIO } from './config.js';
import { crearLote } from './Kit.js';
import { crearVidrio } from './Reflejos.js';
import { plano } from './Planos.js';
import * as R from './Rotulos.js';

/* ── Vestíbulo de cajeros automáticos (24 h) y puertas correderas ─────────
   Tres cajeros empotrados en el muro oeste, con visera de privacidad, teclado,
   ranuras (tarjeta, billetes, recibo) y mamparas entre ellos.  Cámara de
   seguridad, papelera de comprobantes, avisos.  Las dos puertas son
   correderas automáticas: se abren al acercarse. */

export function construirVestibulo(ctx) {
  const { lote, kit } = ctx, xw = EDIFICIO.x0 + .1;          // cara interior del muro oeste
  const acero = kit.metal('acero', .5, 1.6);
  // Paramento de los cajeros: frente de piedra oscura con el hueco de cada máquina.
  const xf = xw + .38;                                         // cara del paramento
  lote.caja(ctx.materiales.granito, (xw + xf) / 2, 1.3, -1.85, xf - xw, 2.6, 3.3, { contorno: 'fino', trazo: '#4a4c4f' });
  lote.caja('teal', xf + .01, 2.45, -1.85, .03, .3, 3.3, { contorno: false });
  ctx.colisiones.push([xw, -3.5, xf + .35, -.2]);
  const zs = [-.85, -1.85, -2.85];
  zs.forEach((z, i) => {
    lote.en(xf, 0, z, Math.PI / 2, () => {            // +z local = hacia el este (el usuario)
      lote.caja('grisClaro', 0, .6, .12, .68, 1.2, .26, { contorno: 'medio', nombre: 'el cajero automático' });
      lote.caja('grafito', 0, 1.45, .06, .68, .5, .14, { contorno: 'medio', nombre: 'el cajero automático' });
      // visera de privacidad alrededor de la pantalla
      for (const s of [-1, 1]) lote.caja('grafito', s * .3, 1.45, .2, .03, .42, .16, { contorno: 'medio', nombre: 'la visera de privacidad' });
      lote.caja('grafito', 0, 1.67, .2, .63, .03, .16, { contorno: false });
      // repisa con teclado y ranuras
      lote.caja(acero, 0, 1.08, .3, .62, .04, .22, { rx: .18, contorno: 'medio', nombre: 'el teclado del cajero' });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++)
        lote.caja(r === 3 && c !== 1 ? (c ? 'verde' : 'rojo') : 'grafito', -.08 + c * .055, 1.105 - r * .012, .25 + r * .045, .045, .012, .035, { rx: .18, contorno: false });
      lote.caja('teal', .19, 1.2, .255, .1, .07, .02, { contorno: false, nombre: 'la ranura de la tarjeta' });
      lote.caja('negro', .19, 1.2, .266, .06, .006, .004, { contorno: false });
      lote.caja('negro', .19, 1.3, .255, .08, .01, .012, { contorno: false, nombre: 'la ranura del recibo' });
      lote.caja('grafito', 0, .92, .255, .34, .08, .03, { contorno: 'medio', nombre: 'la bandeja de billetes' });
      lote.caja('negro', 0, .92, .272, .28, .02, .004, { contorno: false });
      lote.caja(kit.emisivo('#62e28c'), -.12, .92, .272, .03, .015, .003, { contorno: false });
      // cabecera iluminada
      lote.caja('teal', 0, 2.1, .05, .7, .26, .1, { contorno: 'medio' });
      lote.sombra(0, .6, .9, .9, .9);
    });
    plano(ctx, .5, .36, 500, R.pantallaCajero, { x: xf + .135, y: 1.46, z, ry: Math.PI / 2, rx: 0, emisivo: true, nombre: 'la pantalla del cajero automático' });
    plano(ctx, .62, .2, 500, (c, w, h) => {
      c.fillStyle = '#0f5f66'; c.fillRect(0, 0, w, h); R.logo(c, h * .55, h / 2, h * .36, { fondo: '#0a4349' });
      c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.font = `600 ${h * .3}px ${R.FUENTE}`; c.fillText(`Cajero ${i + 1}`, h * 1.05, h * .5);
      c.fillStyle = '#f3cf7a'; c.textAlign = 'right'; c.font = `700 ${h * .26}px ${R.FUENTE}`; c.fillText('24 h', w * .96, h * .5);
    }, { x: xf + .104, y: 2.1, z, ry: Math.PI / 2, emisivo: true, nombre: 'el cajero automático' });
    // mampara entre cajeros
    if (i < 2) lote.caja('teal', xf + .24, 1.45, z - .5, .48, 1.0, .03, { contorno: 'medio', nombre: 'la mampara' });
  });
  for (const f of ctx.franjas || []) plano(ctx, f.ancho, .18, 900, R.franjaVidrio, { x: f.x, y: 1.45, z: f.z, ry: f.ry, alfa: true, doble: true, nombre: 'la mampara de vidrio' });
  // Aviso «Proteja su clave» entre el primer cajero y la fachada.
  plano(ctx, .34, .44, 400, R.avisoTeclado, { x: xf + .012, y: 1.55, z: -.28, ry: Math.PI / 2, nombre: 'el aviso «Proteja su clave»' });
  // Repisa para apoyar el bolso y papelera de comprobantes.
  lote.caja(acero, -4.1, 1.0, -3.3, 1.1, .03, .3, { contorno: 'medio', nombre: 'la repisa' });
  for (const s of [-1, 1]) lote.caja('aceroOscuro', -4.1 + s * .45, .9, -3.42, .03, .18, .05, { contorno: false });
  lote.en(-3.75, 0, -.55, -Math.PI / 2, () => {
    lote.caja('teal', 0, .45, 0, .4, .9, .3, { contorno: 'medio', nombre: 'la papelera de comprobantes' });
    lote.caja('grafito', 0, .905, 0, .42, .02, .32, { contorno: false });
    lote.caja('negro', 0, .8, .151, .22, .03, .01, { contorno: false });
  });
  plano(ctx, .3, .1, 300, R.comprobantes, { x: -3.75 - .152, y: .62, z: -.55, ry: -Math.PI / 2, nombre: 'la papelera de comprobantes' });
  ctx.colisiones.push([-3.95, -.75, -3.55, -.35]);
  // Aviso de la gorra junto a la puerta interior (lado del vestíbulo), bien visible.
  plano(ctx, .56, .72, 520, R.avisoGorra, { x: -4.3, y: 1.55, z: -3.49, nombre: 'el aviso «Retírese gorra, gafas y casco»' });
  // Cámara de seguridad (domo) en el techo.
  for (const [x, z] of [[-4.0, -.5], [8.3, -10.1], [-8.4, -4.2]]) {
    lote.cil('blanco', x, H - .04, z, .18, .06, { lados: 24, contorno: 'medio', nombre: 'la cámara de seguridad' });
    lote.esfera('negro', x, H - .08, z, .13, .1, .13, { contorno: false, nombre: 'la cámara de seguridad' });
  }
}

/* ── Puertas correderas automáticas ──────────────────────────────────── */

export function construirPuertas(ctx) {
  const vidrio = crearVidrio({ tinte: '#d7e9ea', opacidad: .1, fuerza: .8, brillos: .45 });
  for (const [clave, lado] of [['exterior', -.2], ['interior', .14]]) {
    const p = PUERTAS[clave], hojas = [];
    const z = p.z + lado, mitad = p.ancho / 2 + .05;
    // cajón del motor y guía
    ctx.lote.caja('aluminio', p.x, p.alto + .1, z, p.ancho * 2 + .3, .2, .16, { contorno: 'fino', nombre: 'la puerta automática' });
    ctx.lote.caja('negro', p.x - .5, p.alto + .1, z + (lado < 0 ? -.081 : .081), .12, .06, .004, { contorno: false, nombre: 'el sensor de la puerta' });
    for (const s of [-1, 1]) {
      const g = new T.Group(), lote = crearLote(ctx.kit);
      // hoja: marco de aluminio fino + vidrio
      lote.caja('aluminio', 0, p.alto / 2, 0, mitad, .05, .05, { contorno: false });
      lote.caja('aluminio', 0, .06, 0, mitad, .12, .05, { contorno: 'fino', nombre: 'la puerta automática' });
      lote.caja('aluminio', 0, p.alto - .03, 0, mitad, .06, .05, { contorno: false });
      for (const e of [-1, 1]) lote.caja('aluminio', e * (mitad / 2 - .025), p.alto / 2, 0, .05, p.alto, .05, { contorno: 'fino', nombre: 'la puerta automática' });
      lote.construir(g, ctx.pulsables);
      const lam = new T.Mesh(new T.PlaneGeometry(mitad - .05, p.alto - .18), vidrio);
      lam.position.y = p.alto / 2 + .03; lam.renderOrder = 3; lam.userData.nombre = 'la puerta de vidrio'; ctx.pulsables.push(lam); g.add(lam);
      // franja de seguridad y rótulo «Puerta automática»
      plano(ctx, mitad - .08, .12, 400, R.franjaVidrio, { y: 1.45, z: .03, alfa: true, doble: true, padre: g });
      if (s > 0) plano(ctx, .4, .05, 400, R.puertaAutomatica, { y: 1.3, z: lado < 0 ? .031 : -.031, ry: lado < 0 ? 0 : Math.PI, alfa: true, padre: g });
      const x0 = p.x + s * mitad / 2;
      g.position.set(x0, 0, z); ctx.grupo.add(g);
      hojas.push({ g, x0, s });
    }
    ctx.puertas.push({ hojas, x: p.x, z: p.z, abre: mitad - .1, t: 0, radio: 2.2 });
  }
}

export function animarPuertas(puertas, jugador, dt) {
  for (const p of puertas) {
    const d = Math.hypot(jugador.x - p.x, jugador.z - p.z);
    const objetivo = d < p.radio ? 1 : 0;
    p.t += Math.sign(objetivo - p.t) * Math.min(Math.abs(objetivo - p.t), dt * 1.8);
    const e = p.t * p.t * (3 - 2 * p.t);
    for (const h of p.hojas) h.g.position.x = h.x0 + h.s * p.abre * e;
  }
}
