# Estado de Story Studio · 26 de octubre de 2026

## Objetivo y límites

El objetivo sigue siendo el plan completo `PLAN_SPANSTORIES_STORY_STUDIO.md`, dentro de `D:\Español\SpanStories Studio\spanstories_story_studio_v2.zip`. Este documento registra avances; no sustituye el plan ni declara su cierre. El gestor de objetivos de este chat devolvió `usageLimited`; no se marcó el objetivo como completado.

Fuente vigente: `D:\Español\SpanStories-worktrees\visor-mundo-20261021`. Entrada única: `http://localhost:3000/mundo/piloto-lexico`. Studio es el modo `?modo=historia` del mismo visor. Arranque: `npm run dev:visor`; motor compartido interno en 8877.

Las correcciones del usuario prevalecen sobre los dibujos de referencia: historia interactiva de progresión dirigida, con nodos y esperas por eventos. El alumno puede mirar y tocar; los caminos los define el autor. La línea de tiempo sincroniza un momento, sin convertir la experiencia en un vídeo.

## Cobertura del plan

| Apartado | Implementado | Pendiente real |
| --- | --- | --- |
| 1–4 · Visión, espacio y organización | Modos integrados, jerarquía Historia/Escena/Secuencia/Acción, flujo general y acciones del momento sobre el mismo proyecto | Pulido de edición sencilla/avanzada y revisión visual del usuario |
| 5 · Cámara | Captura, encuadres según tamaño real del actor, transiciones y sincronización local | Biblioteca completa de recursos cinematográficos y recorridos de cámara |
| 6 · Actuación | Samuel real, posición, giro, mirar a otro actor, caminar, hablar, clips y expresión existentes; biblioteca original derivada sin sobrescribir el personaje | Más personajes, gestos, presets faciales y actuaciones reutilizables completas; saludar/asentir se deshabilitan si faltan clips |
| 7 · Diálogo y sonido | Referencias canónicas de frase, edición a una nueva versión DRAFT, importación y biblioteca de audio en IndexedDB, duración real y sincronización | Tomas de voz reales para la historia completa, controles editoriales más completos y alojamiento remoto del audio |
| 8 · Interacciones | Continuar, elección entre caminos definidos, respuesta escrita y tocar objeto; esperas indefinidas; botón para continuar tras observar | Prueba visual completa de tocar un objeto y llegar al cierre, más allá de las pruebas de dominio y del puente |
| 9 · Educación | Story Engine como autoridad, IDs estables, lector/diccionario existentes, guardado léxico y progreso existente; ensayos sin escribir progreso real | Auditoría editorial de nuevas versiones y cobertura educativa de la experiencia completa |
| 10 · Mundo existente | Mismo escenario y motor, carga por sectores, modelos y selección léxica existentes | Selector operativo de múltiples zonas, recorridos de actores con validación de obstáculos |
| 11 · Director | Reproducción determinista, pausas, búsqueda de autor, caminos visitados, retorno, repetición y recuperación | Pruebas de una historia completa con todos los recursos y mediciones de rendimiento |
| 12 · Autor y alumno | Autoría local; reproductor de publicación sin controles de autor, navegación dirigida y lectura léxica | Validación integral con usuarios y dispositivos |
| 13 · Guardar y publicar | Borradores por propietario, conflictos entre pestañas, versiones canónicas en IndexedDB, instantáneas publicadas inmutables, punto de lectura por alumno/publicación | Persistencia de servidor, sincronización entre dispositivos y publicación externa |
| 14 · Herramientas | React Flow y React Timeline de las versiones contrastadas con los ZIP descargados; no se volvieron a descargar los repositorios | Integrar otras herramientas solo si cubren una necesidad sin duplicar el motor |
| 15 · Primera experiencia completa | Ensayo de cinco momentos editable en Barcelona con Samuel, cámaras, diálogo y puerta de objeto; Story curricular real disponible para publicación local | Voz real y recorrido completo comprobado de inicio a cierre con interacción de objeto |
| 16–18 · Calidad y resultado final | Comprobaciones técnicas y pruebas locales de recuperación/publicación; editor y visor anteriores conservados | Aprobación visual, cierre de los pendientes anteriores y validación de producción externa |

## Evidencia obtenida

- 121 pruebas pasaron en Story Studio, Story Engine y mundo léxico tras corregir la reconstrucción por caminos. Después se añadió y pasó una prueba específica de salida y reentrada a una escena; la suite específica de recuperación suma cinco pruebas aprobadas.
- Las 22 pruebas del motor de ciudades pasaron, incluidas seguridad del puente y mirada sin traslación.
- TypeScript y ESLint dirigido pasaron. `npm run build:studio-check` terminó correctamente con 19 páginas estáticas y la ruta dinámica del visor. La salida generada queda en `.next-studio-check`, con configuración TypeScript propia; no se publica ni sirve otro visor.
- En navegador real: Samuel y Barcelona cargan, el borrador v2 y su revisión se recuperan, un nodo cambia de posición y Deshacer lo restaura, la espera no avanza sola y el modo de alumno de una publicación no expone herramientas de autor.
- La publicación local de la Story curricular «Primer día de clases en Bogotá» recupera «Momento 2 de 18», «Soy de Argentina» y el botón Retomar tras recargar.
- La importación de audio se comprobó con un WAV técnico de un segundo de silencio. Esto no demuestra una voz final grabada ni una escucha validada de la historia completa.
- Se alcanzó la puerta «Toca un árbol para continuar» en el visor real. La automatización rechazó el clic dentro del iframe por coordenadas fraccionarias; no se simularon eventos para convertir esa limitación en un resultado positivo.

## Correcciones más recientes

El director reconstruye cámara, personajes, expresión y texto únicamente desde los momentos recorridos. Una rama omitida ya no deja movimientos o encuadres en la rama elegida. Retorno y recuperación reproducen ese mismo estado; reentrar a otra escena vuelve a su puesta inicial. La búsqueda del autor mantiene la previsualización de las acciones previas del orden editado.

El arranque de Next encontró «Failed to open database / Acceso denegado» en la caché persistente de Turbopack. El lanzador único desactiva esa caché de disco para su proceso de desarrollo, conservando la caché en memoria, los puertos y los datos del usuario. El visor volvió a responder HTTP 200 y a cargar visualmente. No se borró la caché bloqueada ni se cerraron procesos ajenos.

La compilación deja una advertencia NFT por el trazado amplio de archivos de una importación existente del lector. Sigue pendiente revisar ese empaquetado antes de un despliegue externo. La publicación comprobada es local a este navegador; un enlace por sí solo no distribuye sus datos a otro dispositivo.

## Próxima etapa

Cerrar la primera historia de ensayo con una interacción real de objeto, actuación y voz disponible, verificando inicio, espera, respuesta y cierre. Después completar recursos reutilizables, múltiples escenarios y persistencia/publicación de servidor. Los cambios de texto permanecen DRAFT hasta que el Story Engine permita publicarlos.
