// Pincel de dispersión: reparte copias de un objeto de la biblioteca (árboles, rocas, arbustos) dentro del círculo del pincel,
// con separación mínima, giro y escala aleatorios. Aleatorio estable (semilla) para que un trazo se pueda repetir y probar.
export function aleatorio(semilla) { let s = semilla >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Puntos [x,z] dentro de un círculo, separados al menos `separacion` entre sí y de los `existentes`.
 * `maximo` limita cuántos se crean en una pasada (evita cientos de objetos de un solo golpe).
 */
export function generarPuntos({ x, z, radio, separacion, existentes = [], semilla = 1, maximo = 40 }) {
  if (!(radio > 0) || !(separacion > 0)) throw new Error('Radio y separación deben ser positivos.');
  const r = aleatorio(semilla), aceptados = [], todos = existentes.slice(), s2 = separacion * separacion;
  const intentos = Math.min(400, Math.ceil(Math.PI * radio * radio / s2 * 3) + 10);
  for (let i = 0; i < intentos && aceptados.length < maximo; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radio, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (todos.every(([qx, qz]) => (qx - px) ** 2 + (qz - pz) ** 2 >= s2)) { aceptados.push([px, pz]); todos.push([px, pz]); }
  }
  return aceptados;
}

/** Variación por copia: giro aleatorio en Y y escala uniforme entre min y max. */
export function variacion(r, { escalaMin = .85, escalaMax = 1.2, girar = true } = {}) {
  const e = escalaMin + r() * (escalaMax - escalaMin);
  return { rotacion: [0, girar ? r() * Math.PI * 2 : 0, 0], escala: [e, e, e] };
}
