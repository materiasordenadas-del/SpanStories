// Cliente del servidor local de la biblioteca (/api/city-library). Sin interfaz.
export const BIBLIOTECA_API = 'http://localhost:3000/api/city-library';

async function json(respuesta, fallo) {
  let datos = null;
  try { datos = await respuesta.json(); } catch { throw new Error(fallo + (respuesta.ok ? ': respuesta no válida.' : ` (HTTP ${respuesta.status}).`)); }
  if (!respuesta.ok) throw new Error(datos?.error || fallo + '.');
  return datos;
}

export async function aBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 32768) binario += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binario);
}

export async function huellaSha256(blob) {
  const resumen = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(resumen)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const apiBiblioteca = {
  async listar() { return json(await fetch(BIBLIOTECA_API, { cache: 'no-store' }), 'No se pudo leer la biblioteca'); },
  urlGlb: sha => `${BIBLIOTECA_API}?glb=${sha}`,
  urlMiniatura: sha => `${BIBLIOTECA_API}?miniatura=${sha}`,
  async descargar(sha) {
    const r = await fetch(this.urlGlb(sha)); if (!r.ok) throw new Error('No se pudo descargar el objeto de la biblioteca.');
    const blob = new Blob([await r.arrayBuffer()], { type: 'model/gltf-binary' }); blob.sha = sha; return blob;
  },
  async registrar({ blob, nombre, categoria, triangulos, dimensiones, miniaturaPng }) {
    const cuerpo = { accion: 'registrar', nombre, categoria, triangulos, dimensiones, glbBase64: await aBase64(blob), miniaturaPng };
    return json(await fetch(BIBLIOTECA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }), 'No se pudo registrar el objeto');
  },
  async cambiar(sha, accion, valor) {
    return json(await fetch(BIBLIOTECA_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, sha, valor }) }), 'No se pudo actualizar la biblioteca');
  },
};
