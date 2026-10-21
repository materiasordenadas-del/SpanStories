import * as T from '../engine/three.js';
import { ROUTES } from '../routes.js';
import { place, after, ground } from '../engine/layout.js';
import { crearPiso } from '../objetos/Piso.js';
import { crearSilla } from '../objetos/Silla.js';

// La zona no es una identidad seleccionable: registra cada raíz semántica.
export function buildLobby({ objetos, routes = ROUTES } = {}) {
  const { DIMENSIONS, FLOOR, CHAIR, LOBBY } = routes;
  const zona = new T.Group();
  zona.name = 'lobby';
  const suelo = crearPiso({ ancho: FLOOR.width, fondo: FLOOR.depth });
  suelo.name = 'lobby_suelo';
  zona.add(suelo);
  place(suelo, { minY: DIMENSIONS.groundY });
  objetos?.registrar(suelo, { id: 'piso-001', tipo: 'piso', etiqueta: 'Piso' });
  // El registro asigna name = id; restaura el nombre medible sin cambiar el ID.
  suelo.name = 'lobby_suelo';
  let anterior;
  for (let i = 0; i < LOBBY.chairCount; i++) {
    const silla = crearSilla({
      ancho: CHAIR.width, fondo: CHAIR.depth,
      alto: CHAIR.height, asiento: CHAIR.seatHeight,
    });
    silla.name = 'lobby_silla_' + (i + 1);
    zona.add(silla);
    place(silla, { cz: LOBBY.chairZ });
    if (anterior) after(silla, anterior, 'x', LOBBY.chairGap);
    else place(silla, { cx: LOBBY.firstChairX });
    ground(silla, suelo, LOBBY.chairSink);
    objetos?.registrar(silla, {
      id: 'silla-' + String(i + 1).padStart(3, '0'),
      tipo: 'silla', etiqueta: 'Silla ' + (i + 1),
    });
    silla.name = 'lobby_silla_' + (i + 1);
    silla.traverse(pieza => {
      if (pieza !== silla && pieza.name) pieza.name = silla.name + '_' + pieza.name;
    });
    anterior = silla;
  }
  return zona;
}
