// Panel «Estilo visual»: galería de los 6 estilos de Atlas, parámetros, comparar A/B, presets y copiar configuración.
// Tres niveles: estilo GLOBAL (el compartido del motor, no se toca), estilo del ESCENARIO (se guarda aquí) y PREVISUALIZACIÓN
// (temporal hasta pulsar «Aplicar al escenario»).
import { el, svg, seccion, campo, rango } from '../../ui/componentes.js';
import { ESTILOS_INFO, FAMILIAS_ESTILO } from './Catalogo.js';
import { nuevoId } from '../../core/EscenarioDoc.js';

export function montarEstiloPanel({ entorno, cambios, estilos, preferencias, estado = () => {} }) {
  const nodo = el('div');
  let previa = null;                    // { antes } mientras se previsualiza
  let ab = null;                        // { a, b, viendo } comparación A/B
  const lista = () => estilos.listar();
  const idGlobal = () => estilos.pool.state.active;
  const propio = () => entorno.datos.estilo;
  const idActual = () => estilos.activo;
  const nombreDe = id => lista().find(s => s.id === id)?.nombre ?? id;
  const boton = (texto, onclick, extra = {}) => el('button', { type: 'button', class: 'ed-btn' + (extra.primario ? ' ed-primario' : ''), onclick, disabled: extra.deshabilitado, 'aria-pressed': extra.pulsado === undefined ? null : String(extra.pulsado) }, extra.icono ? svg(extra.icono, { tam: 14 }) : null, el('span', {}, texto));

  /** Previsualiza un estilo (sin historial) hasta aplicarlo o cancelar. */
  function previsualizar(id) {
    if (!previa) previa = { antes: structuredClone(propio()) };
    entorno.cambiar('estilo', { active: id, params: structuredClone(propio()?.params ?? {}) });
    dibujar();
  }
  function aplicar() {
    if (!previa) return; const antes = previa.antes; previa = null; ab = null;
    const despues = structuredClone(propio());
    if (JSON.stringify(antes) !== JSON.stringify(despues)) cambios.registrarManual?.('estilo', 'Cambiar estilo', antes, despues);
    estado('Estilo aplicado a este escenario · ' + nombreDe(idActual()) + '.'); dibujar();
  }
  function cancelar() { if (!previa) return; entorno.restaurar('estilo', previa.antes); previa = null; ab = null; dibujar(); }
  function usarGlobal() { previa = null; ab = null; cambios.unico('estilo', null, 'Volver al estilo global'); }
  function restablecer() { cambios.unico('estilo', propio() ? { active: propio().active, params: {} } : null, 'Restablecer estilo'); }

  function tarjeta(s) {
    const info = ESTILOS_INFO[s.id] ?? {}, activa = idActual() === s.id;
    return el('button', { type: 'button', class: 'ed-tarjeta', style: 'grid-template-rows:auto auto', 'aria-pressed': String(activa), title: info.desc, onclick: () => previsualizar(s.id) },
      el('div', { class: 'ed-mini-img', style: `height:34px;background:linear-gradient(120deg,${info.color ?? '#999'},#fff8 70%)` }, svg('paleta', { tam: 20 })),
      el('div', { class: 'ed-meta' }, el('b', {}, s.nombre), el('span', {}, info.tipo ?? ''), activa ? el('span', { style: 'color:var(--ed-acento)' }, propio() ? 'Estilo de este escenario' : 'Estilo global') : null));
  }

  function controles() {
    const a = estilos.actual, out = [];
    for (const c of a.controles) {
      const valor = Number(a.uniformes[c.clave]?.value ?? 0);
      out.push(campo(c.nombre, rango({ min: c.min, max: c.max, paso: c.paso, valor, titulo: c.nombre, alCambiar: (v, tipo) => {
        const base = propio() ?? { active: idActual(), params: {} };
        const params = { ...base.params, [idActual()]: { ...base.params[idActual()], [c.clave]: v } };
        if (previa) entorno.cambiar('estilo', { active: base.active ?? idActual(), params });
        else { cambios.vivo('estilo', { active: base.active ?? idActual(), params }); if (tipo === 'change') cambios.confirmar('Parámetro de estilo'); }
      } })));
    }
    return out;
  }

  function dibujar() {
    const p = propio(), presets = entorno.datos.presets ?? [];
    const cabecera = el('div', { class: 'ed-contenido', style: 'padding:8px 10px;border-bottom:1px solid var(--ed-borde)' },
      el('span', { class: 'ed-chip' }, p ? 'Estilo propio de este escenario: ' + nombreDe(idActual()) : 'Estilo global: ' + nombreDe(idGlobal())),
      previa ? el('div', { class: 'ed-fila-botones' }, boton('Aplicar al escenario', aplicar, { primario: true, icono: 'guardar' }), boton('Cancelar', cancelar, { icono: 'cerrar' }), el('span', { class: 'ed-chip', 'data-tipo': 'aviso' }, 'Previsualizando')) : null,
      !previa && p ? boton('Usar el estilo global', usarGlobal, { icono: 'restaurar' }) : null);
    nodo.replaceChildren(cabecera,
      seccion('Estilos', FAMILIAS_ESTILO.map(f => el('div', {}, el('div', { class: 'ed-hub-grupo', style: 'padding:4px 0' }, f),
        el('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px' }, ...lista().filter(s => ESTILOS_INFO[s.id]?.familia === f).map(tarjeta)))), { clave: 'estilo:galeria', preferencias }),
      seccion('Parámetros', [...controles(), boton('Restablecer parámetros', restablecer, { icono: 'restaurar', deshabilitado: !p })], { clave: 'estilo:params', preferencias }),
      seccion('Comparar A / B', [
        el('p', { style: 'margin:0;color:var(--ed-texto-2);line-height:1.5' }, 'Alterna entre dos estilos con la misma cámara. El estilo que dejes puesto se previsualiza hasta que lo apliques.'),
        (() => { const s = el('select', { class: 'ed-input', 'aria-label': 'Estilo B' }, ...lista().map(x => el('option', { value: x.id, selected: (ab?.b ?? lista().find(y => y.id !== idActual()).id) === x.id }, x.nombre))); s.addEventListener('change', () => { ab = { ...(ab ?? { a: idActual(), viendo: 'a' }), b: s.value }; }); return campo('Estilo B', s); })(),
        boton(ab ? `Viendo ${ab.viendo.toUpperCase()} · alternar` : 'Empezar comparación', () => {
          const sel = nodo.querySelector('[aria-label="Estilo B"]'); if (!ab) ab = { a: idActual(), b: sel.value, viendo: 'a' };
          ab.viendo = ab.viendo === 'a' ? 'b' : 'a'; previsualizar(ab[ab.viendo]);
        }, { icono: 'ortografica' }),
      ], { clave: 'estilo:ab', preferencias, abierta: false }),
      seccion('Presets guardados', [
        ...(presets.length ? presets.map(pr => el('div', { class: 'ed-fila-botones' }, boton(pr.nombre, () => { previa = previa ?? { antes: structuredClone(propio()) }; entorno.cambiar('estilo', structuredClone(pr.estilo)); dibujar(); }, { icono: 'paleta' }),
          boton('Borrar', () => cambios.unico('presets', presets.filter(x => x.id !== pr.id), 'Borrar preset'), { icono: 'papelera' }))) : [el('span', { style: 'color:var(--ed-texto-3)' }, 'Aún no hay presets.')]),
        (() => { const n = el('input', { class: 'ed-input', type: 'text', placeholder: 'Nombre del preset', maxLength: 60, 'aria-label': 'Nombre del preset' });
          return el('div', { class: 'ed-fila-botones', style: 'flex-wrap:nowrap' }, n, boton('Guardar actual', () => { const nombre = n.value.trim(); if (!nombre) return estado('Escribe un nombre para el preset.'); cambios.unico('presets', [...presets, { id: nuevoId('preset'), nombre, estilo: structuredClone(propio() ?? { active: idActual(), params: {} }) }], 'Guardar preset'); }, { icono: 'guardar' })); })(),
      ], { clave: 'estilo:presets', preferencias, abierta: false }),
      seccion('Copiar configuración', [
        el('div', { class: 'ed-fila-botones' },
          boton('Copiar', async () => { try { await navigator.clipboard.writeText(JSON.stringify({ tipo: 'spanstories-estilo', estilo: propio() ?? { active: idActual(), params: {} } })); estado('Configuración de estilo copiada.'); } catch { estado('El navegador no permitió copiar; usa el cuadro de abajo.'); } }, { icono: 'copiar' })),
        (() => { const t = el('textarea', { class: 'ed-input', rows: 3, placeholder: 'Pega aquí una configuración copiada de otro escenario', style: 'height:auto;padding:6px', 'aria-label': 'Configuración pegada' });
          return el('div', { style: 'display:grid;gap:6px' }, t, boton('Aplicar configuración pegada', () => { try { const d = JSON.parse(t.value); if (d?.tipo !== 'spanstories-estilo' || !d.estilo) throw new Error('No es una configuración de estilo de SpanStories.'); cambios.unico('estilo', d.estilo, 'Pegar configuración de estilo'); t.value = ''; } catch (error) { estado(error.message); } }, { icono: 'pegar' })); })(),
      ], { clave: 'estilo:copiar', preferencias, abierta: false }),
    );
  }
  const baja = [entorno.alCambiar(() => { if (document.activeElement?.type === 'range' && nodo.contains(document.activeElement)) return; if (!nodo.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') dibujar(); }), estilos.alCambiar(() => dibujar())];
  dibujar();
  return { nodo, titulo: 'Estilo visual', icono: 'paleta', alMostrar: dibujar, dispose() { baja.forEach(b => b()); } };
}
