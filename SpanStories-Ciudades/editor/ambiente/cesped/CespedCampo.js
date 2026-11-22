// Césped del escenario sobre el motor GrassField del Generador (se sirve por /shared-styles/, sin copiar archivos).
// El campo genera matas por instancias donde el mapa de densidad lo indica y apoyadas en el terreno (`ground`).
// No renderiza por su cuenta: su malla se añade a la escena y la dibuja el compositor como el resto.
import * as T from '../../../engine/three.js';
import { MapaDensidad } from './MapaDensidad.js';
import { perfilCesped, normalizarCesped } from './Perfiles.js';

const RADIO_ZONA = 100;          // la zona pintable por defecto: 200 × 200 m alrededor del punto de vista
const hash2 = (x, z) => { let h = Math.imul(Math.floor(x * 64) | 0, 73856093) ^ Math.imul(Math.floor(z * 64) | 0, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Fábrica asíncrona: importa GrassField del Generador la primera vez que se necesita. */
export async function crearCesped({ scene, camera, ground, luz, centro = () => new T.Vector3(), rutaModulos = null }) {
  const base = rutaModulos ? new URL(rutaModulos) : new URL('../../../shared-styles/', import.meta.url);
  const [{ GrassField }, config] = await Promise.all([import(new URL('grass-field.js', base).href), import(new URL('grass-config.js', base).href)]);

  class CampoEditable extends GrassField {
    surfaceAt(x, z) {
      const d = this.mapa ? this.mapa.densidadEn(x, z) : (this.baseLleno ? 1 : 0);
      if (d <= 0) return NaN;
      if (d < 1 && hash2(x, z) > d) return NaN;            // adelgaza de forma estable donde la densidad es parcial
      return this.groundAt(x, z);
    }
  }

  let campo = null, mapa = null, perfilActual = null, desmontado = false;
  const sol = luz.uniformes.uLuzDir.value;

  function asegurarCampo() {
    if (campo) return campo;
    campo = new CampoEditable(sol); campo.groundAt = ground; campo.needsBake = false; campo.mapa = null; campo.baseLleno = false;
    campo.config.mask = true;        // activa la comprobación por vecinos (surfaceAt la sustituye al mapa de máscara del Generador)
    campo.mesh.userData.ignorarSeleccion = true; campo.mesh.name = 'cesped-editor'; scene.add(campo.mesh);
    return campo;
  }
  function nuevoMapa(c) {
    const p = centro();
    return new MapaDensidad({ x0: Math.round(p.x - RADIO_ZONA), z0: Math.round(p.z - RADIO_ZONA), ancho: RADIO_ZONA * 2, alto: RADIO_ZONA * 2, celda: 1, base: c.base === 'lleno' ? 1 : 0 });
  }

  /** Aplica un perfil guardado (o null = sin césped propio). */
  function aplicar(perfil) {
    perfilActual = perfil ? normalizarCesped(perfil) : null;
    if (!perfilActual || !perfilActual.activo) { if (campo) campo.mesh.visible = false; mapa = null; return; }
    const p = perfilCesped(perfilActual.perfil);
    if (p.estado !== 'disponible') { if (campo) campo.mesh.visible = false; return; }
    const f = asegurarCampo();
    mapa = perfilActual.mapa ? MapaDensidad.deserializar(perfilActual.mapa) : nuevoMapa(perfilActual);
    f.mapa = mapa; f.baseLleno = false; f.mesh.visible = true;
    const preset = config.GRASS_PRESETS[perfilActual.calidad] ?? config.GRASS_PRESETS.alto;
    f.setConfig({ ...config.GRASS_DEFAULTS, ...preset, preset: perfilActual.calidad, ...p.params, ...perfilActual.params, mask: true, seed: config.GRASS_DEFAULTS.seed, enabled: true });
    f.needsBake = false; f.invalidate(); f.needsBake = false;
  }

  /** Devuelve el mapa editable (se crea vacío si no existe) para que lo use el pincel. */
  function mapaEditable() { if (!mapa && perfilActual?.activo) { mapa = nuevoMapa(perfilActual); if (campo) campo.mapa = mapa; } return mapa; }
  /** Avisa de que el mapa cambió (pincel): regenera las matas afectadas. */
  function mapaCambiado() { if (campo) { campo.resetChunks(); campo.needsBake = false; } }
  function serializarMapa() { return mapa ? mapa.serializar() : null; }
  function actualizar(tiempo, dt) { if (campo && !desmontado) campo.update(camera, true, tiempo, dt); }
  function estadisticas() { return campo ? { ...campo.stats, config: { ...campo.config } } : null; }
  function dispose() { desmontado = true; if (campo) { scene.remove(campo.mesh); campo.dispose(); campo = null; } }
  return { aplicar, actualizar, mapaEditable, mapaCambiado, serializarMapa, estadisticas, dispose, get campo() { return campo; }, get mapa() { return mapa; }, GRASS_DEFAULTS: config.GRASS_DEFAULTS };
}
