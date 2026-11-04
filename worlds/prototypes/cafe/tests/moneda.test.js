import test from 'node:test';
import assert from 'node:assert/strict';
import { formatear, convertir, MONEDAS } from '../engine/Moneda.js';
import { precioPedido, describirPedido, BEBIDAS, TAMANOS } from '../engine/Carta.js';

test('formatos de precio por moneda', () => {
  assert.equal(formatear(3.95, 'USD'), 'US$4.00');
  assert.equal(formatear(3.95, 'MXN'), '$70');
  assert.equal(formatear(3.95, 'COP'), '$15.800');
  assert.equal(formatear(3.95, 'EUR'), '3,75 €');
  assert.match(formatear(3.95, 'PEN'), /^S\/ \d+\.\d0$/);
});

test('todas las monedas dan precios positivos y crecientes con el tamaño', () => {
  for (const m of Object.keys(MONEDAS)) for (const b of BEBIDAS.filter(b => !b.sinTamano)) {
    const p = TAMANOS.map(t => convertir(b.precio + t.extra, m));
    assert.ok(p[0] > 0 && p[0] <= p[1] && p[1] <= p[2], `${b.id} ${m}`);
  }
});

test('pedido: leche vegetal suma y la descripción concuerda', () => {
  const p = { bebida: 'latte', tamano: 'mediano', leche: 'avena' };
  assert.ok(precioPedido(p) > precioPedido({ ...p, leche: 'entera' }));
  assert.equal(describirPedido(p), 'un latte mediano con leche de avena');
  assert.equal(describirPedido({ bebida: 'limonada', tamano: 'chico' }), 'una limonada chica');
  assert.equal(describirPedido({ bebida: 'espresso', tamano: 'grande' }), 'un espresso');
});
