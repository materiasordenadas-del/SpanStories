// Controlador ambiental ÚNICO del escenario. Es el dueño de: cielo/hora/sol, niebla, clima, estilo y (más adelante) césped y terreno.
// Ningún otro módulo cambia esas cosas para este escenario. Los perfiles se guardan en escenario.ambiente y NUNCA tocan el pool global.
// Sin interfaz: lo usan el Editor (con paneles) y el visor del estudiante (solo para aplicar lo guardado).
import { construirAmbientes, normalizarCielo, ID_AMBIENTE_ESCENA } from './cielo/CieloPerfil.js';

export const AMBIENTE_VERSION = 1;
export const SECCIONES = Object.freeze(['cielo', 'estilo', 'clima', 'cesped', 'terreno']);
const GUARDABLES = Object.freeze([...SECCIONES, 'presets']);
const LIMITE_NIEBLA = .01;              // densidad máxima de bruma que corresponde a niebla = 1 (STYLE_LIMITS permite hasta .02)

export function ambienteVacio() { return { version: AMBIENTE_VERSION, cielo: null, estilo: null, clima: null, cesped: null, terreno: null, presets: [] }; }

export function validarAmbiente(a) {
  if (a === null || a === undefined) return null;
  if (typeof a !== 'object' || Array.isArray(a) || a.version !== AMBIENTE_VERSION) throw new Error('Ambiente de escenario incompatible.');
  if (a.cielo) normalizarCielo(a.cielo);
  if (a.estilo && (typeof a.estilo !== 'object' || (a.estilo.active !== null && a.estilo.active !== undefined && typeof a.estilo.active !== 'string') || (a.estilo.params && typeof a.estilo.params !== 'object'))) throw new Error('Estilo de escenario inválido.');
  if (a.clima && (typeof a.clima.estacion !== 'string' || typeof a.clima.clima !== 'string')) throw new Error('Clima inválido.');
  if (a.presets && !Array.isArray(a.presets)) throw new Error('Presets inválidos.');
  return a;
}

export class SceneEnvironment {
  /** estilos: EstilosCompartidos · tablas: { luz: AMBIENTES, pipe: AMBIENTS } · clima: montarEstacionesClima(...) (opcional) · modulos: { cesped, terreno } con aplicar(perfil) */
  constructor({ estilos, tablas, clima = null, modulos = {}, alCambiar = () => {} }) {
    this.estilos = estilos; this.tablas = tablas; this.clima = clima; this.modulos = modulos; this.alCambiarExterno = alCambiar;
    this.datos = ambienteVacio(); this.suspendido = false; this.turno = 0; this.oyentes = new Set();
  }

  get perfil() { return structuredClone(this.datos); }
  get activo() { return GUARDABLES.some(k => (Array.isArray(this.datos[k]) ? this.datos[k].length > 0 : !!this.datos[k])); }

  /** Carga un ambiente guardado (o null = vuelve a lo global) y lo aplica entero. */
  cargar(datos) { this.cargando = true; try { this.datos = { ...ambienteVacio(), ...(validarAmbiente(datos) ? structuredClone(datos) : {}) }; this.aplicar(); } finally { this.cargando = false; } }

  /** Cambia una sección y devuelve un comando reversible { antes, despues } para el historial. null = quitar la personalización. */
  cambiar(seccion, valor) {
    if (!GUARDABLES.includes(seccion)) throw new Error('Sección desconocida: ' + seccion);
    const antes = structuredClone(this.datos[seccion]);
    if (seccion === 'cielo' && valor) valor = normalizarCielo(valor);
    this.datos[seccion] = valor === null ? (seccion === 'presets' ? [] : null) : structuredClone(valor);
    this.aplicar(seccion);
    return { seccion, antes, despues: structuredClone(this.datos[seccion]) };
  }
  restaurar(seccion, valor) { this.datos[seccion] = valor === null ? (seccion === 'presets' ? [] : null) : structuredClone(valor); this.aplicar(seccion); }

  // -- Aplicación ----------------------------------------------------------------------------------------------------
  aplicar(solo = null) {
    if (this.suspendido) return;
    const todas = solo === null;
    if (todas || solo === 'cielo' || solo === 'estilo') { this.aplicarCieloYEstilo(); }
    if ((todas || solo === 'clima') && this.clima) {
      const c = this.datos.clima; if (c) this.clima.usar({ estacion: c.estacion, clima: c.clima });
    }
    if (todas || solo === 'cesped') this.modulos.cesped?.aplicar?.(this.datos.cesped);
    if (todas || solo === 'terreno') this.modulos.terreno?.aplicar?.(this.datos.terreno);
    this.estilos.entornoEscena = this.activo;
    for (const fn of this.oyentes) fn(this.datos);
    this.alCambiarExterno(this.datos);
  }

  aplicarCieloYEstilo() {
    const { cielo, estilo } = this.datos, e = this.estilos;
    // Estilo (+ niebla, que es un parámetro del estilo activo)
    let params = structuredClone(estilo?.params ?? {}), active = estilo?.active ?? null;
    if (cielo && cielo.niebla !== null && cielo.niebla !== undefined) {
      const id = active ?? e.activo; params[id] = { ...params[id], hazeDensity: Math.min(LIMITE_NIEBLA, cielo.niebla * LIMITE_NIEBLA) };
    }
    e.entornoEscena = true;     // desde aquí la hora la decide el escenario (ni el clima ni el pool la cambian)
    e.estiloEscena(estilo || (cielo && cielo.niebla !== null) ? { active, params } : null);
    // Cielo / hora: se registra un ambiente propio en las tablas y se alterna entre dos ids para forzar la relectura
    if (cielo) {
      const { luz, pipe } = construirAmbientes(cielo, this.tablas), id = ID_AMBIENTE_ESCENA + '-' + (this.turno++ % 2);
      this.tablas.luz[id] = luz; this.tablas.pipe[id] = pipe;
      e.ambienteEscena(id);
    } else e.ambienteEscena(null);
  }

  /** Avisa de un cambio ya aplicado por otro módulo (p. ej. una pincelada de césped) para que se guarde. */
  notificar() { this.estilos.entornoEscena = this.activo; for (const fn of this.oyentes) fn(this.datos); this.alCambiarExterno(this.datos); }

  /** Pausa (p. ej. mientras el Estudio dirige su propia luz) o reanuda. */
  suspender() { this.suspendido = true; this.estilos.entornoEscena = false; this.estilos.estiloEscena(null); }
  reanudar() { this.suspendido = false; this.aplicar(); }

  alCambiar(fn) { this.oyentes.add(fn); return () => this.oyentes.delete(fn); }
  dispose() { this.estilos.entornoEscena = false; this.estilos.ambienteEscena(null); this.estilos.estiloEscena(null); this.oyentes.clear(); for (const m of Object.values(this.modulos)) m?.dispose?.(); }
}
