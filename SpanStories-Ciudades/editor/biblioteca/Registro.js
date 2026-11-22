// Registro de la biblioteca: une (1) los objetos registrados en disco por el usuario y (2) los objetos del ambiente que el
// motor ya trae (catálogo de árboles y decoración). Cada elemento: { clave, origen, nombre, categoria, favorito, triangulos,
// dimensiones, bytes, sha?, miniatura? (url/dataUrl), obtenerBlob() }.
import { apiBiblioteca, huellaSha256 } from './ApiBiblioteca.js';

export const CATEGORIAS = Object.freeze([
  ['arquitectura', 'Arquitectura'], ['naturaleza', 'Naturaleza'], ['mobiliario', 'Mobiliario urbano'], ['decoracion', 'Decoración'],
  ['vehiculos', 'Vehículos'], ['estructuras', 'Estructuras'], ['mis-modelos', 'Mis modelos'],
]);
const CATEGORIA_POR_TIPO = { arbol: 'naturaleza', arbusto: 'naturaleza', palmera: 'naturaleza', seto: 'naturaleza' };

export function crearBiblioteca({ miniaturas, baseUrl = location.href, estado = () => {} }) {
  let propios = [], ambiente = [], cargado = false, error = null;
  const oyentes = new Set(), cacheBlob = new Map(), cacheMiniatura = new Map();
  const avisar = () => { for (const fn of oyentes) fn(); };

  function deDisco(o) {
    return { clave: 'disco:' + o.sha, origen: 'biblioteca', sha: o.sha, nombre: o.nombre, categoria: o.categoria, favorito: !!o.favorito, triangulos: o.triangulos, dimensiones: o.dimensiones, bytes: o.bytes,
      miniatura: o.miniatura ? apiBiblioteca.urlMiniatura(o.sha) : null, obtenerBlob: () => apiBiblioteca.descargar(o.sha) };
  }

  async function cargar() {
    error = null;
    const tareas = [
      apiBiblioteca.listar().then(r => { propios = r.objetos.map(deDisco); }, e => { propios = []; error = e.message; }),
      cargarAmbiente(),
    ];
    await Promise.all(tareas); cargado = true; avisar();
  }

  async function cargarAmbiente() {
    try {
      const url = new URL('arboles-atlas/catalogo.json', baseUrl);
      const respuesta = await fetch(url); if (!respuesta.ok) throw new Error('catálogo de árboles no disponible');
      const catalogo = await respuesta.json();
      ambiente = catalogo.tipos.filter(t => t.archivo?.visor).map(t => {
        const glb = new URL(t.archivo.visor, baseUrl).href;
        return { clave: 'ambiente:' + t.id, origen: 'ambiente', nombre: t.nombre, categoria: CATEGORIA_POR_TIPO[t.tipo] ?? 'naturaleza', favorito: false, triangulos: t.triangulos,
          dimensiones: [0, t.alturaM?.[1] ?? 0, 0], bytes: t.bytes, sha: t.sha256, detalle: t.alturaM ? `${t.alturaM[0]}–${t.alturaM[1]} m` : '',
          obtenerBlob: async () => { const r = await fetch(glb); if (!r.ok) throw new Error('No se pudo descargar ' + t.nombre); const b = new Blob([await r.arrayBuffer()], { type: 'model/gltf-binary' }); b.sha = t.sha256; return b; } };
      });
    } catch (e) { ambiente = []; estado('Biblioteca: no se pudieron leer los objetos del ambiente (' + e.message + ').'); }
  }

  const todos = () => [...propios, ...ambiente];

  /** Blob del elemento (se guarda en memoria para colocar varias copias sin volver a descargar). */
  async function blobDe(item) {
    if (!cacheBlob.has(item.clave)) cacheBlob.set(item.clave, item.obtenerBlob().catch(e => { cacheBlob.delete(item.clave); throw e; }));
    return cacheBlob.get(item.clave);
  }

  /** Miniatura (url o dataUrl). Para elementos sin miniatura guardada se genera una vez por sesión. */
  async function miniaturaDe(item) {
    if (item.miniatura) return item.miniatura;
    if (!cacheMiniatura.has(item.clave)) cacheMiniatura.set(item.clave, (async () => { const r = await miniaturas.generar(await blobDe(item)); item.dimensiones = item.dimensiones.some(Boolean) ? item.dimensiones : r.dimensiones; item.triangulos ||= r.triangulos; return r.dataUrl; })().catch(() => { cacheMiniatura.delete(item.clave); return null; }));
    return cacheMiniatura.get(item.clave);
  }

  /** Registra un GLB nuevo (archivo soltado o elegido). Devuelve el elemento (existente si ya estaba registrado). */
  async function registrarArchivo(archivo, { categoria = 'mis-modelos' } = {}) {
    if (!/\.glb$/i.test(archivo.name)) throw new Error('Solo se admiten archivos .glb.');
    const m = await miniaturas.generar(archivo);
    const r = await apiBiblioteca.registrar({ blob: archivo, nombre: archivo.name, categoria, triangulos: m.triangulos, dimensiones: m.dimensiones, miniaturaPng: m.png });
    const item = deDisco(r.entrada); if (!item.miniatura) item.miniatura = m.dataUrl;
    const sha = await huellaSha256(archivo); archivo.sha = sha; cacheBlob.set(item.clave, Promise.resolve(archivo));
    if (r.nuevo) { propios = [...propios, item]; avisar(); } else { const existente = propios.find(p => p.sha === item.sha); if (!existente) { propios = [...propios, item]; avisar(); } }
    return propios.find(p => p.sha === item.sha) ?? item;
  }

  async function marcarFavorito(item, valor) {
    if (item.origen !== 'biblioteca') { const r = await registrarDesdeItem(item); await apiBiblioteca.cambiar(r.sha, 'favorito', valor); r.favorito = valor; } else { await apiBiblioteca.cambiar(item.sha, 'favorito', valor); item.favorito = valor; }
    avisar();
  }
  /** Un objeto del ambiente pasa a la biblioteca propia al marcarlo como favorito. */
  async function registrarDesdeItem(item) {
    const blob = await blobDe(item), existente = propios.find(p => p.sha === (blob.sha ?? item.sha));
    if (existente) return existente;
    const m = await miniaturas.generar(blob), r = await apiBiblioteca.registrar({ blob, nombre: item.nombre, categoria: item.categoria, triangulos: m.triangulos, dimensiones: m.dimensiones, miniaturaPng: m.png });
    const nuevo = deDisco(r.entrada); nuevo.miniatura ??= m.dataUrl; propios = [...propios, nuevo]; return nuevo;
  }
  async function cambiarCategoria(item, categoria) { if (item.origen !== 'biblioteca') return; await apiBiblioteca.cambiar(item.sha, 'categoria', categoria); item.categoria = categoria; avisar(); }
  async function quitar(item) { if (item.origen !== 'biblioteca') return; await apiBiblioteca.cambiar(item.sha, 'quitar', true); propios = propios.filter(p => p !== item); avisar(); }

  return { cargar, todos, blobDe, miniaturaDe, registrarArchivo, marcarFavorito, cambiarCategoria, quitar, get cargado() { return cargado; }, get error() { return error; },
    alCambiar(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }, dispose() { oyentes.clear(); } };
}
