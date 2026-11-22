// Capas, grupos, bloqueo y aislamiento. Los datos persistentes viven en state.escenario; el aislamiento es temporal.
// Visibilidad final de un objeto = base && !oculto por el usuario && capa visible && (sin aislamiento || dentro del aislamiento).
import {CAPA_BASE, CAPA_ANADIDOS, nuevoId} from './EscenarioDoc.js';
import {capturarObjeto} from '../../engine/CityProject.js';

/** Deja el documento coherente: sin grupos de menos de 2 miembros ni referencias a grupos/capas inexistentes. */
function normalizar(e) {
  e.grupos = e.grupos.filter(g => g.miembros.length > 1);
  const grupos = new Set(e.grupos.map(g => g.id)), capas = new Set(e.capas.map(c => c.id));
  for (const [id, o] of Object.entries(e.objetos)) {
    if (o.grupo && !grupos.has(o.grupo)) delete o.grupo;
    if (o.capa && !capas.has(o.capa)) delete o.capa;
    if (!Object.keys(o).length) delete e.objetos[id];
  }
}

export class Capas {
  /** state: EstadoEditorCiudad (con .escenario y registrarComando), objetos: RegistroCiudad */
  constructor({ state, objetos, alCambiar = () => {} }) {
    this.state = state; this.objetos = objetos; this.alCambiarExterno = alCambiar; this.aislados = null; this.ocultosVariante = new Set(); this.oyentes = new Set();
  }
  get e() { return this.state.escenario; }

  propiedades(id) { return this.e.objetos[id] ?? {}; }
  capaDe(id) { return this.propiedades(id).capa ?? (id.startsWith('import-') ? CAPA_ANADIDOS : CAPA_BASE); }
  grupoDe(id) { return this.propiedades(id).grupo ?? null; }
  bloqueado(id) {
    const capa = this.e.capas.find(c => c.id === this.capaDe(id));
    return !!this.propiedades(id).bloqueado || !!capa?.bloqueada;
  }
  capaVisible(id) { return this.e.capas.find(c => c.id === this.capaDe(id))?.visible !== false; }

  /** Aplica la visibilidad compuesta a un objeto (o a todos). No toca `ocultoUsuario`, que es decisión individual. */
  aplicarVisibilidad(ids = [...this.objetos.entries.keys()]) {
    for (const id of ids) {
      const raiz = this.objetos.obtener(id); if (!raiz) continue;
      if (raiz.userData.editorVisibleBase === undefined) raiz.userData.editorVisibleBase = raiz.visible;
      const aislado = !this.aislados || this.aislados.has(id);
      raiz.userData.editorOcultoPorCapa = !this.capaVisible(id) || !aislado || (this.fuenteVariante ? this.fuenteVariante() : this.ocultosVariante).has(id);
      raiz.visible = raiz.userData.editorVisibleBase && !raiz.userData.ocultoUsuario && !raiz.userData.editorOcultoPorCapa;
      raiz.userData.instanceBinding?.sync?.();
    }
    this.avisar(); this.alCambiarExterno();
  }

  // -- Mutaciones reversibles (una entrada de historial cada una) --
  cambiar(nombre, mutar) {
    const antes = structuredClone(this.e);
    mutar(this.e); normalizar(this.e);
    const despues = structuredClone(this.e);
    const poner = valor => { for (const k of Object.keys(this.e)) delete this.e[k]; Object.assign(this.e, structuredClone(valor)); this.alRestaurar?.(); this.aplicarVisibilidad(); };
    this.state.registrarComando({ nombre, undo: () => poner(antes), redo: () => poner(despues) });
    this.state.dirty = true; this.aplicarVisibilidad();
  }

  fijar(ids, claves, nombre = 'Propiedades') {
    this.cambiar(nombre, e => { for (const id of ids) { e.objetos[id] = { ...(e.objetos[id] ?? {}), ...claves }; for (const k of Object.keys(claves)) if (claves[k] === undefined || claves[k] === false) delete e.objetos[id][k]; if (!Object.keys(e.objetos[id]).length) delete e.objetos[id]; } });
  }
  bloquear(ids, valor = true) { this.fijar(ids, { bloqueado: valor }, valor ? 'Bloquear' : 'Desbloquear'); }
  moverACapa(ids, capa) { this.fijar(ids, { capa }, 'Mover a capa'); }

  crearCapa(nombre) {
    const id = nuevoId('capa');
    this.cambiar('Nueva capa', e => e.capas.push({ id, nombre: nombre.trim() || 'Capa', visible: true, bloqueada: false }));
    return id;
  }
  editarCapa(id, cambios) { this.cambiar('Editar capa', e => { const c = e.capas.find(x => x.id === id); if (c) Object.assign(c, cambios); }); }
  eliminarCapa(id) {
    if ([CAPA_BASE, CAPA_ANADIDOS].includes(id)) throw new Error('Las capas del sistema no se pueden eliminar.');
    this.cambiar('Eliminar capa', e => { e.capas = e.capas.filter(c => c.id !== id); for (const o of Object.values(e.objetos)) if (o.capa === id) delete o.capa; });
  }

  agrupar(ids, nombre = 'Grupo') {
    const miembros = [...new Set(ids)].filter(id => this.objetos.entries.has(id));
    if (miembros.length < 2) throw new Error('Selecciona al menos dos objetos para agrupar.');
    const id = nuevoId('grupo');
    this.cambiar('Agrupar', e => {
      for (const g of e.grupos) g.miembros = g.miembros.filter(m => !miembros.includes(m));
      e.grupos.push({ id, nombre, miembros });
      for (const m of miembros) e.objetos[m] = { ...(e.objetos[m] ?? {}), grupo: id };
    });
    return id;
  }
  desagrupar(grupoId) {
    this.cambiar('Desagrupar', e => {
      const g = e.grupos.find(x => x.id === grupoId); if (!g) return;
      for (const m of g.miembros) if (e.objetos[m]) { delete e.objetos[m].grupo; if (!Object.keys(e.objetos[m]).length) delete e.objetos[m]; }
      e.grupos = e.grupos.filter(x => x.id !== grupoId);
    });
  }
  renombrarGrupo(grupoId, nombre) { this.cambiar('Renombrar grupo', e => { const g = e.grupos.find(x => x.id === grupoId); if (g) g.nombre = nombre; }); }
  miembrosDe(grupoId) { return this.e.grupos.find(g => g.id === grupoId)?.miembros ?? []; }
  /** Al seleccionar un miembro se seleccionan todos los de su grupo. */
  expandirSeleccion(ids) { const out = new Set(ids); for (const id of ids) { const g = this.grupoDe(id); if (g) for (const m of this.miembrosDe(g)) out.add(m); } return [...out]; }

  // -- Aislamiento (no se guarda): oculta todo menos la selección --
  aislar(ids) { this.aislados = new Set(ids); this.aplicarVisibilidad(); }
  salirDeAislamiento() { this.aislados = null; this.aplicarVisibilidad(); }
  get aislando() { return !!this.aislados; }
  /** Muestra de nuevo todo lo que el usuario ocultó (una sola entrada de historial). */
  mostrarTodo() {
    const items = [...this.objetos.entries.keys()].filter(id => this.objetos.obtener(id)?.userData.ocultoUsuario).map(id => ({ id, data: { hidden: false } }));
    if (items.length) this.state.applyMany(items);
    this.aplicarVisibilidad(); return items.length;
  }

  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  avisar() { for (const fn of this.oyentes) fn(this); }
}
