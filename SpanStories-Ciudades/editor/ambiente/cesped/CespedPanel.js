// Panel «Terreno y vegetación» (parte del césped): perfiles, apariencia, calidad y pincel. Cada cambio entra en el historial;
// una pincelada completa (de pulsar a soltar) es UNA entrada.
import { el, svg, seccion, campo, rango, conmutador } from '../../ui/componentes.js';
import { PERFILES_CESPED, GRUPOS_CESPED, CESPED_DEFECTO, normalizarCesped, perfilCesped } from './Perfiles.js';

const MODOS = [['anadir', 'Añadir', 'mas'], ['borrar', 'Borrar', 'papelera'], ['densidadMas', 'Más densidad', 'cesped'], ['densidadMenos', 'Menos densidad', 'vacio'], ['suavizar', 'Suavizar', 'pincel']];
const APARIENCIA = [
  ['height', 'Altura (m)', .02, 2, .02], ['width', 'Anchura (m)', .01, .18, .005], ['density', 'Densidad (matas/m²)', 1, 100, 1], ['clumpSize', 'Tamaño de mata', .5, 12, .1],
  ['sizeVariation', 'Variación de tamaño', 0, .9, .01], ['colorVariation', 'Variación de color', 0, 1, .01], ['curvature', 'Curvatura', 0, .5, .01],
];
const VIENTO = [['windStrength', 'Fuerza del viento', 0, .8, .01], ['windSpeed', 'Velocidad', 0, 5, .05], ['windDirection', 'Dirección (°)', 0, 360, 1]];
const LUZ = [['lighting', 'Iluminación', .2, 1.5, .02], ['translucency', 'Translucidez (contraluz)', 0, .5, .01], ['rootShade', 'Sombra en la raíz', 0, .8, .01]];

export function montarCespedPanel({ entorno, cambios, cesped, pincel, preferencias, estado = () => {} }) {
  const nodo = el('div');
  const estadoPincel = { activo: false, modo: 'anadir', radio: 4, intensidad: .6, dureza: .5 };
  let antesTrazo = null;
  const actual = () => entorno.datos.cesped;
  const valor = (c, k) => c.params[k] ?? perfilCesped(c.perfil).params[k] ?? cesped.GRASS_DEFAULTS[k];
  const boton = (texto, onclick, extra = {}) => el('button', { type: 'button', class: 'ed-btn' + (extra.primario ? ' ed-primario' : ''), onclick, disabled: extra.deshabilitado, title: extra.titulo, 'aria-pressed': extra.pulsado === undefined ? null : String(extra.pulsado) }, extra.icono ? svg(extra.icono, { tam: 14 }) : null, el('span', {}, texto));

  function elegirPerfil(p) {
    if (p.estado !== 'disponible') return estado(p.nota);
    const c = actual(); cambios.unico('cesped', normalizarCesped({ ...(c ?? CESPED_DEFECTO), perfil: p.id, params: {} }), 'Elegir césped ' + p.nombre);
  }
  function deslizador([k, rotulo, min, max, paso]) {
    const c = actual(); if (!c) return null;
    return campo(rotulo, rango({ min, max, paso, valor: valor(c, k), titulo: rotulo, formato: v => (+v).toFixed(paso < .02 ? 3 : paso < 1 ? 2 : 0).replace('.', ','),
      alCambiar: (v, tipo) => { const base = actual(); cambios.vivo('cesped', { ...base, params: { ...base.params, [k]: v } }); if (tipo === 'change') cambios.confirmar(rotulo); } }));
  }
  function color(k, rotulo) {
    const c = actual(); if (!c) return null;
    const input = el('input', { type: 'color', class: 'ed-input', value: valor(c, k), style: 'padding:0;height:24px', 'aria-label': rotulo });
    input.addEventListener('input', () => { const base = actual(); cambios.vivo('cesped', { ...base, params: { ...base.params, [k]: input.value } }); }); input.addEventListener('change', () => cambios.confirmar(rotulo));
    return campo(rotulo, input);
  }

  // -- Pincel ---------------------------------------------------------------------------------------------------
  const pincelHooks = {
    activo: () => estadoPincel.activo && !!actual()?.activo,
    radio: () => estadoPincel.radio,
    alEmpezar() { antesTrazo = structuredClone(actual()); cesped.mapaEditable(); },
    alPintar(p) { const m = cesped.mapaEditable(); if (!m) return; if (m.pintar({ x: p.x, z: p.z, radio: estadoPincel.radio, intensidad: estadoPincel.intensidad, dureza: estadoPincel.dureza, modo: estadoPincel.modo })) cesped.mapaCambiado(); },
    alTerminar() {
      if (!antesTrazo) return; const c = actual(), antes = antesTrazo; antesTrazo = null;
      const nuevo = { ...c, mapa: cesped.serializarMapa() };
      guardarMapa('Pintar césped', antes);
    },
  };
  const tomarPincel = () => { pincel.tomar('cesped', pincelHooks, () => { estadoPincel.activo = false; dibujar(); }); };

  /** El mapa ya está aplicado en vivo: se guarda en el perfil y se registra UNA entrada de historial. */
  function guardarMapa(nombre, antes) {
    const nuevo = { ...actual(), mapa: cesped.serializarMapa() };
    entorno.datos.cesped = nuevo; cambios.registrarManual('cesped', nombre, antes, structuredClone(nuevo)); entorno.notificar(); dibujar();
  }
  function rellenar(valor, nombre) { const antes = structuredClone(actual()), m = cesped.mapaEditable(); m.rellenar(valor); cesped.mapaCambiado(); guardarMapa(nombre, antes); }

  function dibujar() {
    const c = actual(), p = c ? perfilCesped(c.perfil) : null, mapa = cesped.mapa;
    nodo.replaceChildren(
      el('div', { class: 'ed-contenido', style: 'padding:8px 10px;border-bottom:1px solid var(--ed-borde)' },
        el('span', { class: 'ed-chip' }, c?.activo ? `Césped: ${p.nombre}` : 'Este escenario no tiene césped propio'),
        c ? el('div', { class: 'ed-fila-botones' }, boton(c.activo ? 'Desactivar césped' : 'Activar césped', () => cambios.unico('cesped', { ...c, activo: !c.activo }, 'Césped activo'), { icono: 'cesped' }), boton('Quitar césped del escenario', () => { estadoPincel.activo = false; cambios.unico('cesped', null, 'Quitar césped'); }, { icono: 'papelera' })) : null),
      seccion('Perfil de césped', GRUPOS_CESPED.map(g => el('div', {}, el('div', { class: 'ed-hub-grupo', style: 'padding:6px 0 4px' }, g),
        el('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px' }, ...PERFILES_CESPED.filter(x => x.grupo === g).map(x =>
          el('button', { type: 'button', class: 'ed-tarjeta', style: 'grid-template-rows:auto auto' + (x.estado !== 'disponible' ? ';opacity:.6' : ''), 'aria-pressed': String(c?.perfil === x.id), title: x.nota, onclick: () => elegirPerfil(x) },
            el('div', { class: 'ed-mini-img', style: `height:30px;background:linear-gradient(${x.params.tip ?? '#c2d66b'},${x.params.main ?? '#72a53b'},${x.params.root ?? '#315626'})` }),
            el('div', { class: 'ed-meta' }, el('b', {}, x.nombre), el('span', {}, x.estado === 'disponible' ? x.nota : x.estado === 'solo-colina' ? 'Solo en la colina' : 'Pendiente de portar'))))))), { clave: 'cesped:perfiles', preferencias }),
      c?.activo ? seccion('Pintar césped', [
        el('div', { class: 'ed-fila-botones' }, ...MODOS.map(([id, n, ic]) => boton(n, () => { estadoPincel.modo = id; estadoPincel.activo = true; tomarPincel(); dibujar(); }, { icono: ic, pulsado: estadoPincel.activo && estadoPincel.modo === id }))),
        boton(estadoPincel.activo ? 'Pincel activo · pulsa para salir' : 'Activar pincel', () => { estadoPincel.activo = !estadoPincel.activo; if (estadoPincel.activo) tomarPincel(); else pincel.soltar('cesped'); pincel.refrescar(); dibujar(); }, { primario: estadoPincel.activo, icono: 'pincel' }),
        campo('Radio (m)', rango({ min: .5, max: 20, paso: .5, valor: estadoPincel.radio, formato: v => (+v).toFixed(1).replace('.', ','), titulo: 'Radio', alCambiar: v => { estadoPincel.radio = v; } })),
        campo('Intensidad', rango({ min: .05, max: 1, paso: .05, valor: estadoPincel.intensidad, titulo: 'Intensidad', alCambiar: v => { estadoPincel.intensidad = v; } })),
        campo('Dureza', rango({ min: 0, max: 1, paso: .05, valor: estadoPincel.dureza, titulo: 'Dureza', alCambiar: v => { estadoPincel.dureza = v; } })),
        el('div', { class: 'ed-fila-botones' },
          boton('Rellenar zona', () => rellenar(1, 'Rellenar césped'), { icono: 'cesped' }),
          boton('Vaciar zona', () => rellenar(0, 'Vaciar césped'), { icono: 'papelera' })),
        el('p', { style: 'margin:0;color:var(--ed-texto-3);line-height:1.5' }, mapa ? `Zona pintable: ${mapa.ancho} × ${mapa.alto} m alrededor de donde empezaste · cubierto: ${Math.round(mapa.cobertura * 100)} %.` : 'La zona pintable se crea al pintar por primera vez (200 × 200 m alrededor de la vista).'),
        el('p', { style: 'margin:0;color:var(--ed-texto-3);line-height:1.5' }, 'Altura y color locales todavía no están disponibles: el motor de matas usa una altura y un color por perfil.'),
      ], { clave: 'cesped:pincel', preferencias }) : null,
      c?.activo ? seccion('Apariencia', [color('root', 'Color de la raíz'), color('main', 'Color principal'), color('tip', 'Color de la punta'), ...APARIENCIA.map(deslizador)], { clave: 'cesped:apariencia', preferencias, abierta: false }) : null,
      c?.activo ? seccion('Viento y luz', [...VIENTO.map(deslizador), ...LUZ.map(deslizador)], { clave: 'cesped:viento', preferencias, abierta: false }) : null,
      c?.activo ? seccion('Calidad', [
        campo('Calidad', (() => { const s = el('select', { class: 'ed-input', 'aria-label': 'Calidad del césped' }, ...[['bajo', 'Baja (14 000 matas)'], ['medio', 'Media (26 000)'], ['alto', 'Alta (40 000)'], ['ultra', 'Ultra (60 000)']].map(([v, t]) => el('option', { value: v, selected: c.calidad === v }, t))); s.addEventListener('change', () => cambios.unico('cesped', { ...c, calidad: s.value }, 'Calidad del césped')); return s; })()),
        el('p', { style: 'margin:0;color:var(--ed-texto-3);line-height:1.5' }, 'El césped y las nubes tienen calidad independiente. Las matas lejanas se reducen solas por distancia.'),
      ], { clave: 'cesped:calidad', preferencias, abierta: false }) : null,
    );
  }
  const baja = entorno.alCambiar(() => { if (document.activeElement?.type === 'range' && nodo.contains(document.activeElement)) return; if (!nodo.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON' || document.activeElement === document.body) dibujar(); });
  dibujar();
  return { nodo, titulo: 'Terreno y vegetación', icono: 'cesped', alMostrar: dibujar, pincelActivo: () => pincelHooks.activo(), apagarPincel() { estadoPincel.activo = false; pincel.soltar('cesped'); }, dispose: baja };
}
