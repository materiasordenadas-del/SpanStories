# Story Studio — flujo de trabajo

Objetivo: `D:\Español\SpanStories Studio\spanstories_story_studio_v2.zip`, documento `PLAN_SPANSTORIES_STORY_STUDIO.md`. Se conserva el objetivo completo, todavía en implementación.

Decisiones del usuario, 25-10-2026: un modo del visor vigente; usar como referencia las dos IU adjuntas; narrativa principalmente lineal, interactiva, sin exportación a vídeo como finalidad. El alumno puede mirar y tocar objetos. Los desplazamientos y las posibles elecciones de camino son predeterminados por el autor.

## Comparación investigada

| Referencia primaria | Patrón útil | Aplicación propuesta |
| --- | --- | --- |
| [articy:draft: Flow view](https://www.articy.com/help/adx/UI_View_Flow.html) | Nodos y conexiones con jerarquía y contenido anidado | Historia → Escena → Secuencia; evitar un mapa plano con cientos de acciones |
| [Yarn Spinner: Understanding](https://www.yarnspinner.dev/docs/unreal/02-understanding-yarn-spinner/) | Runner separa líneas, opciones y comandos; espera al jugador o a comandos que terminan | Director por eventos; una espera educativa no vence al terminar un clip |
| [Yarn: Line providers](https://docs.yarnspinner.dev/3.1/components/dialogue-view/custom-dialogue-views) | Texto y recursos resueltos por identidad de línea | Story Engine conserva frases, versiones y ocurrencias; dirección guarda referencias |
| [Unity Timeline](https://docs.unity3d.com/Packages/com.unity.timeline@1.8/manual/index.html) | Coordinación temporal de animación, cámara y audio | Tiempo local de la secuencia, sin imponer duración global a las preguntas |
| [Ink: Writing with Ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md) | Knots/stitches, elecciones y desvíos explícitos | Caminos autorizados que pueden reconverger; no generar un mundo libre |
| [React Flow: subflows](https://reactflow.dev/learn/layouting/sub-flows) | Agrupación visual y nodos personalizados | Componente de autoría, sin delegarle la autoridad curricular o la reproducción |

La recomendación es una inferencia de diseño para este producto, no una afirmación de que una herramienta sea universalmente la mejor. No se instalarán Unity, articy ni Yarn como motores paralelos.

## Recorrido del creador

1. Elegir una Story y su versión del Story Engine.
2. Elegir lugar y actores en el visor real, colocando por clic y capturando encuadres.
3. Trabajar en el flujo de la escena: momentos con diálogo/actuación y puertas explícitas de avance.
4. Seleccionar un momento para dirigirlo; abrir solo su sincronización local cuando haga falta.
5. Probar desde el momento seleccionado, incluyendo pausas y respuestas como alumno.
6. Guardar el borrador; publicar una instantánea vinculada a una versión curricular publicada.

Cada vista edita el mismo proyecto. La posición de un nodo no modifica por sí sola el orden de reproducción. Conectar salidas sí modifica los caminos. No hay código arbitrario en nodos.

## Recursos locales

Los siete repositorios ZIP originales ya están descargados en `D:\Español\SpanStories Studio\Repositorios_Originales_ZIP`. Se inspeccionaron los manifiestos de React Flow 12.12.0, React Timeline Editor 1.0.0 y Tiptap 3.30.3. Se instalan paquetes de ejecución compilados de React Flow y Timeline de las versiones contrastadas, sin volver a descargar los repositorios originales. El resto permanece como candidato, evitando duplicar motores/editores.

## Estado comprobado

El alcance implementado, la evidencia de pruebas y los pendientes del plan se mantienen en [ESTADO.md](ESTADO.md). La recuperación y la publicación comprobadas son locales al navegador; todavía falta completar y verificar la primera experiencia de principio a fin con voz real e interacción de objetos.
