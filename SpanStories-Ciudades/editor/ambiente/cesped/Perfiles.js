// Las 13 variantes del catálogo de césped V12. Cada una es un PERFIL (parámetros sobre el motor compartido GrassField del
// Generador) o una variante técnica distinta. NO se cargan 13 motores: se cambia de apariencia con el mismo.
//   estado 'disponible' = se aplica con GrassField · 'solo-colina' = ya existe dentro de la colina del motor (ColinaQuijote)
//   · 'pendiente' = módulo propio del V12 que todavía no se ha portado (ver docs/editor/PENDIENTES_NO_RESUELTOS.md).
// Los parámetros de Ocarina V1 son exactos (ootDefaults de V12). Los colores de los 6 perfiles de estilo son una interpretación
// propia: V12 los toma del estilo activo, que aquí ya aplica el compositor.
export const PERFILES_CESPED = Object.freeze([
  { id: 'trigun', nombre: 'Trigun', grupo: 'Estilos', estado: 'disponible', nota: 'Verde anime frío, hojas finas.', params: { root: '#2d5b4a', main: '#6fae5a', tip: '#c7e07a', width: .09, colorVariation: .2 } },
  { id: 'zelda', nombre: 'Zelda', grupo: 'Estilos', estado: 'disponible', nota: 'Hojas anchas y luminosas, aire de acuarela.', params: { root: '#2f5a2a', main: '#78b04a', tip: '#d4e585', width: .12, translucency: .22 } },
  { id: 'ghibli', nombre: 'Studio Ghibli', grupo: 'Estilos', estado: 'disponible', nota: 'Más variación de color y altura, tonos cálidos.', params: { root: '#3b6140', main: '#8cb860', tip: '#e0e6a0', colorVariation: .32, sizeVariation: .4, height: 1 } },
  { id: 'dispatch', nombre: 'Dispatch', grupo: 'Estilos', estado: 'disponible', nota: 'Verdes fríos con punta neón.', params: { root: '#203a4a', main: '#3fa58a', tip: '#d8f06a', gradient: .8 } },
  { id: 'color', nombre: 'Color', grupo: 'Estilos', estado: 'disponible', nota: 'Valores por defecto del motor; referencia neutra.', params: {} },
  { id: 'colorline', nombre: 'Color + línea', grupo: 'Estilos', estado: 'disponible', nota: 'Igual que Color; el contorno lo da el estilo.', params: {} },
  { id: 'ocarina-v1', nombre: 'Ocarina Remake V1', grupo: 'Ocarina', estado: 'disponible', nota: 'Césped bajo y denso (parámetros exactos de V12).',
    params: { preset: 'personalizado', height: .29, width: .035, curvature: .22, sizeVariation: .65, density: 100, root: '#203b21', main: '#4d7529', tip: '#91ad43', windStrength: .18, windSpeed: 1.25, blades: 5, lod0: 12, lod1: 50, transition: 4, lod1Density: .15 } },
  { id: 'james', nombre: 'James Smyth', grupo: 'Otros', estado: 'disponible', nota: 'Césped alto de la demo de James Smyth (motor del Generador).', params: {} },
  { id: 'colina-original', nombre: 'Colina original', grupo: 'Otros', estado: 'solo-colina', nota: 'Ya forma parte de las colinas del motor; se regula con «Densidad del césped» de la colina.', params: {} },
  { id: 'ocarina-v2', nombre: 'Ocarina Remake V2', grupo: 'Ocarina', estado: 'pendiente', nota: 'Módulo propio de V12 (ColinaOcarinaV2): no portado todavía.', params: {} },
  { id: 'ocarina-v3', nombre: 'Ocarina Remake V3', grupo: 'Ocarina', estado: 'pendiente', nota: 'Módulo propio de V12 (863 304 triángulos): no portado todavía.', params: {} },
  { id: 'ocarina-v4', nombre: 'Ocarina Remake V4', grupo: 'Ocarina', estado: 'pendiente', nota: 'Módulo propio de V12: no portado todavía.', params: {} },
  { id: 'pradera-v5', nombre: 'Pradera V5 (5×5 m)', grupo: 'Otros', estado: 'pendiente', nota: 'Módulo propio de V12 para una parcela de 5×5 m: no portado todavía.', params: {} },
]);
export const GRUPOS_CESPED = Object.freeze(['Estilos', 'Ocarina', 'Otros']);
export const perfilCesped = id => PERFILES_CESPED.find(p => p.id === id) ?? null;

export const CESPED_DEFECTO = Object.freeze({
  activo: true, perfil: 'color', params: {}, calidad: 'alto', base: 'vacio', mapa: null,
});

const CALIDADES = ['bajo', 'medio', 'alto', 'ultra'];
/** Valida y completa un perfil de césped guardado. */
export function normalizarCesped(entrada = {}) {
  const c = { ...CESPED_DEFECTO, ...entrada, params: { ...(entrada.params ?? {}) } };
  const p = perfilCesped(c.perfil);
  if (!p) throw new Error('Perfil de césped desconocido: ' + c.perfil);
  if (!CALIDADES.includes(c.calidad)) throw new Error('Calidad de césped inválida.');
  if (!['vacio', 'lleno'].includes(c.base)) throw new Error('Base de césped inválida.');
  if (c.mapa !== null && (typeof c.mapa !== 'object' || c.mapa.version !== 1)) throw new Error('Mapa de césped inválido.');
  return c;
}
