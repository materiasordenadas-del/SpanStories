# Plan revisado de integración — 11/11/2026

La propuesta entregada es orientativa. Este plan la convierte en funciones concretas para crear historias, conserva las herramientas existentes y separa implementación, verificación y contenido artístico. Solo trabajo local; sin publicación ni operaciones remotas de Git.

**Estado global: implementación parcial del plan amplio.** El detalle de lo hecho, cómo se implementó, sus pruebas y las causas de cada pendiente está en [INFORME_PLAN_IMPLEMENTACION_20261111.md](INFORME_PLAN_IMPLEMENTACION_20261111.md). Las mejoras del Estudio no completan por sí solas los bloques de Atlas, mezcla avanzada y portabilidad total.

**Límite actualizado por el usuario:** las 50 actuaciones están a cargo de Claude. Sus recetas, recursos, autoría y estados de revisión quedan fuera de este trabajo. No se usa un inventario antiguo como estado actual de ese contenido.

## Funciones incorporadas al flujo existente

| Necesidad | Implementación y mejora respecto a la propuesta |
|---|---|
| Tres espacios de autoría | Estudio, Taller de animación y Taller facial; sesiones enlazadas por personaje, escena y momento. |
| Rachel y aeropuerto ligero | Ensayo independiente en la entrada D00; modelos originales preservados y sin cargar primero otra ciudad. |
| Editor facial original accesible | La integración de Rachel solicita explícitamente `perfil=rachel`; conserva el editor original aunque cambie el editor predeterminado de la aplicación facial independiente. Otros personajes mantienen el acceso general. |
| Dirección como MyMotion | Tarjetas de escenas y momentos, reordenación por arrastre/flechas y duplicación. Mantiene rutas, decisiones, puertas educativas, diálogo y actuaciones por versión. |
| Duraciones utilizables | Duración total por escena y por momento. Ajuste predeterminado de la espera final sin mover ni recortar acciones; reescalado temporal explícito. La voz no cambia de velocidad. |
| Cámara y transiciones | Posición, objetivo, FOV, duración y suavizado; capturar plano y añadirlo en el cabezal. Fundido desde negro y barrido de entrada. Se conserva la búsqueda temporal determinista. |
| Distribución profesional | Escenario central, dirección debajo, propiedades contextuales a la derecha; paneles ajustables, foco, sincronización plegable y controles avanzados plegables. |
| Colocación precisa | Altura del actor, rejilla X/Z, giro de 15°, alineación con otro actor, orientación hacia él y distancia en planta. Solo modifica el actor seleccionado y conserva Y al ajustar rejilla. |
| Comprobación de historias | Avisos por recursos ausentes, momentos sin ruta desde el inicio, momentos automáticos sin duración y acciones simultáneas sobre el mismo personaje. Acceso al momento señalado. No cambia el contenido ni su estado artístico. |
| Portabilidad de actuaciones y grabaciones | Paquete `.studio.json` con dirección, versiones de actuaciones y audios locales. Importación con validación previa, huellas SHA-256 e historial para deshacer. El almacén del Estudio permite reproducir las actuaciones importadas sin consultar el Taller. |
| Continuar editando un paquete | Al abrir una actuación importada en el Taller se prepara una nueva copia editable mediante su API existente. La versión importada permanece intacta. No se reautoriza ni regenera el catálogo de 50. |
| Reabrir sin duplicar | Los menús superiores recuperan la actuación del personaje aunque esté seleccionado un diálogo. Si hay varias posibles, se requiere elegir la acción para evitar editar una variante equivocada. |

## Decisión sobre los cinco ZIP

- **MyMotionStudio:** se aprovechan la organización de escenas, el inspector y el suavizado de cámara. Se amplía su enfoque con rutas educativas y duración diferenciada de las pausas del estudiante. Licencia de las fórmulas adaptadas conservada.
- **Ekza:** se utiliza encuadre/selección del gráfico facial y organización por tarea. El Taller ya dispone de IK/FK, capas, poses, espejo, Dope Sheet y curvas; se conservan esas herramientas. No se introduce un segundo editor para duplicarlas.
- **Pascal:** se aplican los conceptos de inspector y colocación precisa a los actores de la historia. La geometría, muros y aberturas continúan siendo responsabilidad del editor de mundos vigente. No se reconstruye Atlas ni se altera arquitectura aprobada como parte de esta integración.
- **StemStudio:** se mantienen identidades estables y las interacciones dirigidas con objetos que ya existen. Las comprobaciones nuevas ayudan a detectar conflictos y referencias ausentes. No se importa su motor, backend multijugador ni física sin un caso de historia que los necesite.
- **Theatre:** se conserva el reloj y evaluador determinista existentes, que cubren estas necesidades. No se añade otro store/reloj ni el Studio AGPL. La decisión de no incorporarlo evita una integración redundante; no es una función pendiente de instalar obligatoriamente.

## Límites y trabajos opcionales separados

- El paquete transporta **dirección, actuaciones y grabaciones locales**. Los modelos y escenarios se resuelven en las bibliotecas instaladas; los audios por URL conservan su dependencia externa, indicada por la comprobación. No es una copia autosuficiente de todos los GLB, texturas y mundos.
- Para importar una puesta en escena debe estar seleccionada la misma Story y versión. El paquete no sustituye el repositorio de texto canónico ni publica una Story. La importación queda sin guardar y puede deshacerse.
- El almacén de recursos importados es local de desarrollo, en `.studio-assets/behaviors`, excluido de Git. Publicación/alojamiento de esos recursos requiere un trabajo de distribución autorizado por separado.
- Se comprueba la reproducción con Rachel y aeropuerto. No se declara revisión visual de otros personajes o escenarios ni compatibilidad universal de rigs.
- Exportación de vídeo, disolución entre dos escenas renderizadas simultáneamente, tangentes avanzadas, herramientas arquitectónicas adicionales y física contextual son ampliaciones opcionales; no se incorporan por el solo hecho de aparecer en un ZIP. No bloquean el flujo interactivo solicitado.
- La calidad artística y aprobación de las 50 actuaciones pertenecen al trabajo de Claude y a la revisión del usuario.

## Continuación actualizada: pendientes en orden de prioridad

Este orden no autoriza publicaciones, cambios destructivos ni rediseños nuevos. Antes de una decisión visual importante se mantiene la aprobación emergente solicitada por el usuario. Las decisiones técnicas rutinarias se resuelven dentro del alcance autorizado.

| Prioridad | Trabajo pendiente | Implementación prevista | Criterio de aceptación |
|---|---|---|---|
| 1. Cerrar la verificación integral | Ampliar la evidencia más allá de una variante y comprobar la continuidad de escenarios cuando se amplíe el uso actual del aeropuerto | Conservar contratos de sesión y referencias; repetir guardar/reabrir/seek y comprobar colocación, cámaras, objetos y errores de carga en un segundo escenario autorizado | Misma versión y curvas después del circuito; carga terminada; posiciones relativas conservadas; errores explícitos sin falsa confirmación de éxito |
| 2. Resolver mezcla y compatibilidad | Propiedad de boca, visemas, mirada, parpadeo, cabeza y cuello; comprobación por rig | Definir prioridades/máscaras por canal sobre el runtime existente, con datos reales del personaje; no modificar las recetas artísticas de Claude | Voz + expresión + gesto sin doble escritura, neutral conservado y resultados iguales al reproducir y buscar el mismo instante |
| 3. Completar portabilidad integral | Paquete de Story utilizable en un entorno limpio | Incorporar texto/versiones canónicas y recursos autorizados de modelos/escenarios; deduplicación por huella, límites de tamaño y manifiesto de licencias/dependencias; trabajo en D sin copias innecesarias | Abrir con los servicios de origen ausentes, recuperar texto, escena, cuerpo, rostro y grabaciones; no sobrescribir proyectos existentes |
| 4. Cerrar revisión de IU y carencias de edición | Feedback de distribución y funciones avanzadas que realmente falten | Revisar el flujo de crear una escena completa; comparar curvas/tangentes y paneles con lo que ya tiene el Taller antes de añadir controles | Funciones anteriores accesibles, espacio suficiente y cambios aprobados; cualquier nueva edición de curvas sobrevive guardado/exportación/seek |
| 5. Completar comparación de Atlas/Pascal | Herramientas arquitectónicas no cubiertas por la colocación de actores | Inventario específico del editor vigente y prototipo acotado de una herramienta útil: medidas, snapping, muros o aberturas; sin reconstruir el generador | Geometría corregible; IDs, selección, guardado y undo conservados; escenario existente intacto; revisión visual y pruebas del builder |
| 6. Interacción de mundo/Stem | Una interacción nueva útil para una historia, si la interacción vigente no basta | Implementar el caso sobre objetos con ID estable y eventos del motor actual; medir coste. Evaluar física únicamente si el caso la requiere | Objeto/NPC responde, persiste y se coordina con la puerta narrativa; no altera actuaciones ni introduce otro motor por defecto |
| 7. Cine adicional | Más transiciones y exportación de vídeo | Diseñar el comportamiento de las pausas interactivas durante la exportación; añadir las transiciones necesarias sobre el director existente | Vídeo/preview conserva cámara, tiempos y audio; resultado visual aceptado y sin efectos sobre la reproducción interactiva |

Las prioridades 1–4 cierran limitaciones del flujo principal. Las prioridades 5–7 corresponden a bloques amplios o condicionales de la propuesta; siguen sin implementar y requieren concretar el caso útil antes de ampliar código. Esta clasificación no los presenta como completados.

**Trabajo paralelo reservado:** Claude produce y revisa las 50 actuaciones. Cuando su entrega esté disponible y se solicite integrarla, se comprobarán únicamente transporte, versiones, canales, reproducción y compatibilidad con el Estudio; no se volverán a crear las actuaciones ni se modificarán sus estados artísticos por una prueba automática.

**Decisiones ya resueltas:** se conserva un solo director temporal; no se añade Theatre Studio ni se sustituyen completos los motores de Atlas o del Taller. No instalar esas aplicaciones enteras no impide desarrollar las funciones concretas anteriores.

## Evidencia

- Pruebas de Story Studio: transporte, versiones, integridad de audio, inmutabilidad, colocación, comprobaciones de rutas, orden/duplicación, tiempos, cámaras y regresión de funciones existentes.
- Verificación final: suite completa de 37 casos de Story Studio aprobada; tres casos del cargador del visor aprobados. TypeScript y compilación de producción completados. El build conserva un aviso de trazado dinámico de archivos procedente del lector/práctica, ajeno a estos cambios.
- Prueba HTTP real: `scripts/story-studio/check-portable.mjs`, usando solo lectura de una variante antigua de integración. Resultado en `reports/studio-portability-20261111/verification.json`: 67 pistas, 14 faciales, cero peticiones al Taller durante la carga desde el almacén del Estudio y original intacto.
- Navegador: exportación del ensayo actual; importación mediante selector de archivos; carga y reproducción de la actuación importada; deshacer para recuperar el borrador original. Duplicación/reordenación de momentos, ajuste de duración y zoom. Las comprobaciones no guardan ni publican los cambios temporales.
- Capturas: `reports/studio-portability-20261111/direccion-momentos.jpg` y `paquete-y-comprobacion.jpg`. El navegador queda abierto en la entrada única del Estudio con el aeropuerto y Rachel.
- Reapertura editable del paquete comprobada mediante el Estudio y la API de comandos del Taller: cuerpo disponible, Rachel, nombre «Rachel · sonrisa leve · integración», duración 5 s, intensidad 0,60 y sin cambios pendientes en esa copia. Se volvió al Estudio y se deshizo la importación; el borrador guardado mantiene la revisión 3. La prueba solo transportó la variante antigua de integración, sin intervenir en las 50 actuaciones.
- El detalle de la primera integración y de la dirección narrativa anterior permanece en `INTEGRACION_EDITORES.md` y `DIRECCION_NARRATIVA_20261111.md` como historial, sin confundirlo con la situación actual de las actuaciones.
