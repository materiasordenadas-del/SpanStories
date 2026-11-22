// Panel «Cielo e iluminación»: galería de cielos, hora, sol y luna, nubes y niebla, clima y (plegado) colores y calidad.
// Cada cambio entra en el historial; los deslizadores aplican en vivo y registran UNA entrada al soltar.
import { el, svg, seccion, campo, rango } from '../../ui/componentes.js';
import { CIELOS, GRUPOS_CIELO, HORAS } from './Presets.js';
import { CIELO_DEFECTO } from './CieloPerfil.js';

export function montarCieloPanel({ entorno, cambios, preferencias, ESTACIONES, CLIMAS }) {
  const nodo = el('div');
  const actual = () => entorno.datos.cielo ?? { ...CIELO_DEFECTO, sol: { ...CIELO_DEFECTO.sol }, colores: { ...CIELO_DEFECTO.colores } };
  const poner = (cambio, confirmar = true, nombre = 'Cambiar cielo') => {
    const a = actual(), nuevo = { ...a, ...cambio, sol: { ...a.sol, ...cambio.sol }, colores: { ...a.colores, ...cambio.colores } };
    if (confirmar) cambios.unico('cielo', nuevo, nombre); else cambios.vivo('cielo', nuevo);
  };
  const deslizador = (rotulo, { min, max, paso, valor, formato, aplicar, nombre }) =>
    campo(rotulo, rango({ min, max, paso, valor, formato, titulo: rotulo, alCambiar: (v, tipo) => { aplicar(v, false); if (tipo === 'change') cambios.confirmar(nombre ?? rotulo); } }));
  const boton = (texto, onclick, pulsado) => el('button', { type: 'button', class: 'ed-btn', 'aria-pressed': pulsado === undefined ? null : String(pulsado), onclick }, el('span', {}, texto));

  function muestra(c, hora) {
    const p = c.paletas?.[hora];
    const fondo = p ? `linear-gradient(${p[0]}, ${p[1]})` : 'repeating-linear-gradient(45deg,#cfd8df 0 6px,#e4eaee 6px 12px)';
    return el('div', { class: 'ed-mini-img', style: `background:${fondo};height:46px` }, p ? el('span', { style: `width:26px;height:10px;border-radius:8px;background:${p[2]};opacity:.9` }) : svg('paleta', { tam: 22 }));
  }

  function dibujar() {
    const c = actual(), hay = !!entorno.datos.cielo, clima = entorno.datos.clima;
    nodo.replaceChildren(
      el('div', { class: 'ed-contenido', style: 'padding:8px 10px;border-bottom:1px solid var(--ed-borde)' },
        el('span', { class: 'ed-chip' }, hay ? 'Cielo propio de este escenario' : 'Usa el cielo del estilo (global)'),
        hay ? boton('Volver al cielo global', () => cambios.unico('cielo', null, 'Quitar cielo propio')) : null),
      seccion('Hora del día', [el('div', { class: 'ed-fila-botones' }, ...HORAS.map(([id, nombre]) => boton(nombre, () => poner({ hora: id }, true, 'Cambiar hora'), c.hora === id)))], { clave: 'cielo:hora', preferencias }),
      seccion('Cielo', GRUPOS_CIELO.map(g => el('div', {}, el('div', { class: 'ed-hub-grupo', style: 'padding:6px 0 4px' }, g),
        el('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px' }, ...CIELOS.filter(x => x.grupo === g).map(x =>
          el('button', { type: 'button', class: 'ed-tarjeta', style: 'grid-template-rows:auto auto', 'aria-pressed': String(hay && c.preset === x.id), title: x.descripcion, onclick: () => poner({ preset: x.paletas ? x.id : null }, true, 'Elegir cielo ' + x.nombre) },
            muestra(x, c.hora), el('div', { class: 'ed-meta' }, el('b', {}, x.nombre), el('span', {}, x.paletas ? x.descripcion : 'El del estilo'))))))), { clave: 'cielo:galeria', preferencias }),
      seccion('Sol y luna', [
        deslizador('Giro del sol (°)', { min: -180, max: 180, paso: 1, valor: c.sol.az, formato: v => Math.round(v) + '°', aplicar: (v, f) => poner({ sol: { az: v } }, f), nombre: 'Girar sol' }),
        deslizador('Altura del sol (°)', { min: -10, max: 90, paso: 1, valor: c.sol.el ?? 30, formato: v => Math.round(v) + '°', aplicar: (v, f) => poner({ sol: { el: v } }, f), nombre: 'Altura del sol' }),
        c.sol.el !== null ? boton('Altura según la hora', () => poner({ sol: { el: null } }, true, 'Altura automática')) : null,
        deslizador('Intensidad del sol', { min: 0, max: 2, paso: .05, valor: c.sol.intensidad, aplicar: (v, f) => poner({ sol: { intensidad: v } }, f), nombre: 'Intensidad del sol' }),
        deslizador('Luz de luna', { min: 0, max: 2, paso: .05, valor: c.luna, aplicar: (v, f) => poner({ luna: v }, f), nombre: 'Luz de luna' }),
      ], { clave: 'cielo:sol', preferencias }),
      seccion('Nubes y niebla', [
        deslizador('Nubes', { min: 0, max: 1, paso: .02, valor: c.nubes ?? .22, aplicar: (v, f) => poner({ nubes: v }, f), nombre: 'Cantidad de nubes' }),
        deslizador('Niebla', { min: 0, max: 1, paso: .02, valor: c.niebla ?? .11, aplicar: (v, f) => poner({ niebla: v }, f), nombre: 'Niebla' }),
        (c.nubes !== null || c.niebla !== null) ? boton('Usar las del estilo', () => poner({ nubes: null, niebla: null }, true, 'Nubes y niebla del estilo')) : null,
      ], { clave: 'cielo:nubes', preferencias }),
      seccion('Clima y estación', [
        el('div', { class: 'ed-hub-grupo', style: 'padding:0' }, 'Estación'),
        el('div', { class: 'ed-fila-botones' }, ...Object.entries(ESTACIONES).map(([id, e]) => boton(e.nombre, () => cambios.unico('clima', { estacion: id, clima: clima?.clima ?? 'despejado' }, 'Cambiar estación'), clima?.estacion === id))),
        el('div', { class: 'ed-hub-grupo', style: 'padding:4px 0 0' }, 'Clima'),
        el('div', { class: 'ed-fila-botones' }, ...Object.entries(CLIMAS).map(([id, k]) => boton(k.nombre, () => cambios.unico('clima', { estacion: clima?.estacion ?? 'primavera', clima: id }, 'Cambiar clima'), clima?.clima === id))),
        clima ? boton('Quitar clima de este escenario', () => cambios.unico('clima', null, 'Quitar clima propio')) : null,
      ], { clave: 'cielo:clima', preferencias, abierta: false }),
      seccion('Avanzado', [
        ...[['top', 'Color del cenit'], ['horizon', 'Color del horizonte'], ['cloud', 'Color de las nubes']].map(([k, t]) => {
          const input = el('input', { type: 'color', class: 'ed-input', value: c.colores[k] ?? '#88aacc', style: 'padding:0;height:24px', 'aria-label': t });
          input.addEventListener('input', () => poner({ colores: { [k]: input.value } }, false)); input.addEventListener('change', () => cambios.confirmar(t));
          return campo(t, input);
        }),
        (c.colores.top || c.colores.horizon || c.colores.cloud) ? boton('Usar los colores de la paleta', () => poner({ colores: { top: null, horizon: null, cloud: null } }, true, 'Colores de la paleta')) : null,
        campo('Calidad', (() => { const s = el('select', { class: 'ed-input', 'aria-label': 'Calidad del cielo' }, ...[['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta (nubes volumétricas)']].map(([v, t]) => el('option', { value: v, selected: c.calidad === v }, t))); s.addEventListener('change', () => poner({ calidad: s.value }, true, 'Calidad del cielo')); return s; })()),
        el('p', { style: 'color:var(--ed-texto-3);margin:0;line-height:1.5' }, 'Las nubes volumétricas de la calidad Alta todavía no están portadas al motor: en las tres calidades se usa la versión ligera.'),
      ], { clave: 'cielo:avanzado', preferencias, abierta: false }),
    );
  }
  const baja = entorno.alCambiar(() => { if (!(document.activeElement?.type === 'range' && nodo.contains(document.activeElement))) dibujar(); });
  dibujar();
  return { nodo, titulo: 'Cielo e iluminación', icono: 'sol', alMostrar: dibujar, dispose: baja };
}
