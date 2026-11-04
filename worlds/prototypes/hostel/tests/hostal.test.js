import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE as H, FRONT as F, BUNK as B, STAIR as E, DOOR, POOL, PRECIOS } from '../engine/dimensions.js';
import { rect, restar, dentro, solapan, ancho, fondo, cuarto, cuartos, vanos, columnas, PATIO, PISCINA, literas, holguraLitera, escalera, huecoEscalera,
  portadas, tramosMuroCalle, tejadillo, salasCubiertas, areasCaminables, CARAS, GALERIA } from '../engine/Planta.js';
import { formatear } from '../engine/Moneda.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
const area = rs => rs.reduce((n, r) => n + ancho(r) * fondo(r), 0);

test('muro de calle: ENTRADA a la derecha (+x) y SALIDA a la izquierda (−x), vistas desde la calle', () => {
  const p = Object.fromEntries(portadas().map(x => [x.id, x]));
  assert.ok(p.entrada.x > 0 && p.salida.x < 0);
  near(p.entrada.x, -p.salida.x);                         // simétricas respecto al eje del portón
  for (const g of Object.values(p)) assert.ok(Math.abs(g.x) + F.gate.clear / 2 + F.gate.pier < F.span / 2, 'la portada cabe en el muro');
  // Los tramos de muro llegan justo a los pilares: sin rendijas ni solapes.
  const t = tramosMuroCalle(); near(t[0].x0, -F.span / 2); near(t.at(-1).x1, F.span / 2);
  near(t[0].x1, p.salida.x - F.gate.clear / 2 - F.gate.pier); near(t[1].x0, p.salida.x + F.gate.clear / 2 + F.gate.pier);
  for (const tr of t) for (const x of tr.pilastras) assert.ok(x > tr.x0 && x < tr.x1);
});

test('una sola habitación real; muchas puertas con número/rótulo únicos', () => {
  const V = vanos(), puertas = V.filter(v => v.tipo === 'puerta');
  assert.equal(V.filter(v => v.real).length, 1);
  assert.equal(V.find(v => v.real).id, 'puerta-dorm1');
  assert.ok(puertas.length >= 14, 'muchas puertas: ' + puertas.length);
  const ids = puertas.map(v => v.id); assert.equal(new Set(ids).size, ids.length);
  const rot = puertas.filter(v => v.numero && !['WC'].includes(v.numero)).map(v => v.numero); assert.equal(new Set(rot).size, rot.length);
  // Ningún par de vanos del mismo muro y planta se solapa (contando el marco).
  for (const a of V) for (const b of V) if (a !== b && a.muro === b.muro && Math.abs(a.eje - b.eje) < 1e-6 && (a.planta || 0) === (b.planta || 0))
    assert.ok(Math.abs(a.pos - b.pos) >= (a.ancho + b.ancho) / 2 + 2 * DOOR.frame, `${a.id} y ${b.id} se solapan`);
});

test('las puertas de galería abren a la galería (entre sus muros) y a su cuarto', () => {
  for (const v of vanos().filter(v => v.cuarto)) {
    const c = cuarto(v.cuarto, v.planta || 0).rect, [a, b] = v.muro === 'x' ? [c.z0, c.z1] : [c.x0, c.x1];
    assert.ok(v.pos - v.ancho / 2 - DOOR.frame >= a - 1e-6 && v.pos + v.ancho / 2 + DOOR.frame <= b + 1e-6, v.id + ' cabe en la pared de su cuarto');
    if (v.muro === 'x' && Math.abs(Math.abs(v.eje) - H.sideWallX) < 1e-6) assert.ok(v.pos < CARAS.front[1] && v.pos > CARAS.rear[0], v.id + ' da a la galería');
    if (v.muro === 'z') assert.ok(Math.abs(v.pos) + v.ancho / 2 < CARAS.side[0], v.id + ' da a la galería');
  }
});

test('literas del Dormitorio 1: 8 camas, holguras de hostal y pasillo central', () => {
  const L = literas(), r = cuarto('dorm1').rect;
  assert.equal(L.length, 4);
  const h = holguraLitera(); assert.ok(h >= .76 && h <= .91, 'entre colchones: ' + h);
  assert.ok(4 - H.slab - (B.upperDeck + B.mattress) >= .76, 'colchón alto → techo');
  assert.ok(B.lowerDeck - .14 >= B.locker.height, 'el casillero cabe bajo el larguero');
  for (const a of L) { assert.ok(dentro(r, a.x0, a.z0) && dentro(r, a.x1, a.z1), a.id + ' dentro del cuarto'); for (const b of L) if (a !== b) assert.ok(!solapan(a, b)); }
  const pasillo = Math.min(...L.filter(l => l.pasillo < 0).map(l => l.x0)) - Math.max(...L.filter(l => l.pasillo > 0).map(l => l.x1));
  assert.ok(pasillo >= 1.2, 'pasillo ' + pasillo);
  const puerta = vanos().find(v => v.id === 'puerta-dorm1');
  for (const l of L) assert.ok(l.z1 <= puerta.pos - puerta.ancho / 2 - DOOR.frame, 'la puerta no choca con ' + l.id);
});

test('escalera en U: 24 contrahuellas por planta y cabe en su cuarto', () => {
  near(E.rise * 2 * E.perFlight, H.floorHeight);
  const s = escalera(0), c = cuarto('escalera').rect;
  assert.ok(E.run >= .26 && E.rise <= .18, 'peldaño cómodo');
  assert.ok(fondo(s.descanso) >= E.width, 'el descansillo es al menos tan hondo como el tramo es ancho');
  for (const p of [...s.pasos, s.descanso]) assert.ok(p.x0 >= c.x0 - 1e-6 && p.x1 <= c.x1 + 1e-6 && p.z0 >= c.z0 - 1e-6 && p.z1 <= c.z1 + 1e-6);
  near(s.pasos.filter(p => p.tramo === 'B').at(-1).y + E.rise, H.floorHeight);   // el último peldaño sube a la planta alta
  assert.ok(s.xb[0] - c.x0 >= .9, 'paso libre junto al tramo B para llegar al A');
});

test('piscina dentro del patio, lejos de las columnas; eje del zaguán libre de columnas', () => {
  const m = 1; assert.ok(PISCINA.x0 - PATIO.x0 >= m && PATIO.x1 - PISCINA.x1 >= m && PISCINA.z0 - PATIO.z0 >= m && PATIO.z1 - PISCINA.z1 >= m);
  near(ancho(PISCINA), POOL.width); near(fondo(PISCINA), POOL.length);
  // Eje zaguán → patio libre: ninguna columna en x = 0 y al menos 1,6 m de paso entre las dos centrales (con su plinto).
  const C = columnas(); assert.equal(C.length, 12);
  const xs = C.filter(([, z]) => z === H.patio.front).map(([x]) => Math.abs(x)), libre = 2 * Math.min(...xs) - (.36 + .14);
  assert.ok(xs.every(x => x > 1e-6) && libre >= 1.6, 'paso libre ' + libre);
});

test('tejadillo: cae hacia el patio y deja altura bajo la viga de la galería alta', () => {
  const t = tejadillo(); assert.ok(t.yBajo < t.yColumna && t.yColumna < t.yAlto && t.yAlto < H.roofY);
  assert.ok(t.yColumna - H.floorHeight - .5 > 2.4, 'paso libre bajo la viga');
});

test('luz: galerías y cuartos bajo techo; patio y calle al sol', () => {
  const S = salasCubiertas(), cubierto = (x, z) => S.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  assert.ok(!cubierto(0, -14) && !cubierto(0, 3) && !cubierto(0, 8));
  assert.ok(cubierto(-4.5, -14) && cubierto(0, -8) && cubierto(-7, -3) && cubierto(5, -24));
  assert.ok(!cubierto(0, .01), 'la cara exterior de la fachada recibe sol');
});

test('áreas caminables: se cruza por rejas y portón; no se pisa el vacío del patio ni la piscina', () => {
  const en = (pl, x, z) => areasCaminables(pl).some(a => dentro(a, x, z));
  for (const [x, z] of [[F.gate.x, F.wallZ], [-F.gate.x, F.wallZ], [0, -e2()], [0, -8], [-7.6, -10]]) assert.ok(en(0, x, z), `PB (${x}, ${z})`);
  assert.ok(!en(0, 0, POOL.centerZ), 'piscina');
  assert.ok(!en(1, 0, -14) && en(1, -4.4, -14), 'galería alta sin vacío');
  assert.ok(!en(2, 0, -14) && !en(2, -4.4, -14) && en(2, -7.6, -14) && en(2, 0, -3), 'azotea sin hueco del patio');
  assert.ok(!en(2, 8, -10), 'la caseta no se pisa');
  function e2() { return H.wall.ext / 2; }
});

test('restar(): el área resultante es base − huecos', () => {
  const base = rect(-10, -26, 10, 0), h = [huecoEscalera(), PATIO];
  near(area(restar(base, h)), area([base]) - area(h), 1e-9);
  near(area(restar(base, [GALERIA])), area([base]) - area([GALERIA]), 1e-9);
});

test('pizarra: todos los precios se escriben en las cuatro monedas', () => {
  for (const p of PRECIOS) for (const m of ['COP', 'USD', 'EUR', 'MXN']) assert.ok(p.cop === 0 || /\d/.test(formatear(p.cop, m)), p.id + ' ' + m);
  assert.equal(formatear(55000, 'COP'), '$55.000');
});

test('cuartos de cada planta: sin solapes y dentro de la casa', () => {
  for (const pl of [0, 1]) { const cs = cuartos(pl); for (const a of cs) { assert.ok(a.rect.x0 >= -H.width / 2 && a.rect.x1 <= H.width / 2 && a.rect.z0 >= -H.depth && a.rect.z1 <= 0); for (const b of cs) if (a !== b) assert.ok(!solapan(a.rect, b.rect), a.id + ' / ' + b.id); } }
});
