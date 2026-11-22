// Máscara de materiales del terreno: cada celda guarda qué material la cubre (0 = ninguno, el suelo original se ve).
// El pincel cambia estos datos; la capa visual los dibuja. Sin three: se prueba en Node.
import { rleCodificar, rleDecodificar } from '../cesped/MapaDensidad.js';

export const MATERIALES_TERRENO = Object.freeze([
  { id: 1, clave: 'hierba', nombre: 'Hierba', color: '#7da35a' },
  { id: 2, clave: 'tierra', nombre: 'Tierra', color: '#8c6a49' },
  { id: 3, clave: 'arena', nombre: 'Arena', color: '#d8c28f' },
  { id: 4, clave: 'piedra', nombre: 'Piedra', color: '#8f8f8a' },
  { id: 5, clave: 'seco', nombre: 'Suelo seco', color: '#b59f6e' },
]);
const MAX_CELDAS = 1_000_000;
const HEX = /^#[\da-f]{6}$/i;

export class MapaMateriales {
  constructor({ x0, z0, ancho, alto, celda = 1 }) {
    if (![x0, z0, ancho, alto, celda].every(Number.isFinite) || ancho <= 0 || alto <= 0 || celda <= 0) throw new Error('Zona de terreno inválida.');
    this.x0 = x0; this.z0 = z0; this.ancho = ancho; this.alto = alto; this.celda = celda;
    this.nx = Math.max(1, Math.ceil(ancho / celda)); this.nz = Math.max(1, Math.ceil(alto / celda));
    if (this.nx * this.nz > MAX_CELDAS) throw new Error('La zona de terreno es demasiado grande.');
    this.datos = new Uint8Array(this.nx * this.nz);
  }
  materialEn(x, z) {
    const i = Math.floor((x - this.x0) / this.celda), j = Math.floor((z - this.z0) / this.celda);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? 0 : this.datos[j * this.nx + i];
  }
  /** Pinta (o borra con material 0) las celdas dentro del radio. `dureza` < 1 deja el borde salpicado, estable por celda. Devuelve la caja afectada o null. */
  pintar({ x, z, radio, material, dureza = .7 }) {
    if (material !== 0 && !MATERIALES_TERRENO.some(m => m.id === material)) throw new Error('Material desconocido: ' + material);
    const i0 = Math.max(0, Math.floor((x - radio - this.x0) / this.celda)), i1 = Math.min(this.nx - 1, Math.ceil((x + radio - this.x0) / this.celda));
    const j0 = Math.max(0, Math.floor((z - radio - this.z0) / this.celda)), j1 = Math.min(this.nz - 1, Math.ceil((z + radio - this.z0) / this.celda));
    let cambio = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(this.x0 + (i + .5) * this.celda - x, this.z0 + (j + .5) * this.celda - z); if (d > radio) continue;
      const t = d / radio, umbral = dureza >= 1 || t <= dureza ? 1 : Math.max(0, (1 - t) / Math.max(1e-6, 1 - dureza));
      const ruido = ((Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) >>> 0) / 4294967296;
      if (ruido > umbral) continue;
      const k = j * this.nx + i; if (this.datos[k] !== material) { this.datos[k] = material; cambio = true; }
    }
    return cambio ? { i0, i1, j0, j1 } : null;
  }
  vaciar() { this.datos.fill(0); }
  get cobertura() { let n = 0; for (const v of this.datos) if (v) n++; return n / this.datos.length; }
  serializar() { return { version: 1, x0: this.x0, z0: this.z0, ancho: this.ancho, alto: this.alto, celda: this.celda, d: rleCodificar(this.datos) }; }
  static deserializar(o) {
    if (!o || o.version !== 1 || typeof o.d !== 'string') throw new Error('Mapa de terreno incompatible.');
    const m = new MapaMateriales(o);
    m.datos = rleDecodificar(o.d, m.nx * m.nz);
    if (m.datos.some(v => v > MATERIALES_TERRENO.length)) throw new Error('Mapa de terreno con materiales inexistentes.');
    return m;
  }
}

export const TERRENO_DEFECTO = Object.freeze({ activo: true, colores: {}, mapa: null });
export function normalizarTerreno(entrada = {}) {
  const t = { ...TERRENO_DEFECTO, ...entrada, colores: { ...(entrada.colores ?? {}) } };
  for (const [k, v] of Object.entries(t.colores)) { if (!MATERIALES_TERRENO.some(m => m.clave === k) || !HEX.test(v)) throw new Error('Color de terreno inválido: ' + k); }
  if (t.mapa !== null && (typeof t.mapa !== 'object' || t.mapa.version !== 1)) throw new Error('Mapa de terreno inválido.');
  return t;
}
