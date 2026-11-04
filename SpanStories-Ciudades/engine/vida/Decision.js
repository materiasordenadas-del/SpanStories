/**
 * Inteligencia de decisión: elige la siguiente actividad de un NPC a partir de
 * su identidad, de los puntos con afordancias declaradas y de lo que ocurre a
 * su alrededor (plazas ocupadas, si hay alguien atendiendo, qué hizo antes).
 * Es una IA de utilidad: puntúa cada opción y elige con azar determinista
 * entre las mejores, para que dos NPC iguales no hagan lo mismo.
 */
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function puntuarOpciones({ identidad, npc, puntos, ocupacion, atendidos }) {
  const opciones = [], { rol } = identidad;
  const puesto = rol.puesto ? puntos.find(p => p.id === npc.puestoId) : null;
  for (const p of puntos) {
    let peso = identidad.pesos[p.kind] || 0;
    if (!peso || (p.roles?.length && !p.roles.includes(identidad.roleId))) continue;
    if ((ocupacion.get(p.id)?.size || 0) >= p.slots && !ocupacion.get(p.id)?.has(npc.id)) continue;
    if (puesto && p.kind !== rol.puesto && distancia(p.position, puesto.position) > rol.radioPuesto) continue;
    // Un puesto de trabajo pertenece a quien lo ocupa al empezar.
    if (rol.puesto && p.kind === rol.puesto && npc.puestoId && p.id !== npc.puestoId) continue;
    if (p.kind === 'pedir' && !atendidos(p)) peso *= .15;
    if (npc.recientes.includes(p.id)) peso *= p.id === npc.puestoId ? .6 : .15;
    peso /= 1 + distancia(npc.posicion, p.position) / 15;
    opciones.push({ punto: p, peso });
  }
  if (identidad.pesos.pasear) opciones.push({ punto: null, peso: identidad.pesos.pasear * .5 });
  return opciones;
}

export function decidir(contexto, azar) {
  const opciones = puntuarOpciones(contexto);
  if (!opciones.length) return { punto: null };
  // Elevar al cuadrado favorece las buenas opciones sin eliminar la variedad.
  const total = opciones.reduce((s, o) => s + o.peso * o.peso, 0);
  let r = azar() * total;
  for (const o of opciones) { r -= o.peso * o.peso; if (r <= 0) return o; }
  return opciones.at(-1);
}
