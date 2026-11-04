import * as T from './three.js';
import { crearMaterialToon, luz } from './Luz25D.js';
import { PALETA, lienzo, texturaBaldosa, ilustracion, azar } from './Kit.js';
import { LOCAL, MURO, ALTO_TECHO, FACHADA, PUERTA, ESCAPARATE, TOLDO, ACERA, CALZADA, FONDO_CALLE, VECINOS,
  ALMACEN, LUMINARIAS } from './config.js';

/* Casco de La Estrella: piso, muros, techo, fachada con escaparate, puerta
   corredera de vidrio, letrero, toldo, almacén y la calle.  Todo derivado de
   config.js.  Devuelve lo que otros necesitan (letrero para redibujar, puertas). */

const X0 = LOCAL.x0, X1 = LOCAL.x1, Z0 = LOCAL.z0, Z1 = LOCAL.z1;

export function construirLocal(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const muro = (x0, z0, x1, z1) => colisiones.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

  // ── Piso de baldosa (módulo de 2 × 2 baldosas de 60 cm) y techo ─────────
  const bal = texturaBaldosa();
  const piso = new T.Mesh(new T.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2),
    crearMaterialToon({ albedo: bal.map, normal: bal.normal, repetir: [(X1 - X0) / 1.2, (Z1 - Z0) / 1.2], fuerzaNormal: .7 }));
  piso.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); piso.name = 'piso';
  const techo = new T.Mesh(new T.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2), crearMaterialToon({ color: PALETA.techo }));
  techo.position.set((X0 + X1) / 2, ALTO_TECHO, (Z0 + Z1) / 2); techo.name = 'techo';
  grupo.add(piso, techo);

  // ── Muros: oeste, este y fondo (por fuera de las caras interiores) ───────
  const H = ALTO_TECHO + .25;
  lote.bloque('pared', X0 - MURO, 0, Z0 - MURO, X0, H, Z1, { contorno: false }); muro(X0 - MURO, Z0 - MURO, X0, Z1);
  lote.bloque('pared', X1, 0, Z0 - MURO, X1 + MURO, H, Z1, { contorno: false }); muro(X1, Z0 - MURO, X1 + MURO, Z1);
  lote.bloque('pared', X0 - MURO, 0, Z0 - MURO, X1 + MURO, H, Z0, { contorno: false }); muro(X0 - MURO, Z0 - MURO, X1 + MURO, Z0);
  // Franja de marca a lo alto de las paredes y zócalo oscuro
  for (const [x0, z0, x1, z1] of [[X0, Z0, X0 + .012, Z1], [X1 - .012, ALMACEN.z1 + ALMACEN.muro, X1, Z1], [X0, Z0, ALMACEN.x0 - ALMACEN.muro, Z0 + .012]]) {
    lote.bloque('rojo', x0, 2.62, z0, x1, 2.82, z1, { contorno: false });
    lote.bloque('zocalo', x0, 0, z0, x1, .1, z1, { contorno: false });
  }

  // ── Fachada (z = 0 … MURO hacia la calle) ─────────────────────────────
  const zF0 = Z1, zF1 = Z1 + MURO, E = ESCAPARATE, P = PUERTA;
  const puertaX0 = P.x - P.ancho / 2, puertaX1 = P.x + P.ancho / 2;
  lote.bloque('ladrillo', X0 - MURO, 0, zF0, E.x0, E.y1, zF1, { contorno: 'fino' });             // pilar oeste
  lote.bloque('ladrillo', E.x1, 0, zF0, puertaX0, E.y1, zF1, { contorno: 'fino' });              // pilar entre escaparate y puerta
  lote.bloque('ladrillo', puertaX1, 0, zF0, X1 + MURO, E.y1, zF1, { contorno: 'fino' });         // pilar este
  lote.bloque('piedra', E.x0, 0, zF0 - .02, E.x1, E.y0, zF1 + .02, { contorno: 'fino' });       // antepecho del escaparate
  lote.bloque('crema', X0 - MURO, E.y1, zF0, X1 + MURO, FACHADA.alto, zF1, { contorno: 'fino' }); // dintel y remate
  lote.bloque('rojo', X0 - MURO, FACHADA.alto - .12, zF0, X1 + MURO, FACHADA.alto, zF1 + .05, { contorno: false });
  muro(X0 - MURO, zF0, E.x1, zF1); muro(E.x1, zF0, puertaX0, zF1); muro(puertaX1, zF0, X1 + MURO, zF1);
  // Montantes del escaparate y el vidrio
  const paño = (E.x1 - E.x0) / E.paños;
  for (let i = 0; i <= E.paños; i++) lote.caja('aluminio', E.x0 + paño * i, (E.y0 + E.y1) / 2, zF0 + MURO / 2, E.montante, E.y1 - E.y0, MURO * .7);
  lote.caja('aluminio', (E.x0 + E.x1) / 2, E.y0 + .03, zF0 + MURO / 2, E.x1 - E.x0, .06, MURO * .7);
  lote.caja('aluminio', (E.x0 + E.x1) / 2, E.y1 - .03, zF0 + MURO / 2, E.x1 - E.x0, .06, MURO * .7);
  const vidrio = new T.Mesh(new T.PlaneGeometry(E.x1 - E.x0, E.y1 - E.y0), kit.vidrio());
  vidrio.position.set((E.x0 + E.x1) / 2, (E.y0 + E.y1) / 2, zF0 + MURO / 2); vidrio.renderOrder = 4; vidrio.name = 'escaparate-vidrio';
  grupo.add(vidrio);
  // Marco de la puerta
  lote.bloque('aluminio', puertaX0 - .06, 0, zF0, puertaX0, P.alto + .06, zF1);
  lote.bloque('aluminio', puertaX1, 0, zF0, puertaX1 + .06, P.alto + .06, zF1);
  lote.bloque('aluminio', puertaX0, P.alto, zF0, puertaX1, P.alto + .12, zF1);
  lote.bloque('crema', puertaX0, P.alto + .12, zF0, puertaX1, E.y1, zF1, { contorno: false });
  // Tapete de entrada
  lote.bloque('grafito', puertaX0 + .05, 0, Z1 - 1.4, puertaX1 - .05, .012, Z1 - .02, { contorno: false, nombre: 'el tapete de la entrada' });
  const puertas = construirPuertas(ctx, zF1 + .04);

  // ── Letrero (caja de luz) y toldo ─────────────────────────────────────
  const [ly0, ly1] = FACHADA.letrero, lx0 = X0 + .3, lx1 = X1 - .3;
  lote.bloque('rojoOscuro', lx0, ly0, zF1, lx1, ly1, zF1 + FACHADA.vuelo, { contorno: 'fino' });
  const letrero = ilustracion(lx1 - lx0 - .12, ly1 - ly0 - .12, 2048, () => {}, 'cartel');
  letrero.position.set((lx0 + lx1) / 2, (ly0 + ly1) / 2, zF1 + FACHADA.vuelo + .005); letrero.name = 'letrero';
  letrero.userData.nombre = 'el letrero de la tienda';
  grupo.add(letrero); ctx.pulsables.push(letrero);
  construirToldo(ctx, zF1);

  // ── Almacén: muros sur y oeste, puerta «Solo personal» abierta ──────────
  const A = ALMACEN, pa = A.puerta, am = A.muro;
  const pa0 = pa.x - pa.ancho / 2, pa1 = pa.x + pa.ancho / 2;
  lote.bloque('pared', A.x0 - am, 0, A.z1, pa0, ALTO_TECHO, A.z1 + am, { contorno: false });
  lote.bloque('pared', pa1, 0, A.z1, A.x1, ALTO_TECHO, A.z1 + am, { contorno: false });
  lote.bloque('pared', pa0, pa.alto, A.z1, pa1, ALTO_TECHO, A.z1 + am, { contorno: false });
  lote.bloque('pared', A.x0 - am, 0, A.z0, A.x0, ALTO_TECHO, A.z1, { contorno: false });
  lote.bloque('zocalo', A.x0 - am - .012, 0, A.z0, A.x0 - am, .1, A.z1 + am, { contorno: false });
  lote.bloque('zocalo', A.x0 - am, 0, A.z1 + am, A.x1, .1, A.z1 + am + .012, { contorno: false });
  lote.bloque('grisClaro', pa0 - .05, 0, A.z1 - .01, pa0, pa.alto + .05, A.z1 + am + .01);   // jambas
  lote.bloque('grisClaro', pa1, 0, A.z1 - .01, pa1 + .05, pa.alto + .05, A.z1 + am + .01);
  lote.bloque('grisClaro', pa0 - .05, pa.alto, A.z1 - .01, pa1 + .05, pa.alto + .05, A.z1 + am + .01);
  muro(A.x0 - am, A.z1, pa0, A.z1 + am); muro(pa1, A.z1, A.x1, A.z1 + am); muro(A.x0 - am, A.z0, A.x0, A.z1 + am);
  // Hoja abierta hacia dentro (bisagra al oeste, 100°)
  lote.en(pa0 + .02, 0, A.z1 + am / 2, -Math.PI / 2 - .17, () => {
    lote.bloque('gris', 0, .02, -.025, pa.ancho - .04, pa.alto - .02, .025, { nombre: 'la puerta del almacén' });
    lote.cil('grafito', pa.ancho * .5, 1.55, 0, .3, .056, { rx: Math.PI / 2 });            // ojo de buey
    lote.bloque('acero', pa.ancho - .16, 1.0, .025, pa.ancho - .1, 1.04, .08);
  });
  // Puerta de servicio (cerrada, muro este): hoja metálica y barra antipánico
  const s = A.servicio;
  lote.bloque('aceroOscuro', X1 - .03, 0, s.z - s.ancho / 2, X1, s.alto, s.z + s.ancho / 2, { nombre: 'la puerta de servicio' });
  lote.bloque('acero', X1 - .09, 1.0, s.z - s.ancho / 2 + .12, X1 - .03, 1.06, s.z + s.ancho / 2 - .12, { nombre: 'la barra antipánico' });
  lote.bloque('aceroOscuro', X1 + MURO, 0, s.z - s.ancho / 2, X1 + MURO + .03, s.alto, s.z + s.ancho / 2);

  // ── Luminarias de tubos (emisivas) + charcos de luz de Luz25D ───────────
  for (const x of LUMINARIAS.x) for (const z of LUMINARIAS.z) {
    lote.caja('blanco', x, ALTO_TECHO - .04, z, .32, .08, 1.24, { contorno: false });
    lote.caja(kit.emisivo('#fffdf4'), x, ALTO_TECHO - .085, z, .24, .012, 1.16);
    ctx.lamparas.push({ pos: [x, ALTO_TECHO - .3, z], color: '#fffaf0', intensidad: .75, radio: 2.5 });
  }

  construirCalle(ctx);
  return { letrero, puertas };
}

/* Puerta automática: dos hojas de vidrio con marco que se abren hacia los lados. */
function construirPuertas(ctx, z) {
  const { kit, grupo } = ctx, P = PUERTA, w = P.ancho / 2;
  const hojas = [];
  for (const lado of [-1, 1]) {
    const hoja = new T.Group(); hoja.name = lado < 0 ? 'hoja-oeste' : 'hoja-este';
    const l = ctx.loteHoja = { grupo: hoja };
    const marco = kit.mat('aluminio');
    const piezas = [[0, P.alto / 2, .06, P.alto], [w, P.alto / 2, .06, P.alto], [w / 2, .06, w, .12], [w / 2, P.alto - .04, w, .08], [w / 2, 1.02, w, .05]];
    for (const [cx, cy, sx, sy] of piezas) {
      const m = new T.Mesh(kit.geo.caja, marco); m.position.set(cx - w / 2, cy, 0); m.scale.set(sx, sy, .05); hoja.add(m);
    }
    const v = new T.Mesh(kit.geo.plano, kit.vidrio('#cfeaf2', .28)); v.position.set(0, P.alto / 2, 0); v.scale.set(w - .06, P.alto - .2, 1);
    v.renderOrder = 4; hoja.add(v);
    // Rótulo adhesivo de la hoja
    const txt = lado < 0 ? 'SALIDA' : 'ENTRADA';
    const rot = ilustracion(.5, .12, 256, (c, W, H) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = PALETA.rojo;
      c.font = `bold ${H * .62}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, W / 2, H * .54);
    });
    rot.position.set(0, 1.35, .03); rot.userData.nombre = txt === 'SALIDA' ? 'la salida' : 'la entrada'; hoja.add(rot);
    const rotIn = rot.clone(); rotIn.rotation.y = Math.PI; rotIn.position.z = -.03; hoja.add(rotIn);
    hoja.userData = { base: P.x + lado * w / 2, lado, recorrido: w - .05 };
    hoja.position.set(hoja.userData.base, 0, z);
    grupo.add(hoja); hojas.push(hoja); ctx.pulsables.push(rot);
  }
  return hojas;
}

export function animarPuertas(hojas, jugador, dt) {
  const d = Math.hypot(jugador.x - PUERTA.x, jugador.z - 0);
  const abrir = d < PUERTA.radioApertura ? 1 : 0;
  for (const h of hojas) {
    const u = h.userData; u.t = u.t ?? 0;
    u.t += Math.sign(abrir - u.t) * Math.min(Math.abs(abrir - u.t), dt * 1.6);
    const e = u.t * u.t * (3 - 2 * u.t);
    h.position.x = u.base + u.lado * u.recorrido * e;
  }
}

/* Toldo de rayas sobre el escaparate, con faldón festoneado. */
function construirToldo(ctx, z0) {
  const E = ESCAPARATE, t = TOLDO, ancho = E.x1 - E.x0 + .3;
  const rayas = lienzo(512, 64, (c, w, h) => {
    for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#f6f1e6' : PALETA.rojo; c.fillRect(i * w / 16, 0, w / 16 + 1, h); }
  });
  const faldon = lienzo(512, 64, (c, w, h) => {
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? '#f6f1e6' : PALETA.rojo;
      c.beginPath(); c.moveTo(i * w / 16, 0); c.lineTo((i + 1) * w / 16, 0); c.lineTo((i + 1) * w / 16, h * .45);
      c.arc((i + .5) * w / 16, h * .45, w / 32, 0, Math.PI); c.closePath(); c.fill();
    }
  });
  const largo = Math.hypot(t.vuelo, t.caida);
  const lona = new T.Mesh(new T.PlaneGeometry(ancho, largo), crearMaterialToon({ albedo: rayas, repetir: [ancho / 5.6, 1], doble: true }));
  lona.position.set((E.x0 + E.x1) / 2, t.y - t.caida / 2, z0 + t.vuelo / 2);
  lona.rotation.x = -Math.PI / 2 + Math.atan2(t.caida, t.vuelo);
  lona.name = 'toldo'; lona.userData.nombre = 'el toldo';
  const fal = new T.Mesh(new T.PlaneGeometry(ancho, .26), crearMaterialToon({ albedo: faldon, repetir: [ancho / 5.6, 1], corteAlfa: .5, doble: true }));
  fal.position.set((E.x0 + E.x1) / 2, t.y - t.caida - .13, z0 + t.vuelo);
  ctx.grupo.add(lona, fal); ctx.pulsables.push(lona);
  // Brazos del toldo
  for (const x of [E.x0, (E.x0 + E.x1) / 2, E.x1]) {
    const brazo = new T.Mesh(ctx.kit.geo.caja, ctx.kit.mat('aceroOscuro'));
    brazo.scale.set(.03, .03, largo); brazo.position.copy(lona.position).setX(x); brazo.position.y -= .03; brazo.rotation.x = lona.rotation.x + Math.PI / 2;
    ctx.grupo.add(brazo);
  }
}

/* La calle: acera, bordillo, calzada, casas vecinas y fondo pintado. */
function construirCalle(ctx) {
  const { lote, grupo } = ctx, W = ACERA.ancho, zF1 = LOCAL.z1 + MURO;
  const acera = new T.Mesh(new T.PlaneGeometry(W, ACERA.z1 - zF1).rotateX(-Math.PI / 2), crearMaterialToon({ color: PALETA.acera }));
  acera.position.set(0, 0, (zF1 + ACERA.z1) / 2);
  const bal = texturaBaldosa({ a: '#d3ccbf', b: '#cbc4b6', junta: '#9f988b' });
  acera.material = crearMaterialToon({ albedo: bal.map, normal: bal.normal, repetir: [W / 1.2, (ACERA.z1 - zF1) / 1.2], fuerzaNormal: .6 });
  lote.bloque('bordillo', -W / 2, -CALZADA.bordillo, ACERA.z1, W / 2, 0, CALZADA.z0, { contorno: false });
  const calzada = new T.Mesh(new T.PlaneGeometry(W, CALZADA.z1 - CALZADA.z0).rotateX(-Math.PI / 2), crearMaterialToon({ color: PALETA.asfalto }));
  calzada.position.set(0, -CALZADA.bordillo, (CALZADA.z0 + CALZADA.z1) / 2);
  for (let x = -W / 2 + 1; x < W / 2; x += 3) lote.caja('raya', x, -CALZADA.bordillo + .003, (CALZADA.z0 + CALZADA.z1) / 2, 1.5, .004, .14, { contorno: false });
  const enfrente = new T.Mesh(new T.PlaneGeometry(W, FONDO_CALLE.z - CALZADA.z1).rotateX(-Math.PI / 2), crearMaterialToon({ color: PALETA.acera }));
  enfrente.position.set(0, 0, (CALZADA.z1 + FONDO_CALLE.z) / 2);
  lote.bloque('bordillo', -W / 2, -CALZADA.bordillo, CALZADA.z1, W / 2, 0, CALZADA.z1 + .2, { contorno: false });
  grupo.add(acera, calzada, enfrente);

  // Casas vecinas: volumen 3D simple y fachada pintada (secundarias, sin relighting en el dibujo)
  const colores = ['#f2c14e', '#7fb7be', '#e58f65', '#b5d99c'];
  [[-1, 0], [1, 1]].forEach(([lado, i]) => {
    const x0 = lado < 0 ? LOCAL.x0 - MURO - VECINOS.ancho : LOCAL.x1 + MURO, x1 = x0 + VECINOS.ancho, alto = VECINOS.alto[i];
    lote.bloque(colores[i], x0, 0, LOCAL.z0 - MURO, x1, alto, zF1 - .02, { contorno: 'fino' });
    const cara = ilustracion(VECINOS.ancho, alto, 1024, (c, w, h) => pintarCasa(c, w, h, colores[i], i), 'fondo');
    cara.position.set((x0 + x1) / 2, alto / 2, zF1 - .01); grupo.add(cara);
  });
  // Fondo: fila de casas coloridas del barrio al otro lado de la calle (2D plano)
  const fondo = ilustracion(FONDO_CALLE.ancho, FONDO_CALLE.alto, 2048, (c, w, h) => {
    const r = azar(5); let x = 0, k = 0;
    while (x < w) {
      const cw = 110 + r() * 90, ch = h * (.45 + r() * .3);
      c.save(); c.translate(x, h - ch); pintarCasa(c, cw, ch, ['#f2c14e', '#e58f65', '#7fb7be', '#f4a6a6', '#b5d99c', '#f7e1a0', '#c4b5e0'][k % 7], k); c.restore();
      x += cw; k++;
    }
  }, 'fondo');
  fondo.position.set(0, FONDO_CALLE.alto / 2, FONDO_CALLE.z); fondo.rotation.y = Math.PI;
  grupo.add(fondo);
}

// Casa de barrio pintada: muro de color, zócalo, puertas y ventanas con rejas.
function pintarCasa(c, w, h, color, semilla) {
  const r = azar(semilla * 31 + 7);
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(0, h * .88, w, h * .12);
  c.fillStyle = '#f7f1e3'; c.fillRect(0, 0, w, h * .04);
  const pisos = h > w * 1.2 ? 3 : 2, ph = h / pisos;
  for (let p = 0; p < pisos; p++) {
    const n = Math.max(1, Math.round(w / (ph * .9)));
    for (let i = 0; i < n; i++) {
      const cx = (i + .5) * w / n, y = p * ph + ph * .25;
      const puerta = p === pisos - 1 && i === Math.floor(n / 2);
      const vw = ph * (puerta ? .32 : .36), vh = ph * (puerta ? .62 : .42);
      c.fillStyle = '#f7f1e3'; c.fillRect(cx - vw / 2 - 4, y - 4, vw + 8, vh + 8);
      c.fillStyle = puerta ? '#7a4a2a' : (r() > .5 ? '#5b7a99' : '#4b6a86'); c.fillRect(cx - vw / 2, y, vw, vh);
      if (!puerta) { c.strokeStyle = '#2f3438'; c.lineWidth = 2; for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(cx - vw / 2 + vw * k / 4, y); c.lineTo(cx - vw / 2 + vw * k / 4, y + vh); c.stroke(); } }
    }
  }
}
