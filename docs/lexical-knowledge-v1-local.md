# Progreso léxico V1 — implementación local

## Resultado

Disponible en `/progreso/practica`, sección **Mi vocabulario**, y en la ficha de cada palabra.

- Cinco estados calculados: Nuevo, Reconocido, Familiar, Aprendido y Conocido.
- Autoevaluación independiente. «Marcar como conocida» ya no quita la palabra guardada.
- Repasos pendientes, filtros de estado, reconocimiento, cloze de la historia y recuerdo.
- Las flashcards existentes registran cada respuesta, sin esperar al final de la sesión.
- Las palabras guardadas y el historial léxico están separados por UID de la cuenta; el invitado tiene un espacio independiente.
- Persistencia en este navegador. Esta entrega no sincroniza el historial léxico entre dispositivos ni publica cambios.

## Arquitectura y decisiones

`features/learner-progress/domain/knowledge.ts` define eventos inmutables y la proyección. El diario léxico V1 amplía el sistema sin cambiar el contrato SQL del diario anterior de consultas/declaraciones por lexema. El diario anterior permanece intacto; no es la autoridad del nuevo aprendizaje calculado.

`knowledge-projection.ts` reconstruye el conocimiento por estudiante e identidad exacta. Guardar, consultar y ver una traducción no equivalen a recuperar una respuesta. Las respuestas asistidas y los aciertos inmediatos tras revelar la respuesta no suman recuperación independiente. Las evidencias duplicadas se deduplican por intento. Una equivocación no borra todo el aprendizaje; los fallos recientes degradan gradualmente.

La diversidad se calcula por versión de historia. Para avanzar, cuentan los contextos de los aciertos, no solamente haber abierto historias diferentes. Las expectativas receptivas/productivas proceden del currículo; cuando no hay expectativa publicada, se utiliza el requisito productivo conservador.

`review-scheduler.ts` mantiene separados los intervalos y los estados. La política V1 usa 1/3/7/21 días y reactiva un repaso próximo cuando hay dificultad. Una autoevaluación Conocido reduce la insistencia hasta que aparece nueva evidencia de dificultad; nunca cambia el estado calculado.

`knowledge-event-repository.ts` proporciona repositorios en memoria y almacenamiento local. Cada evento se guarda bajo su propia clave, para evitar que dos pestañas sobrescriban el historial completo. Los errores de escritura se muestran y no se presentan como progreso guardado.

Los targets conservan los identificadores del sistema existente: Sense cuando está resuelto; Lexeme cuando solo existe esa identidad; selección anclada a historia/aparición cuando no existe identidad léxica. Nunca se agrupan palabras por su texto superficial. Las selecciones sin contenido publicado permanecen guardadas, pero no se inventan traducciones para hacerlas practicables.

La migración conserva NEW/LEARNING/KNOWN como autoevaluaciones, con procedencia LEGACY_MIGRATION. Los datos antiguos sin dueño verificable permanecen en invitado; no se asignan silenciosamente a una cuenta. La conversión de eventos de dominio reutiliza el resolvedor de lineage: una división ambigua no se reparte entre hijos. Las reanotaciones de apariciones se retienen sin transferir conocimiento hasta disponer de una atribución exacta.

El reconocimiento prefiere distractores de otras apariciones publicadas. Si el catálogo es pequeño, completa las opciones con un conjunto editorial de alternativas; estas opciones nunca crean identidades ni evidencias sobre otras palabras. El recuerdo de significado admite las alternativas separadas por `/` que publica la traducción. No se aplica evaluación semántica con IA.

## Verificación realizada — 15 de septiembre de 2026

- Suite completa con concurrencia 2: **500 pruebas, 499 aprobadas, 1 omitida, 0 fallos**. Incluye 19 pruebas nuevas de conocimiento, ejercicios, migración, lineage, persistencia y aislamiento de cuentas.
- La prueba omitida exige `TEST_DATABASE_URL` para PostgreSQL externo; las pruebas locales con PGlite pasaron.
- TypeScript y compilación de producción: **aprobados**. La compilación informa una advertencia de trazado en `next.config.ts`.
- Lint: **2 errores preexistentes** de `react-hooks/set-state-in-effect` en `StoryReaderScreen.tsx` (líneas 157 y 163), archivo sin modificar. Los archivos de esta entrega no añaden errores. Hay advertencias preexistentes, entre ellas imágenes `<img>`.
- Navegador local: apertura de ficha, guardar, declarar conocida conservando el guardado, reconocimiento, cloze, recuerdo, corrección de fallos, revelado de respuesta y persistencia tras recargar. También se verificó la respuesta de las flashcards existentes y se inspeccionaron visualmente ficha y vocabulario.
- El aislamiento entre cuentas se verificó con repositorios y pruebas; la sesión visual fue de invitado, sin iniciar sesión en cuentas reales.

La primera ejecución masiva del repositorio sufrió un timeout previo en spaCy por concurrencia. La integración aislada y la suite completa con concurrencia 2 pasaron sin modificar el analizador.

## Límites del contenido actual

El catálogo todavía contiene muchas selecciones sin identidad o traducción publicada. Su guardado y autoevaluación funcionan; la práctica espera el contenido editorial correspondiente. Alcanzar estados superiores requiere evidencias reales a lo largo de días y en varias historias, no repetir una sesión el mismo día.
