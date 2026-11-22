// Pestaña «Texto»: escribe la acción → Kimodo local la genera → clip en la librería «Kimodo»
// → se aplica al personaje puesto (Mixamo u otro) por el retarget canónico del Taller.
// Solo lleva pistas de cuerpo (cadera, columna, cuello, cabeza, brazos, piernas): no toca dedos ni cara.
import { $, h, slug } from './dom.js';

const ESTADOS = { cola: 'En cola', cargando: 'Cargando el modelo (la primera vez tarda ~1 min más)…', generando: 'Generando el movimiento…', guardando: 'Guardando en la librería…', listo: 'Hecho y aplicado', error: 'Error' };
// Kimodo solo entiende inglés: aviso si el texto parece español.
const PARECE_ES = /[ñáéíóú¿¡]|\b(una?|el|la|los|las|persona|camina|salta|corre|mano|derecha|izquierda|con|y|que)\b/i;

// Id del clip en el Taller: borradores en «Kimodo», guardadas en «Kimodo guardadas».
export function idDe(archivo) {
  const guardada = /^guardadas\//i.test(archivo);
  const base = archivo.split('/').pop().replace(/\.glb$/i, '');
  return `lib:${slug(guardada ? 'Kimodo guardadas' : 'Kimodo')}:${slug(base)}`;
}

export function buildTexto(app) {
  const el = $('#pTexto');
  const st = { tramos: [{ texto: '', segundos: 4 }], pasos: 50, semilla: '', transicion: 10, nombre: '', job: null, info: null, lista: [] };

  const api = async (accion, body) => {
    const r = await fetch(`/api/kimodo/${accion}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return r.json();
  };
  const trabajando = () => st.job && !['listo', 'error'].includes(st.job.estado);

  // Zonas que se actualizan solas sin tocar el formulario (no se pierde lo que estás escribiendo).
  const zEstado = h('div', { class: 'small muted', style: { margin: '4px 0 8px' } });
  const zTramos = h('div');
  const zBoton = h('button', { class: 'btn acc', style: { width: '100%' }, onclick: () => generar() });
  const zTrabajo = h('div', { class: 'small', style: { marginTop: '8px' } });
  const zLista = h('div', { class: 'small' });
  const vPasos = h('span', { class: 'muted' });

  function pintarEstado() {
    const i = st.info;
    zEstado.textContent = !i ? 'Comprobando Kimodo…'
      : !i.listo ? `Kimodo no está listo. Falta: ${i.faltan.join(', ')}`
      : i.ocupado ? 'Generando…'
      : i.activo ? `Listo · modelo en memoria (${i.texto}); se libera tras 10 min sin uso`
      : `Listo · el modelo (${i.texto}) se carga con la primera animación`;
    zBoton.disabled = !!trabajando() || !i?.listo;
    zBoton.textContent = trabajando() ? 'Generando…' : '✦ Generar animación';
    const j = st.job;
    zTrabajo.replaceChildren(...[
      ...(j ? [
        h('div', {}, `${ESTADOS[j.estado] || j.estado} · ${Math.round((Date.now() - j.t0) / 1000)} s · semilla ${j.semilla}`),
        j.estado === 'error' ? h('div', { style: { color: 'var(--bad, #e66)' } }, j.error) : null,
        trabajando() && j.log?.length ? h('div', { class: 'muted', style: { fontFamily: 'monospace', fontSize: '10px', whiteSpace: 'pre-wrap' } }, j.log.slice(-2).join('\n')) : null,
        j.estado === 'listo' && j.archivo && !j.archivo.startsWith('guardadas/')
          ? h('div', { style: { display: 'flex', gap: '6px', marginTop: '6px' } },
            h('button', { class: 'btn acc', style: { flex: 1 }, onclick: () => guardar(j.archivo) }, '★ Me gusta: guardar'),
            h('button', { class: 'btn', title: 'Descartar este borrador', onclick: () => descartar({ archivo: j.archivo }) }, '🗑'))
          : null,
      ] : []),
      h('button', { class: 'btn sm', style: { marginTop: '6px', width: '100%' }, title: 'Guarda la postura del fotograma actual en Biblioteca › Poses', onclick: () => app.saveBodyPose() }, 'Guardar la pose de este fotograma'),
      i?.activo && !trabajando() ? h('button', { class: 'btn sm', style: { marginTop: '4px' }, title: 'Cierra Kimodo y libera ~5,5 GB de RAM', onclick: async () => { await api('parar', {}); refrescar(); } }, 'Liberar memoria') : null,
    ].filter(Boolean));
  }

  function pintarTramos() {
    zTramos.replaceChildren(...[
      ...st.tramos.map((t, i) => {
        const aviso = h('div', { class: 'small', style: { color: 'var(--warn, #d9a441)', display: PARECE_ES.test(t.texto) ? '' : 'none' } }, 'Parece español: Kimodo solo entiende inglés.');
        return h('div', { style: { border: '1px solid var(--line)', borderRadius: '4px', padding: '6px', marginBottom: '6px' } },
          h('div', { class: 'small', style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px' } },
            h('b', {}, `Tramo ${i + 1}`),
            h('span', { style: { flex: 1 } }),
            'segundos',
            h('input', { type: 'number', min: 1, max: 10, step: 0.5, value: t.segundos, style: { width: '56px' }, oninput: (e) => (t.segundos = +e.target.value) }),
            st.tramos.length > 1 ? h('button', { class: 'btn sm', title: 'Quitar tramo', onclick: () => { st.tramos.splice(i, 1); pintarTramos(); } }, '✕') : null,
          ),
          h('textarea', { rows: 3, style: { width: '100%', boxSizing: 'border-box', resize: 'vertical' }, placeholder: 'a person jumps happily', oninput: (e) => { t.texto = e.target.value; aviso.style.display = PARECE_ES.test(t.texto) ? '' : 'none'; } }, t.texto),
          aviso,
        );
      }),
      st.tramos.length < 6 ? h('button', { class: 'btn sm', onclick: () => { st.tramos.push({ texto: '', segundos: 3 }); pintarTramos(); } }, '+ Tramo') : null,
    ].filter(Boolean));
  }

  // ---------- guardar / descartar ----------
  async function guardar(archivo) {
    const actual = archivo.split('/').pop().replace(/\.glb$/i, '');
    const nombre = prompt('Nombre para guardarla (librería «Kimodo guardadas»)', actual);
    if (nombre === null) return;
    const r = await api('guardar', { archivo, nombre });
    if (!r.ok) return app.toast(r.error, true);
    const viejo = idDe(archivo);
    const enUso = app.engine.doc.strips.some((s) => s.clipId === viejo);
    app.library.delete(viejo);
    if (st.job?.archivo === archivo) st.job.archivo = r.archivo;
    await cargarLista();
    pintarEstado();
    if (enUso) await usar(r.archivo, false); // la tira apunta ya a la guardada
    else app.scanLibrary();
    app.panels.refreshLibrary?.();
    app.toast(`★ Guardada: ${r.nombre}`);
  }

  async function descartar(a) {
    const guardada = a.archivo.startsWith('guardadas/');
    if (guardada && !confirm(`¿Borrar del disco la guardada «${a.archivo.split('/').pop()}»?`)) return;
    const r = await api('descartar', { archivo: a.archivo, guardada });
    if (!r.ok) return app.toast(r.error, true);
    app.library.delete(idDe(a.archivo));
    app.panels.refreshLibrary?.();
    if (st.job?.archivo === a.archivo) st.job = null;
    await cargarLista();
    pintarEstado();
  }

  async function limpiar() {
    const n = st.lista.filter((a) => !a.archivo.startsWith('guardadas/')).length;
    if (!n || !confirm(`¿Borrar los ${n} borradores? Las guardadas no se tocan.`)) return;
    const r = await api('limpiar', {});
    for (const f of r.borrados || []) app.library.delete(idDe(f));
    app.panels.refreshLibrary?.();
    await cargarLista();
  }

  const fila = (a) =>
    h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--line)' } },
      h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: a.segmentos.map((s) => `${s.segundos}s · ${s.texto}`).join('\n') + `\nsemilla ${a.semilla}` }, a.archivo.split('/').pop().replace(/\.glb$/i, ''), h('span', { class: 'muted' }, ` · ${(a.fotogramas / 30).toFixed(1)} s`)),
      h('button', { class: 'btn sm', title: 'Aplicar al personaje puesto', onclick: () => usar(a.archivo) }, 'Usar'),
      a.archivo.startsWith('guardadas/') ? null : h('button', { class: 'btn sm acc', title: 'Guardar en «Kimodo guardadas»', onclick: () => guardar(a.archivo) }, '★'),
      h('button', { class: 'btn sm', title: 'Volver a cargar este texto y su semilla', onclick: () => { st.tramos = a.segmentos.map((s) => ({ ...s })); st.semilla = String(a.semilla); semilla.value = st.semilla; pintarTramos(); } }, '↺'),
      h('button', { class: 'btn sm', title: a.archivo.startsWith('guardadas/') ? 'Borrar del disco' : 'Descartar borrador', onclick: () => descartar(a) }, '🗑'),
    );

  function pintarLista() {
    const guardadas = st.lista.filter((a) => a.archivo.startsWith('guardadas/'));
    const borradores = st.lista.filter((a) => !a.archivo.startsWith('guardadas/'));
    zLista.replaceChildren(...[
      h('div', { class: 'panel-title', style: { marginTop: '12px' } }, `★ Guardadas (${guardadas.length})`),
      ...(guardadas.length ? guardadas.map(fila) : [h('div', { class: 'muted' }, 'Pulsa ★ en una que te guste. Quedan en Biblioteca › Kimodo guardadas.')]),
      h('div', { class: 'panel-title', style: { marginTop: '12px', display: 'flex', alignItems: 'center' } }, h('span', { style: { flex: 1 } }, `Borradores (${borradores.length})`),
        borradores.length ? h('button', { class: 'btn sm', title: 'Borra todos los borradores; las guardadas no se tocan', onclick: limpiar }, 'Borrar borradores') : null),
      ...(borradores.length ? borradores.slice(0, 40).map(fila) : [h('div', { class: 'muted' }, 'Aquí aparece cada animación que generes.')]),
    ].filter(Boolean));
  }

  const semilla = h('input', { type: 'text', placeholder: 'aleatoria', value: st.semilla, oninput: (e) => { e.target.value = e.target.value.replace(/\D/g, ''); st.semilla = e.target.value; } });
  vPasos.textContent = ` ${st.pasos}`;
  el.replaceChildren(
    h('div', { class: 'panel-title' }, 'Texto → Animación (Kimodo local)'),
    zEstado,
    h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Escribe en inglés lo que hace la persona («a person walks forward and waves with the right hand»). Se aplica al personaje puesto; solo mueve el cuerpo, nunca los dedos ni la cara. Varios tramos se encadenan con transición suave.'),
    zTramos,
    h('div', { class: 'small', style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', alignItems: 'center', margin: '8px 0' } },
      h('span', {}, 'Calidad', vPasos), h('input', { type: 'range', min: 10, max: 100, step: 5, value: st.pasos, title: 'Pasos de difusión: más = mejor y más lento', oninput: (e) => { st.pasos = +e.target.value; vPasos.textContent = ` ${st.pasos}`; } }),
      'Semilla', semilla,
      'Transición', h('input', { type: 'number', min: 0, max: 30, value: st.transicion, title: 'Fotogramas de mezcla entre tramos', oninput: (e) => (st.transicion = +e.target.value) }),
      'Nombre', h('input', { type: 'text', placeholder: 'automático', value: st.nombre, oninput: (e) => (st.nombre = e.target.value) }),
    ),
    zBoton,
    zTrabajo,
    zLista,
  );

  // Espera a que la biblioteca lea el GLB nuevo y lo aplica al personaje puesto.
  async function usar(archivo, avisar = true) {
    const id = idDe(archivo);
    for (let i = 0; i < 40 && !app.library.has(id); i++) {
      if (i % 5 === 0) app.scanLibrary();
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!app.library.has(id)) return app.toast(`No encuentro «${archivo}» en la librería Kimodo`, true);
    app.useClip(id);
    if (avisar) app.toast(`Aplicada a ${app.charMeta?.name || 'el personaje'}: ${app.library.get(id).name}`);
  }

  async function generar() {
    if (trabajando()) return;
    const tramos = st.tramos.filter((t) => t.texto.trim());
    if (!tramos.length) return app.toast('Escribe qué debe hacer el personaje', true);
    const r = await api('generar', { segmentos: tramos, pasos: st.pasos, semilla: st.semilla, transicion: st.transicion, nombre: st.nombre }).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) return app.toast(r.error, true);
    st.job = { id: r.id, estado: 'cola', t0: Date.now(), nombre: r.nombre, semilla: r.semilla };
    pintarEstado();
    seguir();
  }

  async function seguir() {
    const j = st.job;
    if (!j) return;
    const r = await api(`trabajo?id=${j.id}`).catch(() => null);
    if (r?.ok) Object.assign(j, r);
    else if (r && !r.ok) Object.assign(j, { estado: 'error', error: 'El servidor se reinició y perdió el trabajo; vuelve a generar' });
    pintarEstado();
    if (j.estado === 'listo') {
      await usar(j.archivo);
      cargarLista();
      return refrescar();
    }
    if (j.estado === 'error') {
      app.toast(`Kimodo: ${j.error}`, true);
      return refrescar();
    }
    setTimeout(seguir, 2000);
  }

  async function cargarLista() {
    const r = await api('lista').catch(() => null);
    st.lista = (r?.animaciones || []).slice().reverse();
    pintarLista();
  }

  async function refrescar() {
    st.info = await api('estado').catch(() => null);
    pintarEstado();
  }

  // Al abrir la pestaña, estado al día.
  document.querySelector('[data-tab=texto]')?.addEventListener('click', () => { refrescar(); cargarLista(); });

  pintarTramos();
  pintarLista();
  pintarEstado();
  refrescar();
  cargarLista();
  return { refrescar: () => Promise.all([refrescar(), cargarLista()]), usar };
}
