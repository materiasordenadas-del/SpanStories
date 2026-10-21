import * as T from '../engine/three.js';
import { caja, barra } from './Piezas.js';
import { crearBaranda } from './Arquitectura.js';
import { COLORS as C, STAIR as E, HOUSE as H } from '../engine/dimensions.js';

// Escalera en U de obra (una planta) a partir de Planta.escalera(y0): peldaños de losa quebrada con
// huella de barro, descansillo, muro central entre tramos y baranda en el lado abierto del tramo B.
export function crearEscalera(plan, y0, { barandaLlegada = null } = {}) {
  const r = new T.Group(), losa = .16;
  for (const p of plan.pasos) {
    const w = p.x1 - p.x0, d = p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    caja(r, 'peldaño', w, E.rise + losa, d, C.cal, cx, p.y - (E.rise + losa) / 2, cz, false);
    caja(r, 'huella', w, .025, d + .03, C.barro, cx, p.y + .0125, cz + (p.tramo === 'A' ? .015 : -.015), false);
  }
  const D = plan.descanso; caja(r, 'descanso', D.x1 - D.x0, .2, D.z1 - D.z0, C.cal, (D.x0 + D.x1) / 2, D.y - .1, (D.z0 + D.z1) / 2, false);
  caja(r, 'huella-descanso', D.x1 - D.x0, .025, D.z1 - D.z0, C.barro, (D.x0 + D.x1) / 2, D.y + .0125, (D.z0 + D.z1) / 2, false);
  const M = plan.muro; caja(r, 'muro-central', M.x1 - M.x0, H.floorHeight, M.z1 - M.z0, C.cal, (M.x0 + M.x1) / 2, y0 + H.floorHeight / 2, (M.z0 + M.z1) / 2, false);
  // Baranda inclinada del tramo B (lado abierto, x = xb0), del descansillo a la llegada.
  const xb = plan.xb[0] + .03, zA = plan.zTop, zB = E.startZ, yA = D.y, yB = y0 + H.floorHeight;
  barra(r, 'pasamanos', [xb, yA + .9, zA], [xb, yB + .9, zB], .07, C.maderaOscura, 'fino');
  const n = Math.round((zB - zA) / .28);
  for (let i = 0; i <= n; i++) { const t = i / n, z = zA + (zB - zA) * t, y = yA + (yB - yA) * t; caja(r, 'balaustre', .04, .9, .04, C.madera, xb, y + .45, z, false); }
  if (barandaLlegada) r.add(crearBaranda(...barandaLlegada));
  return r;
}
