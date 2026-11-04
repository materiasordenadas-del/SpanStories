import test from 'node:test';
import assert from 'node:assert/strict';
import { ACERA, CASETA, BANCA, VALLA, CEBRA, BUS, CONJUNTO, PASO_LIBRE, cruce, xFrenteBus, farmaciaEn, FARMACIA, disposicion } from '../engine/dimensions.js';

const D = disposicion();

test('la caseta cabe en la acera, no pisa la franja táctil y deja paso libre', () => {
  assert.ok(D.zAtras >= ACERA.z0);
  assert.ok(D.techo.z1 <= ACERA.z1 - ACERA.franjaTactil + 1e-6, 'el techo invade la franja táctil');
  assert.ok(ACERA.z1 - ACERA.franjaTactil - D.techo.z1 >= PASO_LIBRE, 'no queda paso libre entre la caseta y el bordillo');
});
test('la banca queda bajo el techo, detrás de los postes delanteros', () => {
  assert.ok(D.banca.z1 < D.zFrente && BANCA.largo < CASETA.largo);
});
test('la valla va pegada al lateral derecho, sin atravesar el poste', () => {
  assert.ok(D.valla.cx - VALLA.grosor / 2 >= D.xDer + CASETA.perfil / 2);
});
test('parada después del cruce: el bus detenido no tapa la cebra', () => {
  const colaBus = xFrenteBus + BUS.largo;              // el bus va hacia -x: la cola queda al este
  assert.ok(colaBus <= CEBRA.x0 - BUS.holguraCebra + 1e-6);
  assert.ok(D.xDer + VALLA.grosor < CEBRA.x0, 'la caseta invade la cebra');
  assert.ok(D.senal.x <= D.xIzq, 'la señal debe marcar el frente del bus, al oeste de la caseta');
});
test('el paradero no queda delante de ningún local ni de la portería', () => {
  assert.ok(D.xDer < cruce.lineaOeste, 'la caseta pasaría a la manzana de la farmacia');
  const p0 = CONJUNTO.porteria - CONJUNTO.anchoPorteria / 2, p1 = CONJUNTO.porteria + CONJUNTO.anchoPorteria / 2;
  assert.ok(D.senal.x > p1 + 3 || D.caneca.x < p0 - 3, 'la portería del conjunto queda tapada por la parada');
});
test('la farmacia queda en la esquina: culata en el paramento de la transversal, fachada al fondo de la acera', () => {
  const f = farmaciaEn();
  assert.ok(Math.abs(f.x + FARMACIA.culata - cruce.lineaEste) < 1e-6);
  assert.ok(Math.abs(f.z + FARMACIA.fachada - ACERA.z0) < 1e-6);
});
