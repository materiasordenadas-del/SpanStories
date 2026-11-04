import * as T from '../engine/three.js';
import { luz } from '../engine/Luz25D.js';
import { caja } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Carteles pintados: ilustración sin relighting (ESTILO §3) que solo se tiñe con el ambiente.
// `lineas`: [{ texto, tam (0..1 del alto), color, peso, fuente }]. El lienzo sigue la proporción.
export function lienzoCartel(ancho, alto, pintar, px = 256) {
  const H = px, W = Math.min(2048, Math.max(64, Math.round(px * ancho / alto)));
  const c = document.createElement('canvas'); c.width = W; c.height = H; pintar(c.getContext('2d'), W, H);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
}
export function pintarLineas(g, W, H, { fondo, borde, lineas }) {
  if (fondo) { g.fillStyle = fondo; g.fillRect(0, 0, W, H); }
  if (borde) { g.strokeStyle = borde; g.lineWidth = H * .035; g.strokeRect(H * .05, H * .05, W - H * .1, H - H * .1); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const total = lineas.reduce((n, l) => n + l.tam, 0); let y = (1 - total) / 2 * H;
  for (const l of lineas) { const h = l.tam * H; g.fillStyle = l.color; g.font = `${l.peso || 600} ${Math.round(h * .78)}px ${l.fuente || 'Georgia, serif'}`; g.fillText(l.texto, W / 2, y + h / 2, W * .9); y += h; }
}
/** Placa con texto: tablero (relieve toon) + lámina pintada al frente (+z). */
export function crearCartel({ ancho, alto, fondo = C.postigoOscuro, borde = C.crema, lineas, grosor = .04, marco = C.maderaOscura, px = 256 }) {
  const r = new T.Group();
  if (grosor) caja(r, 'tablero', ancho + .06, alto + .06, grosor, marco, 0, 0, 0, false);
  const map = lienzoCartel(ancho, alto, (g, W, H) => pintarLineas(g, W, H, { fondo, borde, lineas }), px);
  const mat = new T.MeshBasicMaterial({ map, transparent: !fondo, alphaTest: fondo ? 0 : .4 });
  luz.tintar(mat, 'cartel');
  const lam = new T.Mesh(new T.PlaneGeometry(ancho, alto), mat); lam.name = 'lamina'; lam.position.z = grosor / 2 + .002; r.add(lam);
  r.userData.lamina = lam; return r;
}
/** Texto pintado directamente sobre un muro (sin tablero), p. ej. el nombre en la fachada. */
export function crearTextoPintado({ ancho, alto, lineas }) { return crearCartel({ ancho, alto, fondo: null, borde: null, lineas, grosor: 0 }); }
