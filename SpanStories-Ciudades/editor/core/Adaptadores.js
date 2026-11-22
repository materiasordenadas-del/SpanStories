// Adaptadores de entidad: qué se puede hacer con cada tipo de objeto del escenario, decidido en UN sitio.
// El editor pregunta «¿puedo mover / duplicar / recolorear esto?» al adaptador en vez de adivinar por el nombre o el tipo.
//   glb        objeto añadido por el usuario (copias de un GLB): todo permitido
//   atlas      elemento de un lugar del Generador (proxy de instancia): se separa de lo fundido al moverlo; no se duplica aquí
//   original   pieza del escenario fundida en sectores optimizados: se mueve y oculta; no se duplica ni se recolorea
//   bloqueado  proxy del Generador que no está vinculado todavía o no es editable aquí: solo se puede encuadrar
// Cada adaptador también sabe llevar a «Editar en el Generador» cuando la edición paramétrica es la vía correcta.
export const ADAPTADORES = Object.freeze({
  glb: Object.freeze({ tipo: 'glb', nombre: 'Objeto añadido', puedeMover: true, puedeGirar: true, puedeEscalar: true, puedeDuplicar: true, puedeEliminar: 'quitar', puedeRecolorear: true, editarEnGenerador: false }),
  atlas: Object.freeze({ tipo: 'atlas', nombre: 'Elemento del Generador', puedeMover: true, puedeGirar: true, puedeEscalar: true, puedeDuplicar: false, puedeEliminar: 'ocultar', puedeRecolorear: false, editarEnGenerador: true }),
  original: Object.freeze({ tipo: 'original', nombre: 'Escenario original', puedeMover: true, puedeGirar: true, puedeEscalar: true, puedeDuplicar: false, puedeEliminar: 'ocultar', puedeRecolorear: false, editarEnGenerador: false }),
  bloqueado: Object.freeze({ tipo: 'bloqueado', nombre: 'No editable aquí', puedeMover: false, puedeGirar: false, puedeEscalar: false, puedeDuplicar: false, puedeEliminar: false, puedeRecolorear: false, editarEnGenerador: true }),
});

/** Adaptador de una raíz del registro. `estado` = EstadoEditorCiudad (para saber si es una copia añadida). */
export function adaptadorDe(raiz, estado = null) {
  if (!raiz) return ADAPTADORES.bloqueado;
  if (raiz.userData.cityImportId && (!estado || estado.imports.has(raiz.userData.cityImportId))) return ADAPTADORES.glb;
  if (raiz.userData.atlasBounds) return raiz.userData.atlasEditable ? ADAPTADORES.atlas : ADAPTADORES.bloqueado;
  if (!raiz.parent) return ADAPTADORES.bloqueado;
  return ADAPTADORES.original;
}

/** URL del Generador para editar un elemento en su origen (el mismo contrato que usaba el manipulador antiguo). */
export function urlEditarEnGenerador(lugarId, entidadId, base = 'http://127.0.0.1:5179/') {
  const url = new URL(base); url.searchParams.set('lugar', lugarId); url.searchParams.set('entidad', entidadId); return url.href;
}
