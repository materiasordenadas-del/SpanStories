// Aplicación de variantes en tiempo de ejecución (Editor y visor del estudiante). Sin interfaz.
// aplicar(variante|null): carga el ambiente de la variante (o el del escenario base) y oculta los objetos de la variante.
import { validarAmbiente } from '../ambiente/SceneEnvironment.js';

export function crearRuntimeVariante({ objetos, entorno, doc, capas = null }) {
  let ocultos = new Set(), previos = new Set();
  function ocultar() {
    if (capas) { capas.ocultosVariante = ocultos; capas.aplicarVisibilidad(); return; }
    // Visor del estudiante: no hay jerarquía de capas; se ocultan y se restauran a mano (también los objetos de sectores que llegan tarde).
    for (const id of previos) if (!ocultos.has(id)) { const r = objetos.obtener(id); if (r) r.visible = r.userData.editorVisibleBase ?? true; }
    for (const id of ocultos) { const r = objetos.obtener(id); if (r) { r.userData.editorVisibleBase ??= r.visible; r.visible = false; } }
    previos = new Set(ocultos);
  }
  return {
    aplicar(variante) {
      ocultos = new Set(variante?.ocultos ?? []);
      entorno.cargar(validarAmbiente(variante?.ambiente ?? doc().ambiente));
      ocultar();
    },
    /** Tras cargar sectores nuevos: los objetos que llegan tarde también quedan ocultos. */
    reaplicar() { if (ocultos.size || previos.size) ocultar(); },
    get ocultos() { return ocultos; },
  };
}
