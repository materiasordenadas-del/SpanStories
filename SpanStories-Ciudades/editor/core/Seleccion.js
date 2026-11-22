// Selección múltiple. El registro de objetos (RegistroCiudad) solo conoce UN id «primario»;
// aquí se guarda el conjunto completo y se mantiene sincronizado con ese primario.
export class Seleccion {
  constructor(objetos) {
    this.objetos = objetos; this.conjunto = new Set(); this.oyentes = new Set(); this.sincronizando = false;
    this.previo = objetos.onChange;
    objetos.onChange = entry => {
      if (!this.sincronizando) {
        // Cambio externo (clic de otro módulo, lista antigua…): equivale a reemplazar.
        this.conjunto = new Set(entry ? [entry.id] : []);
      }
      this.previo?.(entry); this.avisar();
    };
  }

  get ids() { return [...this.conjunto]; }
  get primaria() { return this.objetos.seleccion; }
  get cantidad() { return this.conjunto.size; }
  tiene(id) { return this.conjunto.has(id); }
  raices() { return this.ids.map(id => this.objetos.obtener(id)).filter(Boolean); }

  poner(ids, preferida = null) {
    const validos = [...new Set(ids)].filter(id => this.objetos.entries.has(id));
    this.conjunto = new Set(validos);
    const primaria = validos.includes(preferida) ? preferida : validos.includes(this.objetos.seleccion) ? this.objetos.seleccion : validos.at(-1) ?? null;
    this.sincronizando = true;
    try { this.objetos.seleccionar(primaria); } finally { this.sincronizando = false; }
  }

  reemplazar(id) { this.poner(id ? [id] : []); }
  limpiar() { this.poner([]); }
  agregar(id) { this.poner([...this.conjunto, id], id); }
  quitar(id) { this.poner(this.ids.filter(x => x !== id)); }
  alternar(id) { this.tiene(id) ? this.quitar(id) : this.agregar(id); }

  /** Elimina de la selección ids que ya no existen (objeto borrado, sector descargado). */
  depurar() { const antes = this.conjunto.size; this.poner(this.ids); return antes !== this.conjunto.size; }

  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  avisar() { for (const fn of this.oyentes) fn(this); }
  dispose() { this.objetos.onChange = this.previo; this.oyentes.clear(); }
}
