import * as T from './three.js';
import { HUECOS, VENTANAS, VENTANA_Y, ALTO_TECHO as H } from './config.js';
import { lienzo, ilustracion, azar, materialSuperficie, crearLote } from './Kit.js';
import { luz, crearMaterialToon, conNormalContorno } from './Luz25D.js';
import { crearEspejo } from './Reflejos.js';
import { crearPuerta } from './Puertas.js';
import { GEO, vidrios, cuadro, aplique, colgante, planta, cortinaCafe, botella, cubierto } from './Decor.js';
import { sillaBistro } from './Exterior.js';

/* ── Comedor (x −3…10, z −10…0) ───────────────────────────────────────────
   Muro norte: barra con botellero y espejo, aparador con la pizarra de
   especialidades, puertas vaivén de la cocina (cerradas: de la cocina solo
   existe la puerta) y la vinoteca.  Sala: mesas de cuatro con mantel de
   cuadros, mesas de dos junto a los ventanales y a lo largo del banco
   corrido de cuero verde.  Cada mesa tiene su carta (pulsable). */

// Guinga roja: tres tonos (blanco, rosa del cruce, rojo), 5 cm por cuadro.
function texturaGuinga() {
  return lienzo(64, 64, (c, w) => {
    c.fillStyle = '#f7f1e6'; c.fillRect(0, 0, w, w);
    c.fillStyle = 'rgba(194,59,48,.55)'; c.fillRect(0, 0, w / 2, w); c.fillRect(0, 0, w, w / 2);
    c.fillStyle = '#b8352c'; c.fillRect(0, 0, w / 2, w / 2);
  }, { repetir: true });
}

// Vela dentro de un fiasco: llama emisiva + halo aditivo que crece de noche.
let texturaHalo = null;
function halo(ctx, x, y, z, escala = .5) {
  texturaHalo ??= lienzo(64, 64, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,214,140,1)'); g.addColorStop(.3, 'rgba(255,180,90,.45)'); g.addColorStop(1, 'rgba(255,160,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  });
  const m = new T.SpriteMaterial({ map: texturaHalo, blending: T.AdditiveBlending, depthWrite: false, transparent: true });
  const s = new T.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(escala); s.renderOrder = 5;
  luz.alCambiar(A => { m.opacity = .18 + .6 * A.brilloNoche; });
  ctx.grupo.add(s); ctx.halos.push(s);
  return s;
}

export function construirComedor(ctx) {
  const { kit, lote, grupo, colisiones, pulsables } = ctx;
  const laton = kit.metal('laton', .55), cromo = kit.metal('cromo', .65, 1), acero = kit.metal('cromo', .5, 2.5);
  const guinga = materialSuperficie({ map: texturaGuinga(), metros: .1, bandas: 3 });
  const madera = 'nogal', r = azar(77);
  ctx.mesas = [];

  // ── Mesas ────────────────────────────────────────────────────────────
  let numero = 0;
  function mesa(x, z, { lado = .86, sillas = ['n', 's', 'e', 'o'], banco = null, fiasco = true, pan = false } = {}) {
    const n = ++numero, info = { numero: n, x, z, lado, asientos: [] };
    const mantel = lado + .26;
    lote.en(x, 0, z, 0, () => {
      lote.caja(guinga, 0, .665, 0, mantel, .21, mantel, { contorno: 'medio', nombre: 'el mantel de cuadros' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) lote.caja(madera, sx * (lado / 2 - .06), .28, sz * (lado / 2 - .06), .06, .56, .06, { contorno: 'medio', nombre: 'la mesa' });
      lote.sombra(0, 0, lado + .5, lado + .5, 1.1);
      // sitios: diner en la dirección del lado
      const puestos = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], o: [-1, 0, -Math.PI / 2] };
      const todos = banco ? [...sillas, banco] : sillas;
      for (const l of todos) {
        const [dx, dz, ry] = puestos[l];
        lote.en(dx * (lado / 2 - .17), .776, dz * (lado / 2 - .17), ry, () => cubierto(ctx, { copa: true }));
      }
      for (const l of sillas) {
        const [dx, dz] = puestos[l], ry = Math.atan2(-dx, -dz) + (r() - .5) * .16;
        const d = lado / 2 + .22;
        lote.en(dx * d, 0, dz * d, ry, () => sillaBistro(lote, kit));
        info.asientos.push({ x: x + dx * (lado / 2 + .5), z: z + dz * (lado / 2 + .5), yaw: Math.atan2(-dx, dz) });
      }
      if (banco) { const [dx, dz] = puestos[banco]; info.asientos.push({ x: x + dx * (lado / 2 + .3), z: z + dz * (lado / 2 + .3), yaw: Math.atan2(-dx, dz) }); }
      // centro: fiasco con vela, sal y pimienta; cesta de pan en algunas
      if (fiasco) {
        lote.pieza(GEO.fiasco, vidrios().verde, 0, .776, 0, 1, 1, 1, { nombre: 'el fiasco de chianti' });
        lote.cil('paja', 0, .776 + .055, 0, .178, .11, { lados: 16, contorno: 'medio', nombre: 'el fiasco de chianti' });
        lote.cil('vela', 0, .776 + .36, 0, .026, .11, { lados: 10, contorno: 'medio', nombre: 'la vela' });
        for (let k = 0; k < 4; k++) lote.esfera('vela', Math.cos(k * 1.7) * .018, .776 + .33 - k * .03, Math.sin(k * 1.7) * .018, .012, .04, .012, { contorno: false });
        lote.pieza(GEO.llama, kit.emisivo('#ffcf6a'), 0, .776 + .418, 0, 1, 1, 1);
        halo(ctx, x, 1.23, z, .42);
      }
      for (const s of [-1, 1]) {
        lote.cil(vidrios().transparente, s * .09, .776 + .04, .12, .035, .08, { lados: 12 });
        lote.cil(s < 0 ? 'mantel' : '#3b3632', s * .09, .776 + .03, .12, .03, .05, { lados: 12, contorno: false, nombre: s < 0 ? 'el salero' : 'el pimentero' });
        lote.cil(cromo, s * .09, .776 + .09, .12, .036, .02, { lados: 12, contorno: false });
      }
      if (pan) {
        lote.cil('paja', -.12, .776 + .04, -.1, .2, .08, { contorno: 'medio', nombre: 'la cesta de pan' });
        for (let k = 0; k < 3; k++) lote.esfera('pan', -.12 + (k - 1) * .05, .776 + .09, -.1 + (k % 2) * .03, .09, .05, .06, { contorno: 'medio', nombre: 'el pan' });
      }
    });
    // la carta: una carpeta de cuero cerrada sobre la mesa, pulsable
    const carta = new T.Mesh(new T.BoxGeometry(.22, .014, .31), cartaMaterial);
    {   // cerrada sobre el plato del primer comensal, mirando hacia él
      const [dx, dz, ry] = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], o: [-1, 0, -Math.PI / 2] }[sillas[0]];
      carta.position.set(x + dx * (lado / 2 - .17), .776 + .03, z + dz * (lado / 2 - .17)); carta.rotation.y = ry + (r() - .5) * .12;
    }
    carta.userData = { nombre: 'la carta', accion: 'carta', mesa: n };
    grupo.add(carta); pulsables.push(carta);
    (ctx.cartas ??= new Map()).set(n, carta);
    colisiones.push([x - lado / 2 - .1, z - lado / 2 - .1, x + lado / 2 + .1, z + lado / 2 + .1]);
    ctx.mesas.push(info);
    return info;
  }
  const tapa = lienzo(256, 352, (c, w, h) => {
    c.fillStyle = '#6e2320'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e0b24f'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
    c.fillStyle = '#e0b24f'; c.textAlign = 'center'; c.font = `italic bold ${h * .1}px Georgia, serif`; c.fillText('Menù', w / 2, h * .45);
    c.font = `${h * .05}px Georgia, serif`; c.fillText('LA NONNA', w / 2, h * .56);
  });
  const cartaMaterial = [crearMaterialToon({ color: '#6e2320', bandas: 3 })];
  cartaMaterial.push(cartaMaterial[0], crearMaterialToon({ albedo: tapa, bandas: 2 }), cartaMaterial[0], cartaMaterial[0], cartaMaterial[0]);

  // mesas de cuatro en el centro
  for (const [x, z, pan] of [[-.3, -3.25, true], [2.95, -3.25, false], [6.1, -3.25, true], [-.3, -5.8, false], [2.95, -5.8, true], [6.1, -5.8, false]]) {
    mesa(x, z, { pan });
    colgante(ctx, x, z, 2.08);
  }
  // mesas de dos junto a los ventanales (sillas este-oeste)
  for (const [x0, x1] of VENTANAS.slice(1)) {
    const x = (x0 + x1) / 2;
    mesa(x, -1.05, { lado: .7, sillas: ['e', 'o'], pan: false });
    colgante(ctx, x, -1.05, 2.15, { potencia: .8 });
    cortinaCafe(ctx, x0 + .06, x1 - .06, -.2);
    lote.caja(kit.esmalte('marmol', .25), x, VENTANA_Y[0] - .02, -.25, x1 - x0 + .1, .04, .22, { contorno: 'medio', nombre: 'el alféizar' });
  }
  // banco corrido de cuero verde al este y sus mesas de dos
  const B = { x: 9.62, z0: -8.85, z1: -1.3 };
  const cuero = kit.esmalte('cuero', .2, 2.5);
  lote.caja('nogalOscuro', B.x, .21, (B.z0 + B.z1) / 2, .56, .42, B.z1 - B.z0, { contorno: 'medio', nombre: 'el banco corrido' });
  lote.caja(cuero, B.x - .02, .47, (B.z0 + B.z1) / 2, .54, .1, B.z1 - B.z0 - .04, { contorno: 'medio', nombre: 'el banco corrido' });
  for (let z = B.z0 + .14; z < B.z1 - .05; z += .26) lote.caja(cuero, B.x + .2, .82, z, .1, .62, .24, { rz: .08, contorno: 'medio', nombre: 'el respaldo de cuero' });
  lote.caja('nogalOscuro', B.x + .23, 1.17, (B.z0 + B.z1) / 2, .16, .07, B.z1 - B.z0, { contorno: 'medio' });
  for (const s of [-1, 1]) lote.caja('nogalOscuro', B.x, .6, s < 0 ? B.z0 : B.z1, .6, 1.2, .07, { contorno: 'medio' });
  colisiones.push([B.x - .3, B.z0, 9.9, B.z1]);
  for (const z of [-7.9, -5.95, -4.05, -2.15]) mesa(8.78, z, { lado: .7, sillas: ['o'], banco: 'e', pan: z === -5.95 });
  const pinturas = [['coliseo', -7.0], ['venecia', -5.0], ['toscana', -3.1]];
  for (const [tipo, z] of pinturas) cuadro(ctx, 9.88, 2.05, z, -Math.PI / 2, 1.05, .75, tipo);
  for (const z of [-8.1, -6.0, -4.05, -2.1]) aplique(ctx, 9.88, 1.72, z, -Math.PI / 2);

  // ── Barra: mostrador, botellero con espejo, cafetera ──────────────────
  const BZ = -8.35, BX0 = -2.9, BX1 = 1.5;
  lote.caja('barra', (BX0 + BX1) / 2, .52, BZ, BX1 - BX0, 1.04, .56, { contorno: 'medio', nombre: 'la barra' });
  for (let x = BX0 + .5; x < BX1 - .2; x += .62) {
    lote.caja('moldura', x, .55, BZ + .285, .46, .72, .02, { contorno: 'medio', nombre: 'la barra' });
    lote.caja('barra', x, .55, BZ + .292, .34, .56, .02, { contorno: false });
  }
  lote.caja(kit.esmalte('marmol', .35, 2), (BX0 + BX1) / 2, 1.075, BZ + .03, BX1 - BX0 + .06, .05, .7, { contorno: 'medio', nombre: 'el mostrador de mármol' });
  lote.caja('zocalo', (BX0 + BX1) / 2, .06, BZ + .24, BX1 - BX0, .12, .1, { contorno: false });
  lote.cil(laton, (BX0 + BX1) / 2 + .1, .22, BZ + .42, .05, BX1 - BX0 - .2, { rz: Math.PI / 2, lados: 12, contorno: 'medio', nombre: 'la barra de latón' });
  for (let x = BX0 + .4; x < BX1; x += .9) lote.caja(laton, x, .2, BZ + .35, .03, .03, .14, { contorno: false });
  lote.sombra((BX0 + BX1) / 2, BZ + .1, BX1 - BX0 + .5, 1.1, 1);
  colisiones.push([BX0, BZ - .3, BX1, BZ + .45]);
  // taburetes
  for (const x of [-2.2, -1.15, -.1, .95]) lote.en(x, 0, -7.6, r() * .5, () => {
    lote.cil(kit.esmalte('cueroRojo', .2), 0, .78, 0, .38, .08, { contorno: 'medio', nombre: 'el taburete' });
    lote.cil('nogalOscuro', 0, .73, 0, .36, .04, { contorno: 'medio' });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + .78; lote.cil('nogalOscuro', Math.cos(a) * .13, .36, Math.sin(a) * .13, .035, .74, { lados: 8, rx: Math.sin(a) * .1, rz: -Math.cos(a) * .1, contorno: 'medio' }); }
    lote.pieza(kit.geo.cil16, laton, 0, .3, 0, .34, .02, .34, { contorno: false });
    lote.sombra(0, 0, .6, .6, .9);
  });
  // sobre el mostrador: caja registradora, frutero de limones, copas, servilleteros
  lote.en(-2.35, 1.1, BZ - .05, .25, () => {
    lote.caja(laton, 0, .14, 0, .4, .28, .36, { contorno: 'medio', nombre: 'la caja registradora' });
    lote.caja(laton, 0, .34, -.1, .3, .14, .1, { contorno: 'medio', nombre: 'la caja registradora' });
    lote.caja('negro', 0, .35, -.045, .22, .07, .01, { contorno: false });
    for (let i = 0; i < 12; i++) lote.cil('mantel', -.13 + (i % 4) * .085, .3, .02 + Math.floor(i / 4) * .06, .035, .02, { lados: 8, rx: -.5, contorno: false });
  });
  lote.pieza(GEO.cuenco, kit.esmalte('loza', .25), -.9, 1.1, BZ - .05, 1.4, 1.2, 1.4, { nombre: 'el frutero' });
  for (let k = 0; k < 6; k++) lote.esfera('#f2d23c', -.9 + Math.cos(k) * .05, 1.2 + (k > 3 ? .04 : 0), BZ - .05 + Math.sin(k * 2) * .05, .08, .065, .065, { contorno: 'medio', nombre: 'el limón' });
  for (const x of [.1, .25, .4]) lote.pieza(GEO.copa, vidrios().copa, x, 1.1, BZ + .15, 1, 1, 1, { nombre: 'la copa de vino' });
  lote.pieza(GEO.jarra, vidrios().transparente, .95, 1.1, BZ, 1, 1, 1, { nombre: 'la jarra de agua' });
  lote.cil('#bfe4ee', .95, 1.18, BZ, .09, .14, { lados: 16, contorno: false });

  // botellero: mueble bajo, repisas y espejo de verdad detrás
  const MZ = -9.9;
  lote.caja('nogal', -.5, .47, MZ + .27, 4.8, .94, .54, { contorno: 'medio', nombre: 'el mueble de la barra' });
  for (let x = -2.6; x < 1.8; x += .6) lote.caja('moldura', x + .3, .47, MZ + .545, .5, .74, .02, { contorno: false });
  lote.caja(kit.esmalte('marmol', .3), -.5, .96, MZ + .28, 4.84, .04, .58, { contorno: 'medio' });
  const espejo = crearEspejo(4.4, 1.35, { tinte: '#efe6d3' });
  espejo.position.set(-.5, 1.85, MZ + .012); espejo.userData.nombre = 'el espejo de la barra'; grupo.add(espejo); pulsables.push(espejo);
  for (const y of [1.2, 1.72, 2.24]) {
    lote.caja('nogalOscuro', -.5, y, MZ + .13, 4.6, .035, .26, { contorno: 'medio', nombre: 'la repisa' });
    for (const x of [-2.4, -.5, 1.4]) lote.caja(laton, x, y - .05, MZ + .06, .02, .08, .1, { contorno: false });
  }
  for (const s of [-1, 1]) lote.caja('nogalOscuro', -.5 + s * 2.35, 1.85, MZ + .06, .12, 1.55, .12, { contorno: 'medio' });
  lote.caja('nogalOscuro', -.5, 2.66, MZ + .1, 4.9, .18, .2, { contorno: 'medio' });
  const cartelBar = ilustracion(2.2, .32, 1024, (c, w, h) => {
    c.fillStyle = '#2d1b10'; c.fillRect(0, 0, w, h); c.fillStyle = '#e0b24f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `italic bold ${h * .62}px Georgia, serif`; c.fillText('Bar  ·  Caffè  ·  Vini', w / 2, h * .54);
  });
  cartelBar.position.set(-.5, 2.66, MZ + .205); grupo.add(cartelBar);
  // botellas variadas en las repisas
  const tipos = [['botellaVino', 'verde'], ['botellaVino', 'oscuro'], ['botellaLicor', 'ambar'], ['botellaAgua', 'transparente'], ['botellaLicor', 'rojo'], ['botellaVino', 'verde']];
  const nombres = { botellaVino: 'la botella de vino', botellaLicor: 'la botella de licor', botellaAgua: 'la botella de agua' };
  for (const y of [1.22, 1.74]) for (let x = -2.55; x < 1.6; x += .13 + r() * .06) {
    const [tipo, vidrio] = tipos[Math.floor(r() * tipos.length)];
    botella(ctx, x, y + .018, MZ + .12, { tipo, vidrio, nombre: nombres[tipo], etiqueta: r() > .5 ? 'papel' : '#e8d9b0' });
  }
  // copas boca abajo en la repisa alta
  for (let x = -2.5; x < 1.6; x += .16) lote.pieza(GEO.copa, vidrios().copa, x, 2.26 + .205, MZ + .13, 1, 1, 1, { rx: Math.PI, nombre: 'la copa' });
  // cafetera espresso roja esmaltada, con cromo, manómetro y cúpula de latón
  lote.en(1.05, .98, MZ + .3, 0, () => {
    const rojo = kit.esmalte('cuadroRojo', .3, 2);
    lote.caja(rojo, 0, .2, 0, .74, .36, .46, { contorno: 'medio', nombre: 'la cafetera' });
    lote.caja(cromo, 0, .02, .02, .78, .04, .5, { contorno: 'medio', nombre: 'la cafetera' });
    lote.caja(cromo, 0, .39, 0, .78, .04, .5, { contorno: 'medio' });
    lote.caja(cromo, 0, .2, .232, .6, .05, .01, { contorno: false });
    lote.caja(acero, 0, .07, .2, .7, .015, .22, { contorno: false, nombre: 'la rejilla' });
    for (const s2 of [-1, 1]) {
      lote.cil(cromo, s2 * .18, .15, .27, .11, .07, { lados: 16, contorno: 'medio', nombre: 'el grupo de café' });
      lote.caja('negro', s2 * .18, .1, .41, .04, .04, .2, { rx: .15, contorno: 'medio', nombre: 'el portafiltro' });
      lote.pieza(GEO.taza, kit.esmalte('loza', .25), s2 * .18, .085, .27, 1, 1, 1, { nombre: 'la taza de café' });
      lote.cil(cromo, s2 * .36, .2, .2, .018, .28, { rz: s2 * .25, lados: 8, contorno: 'medio', nombre: 'el vaporizador' });
    }
    lote.cil(cromo, 0, .3, .24, .1, .02, { rx: Math.PI / 2, lados: 20, contorno: 'medio', nombre: 'el manómetro' });
    lote.cil('mantel', 0, .3, .252, .085, .006, { rx: Math.PI / 2, lados: 20, contorno: false, nombre: 'el manómetro' });
    lote.caja('negro', .015, .31, .257, .004, .035, .002, { rz: -.7, contorno: false });
    lote.pieza(kit.geo.esfera, laton, 0, .41, 0, .42, .3, .32, { contorno: 'medio', nombre: 'la cafetera' });
    lote.cil(laton, 0, .58, 0, .04, .06, { lados: 12, contorno: false });
    lote.esfera(laton, 0, .63, 0, .07, .06, .07, { contorno: 'medio' });
    for (let k = 0; k < 6; k++) lote.pieza(GEO.taza, kit.esmalte('loza', .25), -.25 + (k % 3) * .25, .41 + Math.floor(k / 3) * .052, (k % 2) * .1 - .14, 1, 1, 1, { nombre: 'la taza' });
    lote.sombra(0, 0, .9, .6, 1);
  });
  // colgantes de latón sobre la barra y fiascos colgados de una viga
  for (const x of [-2.0, -.55, .9]) colgante(ctx, x, BZ + .15, 1.98, { potencia: .9 });
  lote.caja('viga', -.55, 3.02, BZ + .3, 4.4, .12, .12, { contorno: 'medio', nombre: 'la viga' });
  for (const s of [-1, 1]) lote.cil('hierro', -.55 + s * 2.1, 3.32, BZ + .3, .015, .5, { lados: 6, contorno: false });
  for (let k = 0; k < 9; k++) {
    const x = -2.5 + k * .49, y = 2.55 - (k % 2) * .06, z = BZ + .3;   // cuelgan del cuello, cuerpo abajo
    lote.cil('paja', x, (y + .3 + 2.96) / 2, z, .01, 2.96 - y - .3, { lados: 6, contorno: false });
    lote.pieza(GEO.fiasco, vidrios()[k % 3 ? 'verde' : 'ambar'], x, y, z, 1, 1, 1, { nombre: 'el fiasco de chianti' });
    lote.cil('paja', x, y + .055, z, .178, .11, { lados: 16, contorno: 'medio', nombre: 'el fiasco de chianti' });
    lote.cil('cuadroRojo', x, y + .27, z, .04, .03, { lados: 8, contorno: false });
  }

  // ── Aparador y pizarra de especialidades ──────────────────────────────
  lote.en(3.05, 0, -9.62, 0, () => {
    lote.caja('nogal', 0, .45, 0, 2.1, .9, .52, { contorno: 'medio', nombre: 'el aparador' });
    for (const s of [-1, 1]) { lote.caja('moldura', s * .52, .47, .265, .9, .7, .02, { contorno: 'medio' }); lote.esfera(laton, s * .12, .6, .29, .035, .035, .03, { contorno: false }); }
    lote.caja(kit.esmalte('marmol', .3), 0, .92, 0, 2.16, .04, .56, { contorno: 'medio' });
    for (let k = 0; k < 8; k++) lote.pieza(GEO.plato, kit.esmalte('loza', .25), -.65, .94 + k * .024, 0, 1, 1, 1, { nombre: 'los platos' });
    for (let k = 0; k < 6; k++) lote.caja(k % 2 ? 'cuadroRojo' : 'mantel', -.2, .95 + k * .018, -.02, .3, .016, .3, { contorno: false, nombre: 'las servilletas' });
    lote.pieza(GEO.jarra, vidrios().transparente, .25, .94, -.05, 1, 1, 1, { nombre: 'la jarra de agua' });
    lote.pieza(GEO.jarra, vidrios().transparente, .45, .94, .05, 1, 1, 1, { nombre: 'la jarra de agua' });
    lote.cil('paja', .8, .99, 0, .3, .1, { contorno: 'medio', nombre: 'la cesta de pan' });
    for (let k = 0; k < 4; k++) lote.esfera('pan', .72 + (k % 2) * .14, 1.07, -.05 + Math.floor(k / 2) * .1, .12, .06, .08, { contorno: 'medio', nombre: 'el pan' });
    lote.sombra(0, .05, 2.5, .9, 1);
  });
  colisiones.push([1.95, -9.9, 4.15, -9.3]);
  lote.en(3.05, 2.0, -9.9, 0, () => {
    lote.caja('roble', 0, 0, .03, 1.9, 1.2, .05, { contorno: 'medio', nombre: 'la pizarra de especialidades' });
  });
  const especiales = ilustracion(1.76, 1.06, 1024, (c, w, h) => {
    c.fillStyle = '#2b2f2c'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.05)'; const q = azar(8); for (let i = 0; i < 60; i++) c.fillRect(q() * w, q() * h, 60, 3);
    c.textAlign = 'center'; c.fillStyle = '#f4efe4'; c.font = `italic bold ${h * .12}px Georgia, serif`; c.fillText('Specialità della casa', w / 2, h * .15);
    c.fillStyle = '#e0b24f'; c.fillRect(w * .25, h * .19, w * .5, 4);
    const lista = [['Ravioli de ricotta y espinacas', '14 €'], ['Tagliatelle al ragù', '13 €'], ['Pizza cuatro quesos', '12 €'], ['Ossobuco a la milanesa', '19 €'], ['Panna cotta con frutos rojos', '6 €']];
    c.font = `${h * .07}px Georgia, serif`;
    lista.forEach(([p, e], i) => { const y = h * (.34 + i * .13); c.textAlign = 'left'; c.fillStyle = '#f4efe4'; c.fillText(p, w * .07, y); c.textAlign = 'right'; c.fillStyle = '#f2c14e'; c.fillText(e, w * .93, y); });
    c.fillStyle = '#c9e0c3'; c.textAlign = 'center'; c.font = `italic ${h * .065}px Georgia, serif`; c.fillText('Pregunte por el vino del día', w / 2, h * .96);
  });
  especiales.position.set(3.05, 2.0, -9.84); especiales.userData = { nombre: 'la pizarra de especialidades', accion: 'carta', mesa: 0 }; grupo.add(especiales); pulsables.push(especiales);

  // ── Puertas vaivén de la cocina (cerradas) ────────────────────────────
  const K = HUECOS.cocina, hojaK = K.ancho / 2 - .015;
  const ojo = vidrios().claro;
  // detrás de los ojos de buey, un fondo pintado: luz cálida de cocina (no se entra)
  const fondoCocina = ilustracion(K.ancho, K.alto, 512, (c, w, h) => {
    c.fillStyle = '#e8e4da'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#cfc8ba'; c.lineWidth = 2; for (let y = 0; y < h; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = '#b9c0c5'; c.fillRect(0, h * .12, w, h * .18); c.fillStyle = '#9aa3aa'; c.fillRect(0, h * .3, w, h * .03);
    c.fillStyle = '#c8cdd1'; c.fillRect(0, h * .55, w, h * .45);
    const g = c.createRadialGradient(w / 2, h * .35, 5, w / 2, h * .35, w * .8); g.addColorStop(0, 'rgba(255,220,160,.5)'); g.addColorStop(1, 'rgba(255,220,160,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  fondoCocina.rotation.y = 0; fondoCocina.position.set(K.x, K.alto / 2, -10.12); grupo.add(fondoCocina);
  for (const s of [-1, 1]) {
    crearPuerta(ctx, {
      bisagra: [K.x + s * (K.ancho / 2 - .005), -10], automatica: false,
      construir: l => {
        const d = -s, x = c => d * c;
        // hoja con un agujero redondo de verdad para el ojo de buey
        const forma = new T.Shape(), x0 = Math.min(x(0), x(hojaK)), x1 = Math.max(x(0), x(hojaK)), alto = K.alto - .03;
        forma.moveTo(x0, 0); forma.lineTo(x1, 0); forma.lineTo(x1, alto); forma.lineTo(x0, alto); forma.lineTo(x0, 0);
        const agujero = new T.Path(); agujero.absarc(x(hojaK / 2), 1.55, .172, 0, Math.PI * 2, true); forma.holes.push(agujero);
        const geoHoja = conNormalContorno(new T.ExtrudeGeometry(forma, { depth: .05, bevelEnabled: false, curveSegments: 32 }).translate(0, .005, -.025));
        l.pieza(geoHoja, 'verdeTienda', 0, 0, 0, 1, 1, 1, { contorno: 'medio', nombre: 'la puerta de la cocina' });
        l.caja(acero, x(hojaK / 2), .2, .03, hojaK - .04, .36, .006, { contorno: false, nombre: 'la chapa de acero' });
        l.caja('verdeTiendaClaro', x(hojaK / 2), .95, .028, hojaK - .16, .7, .01, { contorno: false });
        l.pieza(kit.geo.aro, cromo, x(hojaK / 2), 1.55, 0, .36, .9, .36, { rx: Math.PI / 2, contorno: 'medio', nombre: 'el ojo de buey' });
        l.pieza(kit.geo.disco, ojo, x(hojaK / 2), 1.555, 0, .35, .35, 1, { nombre: 'el ojo de buey' });
        l.caja(acero, x(hojaK - .1), 1.1, .03, .05, .3, .006, { contorno: false, nombre: 'la placa de empuje' });
      },
    });
  }
  // marco y rótulo «CUCINA»
  for (const s of [-1, 1]) lote.caja('nogalOscuro', K.x + s * (K.ancho / 2 + .04), K.alto / 2, -9.88, .1, K.alto + .1, .06, { contorno: 'medio' });
  lote.caja('nogalOscuro', K.x, K.alto + .06, -9.88, K.ancho + .18, .12, .06, { contorno: 'medio' });
  const rotuloCocina = ilustracion(.9, .2, 512, (c, w, h) => {
    c.fillStyle = '#2d1b10'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e0b24f'; c.lineWidth = 4; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#e0b24f'; c.font = `bold ${h * .5}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('CUCINA', w / 2, h * .54);
  });
  rotuloCocina.position.set(K.x, K.alto + .32, -9.86); rotuloCocina.userData.nombre = 'la cocina'; grupo.add(rotuloCocina); pulsables.push(rotuloCocina);
  const privado = ilustracion(.4, .12, 512, (c, w, h) => { c.fillStyle = '#f4efe4'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7a2a24'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = '#7a2a24'; c.font = `bold ${h * .36}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SOLO PERSONAL', w / 2, h * .54); });
  privado.position.set(K.x - K.ancho / 4, 1.98, -10 + .032); privado.userData.nombre = 'solo personal'; pulsables.push(privado); grupo.add(privado);
  ctx.puertaCocinaCartel = privado;
  colisiones.push([K.x - K.ancho / 2 - .1, -10.2, K.x + K.ancho / 2 + .1, -9.85]);

  // ── Vinoteca de suelo a techo ─────────────────────────────────────────
  const W = { x0: 6.15, x1: 9.9, z: -9.9, fondo: .36 };
  const cols = 12, filas = 10, cw = (W.x1 - W.x0) / cols, ch = (H - .5) / filas;
  lote.caja('nogalOscuro', (W.x0 + W.x1) / 2, .15, W.z + W.fondo / 2, W.x1 - W.x0, .3, W.fondo, { contorno: 'medio', nombre: 'la vinoteca' });
  lote.caja('#2a1a12', (W.x0 + W.x1) / 2, H / 2, W.z + .015, W.x1 - W.x0, H, .02, { contorno: false });
  for (let i = 0; i <= cols; i++) lote.caja('roble', W.x0 + i * cw, .3 + (H - .5) / 2, W.z + W.fondo / 2, .03, H - .5, W.fondo, { contorno: i % 4 === 0 ? 'medio' : false, nombre: 'la vinoteca' });
  for (let j = 0; j <= filas; j++) lote.caja('roble', (W.x0 + W.x1) / 2, .3 + j * ch, W.z + W.fondo / 2, W.x1 - W.x0, .03, W.fondo, { contorno: j % 5 === 0 ? 'medio' : false });
  lote.caja('nogalOscuro', (W.x0 + W.x1) / 2, H - .1, W.z + .2, W.x1 - W.x0, .2, .4, { contorno: 'medio' });
  const vinos = ['verde', 'oscuro', 'verde', 'rojo', 'oscuro', 'ambar'];
  for (let i = 0; i < cols; i++) for (let j = 0; j < filas; j++) {
    if (r() < .14) continue;
    const x = W.x0 + (i + .5) * cw, y = .3 + (j + .5) * ch - .01;
    botella(ctx, x, y, W.z + .03, { vidrio: vinos[Math.floor(r() * vinos.length)], rx: Math.PI / 2, etiqueta: r() > .5 ? 'papel' : '#e6d2a8', capsula: ['#b3202f', '#e0b24f', '#b3202f', '#f4efe4', '#2f5a42'][Math.floor(r() * 5)] });
  }
  colisiones.push([W.x0, W.z, W.x1, W.z + W.fondo + .05]);
  for (const x of [7.1, 9.0]) ctx.lamparas.push({ pos: [x, 2.9, -9.0], color: '#ffd9a0', intensidad: .8, radio: 2.4 });
  for (const x of [6.6, 8.0, 9.4]) lote.cil(kit.emisivo('#fff0c8'), x, H - .21, W.z + .33, .05, .02, { lados: 12 });

  // ── Muro oeste del comedor: cartel de los baños y cuadros ─────────────
  const cartelBanos = ilustracion(.9, .26, 512, (c, w, h) => {
    c.fillStyle = '#2f5a42'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e0b24f'; c.lineWidth = 5; c.strokeRect(5, 5, w - 10, h - 10);
    c.fillStyle = '#f4efe4'; c.font = `bold ${h * .42}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Aseos  →', w / 2, h * .54);
  });
  cartelBanos.rotation.y = Math.PI / 2; cartelBanos.position.set(-2.89, 2.55, HUECOS.pasillo.z); cartelBanos.userData.nombre = 'los aseos'; grupo.add(cartelBanos); pulsables.push(cartelBanos);
  for (const s of [-1, 1]) lote.caja('nogalOscuro', -2.9, HUECOS.pasillo.alto / 2, HUECOS.pasillo.z + s * (HUECOS.pasillo.ancho / 2 + .04), .26, HUECOS.pasillo.alto + .08, .08, { contorno: 'medio' });
  lote.caja('nogalOscuro', -2.9, HUECOS.pasillo.alto + .04, HUECOS.pasillo.z, .26, .08, HUECOS.pasillo.ancho + .16, { contorno: 'medio' });
  cuadro(ctx, -2.88, 1.95, -4.6, Math.PI / 2, .7, .95, 'pisa');
  cuadro(ctx, -2.88, 1.95, -8.35, Math.PI / 2, .7, .95, 'pasta', { marco: 'nogalOscuro', nombre: 'el cartel de la pasta' });
  aplique(ctx, -2.88, 1.9, -7.2, Math.PI / 2);

  // ── Ventiladores de techo (giran), plantas colgantes, olivos, tonel ───
  for (const [x, z] of [[1.3, -4.5], [4.5, -4.5]]) {
    const aspas = new T.Group(); aspas.position.set(x, 3.0, z);
    const l = crearLote(kit);
    for (let k = 0; k < 5; k++) l.en(0, 0, 0, k * Math.PI * 2 / 5, () => { l.caja('roble', 0, 0, .38, .14, .012, .56, { contorno: 'medio', nombre: 'el ventilador' }); l.caja(laton, 0, .015, .12, .04, .015, .16, { contorno: false }); });
    l.construir(aspas, pulsables); grupo.add(aspas);
    lote.cil(laton, x, 3.32, z, .025, .56, { lados: 8, contorno: 'medio' });
    lote.cil(laton, x, 3.06, z, .2, .12, { contorno: 'medio', nombre: 'el ventilador' });
    lote.cil(laton, x, 3.56, z, .14, .06, { contorno: 'medio' });
    ctx.animados.push(dt => { aspas.rotation.y += dt * 1.6; });
  }
  for (const x of [1.3, 5.3]) {
    lote.cil('hierro', x, 3.05, -.55, .01, 1.1, { lados: 6, contorno: false });
    lote.cil('maceta', x, 2.42, -.55, .32, .2, { contorno: 'medio', nombre: 'la planta colgante' });
    lote.esfera('hoja', x, 2.56, -.55, .42, .26, .42, { contorno: 'medio', nombre: 'la planta colgante' });
    const q = azar(Math.round(x * 7));
    for (let k = 0; k < 7; k++) { const a = k * .9; lote.esfera(k % 2 ? 'hoja' : 'hojaOscura', x + Math.cos(a) * .16, 2.3 - q() * .45, -.55 + Math.sin(a) * .14, .1, .36 + q() * .2, .1, { contorno: 'medio' }); }
  }
  planta(ctx, -2.45, -.62, { alto: 1.5, semilla: 5 });
  lote.en(9.4, 0, -.62, 0, () => {         // tonel de roble con un fiasco encima
    lote.pieza(GEO.tonel ??= conTonel(), 'roble', 0, 0, 0, 1, 1, 1, { contorno: 'medio', nombre: 'el tonel' });
    for (const y of [.12, .38, .62, .88]) lote.cil('hierro', 0, y, 0, y > .2 && y < .8 ? .61 : .55, .04, { lados: 24, contorno: false });
    lote.pieza(GEO.fiasco, vidrios().verde, 0, 1.0, 0, 1.3, 1.3, 1.3, { nombre: 'el fiasco de chianti' });
    lote.cil('paja', 0, 1.07, 0, .23, .14, { contorno: 'medio' });
    lote.sombra(0, 0, .9, .9, 1);
  });
  colisiones.push([9.05, -.95, 9.9, -.25]);
}

function conTonel() {
  const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new T.Vector2(.27 + Math.sin(t * Math.PI) * .04, t * 1.0)); }
  pts.unshift(new T.Vector2(0, 0)); pts.push(new T.Vector2(0, 1));
  return conNormalContorno(new T.LatheGeometry(pts, 24));
}
