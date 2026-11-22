// Mapa de densidad del césped: una cuadrícula de celdas (Uint8) sobre una zona del escenario. El pincel modifica ESTOS datos;
// las matas se generan y dibujan por instancias a partir de ellos. Sin dependencias de three: se prueba en Node.
const MAX_CELDAS = 1_000_000;                  // 1000 × 1000 celdas como tope (1 MB por mapa)

export const MODOS_PINCEL = Object.freeze(['anadir', 'borrar', 'densidadMas', 'densidadMenos', 'suavizar']);

/** Codificación RLE sencilla (pares [repeticiones, valor]) + base64: un mapa casi uniforme ocupa pocos bytes. */
export function rleCodificar(bytes) {
  const salida = [];
  for (let i = 0; i < bytes.length;) { let n = 1; while (i + n < bytes.length && bytes[i + n] === bytes[i] && n < 255) n++; salida.push(n, bytes[i]); i += n; }
  let bin = ''; for (let i = 0; i < salida.length; i += 8192) bin += String.fromCharCode(...salida.slice(i, i + 8192));
  return btoa(bin);
}
export function rleDecodificar(texto, largo) {
  const bin = atob(texto), salida = new Uint8Array(largo); let p = 0;
  for (let i = 0; i + 1 < bin.length; i += 2) { const n = bin.charCodeAt(i), v = bin.charCodeAt(i + 1); if (p + n > largo) throw new Error('Mapa de densidad corrupto.'); salida.fill(v, p, p + n); p += n; }
  if (p !== largo) throw new Error('Mapa de densidad incompleto.');
  return salida;
}

export class MapaDensidad {
  /** Zona rectangular [x0, x0+ancho) × [z0, z0+alto) en metros; `celda` = lado de cada celda; `base` = valor 0..1 inicial. */
  constructor({ x0, z0, ancho, alto, celda = 1, base = 0 }) {
    if (![x0, z0, ancho, alto, celda].every(Number.isFinite) || ancho <= 0 || alto <= 0 || celda <= 0) throw new Error('Zona de césped inválida.');
    this.x0 = x0; this.z0 = z0; this.ancho = ancho; this.alto = alto; this.celda = celda;
    this.nx = Math.max(1, Math.ceil(ancho / celda)); this.nz = Math.max(1, Math.ceil(alto / celda));
    if (this.nx * this.nz > MAX_CELDAS) throw new Error('La zona de césped es demasiado grande para esa resolución.');
    this.datos = new Uint8Array(this.nx * this.nz).fill(Math.round(Math.max(0, Math.min(1, base)) * 255));
  }

  /** Densidad 0..1 en un punto del mundo (interpolación bilineal). Fuera de la zona: 0. */
  densidadEn(x, z) {
    const fx = (x - this.x0) / this.celda - .5, fz = (z - this.z0) / this.celda - .5;
    if (fx < -.5 || fz < -.5 || fx > this.nx - .5 || fz > this.nz - .5) return 0;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const v = (i, j) => this.datos[Math.max(0, Math.min(this.nz - 1, j)) * this.nx + Math.max(0, Math.min(this.nx - 1, i))] / 255;
    return (v(ix, iz) * (1 - tx) + v(ix + 1, iz) * tx) * (1 - tz) + (v(ix, iz + 1) * (1 - tx) + v(ix + 1, iz + 1) * tx) * tz;
  }

  /**
   * Una pasada del pincel. modo: anadir (sube hacia 1) · borrar (baja hacia 0) · densidadMas/Menos (±intensidad) · suavizar (promedia).
   * radio en metros; intensidad 0..1; dureza 0..1 (1 = borde duro). Devuelve true si cambió algo.
   */
  pintar({ x, z, radio, intensidad = .5, dureza = .5, modo = 'anadir' }) {
    if (!MODOS_PINCEL.includes(modo)) throw new Error('Modo de pincel desconocido: ' + modo);
    const i0 = Math.max(0, Math.floor((x - radio - this.x0) / this.celda)), i1 = Math.min(this.nx - 1, Math.ceil((x + radio - this.x0) / this.celda));
    const j0 = Math.max(0, Math.floor((z - radio - this.z0) / this.celda)), j1 = Math.min(this.nz - 1, Math.ceil((z + radio - this.z0) / this.celda));
    const copia = modo === 'suavizar' ? this.datos.slice() : null; let cambio = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = this.x0 + (i + .5) * this.celda, cz = this.z0 + (j + .5) * this.celda, d = Math.hypot(cx - x, cz - z);
      if (d > radio) continue;
      const t = d / radio, caida = dureza >= 1 ? 1 : Math.max(0, Math.min(1, (1 - t) / Math.max(1e-6, 1 - dureza)));   // dureza alta → casi todo al máximo
      const peso = caida * intensidad, k = j * this.nx + i, v = this.datos[k]; let n = v;
      if (modo === 'anadir') n = v + (255 - v) * peso;
      else if (modo === 'borrar') n = v - v * peso;
      else if (modo === 'densidadMas') n = v + 255 * peso * .25;
      else if (modo === 'densidadMenos') n = v - 255 * peso * .25;
      else { let suma = 0, c = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue; suma += copia[jj * this.nx + ii]; c++; } n = v + (suma / c - v) * Math.min(1, peso * 1.5); }
      n = Math.max(0, Math.min(255, Math.round(n)));
      if (n !== v) { this.datos[k] = n; cambio = true; }
    }
    return cambio;
  }

  rellenar(valor) { this.datos.fill(Math.round(Math.max(0, Math.min(1, valor)) * 255)); }
  clonar() { const m = new MapaDensidad({ x0: this.x0, z0: this.z0, ancho: this.ancho, alto: this.alto, celda: this.celda }); m.datos.set(this.datos); return m; }
  copiarDe(otro) { if (otro.nx !== this.nx || otro.nz !== this.nz) throw new Error('Los mapas no tienen el mismo tamaño.'); this.datos.set(otro.datos); }
  /** Fracción de celdas con césped (> 5 %). */
  get cobertura() { let n = 0; for (const v of this.datos) if (v > 12) n++; return n / this.datos.length; }

  serializar() { return { version: 1, x0: this.x0, z0: this.z0, ancho: this.ancho, alto: this.alto, celda: this.celda, d: rleCodificar(this.datos) }; }
  static deserializar(o) {
    if (!o || o.version !== 1 || typeof o.d !== 'string') throw new Error('Mapa de césped incompatible.');
    const m = new MapaDensidad({ x0: o.x0, z0: o.z0, ancho: o.ancho, alto: o.alto, celda: o.celda });
    m.datos = rleDecodificar(o.d, m.nx * m.nz); return m;
  }
}
