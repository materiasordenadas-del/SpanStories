import test from 'node:test';
import assert from 'node:assert/strict';
import { formatear, formatearPeso, convertir, MONEDAS } from '../engine/Moneda.js';

test('pesos colombianos: punto de miles, sin decimales, redondeo a 100', () => {
  assert.equal(formatear(3480), '$3.500');
  assert.equal(formatear(12900), '$12.900');
  assert.equal(formatear(620), '$600');
});

test('las otras monedas usan su propio formato', () => {
  assert.equal(formatear(4200, 'MXN'), '$20.00');
  assert.equal(formatear(4500, 'EUR'), '0,99 €');
  assert.equal(formatear(4000, 'USD'), 'US$0.99');
  assert.equal(formatear(12000, 'USD'), 'US$2.99');
  for (const c of Object.keys(MONEDAS)) assert.ok(convertir(50, c) > 0, c);
});

test('la fruta: por libra en COP, por kilo (×2) fuera', () => {
  assert.equal(formatearPeso(2800), '$2.800 la libra');
  assert.equal(formatearPeso(2100, 'MXN'), '$20.00 el kilo');
});
