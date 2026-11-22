// Cambios guardados que ya no tienen destino. Si cambia la revisión de un lugar y un objeto editado desaparece, su cambio NO se
// traslada en silencio a otro objeto: se lista aquí para que la persona decida (conservarlo o descartarlo). Funciones puras.
export function encontrarHuerfanos({ overrides = [], pendientes = new Map(), existe }) {
  const ids = new Set([...overrides.map(o => o.id), ...pendientes.keys()]);
  return [...ids].filter(id => !existe(id)).map(id => ({ id, cambio: pendientes.get(id) ?? overrides.find(o => o.id === id) ?? null }));
}
