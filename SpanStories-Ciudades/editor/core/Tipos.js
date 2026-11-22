// Objetos DISTINTOS frente a ejemplares. Un escenario puede tener 100 árboles que son el mismo modelo repetido: eso es
// 1 objeto con 100 ejemplares, no 100 objetos. Aquí se decide qué ejemplares comparten «tipo» y se cuentan por separado.
//
// Regla (sobre el id estable de cada ejemplar):
//   · «arbol:3f27…», «alcorque:df34…»  → mismo tipo = lo que hay antes del código (los ejemplares repetidos llevan un código hexadecimal).
//   · copias de un GLB añadido («import-…») → mismo tipo = el mismo archivo.
//   · «gen:edificio:90», «BCN_H01_Batllo»   → piezas distintas: cada una es su propio tipo.
const HASH = /^(.+?):[0-9a-f]{6,}$/i;
const NOMBRES = { arbol: 'Árbol', alcorque: 'Alcorque', farola: 'Farola', banco: 'Banco', papelera: 'Papelera', seto: 'Seto', arbusto: 'Arbusto', maceta: 'Maceta', señal: 'Señal', semaforo: 'Semáforo' };

const bonito = clave => NOMBRES[clave.toLowerCase()] ?? (clave.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()));

/** { clave, nombre, repetible } de un ejemplar. `archivo` = nombre del GLB si es una copia añadida. */
export function claveTipo(id, archivo = null) {
  if (archivo) return { clave: 'glb:' + archivo.toLowerCase(), nombre: archivo.replace(/\.glb$/i, ''), repetible: true };
  const m = HASH.exec(id);
  if (m) return { clave: 'tipo:' + m[1].toLowerCase(), nombre: bonito(m[1]), repetible: true };
  return { clave: 'unico:' + id, nombre: id, repetible: false };
}

/**
 * entradas = [{ id, etiqueta, tipo }]; archivoDe(id) → nombre de GLB o null.
 * Devuelve { grupos:[{ clave, nombre, repetible, ids }], distintos, ejemplares, repetidos } con los grupos ordenados.
 */
export function agruparTipos(entradas, archivoDe = () => null) {
  const mapa = new Map();
  for (const e of entradas) {
    const t = claveTipo(e.id, archivoDe(e.id));
    const nombre = t.repetible ? t.nombre : (e.etiqueta || e.id);
    if (!mapa.has(t.clave)) mapa.set(t.clave, { clave: t.clave, nombre, repetible: t.repetible, ids: [] });
    mapa.get(t.clave).ids.push(e.id);
  }
  const grupos = [...mapa.values()].sort((a, b) => b.ids.length - a.ids.length || a.nombre.localeCompare(b.nombre, 'es'));
  return { grupos, distintos: grupos.length, ejemplares: entradas.length, repetidos: grupos.filter(g => g.ids.length > 1).length };
}

const miles = n => n.toLocaleString('es-ES');
/** «37 objetos distintos · 3 308 ejemplares» (o solo «12 objetos» si no hay repeticiones). */
export function textoRecuento({ distintos, ejemplares }) {
  const uno = (n, s, p) => `${miles(n)} ${n === 1 ? s : p}`;
  return distintos === ejemplares ? uno(distintos, 'objeto', 'objetos') : `${uno(distintos, 'objeto distinto', 'objetos distintos')} · ${uno(ejemplares, 'ejemplar', 'ejemplares')}`;
}
