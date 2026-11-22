import { collidesAt } from '../CityNavigation.js';

/**
 * Interfaz de navegación de la vida ambiental. La inteligencia de los NPC solo
 * depende de este contrato, nunca de la implementación concreta: hoy una
 * cuadrícula con A*; más adelante Recast NavMesh + DetourCrowd sin reescribir
 * la decisión ni el grabador.
 *
 * @typedef {[number,number,number]} Punto
 * @typedef {{
 *   tipo: string,
 *   esTransitable(x:number,z:number): boolean,
 *   puntoCercano(p:Punto): Punto|null,
 *   buscarRuta(desde:Punto,hasta:Punto): Punto[]|null,
 *   altura(x:number,z:number): number,
 *   puntoAleatorio(azar:()=>number): Punto|null,
 * }} NavegacionVida
 */

const VECINOS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];

/** Comprueba que un objeto cumple la interfaz; útil al enchufar otras implementaciones. */
export function validarNavegacion(nav) {
  for (const f of ['esTransitable', 'puntoCercano', 'buscarRuta', 'altura', 'puntoAleatorio'])
    if (typeof nav?.[f] !== 'function') throw new Error('La navegación de la vida no implementa ' + f);
  return nav;
}

/**
 * Cuadrícula transitable alrededor de un área. Solo se usa en el estudio, al
 * grabar el ambiente; el reproductor del estudiante no la necesita.
 */
export function crearNavegacionCuadricula({
  centro, radio = 30, celda = .5, ground = () => 0, colliders = () => [],
  radioAgente = .3, alturaAgente = 1.7, pasoMaximo = .35, limites = null,
}) {
  if (!Array.isArray(centro) || !centro.every(Number.isFinite)) throw new Error('El área del ambiente necesita un centro válido.');
  if (!(radio > 0 && radio <= 120) || !(celda >= .25 && celda <= 2)) throw new Error('Área del ambiente fuera de rango.');
  const n = Math.ceil(radio * 2 / celda) + 1, x0 = centro[0] - radio, z0 = centro[2] - radio;
  const alturas = new Float32Array(n * n), libre = new Uint8Array(n * n);
  const lim = limites ? { min: limites.min, max: limites.max } : null;
  const punto = { x: 0, y: 0, z: 0 };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = x0 + i * celda, z = z0 + j * celda, k = j * n + i;
    const y = ground(x, z); alturas[k] = y;
    if (!Number.isFinite(y)) continue;
    if (lim && (x < lim.min[0] + radioAgente || x > lim.max[0] - radioAgente || z < lim.min[2] + radioAgente || z > lim.max[2] - radioAgente)) continue;
    if ((x - centro[0]) ** 2 + (z - centro[2]) ** 2 > radio * radio) continue;
    punto.x = x; punto.y = y; punto.z = z;
    libre[k] = collidesAt(punto, colliders(punto, radioAgente), { radius: radioAgente, height: alturaAgente }) ? 0 : 1;
  }
  // Pendientes y escalones altos no son caminables aunque no haya colisión.
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i; if (!libre[k]) continue;
    for (const [di, dj] of [[1,0],[0,1]]) {
      const a = i + di, b = j + dj; if (a >= n || b >= n) continue;
      if (Math.abs(alturas[b * n + a] - alturas[k]) > pasoMaximo) { libre[k] = 2; break; }
    }
  }
  const indice = (x, z) => {
    const i = Math.round((x - x0) / celda), j = Math.round((z - z0) / celda);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
  };
  const centroCelda = k => [x0 + (k % n) * celda, alturas[k], z0 + Math.floor(k / n) * celda];
  const esTransitable = (x, z) => { const k = indice(x, z); return k >= 0 && libre[k] === 1; };
  function puntoCercano(p) {
    const k = indice(p[0], p[2]);
    if (k >= 0 && libre[k] === 1) return [p[0], alturas[k], p[2]];
    const ci = Math.round((p[0] - x0) / celda), cj = Math.round((p[2] - z0) / celda);
    for (let r = 1; r < Math.min(n, 24); r++) {
      let mejor = -1, distancia = Infinity;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n || (Math.abs(i - ci) !== r && Math.abs(j - cj) !== r)) continue;
        const q = j * n + i; if (libre[q] !== 1) continue;
        const d = (i - ci) ** 2 + (j - cj) ** 2; if (d < distancia) { distancia = d; mejor = q; }
      }
      if (mejor >= 0) return centroCelda(mejor);
    }
    return null;
  }
  // Línea de visión muestreada a media celda: permite suavizar rutas en zigzag.
  function visible(a, b) {
    const d = Math.hypot(b[0] - a[0], b[2] - a[2]), pasos = Math.max(1, Math.ceil(d / (celda * .5)));
    for (let s = 1; s < pasos; s++) {
      const t = s / pasos;
      if (!esTransitable(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)) return false;
    }
    return true;
  }
  function buscarRuta(desde, hasta) {
    const a = puntoCercano(desde), b = puntoCercano(hasta);
    if (!a || !b) return null;
    const inicio = indice(a[0], a[2]), meta = indice(b[0], b[2]);
    if (inicio === meta) return [a, [b[0], b[1], b[2]]];
    const g = new Float32Array(n * n).fill(Infinity), padre = new Int32Array(n * n).fill(-1), cerrado = new Uint8Array(n * n);
    const heap = [], mi = meta % n, mj = Math.floor(meta / n);
    const h = k => { const dx = Math.abs(k % n - mi), dz = Math.abs(Math.floor(k / n) - mj); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const empujar = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const sacar = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    g[inicio] = 0; empujar(h(inicio), inicio);
    let expandidos = 0;
    while (heap.length && expandidos++ < n * n) {
      const [, k] = sacar(); if (cerrado[k]) continue; cerrado[k] = 1;
      if (k === meta) break;
      const i = k % n, j = Math.floor(k / n);
      for (const [di, dj, coste] of VECINOS) {
        const a2 = i + di, b2 = j + dj; if (a2 < 0 || b2 < 0 || a2 >= n || b2 >= n) continue;
        const q = b2 * n + a2; if (libre[q] !== 1 || cerrado[q]) continue;
        // Las diagonales no recortan esquinas de obstáculos.
        if (di && dj && (libre[j * n + a2] !== 1 || libre[b2 * n + i] !== 1)) continue;
        const nuevo = g[k] + coste; if (nuevo >= g[q]) continue;
        g[q] = nuevo; padre[q] = k; empujar(nuevo + h(q), q);
      }
    }
    if (!cerrado[meta]) return null;
    const celdas = []; for (let k = meta; k !== -1; k = padre[k]) celdas.push(centroCelda(k));
    celdas.reverse(); celdas[0] = a; celdas[celdas.length - 1] = [b[0], b[1], b[2]];
    const ruta = [celdas[0]];
    for (let i = 1; i < celdas.length; i++) {
      if (i === celdas.length - 1 || !visible(ruta.at(-1), celdas[i + 1])) ruta.push(celdas[i]);
    }
    return ruta.map(p => [p[0], ground(p[0], p[2]), p[2]]);
  }
  function puntoAleatorio(azar) {
    for (let intento = 0; intento < 200; intento++) {
      const k = Math.floor(azar() * n * n); if (libre[k] === 1) return centroCelda(k);
    }
    return null;
  }
  const libres = libre.reduce((s, v) => s + (v === 1), 0);
  return { tipo: 'cuadricula', celda, celdas: n * n, libres, esTransitable, puntoCercano, buscarRuta, altura: ground, puntoAleatorio };
}
