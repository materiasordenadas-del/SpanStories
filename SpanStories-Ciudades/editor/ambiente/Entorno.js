// Fábrica del entorno y puente con el historial. Sin interfaz.
import { SceneEnvironment, validarAmbiente } from './SceneEnvironment.js';

/** Crea el entorno con las tablas reales de ambientes (Luz25D y compositor). */
export async function crearEntorno({ estilos, estacionesClima = null, tablaLuz, modulos = {} }) {
  const { AMBIENTS } = await import(new URL('../../shared-styles/pipeline.js', import.meta.url).href);
  return new SceneEnvironment({ estilos, clima: estacionesClima, tablas: { luz: tablaLuz, pipe: AMBIENTS }, modulos });
}

/** Une el entorno con el estado del editor: lo guardado se aplica al abrir y los cambios se guardan en escenario.ambiente. */
export function vincularEstado(entorno, state) {
  // Con una variante activa el ambiente editado se guarda EN la variante; el del escenario base no se toca.
  const guardar = () => { if (entorno.cargando) return; const perfil = entorno.activo ? entorno.perfil : null; if (entorno.destinoAmbiente?.(perfil)) return; state.escenario.ambiente = perfil; };
  entorno.alCambiar(guardar);
  entorno.cargar(validarAmbiente(state.escenario.ambiente));
  return { recargar: () => entorno.cargar(validarAmbiente(state.escenario.ambiente)) };
}

/**
 * Cambios del usuario con historial. `vivo` aplica sin registrar (arrastrar un deslizador); `confirmar` registra UN comando
 * desde el valor de partida hasta el actual. `unico` hace las dos cosas de golpe (clic en una tarjeta).
 */
export function crearCambios(entorno, state) {
  let pendiente = null;
  const registrar = (seccion, nombre, antes, despues) => {
    state.registrarComando({ nombre, undo: () => entorno.restaurar(seccion, antes), redo: () => entorno.restaurar(seccion, despues) });
    state.dirty = true;
  };
  return {
    vivo(seccion, valor) { if (!pendiente || pendiente.seccion !== seccion) pendiente = { seccion, antes: structuredClone(entorno.datos[seccion]) }; entorno.cambiar(seccion, valor); },
    confirmar(nombre = 'Cambiar ambiente') {
      if (!pendiente) return; const { seccion, antes } = pendiente; pendiente = null;
      const despues = structuredClone(entorno.datos[seccion]);
      if (JSON.stringify(antes) !== JSON.stringify(despues)) registrar(seccion, nombre, antes, despues);
    },
    /** Registra un cambio que ya se aplicó (previsualización confirmada). */
    registrarManual(seccion, nombre, antes, despues) { registrar(seccion, nombre, antes, despues); },
    unico(seccion, valor, nombre = 'Cambiar ambiente') { const antes = structuredClone(entorno.datos[seccion]); entorno.cambiar(seccion, valor); registrar(seccion, nombre, antes, structuredClone(entorno.datos[seccion])); },
  };
}
