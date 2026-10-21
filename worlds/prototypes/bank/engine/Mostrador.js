import * as T from './three.js';
import { ALTO_TECHO as H, MOSTRADOR as M, EDIFICIO, centroCaja } from './config.js';
import { crearVidrio } from './Reflejos.js';
import { plano } from './Planos.js';
import * as R from './Rotulos.js';

/* ── Línea de cajas ───────────────────────────────────────────────────────
   Cinco ventanillas de 2,4 m.  Cada una se construye en su marco local:
   origen en la cara del cliente, +z hacia el cliente (sur), -z hacia el cajero.

     cliente:  frente de roble con juntas, zócalo de acero, tira de luz bajo la
               encimera de granito, bandeja pasa-valores hundida que cruza bajo
               el vidrio, rejilla para hablar, datáfono, portabolígrafos,
               mamparas laterales, número iluminado en la cenefa.
     cajero:   encimera de trabajo, monitor, teclado, contadora de billetes,
               impresora de recibos, sello, visor para el cliente, taburete.
   Todo a escala real (encimera a 1,05 m; la caja preferente a 0,86 m). */

const VIDRIO_Z = -.3;              // plano del vidrio (local)
const FONDO = .95;                 // fondo total del mueble
const NOMBRES_CAJEROS = ['', 'Marta Ruiz', 'Jorge Salinas', 'Ana Beltrán', 'Luis Ortega'];

export function construirMostrador(ctx) {
  const { kit, lote, colisiones } = ctx;
  const acero = kit.metal('acero', .5, 1.8), cromo = kit.metal('aluminio', .55, 1.5);
  const granito = ctx.materiales.granito;
  const vidrio = crearVidrio({ tinte: '#e3f0f0', opacidad: .08, fuerza: .55, brillos: .3 });
  const numeros = [];
  const x1 = M.x0 + M.ancho * M.n;

  // Colisión del mueble completo (el cliente se acerca hasta la encimera).
  colisiones.push([M.x0, M.z - FONDO, x1, M.z + .05]);
  // El personal no se ve, pero el jugador no puede cruzar al otro lado.
  colisiones.push([EDIFICIO.x0, -10.9, EDIFICIO.x1, -10.7]);

  for (let i = 1; i <= M.n; i++) {
    const cx = centroCaja(i), h = i === M.preferente ? M.altoAccesible : M.alto;
    const cerrada = i === M.cerrada, w = M.ancho;
    lote.en(cx, 0, M.z, 0, () => {
      // ── Mueble del cliente ─────────────────────────────────────────
      lote.caja('roble', 0, (h - .1) / 2 + .1, -.15, w, h - .1, .3, { contorno: 'fino', nombre: 'el mostrador' });
      lote.caja(acero, 0, .05, -.18, w, .1, .24, { contorno: false, nombre: 'el zócalo de acero' });
      // juntas del frente de madera (paneles de 60 cm)
      for (let k = 1; k < 4; k++) lote.caja('nogal', -w / 2 + k * w / 4, (h + .1) / 2, .002, .012, h - .12, .01, { contorno: false });
      lote.caja('nogal', 0, h - .16, .002, w, .012, .01, { contorno: false });
      // tira de luz bajo el vuelo de la encimera
      lote.caja(kit.emisivo('#fff4d6'), 0, h - .012, .035, w - .1, .01, .015, { contorno: false });
      // encimera de granito (vuelo de 6 cm) partida por la bandeja
      const bandeja = .38;
      for (const s of [-1, 1]) {
        const ancho = (w - bandeja) / 2;
        lote.caja(granito, s * (bandeja / 2 + ancho / 2), h + .02, -.12, ancho, .04, .36, { contorno: 'medio', trazo: '#4a4c4f', nombre: 'la encimera' });
      }
      lote.caja(granito, 0, h + .02, .045, bandeja, .04, .03, { contorno: false });
      // bandeja pasa-valores: cubeta de acero que cruza bajo el vidrio
      lote.caja(acero, 0, h - .015, -.2, bandeja - .02, .01, .5, { contorno: false, nombre: 'la bandeja pasa-valores' });
      for (const s of [-1, 1]) lote.caja(acero, s * (bandeja / 2 - .015), h + .005, -.2, .01, .04, .5, { contorno: false });
      lote.caja(acero, 0, h + .005, .025, bandeja - .02, .04, .01, { contorno: false });
      // perfil inferior del vidrio y montantes
      lote.caja(cromo, 0, h + .05, VIDRIO_Z, w, .025, .05, { contorno: false });
      lote.caja(cromo, 0, M.vidrio + .02, VIDRIO_Z, w, .05, .06, { contorno: false });
      // rejilla para hablar (disco perforado a la altura de la boca)
      const yr = h + .45;
      lote.cil(acero, 0, yr, VIDRIO_Z + .006, .12, .008, { rx: Math.PI / 2, lados: 24, contorno: 'medio', trazo: '#8a9096', nombre: 'la rejilla para hablar' });

      // datáfono en su brazo giratorio (a la derecha de la bandeja)
      lote.en(.5, h + .04, -.08, -.35, () => {
        lote.cil(acero, 0, .03, 0, .05, .06, { contorno: false });
        lote.caja('negro', 0, .1, 0, .09, .17, .045, { rx: -.55, contorno: 'medio', nombre: 'el datáfono' });
      });
      // portabolígrafos con su bolígrafo (a la izquierda)
      lote.cil('grafito', -.55, h + .06, -.1, .05, .04, { contorno: 'medio', nombre: 'el portabolígrafos' });
      lote.cil('azul', -.55, h + .12, -.1, .01, .14, { rz: .35, contorno: false, nombre: 'el bolígrafo' });
      lote.cil('acero', -.52, h + .045, -.02, .006, .09, { rx: Math.PI / 2, rz: .5, contorno: false });

      // ── Puesto del cajero (tras el vidrio) ─────────────────────────
      const ht = h - .03;                                     // encimera de trabajo
      lote.caja('plastico', 0, ht - .02, -.62, w - .06, .04, .64, { contorno: 'fino' });
      lote.caja('grisClaro', 0, (ht - .04) / 2, -.62, w - .06, ht - .04, .6, { contorno: false });
      // taburete alto
      const ys = ht - .3;
      lote.en(cerrada ? .1 : 0, 0, cerrada ? -1.05 : -1.3, cerrada ? .4 : 0, () => {
        lote.cil('tapizOscuro', 0, ys, 0, .4, .07, { lados: 24, contorno: 'medio', nombre: 'el taburete' });
        lote.caja('tapizOscuro', 0, ys + .28, -.2, .38, .3, .05, { rx: -.12, contorno: 'medio' });
        lote.cil(cromo, 0, ys / 2, 0, .05, ys, { contorno: false });
        lote.cil(cromo, 0, .3, 0, .38, .02, { contorno: false });
        for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5; lote.caja('negro', Math.sin(a) * .2, .03, Math.cos(a) * .2, .05, .04, .4, { ry: a, contorno: false }); }
      });
      if (cerrada) {
        // monitor apagado y el letrero de caja cerrada apoyado contra el vidrio
        monitor(lote, .45, ht, -.6, false);
      } else {
        monitor(lote, .45, ht, -.6, true);
        lote.caja('negro', .25, ht + .01, -.8, .42, .02, .14, { contorno: 'medio', nombre: 'el teclado' });
        lote.caja('negro', .58, ht + .01, -.8, .06, .02, .1, { contorno: false, nombre: 'el ratón' });
        // contadora de billetes con un fajo encima
        lote.en(-.62, ht, -.58, .25, () => {
          lote.caja('grafito', 0, .09, 0, .26, .18, .24, { contorno: 'medio', nombre: 'la contadora de billetes' });
          lote.caja('negro', 0, .19, -.05, .2, .03, .1, { rx: .4, contorno: false });
          lote.caja('verde', 0, .205, .06, .15, .025, .07, { contorno: false, nombre: 'los billetes' });
          lote.caja(kit.emisivo('#7cf29a'), .08, .13, .121, .06, .02, .005, { contorno: false });
        });
        // impresora de recibos, sello y tampón, calculadora
        lote.caja('blanco', .95, ht + .07, -.52, .16, .14, .2, { contorno: 'medio', nombre: 'la impresora de recibos' });
        lote.caja('papel', .95, ht + .15, -.44, .07, .03, .002, { rx: -.5, contorno: false });
        lote.caja('negro', -.22, ht + .012, -.55, .1, .024, .07, { contorno: false, nombre: 'el tampón de tinta' });
        lote.cil('rojo', -.08, ht + .06, -.55, .035, .09, { contorno: 'medio', nombre: 'el sello' });
        lote.caja('grisClaro', -.95, ht + .012, -.75, .1, .02, .15, { contorno: false, nombre: 'la calculadora' });
        // cajón del dinero entreabierto (bajo la encimera, lado del cajero)
        lote.caja('grafito', -.3, ht - .12, -.96, .45, .1, .06, { contorno: 'medio', nombre: 'el cajón del dinero' });
      }
    });

    // Vidrio de seguridad de la ventanilla (pulsable).
    const alto = M.vidrio - (h + .06);
    const lamina = new T.Mesh(new T.PlaneGeometry(M.ancho - .04, alto), vidrio);
    lamina.position.set(cx, h + .06 + alto / 2, M.z + VIDRIO_Z); lamina.renderOrder = 3;
    lamina.userData.nombre = 'el vidrio de seguridad'; ctx.pulsables.push(lamina); ctx.grupo.add(lamina);

    // Rejilla perforada: plano con los agujeros sobre el disco de acero.
    plano(ctx, .105, .105, 128, (c, w) => {
      c.clearRect(0, 0, w, w); c.fillStyle = '#3a3d41';
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 17) { c.beginPath(); c.arc(w / 2 + x * w / 10, w / 2 + y * w / 10, w * .028, 0, 7); c.fill(); }
    }, { x: cx, y: h + .45, z: M.z + VIDRIO_Z + .011, alfa: true, nombre: 'la rejilla para hablar' });
    // Cara del datáfono: pantalla y teclado (sobre la caja negra del brazo giratorio).
    {
      const a = -.35, px = cx + Math.cos(a) * .5, pz = M.z - .08 - Math.sin(a) * .5;
      plano(ctx, .075, .14, 96, (c, w, h2) => {
        c.fillStyle = '#25272a'; c.fillRect(0, 0, w, h2);
        c.fillStyle = '#9fc8b8'; c.fillRect(w * .1, h2 * .06, w * .8, h2 * .28);
        c.fillStyle = '#1b2f28'; c.font = `700 ${h2 * .07}px Consolas`; c.textAlign = 'center'; c.fillText('NIP', w / 2, h2 * .22);
        for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) { c.fillStyle = r === 3 && k !== 1 ? (k ? '#3aa35b' : '#c2393a') : '#8d9296'; c.fillRect(w * (.14 + k * .26), h2 * (.42 + r * .13), w * .2, h2 * .09); }
      }, { x: px + Math.sin(a) * .024, y: h + .14, z: pz + Math.cos(a) * .024, ry: a, rx: -.55, nombre: 'el datáfono' });
    }
    // Adhesivo «Cuente su dinero» en la cara del cliente, abajo a la izquierda.
    plano(ctx, .42, .12, 420, R.cuenteDinero, { x: cx - .7, y: h + .17, z: M.z + VIDRIO_Z + .006, nombre: 'el aviso «Cuente su dinero»' });
    // Placa con el nombre de quien atiende (en el lado del cajero, mirando al cliente).
    if (!cerrada) {
      const nombre = i === M.preferente ? 'Sofía Paredes' : NOMBRES_CAJEROS[i - 1] || 'Laura Gómez';
      plano(ctx, .26, .07, 260, (c, w2, h2) => {
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, w2, h2); c.fillStyle = '#0f5f66'; c.fillRect(0, 0, w2 * .04, h2);
        c.fillStyle = '#6b7075'; c.font = `400 ${h2 * .28}px ${R.FUENTE}`; c.textBaseline = 'middle'; c.fillText('Le atiende', w2 * .1, h2 * .3);
        c.fillStyle = '#25272a'; c.font = `700 ${h2 * .36}px ${R.FUENTE}`; c.fillText(nombre, w2 * .1, h2 * .68);
      }, { x: cx + .62, y: h + .12, z: M.z + VIDRIO_Z - .02, rx: -.25, nombre: 'la placa con el nombre del cajero' });
      lote.caja('plastico', cx + .62, h + .1, M.z + VIDRIO_Z - .045, .27, .1, .04, { rx: -.25, contorno: false });
      // Visor para el cliente: muestra la operación y el importe.
      plano(ctx, .24, .15, 240, (c, w2, h2) => {
        c.fillStyle = '#10343a'; c.fillRect(0, 0, w2, h2);
        c.fillStyle = '#9fe0d6'; c.font = `600 ${h2 * .16}px ${R.FUENTE}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(`Caja ${i}`, w2 / 2, h2 * .25); c.fillStyle = '#ffffff'; c.font = `700 ${h2 * .22}px ${R.FUENTE}`; c.fillText('Bienvenido', w2 / 2, h2 * .6);
      }, { x: cx - .25, y: h + .3, z: M.z - .42, emisivo: true, nombre: 'el visor para el cliente' });
      lote.caja('negro', cx - .25, h + .3, M.z - .435, .27, .18, .025, { contorno: 'medio' });
      lote.cil('negro', cx - .25, h + .1, M.z - .45, .025, .2, { contorno: false });
    } else {
      plano(ctx, .5, .3, 500, R.cajaCerrada, { x: cx - .05, y: h + .2, z: M.z + VIDRIO_Z - .03, rx: -.12, nombre: 'el letrero «Caja cerrada»' });
      lote.caja('plastico', cx - .05, h + .19, M.z + VIDRIO_Z - .05, .52, .32, .02, { rx: -.12, contorno: 'medio' });
    }

    // Cenefa: frente teal con el número iluminado de la caja.
    lote.caja('teal', cx, (M.vidrio + .05 + M.cabecera[1]) / 2, M.z - .05, M.ancho, M.cabecera[1] - M.vidrio - .05, .5, { contorno: false });
    const num = plano(ctx, .9, .34, 360, R.numeroCaja(i, { cerrada, preferente: i === M.preferente }),
      { x: cx, y: 2.66, z: M.z + .216, emisivo: true, nombre: `el número de la caja ${i}` });
    num.userData.caja = i; numeros.push(num);
    lote.caja('tealOscuro', cx, 2.66, M.z + .2, .96, .4, .015, { contorno: false });
  }

  // Mamparas laterales entre ventanillas (privacidad del cliente) y remates.
  for (let k = 0; k <= M.n; k++) {
    const x = M.x0 + k * M.ancho;
    const extremo = k === 0 || k === M.n;
    lote.caja('roble', x, .88, M.z + .24, .05, 1.76, .5, { contorno: 'medio', nombre: 'la mampara' });
    lote.caja('teal', x, 1.77, M.z + .24, .06, .03, .52, { contorno: false });
    lote.caja(kit.metal('aluminio', .5), x, (M.vidrio + 1.05) / 2, M.z + VIDRIO_Z, .05, M.vidrio - 1.05, .06, { contorno: 'fino' });
    colisiones.push([x - .05, M.z, x + .05, M.z + .5]);
    if (extremo) lote.caja('roble', x, M.alto / 2, M.z - FONDO / 2, .06, M.alto, FONDO, { contorno: false });
  }

  ctx.numerosCaja = numeros;
  construirTrasMostrador(ctx);
}

function monitor(lote, x, y, z, encendido) {
  lote.en(x, y, z, Math.PI + .25, () => {
    lote.caja('negro', 0, .01, 0, .2, .02, .16, { contorno: false });
    lote.caja('negro', 0, .14, .02, .04, .26, .03, { contorno: false });
    lote.caja('grafito', 0, .32, 0, .55, .34, .04, { contorno: 'medio', nombre: 'el monitor' });
    lote.caja(encendido ? '#dfe8ea' : '#15181a', 0, .32, .021, .51, .3, .002, { contorno: false });
  });
}

/* Lo que se ve al fondo, a través del vidrio: credenzas, impresora, plantas,
   el logo grande sobre las lamas y el reloj.  Sin puertas a ninguna parte. */
function construirTrasMostrador(ctx) {
  const { lote } = ctx, zf = EDIFICIO.z0 + .2;
  // Credenzas bajas a lo largo del muro de lamas.
  for (const [x, w] of [[-6.2, 3.2], [-1.5, 3.6], [3.4, 3.2]]) {
    lote.caja('blanco', x, .4, zf + .3, w, .8, .55, { contorno: 'fino', nombre: 'la credenza' });
    lote.caja('grisClaro', x, .82, zf + .3, w + .02, .04, .57, { contorno: false });
    for (let k = 0; k < Math.round(w / .8); k++) lote.caja('aceroOscuro', x - w / 2 + .4 + k * .8, .62, zf + .58, .14, .015, .015, { contorno: false });
  }
  // Impresora multifunción y archivadores con carpetas.
  lote.caja('grisClaro', 6.9, .5, zf + .35, .6, 1, .55, { contorno: 'medio', nombre: 'la fotocopiadora' });
  lote.caja('grafito', 6.9, 1.02, zf + .35, .6, .06, .5, { contorno: false });
  for (let k = 0; k < 8; k++) lote.caja(['teal', 'oro', 'azul', 'rojo'][k % 4], -2.8 + k * .09, .98, zf + .3, .07, .28, .24, { contorno: 'medio', nombre: 'las carpetas' });
  // Plantas en maceta alta en las esquinas.
  for (const x of [-8.3, 8.3]) {
    lote.cil('maceta', x, .35, zf + .35, .5, .7, { lados: 24, contorno: 'medio', nombre: 'la planta' });
    for (let k = 0; k < 7; k++) lote.esfera(k % 2 ? 'hoja' : 'hojaOscura', x + Math.sin(k * 2.1) * .2, .95 + (k % 3) * .25, zf + .35 + Math.cos(k * 2.1) * .2, .45, .55, .45, { contorno: 'medio' });
  }
  // Logo grande y reloj sobre las lamas.
  plano(ctx, 4.2, 1.1, 1400, R.marcaFondo, { x: -1.2, y: 2.55, z: zf + .02, alfa: true, nombre: 'el logotipo del banco' });
  ctx.reloj = plano(ctx, .6, .6, 256, R.reloj(), { x: 5.2, y: 2.6, z: zf + .02, alfa: true, nombre: 'el reloj' });
}
