import * as T from './three.js';
import { crearLote } from './Kit.js';

/* Puertas con bisagra: se abren solas cuando el jugador se acerca (entrada,
   baños) o se quedan cerradas (cocina: solo la puerta, no se entra).
   Cada hoja es su propio lote bajo un pivote en la bisagra. */

export function crearPuerta(ctx, { bisagra, giroCerrada = 0, abre = -Math.PI / 2 * .92, sensor, radio = 1.7, automatica = true, construir }) {
  const pivote = new T.Group();
  pivote.position.set(bisagra[0], 0, bisagra[1]);
  pivote.rotation.y = giroCerrada;
  const lote = crearLote(ctx.kit);
  construir(lote);
  lote.construir(pivote, ctx.pulsables);
  ctx.grupo.add(pivote);
  const puerta = { pivote, giroCerrada, abre, sensor, radio, automatica, t: 0 };
  ctx.puertas.push(puerta);
  return puerta;
}

/** Anima las puertas automáticas hacia abierta/cerrada según la distancia. */
export function animarPuertas(puertas, jugador, dt) {
  for (const p of puertas) {
    if (!p.automatica) continue;
    const d = Math.hypot(jugador.x - p.sensor[0], jugador.z - p.sensor[1]);
    const objetivo = d < p.radio ? 1 : 0;
    p.t += Math.sign(objetivo - p.t) * Math.min(Math.abs(objetivo - p.t), dt * 2.4);
    const e = p.t * p.t * (3 - 2 * p.t);
    p.pivote.rotation.y = p.giroCerrada + p.abre * e;
  }
}
