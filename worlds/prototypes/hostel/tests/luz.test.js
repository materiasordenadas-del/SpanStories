import test from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENTES, luz, NIVELES_CONTORNO } from '../engine/Luz25D.js';

test('los 5 ambientes existen y cambian la luz compartida', () => {
  assert.deepEqual(Object.keys(AMBIENTES), ['manana', 'mediodia', 'tarde', 'nublado', 'noche']);
  luz.usarAmbiente('noche'); assert.equal(luz.ambiente, 'noche');
  luz.usarAmbiente('manana'); assert.equal(luz.ambiente, 'manana');
});

test('contorno: jerarquía fuerte > medio > fino y se puede apagar', () => {
  assert.ok(NIVELES_CONTORNO.fuerte > NIVELES_CONTORNO.medio && NIVELES_CONTORNO.medio > NIVELES_CONTORNO.fino);
  luz.contorno({ activo: false, grosor: 2 });
  assert.equal(luz.estado().contorno, false);
});
