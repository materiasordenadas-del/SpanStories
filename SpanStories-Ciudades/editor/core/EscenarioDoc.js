// Documento único del escenario (formato v2). Guarda las MODIFICACIONES, no una copia del mundo:
//   overrides / imports (formato v1, sin cambios) + escenario { capas, grupos, objetos, ambiente, variantes, camaras, marcadores }.
// El proyecto v1 se abre siempre: migrarEscenario() le añade la parte nueva vacía sin tocar lo anterior.
export const ESCENARIO_VERSION = 2;
export const CAPA_BASE = 'base';
export const CAPA_ANADIDOS = 'anadidos';
const LIMITE_JSON = 24 * 1024 * 1024;              // secciones nuevas (el césped pintado es lo más grande)
const ID = /^[\w:.\-]{1,200}$/;

export function escenarioVacio() {
  return {
    capas: [
      { id: CAPA_BASE, nombre: 'Escenario original', visible: true, bloqueada: false },
      { id: CAPA_ANADIDOS, nombre: 'Objetos añadidos', visible: true, bloqueada: false },
    ],
    grupos: [],            // { id, nombre, miembros:[id] }
    objetos: {},           // id → { capa?, bloqueado?, grupo?, favorito? }
    ambiente: null,        // perfiles de SceneEnvironment (cielo, césped, terreno, estilo, clima)
    variantes: [],         // diferencias sobre el escenario base (fase 5)
    camaras: [],           // cámaras guardadas { id, nombre, position, target, fov }
    marcadores: [],        // puntos de aparición y marcadores de personajes { id, tipo:'aparicion'|'personaje', nombre, position:[x,y,z], giro }
    prefabs: [],           // grupos reutilizables { id, nombre, items:[{ archivo, sha, position, rotation, scale, etiqueta }] } (posiciones relativas al primero)
    varianteActiva: null,  // id de la variante que se ve por defecto (null = escenario base)
  };
}

const esLista = v => Array.isArray(v);
const esObjeto = v => v && typeof v === 'object' && !Array.isArray(v);

/** Valida la estructura (no el contenido de ambiente, que valida su propio módulo). Lanza Error con un mensaje claro. */
export function validarEscenario(e) {
  if (!esObjeto(e)) throw new Error('Sección «escenario» inválida.');
  for (const clave of ['capas', 'grupos', 'variantes', 'camaras', 'marcadores']) if (!esLista(e[clave])) throw new Error(`escenario.${clave} debe ser una lista.`);
  if (!esObjeto(e.objetos)) throw new Error('escenario.objetos debe ser un objeto.');
  const ids = new Set();
  for (const c of e.capas) {
    if (!esObjeto(c) || !ID.test(c.id ?? '') || typeof c.nombre !== 'string' || !c.nombre.trim() || ids.has(c.id)) throw new Error('Capa inválida o duplicada.');
    ids.add(c.id);
  }
  if (!ids.has(CAPA_BASE)) throw new Error('Falta la capa base.');
  const gids = new Set();
  for (const g of e.grupos) {
    if (!esObjeto(g) || !ID.test(g.id ?? '') || gids.has(g.id) || typeof g.nombre !== 'string' || !esLista(g.miembros) || !g.miembros.every(m => typeof m === 'string')) throw new Error('Grupo inválido o duplicado.');
    gids.add(g.id);
  }
  for (const [id, valor] of Object.entries(e.objetos)) {
    if (!esObjeto(valor)) throw new Error('Propiedades inválidas de ' + id);
    if (valor.capa !== undefined && !ids.has(valor.capa)) throw new Error('Capa inexistente en ' + id);
    if (valor.grupo !== undefined && !gids.has(valor.grupo)) throw new Error('Grupo inexistente en ' + id);
  }
  if (e.ambiente !== null && !esObjeto(e.ambiente)) throw new Error('escenario.ambiente inválido.');
  const v3 = a => esLista(a) && a.length === 3 && a.every(Number.isFinite);
  for (const c of e.camaras) if (!esObjeto(c) || !ID.test(c.id ?? '') || typeof c.nombre !== 'string' || !v3(c.position) || !v3(c.target)) throw new Error('Cámara guardada inválida.');
  for (const m of e.marcadores) if (!esObjeto(m) || !ID.test(m.id ?? '') || !['aparicion', 'personaje'].includes(m.tipo) || typeof m.nombre !== 'string' || !v3(m.position)) throw new Error('Marcador inválido.');
  const vids = new Set();
  for (const v of e.variantes) { if (!esObjeto(v) || !ID.test(v.id ?? '') || vids.has(v.id) || typeof v.nombre !== 'string' || !v.nombre.trim() || !esLista(v.ocultos ?? []) || (v.ambiente != null && !esObjeto(v.ambiente))) throw new Error('Variante inválida.'); vids.add(v.id); }
  if (e.varianteActiva != null && !vids.has(e.varianteActiva)) throw new Error('La variante activa no existe.');
  for (const p of e.prefabs ?? []) if (!esObjeto(p) || !ID.test(p.id ?? '') || !esLista(p.items) || !p.items.every(i => esObjeto(i) && v3(i.position))) throw new Error('Prefab inválido.');
  if (JSON.stringify(e).length > LIMITE_JSON) throw new Error('La parte nueva del escenario supera 24 MB.');
  return e;
}

/** Proyecto v1 o v2 → v2 en memoria (sin perder nada del v1). Idempotente. */
export function migrarProyecto(project) {
  if (project.version === ESCENARIO_VERSION && project.escenario) { project.escenario = { ...escenarioVacio(), ...project.escenario }; validarEscenario(project.escenario); return project; }
  const base = escenarioVacio();
  return { ...project, version: ESCENARIO_VERSION, escenario: project.escenario ? { ...base, ...project.escenario } : base };
}

/** Quita referencias a objetos que ya no existen (objeto borrado) sin tocar lo demás. */
export function depurarEscenario(e, existe) {
  for (const id of Object.keys(e.objetos)) if (!existe(id)) delete e.objetos[id];
  for (const g of e.grupos) g.miembros = g.miembros.filter(existe);
  e.grupos = e.grupos.filter(g => g.miembros.length);
  for (const id of Object.keys(e.objetos)) if (e.objetos[id].grupo && !e.grupos.some(g => g.id === e.objetos[id].grupo)) delete e.objetos[id].grupo;
  return e;
}

export function nuevoId(prefijo) { return prefijo + '-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)); }
