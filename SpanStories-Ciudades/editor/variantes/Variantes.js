// Variantes de escenario: UN mundo y varias configuraciones (mediodía, noche, lluvia, mercado con puestos…) sin duplicar geometría.
// Una variante guarda solo las DIFERENCIAS sobre el escenario base: su ambiente (null = hereda el del base) y los objetos que oculta.
// Con una variante activa, los cambios de ambiente y «ocultar» se escriben en ella y no en el escenario base.
import { nuevoId } from '../core/EscenarioDoc.js';

export class Variantes {
  /** doc = state.escenario · alAplicar(variante|null) lo llama al cambiar de variante (aplica ambiente y visibilidad) */
  constructor({ doc, alAplicar = () => {}, alCambiar = () => {} }) { this.doc = () => doc(); this.alAplicar = alAplicar; this.alCambiar = alCambiar; }

  get lista() { return this.doc().variantes; }
  get activa() { const d = this.doc(); return d.variantes.find(v => v.id === d.varianteActiva) ?? null; }
  porId(id) { return this.lista.find(v => v.id === id) ?? null; }

  /** Crea una variante con el ambiente y los objetos ocultos actuales (de la variante activa o del base). */
  crear(nombre, { ambiente = null, ocultos = [] } = {}) {
    const n = String(nombre ?? '').trim(); if (!n) throw new Error('La variante necesita un nombre.');
    if (this.lista.some(v => v.nombre.toLowerCase() === n.toLowerCase())) throw new Error('Ya existe una variante con ese nombre.');
    const v = { id: nuevoId('variante'), nombre: n.slice(0, 80), ambiente: ambiente ? structuredClone(ambiente) : null, ocultos: [...new Set(ocultos)] };
    this.lista.push(v); this.alCambiar(); return v;
  }
  borrar(id) {
    const d = this.doc(); const i = d.variantes.findIndex(v => v.id === id); if (i < 0) return false;
    d.variantes.splice(i, 1); if (d.varianteActiva === id) { d.varianteActiva = null; this.alAplicar(null); }
    this.alCambiar(); return true;
  }
  renombrar(id, nombre) { const v = this.porId(id); if (!v) throw new Error('Variante desconocida.'); const n = String(nombre).trim(); if (!n) throw new Error('El nombre no puede estar vacío.'); v.nombre = n.slice(0, 80); this.alCambiar(); }
  /** Cambia la variante visible (null = escenario base). */
  activar(id) {
    const d = this.doc(); if (id !== null && !this.porId(id)) throw new Error('Variante desconocida.');
    d.varianteActiva = id; this.alAplicar(this.activa); this.alCambiar();
  }
  /** Guarda el ambiente actual en la variante activa (o devuelve false si se está en el base). */
  guardarAmbiente(perfil) { const v = this.activa; if (!v) return false; v.ambiente = perfil ? structuredClone(perfil) : null; return true; }
  alternarOculto(id) { const v = this.activa; if (!v) return false; const i = v.ocultos.indexOf(id); if (i >= 0) v.ocultos.splice(i, 1); else v.ocultos.push(id); this.alCambiar(); return true; }
  ocultosActivos() { return new Set(this.activa?.ocultos ?? []); }
}

// -- Cámaras guardadas y marcadores (datos simples del documento) -----------------------------------------------------
export function guardarCamara(doc, nombre, camara) {
  const n = String(nombre ?? '').trim() || 'Cámara ' + (doc.camaras.length + 1);
  const c = { id: nuevoId('cam'), nombre: n.slice(0, 80), position: camara.position, target: camara.target, fov: camara.fov };
  doc.camaras.push(c); return c;
}
export function guardarMarcador(doc, tipo, nombre, position, giro = 0) {
  if (!['aparicion', 'personaje'].includes(tipo)) throw new Error('Tipo de marcador desconocido.');
  const m = { id: nuevoId('marca'), tipo, nombre: String(nombre ?? '').trim().slice(0, 80) || (tipo === 'aparicion' ? 'Aparición' : 'Personaje') + ' ' + (doc.marcadores.filter(x => x.tipo === tipo).length + 1), position, giro };
  doc.marcadores.push(m); return m;
}
