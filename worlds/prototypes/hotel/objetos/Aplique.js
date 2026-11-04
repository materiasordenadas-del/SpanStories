import * as T from '../engine/three.js';
import { caja,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearAplique() {
  const root=new T.Group();
  caja(root,'placa',.14,.42,.05,C.gold,0,.21,0,false);
  caja(root,'brazo',.035,.04,.22,C.gold,0,.19,.1,false);
  cilindro(root,'pantalla',.12,.27,C.cloth,0,.35,.2);
  return root;
}
