// Portapapeles interno del editor. Guarda referencias a objetos AÑADIDOS (los originales del escenario no se duplican:
// pertenecen a sectores optimizados y solo se mueven, ocultan o restauran). Cortar = copiar + eliminar al pegar.
export class Portapapeles {
  constructor() { this.entradas = []; this.cortado = false; this.pegados = 0; }

  get vacio() { return !this.entradas.length; }

  /** entradas = [{ id, posicion:[x,y,z], rotacion:[x,y,z], escala:[x,y,z] }] */
  guardar(entradas, { cortar = false } = {}) {
    this.entradas = entradas.map(e => structuredClone(e)); this.cortado = cortar; this.pegados = 0;
  }

  /**
   * Posiciones de pegado. Con `punto` (bajo el cursor) el conjunto conserva su disposición relativa y su centro
   * cae en ese punto; sin él, cada pegado se desplaza un poco para no apilar copias exactas.
   */
  destinos(punto = null, paso = .75) {
    if (this.vacio) return [];
    const n = this.entradas.length, centro = this.entradas.reduce((c, e) => [c[0] + e.posicion[0] / n, c[1] + e.posicion[1] / n, c[2] + e.posicion[2] / n], [0, 0, 0]);
    const salto = punto ? [punto[0] - centro[0], 0, punto[2] - centro[2]] : [paso * (this.pegados + 1), 0, paso * (this.pegados + 1)];
    this.pegados++;
    return this.entradas.map(e => ({ ...e, origen: e.id, posicion: [e.posicion[0] + salto[0], e.posicion[1] + salto[1], e.posicion[2] + salto[2]] }));
  }

  limpiar() { this.entradas = []; this.cortado = false; this.pegados = 0; }
}
