// Compatibility adapter: the existing implementation and its public imports stay intact.
export { luz, AMBIENTES, crearMaterialToon, crearMaterialContorno } from '../../Luz25D.js';
export const Luz25D = Object.freeze({
  id: 'Luz25D', nombre: 'Luz25D', descripcion: 'Cartoon original de SpanStories.',
  controles: [], crearUniformes: () => ({}), fragmento: shader => shader,
  contorno: shader => shader, trazo: 1, cielo: null,
});
