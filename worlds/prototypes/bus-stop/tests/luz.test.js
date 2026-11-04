import test from 'node:test';
import assert from 'node:assert/strict';
// El motor de la Farmacia pinta un cubo neutro con canvas al importarse: lienzo mínimo para node.
globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {} }) }) };
const { AMBIENTES, luz, NIVELES_CONTORNO } = await import('../engine/Luz25D.js');

test('los 4 ambientes (motor de la Farmacia) existen y cambian la luz compartida', () => {
  assert.deepEqual(Object.keys(AMBIENTES), ['mediodia', 'manana', 'tarde', 'noche']);
  luz.usarAmbiente('noche'); assert.equal(luz.ambiente, 'noche');
  luz.usarAmbiente('manana'); assert.equal(luz.ambiente, 'manana');
});

test('contorno: jerarquía fuerte > medio > fino y se puede apagar', () => {
  assert.ok(NIVELES_CONTORNO.fuerte > NIVELES_CONTORNO.medio && NIVELES_CONTORNO.medio > NIVELES_CONTORNO.fino);
  luz.contorno({ activo: false, grosor: 2 });
  assert.equal(luz.estado().contorno, false);
});
