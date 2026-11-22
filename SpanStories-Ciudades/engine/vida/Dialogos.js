/**
 * Banco de diálogos prediseñados (nivel A1). Es la inteligencia conversacional
 * de la vida ambiental, separada del movimiento: el grabador solo pide "una
 * conversación de tipo X entre estos roles" y guarda las frases con su tiempo.
 * No depende de ningún servicio externo; el autor puede editar cada frase en el
 * estudio después de grabar.
 */
export const DIALOGOS = Object.freeze({
  pedir: [
    [['cliente', 'Hola, buenos días.'], ['atiende', '¡Buenos días! ¿Qué le pongo?'], ['cliente', 'Un café con leche, por favor.'], ['atiende', 'Muy bien. Ahora mismo.']],
    [['cliente', 'Perdone, ¿tiene agua?'], ['atiende', 'Sí, claro. ¿Fría o natural?'], ['cliente', 'Fría, por favor.'], ['atiende', 'Aquí tiene.']],
    [['cliente', 'Hola. Un zumo de naranja, por favor.'], ['atiende', '¿Grande o pequeño?'], ['cliente', 'Pequeño. ¿Cuánto es?'], ['atiende', 'Son dos euros.']],
    [['cliente', '¿Me cobra, por favor?'], ['atiende', 'Sí. Son tres euros con cincuenta.'], ['cliente', 'Gracias. Adiós.'], ['atiende', '¡Hasta luego!']],
  ],
  conversar: [
    [['a', '¡Hola! ¿Qué tal?'], ['b', 'Muy bien, ¿y tú?'], ['a', 'Bien, gracias.']],
    [['a', '¡Qué buen día hace hoy!'], ['b', 'Sí, hace mucho sol.'], ['a', '¿Vamos a la plaza?'], ['b', 'Vale, vamos.']],
    [['a', '¿A qué hora es la clase?'], ['b', 'A las cinco.'], ['a', 'Perfecto, gracias.']],
    [['a', '¿Dónde vives?'], ['b', 'Vivo cerca de aquí.'], ['a', '¡Qué bien!']],
  ],
  mirar: [
    [['a', '¡Qué bonito!']], [['a', 'Mmm… es un poco caro.']], [['a', 'Me gusta mucho.']],
  ],
  esperar: [
    [['a', '¿Cuándo llega el autobús?']], [['a', 'Ya es tarde…']],
  ],
});
export const SITUACIONES_DIALOGO = Object.freeze(Object.keys(DIALOGOS));

/** Duración aproximada de lectura/escucha de una frase para principiantes. */
export const duracionFrase = texto => Math.min(6, Math.max(1.6, .6 + texto.split(/\s+/).length * .42));

/** Elige un diálogo de la situación y asigna cada turno a un NPC concreto. */
export function elegirDialogo(situacion, azar, hablantes) {
  const opciones = DIALOGOS[situacion]; if (!opciones?.length) return [];
  const dialogo = opciones[Math.floor(azar() * opciones.length) % opciones.length];
  return dialogo.map(([papel, texto]) => ({ npcId: hablantes[papel] ?? hablantes.a, texto })).filter(t => t.npcId);
}
