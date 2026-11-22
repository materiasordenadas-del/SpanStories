// Espacio «Preparación de escena»: variantes del escenario, cámaras guardadas y marcadores (aparición y personajes).
// Todo cambio pasa por capas.cambiar(): una entrada de historial y cambios sin guardar.
import { el, svg, seccion } from '../ui/componentes.js';
import { guardarCamara, guardarMarcador } from './Variantes.js';

export function montarPanelEscena({ capas, variantes, vista, ground, target, marcadores, preferencias, estado = () => {} }) {
  const nodo = el('div');
  const doc = () => capas.e;
  const boton = (texto, onclick, extra = {}) => el('button', { type: 'button', class: 'ed-btn' + (extra.primario ? ' ed-primario' : ''), onclick, title: extra.titulo, disabled: extra.deshabilitado, 'aria-pressed': extra.pulsado === undefined ? null : String(extra.pulsado) }, extra.icono ? svg(extra.icono, { tam: 14 }) : null, texto ? el('span', {}, texto) : null);
  const intentar = fn => { try { fn(); } catch (error) { estado(error.message); } };
  const fila = (...hijos) => el('div', { class: 'ed-fila-botones', style: 'align-items:center;flex-wrap:nowrap' }, ...hijos);
  const nombre = (t, ph) => el('input', { class: 'ed-input', type: 'text', placeholder: ph, maxLength: 80, 'aria-label': ph });
  const puntoAqui = () => [target.x, ground(target.x, target.z), target.z];

  function dibujar() {
    const d = doc(), activa = variantes.activa;
    const nuevaVar = nombre('', 'Nombre de la variante'), nuevaCam = nombre('', 'Nombre de la cámara');
    nodo.replaceChildren(
      seccion('Variantes del escenario', [
        el('div', { style: 'color:var(--ed-texto-2);line-height:1.5' }, 'Un mismo escenario con varias versiones (de día, de noche, con lluvia…). Cada variante guarda solo lo que cambia: su ambiente y los objetos que oculta.'),
        el('div', { class: 'ed-fila-botones' }, el('span', { class: 'ed-chip', ...(activa ? { 'data-tipo': 'aviso' } : {}) }, activa ? 'Editando la variante: ' + activa.nombre : 'Editando el escenario base'), activa ? boton('Volver al base', () => capas.cambiar('Ver escenario base', () => variantes.activar(null)), { icono: 'restaurar' }) : null),
        ...(d.variantes.length ? d.variantes.map(v => fila(boton(v.nombre, () => capas.cambiar('Ver variante ' + v.nombre, () => variantes.activar(v.id)), { pulsado: d.varianteActiva === v.id, icono: 'capas' }),
          boton('', () => { const n = prompt0(v.nombre); if (n) intentar(() => capas.cambiar('Renombrar variante', () => variantes.renombrar(v.id, n))); }, { icono: 'texto', titulo: 'Renombrar' }),
          boton('', () => capas.cambiar('Borrar variante', () => variantes.borrar(v.id)), { icono: 'papelera', titulo: 'Borrar variante' }))) : [el('span', { style: 'color:var(--ed-texto-3)' }, 'Todavía no hay variantes.')]),
        fila(nuevaVar, boton('Crear', () => intentar(() => { const ambiente = activa?.ambiente ?? d.ambiente; capas.cambiar('Nueva variante', () => variantes.crear(nuevaVar.value, { ambiente })); }), { icono: 'mas', titulo: 'Crea la variante con el ambiente actual' })),
        el('div', { style: 'color:var(--ed-texto-3);line-height:1.5' }, activa ? 'Mientras editas una variante, cambiar el cielo, la hora, el estilo o pulsar «Ocultar» solo afecta a esa variante.' : 'Para preparar una variante, créala y luego edítala: el escenario base no cambia.'),
      ], { clave: 'escena:variantes', preferencias }),
      seccion('Cámaras guardadas', [
        ...(d.camaras.length ? d.camaras.map(c => fila(boton(c.nombre, () => vista.aplicar(c), { icono: 'camara', titulo: 'Ir a esta cámara' }), boton('Actualizar', () => capas.cambiar('Actualizar cámara', () => { Object.assign(c, vista.capturar()); }), { titulo: 'Sustituye por la vista actual' }), boton('', () => capas.cambiar('Borrar cámara', () => { d.camaras = d.camaras.filter(x => x.id !== c.id); }), { icono: 'papelera', titulo: 'Borrar' }))) : [el('span', { style: 'color:var(--ed-texto-3)' }, 'Aún no hay cámaras guardadas.')]),
        fila(nuevaCam, boton('Guardar la vista actual', () => capas.cambiar('Guardar cámara', () => guardarCamara(d, nuevaCam.value, vista.capturar())), { icono: 'camara' })),
      ], { clave: 'escena:camaras', preferencias }),
      seccion('Marcadores de producción', [
        el('div', { class: 'ed-fila-botones' },
          boton('Punto de aparición aquí', () => { capas.cambiar('Añadir aparición', () => guardarMarcador(d, 'aparicion', '', puntoAqui())); marcadores.refrescar(); }, { icono: 'marcador' }),
          boton('Marcador de personaje aquí', () => { capas.cambiar('Añadir marcador de personaje', () => guardarMarcador(d, 'personaje', '', puntoAqui())); marcadores.refrescar(); }, { icono: 'marcador' })),
        ...(d.marcadores.length ? d.marcadores.map(m => fila(boton((m.tipo === 'aparicion' ? 'Aparición · ' : 'Personaje · ') + m.nombre, () => vista.aplicar({ position: [m.position[0] + 6, m.position[1] + 5, m.position[2] + 6], target: m.position, fov: undefined }), { icono: 'marcador', titulo: 'Ir al marcador' }),
          boton('Mover aquí', () => { capas.cambiar('Mover marcador', () => { m.position = puntoAqui(); }); marcadores.refrescar(); }),
          boton('', () => { capas.cambiar('Borrar marcador', () => { d.marcadores = d.marcadores.filter(x => x.id !== m.id); }); marcadores.refrescar(); }, { icono: 'papelera', titulo: 'Borrar' }))) : [el('span', { style: 'color:var(--ed-texto-3)' }, 'Los marcadores indican dónde empiezan los personajes y dónde se colocan. Solo se ven aquí, en el editor.')]),
      ], { clave: 'escena:marcadores', preferencias }),
    );
  }
  // Nombre nuevo para renombrar sin prompt(): se pide con un pequeño cuadro propio.
  function prompt0(actual) { return globalThis.prompt ? globalThis.prompt('Nuevo nombre', actual) : null; }
  const baja = capas.alCambiar(() => { if (!nodo.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') dibujar(); });
  dibujar();
  return { nodo, titulo: 'Preparación de escena', icono: 'camara', alMostrar: dibujar, dispose: baja };
}
