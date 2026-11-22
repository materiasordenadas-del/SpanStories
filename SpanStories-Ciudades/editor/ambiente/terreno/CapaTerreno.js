// Capa visual de la pintura de terreno: una malla fina que sigue el relieve (ground) con una textura generada desde el mapa
// de materiales. Pasa por style.adapt() para dibujarse con el estilo del escenario como el resto. Los huecos (material 0) se
// descartan con alphaTest: el suelo original se ve por debajo.
import * as T from '../../../engine/three.js';
import { MapaMateriales, MATERIALES_TERRENO, normalizarTerreno } from './MapaMateriales.js';

const RADIO_ZONA = 100, SEGMENTOS = 100, PX_CELDA = 4, ELEVACION = .05;
const color = hex => { const c = new T.Color(hex); return [c.r * 255, c.g * 255, c.b * 255].map(Math.round); };

export function crearTerreno({ scene, ground, style = null, centro = () => new T.Vector3() }) {
  let mapa = null, perfil = null, malla = null, textura = null, lienzo = null, ctx = null;

  function nuevoMapa() { const p = centro(); return new MapaMateriales({ x0: Math.round(p.x - RADIO_ZONA), z0: Math.round(p.z - RADIO_ZONA), ancho: RADIO_ZONA * 2, alto: RADIO_ZONA * 2, celda: 1 }); }
  function colorDe(m) { return perfil?.colores?.[m.clave] ?? m.color; }

  function construir() {
    destruir();
    lienzo = document.createElement('canvas'); lienzo.width = mapa.nx * PX_CELDA; lienzo.height = mapa.nz * PX_CELDA; ctx = lienzo.getContext('2d', { willReadFrequently: true });
    textura = new T.CanvasTexture(lienzo); textura.colorSpace = T.SRGBColorSpace; textura.magFilter = textura.minFilter = T.NearestFilter; textura.generateMipmaps = false;
    const geometria = new T.PlaneGeometry(mapa.ancho, mapa.alto, SEGMENTOS, SEGMENTOS); geometria.rotateX(-Math.PI / 2);
    const pos = geometria.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = mapa.x0 + mapa.ancho / 2 + pos.getX(i), z = mapa.z0 + mapa.alto / 2 + pos.getZ(i); pos.setXYZ(i, x, ground(x, z) + ELEVACION, z); }
    geometria.computeVertexNormals();
    // La textura cubre exactamente la zona (UV 0..1); Z crece hacia abajo en el lienzo.
    const uv = geometria.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - mapa.x0) / mapa.ancho, 1 - (pos.getZ(i) - mapa.z0) / mapa.alto);
    const material = new T.MeshStandardMaterial({ map: textura, alphaTest: .5, roughness: 1, metalness: 0, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'suelo_pintura' });
    malla = new T.Mesh(geometria, material); malla.name = 'terreno-pintado'; malla.userData.ignorarSeleccion = true; malla.raycast = () => {}; malla.frustumCulled = false;
    scene.add(malla); style?.adapt?.(malla);
    redibujarTodo();
  }
  function destruir() { if (malla) { scene.remove(malla); malla.geometry.dispose(); malla.material.dispose?.(); malla = null; } textura?.dispose(); textura = lienzo = ctx = null; }

  function pintarCelda(i, j, material) {
    const x = i * PX_CELDA, y = j * PX_CELDA;
    if (!material) { ctx.clearRect(x, y, PX_CELDA, PX_CELDA); return; }
    const [r, g, b] = color(colorDe(MATERIALES_TERRENO[material - 1])), v = ((Math.imul(i, 2654435761) ^ Math.imul(j, 40503)) >>> 0) / 4294967296;   // variación suave por celda
    const k = .93 + v * .14; ctx.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, g * k) | 0},${Math.min(255, b * k) | 0})`; ctx.fillRect(x, y, PX_CELDA, PX_CELDA);
  }
  function redibujarTodo() { if (!ctx) return; ctx.clearRect(0, 0, lienzo.width, lienzo.height); for (let j = 0; j < mapa.nz; j++) for (let i = 0; i < mapa.nx; i++) if (mapa.datos[j * mapa.nx + i]) pintarCelda(i, mapa.nz - 1 - j, mapa.datos[j * mapa.nx + i]); textura.needsUpdate = true; }
  function redibujarCaja({ i0, i1, j0, j1 }) { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) pintarCelda(i, mapa.nz - 1 - j, mapa.datos[j * mapa.nx + i]); textura.needsUpdate = true; }

  return {
    aplicar(p) {
      perfil = p ? normalizarTerreno(p) : null;
      if (!perfil || !perfil.activo || !perfil.mapa) { destruir(); mapa = null; return; }
      mapa = MapaMateriales.deserializar(perfil.mapa); construir();
    },
    /** Mapa editable (se crea al pintar por primera vez). */
    mapaEditable() { if (!mapa) { mapa = nuevoMapa(); if (document) construir(); } return mapa; },
    pintar(op) { const m = this.mapaEditable(); const caja = m.pintar(op); if (caja && ctx) redibujarCaja(caja); return !!caja; },
    redibujar() { redibujarTodo(); },
    serializarMapa() { return mapa ? mapa.serializar() : null; },
    get mapa() { return mapa; }, dispose: destruir,
  };
}
