import * as T from './three.js';
import { crearMaterialToon, normalDesdeAltura } from './Luz25D.js';
import { PALETA, lienzo, ilustracion, azar, crearLoteColor } from './Kit.js';
import { LOCAL, MURO, FILA, VENTANA, COMUNAL, BISTRO, SILLONES, MURAL, MURO_VERDE, ESTANTE, COLGANTES,
  TERRAZA, PUERTA } from './config.js';
import { colgante } from './Barra.js';
import { MARCA } from './Marca.js';

/* El salón de la cafetería: dónde se sienta y espera el estudiante.
   Mesa comunal de canto vivo, sillones de cuero con alfombra, mesas bistró,
   barra de ventana con bancos altos, la fila, el mural, el muro verde, el
   estante de café en bolsa y la terraza de la acera.  Medidas en config.js. */

// Rumbo para que una silla (que mira a su -z local) mire hacia (tx, tz).
const mirarA = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

/* ── Piezas de mobiliario (una sola definición, se repiten en bucle) ───── */

function silla(lote, x, z, ry, { madera = 'madera', asiento = 'maderaClara', metal = false } = {}) {
  lote.en(x, 0, z, ry, () => {
    const pata = metal ? 'negro' : madera, g = .018;
    for (const [px, pz] of [[-.18, -.17], [.18, -.17], [-.18, .17], [.18, .17]]) lote.bloque(pata, px - g, 0, pz - g, px + g, .45, pz + g, { contorno: false });
    lote.bloque(asiento, -.21, .43, -.2, .21, .47, .2, { nombre: metal ? 'la silla de la terraza' : 'la silla' });
    for (const px of [-.18, .18]) lote.bloque(pata, px - g, .47, .15, px + g, .86, .19, { contorno: false });
    lote.bloque(asiento, -.2, .62, .16, .2, .82, .19, { contorno: 'medio' });
  });
}

function banco(lote, kit, x, z, alto = .76) {
  lote.cil('cuero', x, alto - .03, z, .36, .06, { nombre: 'el banco alto <small>(«taburete»)</small>' });
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    lote.cil('negro', x + Math.cos(a) * .12, (alto - .06) / 2, z + Math.sin(a) * .12, .025, alto - .06, { contorno: false });
  }
  lote.pieza(kit.geo.toro, 'negro', x, .3, z, .38, .38, .12, { rx: Math.PI / 2, contorno: false });
}

function sillon(lote, x, z, ry) {
  lote.en(x, 0, z, ry, () => {
    lote.bloque('cueroOscuro', -.42, .05, -.38, .42, .24, .38, { nombre: 'el sillón de cuero' });
    lote.bloque('cuero', -.32, .24, -.36, .32, .42, .26, { nombre: 'el sillón de cuero' });
    lote.bloque('cuero', -.42, .24, .22, .42, .82, .4, { contorno: 'medio' });
    for (const s of [-1, 1]) lote.bloque('cuero', s * .32, .24, -.38, s * .42, .6, .4, { contorno: 'medio' });
    for (const [px, pz] of [[-.36, -.32], [.36, -.32], [-.36, .32], [.36, .32]]) lote.cil('nogalOscuro', px, .025, pz, .05, .05, { contorno: false });
  });
}

/** Planta 2D (ESTILO §2): dos planos cruzados con albedo + normal + toon, pivote abajo-centro. */
let texturaPlanta = null;
function planta(ctx, x, y, z, alto, { hundir = .06 } = {}) {
  texturaPlanta ??= (() => {
    const map = lienzo(256, 384, (c, w, h) => pintarHojas(c, w, h, 4));
    const normal = normalDesdeAltura(map.userData.canvas, { fuerza: 2.4, suavizado: 1 });
    return { mat: crearMaterialToon({ albedo: map, normal, corteAlfa: .5, doble: true }) };
  })();
  const mat = texturaPlanta.mat;
  const g = new T.PlaneGeometry(alto * 256 / 384, alto).translate(0, alto / 2, 0);   // base = y 0
  for (const ry of [0, Math.PI / 2]) {
    const p = new T.Mesh(g, mat); p.position.set(x, y - hundir, z); p.rotation.y = ry + .4;
    p.userData.nombre = 'la planta'; ctx.grupo.add(p); ctx.pulsables.push(p);
  }
}

// Mata de hojas pintada: tallos desde abajo-centro y hojas con contorno oscuro en el albedo.
function pintarHojas(c, w, h, semilla, lleno = false) {
  const r = azar(semilla), verdes = ['#4f8a4a', '#3f7a40', '#5f9c56', '#6aa55e', '#2f6a3a'];
  const n = lleno ? Math.round(w * h / 900) : 38;
  for (let i = 0; i < n; i++) {
    const bx = lleno ? r() * w : w / 2 + (r() - .5) * w * .15, by = lleno ? r() * h : h;
    const a = lleno ? r() * Math.PI * 2 : -Math.PI / 2 + (r() - .5) * 1.9;
    const L = lleno ? 22 + r() * 26 : h * (.35 + r() * .5);
    const tx = bx + Math.cos(a) * L, ty = by + Math.sin(a) * L;
    if (!lleno) { c.strokeStyle = '#3d6b35'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo((bx + tx) / 2, (by + ty) / 2 + 10, tx, ty); c.stroke(); }
    const lw = lleno ? L * .5 : 20 + r() * 14, ll = lleno ? L * .35 : 34 + r() * 22;
    c.save(); c.translate(tx, ty); c.rotate(a + Math.PI / 2 + (r() - .5) * .6);
    c.fillStyle = verdes[Math.floor(r() * verdes.length)]; c.strokeStyle = '#24472a'; c.lineWidth = 2.2;
    c.beginPath(); c.ellipse(0, 0, lw / 2, ll, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -ll * .85); c.lineTo(0, ll * .85); c.stroke();
    c.restore();
  }
}

export function construirSalon(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const col = (x0, z0, x1, z1) => colisiones.push([x0, z0, x1, z1]);

  // ── Mesa comunal de canto vivo con sillas a ambos lados ─────────────────
  const C = COMUNAL, cx0 = C.cx - C.largo / 2, cx1 = C.cx + C.largo / 2, cz0 = C.cz - C.fondo / 2, cz1 = C.cz + C.fondo / 2;
  lote.bloque('madera', cx0, C.alto - .06, cz0, cx1, C.alto, cz1, { contorno: 'medio', nombre: 'la mesa comunal <small>(se comparte con otras personas)</small>' });
  for (let i = 0; i < 9; i++) {                                         // canto vivo: el borde ondula hacia fuera
    const x = cx0 + .2 + i * (C.largo - .4) / 8, v = .015 + .025 * Math.abs(Math.sin(i * 2.1));
    lote.bloque('madera', x - .18, C.alto - .06, cz0 - v, x + .18, C.alto - .01, cz0 + .01, { contorno: false });
    lote.bloque('madera', x - .18, C.alto - .06, cz1 - .01, x + .18, C.alto - .01, cz1 + .025 + .02 * Math.cos(i * 1.7), { contorno: false });
  }
  for (const x of [cx0 + .35, cx1 - .35]) {                             // caballetes de acero
    lote.bloque('negro', x - .03, 0, cz0 + .12, x + .03, C.alto - .06, cz0 + .18, { contorno: false });
    lote.bloque('negro', x - .03, 0, cz1 - .18, x + .03, C.alto - .06, cz1 - .12, { contorno: false });
    lote.bloque('negro', x - .03, C.alto - .1, cz0 + .12, x + .03, C.alto - .06, cz1 - .12, { contorno: false });
  }
  lote.sombra(C.cx, C.cz, C.largo + .3, C.fondo + .9);
  for (let i = 0; i < C.sillasPorLado; i++) {
    const x = cx0 + C.largo * (i + .5) / C.sillasPorLado;
    silla(lote, x, cz0 - .38, mirarA(x, cz0 - .38, x, C.cz));
    silla(lote, x, cz1 + .38, mirarA(x, cz1 + .38, x, C.cz));
  }
  col(cx0, cz0 - .6, cx1, cz1 + .6);
  for (const x of COLGANTES.comunal.x) colgante(ctx, x, COLGANTES.comunal.z, COLGANTES.comunal.y, { color: 'verde', diam: .3 });
  // Cosas sobre la mesa: una taza, un portátil cerrado, un libro
  lote.cil('ceramica', cx0 + .5, C.alto + .045, C.cz + .15, .08, .09, { nombre: 'la taza' });
  lote.cil('ceramica', cx0 + .5, C.alto + .005, C.cz + .15, .14, .01, { contorno: false });
  lote.bloque('acero', cx1 - 1.1, C.alto, C.cz - .2, cx1 - .78, C.alto + .02, C.cz + .02, { nombre: 'la computadora portátil <small>(«el ordenador portátil» en España)</small>' });
  lote.bloque('tapiz', C.cx - .1, C.alto, C.cz - .05, C.cx + .12, C.alto + .03, C.cz + .12, { nombre: 'el libro' });

  // ── Mesas bistró (dos sillas enfrentadas, lámpara encima) ───────────────
  for (const { x, z } of BISTRO.mesas) {
    lote.cil('encimera', x, BISTRO.alto - .015, z, BISTRO.diam, .03, { nombre: 'la mesa redonda' });
    lote.cil('negro', x, (BISTRO.alto - .03) / 2, z, .05, BISTRO.alto - .03, { contorno: false });
    lote.cil('negro', x, .01, z, .42, .02, { contorno: false });
    for (const s of [-1, 1]) silla(lote, x + s * .55, z, mirarA(x + s * .55, z, x, z));
    lote.sombra(x, z, 1.5, 1.0);
    col(x - .8, z - .35, x + .8, z + .35);
    colgante(ctx, x, z, COLGANTES.bistro.y, { color: 'cobre', diam: .26, intensidad: .7, radio: 1.8 });
  }

  // ── Rincón de sillones: alfombra, dos sillones, mesita y lámpara de pie ─
  const S = SILLONES, sx = (S.x0 + S.x1) / 2, sz = (S.z0 + S.z1) / 2;
  const alfombra = new T.Mesh(new T.PlaneGeometry(S.x1 - S.x0 - .2, S.z1 - S.z0 - .2).rotateX(-Math.PI / 2),
    crearMaterialToon({ albedo: lienzo(512, 512, pintarAlfombra) }));
  alfombra.position.set(sx, .006, sz); alfombra.name = 'alfombra'; alfombra.userData.nombre = 'la alfombra <small>(«el tapete» en México y Colombia)</small>';
  grupo.add(alfombra); ctx.pulsables.push(alfombra);
  sillon(lote, S.x0 + .55, sz, mirarA(S.x0 + .55, sz, sx, sz));
  sillon(lote, S.x1 - .5, sz, mirarA(S.x1 - .5, sz, sx, sz));
  lote.cil('nogal', sx, .43, sz, S.mesita, .04, { nombre: 'la mesita de centro' });
  lote.cil('nogalOscuro', sx, .21, sz, .08, .42, { contorno: false });
  lote.cil('ceramica', sx + .1, .5, sz, .08, .09, { nombre: 'la taza' });
  lote.sombra(sx, sz, 2.4, 1.4);
  col(S.x0, sz - .5, S.x1 - .05, sz + .5);
  const lpx = S.x0 + .25, lpz = S.z1 - .2;                                // lámpara de pie
  lote.cil('negro', lpx, .015, lpz, .3, .03, { contorno: false });
  lote.cil('negro', lpx, .8, lpz, .025, 1.55, { contorno: false });
  lote.cono('crema', lpx, 1.62, lpz, .4, .3, { nombre: 'la lámpara de pie' });
  lote.esfera(kit.emisivo('#fff0c8'), lpx, 1.49, lpz, .18, .08, .18);
  ctx.lamparas.push({ pos: [lpx, 1.3, lpz], color: '#ffe3b0', intensidad: .8, radio: 2 });
  planta(ctx, S.x0 + .3, .38, S.z0 - .05, 1.3);
  lote.cil('maceta', S.x0 + .3, .19, S.z0 - .05, .44, .38, { nombre: 'la maceta', lados: 16 });

  // ── Barra de la ventana con bancos altos ───────────────────────────────
  const V = VENTANA, vz0 = LOCAL.z1 - V.fondo;
  lote.bloque('madera', V.x0, V.alto - .05, vz0, V.x1, V.alto, LOCAL.z1 - .02, { contorno: 'medio', nombre: 'la barra de la ventana' });
  for (let x = V.x0 + .3; x < V.x1; x += 1.6) lote.bloque('negro', x - .02, 0, LOCAL.z1 - .1, x + .02, V.alto - .05, LOCAL.z1 - .04, { contorno: false });
  const paso = (V.x1 - V.x0) / V.bancos;
  for (let i = 0; i < V.bancos; i++) banco(lote, kit, V.x0 + paso * (i + .5), vz0 - .32);
  col(V.x0, vz0 - .5, V.x1, LOCAL.z1);
  for (const x of COLGANTES.ventana.x) colgante(ctx, x, COLGANTES.ventana.z, COLGANTES.ventana.y, { color: 'nogal', diam: .28, intensidad: .7, radio: 2 });
  // Tarjeta del wifi sobre la barra
  const wifi = ilustracion(.22, .14, 512, pintarWifi, 'cartel', { doble: true });
  wifi.position.set(V.x1 - .2, V.alto + .07, vz0 + .2); wifi.rotation.y = Math.PI + .25; wifi.rotation.x = .12;
  wifi.userData.nombre = 'la clave del wifi <small>(«la contraseña»)</small>';
  lote.bloque('nogal', V.x1 - .32, V.alto, vz0 + .16, V.x1 - .08, V.alto + .015, vz0 + .24, { contorno: false });
  grupo.add(wifi); ctx.pulsables.push(wifi);

  // ── La fila: marcas en el piso y poste con el cartel ───────────────────
  for (let z = FILA.cabeza; z < FILA.cartel - .2; z += .8) lote.cil('verde', FILA.x, .003, z, .32, .004, { contorno: false, nombre: 'la marca de la fila <small>(«la cola» en España y Argentina)</small>' });
  const px = FILA.x - FILA.ancho / 2 - .1;
  lote.cil('negro', px, .015, FILA.cartel, .32, .03, { contorno: false });
  lote.cil('negro', px, .6, FILA.cartel, .04, 1.2, { contorno: false });
  const fila = ilustracion(.5, .36, 512, (c, w, h) => {
    c.fillStyle = PALETA.crema; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h * .12);
    c.fillStyle = PALETA.verde; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${h * .2}px Georgia, serif`; c.fillText('Haga su fila', w / 2, h * .38); c.fillText('aquí', w / 2, h * .6);
    c.font = `${h * .1}px system-ui, sans-serif`; c.fillStyle = '#6e4a2e'; c.fillText('↑ y pida en caja', w / 2, h * .83);
  }, 'cartel', { doble: true });
  fila.position.set(px, 1.35, FILA.cartel); fila.userData.nombre = '«Haga su fila aquí» <small>(«Haga la cola» en España)</small>';
  grupo.add(fila); ctx.pulsables.push(fila);
  col(px - .18, FILA.cartel - .18, px + .18, FILA.cartel + .18);

  // ── Mural del muro oeste (ilustración, sin relighting) ──────────────────
  const M = MURAL;
  const mural = ilustracion(M.z1 - M.z0, M.y1 - M.y0, 2048, pintarMural, 'fondo');
  mural.position.set(LOCAL.x0 + .006, (M.y0 + M.y1) / 2, (M.z0 + M.z1) / 2); mural.rotation.y = Math.PI / 2;
  mural.userData.nombre = 'el mural <small>(pintado a mano por un artista local)</small>';
  grupo.add(mural); ctx.pulsables.push(mural);

  // ── Muro verde (este): follaje denso en un marco de madera ─────────────
  const G = MURO_VERDE, gw = G.z1 - G.z0, gh = G.y1 - G.y0;
  const hojas = lienzo(1024, Math.round(1024 * gh / gw), (c, w, h) => { c.fillStyle = '#2f5a33'; c.fillRect(0, 0, w, h); pintarHojas(c, w, h, 9, true); });
  const verde = new T.Mesh(new T.PlaneGeometry(gw, gh), crearMaterialToon({ albedo: hojas, normal: normalDesdeAltura(hojas.userData.canvas, { fuerza: 3, suavizado: 1 }), fuerzaNormal: 1 }));
  verde.position.set(LOCAL.x1 - .06, (G.y0 + G.y1) / 2, (G.z0 + G.z1) / 2); verde.rotation.y = -Math.PI / 2;
  verde.userData.nombre = 'el muro verde <small>(«jardín vertical»)</small>';
  grupo.add(verde); ctx.pulsables.push(verde);
  lote.bloque('nogal', LOCAL.x1 - .08, G.y0 - .06, G.z0 - .06, LOCAL.x1, G.y1 + .06, G.z0, { contorno: 'medio' });
  lote.bloque('nogal', LOCAL.x1 - .08, G.y0 - .06, G.z1, LOCAL.x1, G.y1 + .06, G.z1 + .06, { contorno: 'medio' });
  lote.bloque('nogal', LOCAL.x1 - .1, G.y0 - .06, G.z0, LOCAL.x1, G.y0, G.z1, { contorno: 'medio' });
  lote.bloque('nogal', LOCAL.x1 - .1, G.y1, G.z0, LOCAL.x1, G.y1 + .06, G.z1, { contorno: 'medio' });

  // ── Estante de café en bolsa, termos y tazas (muro este, junto a la fila) ─
  const E = ESTANTE, ex0 = LOCAL.x1 - E.fondo;
  lote.bloque('nogal', ex0, 0, E.z0, LOCAL.x1, .1, E.z1, { contorno: 'medio' });
  for (const z of [E.z0, E.z1]) lote.bloque('nogal', ex0, 0, z - .02, LOCAL.x1, E.alto, z + .02, { contorno: 'medio' });
  for (const y of E.baldas) lote.bloque('maderaClara', ex0, y - .03, E.z0, LOCAL.x1, y, E.z1, { contorno: 'medio', nombre: 'el estante' });
  const cosas = crearLoteColor(kit), m = new T.Matrix4(), r = azar(21);
  E.baldas.forEach((y, b) => {
    for (let z = E.z0 + .14; z < E.z1 - .1; z += .2) {
      const tipo = b < 2 ? 'bolsa' : (r() > .5 ? 'termo' : 'tazaVenta');
      if (tipo === 'bolsa') { m.compose(new T.Vector3(ex0 + .18, y + .13, z), new T.Quaternion(), new T.Vector3(.08, .26, .14)); cosas.poner(kit.geo.caja, m.clone(), ['#00704a', '#b87333', '#6e4a2e', '#c4495a', '#d9a441'][Math.floor(r() * 5)], { id: 'bolsa', nivel: 'medio' }); }
      else if (tipo === 'termo') { m.compose(new T.Vector3(ex0 + .18, y + .11, z), new T.Quaternion(), new T.Vector3(.08, .22, .08)); cosas.poner(kit.geo.cil16, m.clone(), ['#00704a', '#f3ead8', '#2a2c2f', '#b87333'][Math.floor(r() * 4)], { id: 'termo', nivel: 'medio' }); }
      else { m.compose(new T.Vector3(ex0 + .18, y + .05, z), new T.Quaternion(), new T.Vector3(.1, .1, .1)); cosas.poner(kit.geo.cil16, m.clone(), ['#f4f1ea', '#00704a', '#e9b9a4'][Math.floor(r() * 3)], { id: 'taza', nivel: 'medio' }); }
    }
  });
  cosas.construir(grupo, ctx.pulsables);
  col(ex0, E.z0 - .02, LOCAL.x1, E.z1 + .02);
  const llevar = ilustracion(1.2, .3, 512, (c, w, h) => {
    c.fillStyle = PALETA.crema; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${h * .42}px Georgia, serif`; c.fillText('Café para llevar a casa', w / 2, h * .55);
  }, 'cartel');
  llevar.position.set(LOCAL.x1 - .01, E.alto + .28, (E.z0 + E.z1) / 2); llevar.rotation.y = -Math.PI / 2;
  llevar.userData.nombre = 'el café en grano y molido para llevar a casa';
  grupo.add(llevar); ctx.pulsables.push(llevar);

  // Planta junto a la puerta, por dentro
  planta(ctx, PUERTA.x + PUERTA.ancho / 2 + .55, .42, LOCAL.z1 - .45, 1.4);
  lote.cil('maceta', PUERTA.x + PUERTA.ancho / 2 + .55, .21, LOCAL.z1 - .45, .46, .42, { nombre: 'la maceta' });
  col(PUERTA.x + PUERTA.ancho / 2 + .3, LOCAL.z1 - .7, PUERTA.x + PUERTA.ancho / 2 + .8, LOCAL.z1);

  construirTerraza(ctx);
}

/* Terraza en la acera: mesas con sombrilla y jardineras que la separan de la calle. */
function construirTerraza(ctx) {
  const { lote, colisiones } = ctx, Tz = TERRAZA;
  for (const x of Tz.mesas) {
    const z = Tz.z;
    lote.cil('negro', x, .73, z, Tz.diam, .03, { nombre: 'la mesa de la terraza' });
    lote.cil('negro', x, .36, z, .05, .72, { contorno: false });
    lote.cil('negro', x, .01, z, .45, .02, { contorno: false });
    for (const s of [-1, 1]) silla(lote, x + s * .6, z, mirarA(x + s * .6, z, x, z), { metal: true, asiento: 'verde' });
    lote.cil('crema', x, 1.25, z, .04, 2.5, { contorno: false });                         // mástil
    lote.cono('verde', x, 2.45, z, Tz.sombrilla, .45, { nombre: 'la sombrilla <small>(«el parasol»)</small>' });
    lote.cil('cobre', x, 2.7, z, .08, .06);
    lote.sombra(x, z, 1.9, 1.1);
    colisiones.push([x - .9, z - .4, x + .9, z + .4]);
  }
  for (const x of Tz.jardineras.x) {
    const z = Tz.jardineras.z;
    lote.bloque('maceta', x - .5, 0, z - .2, x + .5, .45, z + .2, { contorno: 'medio', nombre: 'la jardinera' });
    lote.bloque('nogalOscuro', x - .46, .4, z - .16, x + .46, .44, z + .16, { contorno: false });
    for (const dx of [-.25, .25]) planta(ctx, x + dx, .45, z, 1.0, { hundir: .08 });
    colisiones.push([x - .5, z - .2, x + .5, z + .2]);
  }
  // Pizarra de pie con la sugerencia del día, junto a la puerta
  const px = PUERTA.x + PUERTA.ancho / 2 + .7, pz = LOCAL.z1 + MURO + .6;
  lote.en(px, 0, pz, -.25, () => {
    lote.bloque('nogal', -.3, 0, -.05, -.27, 1.0, .05, { contorno: false });
    lote.bloque('nogal', .27, 0, -.05, .3, 1.0, .05, { contorno: false });
  });
  const pizarra = ilustracion(.54, .72, 512, (c, w, h) => {
    c.fillStyle = '#233a31'; c.fillRect(0, 0, w, h); c.strokeStyle = '#b87333'; c.lineWidth = 10; c.strokeRect(0, 0, w, h);
    c.fillStyle = '#f3ead8'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${h * .08}px Georgia, serif`; c.fillText('Sugerencia', w / 2, h * .14); c.fillText('del día', w / 2, h * .24);
    c.font = `${h * .065}px system-ui, sans-serif`; c.fillStyle = '#e9d7b3';
    ['Latte de canela', '+', 'rol de canela', '', '¡Pasa y pruébalo!'].forEach((t, i) => c.fillText(t, w / 2, h * (.42 + i * .1)));
  }, 'cartel', { doble: true });
  pizarra.position.set(px, .62, pz); pizarra.rotation.y = -.25; pizarra.rotation.x = -.12;
  pizarra.userData.nombre = 'la pizarra <small>(«el tablero» en algunos países)</small>';
  ctx.grupo.add(pizarra); ctx.pulsables.push(pizarra);
  colisiones.push([px - .35, pz - .2, px + .35, pz + .2]);
}

/* ── Ilustraciones ─────────────────────────────────────────────────────── */

function pintarAlfombra(c, w, h) {
  c.fillStyle = '#b8563f'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#e8d6b4'; c.fillRect(24, 24, w - 48, h - 48);
  c.fillStyle = '#b8563f'; c.fillRect(40, 40, w - 80, h - 80);
  c.fillStyle = '#00704a';
  for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) {
    const x = 80 + i * (w - 160) / 4, y = 80 + k * (h - 160) / 4;
    c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x + 26, y); c.lineTo(x, y + 26); c.lineTo(x - 26, y); c.closePath(); c.fill();
  }
  c.fillStyle = '#e8d6b4';
  for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) { const x = 80 + i * (w - 160) / 4, y = 80 + k * (h - 160) / 4; c.fillRect(x - 6, y - 6, 12, 12); }
}

function pintarWifi(c, w, h) {
  c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h * .14);
  c.fillStyle = '#2a2c2f'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `700 ${h * .15}px system-ui, sans-serif`; c.fillText('Wifi gratis', w / 2, h * .32);
  c.font = `${h * .11}px system-ui, sans-serif`; c.fillText(`Red: ${MARCA.wifi}`, w / 2, h * .56);
  c.fillText('Clave: cafecito2026', w / 2, h * .76);
}

// Mural: cordillera, cafetal con cerezas rojas, un colibrí y el sol.
function pintarMural(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f6c98a'); g.addColorStop(1, '#f3e2c0');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f08a4b'; c.beginPath(); c.arc(w * .72, h * .28, h * .14, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f7b267'; c.beginPath(); c.arc(w * .72, h * .28, h * .1, 0, Math.PI * 2); c.fill();
  const monte = (color, base, picos, sem) => {
    const r = azar(sem); c.fillStyle = color; c.beginPath(); c.moveTo(0, h);
    for (let i = 0; i <= picos; i++) c.lineTo(i * w / picos, h * base - r() * h * .22);
    c.lineTo(w, h); c.closePath(); c.fill();
  };
  monte('#7e9a8f', .52, 6, 2); monte('#4f7d69', .64, 8, 5); monte('#2f5f48', .78, 10, 8);
  // cafetos en hileras
  const r = azar(13);
  for (let fila = 0; fila < 3; fila++) for (let i = 0; i < 9; i++) {
    const x = (i + .5 + (fila % 2) * .5) * w / 9, y = h * (.78 + fila * .09), s = h * (.07 + fila * .02);
    c.fillStyle = fila % 2 ? '#3f7a40' : '#4f8a4a';
    c.beginPath(); c.ellipse(x, y, s * 1.2, s, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c93b35';
    for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + (r() - .5) * s * 1.6, y + (r() - .5) * s, s * .12, 0, Math.PI * 2); c.fill(); }
  }
  // colibrí
  c.save(); c.translate(w * .3, h * .3); c.scale(h / 500, h / 500);
  c.fillStyle = '#1f7a6a'; c.beginPath(); c.ellipse(0, 0, 40, 18, -.3, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2aa38a'; c.beginPath(); c.moveTo(-5, -8); c.quadraticCurveTo(-30, -80, 20, -70); c.quadraticCurveTo(10, -30, 10, -8); c.fill();
  c.fillStyle = '#c93b35'; c.beginPath(); c.arc(28, -10, 11, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#2a2c2f'; c.lineWidth = 4; c.beginPath(); c.moveTo(36, -12); c.lineTo(80, -24); c.stroke();
  c.fillStyle = '#16432f'; c.beginPath(); c.moveTo(-38, 8); c.lineTo(-80, 30); c.lineTo(-70, 4); c.fill();
  c.restore();
  // flor
  c.save(); c.translate(w * .45, h * .42);
  c.fillStyle = '#e8579a'; for (let k = 0; k < 6; k++) { c.beginPath(); c.ellipse(Math.cos(k) * 18, Math.sin(k) * 18, 16, 9, k, 0, Math.PI * 2); c.fill(); }
  c.fillStyle = '#f2d64b'; c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill(); c.restore();
  c.fillStyle = '#16432f'; c.font = `italic 600 ${h * .06}px Georgia, serif`; c.textAlign = 'left';
  c.fillText('Del cafetal a tu taza', w * .04, h * .1);
  c.strokeStyle = '#6e4a2e'; c.lineWidth = 14; c.strokeRect(0, 0, w, h);
}
