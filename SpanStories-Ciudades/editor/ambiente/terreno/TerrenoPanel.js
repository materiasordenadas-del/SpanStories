// Sección «Pintar terreno» (material del suelo): hierba, tierra, arena, piedra y suelo seco con pincel. Independiente del césped:
// cambiar el color de las matas no cambia el suelo, y viceversa. Una pincelada completa = UNA entrada del historial.
import { el, svg, seccion, campo, rango } from '../../ui/componentes.js';
import { MATERIALES_TERRENO, TERRENO_DEFECTO, normalizarTerreno } from './MapaMateriales.js';

export function montarTerrenoPanel({ entorno, cambios, terreno, pincel, preferencias, estado = () => {} }) {
  const nodo = el('div');
  const e = { activo: false, material: 1, borrar: false, radio: 4, dureza: .7 };
  let antes = null;
  const actual = () => entorno.datos.terreno;
  const boton = (texto, onclick, extra = {}) => el('button', { type: 'button', class: 'ed-btn' + (extra.primario ? ' ed-primario' : ''), onclick, 'aria-pressed': extra.pulsado === undefined ? null : String(extra.pulsado), title: extra.titulo }, extra.icono ? svg(extra.icono, { tam: 14 }) : null, el('span', {}, texto));

  const hooks = {
    activo: () => e.activo, radio: () => e.radio,
    alEmpezar() { antes = structuredClone(actual()); terreno.mapaEditable(); },
    alPintar(p) { terreno.pintar({ x: p.x, z: p.z, radio: e.radio, material: e.borrar ? 0 : e.material, dureza: e.dureza }); },
    alTerminar() {
      if (!antes) return; const previo = antes; antes = null;
      const nuevo = normalizarTerreno({ ...(actual() ?? TERRENO_DEFECTO), mapa: terreno.serializarMapa() });
      entorno.datos.terreno = nuevo; cambios.registrarManual('terreno', 'Pintar terreno', previo, structuredClone(nuevo)); entorno.notificar(); dibujar();
    },
  };
  const tomar = () => pincel.tomar('terreno', hooks, () => { e.activo = false; dibujar(); });

  function dibujar() {
    const t = actual(), mapa = terreno.mapa;
    nodo.replaceChildren(seccion('Pintar terreno', [
      el('p', { style: 'margin:0;color:var(--ed-texto-2);line-height:1.5' }, 'Pinta el material del suelo. No cambia el relieve ni el césped; el suelo original se ve donde no pintas.'),
      el('div', { class: 'ed-fila-botones' }, ...MATERIALES_TERRENO.map(m => el('button', { type: 'button', class: 'ed-btn', 'aria-pressed': String(e.activo && !e.borrar && e.material === m.id), onclick: () => { e.material = m.id; e.borrar = false; e.activo = true; tomar(); dibujar(); } },
        el('span', { style: `width:12px;height:12px;border-radius:2px;background:${t?.colores?.[m.clave] ?? m.color};border:1px solid var(--ed-borde-fuerte)` }), el('span', {}, m.nombre)))),
      el('div', { class: 'ed-fila-botones' },
        boton('Borrar pintura', () => { e.borrar = true; e.activo = true; tomar(); dibujar(); }, { icono: 'papelera', pulsado: e.activo && e.borrar }),
        boton(e.activo ? 'Pincel activo · salir' : 'Activar pincel', () => { e.activo = !e.activo; if (e.activo) tomar(); else pincel.soltar('terreno'); dibujar(); }, { icono: 'pincel', primario: e.activo })),
      campo('Radio (m)', rango({ min: .5, max: 20, paso: .5, valor: e.radio, formato: v => (+v).toFixed(1).replace('.', ','), titulo: 'Radio', alCambiar: v => { e.radio = v; } })),
      campo('Dureza del borde', rango({ min: 0, max: 1, paso: .05, valor: e.dureza, titulo: 'Dureza', alCambiar: v => { e.dureza = v; } })),
      ...MATERIALES_TERRENO.map(m => { const i = el('input', { type: 'color', class: 'ed-input', value: t?.colores?.[m.clave] ?? m.color, style: 'padding:0;height:24px', 'aria-label': 'Color de ' + m.nombre });
        i.addEventListener('change', () => { const base = normalizarTerreno(actual() ?? TERRENO_DEFECTO); cambios.unico('terreno', { ...base, colores: { ...base.colores, [m.clave]: i.value } }, 'Color de ' + m.nombre); }); return campo('Color · ' + m.nombre, i); }),
      boton('Quitar toda la pintura', () => { e.activo = false; pincel.soltar('terreno'); cambios.unico('terreno', null, 'Quitar pintura de terreno'); }, { icono: 'papelera' }),
      el('p', { style: 'margin:0;color:var(--ed-texto-3);line-height:1.5' }, mapa ? `Zona pintable: ${mapa.ancho} × ${mapa.alto} m · cubierto: ${Math.round(mapa.cobertura * 100)} %.` : 'La zona pintable (200 × 200 m alrededor de la vista) se crea al pintar por primera vez. El relieve y las alturas no se editan aquí.'),
    ], { clave: 'terreno:pintar', preferencias }));
  }
  const baja = entorno.alCambiar(() => { if (!nodo.contains(document.activeElement) || document.activeElement === document.body || document.activeElement.tagName === 'BUTTON') dibujar(); });
  dibujar();
  return { nodo, alMostrar: dibujar, pincelActivo: () => e.activo, apagarPincel() { e.activo = false; pincel.soltar('terreno'); }, dispose: baja };
}
