# Interacción léxica integrada en el visor real

Trabajo local en `D:\Español\SpanStories-worktrees\visor-mundo-20261021`. Se conservaron los cambios que ya estaban presentes. No se publicó nada.

## Resultado actual

Por la última instrucción del usuario, el Visor Web local abre en **exploración libre en primera persona**, sin recorrido, textos de historia ni botón Continuar. WASD/flechas permiten caminar, arrastrar permite mirar y un clic/toque corto abre el vocabulario. No crea el editor y Esc no permite activarlo.

Cinco identidades publicadas: árbol, casa, iglesia, calle y puerta. Los selectores usan tipos del registro, colecciones editoriales e IDs estables; no nombres de mallas. El contorno amarillo usa la silueta de la geometría y el alfa de sus materiales, incluida la representación LOD visible de la vegetación. La caja de edición permanece intacta. Tocar una casa no resalta las demás casas de la misma identidad léxica.

El audio se sirve desde cinco WAV locales sintetizados con Microsoft Helena Desktop, es-ES, 22050 Hz. La síntesis española del navegador queda como respaldo. Un error repite el audio sin revelar la respuesta. Un acierto usa los repositorios actuales de SavedWords y Learner Progress; no declara KNOWN. Encontrar un objeto, iniciar su audio, intentar escribir y guardar quedan diferenciados. Los reintentos de comunicación o de guardado no generan nuevos intentos indebidamente.

El modo Desarrollo conserva su editor, transformaciones, importación, guardado/recuperación, primera/tercera persona, estilo y diagnóstico. Incluye preparación local de vínculos y cámaras, exportación del borrador y vista previa. El Story Engine tiene una secuencia técnica opcional (`?historia=1`), DRAFT y sin blueprint curricular; no se ha creado una historia definitiva. El contrato `integracion.json` conserva la asociación por bindings.

La comunicación real es un iframe estático hacia Next.js mediante postMessage, validando origen, ventana y mensajes. El motor de render, GLB, streaming, batching y registro son los mismos de Desarrollo.

## Acceso y arranque

Consolidación del 22/10/2026: se archivaron la antigua carpeta `D:\Español\SpanStories-Ciudades` y las distribuciones generadas `dist-online`/`dist-web`. El traslado conserva todos sus archivos, incluidos los cambios distintos y el manifiesto raw exclusivo de la carpeta antigua; no se sobrescribió la fuente activa. Se verificaron SHA-256 de `index.html`, `main.js` y `Mundo/mundo.json` donde estaban presentes; el registro está en `traslado-verificado.json` dentro del respaldo. Se cerraron el servidor de 8881 y la redirección temporal de 8767. No quedan redirecciones del visor. Se comprobó por HTTP que el iframe funciona, que el motor interno rechaza su apertura como página independiente y que los dos puertos antiguos están cerrados. Las ocho pruebas léxicas del visor pasan tras el traslado.

- Exploración: `http://localhost:3000/mundo/piloto-lexico`.
- Desarrollo: `http://localhost:3000/mundo/piloto-lexico?modo=desarrollo`.
- SavedWords: `http://localhost:3000/progreso/practica`.
- Arranque unificado vigente: `npm run dev:visor` desde la raíz; inicia la aplicación y el motor fuente, reutilizando servicios que ya estén disponibles.
- Los comandos `dev`, `dev:source` y `dev:lexico` de `SpanStories-Ciudades` usan ese mismo arranque. No generan ni sirven una copia `dist-online`.
- El motor interno en 8877 sirve el iframe de la aplicación. No hay redirecciones ni servidores de compatibilidad. Las versiones anteriores se trasladaron a `D:\Español\RESPALDO_NO_CARGAR\versiones-antiguas\visores-anteriores-20261022`.

El origen del visor cambia respecto a 8767: IndexedDB/localStorage del editor de otro origen no se migran automáticamente. Los proyectos exportados se pueden recuperar con Abrir proyecto. SavedWords se guarda en el origen de Next, usando su propietario real (invitado o cuenta).

## Carga y distribución

Se prioriza el sector inicial, sin esperar al resto para habilitar la interacción. Se observó una cola de parser con dependencias pendientes y avance ligado a los fotogramas del iframe. El parser ahora procesa tandas de hasta 2 ms / 8 trabajos mediante tareas visibles del navegador, sin esperar un fotograma por tanda. La preparación restante conserva su presupuesto y dispone de un respaldo de 100 ms que evita ejecutar un trabajo dos veces si llega tarde el callback.

En la recarga posterior a esta corrección, la primera interacción estuvo disponible a los **11,18 s**. Una lectura HTTP local del sector s11 comprimido (17.753.930 bytes) tardó **0,286 s**: el tiempo de preparación no equivale al de descarga. En una vista estable previa, con el contorno activo, se midieron unos 60 FPS y p95 de 16,8 ms. Durante otras comprobaciones, el navegador integrado limitó sus fotogramas en segundo plano; esos datos no acreditan una comparación de rendimiento en primer plano ni una garantía de 60 FPS.

`npm run build:web` genera una distribución **local** en `SpanStories-Ciudades/dist-web`. Se comprobó la ausencia física de CityEditor.js, CityNavigation.js, NarrativaEditor.js y PanelEstilo.js, los cinco audios incluidos y cero imports locales sin resolver. El paquete público fuerza el modo narrativo, excluye la exploración de prueba y no expone `__escena` por el parámetro dev. No se realizó despliegue.

## Archivos modificados o añadidos en esta sesión

- `.gitignore`: exclusión de `dist-web` generado.
- `SpanStories-Ciudades/main.js`, `index.html`, `city.css`, `routes.js`, `package.json`, `scripts/build_online.mjs`: modos, montaje compartido, arranque y paquete educativo.
- `SpanStories-Ciudades/engine/CityNavigation.js`, `CityWorkQueue.js`, `CityDecorations.js`: navegación local acotada, preparación y acceso al LOD para la silueta.
- `SpanStories-Ciudades/engine/LexicoAudio.js`, `LexicoInteraccion.js`, `LexicoMapa.js`, `LexicoMontaje.js`, `LexicoPuertos.js`, `LexicoResaltado.js`: ampliación del circuito parcial existente.
- `SpanStories-Ciudades/engine/NarrativaEditor.js`, `NarrativaVisor.js`: preparación y cámara narrativa opcional.
- `SpanStories-Ciudades/Mundo/Historias/integracion.json`, `Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/vocabulario.json` y `audio/*.wav`: bindings, quinta identidad y audio.
- `app/mundo/piloto-lexico/page.tsx`, `components/world-lexicon/PilotWorldLexicon.tsx`, `WorldLexiconFrame.tsx`, `world-lexicon.module.css`: integración Next y cambio de modos.
- `components/page-editor/PageEditor.tsx`: excluye únicamente esta ruta interactiva del editor de maquetas.
- `components/visual/screens/KnowledgeHub.tsx`, `features/practice/engine/published-target-label.ts`: muestra la forma publicada de palabras guardadas sin ocurrencia en el lector.
- `features/world-lexicon/engine/service.ts`, `bridge/protocol.ts`, `README.md` y sus pruebas: evidencia, habilitación por escena y reintentos.
- `features/story-engine/index.ts`, `engine/narrative-session.ts`, `fixtures/barcelona-piloto.ts` y su prueba: secuencia opcional sobre el dominio existente.
- `features/learner-progress/domain/knowledge.ts`: metadato opcional de exposición OBJECT/AUDIO, sin cambiar los estados de conocimiento.
- `lib/adapters/world-lexicon.ts`, `practice.ts`, `lexical-knowledge.ts`: propietario, persistencia real e idempotencia.
- `SpanStories-Ciudades/tests/lexical-runtime.test.js`, `features/practice/__tests__/published-label.test.ts` y pruebas léxicas/narrativas: verificaciones específicas. La carpeta de tests del visor sigue excluida de Git por la configuración previa; las pruebas existen localmente.

## Verificación

- **112 pruebas de aplicación** correctas: léxico, Story Engine añadido, práctica y proyecciones de conocimiento seleccionadas.
- **8 pruebas del visor** correctas: identidad de instancias/batches, selección semántica, alfa/silueta sin modificar materiales, LOD, cámara narrativa, navegación sin editor y progreso de la cola.
- `npm run typecheck` correcto. ESLint correcto para PilotWorldLexicon, WorldLexiconFrame y el adaptador world-lexicon. `git diff --check` correcto.
- Clic real en calle y árbol, error sin revelar respuesta, acierto y aparición de **calle · Nuevo** en SavedWords, manteniendo **Conocido (0)** en la interfaz.
- Movimiento real con W: de z=0 a z=-3,4387; modo first mantenido después de Esc.
- Desarrollo revisado en ejecución: editor, campos de transformación, deshacer/rehacer, guardar, abrir/exportar, calidad, diagnóstico y preparación narrativa presentes. No se hicieron modificaciones geométricas para probarlos.
- Captura: `SpanStories-Ciudades/reports/lexico-20261021/visor-contorno.jpg`.

## Límites pendientes

No hay historias definitivas, por petición del usuario. El fixture técnico no constituye contenido curricular. Los cinco vínculos se validan contra las identidades publicadas; la revisión editorial y visual exhaustiva de casa/iglesia/calle/puerta queda pendiente. El circuito completo se probó con calle; en árbol se comprobaron el clic y el resaltado.

Las palabras sin traducción o contexto publicado aparecen correctamente en SavedWords, pero no se inventaron ejercicios nuevos ni ocurrencias para ellas. Falta una comparación de rendimiento controlada en primer plano y en dispositivos táctiles; no se ha hecho una prueba física en un teléfono.
