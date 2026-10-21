import * as T from '../engine/three.js';
import { luz } from '../engine/Luz25D.js';
import { caja } from './Piezas.js';
import { formatear } from '../engine/Moneda.js';
import { COLORS as C, PRECIOS, HORARIOS, NOMBRE } from '../engine/dimensions.js';

// Pizarra de precios y servicios de la recepción. Se repinta al cambiar de moneda: `userData.pintar(codigo)`.
// Tiza sobre pizarra verde: es una ilustración (sin relighting), solo se tiñe con el ambiente.
export function crearPizarraPrecios({ ancho = 2.2, alto = 1.5 } = {}) {
  const r = new T.Group();
  caja(r, 'marco', ancho + .12, alto + .12, .05, C.madera, 0, 0, 0);
  caja(r, 'repisa-tizas', ancho, .04, .08, C.madera, 0, -alto / 2 - .06, .05, false);
  for (const [x, col] of [[-.4, '#fbfaf5'], [-.3, '#f6c9c0'], [.5, '#f7e7a1']]) caja(r, 'tiza', .08, .015, .015, col, x, -alto / 2 - .03, .06, false);
  const W = 1100, H = Math.round(W * alto / ancho), c = document.createElement('canvas'); c.width = W; c.height = H;
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new T.MeshBasicMaterial({ map: tex }); luz.tintar(mat, 'cartel');
  const lam = new T.Mesh(new T.PlaneGeometry(ancho, alto), mat); lam.position.z = .027; lam.name = 'pizarra'; r.add(lam);
  r.userData.pintar = (moneda = 'COP') => {
    const g = c.getContext('2d'); g.fillStyle = C.pizarra; g.fillRect(0, 0, W, H);
    // Polvo de tiza: manchas suaves (albedo, no luz).
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.035)'; g.beginPath(); g.ellipse((i * 263) % W, (i * 151) % H, 90, 30, i, 0, 7); g.fill(); }
    const tiza = '#f4f1e6', amarilla = '#f6dd8a', rosa = '#f2b8ad';
    g.textBaseline = 'middle'; g.fillStyle = amarilla; g.textAlign = 'center'; g.font = '700 58px "Comic Sans MS", "Segoe Print", cursive';
    g.fillText('PRECIOS Y SERVICIOS', W / 2, 62);
    g.font = '500 26px "Segoe Print", cursive'; g.fillStyle = rosa; g.fillText(NOMBRE.hostal + ' · precios en ' + moneda, W / 2, 112);
    g.strokeStyle = tiza; g.lineWidth = 3; g.beginPath(); g.moveTo(80, 138); g.lineTo(W - 80, 138); g.stroke();
    const filaH = (H - 300) / PRECIOS.length; g.font = '500 33px "Segoe Print", "Comic Sans MS", cursive';
    PRECIOS.forEach((p, i) => {
      const y = 170 + i * filaH + filaH / 2; g.textAlign = 'left'; g.fillStyle = tiza; g.fillText(p.nombre, 70, y);
      const precio = p.cop ? formatear(p.cop, moneda) + (p.unidad ? ' / ' + p.unidad : '') : 'gratis';
      g.textAlign = 'right'; g.fillStyle = p.cop ? amarilla : '#a8e0c2'; g.fillText(precio, W - 70, y);
      // Línea de puntos entre el servicio y su precio.
      const x0 = 70 + g.measureText(p.nombre).width + 14, x1 = W - 70 - g.measureText(precio).width - 14;
      if (x1 > x0) { g.setLineDash([3, 11]); g.strokeStyle = 'rgba(244,241,230,.4)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y + 8); g.lineTo(x1, y + 8); g.stroke(); g.setLineDash([]); }
    });
    g.strokeStyle = tiza; g.lineWidth = 3; g.beginPath(); g.moveTo(80, H - 118); g.lineTo(W - 80, H - 118); g.stroke();
    g.textAlign = 'center'; g.fillStyle = tiza; g.font = '500 28px "Segoe Print", cursive';
    g.fillText(`Check-in ${HORARIOS.checkIn}  ·  Check-out ${HORARIOS.checkOut}`, W / 2, H - 82);
    g.fillStyle = rosa; g.fillText(`Horas de silencio: ${HORARIOS.silencio}`, W / 2, H - 40);
    tex.needsUpdate = true; r.userData.moneda = moneda;
  };
  r.userData.pintar();
  return r;
}
