import test from 'node:test';
import assert from 'node:assert/strict';
import { near } from '../engine/layout.js';
import { LOCAL, BARRA, PUERTA, FILA, VENTANA, COMUNAL, BISTRO, SILLONES, CONDIMENTOS, MENUS, ESTANTE, MURO_VERDE,
  FACHADA, VISTAS, zContrabarra, zTrasMostrador, zFrenteBarra } from '../engine/config.js';

// Medidas de PLAN.md: barra de pie 1,07 m, trabajo 0,91 m, pasillo del barista 1,0–1,2 m,
// tramo accesible ≤ 0,91 m (Tanic Design, Barcircus, Espresso Services).

test('la barra se deriva del muro del fondo: contrabarra + pasillo + mostrador', () => {
  assert.ok(near(zContrabarra(), LOCAL.z0 + BARRA.contrabarra.fondo));
  assert.ok(near(zFrenteBarra() - zContrabarra(), BARRA.pasillo + BARRA.mostrador.fondo));
  assert.ok(BARRA.pasillo >= 1.0 && BARRA.pasillo <= 1.2);
  assert.ok(near(BARRA.mostrador.alto, 1.07) && BARRA.altoCaja <= .91);
});

test('los tramos del mostrador son contiguos y cubren la barra de punta a punta', () => {
  const t = Object.values(BARRA.tramos);
  assert.ok(near(t[0][0], BARRA.x0) && near(t.at(-1)[1], BARRA.x1));
  for (let i = 1; i < t.length; i++) assert.ok(near(t[i][0], t[i - 1][1]), `tramo ${i}`);
});

test('la fila sale de la puerta y termina frente a la vitrina', () => {
  assert.ok(near(FILA.x, PUERTA.x));
  assert.ok(FILA.x > BARRA.tramos.vitrina[0] && FILA.x < BARRA.tramos.vitrina[1]);
  assert.ok(FILA.cabeza > zFrenteBarra() && FILA.cabeza - zFrenteBarra() <= .6);
});

test('pasillo libre ≥ 1,2 m entre la barra y las sillas de la mesa comunal', () => {
  const sillasNorte = COMUNAL.cz - COMUNAL.fondo / 2 - .6;
  assert.ok(sillasNorte - zFrenteBarra() >= 1.2);
});

test('la mesa comunal no invade la fila ni el rincón de sillones', () => {
  assert.ok(COMUNAL.cx + COMUNAL.largo / 2 < FILA.x - FILA.ancho / 2);
  assert.ok(COMUNAL.cz + COMUNAL.fondo / 2 + .6 <= SILLONES.z0 + 1.5);
  assert.ok(COMUNAL.cx - COMUNAL.largo / 2 > SILLONES.x1 - .7);
});

test('mesas bistró: sillas fuera de la fila y lejos de la barra de ventana', () => {
  for (const { x, z } of BISTRO.mesas) {
    assert.ok(x + .8 < FILA.x - FILA.ancho / 2, 'fila');
    assert.ok((LOCAL.z1 - VENTANA.fondo - .5) - (z + .35) >= .9, 'ventana');
  }
});

test('condimentos al oeste de la media puerta del personal, con hueco', () => {
  assert.ok(CONDIMENTOS.x1 < BARRA.x0 - .3);
  assert.ok(near(zTrasMostrador() - zContrabarra(), BARRA.pasillo));
});

test('menús dentro de la contrabarra y por debajo del techo', () => {
  assert.ok(MENUS.x0 >= BARRA.x0 && MENUS.x1 <= BARRA.x1);
  assert.ok(MENUS.y1 < 3.4 - .2);
});

test('el estante y el muro verde del muro este no se solapan', () => {
  assert.ok(ESTANTE.z0 > MURO_VERDE.z1);
  assert.ok(MURO_VERDE.z0 > zFrenteBarra());
});

test('fachada: el vidrio acaba antes de la puerta y la puerta cabe en el local', () => {
  assert.ok(FACHADA.vidrio.x0 < PUERTA.x - PUERTA.ancho / 2 - .15);
  assert.ok(PUERTA.x + PUERTA.ancho / 2 < LOCAL.x1);
});

test('las vistas tienen id único', () => {
  assert.equal(new Set(VISTAS.map(v => v.id)).size, VISTAS.length);
});
