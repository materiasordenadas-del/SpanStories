import * as T from '../engine/three.js';
import { caja, cilindro, esfera, pieza } from './Piezas.js';
import { crearCartel } from './Carteles.js';
import { COLORS as C, DOOR as D, FRONT as F } from '../engine/dimensions.js';

// Pivot abajo-centro en el plano medio del muro; frente (+z local) = lado de la galería.
const animarHoja = (root, bisagras) => {
  root.userData.abierta = Boolean(root.userData.abierta);
  root.userData.accion ??= () => { root.userData.abierta = !root.userData.abierta; };
  root.userData.animar = dt => { for (const [h, abre] of bisagras) h.rotation.y = T.MathUtils.damp(h.rotation.y, root.userData.abierta ? abre : 0, 7, dt); };
};

/** Puerta de habitación colonial: hoja de tablero con cuarterones, montante enrejado y rótulo encima.
 *  Abre hacia dentro del cuarto (−z local); bisagra a la izquierda vista desde la galería. */
export function crearPuertaColonial({ grosor, numero = '', rotulo = '', sub = '', abierta = false, color = C.postigo }) {
  const r = new T.Group(), W = D.width, H = D.height, h = new T.Group();
  h.position.set(-W / 2 + .02, 0, -grosor / 2 + .05); r.add(h);
  const w = W - .04, z = .025;
  caja(h, 'hoja', w, H - .02, .05, color, w / 2, H / 2, z);
  // Cuatro cuarterones por cara (dos columnas × dos filas), en relieve sobre la hoja.
  for (const cara of [1, -1]) for (const col of [.25, .75]) for (const [y0, hh] of [[.3, .75], [1.3, 1]]) caja(h, 'cuarteron', w / 2 - .18, hh, .02, C.postigoOscuro, w * col, y0 + hh / 2, z + cara * .035, false);
  esfera(h, 'pomo', .035, C.gold, w - .1, 1.05, z + .06); esfera(h, 'pomo-int', .035, C.gold, w - .1, 1.05, z - .06);
  caja(h, 'cerradura', .06, .14, .02, C.gold, w - .1, 1.2, z + .04, false);
  if (numero) {
    const placa = crearCartel({ ancho: D.plate, alto: D.plate, fondo: C.crema, borde: C.maderaOscura, marco: C.maderaOscura, grosor: .015, lineas: [{ texto: numero, tam: .62, color: C.tinta, peso: 700 }] });
    placa.position.set(w / 2, 1.62, z + .035); h.add(placa);
  }
  // Marco (jambas + cabezal) en ambas caras y montante enrejado sobre la hoja.
  for (const lado of [1, -1]) {
    for (const s of [-1, 1]) caja(r, 'jamba', D.frame, H + D.transom, .04, C.maderaOscura, s * (W / 2 + D.frame / 2), (H + D.transom) / 2, lado * (grosor / 2 + .02), 'fino');
    caja(r, 'cabezal', W + 2 * D.frame + .1, .14, .06, C.maderaOscura, 0, H + D.transom + .07, lado * (grosor / 2 + .03), 'fino');
  }
  caja(r, 'travesaño', W, .1, grosor, C.maderaOscura, 0, H + .05, 0, false);
  caja(r, 'vidrio-montante', W, D.transom - .1, .02, C.vidrio, 0, H + .1 + (D.transom - .1) / 2, -.04, false);
  for (let i = 1; i < 7; i++) cilindro(r, 'barrote-' + i, .015, D.transom - .1, C.maderaOscura, -W / 2 + W * i / 7, H + .1 + (D.transom - .1) / 2, .02, false, 6);
  if (rotulo) {
    const c = crearCartel({ ancho: 1.2, alto: sub ? .36 : .26, lineas: sub ? [{ texto: rotulo, tam: .5, color: C.crema, peso: 700 }, { texto: sub, tam: .3, color: '#f0d9a4', fuente: 'system-ui, sans-serif', peso: 500 }] : [{ texto: rotulo, tam: .62, color: C.crema, peso: 700 }] });
    c.position.set(0, H + D.transom + .14 + (sub ? .2 : .15), grosor / 2 + .03); r.add(c);
  }
  r.userData.abierta = abierta; animarHoja(r, [[h, Math.PI * .47]]);   // +ángulo: la hoja entra en el cuarto (−z)
  return r;
}

/** Reja de hierro de dos hojas para las portadas del muro de calle; abre hacia el patio delantero (−z). */
export function crearReja({ ancho = F.gate.clear, alto = F.gate.height } = {}) {
  const r = new T.Group(), hojas = [];
  for (const s of [-1, 1]) {
    // Bisagra en el pilar; la hoja va hacia el centro: un punto a fracción f de su ancho está en x = −s·f·w.
    const h = new T.Group(); h.position.x = s * ancho / 2; r.add(h); const w = ancho / 2 - .02, at = f => -s * f * w;
    for (const y of [.12, alto * .45, alto - .06]) caja(h, 'travesaño', w, .05, .04, C.hierro, at(.5), y, 0, false);
    for (const f of [0, 1]) caja(h, 'larguero', .05, alto - .02, .05, C.hierro, at(f), alto / 2, 0, 'fino');
    const n = 7; for (let i = 1; i < n; i++) { cilindro(h, 'barrote', .013, alto - .2, C.hierro, at(i / n), alto / 2, 0, false, 6); esfera(h, 'punta', .03, C.gold, at(i / n), alto - .02, 0, false); }
    for (const f of [.3, .7]) pieza(h, 'voluta', new T.TorusGeometry(.11, .012, 6, 18), C.hierro, [at(f), alto * .72, 0], false);
    hojas.push([h, -s * Math.PI * .45]);   // la hoja oeste gira +, la este −: ambas hacia −z (patio delantero)
  }
  caja(r, 'cerrojo', .14, .05, .06, C.gold, 0, 1.05, .04, false);
  animarHoja(r, hojas); return r;
}

/** Portada del muro de calle: dos pilares, arco rebajado con cartel (ENTRADA/SALIDA) y remate de teja. Frente +z local. */
export function crearPortada({ texto, flecha, colorMuro }) {
  const G = F.gate, r = new T.Group(), dx = G.clear / 2 + G.pier / 2;
  for (const s of [-1, 1]) {
    caja(r, 'pilar', G.pier, G.pierHeight, G.pierDepth, colorMuro, s * dx, G.pierHeight / 2, 0, 'fino');
    caja(r, 'zocalo-pilar', G.pier + .04, .6, G.pierDepth + .04, C.zocalo, s * dx, .3, 0, false);
    caja(r, 'capitel', G.pier + .14, .16, G.pierDepth + .14, C.moldura, s * dx, G.pierHeight + .08, 0, 'fino');
    caja(r, 'remate', G.pier + .1, .12, G.pierDepth + .1, C.teja, s * dx, G.pierHeight + .22, 0);
    esfera(r, 'pináculo', .1, C.moldura, s * dx, G.pierHeight + .38, 0, 'fino');
  }
  // Dintel entre pilares (cartel) con su cornisa.
  const yD = G.height, hD = G.pierHeight - G.height - .05;
  caja(r, 'dintel', G.clear, hD, G.pierDepth - .1, colorMuro, 0, yD + hD / 2, 0, 'fino');
  caja(r, 'cornisa', G.clear + .1, .1, G.pierDepth, C.moldura, 0, G.pierHeight - .05, 0, false);
  for (const lado of [1, -1]) {
    const c = crearCartel({ ancho: G.sign.width, alto: G.sign.height, fondo: C.postigoOscuro, lineas: [{ texto: (lado > 0 ? flecha + ' ' : '') + texto, tam: .66, color: C.crema, peso: 700, fuente: 'system-ui, sans-serif' }] });
    c.position.set(0, yD + hD / 2, lado * ((G.pierDepth - .1) / 2 + .03)); if (lado < 0) c.rotation.y = Math.PI; r.add(c);
  }
  return r;
}
