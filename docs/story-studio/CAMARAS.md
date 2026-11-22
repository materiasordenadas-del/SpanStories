# Cámaras cinematográficas del Estudio

Implementación del «Plan v2 — Sistema de cámaras cinematográficas» (17/11/2026). La fase 0 (líneas base,
suposiciones verificadas, rendimiento) está en [CAMARAS-FASE-0.md](CAMARAS-FASE-0.md).

## Cómo se usa (Estudio › Propiedades › Cámara)

Los controles de siempre siguen arriba: cámara inicial de la escena y «＋ Plano» (cues `camera` antiguos).
Debajo, **Cámaras con nombre**:

- **＋ Nueva cámara desde la vista**: una cámara fija con el encuadre actual.
- Por cámara: **Editar · Ver · Pilotar · ✂ Cortar aquí · ⤳ Mezclar aquí · ＋ Movimiento · Duplicar · Borrar**.
  - *Ver* lleva la vista a la pose que tiene la cámara en el instante actual (pasa a «Vista libre»).
  - *Pilotar*: mueve la vista y, al soltar cada gesto, la pose de reposo de la cámara se actualiza (un paso de deshacer por gesto).
  - *Borrar* una cámara en uso pregunta qué hacer: **congelar planos** (cada cambio pasa a plano fijo con la pose de ese instante), **quitar sus cambios** o **pasarlos a otra cámara**.
- Editor de la cámara: pose de reposo, **movimiento** (fija · sigue a un personaje · recorre un camino · gira alrededor), **orientación** (dirección fija · mira a un personaje · encuadra a varios · mira a un punto u objeto), **lente** en grados y mm equivalentes, «solo entra con corte».
- **Ver por la cámara / Vista libre**: en vista libre, buscar en la línea de tiempo no mueve tu vista; al reproducir siempre se ve la historia.
- **Zonas seguras** 16:9 y 4:3 y zona de subtítulos (el estudiante usa la app en horizontal).
- **Ritmo** y **Proponer planos para los diálogos…** (director automático, ver abajo).
- **Revisar cámaras con el escenario**: el motor comprueba paredes, interior de edificios, oclusión y encuadre; los avisos aparecen en las comprobaciones y caducan solos si cambia algo (`cameraAuditKey`).

En la línea de tiempo, la pista **Cámara** es el Switcher: cues antiguos y cambios ✂/⤳. Cada cámara con camino u
órbita tiene su pista **↳ nombre** con sus «Movimientos» (progreso 0–100 %). Al seleccionar un cambio o un
movimiento, «Momento» muestra su inspector (cámara, corte/mezcla, duración, recorrido recto o en arco, ritmo).

## Modelo (`features/story-studio/`)

| Archivo | Qué hace |
|---|---|
| `camera-model.ts` | Tipos (`CameraRig` con un único `body` y un único `aim`, `cameraSwitch`, `cameraMove`, `AutoOrigin`, `AutoDirection`, `CameraAudit`) y su validación. |
| `camera-eval.ts` | Pose de una cámara en T, suavizado gaussiano centrado (sin retraso) y mezcla (slerp de orientación, distancia aparte, posición lineal o en arco). |
| `camera-timeline.ts` | Visita a la escena: actores en cualquier instante, progreso de movimientos, programa del Switcher y mezclas anidadas (máx. 3). |
| `actor-motion.ts` | Única fuente del movimiento de actores (director y cámaras). |
| `camera-editing.ts` | Operaciones puras de cámaras y la integridad de las existentes. |
| `camera-audit.ts` | Qué preguntar al motor en la revisión y cómo traducir las respuestas. |
| `auto-director.ts` | Director automático de diálogos. |

Reglas que no se negocian (plan §2), con su prueba:

- **Determinismo y compatibilidad**: una escena sin cambios del Switcher usa el cálculo antiguo, idéntico bit a bit (`camera-baseline.test.ts`). Con Switcher, los cues antiguos dan la misma pose exacta (`camera-rigs.test.ts`). Reproducir = saltar, y continuidad a 60 Hz salvo en cortes.
- **Desempate**: por instante y, si coinciden, por orden de lista (decisión del 17/11; `byStart`). `checks.ts` avisa de dos cambios simultáneos.
- **Suavizado**: la ventana se estrecha hasta 0 en las fronteras duras (inicio de la escena, puertas que esperan al estudiante, horizonte conocido), así no hay saltos al cruzarlas; a través de puertas automáticas mira hacia delante.
- **Integridad**: ninguna operación deja referencias colgantes (40 secuencias aleatorias × 25 operaciones en `camera-editing.test.ts`).

## Motor (`SpanStories-Ciudades/engine/StoryStudioBridge.js`)

- `STAGE` puede traer `camera` ({id, switchId, cut, blend}) y, al reproducir, `track` (fotogramas cada 0,05 s calculados por `director.lookahead`). El motor interpola cámara y actores a su propia frecuencia (los mensajes llegan a ~10 Hz).
- Un corte del Switcher reinicia la mirada del estudiante; en las mezclas se conserva.
- Con el Taller abierto la historia no mueve la cámara. `view:'free'` conserva la vista del autor al dirigir. El Taller facial «En la historia» fija la cámara en el personaje elegido (plano Rostro o Cuerpo entero) y la mueve con `WORKSHOP_VIEW`.
- Mensajes nuevos: `VIEW`, `PILOT` → `PILOT_VIEW`, `CAMERA_PATHS`, `CAMERA_AUDIT` → `CAMERA_AUDITED`; `PICKED` en modo objeto incluye `position`. `LexicoMontaje.js` ofrece `centros(entryIds)` para saber dónde están los objetos de una puerta.

## Director automático (fase 3)

Plano general → quien habla (primer plano con la cara visible, al lado correcto del eje de 180°, fijado al empezar
cada intercambio) → quien responde → plano conjunto al cerrar. Cortes J (`jlOffset`, 0,3 s), ritmo por escena
(**tranquilo** por defecto: planos de 2,5 s o más; normal 2 s; dinámico 1,5 s) y tope de cortes por minuto.
Las puertas «toca un objeto» terminan en plano general. Si una frase nombra un objeto al que ya mira una cámara,
propone un plano detalle.

Antes de aplicar enseña «se crearán · se reemplazarán · se conservan editadas». Lo generado lleva huella: lo editado
a mano se conserva, lo borrado a propósito no vuelve (`autoDirection.suppressed`), y todo es un paso de deshacer.
`autoStageDialogue` usa el mismo mecanismo (decisión del 17/11): conserva las actuaciones automáticas editadas.

## Estudiante (fase 4)

- «Reducir movimiento» en el reproductor: activado por defecto solo si el sistema lo pide; la elección se recuerda. Mezclas de más de 0,5 s pasan a corte y los seguimientos se suavizan más.
- Sin encuadre adaptativo en tiempo de ejecución (decisión del 17/11): las cámaras ya están fijadas en la historia y la app es horizontal; así no se añade CPU. El mini visor de la cámara activa, la cámara de vuelo (WASD) y la profundidad de campo quedan fuera: «Pilotar» cubre la navegación y la profundidad de campo exige revisar `StyleShader`/`StyleGBuffer`.

## Pruebas de mano

- `Estudio/Historias/mini-camaras-switcher` (y `mini-camaras-prueba`, solo cues antiguos): `node scripts/story-studio/crear-mini-historia.ts [--force]`.
- Rendimiento: `node scripts/story-studio/bench-director.ts`.
