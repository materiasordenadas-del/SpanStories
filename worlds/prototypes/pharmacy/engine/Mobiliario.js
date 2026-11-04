import * as T from './three.js';
import { LOCAL, MOSTRADOR, MEDIA_PUERTA, ANAQUEL_FONDO, GONDOLAS, ANAQUEL_OESTE, ANAQUEL_ESTE, REFRI, CONSULTORIO, BODEGA, APARADOR, ALTO_TECHO } from './config.js';
import { azar } from './Kit.js';
import { crearMaterialToon, contornoDe } from './Luz25D.js';
import { crearVidrio } from './Reflejos.js';
import * as R from './Rotulos.js';

/* ── Mobiliario y surtido ─────────────────────────────────────────────────
   Distribución de farmacia de barrio (ver PLAN.md): mostrador al fondo, visible
   desde la puerta; detrás, el anaquel de medicamentos de piso a techo; en el
   piso de venta, anaqueles de pared (botanas al oeste, cuidado personal y
   bebé al este), dos góndolas de 1,40 m con cabecera de oferta, el
   refrigerador de bebidas junto a la entrada y la báscula de moneda.

   Cada mueble se arma en su marco local: el FRENTE mira a +z local y el
   largo corre por +x local; `lote.en` / `prod.en` lo colocan en el mundo.
   El relleno de productos es determinista (azar con semilla). */

const { x0: X0, x1: X1 } = LOCAL;
const r = azar(77);
const entre = (a, b) => a + r() * (b - a);
const elegir = lista => lista[Math.floor(r() * lista.length)];

/* ── Relleno de un entrepaño ──────────────────────────────────────────────
   Tramo local [xa, xb] sobre un entrepaño a la altura y, fondo D (hacia -z),
   con `libre` de alto disponible.  Los productos se agrupan en frentes de la
   misma celda, como en un anaquel real. */
function rellenar(prod, familia, xa, xb, y, D, libre, { filas = 2, celdas = null } = {}) {
  const F = prod.familias;
  const lista = celdas || F[familia] || F.medicina;
  let x = xa + .01;
  while (x < xb - .04) {
    const celda = elegir(lista), frentes = 1 + Math.floor(r() * (familia === 'paquete' ? 2 : 4));
    let w, h, d, tipo = 'caja', apilar = 1, ladeo = 0;
    switch (familia) {
      case 'botana': tipo = 'bolsa'; w = entre(.2, .25); h = Math.min(libre - .03, entre(.28, .35)); d = .09; ladeo = -.1; break;
      case 'dulce': w = entre(.13, .19); h = Math.min(libre * .45, entre(.07, .14)); d = entre(.05, .08); apilar = h * 3 < libre ? 3 : 2; break;
      case 'bebida': tipo = 'botella'; w = d = entre(.065, .085); h = Math.min(libre - .04, entre(.21, .29)); break;
      case 'higiene': tipo = 'botella'; w = d = entre(.06, .08); h = Math.min(libre - .04, entre(.16, .24)); break;
      case 'frasco': tipo = 'frasco'; w = d = entre(.055, .085); h = Math.min(libre - .03, entre(.09, .14)); apilar = h * 2.2 < libre ? 2 : 1; break;
      case 'paquete': w = entre(.3, .4); h = Math.min(libre - .03, entre(.26, .36)); d = Math.min(D - .02, entre(.2, .26)); break;
      case 'otro': w = entre(.06, .09); h = Math.min(libre - .03, entre(.1, .16)); d = entre(.03, .05); break;
      default: w = entre(.05, .12); h = Math.min(libre * .8, entre(.07, .16)); d = entre(.035, .08); apilar = h * 2.1 < libre ? 2 : 1;
    }
    const redondo = tipo === 'botella' || tipo === 'frasco';
    const paso = w + (redondo ? .006 : .004);
    const nombre = prod.atlas.nombres[celda];
    for (let i = 0; i < frentes && x + w < xb; i++) {
      const cx = x + w / 2;
      const hondos = redondo ? Math.min(familia === 'bebida' ? 4 : 2, Math.max(1, Math.floor((D - .02) / (d + .01)))) : filas;
      for (let k = 0; k < hondos; k++) {
        const z = redondo ? -.012 - d / 2 - k * (d + .008) : -.012 - d / 2 - k * Math.max(d + .012, (D - .03) / filas);
        if (-z + d / 2 > D) break;
        for (let a = 0; a < apilar; a++) {
          if ((a + 1) * h > libre - .01) break;
          prod.poner(tipo, celda, cx + (k % 2 ? .004 : 0), y + a * h, z + (familia === 'botana' ? k * .012 : 0), w, h, d,
            { rx: ladeo, ry: redondo ? r() * 6.28 : 0, nombre, trazo: k === 0 || familia === 'botana' });
        }
      }
      x += paso;
    }
    x += entre(.004, .02);
  }
}

/* ── Anaquel de pared ──────────────────────────────────────────────────── */
function anaquel(ctx, { L, fondo, alto, niveles, surtido, titulo = null, matTira, zocalo = 'zoclo', postes = .92 }) {
  const { lote, prod } = ctx;
  // espalda, zoclo, costados y postes intermedios
  lote.caja('melamina', L / 2, alto / 2, -fondo + .01, L, alto, .02, { contorno: false });
  lote.caja(zocalo, L / 2, .05, -fondo / 2 + .005, L, .1, fondo - .01, { contorno: 'fino' });
  const tramos = Math.max(1, Math.round(L / postes)), bahia = L / tramos;
  for (let i = 0; i <= tramos; i++) {
    const x = Math.min(L - .015, Math.max(.015, i * bahia));
    lote.caja(i === 0 || i === tramos ? 'melamina' : 'metalBlanco', x, alto / 2, -fondo / 2, .03, alto, fondo, { contorno: 'medio' });
  }
  lote.caja('melamina', L / 2, alto + .015, -fondo / 2, L, .03, fondo, { contorno: 'medio' });
  niveles.forEach((y, n) => {
    const libre = (niveles[n + 1] ?? alto) - y - .03;
    if (n > 0) {
      lote.caja('metalBlanco', L / 2, y - .012, -fondo / 2 + .01, L - .03, .024, fondo - .02, { contorno: 'fino' });
    }
    for (let i = 0; i < tramos; i++) {
      const xa = i * bahia + .02, xb = (i + 1) * bahia - .02;
      // tira de precios en el canto
      lote.pieza(lote.kit.geo.plano, matTira, (xa + xb) / 2, y - .006, .002, xb - xa, .034, 1, { contorno: false });
      const familia = typeof surtido === 'function' ? surtido(n, i) : surtido;
      if (familia) rellenar(prod, familia, xa, xb, y, fondo - .03, libre);
    }
  });
  if (titulo) {
    const f = R.friso(L - .04, .28, titulo.texto, { color: titulo.color });
    ctx.colocar(f, L / 2, alto + .2, .002);
    lote.caja('melamina', L / 2, alto + .2, -.012, L, .3, .02, { contorno: 'fino' });
  }
  return { bahia, tramos };
}

const SURTIDOS = {
  galletas: ['dulce', 'botana', 'dulce', 'dulce'],
  vitaminas: ['frasco', 'frasco', 'frasco', 'frasco'],
  libreVenta: ['medicina', 'medicina', 'medicina', 'frasco'],
  auxilios: ['paquete', 'otro', 'medicina', 'otro'],
};

/* ── Construcción ──────────────────────────────────────────────────────── */
export function construirMobiliario(ctx) {
  const { kit, lote, prod, grupo, colisiones, lamparas } = ctx;
  // caja por límites (en cualquier orden: sirve para muros a ambos lados)
  const B = (m, x0, x1, y0, y1, z0, z1, o = { contorno: 'medio' }) =>
    lote.caja(m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o);

  // Tira de precios: toon de 2 bandas con su textura (relieve plano).
  ctx.matTira = crearMaterialToon({ albedo: R.texturaPrecios(), repetir: [1, 1], bandas: 2 });
  // Colocar una malla suelta (cartel) en el marco local activo del lote.
  const marcos = [];
  const enMarco = (x, y, z, ry, fn) => {
    marcos.push(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), new T.Vector3(1, 1, 1)));
    try { fn(); } finally { marcos.pop(); }
  };
  ctx.colocar = (mesh, x, y, z, ry = 0) => {
    const m = marcos.reduce((acc, k) => acc.multiply(k), new T.Matrix4());
    mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.updateMatrix();
    mesh.applyMatrix4(m); grupo.add(mesh);
  };
  // Un solo `en` para lote, productos y carteles: los tres comparten el marco.
  const en = (x, y, z, ry, fn) => lote.en(x, y, z, ry, () => prod.en(x, y, z, ry, () => enMarco(x, y, z, ry, fn)));
  const ctxL = { ...ctx, lote: { ...lote, kit, en: (x, y, z, ry, fn) => en(x, y, z, ry, fn) }, prod };
  ctxL.lote.pieza = lote.pieza; ctxL.lote.caja = lote.caja;
  ctxL.colocar = ctx.colocar; ctxL.matTira = ctx.matTira;

  /* 1. Anaquel de medicamentos (fondo, piso a techo) con cajonera. */
  {
    const L = X1 - X0, fondo = ANAQUEL_FONDO.z1 - ANAQUEL_FONDO.z0, alto = ANAQUEL_FONDO.alto;
    const categorias = ['ANALGÉSICOS', 'ANTIBIÓTICOS', 'GASTRO', 'RESPIRATORIO', 'CARDIO', 'PEDIATRÍA'];
    en(X0, 0, ANAQUEL_FONDO.z1, 0, () => {
      // cajonera baja (más honda) con cubierta de trabajo
      B('melamina', 0, L, .1, .8, -fondo, .12, { contorno: 'medio' });
      B('zoclo', 0, L, 0, .1, -fondo, .1, { contorno: false });
      B('cubierta', 0, L, .8, .83, -fondo, .14, { contorno: 'medio' });
      const cols = 12;
      for (let i = 0; i < cols; i++) for (let j = 0; j < 3; j++) {
        const x = (i + .5) * L / cols, y = .2 + j * .22;
        B('melaminaGris', x - L / cols / 2 + .01, x + L / cols / 2 - .01, y - .1, y + .1, .12, .125, { contorno: false });
        B('etiqueta', x - .06, x + .06, y + .03, y + .07, .125, .128, { contorno: false });
        B('metalGris', x - .05, x + .05, y - .03, y - .015, .125, .14, { contorno: false });
      }
      // anaquel alto encima de la cajonera
      anaquel(ctxL, { L, fondo, alto, niveles: [.83, 1.12, 1.4, 1.68, 1.96, 2.24, 2.5], surtido: (n) => n === 0 ? 'frasco' : 'medicina', matTira: ctx.matTira,
        zocalo: 'melamina', postes: L / 6 });
      // friso con las categorías, una por bahía
      categorias.forEach((c, i) => {
        const f = R.friso(L / 6 - .04, .2, c, { color: i % 2 ? R.VERDE_OSC : R.VERDE, icono: false });
        ctx.colocar(f, (i + .5) * L / 6, alto + .13, .003);
      });
      B('melamina', 0, L, alto + .02, ALTO_TECHO, -fondo, .0, { contorno: false });
    });
    colisiones.push([X0, ANAQUEL_FONDO.z0, X1, ANAQUEL_FONDO.z1 + .14]);
  }

  /* 2. Anaqueles de pared del piso de venta. */
  const fondoO = ANAQUEL_OESTE.fondo, LO = ANAQUEL_OESTE.z1 - ANAQUEL_OESTE.z0;
  en(X0 + fondoO, 0, ANAQUEL_OESTE.z1, Math.PI / 2, () => {
    anaquel(ctxL, { L: LO, fondo: fondoO, alto: ANAQUEL_OESTE.alto, niveles: [.1, .52, .94, 1.36, 1.74],
      surtido: (n) => (n === 4 ? 'dulce' : 'botana'), titulo: { texto: 'BOTANAS', color: '#ef7d22' }, matTira: ctx.matTira });
  });
  colisiones.push([X0, ANAQUEL_OESTE.z0, X0 + fondoO + .02, ANAQUEL_OESTE.z1]);
  const fondoE = ANAQUEL_ESTE.fondo, LE = ANAQUEL_ESTE.z1 - ANAQUEL_ESTE.z0;
  en(X1 - fondoE, 0, ANAQUEL_ESTE.z0, -Math.PI / 2, () => {
    anaquel(ctxL, { L: LE, fondo: fondoE, alto: ANAQUEL_ESTE.alto, niveles: [.1, .5, .86, 1.2, 1.54, 1.84],
      surtido: (n, i) => n === 4 ? (i % 2 ? 'otro' : 'higiene') : ['paquete', 'paquete', 'higiene', 'higiene', null, 'frasco'][n],
      titulo: { texto: 'CUIDADO PERSONAL Y BEBÉ', color: R.VERDE }, matTira: ctx.matTira });
  });
  colisiones.push([X1 - fondoE - .02, ANAQUEL_ESTE.z0, X1, ANAQUEL_ESTE.z1]);

  /* 3. Góndolas con cabecera. */
  for (const g of GONDOLAS) gondolaMundo(ctxL, g, en);

  /* 4. Mostrador con vitrina. */
  const M = MOSTRADOR, alto = M.alto;
  {
    const vidrioVitrina = crearVidrio({ tinte: '#e3f1f4', opacidad: .07, fuerza: .55, brillos: .8 });
    B('zoclo', M.x0, M.x1, 0, .1, M.z0 + .02, M.z1 - .03, { contorno: false });
    B('melamina', M.x0, M.x1, .1, .14, M.z0, M.z1, { contorno: false });                   // piso de la vitrina
    B('melamina', M.x0, M.x1, .1, alto - .03, M.z0, M.z0 + .03, { contorno: false });       // espalda (lado del dependiente)
    B('melaminaGris', M.x0, M.x1, .1, alto - .03, M.z0 - .005, M.z0 + .002, { contorno: false });
    const tramosV = 4, anchoV = (M.x1 - M.x0) / tramosV;
    for (let i = 0; i <= tramosV; i++) {
      const x = M.x0 + i * anchoV;
      B('vitrinaMarco', Math.max(M.x0, x - .025), Math.min(M.x1, x + .025), .1, alto - .03, M.z0, M.z1, { contorno: 'medio' });
    }
    B('vitrinaMarco', M.x0, M.x1, .1, .16, M.z1 - .04, M.z1, { contorno: 'medio' });
    B('vitrinaMarco', M.x0, M.x1, alto - .1, alto - .03, M.z1 - .04, M.z1, { contorno: 'medio' });
    // entrepaño de vidrio intermedio y tira LED bajo la cubierta
    B('acrilico', M.x0, M.x1, .52, .53, M.z0 + .04, M.z1 - .05, { contorno: false });
    const led = new T.Mesh(new T.BoxGeometry(M.x1 - M.x0 - .1, .012, .02), kit.emisivo('#f4fbff'));
    led.position.set((M.x0 + M.x1) / 2, alto - .115, M.z1 - .08); grupo.add(led);
    for (let i = 0; i < tramosV; i++) {
      const xa = M.x0 + i * anchoV + .03, xb = M.x0 + (i + 1) * anchoV - .03;
      const v = new T.Mesh(new T.PlaneGeometry(xb - xa, alto - .28), vidrioVitrina);
      v.position.set((xa + xb) / 2, (alto - .28) / 2 + .16, M.z1 - .02); v.name = 'Vitrina del mostrador'; grupo.add(v);
      // surtido de vitrina: perfumes, rastrillos, termómetros, condones, vitaminas
      en(xa, 0, M.z1 - .06, 0, () => {
        rellenar(prod, i === 1 ? 'frasco' : 'otro', 0, xb - xa, .14, .42, .36, { filas: 2, celdas: i === 1 ? null : prod.familias.otro.slice(i === 0 ? 3 : 0, i === 0 ? 8 : 5) });
        rellenar(prod, i === 2 ? 'frasco' : 'otro', 0, xb - xa, .53, .42, .3, { filas: 2, celdas: i === 2 ? null : prod.familias.otro });
      });
    }
    // cubierta
    B('cubierta', M.x0, M.x1 + .02, alto - .03, alto + .01, M.z0 - .02, M.z1 + .04, { contorno: 'medio' });
    B('verde', M.x0, M.x1 + .02, alto - .03, alto + .01, M.z1 + .04, M.z1 + .055, { contorno: false });
    colisiones.push([M.x0, M.z0 - .02, M.x1 + .02, M.z1 + .06]);

    /* Sobre la cubierta: caja, terminal, dulcero, chicles, mampara, gel. */
    const y = alto + .01;
    // mampara de acrílico frente a la caja
    const mampara = new T.Mesh(new T.PlaneGeometry(1.0, .62), crearVidrio({ tinte: '#eef7f8', opacidad: .06, fuerza: .45, brillos: .9 }));
    mampara.position.set(.75, y + .36, M.z1 - .12); mampara.name = 'Mampara de acrílico'; grupo.add(mampara);
    for (const x of [.27, 1.23]) { B('aluminio', x - .015, x + .015, y, y + .67, M.z1 - .135, M.z1 - .105, { contorno: 'fino' }); B('aluminio', x - .06, x + .06, y, y + .012, M.z1 - .2, M.z1 - .04, { contorno: false }); }
    B('aluminio', .25, 1.25, y + .66, y + .68, M.z1 - .135, M.z1 - .105, { contorno: 'fino' });
    // monitor de la caja (mira al dependiente) y pantalla al cliente
    lote.caja('grafito', .95, y + .1, M.z0 + .2, .14, .2, .12, { contorno: 'medio', nombre: 'Punto de venta' });
    lote.caja('negro', .95, y + .3, M.z0 + .22, .44, .3, .04, { rx: .12, contorno: 'medio', nombre: 'Punto de venta' });
    const pantalla = R.pantallaCaja(.4, .26); pantalla.rotation.set(-.12, Math.PI, 0); pantalla.position.set(.95, y + .3, M.z0 + .197); grupo.add(pantalla);
    lote.caja('grafito', .95, y + .015, M.z0 + .42, .42, .03, .15, { contorno: 'medio', nombre: 'Teclado' });
    lote.caja('cajaRegistradora', .35, y + .06, M.z0 + .2, .36, .12, .3, { contorno: 'medio', nombre: 'Cajón de dinero' });
    lote.caja('plastico', .35, y + .15, M.z0 + .2, .16, .08, .14, { contorno: 'medio', nombre: 'Impresora de tickets' });
    lote.caja('negro', 1.45, y + .03, M.z1 - .2, .08, .05, .16, { rx: -.3, contorno: 'medio', nombre: 'Terminal de tarjetas' });
    lote.caja('grafito', 1.45, y + .06, M.z1 - .25, .07, .02, .05, { contorno: false });
    // dulcero de acrílico en gradas
    const dulces = ['#e8412f', '#f4c430', '#2fb3a0', '#f08aa8', '#7b4bb5', '#ef7d22'];
    const acrilico = crearVidrio({ tinte: '#f2fbfd', opacidad: .1, fuerza: .5, brillos: .6 });
    for (let k = 0; k < 3; k++) {
      const x0 = -1.2 + k * .26;
      const caja = new T.Mesh(kit.geo.caja, acrilico); caja.name = 'Dulcero de acrílico';
      caja.position.set(x0 + .12, y + .06 + k * .04, M.z1 - .2); caja.scale.set(.24, .12 + k * .08, .22); grupo.add(caja);
      lote.caja('acrilico', x0 + .12, y + .003, M.z1 - .2, .24, .006, .22, { contorno: 'fino', nombre: 'Dulcero' });
      for (let i = 0; i < 14; i++) lote.esfera(dulces[(i + k) % dulces.length], x0 + .03 + (i % 5) * .045, y + .025 + Math.floor(i / 5) * .03 + k * .03, M.z1 - .14 - (i % 3) * .05, .04, .03, .04, { contorno: false, nombre: 'Dulces' });
    }
    en(-2.1, y, M.z1 - .1, 0, () => {
      lote.caja('rojo', .22, .09, -.08, .44, .18, .2, { contorno: 'medio', nombre: 'Exhibidor de chicles' });
      rellenar(prod, 'dulce', .02, .42, .02, .18, .24, { celdas: [prod.familias.dulce[4], prod.familias.dulce[5]], filas: 1 });
    });
    // gel antibacterial, portaplumas y timbre
    prod.poner('botella', prod.familias.higiene[2], -.35, y, M.z1 - .15, .08, .2, .08, { nombre: 'Gel antibacterial' });
    lote.cil('plastico', -.35, y + .22, M.z1 - .15, .02, .05, { contorno: false });
    lote.cil('grafito', -.1, y + .05, M.z1 - .3, .07, .1, { contorno: 'fino', nombre: 'Portaplumas' });
    for (const [dx, col] of [[-.012, '#2f6fb7'], [.012, '#e8412f'], [0, '#26282b']]) lote.cil(col, -.1 + dx, y + .13, M.z1 - .3 + dx, .008, .12, { contorno: false });
    lote.cil('cromo', 1.75, y + .02, M.z1 - .18, .08, .04, { contorno: 'fino', nombre: 'Timbre' });
    lote.esfera('cromo', 1.75, y + .045, M.z1 - .18, .05, .03, .05, { contorno: false });
    // baumanómetro digital
    lote.caja('plastico', -1.75, y + .05, M.z0 + .25, .16, .1, .12, { rx: -.3, contorno: 'medio', nombre: 'Baumanómetro' });
    lote.caja('azul', -1.75, y + .06, M.z0 + .25, .1, .04, .002, { contorno: false });
    // bolsas de papel apiladas del lado del dependiente
    for (let k = 0; k < 6; k++) lote.caja('papel', -2.6, y + .004 + k * .006, M.z0 + .2, .26, .005, .34, { contorno: k === 5 ? 'fino' : false, nombre: 'Bolsas' });
    // letrero «Pague aquí» colgado sobre la caja
    const pague = R.cartelPasillo(.6, .2, 'PAGUE AQUÍ', 'efectivo · tarjeta', R.VERDE_OSC);
    pague.position.set(.75, 2.35, M.z1 - .12); grupo.add(pague);
    for (const x of [.5, 1]) lote.cil('metalGris', x, 2.7, M.z1 - .12, .006, .6, { contorno: false });
  }
  /* Media puerta del dependiente. */
  {
    const P = MEDIA_PUERTA, z = (M.z0 + M.z1) / 2;
    B('melamina', P.x0 + .02, P.x1 - .02, .08, .95, z - .02, z + .02, { contorno: 'medio' });
    B('verde', P.x0 + .02, P.x1 - .02, .95, 1.0, z - .03, z + .03, { contorno: 'medio' });
    B('verde', P.x0 + .02, P.x1 - .02, .08, .12, z - .025, z + .025, { contorno: false });
    for (const y of [.25, .8]) B('metalGris', P.x1 - .04, P.x1, y, y + .08, z - .03, z + .03, { contorno: false });
    B('melamina', P.x1, X1, 0, alto + .01, M.z0, M.z1, { contorno: 'medio' });
    const aviso = R.letreroPuerta(.5, .14, 'SOLO', 'personal', '#c8322a');
    aviso.position.set((P.x0 + P.x1) / 2, .78, z + .025); grupo.add(aviso);
    colisiones.push([P.x0, z - .05, X1, z + .05]);
  }

  /* 5. Refrigerador de bebidas (muro este, junto a la entrada). */
  {
    const L = REFRI.z1 - REFRI.z0, f = REFRI.fondo, h = REFRI.alto;
    const vidrioRefri = crearVidrio({ tinte: '#e6f2f8', opacidad: .09, fuerza: .7, brillos: 1 });
    en(X1 - f, 0, REFRI.z0, -Math.PI / 2, () => {
      B('refri', 0, .05, 0, h, -f, 0); B('refri', L - .05, L, 0, h, -f, 0);
      B('refri', 0, L, h - .24, h, -f, 0, { contorno: 'medio' });
      B('grafito', 0, L, 0, .16, -f, 0, { contorno: 'medio' });
      for (let i = 0; i < 12; i++) B('negro', .1 + i * .12, .16 + i * .12, .04, .12, .001, .004, { contorno: false });
      // interior: espalda iluminada y costados claros
      const fondoLuz = new T.Mesh(new T.PlaneGeometry(L - .1, h - .42), kit.emisivo('#eef6fb'));
      ctx.colocar(fondoLuz, L / 2, (h - .42) / 2 + .16, -f + .06);
      B('refriInterior', .05, .07, .16, h - .24, -f, -.05, { contorno: false }); B('refriInterior', L - .07, L - .05, .16, h - .24, -f, -.05, { contorno: false });
      B('refriInterior', .05, L - .05, .16, .2, -f + .05, -.05, { contorno: false });
      const niveles = [.2, .55, .9, 1.22, 1.52];
      niveles.forEach((y, n) => {
        if (n) B('rejilla', .07, L - .07, y - .015, y, -f + .06, -.07, { contorno: 'fino' });
        for (const [xa, xb] of [[.08, L / 2 - .03], [L / 2 + .03, L - .08]]) {
          rellenar(prod, 'bebida', xa, xb, y, f - .15, (niveles[n + 1] ?? h - .24) - y - .02,
            { celdas: n < 2 ? prod.familias.bebida.slice(0, 5) : prod.familias.bebida });
        }
      });
      // puertas de vidrio: marco, burlete, jaladera
      for (const [a, b] of [[.05, L / 2], [L / 2, L - .05]]) {
        B('grafito', a, b, .16, .2, -.02, .03); B('grafito', a, b, h - .28, h - .24, -.02, .03);
        B('grafito', a, a + .04, .16, h - .24, -.02, .03); B('grafito', b - .04, b, .16, h - .24, -.02, .03);
        const v = new T.Mesh(new T.PlaneGeometry(b - a - .08, h - .48), vidrioRefri); v.name = 'Refrigerador de bebidas';
        ctx.colocar(v, (a + b) / 2, (h - .48) / 2 + .2, .005);
        const xj = a < L / 2 ? b - .1 : a + .1;
        B('cromo', xj - .012, xj + .012, .75, 1.45, .03, .06, { contorno: 'fino' });
      }
      const cab = R.cabeceraRefri(L - .06, .2);
      ctx.colocar(cab, L / 2, h - .12, .002);
    });
    colisiones.push([X1 - f - .05, REFRI.z0, X1, REFRI.z1]);
    lamparas.push({ pos: [X1 - .45, 1.2, (REFRI.z0 + REFRI.z1) / 2], color: '#e8f4ff', intensidad: .55, radio: 1.1 });
  }

  /* 6. Báscula de moneda junto a la puerta. */
  {
    en(X0 + .32, 0, -.75, Math.PI / 2, () => {
      lote.caja('rojo', 0, .045, 0, .44, .09, .46, { contorno: 'medio', nombre: 'Báscula' });
      lote.caja('hule', 0, .095, .03, .36, .012, .34, { contorno: false });
      lote.caja('rojo', 0, .75, -.16, .1, 1.3, .1, { contorno: 'medio', nombre: 'Báscula' });
      lote.caja('cromo', 0, .5, -.105, .05, .5, .01, { contorno: false });
      lote.cil('rojo', 0, 1.55, -.14, .46, .14, { rx: Math.PI / 2, lados: 24, contorno: 'medio', nombre: 'Báscula' });
      lote.cil('cromo', 0, 1.55, -.07, .43, .01, { rx: Math.PI / 2, lados: 24, contorno: false });
      const car = R.caratulaBascula(.4); ctx.colocar(car, 0, 1.55, -.063);
      lote.caja('rojo', 0, 1.86, -.14, .3, .16, .06, { contorno: 'medio' });
      const tope = R.letreroPuerta(.28, .12, 'SU PESO', '$1', '#c8322a'); ctx.colocar(tope, 0, 1.86, -.108);
      lote.caja('cromo', .09, 1.2, -.1, .04, .07, .02, { contorno: 'fino', nombre: 'Ranura de moneda' });
    });
    colisiones.push([X0, -1.0, X0 + .56, -.5]);
  }

  /* 7. Puertas interiores: consultorio (oeste) y bodega (este). */
  // Puerta cerrada en un hueco de muro: x = cara interior del muro, s = +1 si el
  // local queda hacia +x (muro oeste) o -1 (muro este).
  const puerta = (x, z, ancho, altoP, s, color, moldura, titulo, sub, cartelColor) => {
    const m = .05, cara = x - .02 * s;
    for (const zz of [z - ancho / 2 - m / 2, z + ancho / 2 + m / 2]) B('vitrinaMarco', x - .03 * s, x + .02 * s, 0, altoP + m, zz - m / 2, zz + m / 2);
    B('vitrinaMarco', x - .03 * s, x + .02 * s, altoP, altoP + m, z - ancho / 2, z + ancho / 2);
    lote.caja(color, x - .04 * s, altoP / 2, z, .04, altoP, ancho, { contorno: 'medio', nombre: titulo });
    for (const y of [.35, 1.2]) B(moldura, cara, cara + .006 * s, y, y + .7, z - ancho / 2 + .1, z + ancho / 2 - .1, { contorno: false });
    const zm = z + ancho / 2 - .12;
    lote.cil('cromo', cara + .01 * s, 1.02, zm, .06, .02, { rz: Math.PI / 2, contorno: 'fino' });
    B('cromo', cara + .015 * s, cara + .035 * s, 1.01, 1.03, zm - .12, zm, { contorno: 'fino', nombre: titulo });
    const l = R.letreroPuerta(.62, .2, titulo, sub, cartelColor);
    l.rotation.y = s * Math.PI / 2; l.position.set(x + .025 * s, altoP + .22, z); grupo.add(l);
  };
  puerta(X0, CONSULTORIO.z, CONSULTORIO.ancho, CONSULTORIO.alto, 1, 'puertaMadera', 'puertaMaderaOsc', 'CONSULTORIO', 'consulta médica', R.VERDE);
  puerta(X1, BODEGA.z, BODEGA.ancho, BODEGA.alto, -1, 'melaminaGris', 'metalGris', 'BODEGA', 'solo personal', '#5a6d82');

  /* 8. Silla de espera y red fría (tras el mostrador). */
  {
    en(X0 + .34, 0, -6.55, Math.PI / 2, () => {
      for (const x of [-.2, .2]) for (const z of [-.2, .16]) lote.cil('metalGris', x, .22, z, .025, .44, { contorno: 'fino' });
      lote.caja('azul', 0, .46, 0, .46, .04, .44, { contorno: 'medio', nombre: 'Silla de espera' });
      lote.caja('azul', 0, .72, -.21, .46, .42, .03, { rx: -.1, contorno: 'medio', nombre: 'Silla de espera' });
      for (const x of [-.2, .2]) lote.cil('metalGris', x, .62, -.21, .022, .34, { contorno: 'fino' });
    });
    colisiones.push([X0, -6.85, X0 + .6, -6.25]);
    const pp = R.poster(.5, .7, 'presion'); pp.rotation.y = Math.PI / 2; pp.position.set(X0 + .012, 1.45, -6.55); grupo.add(pp);
    // red fría: refrigerador chico de vacunas e insulina
    en(X0, 0, -8.35, Math.PI / 2, () => {
      lote.caja('plastico', 0, .43, .3, .6, .86, .58, { contorno: 'medio', nombre: 'Red fría (vacunas e insulina)' });
      lote.caja('grafito', 0, .5, .592, .5, .6, .01, { contorno: false });
      lote.caja('cromo', .22, .5, .6, .02, .3, .03, { contorno: 'fino' });
      const aviso = R.letreroPuerta(.34, .1, 'RED FRÍA', '2 a 8 °C', '#2f6fb7'); ctx.colocar(aviso, 0, .72, .6);
    });
    colisiones.push([X0, -8.65, X0 + .6, -8.05]);
    const pv = R.poster(.5, .7, 'vacuna'); pv.rotation.y = Math.PI / 2; pv.position.set(X0 + .012, 1.6, -8.35); grupo.add(pv);
    // banco alto y escalera de dos peldaños del dependiente
    lote.cil('metalGris', -1.2, .35, -8.1, .04, .7, { contorno: 'fino' });
    lote.cil('negro', -1.2, .72, -8.1, .34, .06, { lados: 24, contorno: 'medio', nombre: 'Banco' });
    lote.cil('metalGris', -1.2, .12, -8.1, .36, .02, { lados: 24, contorno: false });
    en(1.9, 0, -8.55, 0, () => {
      for (const x of [-.2, .2]) lote.caja('metalGris', x, .3, 0, .03, .6, .5, { rx: 0, contorno: 'fino' });
      lote.caja('azul', 0, .3, .08, .44, .04, .22, { contorno: 'medio', nombre: 'Escalera de dos peldaños' });
      lote.caja('azul', 0, .6, -.1, .44, .04, .26, { contorno: 'medio', nombre: 'Escalera de dos peldaños' });
    });
    lote.cil('verde', 2.7, .2, -7.95, .3, .4, { contorno: 'medio', nombre: 'Bote de basura' });
  }

  /* 9. Exhibidor metálico de botanas junto al mostrador: cinco charolas de
     alambre inclinadas hacia el cliente, con las bolsas recargadas en fila. */
  {
    const bx = 1.72, bz = -6.4, incl = .28;
    en(bx, 0, bz, 0, () => {
      for (const x of [-.27, .27]) for (const z of [-.18, .12]) lote.cil('metalGris', x, .8, z, .02, 1.6, { contorno: 'fino' });
      lote.caja('rojo', 0, 1.66, .12, .6, .18, .02, { contorno: 'medio', nombre: 'Exhibidor de botanas' });
      const rotulo = R.friso(.56, .15, 'BOTANAS', { color: '#e8412f', icono: false }); ctx.colocar(rotulo, 0, 1.66, .131);
      for (let k = 0; k < 5; k++) {
        const y = .16 + k * .29;
        // charola: marco de alambre y dos travesaños, con el frente más bajo
        en(0, y, -.03, 0, () => {
          lote.caja('metalGris', 0, 0, 0, .54, .01, .3, { rx: incl, contorno: false });
          lote.caja('metalGris', 0, .02 - Math.sin(incl) * .15, .15 * Math.cos(incl), .54, .04, .01, { rx: incl, contorno: 'fino' });
          for (let j = 0; j < 3; j++) {
            const zz = .1 - j * .09, yy = .012 - zz * Math.tan(incl);
            for (let i = 0; i < 2; i++) {
              const c = prod.familias.botana[(k * 2 + i) % prod.familias.botana.length];
              prod.poner('bolsa', c, -.13 + i * .26, yy, zz, .24, .27, .075, { rx: -.3, nombre: prod.atlas.nombres[c], trazo: j === 0 });
            }
          }
        });
      }
    });
    colisiones.push([bx - .32, bz - .22, bx + .32, bz + .16]);
  }

  /* 10. Canastillas, tapete, espejo convexo y cámara. */
  {
    const cx = -.62, cz = -.82;   // junto a la puerta, fuera del barrido de la hoja
    for (let k = 0; k < 6; k++) {
      const y = k * .05;
      en(cx, y, cz, .15, () => {
        lote.caja('rojo', 0, .012, 0, .44, .024, .32, { contorno: k === 0 ? 'medio' : false });
        for (const s of [-1, 1]) { lote.caja('rojo', s * .21, .11, 0, .02, .2, .32, { contorno: 'fino' }); lote.caja('rojo', 0, .11, s * .15, .44, .2, .02, { contorno: 'fino', nombre: 'Canastillas' }); }
      });
    }
    en(cx, .3, cz, .15, () => { for (const s of [-1, 1]) lote.caja('grafito', 0, .12, s * .06, .3, .025, .025, { contorno: 'fino', nombre: 'Canastillas' }); });
    colisiones.push([cx - .28, cz - .22, cx + .28, cz + .22]);
    B('tapete', -2.45, -1.05, 0, .012, -.95, -.1, { contorno: false });
    // espejo convexo en la esquina NE del piso de venta y cámara en la NO
    lote.esfera(kit.metal('cromo', .75, 1), X1 - .2, 2.6, -6.75, .42, .42, .16, { ry: -.8, contorno: 'fino', nombre: 'Espejo convexo' });
    B('grafito', X1 - .08, X1, 2.58, 2.62, -6.77, -6.73, { contorno: false });
    lote.caja('plastico', X0 + .18, 2.86, -.25, .1, .08, .16, { ry: .7, contorno: 'medio', nombre: 'Cámara de seguridad' });
    lote.cil('negro', X0 + .24, 2.86, -.33, .05, .04, { rx: Math.PI / 2, contorno: false });
  }

  /* 11. Aparador: exhibición de oferta mirando a la calle (tres tarimas). */
  {
    const tarimas = [[-.5, .35, .1, 'bebida'], [.45, 1.25, .26, 'frasco'], [1.4, 2.7, .12, 'paquete']];
    for (const [xa, xb, h, familia] of tarimas) {
      B('menta', xa, xb, APARADOR.y0, APARADOR.y0 + h, -.32, -.04, { contorno: 'fino' });
      en(xa, APARADOR.y0 + h, -.06, 0, () => rellenar(prod, familia, .02, xb - xa - .02, 0, .24, .5,
        familia === 'bebida' ? { celdas: prod.familias.bebida.slice(1, 4) } : familia === 'paquete' ? { celdas: prod.familias.paquete.slice(0, 2), filas: 1 } : {}));
    }
  }

  /* 12. Carteles colgantes de pasillo y carteles de pared. */
  const colgante = (x, z, titulo, sub, color) => {
    const c = R.cartelPasillo(1.1, .34, titulo, sub, color); c.position.set(x, 2.42, z); grupo.add(c);
    for (const dx of [-.45, .45]) lote.cil('metalGris', x + dx, 2.8, z, .006, .42, { contorno: false });
  };
  colgante(-2.15, -3.4, 'BOTANAS', 'papas · galletas · dulces', '#ef7d22');
  colgante(0, -3.4, 'SALUD', 'vitaminas · libre venta', R.VERDE);
  colgante(2.15, -3.4, 'CUIDADO PERSONAL', 'bebé · higiene · primeros auxilios', '#2f6fb7');
  const turno = R.lineaTurno(1.5, .2); turno.rotation.x = -Math.PI / 2; turno.position.set(-.35, .003, -6.2); grupo.add(turno);
  const ph = R.poster(.55, .78, 'hidratate'); ph.rotation.y = -Math.PI / 2; ph.position.set(X1 - .012, 1.45, -1.0); grupo.add(ph);
  const pg = R.poster(.5, .7, 'genericos'); pg.rotation.y = Math.PI; pg.position.set(-2.85, 1.55, -.013); grupo.add(pg);
}

// Góndola en el mundo: arma estructura y caras con el `en` compartido.
function gondolaMundo(ctx, g, en) {
  const { lote, prod } = ctx;
  const L = g.z1 - g.z0, ancho = g.x1 - g.x0, fondo = ancho / 2, alto = g.alto;
  const niveles = [.12, .44, .76, 1.08];
  const xc = (g.x0 + g.x1) / 2;
  // estructura: marco local con el largo por +x (de sur a norte) → ry = π/2
  en(xc, 0, g.z1, Math.PI / 2, () => {
    lote.caja('melamina', L / 2, alto / 2, 0, L, alto, .04, { contorno: false });
    lote.caja('zoclo', L / 2, .06, 0, L - .02, .12, ancho - .02, { contorno: 'fino' });
    for (const x of [.015, L / 2, L - .015]) lote.caja(x === L / 2 ? 'metalBlanco' : 'melamina', x, alto / 2, 0, .03, alto, ancho, { contorno: 'medio' });
    lote.caja('melamina', L / 2, alto + .015, 0, L, .03, ancho, { contorno: 'medio' });
  });
  // caras: la este mira a +x (ry = π/2 → el largo corre hacia -z desde z1);
  // la oeste mira a -x (ry = -π/2 → el largo corre hacia +z desde z0).
  for (const [familia, ry, ox, oz] of [[g.este, Math.PI / 2, g.x1, g.z1], [g.oeste, -Math.PI / 2, g.x0, g.z0]]) {
    en(ox, 0, oz, ry, () => {
      niveles.forEach((y, n) => {
        const libre = (niveles[n + 1] ?? alto) - y - .03;
        if (n > 0) lote.caja('metalBlanco', L / 2, y - .012, -fondo / 2 + .01, L - .04, .024, fondo - .03, { contorno: 'fino' });
        for (const [xa, xb] of [[.04, L / 2 - .02], [L / 2 + .02, L - .04]]) {
          lote.pieza(lote.kit.geo.plano, ctx.matTira, (xa + xb) / 2, y - .006, .002, xb - xa, .034, 1, { contorno: false });
          const lista = SURTIDOS[familia];
          rellenar(prod, lista[n % lista.length], xa, xb, y, fondo - .04, libre);
        }
      });
    });
  }
  // cabecera (sur): cuatro entrepaños de oferta mirando a la entrada
  en(xc, 0, g.z1 + .3, 0, () => {
    const w = ancho, d = .3;
    lote.caja('melamina', 0, alto / 2, -d + .01, w, alto, .02, { contorno: false });
    for (const x of [-w / 2 + .015, w / 2 - .015]) lote.caja('melamina', x, alto / 2, -d / 2, .03, alto, d, { contorno: 'medio' });
    lote.caja('rojo', 0, .06, -d / 2, w - .03, .12, d - .01, { contorno: 'fino' });
    niveles.forEach((y, n) => {
      if (n > 0) lote.caja('metalBlanco', 0, y - .012, -d / 2 + .01, w - .04, .024, d - .02, { contorno: 'fino' });
      lote.pieza(lote.kit.geo.plano, ctx.matTira, 0, y - .006, .002, w - .06, .034, 1, { contorno: false });
      const libre = (niveles[n + 1] ?? alto) - y - .03;
      const suero = g.cabecera === 'suero';
      rellenar(prod, suero ? (n % 2 ? 'bebida' : 'higiene') : (n % 2 ? 'paquete' : 'dulce'), -w / 2 + .03, w / 2 - .03, y, d - .04, libre,
        suero && n % 2 ? { celdas: prod.familias.bebida.slice(1, 4) } : suero ? { celdas: prod.familias.higiene.slice(2, 4) } : {});
    });
    // rótulo a dos caras: se lee desde la entrada y desde el mostrador
    for (const [z, ry] of [[.012, 0], [-.016, Math.PI]]) {
      const oferta = R.friso(w + .1, .3, g.cabecera === 'suero' ? 'OFERTA' : '2 × 1', { color: '#e8412f', icono: false });
      ctx.colocar(oferta, 0, alto + .2, z, ry);
    }
    lote.caja('rojo', 0, alto + .2, -.002, w + .12, .32, .02, { contorno: 'fino' });
  });
  ctx.colisiones.push([g.x0 - .02, g.z0 - .02, g.x1 + .02, g.z1 + .31]);
}
