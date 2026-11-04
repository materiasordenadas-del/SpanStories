import * as T from './three.js';
import { HUECOS, VENTANAS, VENTANA_Y } from './config.js';
import { lienzo, ilustracion, azar } from './Kit.js';
import { crearEspejo, crearVidrio } from './Reflejos.js';
import { crearMaterialToon } from './Luz25D.js';
import { crearPuerta } from './Puertas.js';
import { GEO, vidrios, cuadro, aplique, planta, cortinaCafe } from './Decor.js';

/* ── Recepción (x −10…−3, z −5…0) ─────────────────────────────────────────
   Doble puerta de vidrio a la calle, felpudo, atril del maître con el libro
   de reservas, banco de espera bajo un espejo dorado, perchero, vitrina de
   postres y lámpara de araña.  Todo lo pulsable lleva su nombre en español. */

export function construirRecepcion(ctx) {
  const { kit, lote, grupo, colisiones, pulsables } = ctx;
  const laton = kit.metal('laton', .55), cromo = kit.metal('cromo', .6, 1);

  // ── Puertas de la calle: dos hojas de vidrio con marco verde ─────────
  const E = HUECOS.entrada, hoja = E.ancho / 2 - .02, vidrioPuerta = crearVidrio({ tinte: '#a9ccd0', opacidad: .1, fuerza: 1, fuera: [0, 0, 1] });
  for (const s of [-1, 1]) {
    const bx = E.x + s * (E.ancho / 2 - .01);
    crearPuerta(ctx, {
      bisagra: [bx, 0], abre: s < 0 ? 1.45 : -1.45, sensor: [E.x, 0], radio: 2.1,
      construir: l => {
        const d = -s;                                  // la hoja crece desde la bisagra hacia el centro
        const x = c => d * c;
        l.caja('verdeTienda', x(.035), E.alto / 2, 0, .07, E.alto - .02, .06, { contorno: 'medio', nombre: 'la puerta de entrada' });
        l.caja('verdeTienda', x(hoja - .035), E.alto / 2, 0, .07, E.alto - .02, .06, { contorno: 'medio', nombre: 'la puerta de entrada' });
        l.caja('verdeTienda', x(hoja / 2), E.alto - .05, 0, hoja, .08, .06, { contorno: 'medio' });
        l.caja('verdeTienda', x(hoja / 2), .14, 0, hoja, .26, .06, { contorno: 'medio' });
        l.caja(laton, x(hoja / 2), .14, .032, hoja - .08, .2, .004, { contorno: false, nombre: 'la placa de latón' });
        l.caja(laton, x(hoja / 2), .14, -.032, hoja - .08, .2, .004, { contorno: false });
        l.pieza(kit.geo.plano, vidrioPuerta, x(hoja / 2), (E.alto + .2) / 2, 0, hoja - .12, E.alto - .4, 1, { nombre: 'el vidrio de la puerta' });
        for (const lado of [-1, 1]) {
          l.cil(laton, x(hoja - .16), 1.05, lado * .075, .028, .5, { lados: 8, contorno: 'medio', nombre: 'el tirador' });
          for (const yy of [.85, 1.25]) l.caja(laton, x(hoja - .16), yy, lado * .05, .02, .02, .05, { contorno: false });
        }
      },
    });
  }
  // rótulo dorado sobre el vidrio de la entrada: «Benvenuti · Abierto»
  const cartelPuerta = ilustracion(.46, .16, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#e0b24f'; c.textAlign = 'center'; c.font = `italic bold ${h * .5}px Georgia, serif`; c.fillText('Aperto', w / 2, h * .62);
  });
  cartelPuerta.material.transparent = true; cartelPuerta.material.alphaTest = .4;
  cartelPuerta.position.set(E.x - .42, 1.55, .04); grupo.add(cartelPuerta);
  // felpudo de coco con el nombre
  const felpudo = new T.Mesh(new T.PlaneGeometry(1.6, .95), crearMaterialToon({ albedo: lienzo(512, 304, (c, w, h) => {
    c.fillStyle = '#9a7445'; c.fillRect(0, 0, w, h);
    const r = azar(4); for (let i = 0; i < 4000; i++) { c.fillStyle = r() > .5 ? 'rgba(70,45,20,.35)' : 'rgba(210,170,110,.25)'; c.fillRect(r() * w, r() * h, 2, 3); }
    c.strokeStyle = '#3e2a17'; c.lineWidth = 10; c.strokeRect(12, 12, w - 24, h - 24);
    c.fillStyle = '#3e2a17'; c.font = `italic bold ${h * .24}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('La Nonna', w / 2, h / 2);
  }) }));
  felpudo.rotation.x = -Math.PI / 2; felpudo.position.set(E.x, .012, -.75); felpudo.userData.nombre = 'el felpudo'; grupo.add(felpudo); pulsables.push(felpudo);

  // ── Atril del maître con libro de reservas y lámpara de banquero ──────
  lote.en(-5.55, 0, -2.05, 0, () => {
    lote.caja('nogal', 0, .5, 0, .66, 1.0, .46, { contorno: 'medio', nombre: 'el atril de recepción' });
    lote.caja('moldura', 0, .5, .235, .5, .8, .02, { contorno: 'medio' });
    lote.caja('nogalOscuro', 0, .03, 0, .72, .06, .52, { contorno: 'medio' });
    lote.caja('nogalOscuro', 0, 1.04, -.02, .74, .06, .56, { rx: -.18, contorno: 'medio', nombre: 'el atril de recepción' });
    lote.caja(laton, 0, 1.0, .25, .74, .02, .02, { contorno: false });
    lote.sombra(0, 0, 1, .8, 1);
    // libro de reservas abierto (con su ilustración)
    for (const s of [-1, 1]) lote.caja('#2f4f3a', s * .13, 1.085, -.03, .26, .015, .34, { rx: -.18, rz: s * .04, contorno: 'medio', nombre: 'el libro de reservas' });
    lote.caja('cromo', .26, 1.1, .05, .012, .012, .14, { ry: .4, contorno: false, nombre: 'el bolígrafo' });
    // lámpara de banquero: base de latón y pantalla de vidrio verde
    lote.cil(laton, -.24, 1.1, -.18, .12, .03, { contorno: 'medio', nombre: 'la lámpara de mesa' });
    lote.cil(laton, -.24, 1.22, -.18, .018, .22, { lados: 8, contorno: false });
    lote.pieza(kit.geo.cil16, vidrios().verde, -.24, 1.35, -.14, .1, .26, .1, { rz: Math.PI / 2, ry: Math.PI / 2 });
    lote.cil(kit.emisivo('#fff1c8'), -.24, 1.33, -.14, .06, .2, { rz: Math.PI / 2, ry: Math.PI / 2 });
    // jarrón con una rosa
    lote.pieza(GEO.vaso, vidrios().transparente, .22, 1.1, -.2, .7, 1.4, .7);
    lote.cil('hoja', .22, 1.22, -.2, .008, .24, { lados: 8, contorno: false });
    lote.esfera('cuadroRojo', .22, 1.35, -.2, .05, .045, .05, { contorno: 'medio', nombre: 'la rosa' });
  });
  const libro = ilustracion(.5, .32, 512, (c, w, h) => {
    c.fillStyle = '#f5efdf'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9bfa8'; c.fillRect(w / 2 - 1, 0, 2, h);
    c.fillStyle = '#7a2a24'; c.font = `bold ${h * .08}px Georgia, serif`; c.fillText('Reservas · Sábado', w * .04, h * .12);
    c.fillStyle = '#3a3a55'; c.font = `italic ${h * .065}px Georgia, serif`;
    ['20:00  García (4)', '20:30  Rossi (2)', '21:00  López (6)', '21:15  Marino (2)', '21:30  Pérez (4)'].forEach((t, i) => c.fillText(t, w * .04, h * (.26 + i * .14)));
    c.strokeStyle = '#d7ceb8'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(w * .53, h * (.18 + i * .1)); c.lineTo(w * .96, h * (.18 + i * .1)); c.stroke(); }
  });
  libro.rotation.x = -Math.PI / 2 + .18; libro.position.set(-5.55, 1.1, -2.07); libro.userData.nombre = 'el libro de reservas'; libro.userData.accion = 'reserva';
  grupo.add(libro); pulsables.push(libro);
  ctx.lamparas.push({ pos: [-5.8, 1.5, -2.2], color: '#ffe9b8', intensidad: .45, radio: 1.2 });
  colisiones.push([-5.9, -2.3, -5.2, -1.8]);

  // ── Banco de espera y espejo dorado (reflejo real) ─────────────────────
  lote.en(-9.62, 0, -2.75, Math.PI / 2, () => {
    lote.caja('nogalOscuro', 0, .2, 0, 2.2, .36, .5, { contorno: 'medio', nombre: 'el banco de espera' });
    lote.caja(kit.esmalte('cuero', .18), 0, .43, .02, 2.1, .12, .48, { contorno: 'medio', nombre: 'el banco de espera' });
    lote.caja(kit.esmalte('cuero', .18), 0, .78, -.22, 2.1, .6, .1, { rx: -.08, contorno: 'medio' });
    for (let i = 0; i < 6; i++) lote.esfera(laton, -.9 + i * .36, .8, -.16, .025, .025, .02, { contorno: false });
    for (const s of [-1, 1]) lote.caja('nogalOscuro', s * 1.08, .45, .02, .08, .5, .5, { contorno: 'medio' });
    lote.sombra(0, .02, 2.5, .8, 1);
  });
  colisiones.push([-9.9, -3.9, -9.35, -1.6]);
  const espejo = crearEspejo(1.7, 1.05, { tinte: '#e8e2d4' });
  espejo.rotation.y = Math.PI / 2; espejo.position.set(-9.875, 1.82, -2.75); espejo.userData.nombre = 'el espejo'; grupo.add(espejo); pulsables.push(espejo);
  lote.en(-9.9, 1.82, -2.75, Math.PI / 2, () => {
    const w = 1.7, h = 1.05, g = .1;
    for (const s of [-1, 1]) {
      lote.caja(laton, 0, s * (h / 2 + g / 2), .03, w + 2 * g, g, .06, { contorno: 'medio', nombre: 'el marco dorado' });
      lote.caja(laton, s * (w / 2 + g / 2), 0, .03, g, h, .06, { contorno: 'medio', nombre: 'el marco dorado' });
    }
    lote.esfera(laton, 0, h / 2 + .16, .03, .22, .12, .06, { contorno: 'medio' });
  });
  aplique(ctx, -9.9, 1.95, -4.1, Math.PI / 2); aplique(ctx, -9.9, 1.95, -1.4, Math.PI / 2);

  // ── Perchero y paragüero en la esquina ────────────────────────────────
  lote.en(-9.4, 0, -4.45, 0, () => {
    lote.cil('nogalOscuro', 0, .9, 0, .05, 1.8, { lados: 8, contorno: 'medio', nombre: 'el perchero' });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; lote.caja('nogalOscuro', Math.cos(a) * .18, .05, Math.sin(a) * .18, .38, .04, .04, { ry: -a, contorno: 'medio' }); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .6; lote.caja(laton, Math.cos(a) * .1, 1.72, Math.sin(a) * .1, .18, .02, .02, { ry: -a, rz: .5, contorno: false }); }
    // abrigo y sombrero colgados
    lote.en(.1, 0, .1, .7, () => {
      lote.pieza(kit.geo.cono, '#a47a4f', 0, 1.22, 0, .44, .9, .22, { contorno: 'medio', nombre: 'el abrigo' });
      lote.esfera('#a47a4f', 0, 1.64, 0, .3, .12, .18, { contorno: 'medio', nombre: 'el abrigo' });
      for (const s of [-1, 1]) lote.cil('#94693f', s * .17, 1.3, .02, .08, .6, { lados: 8, rz: s * .12, contorno: 'medio', nombre: 'la manga' });
      lote.caja('cuadroRojo', .04, 1.45, .1, .07, .45, .02, { rz: .1, contorno: 'medio', nombre: 'la bufanda' });
    });
    lote.cil('#3b3a3a', -.1, 1.82, -.05, .3, .02, { contorno: 'medio', nombre: 'el sombrero' });
    lote.cil('#3b3a3a', -.1, 1.88, -.05, .18, .12, { contorno: 'medio', nombre: 'el sombrero' });
    lote.sombra(0, 0, .6, .6, .8);
  });
  lote.en(-8.85, 0, -4.55, 0, () => {
    lote.cil(laton, 0, .28, 0, .24, .56, { contorno: 'medio', nombre: 'el paragüero' });
    lote.cil('cuadroRojo', .04, .6, .03, .03, .6, { lados: 8, rz: .12, contorno: 'medio', nombre: 'el paraguas' });
    lote.cil('negro', -.05, .62, -.02, .03, .62, { lados: 8, rz: -.1, contorno: 'medio', nombre: 'el paraguas' });
  });
  colisiones.push([-9.7, -4.8, -8.6, -4.2]);

  // ── Vitrina de postres (vidrio reflectante) ───────────────────────────
  const VX = -6.9, VZ = -4.5;
  lote.en(VX, 0, VZ, 0, () => {
    lote.caja('nogal', 0, .45, 0, 2.3, .9, .6, { contorno: 'medio', nombre: 'la vitrina de postres' });
    for (let i = 0; i < 3; i++) lote.caja('moldura', -.75 + i * .75, .45, .305, .6, .66, .02, { contorno: 'medio' });
    lote.caja(kit.esmalte('marmol', .3), 0, .92, 0, 2.36, .04, .64, { contorno: 'medio' });
    lote.caja('nogalOscuro', 0, 1.54, -.02, 2.3, .06, .56, { contorno: 'medio' });
    for (const s of [-1, 1]) lote.caja(laton, s * 1.13, 1.23, .27, .03, .6, .03, { contorno: 'medio' });
    lote.caja(kit.emisivo('#fff4dc'), 0, 1.5, -.02, 2.1, .01, .06);
    lote.caja(kit.esmalte('marmol', .25), 0, 1.2, -.05, 2.2, .015, .45, { contorno: false });
    // postres: tiramisú, tarta, cannoli, panna cotta
    lote.caja('#e9dcc6', -.72, 1.0, 0, .36, .1, .26, { contorno: 'medio', nombre: 'el tiramisú' });
    lote.caja('#7a4a2a', -.72, 1.055, 0, .36, .012, .26, { contorno: false, nombre: 'el tiramisú' });
    lote.pieza(GEO.plato, kit.esmalte('loza', .2), 0, .94, 0, 1.1, 1, 1.1);
    lote.cil('#e7b86a', 0, 1.0, 0, .26, .09, { lados: 24, contorno: 'medio', nombre: 'la tarta de frutas' });
    for (let i = 0; i < 10; i++) { const a = i * .628; lote.esfera(i % 2 ? 'cuadroRojo' : '#e0b24f', Math.cos(a) * .09, 1.05, Math.sin(a) * .09, .04, .03, .04, { contorno: false, nombre: 'la tarta de frutas' }); }
    for (let i = 0; i < 5; i++) lote.cil('#d8a95c', .6 + (i % 3) * .07, 1.0 + Math.floor(i / 3) * .05, -.04 + (i % 2) * .08, .045, .16, { rz: Math.PI / 2, lados: 12, contorno: 'medio', nombre: 'los cannoli' });
    for (let i = 0; i < 3; i++) {
      lote.pieza(GEO.vaso, vidrios().transparente, -.55 + i * .2, 1.21, -.08, 1, .8, 1, { nombre: 'la panna cotta' });
      lote.cil('#f4efe2', -.55 + i * .2, 1.25, -.08, .055, .06, { lados: 12, contorno: false });
      lote.cil('cuadroRojo', -.55 + i * .2, 1.285, -.08, .055, .012, { lados: 12, contorno: false });
    }
    lote.pieza(GEO.cupula, vidrios().vitrina, .45, 1.21, -.08, .9, .9, .9, { nombre: 'la campana de cristal' });
    lote.cil('#8a5230', .45, 1.25, -.08, .2, .07, { lados: 16, contorno: 'medio', nombre: 'el bizcocho de chocolate' });
    lote.sombra(0, .05, 2.6, .9, 1);
  });
  // cristal frontal y laterales (curvado arriba en el original; aquí plano inclinado)
  const vitrina = vidrios().vitrina;
  const frente = new T.Mesh(new T.PlaneGeometry(2.26, .62), vitrina);
  frente.position.set(VX, 1.22, VZ + .29); frente.rotation.x = -.12; frente.renderOrder = 4;
  frente.userData.nombre = 'la vitrina de postres'; frente.userData.accion = 'postres'; grupo.add(frente); pulsables.push(frente);
  for (const s of [-1, 1]) { const lat = new T.Mesh(new T.PlaneGeometry(.56, .6), vitrina); lat.rotation.y = Math.PI / 2; lat.position.set(VX + s * 1.14, 1.23, VZ); lat.renderOrder = 4; grupo.add(lat); }
  ctx.lamparas.push({ pos: [VX, 1.45, VZ + .1], color: '#fff2d8', intensidad: .5, radio: 1.4 });
  colisiones.push([VX - 1.2, VZ - .32, VX + 1.2, VZ + .32]);
  cuadro(ctx, VX, 2.45, -4.9, 0, 1.3, .85, 'nonna', { nombre: 'el retrato de la nonna' });
  // cartel «Por favor, espere a ser atendido»
  const aviso = ilustracion(.5, .3, 256, (c, w, h) => {
    c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#2f5a42'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#2f5a42'; c.textAlign = 'center'; c.font = `italic ${h * .17}px Georgia, serif`;
    c.fillText('Por favor,', w / 2, h * .38); c.fillText('espere a ser atendido', w / 2, h * .62); c.font = `${h * .12}px Georgia, serif`; c.fillText('Grazie', w / 2, h * .84);
  });
  lote.caja(laton, -5.12, .6, -1.6, .02, 1.2, .02, { contorno: 'medio' });
  lote.cil(laton, -5.12, .02, -1.6, .26, .04, { contorno: 'medio' });
  aviso.position.set(-5.12, 1.3, -1.6); aviso.rotation.y = .5; aviso.userData.nombre = 'el cartel'; grupo.add(aviso); pulsables.push(aviso);
  colisiones.push([-5.25, -1.73, -4.99, -1.47]);

  // ── Lámpara de araña de hierro sobre el vestíbulo ─────────────────────
  lote.en(-6.4, 0, -2.6, 0, () => {
    lote.cil('hierro', 0, 3.1, 0, .012, .9, { lados: 6, contorno: false });
    lote.pieza(kit.geo.aro, 'hierro', 0, 2.63, 0, .9, .9, .9, { contorno: 'medio', nombre: 'la lámpara de araña' });
    for (let i = 0; i < 3; i++) lote.caja('hierro', 0, 2.63, 0, .9, .015, .015, { ry: i * Math.PI / 3, contorno: false });
    for (let i = 0; i < 3; i++) lote.caja('hierro', 0, 2.95, 0, .012, .6, .012, { rz: .6, ry: i * Math.PI * 2 / 3, contorno: false });
    lote.esfera('hierro', 0, 2.6, 0, .09, .14, .09, { contorno: 'medio', nombre: 'la lámpara de araña' });
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, x = Math.cos(a) * .44, z = Math.sin(a) * .44;
      lote.cil(laton, x, 2.66, z, .05, .04, { lados: 8, contorno: false });
      lote.cil('vela', x, 2.73, z, .03, .1, { lados: 8, contorno: false, nombre: 'la vela' });
      lote.esfera(kit.emisivo('#fff0c0'), x, 2.81, z, .04, .06, .04);
    }
  });
  ctx.lamparas.push({ pos: [-6.4, 2.4, -2.6], color: '#ffd898', intensidad: 1, radio: 3.4 });

  // ── Cuadros, ventana y planta ──────────────────────────────────────────
  cortinaCafe(ctx, VENTANAS[0][0] + .05, VENTANAS[0][1] - .05, -.2);
  lote.caja(kit.esmalte('marmol', .25), (VENTANAS[0][0] + VENTANAS[0][1]) / 2, VENTANA_Y[0] - .02, -.25, VENTANAS[0][1] - VENTANAS[0][0] + .1, .04, .22, { contorno: 'medio', nombre: 'el alféizar' });
  cuadro(ctx, -3.12, 1.95, -4.15, -Math.PI / 2, .6, .8, 'vespa', { marco: 'nogalOscuro', nombre: 'el cartel antiguo' });
  planta(ctx, -3.55, -.6, { alto: 1.6, semilla: 2, nombre: 'la planta' });
}
