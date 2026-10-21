import * as T from '../three.js';
import { ALTO_TECHO as H, ALTO_FACHADA, LOCAL, PUERTA, APARADOR, LETRERO, ACERA, CONSULTORIO, BODEGA } from './config.js';
import { texturaEstuco, texturaPintura, texturaAzulejo, materialSuperficie, lienzo, azar } from '../Kit.js';
import { contornoDe, crearReceptorSombra } from '../Luz25D.js';
import { crearVidrio, crearSueloBrillante } from '../Reflejos.js';
import * as R from './Rotulos.js';

/* ── Casco de la farmacia ─────────────────────────────────────────────────
   Muros con sus huecos, piso cerámico encerado, plafón reticular con
   paneles de luz, fachada (letrero de caja de luz, cruz de bandera,
   cortinas metálicas enrolladas, puerta doble y aparador de vidrio) y la
   calle: acera, guarnición, asfalto, vecinos y el fondo pintado de enfrente.
   Todo en metros; medidas en config.js. */

const { x0: X0, x1: X1, z0: Z0 } = LOCAL;
const FZ = .25;                       // cara exterior del muro de fachada (el interior está en z = 0)

// Paños [u0, u1, y0, y1] de un muro sin sus huecos {a0, a1, y0, y1}.
export function tramos(a0, a1, y0, y1, huecos = []) {
  const cortes = new Set([a0, a1]);
  for (const h of huecos) { if (h.a0 > a0 && h.a0 < a1) cortes.add(h.a0); if (h.a1 > a0 && h.a1 < a1) cortes.add(h.a1); }
  const xs = [...cortes].sort((a, b) => a - b), out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const u0 = xs[i], u1 = xs[i + 1], um = (u0 + u1) / 2;
    let libres = [[y0, y1]];
    for (const h of huecos) if (um > h.a0 && um < h.a1) {
      libres = libres.flatMap(([b0, b1]) => {
        const r = [];
        if (h.y0 > b0) r.push([b0, Math.min(b1, h.y0)]);
        if (h.y1 < b1) r.push([Math.max(b0, h.y1), b1]);
        return r.filter(([c0, c1]) => c1 - c0 > .001);
      });
    }
    for (const [b0, b1] of libres) out.push([u0, u1, b0, b1]);
  }
  return out;
}

const HUECO_PUERTA = { a0: PUERTA.x0, a1: PUERTA.x1, y0: 0, y1: PUERTA.alto };
const HUECO_APARADOR = { a0: APARADOR.x0, a1: APARADOR.x1, y0: APARADOR.y0, y1: APARADOR.y1 };
const HUECO_CONSULTORIO = { a0: CONSULTORIO.z - CONSULTORIO.ancho / 2, a1: CONSULTORIO.z + CONSULTORIO.ancho / 2, y0: 0, y1: CONSULTORIO.alto };
const HUECO_BODEGA = { a0: BODEGA.z - BODEGA.ancho / 2, a1: BODEGA.z + BODEGA.ancho / 2, y0: 0, y1: BODEGA.alto };

export function construirCasco(ctx) {
  const { kit, lote, grupo, colisiones, exterior, animables } = ctx;
  // caja por límites
  const bloque = (m, x0, x1, y0, y1, z0, z1, o = { contorno: false }) =>
    lote.caja(m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, o);

  /* ── Materiales de superficie ── */
  const pared = materialSuperficie({ map: texturaPintura('#f3f1ea', 3), metros: 1.2, bandas: 3 });
  const fachada = materialSuperficie({ map: texturaPintura('#f1ede2', 5), metros: 1.2, bandas: 3 });
  const baldosa = texturaAzulejo({ color: '#f1f0eb', junta: '#c9c5bb', columnas: 4, filas: 4, trabado: false, variar: .035 });
  const piso = materialSuperficie({ map: baldosa.map, normal: baldosa.normal, metros: 1.8, fuerzaNormal: .9 });
  const losa = texturaAzulejo({ color: '#cfc9bd', junta: '#aaa396', columnas: 2, filas: 2, trabado: false, variar: .07 });
  const acera = materialSuperficie({ map: losa.map, normal: losa.normal, metros: 2.4, fuerzaNormal: .7 });
  const asfalto = materialSuperficie({ map: lienzo(256, 256, (c, w, h) => {
    c.fillStyle = '#5d6066'; c.fillRect(0, 0, w, h);
    const r = azar(5);
    for (let i = 0; i < 1400; i++) { c.fillStyle = r() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repetir: true }), metros: 2, bandas: 2 });
  const cantera = materialSuperficie({ map: lienzo(512, 256, (c, w, h) => {
    c.fillStyle = '#cdbfa5'; c.fillRect(0, 0, w, h);
    const r = azar(8);
    for (let j = 0; j < 2; j++) for (let i = -1; i < 4; i++) {
      const x = i * 160 + (j % 2) * 80, y = j * 128;
      c.fillStyle = `rgba(${r() > .5 ? '255,245,225' : '150,130,100'},${.08 + r() * .1})`; c.fillRect(x + 3, y + 3, 154, 122);
      c.fillStyle = '#a99a80'; c.fillRect(x, y, 160, 3); c.fillRect(x, y, 3, 128);
    }
  }, { repetir: true }), metros: 1.2, bandas: 3 });
  const plafon = materialSuperficie({ map: lienzo(512, 512, (c, w, h) => {
    c.fillStyle = '#f4f3ee'; c.fillRect(0, 0, w, h);
    const r = azar(4);
    for (let i = 0; i < 900; i++) { c.fillStyle = 'rgba(150,145,130,.12)'; c.fillRect(r() * w, r() * h, 2, 2); }   // fibra mineral
    c.fillStyle = '#d4d3cd'; c.fillRect(0, 0, w, 7); c.fillRect(0, 0, 7, h); c.fillRect(0, h / 2 - 3, w, 7); c.fillRect(w / 2 - 3, 0, 7, h);
  }, { repetir: true }), metros: 1.22, bandas: 2 });

  /* ── 1. Muros del local (núcleo) ── */
  const muros = [
    { eje: 'z', fijo: X0 - .1, a0: Z0 - .2, a1: 0, huecos: [] }       ,   // oeste
    { eje: 'z', fijo: X1 + .1, a0: Z0 - .2, a1: 0, huecos: [HUECO_BODEGA] },        // este
    { eje: 'x', fijo: Z0 - .1, a0: X0 - .2, a1: X1 + .2 },                           // fondo
  ];
  for (const m of muros) {
    for (const [u0, u1, y0, y1] of tramos(m.a0, m.a1, 0, H + .05, m.huecos)) {
      if (m.eje === 'x') bloque(pared, u0, u1, y0, y1, m.fijo - .1, m.fijo + .1);
      else bloque(pared, m.fijo - .1, m.fijo + .1, y0, y1, u0, u1);
      if (y0 === 0) colisiones.push(m.eje === 'x' ? [u0, m.fijo - .1, u1, m.fijo + .1] : [m.fijo - .1, u0, m.fijo + .1, u1]);
    }
  }
  // Fachada: núcleo con puerta y aparador.
  const huecosFachada = [HUECO_PUERTA, HUECO_APARADOR];
  for (const [u0, u1, y0, y1] of tramos(X0 - .2, X1 + .2, 0, ALTO_FACHADA, huecosFachada)) {
    bloque(pared, u0, u1, y0, Math.min(y1, H + .05), 0, FZ);
    if (y1 > H + .05) bloque(fachada, u0, u1, H + .05, y1, 0, FZ);
    if (y0 === 0 && y1 > 1) colisiones.push([u0, 0, u1, FZ]);
  }
  // antepecho del aparador: la colisión corre bajo la ventana
  colisiones.push([APARADOR.x0, 0, APARADOR.x1, FZ]);

  /* ── 2. Acabados interiores: zoclo verde y franja menta ── */
  const acabado = (m, y0, y1, grosor = .012) => {
    // bajo el aparador el zoclo no corre: ahí está el frente de la repisa de exhibición
    const bajoAparador = { ...HUECO_APARADOR, y0: -1 };
    for (const [u0, u1, b0, b1] of tramos(Z0, 0, y0, y1, [])) bloque(m, X0, X0 + grosor, b0, b1, u0, u1);
    for (const [u0, u1, b0, b1] of tramos(Z0, 0, y0, y1, [HUECO_BODEGA])) bloque(m, X1 - grosor, X1, b0, b1, u0, u1);
    for (const [u0, u1, b0, b1] of tramos(X0, X1, y0, y1, [HUECO_PUERTA, bajoAparador])) bloque(m, u0, u1, b0, b1, -grosor, 0);
    bloque(m, X0, X1, y0, y1, Z0, Z0 + grosor);
  };
  acabado('zoclo', 0, .1, .014);
  acabado('verde', 2.52, 2.58);
  acabado('menta', 2.58, 2.66);

  /* ── 3. Piso cerámico encerado y plafón ── */
  bloque(piso, X0, X1, -.05, 0, Z0, 0);
  bloque(piso, PUERTA.x0, PUERTA.x1, -.05, .0, 0, FZ);                 // piso bajo el umbral
  const encerado = crearSueloBrillante({ ancho: X1 - X0, fondo: -Z0, fuerza: .2, caida: 1.3, resolucion: .45, rect: [X0, Z0, X1, 0] });
  encerado.position.set((X0 + X1) / 2, .002, Z0 / 2);
  grupo.add(encerado);
  const techo = new T.Mesh(new T.PlaneGeometry(X1 - X0, -Z0), plafon);
  techo.rotation.x = Math.PI / 2; techo.position.set((X0 + X1) / 2, H, Z0 / 2); techo.name = 'Plafón reticular';
  grupo.add(techo);
  // Paneles de luz 60 × 120 en la retícula: emisivos, con difusor prismático.
  const difusor = lienzo(128, 256, (c, w, h) => {
    c.fillStyle = '#fdfeff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e4ecf2'; for (let i = 0; i < 16; i++) c.fillRect(0, i * 16, w, 2);
    for (let i = 0; i < 8; i++) c.fillRect(i * 16, 0, 2, h);
    c.fillStyle = '#c9ced2'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6); c.fillRect(0, 0, 6, h); c.fillRect(w - 6, 0, 6, h);
  });
  const matPanel = new T.MeshBasicMaterial({ map: difusor }); matPanel.userData.sinTrazo = true;
  const panelGeo = new T.PlaneGeometry(.6, 1.2);
  const lamparas = [];
  const panel = (x, z) => {
    const p = new T.Mesh(panelGeo, matPanel); p.rotation.x = Math.PI / 2; p.position.set(x, H - .004, z); p.name = 'Panel de luz';
    grupo.add(p);
    lamparas.push({ pos: [x, H - .25, z], color: '#f4f9ff', intensidad: 1, radio: 3.1 });
  };
  for (const z of [-1.35, -3.9, -6.1]) for (const x of [-2.1, 0, 2.1]) panel(x, z);
  panel(-1.5, -8.2); panel(1.5, -8.2);
  // Luz de la calle: bajo el letrero (tarde y noche) y la farola.
  lamparas.push({ pos: [-1.75, 2.35, 1.1], color: '#fff1d8', intensidad: .9, radio: 2.8, exterior: true });
  lamparas.push({ pos: [1.2, 2.35, 1.1], color: '#fff1d8', intensidad: .8, radio: 2.8, exterior: true });
  // Mancha de luz del local sobre la acera (de noche).
  ctx.lamparas = lamparas;

  /* ── 4. Fachada exterior ── */
  const e = exterior;   // lote de piezas que proyectan sombra al sol
  const bloqueE = (m, x0, x1, y0, y1, z0, z1, o = { contorno: false }) =>
    e.caja(m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, o);
  // zócalo de cantera bajo el aparador y en los machones
  bloqueE(cantera, APARADOR.x0, APARADOR.x1, 0, APARADOR.y0, FZ, FZ + .03);
  bloqueE(cantera, X0 - .2, PUERTA.x0, 0, .55, FZ, FZ + .03);
  bloqueE(cantera, PUERTA.x1, APARADOR.x0, 0, .55, FZ, FZ + .03);
  bloqueE(cantera, APARADOR.x1, X1 + .2, 0, .55, FZ, FZ + .03);
  bloqueE('cantera', APARADOR.x0 - .02, APARADOR.x1 + .02, APARADOR.y0 - .04, APARADOR.y0, FZ, FZ + .07, { contorno: 'fino' });   // repisón
  // machones en blanco con filete verde
  for (const [a, b] of [[X0 - .2, PUERTA.x0], [PUERTA.x1, APARADOR.x0], [APARADOR.x1, X1 + .2]]) {
    bloqueE(fachada, a, b, .55, LETRERO.y0, FZ, FZ + .02);
  }
  for (const x of [X0 - .2, X1 + .08]) bloqueE('fachadaVerde', x, x + .12, 0, ALTO_FACHADA, FZ, FZ + .05, { contorno: 'fino' });
  // cortinas metálicas enrolladas: cajón y guías
  const cortina = (a, b) => {
    bloqueE('cortina', a - .08, b + .08, LETRERO.y0 - .26, LETRERO.y0 - .02, FZ, FZ + .24, { contorno: 'medio' });
    bloqueE('cortinaOsc', a - .08, b + .08, LETRERO.y0 - .28, LETRERO.y0 - .26, FZ + .02, FZ + .22);
    for (const x of [a - .05, b + .01]) bloqueE('cortinaOsc', x, x + .04, 0, LETRERO.y0 - .26, FZ, FZ + .06, { contorno: 'fino' });
    // candado del piso (argolla) — detalle de cortina de barrio
    bloqueE('cortinaOsc', (a + b) / 2 - .06, (a + b) / 2 + .06, 0, .03, FZ + .01, FZ + .06);
  };
  cortina(PUERTA.x0, PUERTA.x1); cortina(APARADOR.x0, APARADOR.x1);
  // caja de luz del letrero
  bloqueE('fachadaVerde', X0 - .15, X1 + .15, LETRERO.y0, LETRERO.y1, FZ, FZ + .24, { contorno: 'fino' });
  const letrero = R.letreroPrincipal(X1 - X0 + .14, LETRERO.y1 - LETRERO.y0 - .1);
  letrero.position.set((X0 + X1) / 2, (LETRERO.y0 + LETRERO.y1) / 2, FZ + .245);
  grupo.add(letrero);
  // pretil y remate
  bloqueE(fachada, X0 - .2, X1 + .2, LETRERO.y1, ALTO_FACHADA, FZ, FZ + .02);
  bloqueE('fachadaVerde', X0 - .22, X1 + .22, ALTO_FACHADA - .02, ALTO_FACHADA + .06, -.02, FZ + .08, { contorno: 'fino' });
  bloqueE('menta', X0 - .2, X1 + .2, LETRERO.y1 + .12, LETRERO.y1 + .18, FZ, FZ + .03);
  // cruz de bandera: caja de luz a dos caras en ménsula
  {
    const bx = X1 - .05, by = 3.15, bz0 = FZ + .5, lado = .66;
    bloqueE('grafito', bx - .02, bx + .02, by - .02, by + .02, FZ, bz0, { contorno: 'fino' });
    bloqueE('grafito', bx - .02, bx + .02, by - .42, by - .38, FZ, bz0 + .1, { contorno: 'fino' });
    bloqueE('fachadaVerde', bx - .06, bx + .06, by - lado / 2 - .23, by + lado / 2 - .19, bz0, bz0 + lado + .04, { contorno: 'medio' });
    for (const s of [-1, 1]) {
      const cara = R.caraBandera(lado);
      cara.rotation.y = s * Math.PI / 2; cara.position.set(bx + s * .061, by - .21, bz0 + lado / 2 + .02);
      grupo.add(cara);
    }
  }
  // umbral de aluminio
  bloqueE('aluminio', PUERTA.x0, PUERTA.x1, 0, .012, 0, FZ + .02);

  /* ── 5. Puerta doble de vidrio (se abre sola al acercarse) ── */
  const vidrioFachada = crearVidrio({ tinte: '#d6ecf2', opacidad: .1, fuerza: .75, fuera: [0, 0, 1] });
  const al = kit.mat('aluminio'), trazoAl = kit.trazo('#c9ced2', 'medio');
  const pieza = (padre, geo, mat, x, y, z, sx, sy, sz, trazo = true) => {
    const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); padre.add(m);
    if (trazo) contornoDe(m, trazoAl);
    return m;
  };
  // marco fijo
  bloqueE('aluminio', PUERTA.x0 - .05, PUERTA.x0, 0, PUERTA.alto, .08, .17, { contorno: 'fino' });
  bloqueE('aluminio', PUERTA.x1, PUERTA.x1 + .05, 0, PUERTA.alto, .08, .17, { contorno: 'fino' });
  bloqueE('aluminio', PUERTA.x0 - .05, PUERTA.x1 + .05, PUERTA.alto - .06, PUERTA.alto, .08, .17, { contorno: 'fino' });
  const anchoHoja = (PUERTA.x1 - PUERTA.x0) / 2 - .005, altoHoja = PUERTA.alto - .07;
  const hojas = [];
  for (const [bisagra, s, lado] of [[PUERTA.x0, 1, 'izq'], [PUERTA.x1, -1, 'der']]) {
    const pivote = new T.Group(); pivote.position.set(bisagra, 0, .125); pivote.name = 'Puerta de vidrio';
    const g = kit.geo.caja, cx = s * anchoHoja / 2;
    pieza(pivote, g, al, s * .035, altoHoja / 2 + .005, 0, .07, altoHoja, .045);                    // larguero bisagra
    pieza(pivote, g, al, s * (anchoHoja - .035), altoHoja / 2 + .005, 0, .07, altoHoja, .045);      // larguero cierre
    pieza(pivote, g, al, cx, altoHoja - .03, 0, anchoHoja, .07, .045);
    pieza(pivote, g, al, cx, .12, 0, anchoHoja, .2, .045);                                           // zoclo de la hoja
    pieza(pivote, g, al, cx, 1.05, 0, anchoHoja - .1, .05, .04);                                     // travesaño empujador
    const vidrio = new T.Mesh(new T.PlaneGeometry(anchoHoja - .12, altoHoja - .3), vidrioFachada);
    vidrio.position.set(cx, (altoHoja - .3) / 2 + .22, 0); vidrio.name = 'Puerta de vidrio'; pivote.add(vidrio);
    const vinil = R.vinilPuerta(anchoHoja - .14, altoHoja - .32, lado);
    vinil.position.set(cx, (altoHoja - .3) / 2 + .22, .026); pivote.add(vinil);
    // jaladera vertical de acero en ambas caras
    for (const z of [-.06, .06]) {
      pieza(pivote, kit.geo.cil16, kit.metal('cromo', .5), s * (anchoHoja - .12), 1.05, z, .03, .75, .03);
      for (const y of [.72, 1.38]) pieza(pivote, g, kit.metal('cromo', .5), s * (anchoHoja - .12), y, z / 2, .02, .02, Math.abs(z), false);
    }
    grupo.add(pivote);
    hojas.push({ pivote, s });
  }
  // Animación a tramos (~12 pasos/s): se abren hacia dentro cuando el jugador se acerca.
  let apertura = 0, acumulado = 0;
  animables.push((dt, jugador) => {
    const cerca = Math.hypot(jugador.x - (PUERTA.x0 + PUERTA.x1) / 2, jugador.z - .1) < 1.7;
    acumulado += dt; if (acumulado < 1 / 12) return; acumulado = 0;
    apertura = T.MathUtils.clamp(apertura + (cerca ? .14 : -.1), 0, 1);
    const k = apertura * apertura * (3 - 2 * apertura);
    for (const { pivote, s } of hojas) pivote.rotation.y = s * k * 1.35;
  });

  /* ── 6. Aparador (vidrio fijo con parteluz y vinil) ── */
  bloqueE('aluminio', APARADOR.x0, APARADOR.x1, APARADOR.y0, APARADOR.y0 + .05, .08, .17, { contorno: 'fino' });
  bloqueE('aluminio', APARADOR.x0, APARADOR.x1, APARADOR.y1 - .05, APARADOR.y1, .08, .17, { contorno: 'fino' });
  const parteluz = (APARADOR.x0 + APARADOR.x1) / 2;
  for (const x of [APARADOR.x0, parteluz - .025, APARADOR.x1 - .05]) bloqueE('aluminio', x, x + .05, APARADOR.y0, APARADOR.y1, .08, .17, { contorno: 'fino' });
  for (const [a, b] of [[APARADOR.x0 + .05, parteluz - .025], [parteluz + .025, APARADOR.x1 - .05]]) {
    const v = new T.Mesh(new T.PlaneGeometry(b - a, APARADOR.y1 - APARADOR.y0 - .1), vidrioFachada);
    v.position.set((a + b) / 2, (APARADOR.y0 + APARADOR.y1) / 2, .125); v.name = 'Aparador de vidrio';
    grupo.add(v);
  }
  const vinil = R.vinilAparador(APARADOR.x1 - APARADOR.x0 - .1, APARADOR.y1 - APARADOR.y0 - .1);
  vinil.position.set((APARADOR.x0 + APARADOR.x1) / 2, (APARADOR.y0 + APARADOR.y1) / 2, .135);
  grupo.add(vinil);
  // repisa interior del aparador (la vitrina de exhibición mira a la calle)
  bloque('melamina', APARADOR.x0, APARADOR.x1, APARADOR.y0 - .04, APARADOR.y0, -.34, 0, { contorno: 'fino' });
  bloque('verde', APARADOR.x0, APARADOR.x1, 0, APARADOR.y0 - .04, -.34, -.32);
  colisiones.push([APARADOR.x0, -.36, APARADOR.x1, 0]);

  /* ── 7. En el mundo del paradero: esquina, sin calle propia y sin mobiliario ──
     La calle la pone ../Calle.js.  El local no se carga por dentro: estantería
     pintada tras el vidrio, losa de azotea y culata hacia la calle transversal
     (el muro oeste da a la esquina, por eso ya no tiene la puerta del consultorio). */
  bloqueE(fachada, X0 - .24, X0 - .2, 0, ALTO_FACHADA, Z0 - .2, FZ);                 // culata a la esquina
  bloqueE('fachadaVerde', X0 - .28, X0 - .2, ALTO_FACHADA - .02, ALTO_FACHADA + .06, Z0 - .2, FZ + .08, { contorno: 'fino' });
  bloqueE(fachada, X0 - .2, X1 + .2, H + .05, H + .25, Z0 - .2, 0);                 // losa de azotea
  const estante = R.cartel(X1 - X0 - .1, H - .1, 2048, (c, w, h) => {
    c.fillStyle = '#f3f1ea'; c.fillRect(0, 0, w, h);
    c.fillStyle = R.VERDE; c.fillRect(0, h * .06, w, h * .05);
    const cols = ['#e05a4f', '#3d8fd1', '#f2c14e', '#7dbb6a', '#ffffff', '#c77dca', '#f39c5a'];
    for (let f = 0; f < 4; f++) {
      const y = h * (.2 + f * .15);
      c.fillStyle = '#cfc8b8'; c.fillRect(0, y + h * .1, w, h * .015);
      for (let x = 8, i = f * 3; x < w - 30; i++) {
        const bw = 18 + (i * 13 % 22), bh = h * (.05 + (i * 7 % 5) * .008);
        c.fillStyle = cols[i % cols.length]; c.fillRect(x, y + h * .1 - bh, bw, bh); x += bw + 4;
      }
    }
    c.fillStyle = R.VERDE; c.fillRect(w * .1, h * .8, w * .8, h * .2);                   // mostrador al fondo
    c.fillStyle = '#ffffff'; c.fillRect(w * .1, h * .8, w * .8, h * .015);
  }, { nombre: 'Estantería de la farmacia' });
  estante.position.set((X0 + X1) / 2, (H - .1) / 2, -2.4);
  grupo.add(estante);

  // Este: casa de dos plantas con portón de herrería.
  {
    const a = X1 + .2, b = 10.5, alto = 5.9;
    bloqueE(materialSuperficie({ map: texturaEstuco('#8fb7c9', 14), metros: 2.4, bandas: 3 }), a, b, 0, alto, -6, FZ);
    // portón
    bloqueE('herreria', 4.6, 7.4, 0, 2.5, FZ, FZ + .04, { contorno: 'medio' });
    for (let x = 4.75; x < 7.3; x += .16) bloqueE('grafito', x, x + .03, .1, 2.4, FZ + .04, FZ + .06);
    // puerta y ventanas
    bloqueE('puertaMadera', 8.1, 9.05, 0, 2.2, FZ, FZ + .04, { contorno: 'medio' });
    bloqueE('herreria', 8.05, 9.1, 2.2, 2.26, FZ, FZ + .08);
    for (const x of [4.9, 7.3]) {
      bloqueE('#4c6a7a', x, x + 1.3, 3.3, 4.6, FZ, FZ + .02);
      for (let k = 0; k < 6; k++) bloqueE('herreria', x + .05 + k * .24, x + .08 + k * .24, 3.3, 4.6, FZ + .02, FZ + .05);
      bloqueE('herreria', x - .05, x + 1.35, 3.25, 3.32, FZ, FZ + .12, { contorno: 'fino' });
    }
    // losa de entrepiso marcada y tinaco en la azotea
    bloqueE('vecinoC', a, b, 2.85, 3.0, FZ, FZ + .08, { contorno: 'fino' });
    bloqueE('herreria', a, b, alto - .08, alto, FZ, FZ + .06);
    e.cil('negro', 8.6, alto + .55, -2.5, 1.1, 1.1, { contorno: 'fino' });
    colisiones.push([a, -6, b, FZ + .03]);
  }

  return { lamparas, hojas };
}
