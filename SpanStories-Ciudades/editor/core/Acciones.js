// REGISTRO ÚNICO de acciones del editor. Menús, barra, clic derecho, atajos y paleta de comandos se generan
// desde aquí: una función nueva se registra una vez y aparece donde corresponde, sin botones sueltos.
//
// acción = { id, nombre, icono, menu, grupo, atajo, contextos, habilitada(ctx), marcada(ctx), ejecutar(ctx, args), ayuda }
//  - menu: 'Archivo' | 'Editar' | 'Añadir' | 'Vista' | 'Herramientas' (o null si solo vive en la barra/contexto)
//  - grupo: subgrupo dentro del menú (se separan con una línea)
//  - contextos: lista de 'objeto' | 'vacio' | 'multi' para el menú del clic derecho
//  - atajo: texto tipo 'Ctrl+Shift+Z'; los atajos son opcionales (todo se alcanza con el ratón)
export const MENUS = Object.freeze(['Archivo', 'Editar', 'Añadir', 'Vista', 'Herramientas']);

/** 'Ctrl+Shift+Z' → forma canónica ordenada 'ctrl+shift+z'. */
export function normalizarAtajo(texto) {
  const partes = String(texto).toLowerCase().split('+').map(p => p.trim()).filter(Boolean);
  const tecla = partes.pop();
  const mods = ['ctrl', 'alt', 'shift'].filter(m => partes.includes(m) || (m === 'ctrl' && (partes.includes('cmd') || partes.includes('meta'))));
  return [...mods, tecla].join('+');
}

/** Atajo canónico de un KeyboardEvent (usa event.code para letras, para no depender del teclado). */
export function atajoDeEvento(event) {
  const code = event.code || '';
  let tecla = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : String(event.key || code).toLowerCase();
  if (tecla === ' ') tecla = 'space';
  if (['control', 'shift', 'alt', 'meta'].includes(tecla)) return '';
  const mods = [];
  if (event.ctrlKey || event.metaKey) mods.push('ctrl');
  if (event.altKey) mods.push('alt');
  if (event.shiftKey) mods.push('shift');
  return [...mods, tecla].join('+');
}

export class RegistroAcciones {
  constructor() { this.mapa = new Map(); this.oyentes = new Set(); this.porAtajo = new Map(); }

  registrar(accion) {
    const { id, nombre } = accion;
    if (typeof id !== 'string' || !id || typeof nombre !== 'string' || !nombre) throw new Error('Una acción necesita id y nombre.');
    if (this.mapa.has(id)) throw new Error('Acción duplicada: ' + id);
    if (typeof accion.ejecutar !== 'function') throw new Error('La acción «' + id + '» necesita ejecutar().');
    if (accion.menu && !MENUS.includes(accion.menu)) throw new Error('Menú desconocido: ' + accion.menu);
    const completa = { icono: '', menu: null, grupo: '', atajo: '', contextos: [], ayuda: '', orden: this.mapa.size, ...accion };
    if (completa.atajo) {
      const clave = normalizarAtajo(completa.atajo);
      if (this.porAtajo.has(clave)) throw new Error(`Atajo ${completa.atajo} ya usado por ${this.porAtajo.get(clave)}.`);
      this.porAtajo.set(clave, id);
    }
    this.mapa.set(id, completa);
    this.avisar();
    return () => this.retirar(id);
  }

  registrarVarias(lista) { return lista.map(a => this.registrar(a)); }

  retirar(id) {
    const accion = this.mapa.get(id);
    if (!accion) return false;
    if (accion.atajo) this.porAtajo.delete(normalizarAtajo(accion.atajo));
    this.mapa.delete(id); this.avisar(); return true;
  }

  obtener(id) { return this.mapa.get(id) ?? null; }
  habilitada(id, ctx) { const a = this.mapa.get(id); return !!a && (a.habilitada ? !!a.habilitada(ctx) : true); }
  marcada(id, ctx) { const a = this.mapa.get(id); return !!a?.marcada && !!a.marcada(ctx); }

  async ejecutar(id, ctx, args) {
    const accion = this.mapa.get(id);
    if (!accion) throw new Error('Acción desconocida: ' + id);
    if (!this.habilitada(id, ctx)) return false;
    await accion.ejecutar(ctx, args);
    return true;
  }

  /** Acciones de un menú agrupadas: [[grupo, [acciones]], ...] en orden de registro. */
  deMenu(menu) { return this.agrupar([...this.mapa.values()].filter(a => a.menu === menu)); }

  /** Acciones para el clic derecho según el contexto ('objeto' | 'multi' | 'vacio'). */
  deContexto(contexto) { return this.agrupar([...this.mapa.values()].filter(a => a.contextos.includes(contexto)), 'grupoContexto'); }

  agrupar(lista, campo = 'grupo') {
    const grupos = new Map();
    for (const a of lista.sort((x, y) => x.orden - y.orden)) {
      const clave = a[campo] || a.grupo || '';
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(a);
    }
    return [...grupos.entries()];
  }

  /** Paleta de comandos: busca sin distinguir mayúsculas ni tildes en nombre, menú y ayuda. */
  buscar(texto, ctx = null) {
    const limpio = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const q = limpio(texto).trim();
    const todas = [...this.mapa.values()].sort((a, b) => a.orden - b.orden);
    const lista = !q ? todas : todas.filter(a => limpio(`${a.nombre} ${a.menu ?? ''} ${a.ayuda}`).includes(q))
      .sort((a, b) => (limpio(a.nombre).startsWith(q) ? 0 : 1) - (limpio(b.nombre).startsWith(q) ? 0 : 1));
    return ctx ? lista.map(a => ({ accion: a, habilitada: this.habilitada(a.id, ctx) })) : lista.map(a => ({ accion: a, habilitada: true }));
  }

  /** Devuelve la acción asociada a un atajo (o null). */
  porEvento(event) { const id = this.porAtajo.get(atajoDeEvento(event)); return id ? this.mapa.get(id) : null; }

  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  avisar() { for (const fn of this.oyentes) fn(); }
}
