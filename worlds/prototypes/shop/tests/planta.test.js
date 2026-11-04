import test from 'node:test';
import assert from 'node:assert/strict';
import { near } from '../engine/layout.js';
import { LOCAL, GONDOLAS, largoGondola, zSurGondola, MURAL, FRESCOS, FRIO, CAJAS, carrilCaja, ISLA, ALMACEN, PUERTA,
  ESCAPARATE, VISTAS } from '../engine/config.js';
import { PRODUCTOS, ZONAS } from '../engine/Surtido.js';

// Medidas de PLAN.md: pasillos de súper 1,30–1,50 m (Anclamar), ≥ 1,60 m en la entrada;
// carril de caja 1–1,2 m e isla ≤ 1,2 m de alto (Antdisplay).
const gx0 = x => x - GONDOLAS.ancho / 2, gx1 = x => x + GONDOLAS.ancho / 2;

test('pasillos entre góndolas y junto a la pared: al menos 1,30 m', () => {
  const xs = GONDOLAS.x;
  for (let i = 1; i < xs.length; i++) assert.ok(gx0(xs[i]) - gx1(xs[i - 1]) >= 1.3, `pasillo ${i}`);
  assert.ok(gx0(xs[0]) - (MURAL.x0 + MURAL.fondo) >= 1.3, 'pasillo de la pared de exposición');
});

test('el pasillo principal (góndola 4 → frescos) mide al menos 1,60 m', () => {
  assert.ok((FRESCOS.x1 - FRESCOS.fondo) - gx1(GONDOLAS.x.at(-1)) >= 1.6);
});

test('pasillo del fondo entre cabeceras norte y refrigeradores ≥ 1,30 m', () => {
  const norte = GONDOLAS.z0 - GONDOLAS.cabecera;
  assert.ok(norte - (FRIO.z0 + FRIO.fondo) >= 1.3);
});

test('la fila de la caja no invade las góndolas (≥ 0,9 m libres)', () => {
  const fondoFila = CAJAS.espera - CAJAS.fila;
  assert.ok(fondoFila - (zSurGondola() + GONDOLAS.cabecera) >= .9);
});

test('carril de caja entre 1 y 1,2 m; los carriles no se solapan con el cajero siguiente', () => {
  assert.ok(CAJAS.carril >= 1 && CAJAS.carril <= 1.2);
  const finCarril1 = carrilCaja(0) + CAJAS.carril / 2 + .36;            // + rack de impulso
  const cajero2 = CAJAS.x[1] - CAJAS.ancho / 2 - .8;
  assert.ok(finCarril1 <= cajero2 + .005);
});

test('isla de promoción baja (≤ 1,2 m) y el poste acaba en el borde del cartel', () => {
  assert.ok(ISLA.alto + ISLA.peldaño <= 1.2);
  const tope = ISLA.cartelY - ISLA.cartel[1] / 2 + .08;                 // regla de Mobiliario.construirIsla
  assert.ok(near(tope, ISLA.cartelY - ISLA.cartel[1] / 2 + .08));
  assert.ok(tope > ISLA.alto + ISLA.peldaño);
});

test('las gaseosas de 1,5 L caben entre baldas de góndola', () => {
  const paso = Math.min(...GONDOLAS.baldas.slice(1).map((y, i) => y - GONDOLAS.baldas[i]));
  assert.ok(PRODUCTOS.gaseosa.tam[1] <= paso - .06);
});

test('almacén: su puerta queda en el pasillo principal y los frescos terminan antes', () => {
  const p = ALMACEN.puerta;
  assert.ok(p.x - p.ancho / 2 > gx1(GONDOLAS.x.at(-1)) + .9);
  assert.ok(p.x + p.ancho / 2 < ALMACEN.x1);
  assert.ok(FRESCOS.z0 >= ALMACEN.z1 + ALMACEN.muro + .3);
});

test('fachada: la puerta cabe entre el escaparate y el muro este', () => {
  assert.ok(PUERTA.x - PUERTA.ancho / 2 > ESCAPARATE.x1);
  assert.ok(PUERTA.x + PUERTA.ancho / 2 < LOCAL.x1);
});

test('todas las vistas del recorrido caen en suelo transitable y cada id de surtido existe', () => {
  for (const v of VISTAS) assert.ok(v.x > LOCAL.x0 - 30 && v.x < LOCAL.x1 + 30, v.id);
  for (const zonas of Object.values(ZONAS)) for (const ids of Object.values(zonas)) for (const id of ids) assert.ok(PRODUCTOS[id], id);
});
