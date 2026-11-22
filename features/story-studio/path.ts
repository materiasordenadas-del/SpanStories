import type { Vec3 } from './model.ts';

/**
 * Camino de una caminata: el actor sale de donde está, pasa por los puntos y termina en el último.
 * Curva Catmull-Rom por los puntos, recorrida a velocidad constante; t ∈ [0, 1].
 * Devuelve la posición y hacia dónde anda (null si no se mueve).
 */
type RouteSamples = { readonly pts: readonly Vec3[]; readonly len: readonly number[]; readonly total: number };
/**
 * Caché de curvas por contenido (LRU). sampleSequence reconstruye la escena entera en cada fotograma y una
 * caminata con camino costaba reconstruir su curva cada vez (≈ 90 % del tiempo en la escena de referencia).
 * La clave lleva los números exactos, así que el resultado es idéntico al de calcularla de nuevo.
 * Los arrays devueltos se comparten: no se modifican (routePoint devuelve siempre copias).
 */
const ROUTE_CACHE_SIZE = 512;
const routeCache = new Map<string, RouteSamples>();
export function routeSamples(start: Vec3, points: readonly Vec3[], curve = true, step = 0.15): RouteSamples {
  const key = `${curve ? 1 : 0}|${step}|${start.join(',')}|${points.map(p => p.join(',')).join(';')}`;
  const cached = routeCache.get(key);
  if (cached) { routeCache.delete(key); routeCache.set(key, cached); return cached; }
  const result = buildRouteSamples(start, points, curve, step);
  routeCache.set(key, result);
  if (routeCache.size > ROUTE_CACHE_SIZE) routeCache.delete(routeCache.keys().next().value!);
  return result;
}

function buildRouteSamples(start: Vec3, points: readonly Vec3[], curve: boolean, step: number): RouteSamples {
  const P: Vec3[] = [start, ...points].filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) > 1e-6);
  const pts: Vec3[] = [];
  const n = P.length;
  const at = (i: number) => P[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const k = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / step));
    for (let j = 0; j < k; j++) {
      const u = j / k, u2 = u * u, u3 = u2 * u;
      const c = (a: number, b: number, c2: number, d: number) => curve && n > 2 ? 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3) : b + (c2 - b) * u;
      pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), c(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  pts.push(P[n - 1]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
  return { pts, len, total: len[len.length - 1] };
}

export function routePoint(start: Vec3, points: readonly Vec3[], t: number, curve = true): { position: Vec3; heading: number | null } {
  const { pts, len, total } = routeSamples(start, points, curve);
  if (pts.length < 2 || total < 1e-6) return { position: [...(pts[pts.length - 1] ?? start)] as unknown as Vec3, heading: null };
  const s = Math.max(0, Math.min(1, t)) * total;
  let i = 1;
  while (i < len.length - 1 && len[i] < s) i++;
  const a = pts[i - 1], b = pts[i], d = len[i] - len[i - 1] || 1, u = (s - len[i - 1]) / d;
  return { position: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], heading: Math.atan2(b[0] - a[0], b[2] - a[2]) };
}

/** Longitud del recorrido (para proponer una duración a paso normal). */
export const routeLength = (start: Vec3, points: readonly Vec3[], curve = true) => routeSamples(start, points, curve).total;
