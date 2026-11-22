# Informe de implementación del plan — 11/11/2026

## 1. Resultado general

**El plan original no está implementado en su totalidad.** El avance más completo corresponde al Estudio, la dirección narrativa y el circuito de integración con los talleres. La ampliación arquitectónica de Atlas, algunas funciones avanzadas de edición y varias verificaciones integrales siguen pendientes. Las 50 actuaciones pertenecen al trabajo de Claude por instrucción expresa del usuario; no se contabilizan como contenido terminado por Codex.

La propuesta original permitía adaptar o descartar soluciones externas. Se tomó esa libertad para conservar el director y los editores existentes, pero eso no convierte automáticamente en completados los bloques que no se implementaron. Este informe separa funciones nuevas, capacidades preexistentes, verificación y pendientes.

Proyecto principal: `D:/Español/SpanStories-worktrees/visor-mundo-20261021`.

Entrada de revisión: http://localhost:3000/escenarios?modo=estudio&zone=aeropuerto-entrada

Trabajo local, sin publicar ni sincronizar con GitHub. Se conserva el visor único y los servicios existentes de Taller y facial. Se utilizaron Rachel y la entrada del aeropuerto, como pidió el usuario.

## 2. Qué se hizo y cómo se implementó

| Parte del plan | Resultado | Cómo se implementó | Alcance real |
|---|---|---|---|
| Reconocer los proyectos y los cinco ZIP | Realizado para seleccionar integraciones | Inspección de fuentes, contratos y licencias locales; comparación con las herramientas existentes | No equivale a una auditoría exhaustiva de todas las funciones y dependencias de los cinco repositorios |
| Tres espacios superiores de autoría | Implementado | Menús Estudio, Taller de animación y Taller facial; `StoryStudio.tsx` y `StudioWorkshop.tsx` | Mantienen las aplicaciones existentes y su contexto de personaje/momento |
| Rachel en el Estudio | Implementado y probado en el aeropuerto | Registro del personaje, servicio del GLB original y reproducción mediante `StoryStudioBridge.js` | No se acredita compatibilidad visual universal de personajes |
| Aeropuerto ligero | Implementado | `StudioAirport.js`, manifiesto de la entrada D00 y reutilización del prototipo mediante unión de directorio | Carga la entrada; no se integró ni revisó todo el aeropuerto |
| Editor facial original | Implementado y verificado | Puente de sesión en `FacialWorkshopBridge.mjs`; Rachel abre explícitamente con `perfil=rachel`; iframes hermanos con mensajes validados | Se conserva el acceso original; la aplicación facial independiente puede tener otras vistas desarrolladas por separado |
| Ida y vuelta de la edición facial | Circuito técnico comprobado | Viajan proyecto facial, nombre, intensidad, tiempos y curvas; el Taller guarda una versión nueva y devuelve la referencia al Estudio | Se probó una variante de integración; no constituye aprobación artística de las 50 actuaciones |
| Aislar sesiones y conservar trabajo independiente | Implementado | Identificación de sesión, origen y ventana; la sesión facial integrada evita sobrescribir el proyecto facial independiente | No se reemplazó el almacenamiento canónico de las Stories |
| Reabrir una actuación existente | Implementado y probado | `workshop.ts` selecciona la acción del actor aunque esté seleccionado un diálogo; exige selección cuando hay ambigüedad | Evita iniciar otra actuación por accidente; no decide entre varias acciones ambiguas |
| Organización y reordenación de escenas | Implementado | `StudioStoryboard.tsx` y `editing.ts`: tarjetas, arrastre, flechas y duplicación con nuevos IDs y referencias remapeadas | Se mantienen rutas y referencias a texto/actuaciones |
| Organización de momentos | Implementado | Tarjetas por momento, reordenación, duplicación y selección contextual | Las decisiones explícitas conservan sus destinos; el orden modifica la continuación implícita cuando corresponde |
| Duración por escena y momento | Implementado | `resizeScene` y `StudioMomentDuration.tsx`; espera final como opción predeterminada y reescalado explícito | Rechaza recortar acciones con el modo de espera; el audio conserva su velocidad |
| Propiedades y animación de cámara | Implementado | `StudioCameraProperties.tsx`, interpolación determinista en `director.ts` y suavizado en `motion-easing.ts` | Posición, objetivo, FOV, duración, suavizado, captura y planos en el cabezal |
| Transiciones de escena | Parcial | `StudioSceneTransition.tsx`: fundido desde negro y barrido de entrada | No hay disolución cruzada entre dos escenas simultáneas ni catálogo completo de transiciones |
| Conservar rutas, diálogo y pausas educativas | Conservado y probado | Se amplía el modelo existente de Cue/Gate; se mantienen las vistas Rutas y decisiones y Acciones | Estas capacidades eran parte del proyecto, no fueron creadas por los ZIP |
| Distribución de paneles | Implementada, pendiente de aceptación final del usuario | Escenario central, dirección debajo, propiedades a la derecha; anchos configurables, modo de enfoque y controles plegables | No es un sistema completo de paneles flotantes/acoplables como Ekza |
| Edición temporal legible | Mejorada | Zoom de timeline, duración efectiva de cámara, etiquetas de actuaciones y representación de espera final en el grafo | No se añadió un segundo secuenciador |
| Colocación precisa de personajes | Implementada | `staging.ts` y `StudioActorPlacement.tsx`: rejilla X/Z, giro de 15°, alineación, orientación, distancia en planta y altura | Actúa sobre el personaje seleccionado; no es snapping arquitectónico ni medición de edificios |
| Gráfico facial | Mejorado | `FacialCurveView.mjs`: encuadre de curvas sutiles y selección de claves | No incluye tangentes avanzadas ni todas las herramientas del Graph Editor de Ekza |
| Comprobación de historias | Implementada | `checks.ts`: recursos ausentes, momentos sin ruta, duración automática nula y acciones simultáneas sobre un actor | Son avisos de autoría; no sustituyen la inspección visual ni garantizan que toda interacción sea correcta |
| Paquetes con actuaciones y grabaciones | Implementado y probado | `portable.ts`, `local-behaviors.ts` y `/api/studio-behaviors`: validación, transporte, huellas SHA-256 y almacenamiento inmutable | Incluye dirección, actuaciones y grabaciones locales; no todos los modelos, mundos y texturas |
| Editar una actuación importada | Implementado y probado | `StudioWorkshop.tsx` prepara una nueva copia editable en la biblioteca del Taller mediante su API | La versión importada se conserva; la prueba utilizó una variante antigua de integración, ajena a la producción de las 50 |

## 3. Qué se aprovechó de cada ZIP

| Fuente entregada | Aprovechamiento efectivo | Qué no se incorporó y por qué |
|---|---|---|
| `my-motion-studio-main.zip` | Organización de escenas, inspectores y dirección de cámara; adaptación de fórmulas de suavizado | Su editor completo, otro renderer y otro reloj no eran necesarios. Exportación de vídeo y otras transiciones siguen sin implementar |
| `ekza-studio-main.zip` | Referencias de organización por tarea y utilidad de encuadre del gráfico facial | El Taller ya tenía IK/FK, poses, capas, espejo, claves y curvas. No se reemplazaron; tangentes y curvas de referencia adicionales siguen pendientes |
| `editor-main.zip` — Pascal | Conceptos de inspector contextual y colocación precisa aplicados a actores | No se integraron construcción de muros, huecos, plantas ni snapping de arquitectura. Falta la comparación específica con Atlas y un caso de construcción verificable |
| `Engine-main.zip` — StemStudio | Referencia para separar identidad, interacción y actuaciones; se conservaron las interacciones dirigidas existentes | No se incorporó código de su motor, NPC, backend o física. No se ha demostrado una nueva interacción de mundo procedente de Stem |
| `theatre-main.zip` | Comparación con la evaluación temporal ya existente | No se incorporó Theatre. Se decidió conservar un solo director; el Studio visual tiene licencia AGPL-3.0-only. No usarlo no significa que se haya implementado su editor |

La reutilización directa de código se concentra en las utilidades adaptadas de MyMotion y Ekza. Pascal aportó patrones de organización y colocación. Stem y Theatre fueron referencias evaluadas, no motores integrados. Se conservaron los avisos/licencias correspondientes al código adaptado; no se añadieron sus aplicaciones completas como dependencias.

## 4. Qué ya existía y se conservó

- El director de Story Studio, la Story canónica, sus diálogos, puertas educativas, lectura e historial de almacenamiento.
- El Taller corporal con rig canónico, importación de clips, capas, poses, IK/FK, espejo, hoja de claves, curvas y exportación three.js.
- El editor facial y su biblioteca original de expresiones.
- El editor/generador de mundos y sus identidades, escenarios y herramientas existentes.

No se atribuyen esas capacidades preexistentes a esta implementación. Tampoco se atribuyen a Codex las recetas o mejoras de las 50 actuaciones que desarrolla Claude.

## 5. Qué faltó y por qué

| Pendiente | Situación y motivo | Qué permitiría considerarlo terminado |
|---|---|---|
| Las 50 actuaciones y su aprobación | Fuera del alcance de Codex por instrucción del usuario; trabajo de Claude | Entrega y revisión de ese trabajo por su responsable. Codex solo comprobaría su transporte/integración cuando se solicite, sin reautorizar contenido |
| Validación de cada actuación y otro personaje | No realizada dentro de este trabajo; no debe inferirse del circuito de una sola variante | Pruebas explícitas de identidad, rig, morphs, contactos, reproducción y búsqueda en el personaje elegido |
| Cambiar de escenario y comprobar carga/continuidad real | El selector y el desplazamiento relativo existen, pero no se cerró la comprobación visual integral en otro escenario | Ida y vuelta con la misma actuación, sin quedarse cargando, conservando posiciones relativas, cámaras y referencias; revisión de objetos ligados a cada escenario |
| Propiedad compartida de boca, visemas, parpadeo y mirada | No se completó una nueva política general de mezcla y máscaras | Reglas explícitas de prioridad y casos reales de voz + expresión + gesto, sin doble escritura sobre huesos/morphs |
| Paquete plenamente autosuficiente | La portabilidad se cerró para actuaciones y grabaciones; el paquete aún requiere la misma Story/versión y bibliotecas de modelos/escenarios | Importar en un entorno limpio con texto canónico, GLB, texturas, escenario y recursos autorizados, sin servicios de origen |
| Distribución del almacén importado en web | El endpoint nuevo se limita al desarrollo local; no hubo autorización de publicación | Diseñar almacenamiento y URLs de distribución, comprobar persistencia y desplegar solo si se autoriza |
| Herramientas arquitectónicas de Pascal en Atlas | No implementadas; la rejilla de actores no completa ese bloque | Comparación de herramientas actuales y prototipo acotado de muros/huecos/medidas/snapping con IDs, undo y guardado preservados |
| Nuevas interacciones/NPC de Stem | No implementadas; las puertas y objetos existentes no son una integración nueva de Stem | Elegir una interacción útil para una historia, implementarla sobre el runtime existente y verificar eventos, persistencia y rendimiento |
| Física contextual | No implementada; no se definió un caso que la necesite | Caso concreto que no se resuelva con animación/interacción dirigida, con presupuesto de rendimiento y prueba de regresión |
| Tangentes y curvas de referencia avanzadas | No implementadas; se priorizó cerrar integración y dirección narrativa | Edición de tangentes/interpolación con formato persistente y equivalencia tras guardar, exportar y buscar tiempo |
| Más transiciones y exportación de vídeo | No implementadas; eran propuestas condicionales y se priorizó la historia interactiva | Reproducción/exportación coherente con audio/cámara y una regla explícita sobre qué ocurre en las pausas del estudiante |
| Aprobación visual final de la IU | Se mostraron cambios y se aplicó la dirección visual aprobada; falta feedback final sobre el resultado completo | Revisión del usuario de escenas, momentos, propiedades, talleres y uso del espacio |

**Sí quedan varios apartados del plan amplio sin implementar.** No es correcto resumirlo como «solo faltan las 50 actuaciones». Tampoco todas las propuestas pendientes exigen integrar los motores externos: algunas pueden resolverse con una ampliación pequeña del proyecto actual.

## 6. Verificación y evidencia

Resultados de las ejecuciones realizadas durante esta implementación; este informe no vuelve a ejecutar las pruebas ni audita el trabajo de Claude:

- Suite de Story Studio: **37/37** aprobadas.
- Cargador de actuaciones del visor: **3/3** aprobadas.
- TypeScript: completado sin errores tras los últimos cambios de código.
- Compilación de producción: completada; conservó un aviso de trazado dinámico de archivos en el lector/práctica. Ese aviso no impidió compilar.
- Las comprobaciones históricas del Taller/facial corresponden a sus etapas anteriores. No se presentan como certificación actual del contenido artístico que está cambiando por separado.
- Navegador: aeropuerto/Rachel, organización y duplicación, duración de momentos, zoom, exportación, importación, reproducción, acceso al editor facial original y reapertura editable de la actuación importada.
- Prueba HTTP de portabilidad: **67 pistas, 14 faciales, cero peticiones al Taller durante la carga desde el almacén del Estudio y original intacto**. El informe está en `reports/studio-portability-20261111/verification.json`.
- La copia editable recuperó nombre «Rachel · sonrisa leve · integración», duración 5 s e intensidad 0,60. Se deshicieron los cambios temporales de la puesta en escena; el ensayo guardado conserva la revisión 3. No se publicó.

Las pruebas automáticas no equivalen a aprobación visual de una actuación, a compatibilidad de todos los rigs ni a funcionamiento de otros escenarios.

Evidencia visual:

![Dirección de momentos](../reports/studio-portability-20261111/direccion-momentos.jpg)

![Paquete y comprobación](../reports/studio-portability-20261111/paquete-y-comprobacion.jpg)

## 7. Plan actualizado y documentación

El orden de los pendientes y sus criterios de aceptación se recogen en [PLAN_INTEGRACION_REVISADO.md](PLAN_INTEGRACION_REVISADO.md). El plan distingue continuidad del trabajo principal, tareas reservadas a Claude y ampliaciones condicionales. No marca como terminada una función por haberla descartado ni por existir en un ZIP.

Historial de implementación: [INTEGRACION_EDITORES.md](INTEGRACION_EDITORES.md) y [DIRECCION_NARRATIVA_20261111.md](DIRECCION_NARRATIVA_20261111.md). Sus cifras anteriores del catálogo son históricas y no sustituyen el estado actual del trabajo de Claude.
