# Cámaras del Estudio · Fase 0 (17/11/2026)

Resultado de la fase 0 del «Plan v2 — Sistema de cámaras cinematográficas del Estudio»: comprobación de las
suposiciones marcadas **[verificar]**, líneas base y refactor sin cambio de comportamiento.

## 1. Suposiciones verificadas

| Suposición del plan | Resultado | Dónde |
|---|---|---|
| `Shot`, cue `camera`, «mezclar desde la pose viva», cámara antes que actores, `validateProject` todo o nada | Confirmado | `model.ts`, `director.ts` |
| «Los cues se ordenan solo por `at`, sin desempate» | **Matiz:** `Array.sort` es estable, así que los empates ya se resuelven por orden de lista y son deterministas. Desempatar por `(at, id)` **cambia historias existentes** (lo detectan las instantáneas, incluso en la minihistoria normal: cambia el orden de `performances` en un diálogo con actuación automática). **Decisión de Adriel:** se mantiene el orden de lista para todos los cues, nuevos y antiguos. Ahora es explícito (`byStart` en `director.ts`) y `checks.ts` avisa de dos cambios de cámara simultáneos. | `director.ts`, `checks.ts` |
| `changeSceneZone` y `scene.shot` | No toca `scene.shot`. Existe además `moveSceneToZone`, que desplaza el plano de la escena, los cues `camera`, destinos y caminos por un `delta`: es la operación que deben extender las cámaras con nombre. | `editing.ts` |
| Operaciones que tratan cámaras de forma implícita | Además de las listadas, `addScene(…, 'copy')` duplica escenas por otra vía (`cloneSequence`), y `deleteCue` borra los cues `auto:<id>:` de un diálogo. Ambas entran en la tabla 4.6. | `editing.ts` |
| Frecuencia de los mensajes de puesta en escena (5.1) | El editor (`StoryStudio.tsx`, `setInterval` de 100 ms) y el reproductor publicado (`PublishedStudioPlayer.tsx`, 100 ms) avanzan el director a **10 Hz**, y cada avance envía un `STAGE`. El motor renderiza a 60 Hz. Con cámaras en movimiento los tirones son seguros, no un riesgo: la fase 2 debe interpolar en el puente o muestrear dentro del motor. | |
| El taller tiene prioridad (5.4) | **No implementado:** el puente no consulta `workshop` al recibir `STAGE` y React tampoco deja de enviarlo. Hoy no se nota porque con el director en pausa el plano no cambia; con cámaras que siguen a alguien sí se notaría. | `StoryStudioBridge.js` l. 297 |
| Posición de un objeto léxico (`aim: point` con `entryId`) | `PICK` en modo `entry` devuelve `entryId` y `label`, **no la posición**. Hará falta ampliar la respuesta (`PICKED`) con el centro del objeto. | `StoryStudioBridge.js`, `LexicoInteraccion.js` |
| `CityCollisionIndex` para «la mezcla atraviesa una pared» | Solo tiene `query(posición, radio)` (fase amplia sobre cajas AABB). No hay prueba de segmento ni rayo: habrá que muestrear el recorrido y probar las cajas. | `CityCollisionIndex.js` |
| Relación frase → entrada léxica (plano detalle léxico) | Existe: `LexicalOccurrence {sentenceId, lexemeId}` en el Story Engine y `lexemeId` en `world-lexicon/domain/scene-map.ts`. La regla de la fase 3 es viable. | |
| Comprobación de tipos con `tsconfig.studio-check.json` | Ese tsconfig lo usa `npm run build:studio-check` (un `next build`). Para cada fase basta `npx tsc --noEmit` (sin errores hoy) y `npm test`. | |
| Persistencia de campos nuevos | `portable.ts`, `publication.ts` e `historia.ts` clonan el proyecto entero y `validateProject` no rechaza campos desconocidos: `cameras` y `autoDirection` sobrevivirán. Pero un `kind` de cue nuevo sí es rechazado por un Estudio anterior: las historias con cámaras nuevas no abrirán en un build viejo. Los campos nuevos necesitan validación explícita. | |
| Pantallas del estudiante (móvil vertical) | No hay ninguna adaptación a orientación o relación de aspecto en el reproductor. Sigue abierta la decisión 8.1. | |

Inventario de `kind==='camera'` y `.shot`: ~80 referencias. `StoryStudio.tsx` (≈ 45), `StudioTimeline`, `StudioCameraProperties`, `StudioFlow`, `StudioStoryboard`, `StudioSceneInspector`; en TS puro `model.ts`, `director.ts`, `editing.ts`.

## 2. Datos de prueba

- **Minihistoria** `mini-camaras-prueba` (Rachel y Mia en la entrada del aeropuerto, 6 momentos, una elección café/té que se vuelve a juntar). Constructor determinista en `features/story-studio/__tests__/fixtures/mini-historia.ts`; `node scripts/story-studio/crear-mini-historia.ts [--force]` la escribe en `Estudio/Historias/` para abrirla en el Estudio.
- Las historias reales de `Estudio/Historias/` son mínimas (1 escena, sin cues de cámara ni de actor): se copiaron dos a `fixtures/`, pero la protección real viene de la minihistoria y sus variantes.

## 3. Instantáneas de referencia

`__tests__/camera-baseline.test.ts` + `fixtures/camera-baseline.json`. 7 casos (minihistoria, variante con empates, variante con corte en mitad de una mezcla, 2 historias reales, 2 demos), muestreados cada 0,1 s con la ruta del editor y con cada ruta del estudiante. Hash SHA-256 por muestra y snapshot completo en los extremos de cada momento. Se comprueba en tres modos: sin caché, con la caché del director y con la caché en orden inverso.

Comprobado que detecta: desempate por id en cámara, desempate por id en actores, un error de 1e-9 en el fov de una mezcla y un fallo de aliasing en la caché.

Regenerar solo ante un cambio intencionado y revisado: `UPDATE_CAMERA_BASELINE=1 node --test features/story-studio/__tests__/camera-baseline.test.ts`.

## 4. Rendimiento

`node scripts/story-studio/bench-director.ts` (20 actores, 1000 cues, último de 10 momentos):

| | Mediana | p95 |
|---|---|---|
| Antes | 93 ms | 118 ms |
| Caché de curvas (`path.ts`) | 7,2 ms | 12,6 ms |
| + caché de prefijos de ruta (camino del director) | **0,48 ms** | 1,5 ms |

- `routeSamples` reconstruía la curva de cada caminata en cada fotograma (92 % del tiempo). Ahora tiene una caché LRU por contenido (512 curvas); el resultado es idéntico bit a bit.
- `sampleSequence` acepta una `SampleCache` opcional con el estado al final de cada prefijo de ruta. Solo la usa `createStudioDirector`, sobre su copia privada del proyecto. Las llamadas sueltas (p. ej. `StoryStudio.tsx`) siguen sin caché.
- Lo que queda: dos caminatas del mismo actor que se solapan obligan a recalcular la segunda curva en cada fotograma (empieza desde una posición que depende de `t`). Es raro en historias reales.

## 5. Pendiente para la fase 1

- `compileScene` del plan (4.8) se reduce por ahora a la caché de prefijos: la normalización de cues antiguos y los intervalos del Switcher llegan con los datos nuevos.
- Bloquear `STAGE` durante el taller (5.4) y ampliar `PICKED` con la posición del objeto.
