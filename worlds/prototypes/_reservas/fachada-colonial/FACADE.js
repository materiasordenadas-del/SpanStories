// Fachada colonial caribeña, vista frontal desde la acera (coordenadas del área fachada:
// plano del muro en z = 0, calle hacia +z). Pisos de 4,2 m como el interior.
export const FACADE = {
  width: 48, floors: 4, plinth: .7, cornice: .5, eave: 1.3,
  portal: { width: 15, depth: 1.1, height: 9.3 },
  arches: { main: { width: 4, height: 5.2 }, side: { width: 2.8, height: 4.3, x: 4.7 } },
  canopy: { width: 7, depth: 4.2, y: 5.75 },
  bays: [10.5, 15.5, 20.5], centerBays: [-4.7, 0, 4.7],
  window: { width: 1.6, height: 2.6, sill: .5 }, balcony: { width: 3.2, depth: .95 },
  sidewalk: 7.5, curb: .15, street: 8, wingSidewalk: 80
};
