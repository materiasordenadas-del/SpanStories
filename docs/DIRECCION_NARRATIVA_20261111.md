# Dirección narrativa — revisión local 11/11/2026

Se amplía el Estudio existente tomando MyMotion Studio como referencia de organización. No se sustituye el editor ni se incorpora otro reloj. El ensayo utiliza la entrada del aeropuerto y Rachel; no hay publicación.

## Cambios

- Dirección de la historia: vistas Escenas, Momentos, Rutas y decisiones, y Acciones. Las rutas, preguntas y pausas del estudiante se conservan.
- Tarjetas de escenas con orden, duración, escenario, momentos, personajes y transición. Reordenación por arrastre o flechas; duplicación con nuevos identificadores y referencias internas remapeadas.
- Inspector de escena: nombre, duración y transición de entrada. El ajuste predeterminado conserva las acciones y modifica la espera final; rechaza recortarlas. El reescalado temporal es una opción explícita. El audio mantiene su velocidad original.
- Entradas por fundido desde negro o barrido con duración y suavizado. No son disoluciones entre dos escenas renderizadas simultáneamente. Las pausas interactivas no se incluyen como una duración finita.
- Inspector de cámara: posición, objetivo, campo de visión, duración y suavizado. Se pueden capturar y añadir planos en el cabezal. Los movimientos solapados parten de una pose determinista.
- Panel de dirección bajo el escenario y propiedades a la derecha; anchos ajustables y modo Enfocar escenario. La sincronización se puede plegar para dar espacio a las escenas; Momentos y Acciones la muestran. Acciones y Diálogo/voz disponen de cajones plegables.
- Guardar o editar el mismo momento conserva el cabezal; cambiar de momento restablece su tiempo.

## Verificación

- 29 pruebas de Story Studio aprobadas, incluidas duplicación, reordenación, ajuste temporal, conservación de actuaciones guardadas, transiciones, cámara y compatibilidad con proyectos anteriores.
- Comprobación TypeScript del Estudio completada sin errores.
- Navegador: duplicar y reordenar dos escenas; ajustar la segunda a 20 segundos; comprobar fundido y barrido; editar un plano en el segundo 2 con movimiento de 1,2 segundos; comprobar cinco pausas por escena y guardar conservando el cabezal en 4 segundos.
- Ensayo guardado en el navegador como borrador, revisión 3: dos escenas, 37 segundos de animación y 10 pausas interactivas. No se modificaron ni publicaron otras historias.
- Capturas en `D:/Español/imagen para animación/Animación 3D/taller-animacion/reports/integracion-estudio-20261111/`: `direccion-narrativa-escenas.png` y `propiedades-camara.png`.
- Vista de revisión: http://localhost:3000/escenarios?modo=estudio&zone=aeropuerto-entrada

La distribución queda pendiente de feedback visual. El cuerpo Idle de Rachel sigue inclinando la cabeza y requiere revisión artística; esta etapa no lo modifica ni convierte los 50 objetivos en actuaciones aprobadas. La exportación de vídeo y las demás capacidades pendientes de los ZIP siguen descritas en INTEGRACION_EDITORES.md.
