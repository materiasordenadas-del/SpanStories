import * as T from '../engine/three.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
import { caja, cilindro, barra } from './Piezas.js';
import { materialTextura, planoSuelo, uvMetros } from './Texturas.js';
import { COLORS as C, POOL as P } from '../engine/dimensions.js';

// Piscina pequeña hundida en el patio. `r` = rectángulo del vaso (Planta.PISCINA); `y` = cota del patio.
// El suelo del patio deja su hueco (Planta.restar); aquí van el vaso, el agua y el remate de piedra.
export function crearPiscina(r, y) {
  const root = new T.Group(), fondoY = y - P.depth, azulejo = materialTextura('azulejo', { bandas: 2 });
  const agua = crearMaterialToon({ albedo: materialTextura('agua').uniforms.uAlbedo.value, transparente: true, opacidad: .86, bandas: 2 });
  root.add(planoSuelo(r, fondoY, azulejo));
  // Paredes del vaso: planos mirando hacia dentro, con UV en metros (las juntas siguen en línea).
  const W = r.x1 - r.x0, L = r.z1 - r.z0, h = y - fondoY, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  for (const [ancho, x, z, rot] of [[W, cx, r.z0, 0], [W, cx, r.z1, Math.PI], [L, r.x0, cz, Math.PI / 2], [L, r.x1, cz, -Math.PI / 2]]) {
    const g = new T.PlaneGeometry(ancho, h); const m = new T.Mesh(g, azulejo); m.position.set(x, fondoY + h / 2, z); m.rotation.y = rot;
    uvMetros(g.translate(0, fondoY + h / 2, 0), azulejo.userData.metros, 'xy'); g.translate(0, -(fondoY + h / 2), 0); m.name = 'pared-vaso'; root.add(m);
  }
  // Franja de azulejo oscuro en la línea del agua.
  const yAgua = y + .03 - P.waterBelow;
  for (const [w, d, x, z] of [[W, .02, cx, r.z0 + .01], [W, .02, cx, r.z1 - .01], [.02, L, r.x0 + .01, cz], [.02, L, r.x1 - .01, cz]]) caja(root, 'franja', w, .12, d, C.zocalo, x, yAgua + .02, z, false);
  const sup = planoSuelo(r, yAgua, materialTextura('agua')); sup.material = agua; sup.name = 'agua'; root.add(sup);
  // Remate de piedra (coronación) alrededor, ligeramente sobre el patio.
  const k = P.coping;
  for (const [w, d, x, z] of [[W + 2 * k, k, cx, r.z0 - k / 2], [W + 2 * k, k, cx, r.z1 + k / 2], [k, L, r.x0 - k / 2, cz], [k, L, r.x1 + k / 2, cz]]) caja(root, 'coronacion', w, .06, d, C.piedra, x, y + .03, z, 'fino');
  return root;
}
/** Escalerilla de acero inoxidable (pasamanos curvos y peldaños). Se coloca en el borde, frente +z hacia el agua. */
export function crearEscalerilla({ hondo = P.depth } = {}) {
  const r = new T.Group(), M = C.metal;
  for (const s of [-1, 1]) { barra(r, 'pasamanos', [s * .25, .75, -.25], [s * .25, .75, .05], .04, M, false); barra(r, 'bajante', [s * .25, .75, .05], [s * .25, -hondo + .2, .12], .04, M, false); barra(r, 'anclaje', [s * .25, .75, -.25], [s * .25, 0, -.25], .04, M, false); }
  for (let i = 1; i <= 3; i++) caja(r, 'peldaño', .5, .03, .1, M, 0, -i * .3, .1, false);
  return r;
}
