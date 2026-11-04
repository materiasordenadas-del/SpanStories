# SpanStories Story Studio
## Plan de producto — Editor narrativo y cinematográfico para historias interactivas en 3D

**Versión:** 1.0 — 25 de octubre de 2026  
**Naturaleza del documento:** definición de objetivos y de experiencia. No es un tutorial técnico, una lista de tareas de programación ni una auditoría.  
**Responsable de implementación:** Codex, aprovechando el proyecto SpanStories existente.

---

## 1. La visión

Convertir el visor 3D que ya tenemos —incluido el escenario de Barcelona— en **SpanStories Story Studio**: un entorno visual desde el que podamos **crear, dirigir, editar, probar y publicar historias interactivas de español**, con una experiencia cercana a dirigir una escena de una película y construir un nivel narrativo de un videojuego.

El objetivo no es crear un nuevo motor 3D ni otra plataforma educativa. Es dar **capacidad narrativa real al mundo y a los personajes ya construidos**.

Quiero poder situar personajes en una ciudad, aula o aeropuerto; escribir una historia; decidir quién habla, cómo actúa, qué hace la cámara y cuándo participa el estudiante; y ver inmediatamente el resultado en el propio escenario. La programación debe quedar detrás de una interfaz clara. La dirección de la historia debe hacerse **visualmente**.

La experiencia final debe tener dos caras inseparables:

- **Para el creador:** un estudio intuitivo para convertir un texto o Story existente en una experiencia 3D dirigida.
- **Para el estudiante:** una historia fluida y atractiva que se mira, escucha y lee, con intervenciones educativas integradas sin perder el hilo narrativo.

**Principio rector:** el contenido lingüístico es el centro; el mundo 3D, la cámara y las animaciones hacen que cobre vida.

---

## 2. Qué queremos conseguir, expresado como capacidades

Al terminar de construir Story Studio, debemos ser capaces de:

1. **Elegir una historia existente de SpanStories** y trabajar sobre ella sin duplicar su contenido ni perder sus referencias curriculares.
2. **Elegir escenarios** del mundo 3D disponible, reutilizarlos para distintas historias y situar la acción en zonas precisas.
3. **Seleccionar y colocar personajes** reutilizables, asignarles papeles narrativos y controlar su presencia a lo largo de la historia.
4. **Organizar visualmente el relato** en escenas, secuencias y acontecimientos comprensibles, sin necesidad de escribir lógica de programación.
5. **Escribir y asociar diálogos y narración** a los personajes y a momentos concretos.
6. **Dirigir la cámara** con planos generales, primeros planos, cambios de enfoque y movimientos cinematográficos.
7. **Dirigir la actuación de los personajes** mediante movimientos, miradas, gestos, expresiones faciales y acciones corporales reutilizables.
8. **Coordinar diálogo, imagen, audio, animación e interacción** sin que unos elementos se adelanten o bloqueen a otros.
9. **Permitir que el estudiante participe**, por ejemplo al pulsar «Continuar», tocar un objeto, elegir una respuesta o completar una actividad lingüística.
10. **Reproducir la historia de principio a fin** desde el estudio y después en el modo estudiante, conservando la misma puesta en escena.
11. **Guardar, recuperar, modificar y versionar** el trabajo de autoría, con separación clara entre lo que está en edición y lo publicado.
12. **Aprovechar bibliotecas abiertas existentes** para que Codex no tenga que construir desde cero editores de nodos, de texto o de línea de tiempo.

Estas son las metas del proyecto. La elección de estructuras internas y herramientas concretas corresponde a Codex, con el requisito de respetar la plataforma actual.

---

## 3. Cómo debe sentirse el estudio de creación

Al entrar en Story Studio quiero ver **el escenario real** y trabajar directamente sobre él.

La interfaz debe ser ordenada, amable y progresiva: útil para alguien que está creando una historia, no pensada únicamente para programadores o animadores profesionales.

### El espacio de trabajo ideal

**Vista 3D principal:** el lugar donde veo la ciudad, los personajes y la acción. Debo poder seleccionar un personaje u objeto y ajustar lo que necesito sin perder de vista la escena.

**Panel de historia:** muestra la historia, las escenas y las secuencias en su orden. Debe ser fácil saber qué está ocurriendo, dónde estamos dentro del relato y qué sucederá después.

**Editor de diálogo y narración:** lugar cómodo para leer y editar intervenciones, asociarlas con los personajes y reconocer qué fragmentos ya pertenecen a una Story de SpanStories.

**Panel de propiedades:** controles sencillos para seleccionar escenarios, personajes, expresiones, acciones, planos de cámara, tiempos y comportamientos. Sin exponer parámetros irrelevantes para el autor.

**Línea de tiempo:** coordinación visual entre cámaras, animaciones, voces, expresiones, sonidos y momentos de diálogo.

**Mapa de flujo narrativo:** representación visual de qué acontecimiento conduce al siguiente, incluyendo esperas y decisiones puntuales del estudiante.

**Vista previa:** reproducción inmediata de la historia como la verá el alumno, sin publicar ni salir a otra aplicación.

No es obligatorio que todos esos paneles aparezcan simultáneamente. Deben poder abrirse según la tarea y dejar protagonismo al escenario.

### Dos niveles de edición, un mismo proyecto

**Modo sencillo:** la experiencia predeterminada. Elegir una escena, un personaje, un diálogo, una acción y una cámara debe ser directo; el sistema puede proponer una puesta en escena inicial modificable.

**Modo avanzado:** acceso al flujo narrativo, la línea de tiempo y la dirección detallada. Sirve para ajustar planos, sincronizaciones y acciones complejas cuando lo necesite.

Los dos modos deben trabajar sobre **una misma historia**, sin tener que rehacer nada al pasar de uno al otro.

---

## 4. La organización de las historias

El modelo conceptual que quiero utilizar es:

**Historia → Escena → Secuencia → Acción o acontecimiento.**

- **Historia:** el relato completo, con su identidad y su vínculo con el currículo de SpanStories.
- **Escena:** una unidad que sucede en un contexto reconocible: una calle, una habitación, una clase, un aeropuerto. Puede cambiar de lugar o de personajes.
- **Secuencia:** un momento de la escena con intención concreta: una conversación, una presentación, una pregunta, un desplazamiento, una reacción.
- **Acción o acontecimiento:** lo que ocurre dentro de una secuencia: hablar, caminar, mirar, gesticular, enfocar, reproducir audio, mostrar un texto o esperar una intervención.

No quiero una estructura que obligue a crear una nueva escena para cada frase. Debe permitir combinar muchas acciones dentro de una secuencia y repetir recursos compartidos.

### Linealidad como base

Las historias de SpanStories serán **principalmente lineales**. Su recorrido principal tiene orden y continuidad.

Pueden existir elecciones breves, respuestas alternativas, reintentos y pequeñas variaciones de reacción, pero **no necesitamos convertir cada Story en un árbol narrativo complejo**.

El flujo visual debe ayudar a comprender la historia, no complicarla.

---

## 5. Dirección de cámaras y lenguaje cinematográfico

Quiero poder dirigir una historia de forma visual, seleccionando y previsualizando los planos en el entorno 3D existente.

El sistema debe permitir:

- Establecer la posición y orientación de una cámara para una escena o una intervención.
- Guardar planos reutilizables asociados a personajes, lugares u objetos.
- Alternar entre plano general, plano medio, primer plano, contraplano y planos de detalle.
- Mover suavemente la cámara o realizar cortes cuando convenga al relato.
- Seguir a un personaje que camina, enfocar a quien habla y mostrar la reacción de quien escucha.
- Ajustar encuadre y ritmo de los cambios sin programar cada movimiento.
- Mantener legibles los diálogos y la interfaz educativa durante toda la escena.

**Resultado deseado:** una conversación entre Samuel y otro personaje debe sentirse dirigida, no como dos muñecos inmóviles observados por una cámara fija.

---

## 6. Personajes: actuación, no solo desplazamiento

Los personajes de SpanStories son activos narrativos que se reutilizarán entre múltiples historias. Deben conservar su identidad visual y aprovechar sus modelos 3D y animaciones disponibles.

Desde el editor quiero poder indicar, por ejemplo:

- Samuel está de pie, entra en una zona y se acerca a un interlocutor.
- Se detiene y mira al personaje que le habla.
- Responde mientras utiliza una expresión facial apropiada.
- Hace un gesto breve, mira hacia un objeto o se gira.
- Otro personaje reacciona, se mueve o abandona la escena.

### Actuaciones reutilizables

Quiero un repertorio de acciones comprensibles para el creador: **esperar, caminar, girarse, mirar a alguien, hablar, escuchar, señalar, saludar, asentir, negar, sorprenderse**, etc.

Las expresiones faciales y corporales deben poder combinarse cuando tenga sentido. Si un personaje habla preocupado, no debería perder de forma arbitraria su expresión al iniciar otra animación.

Es importante que la herramienta aproveche el trabajo de personajes, rig y expresiones que ya estamos desarrollando en Blender y que puede llegar a Three.js mediante los modelos y animaciones correspondientes. No quiero recrear esas animaciones individualmente para cada historia.

**Meta:** dirigir actuaciones mediante decisiones editoriales sencillas y obtener resultados naturales, coherentes y repetibles.

---

## 7. Diálogos, narración, voz y sonido

Los diálogos son el eje del aprendizaje; necesitan una experiencia de autoría especialmente cómoda.

Quiero seleccionar una intervención y decidir:

- **Quién habla:** narrador, Samuel u otro personaje.
- **Qué se dice:** texto curricular correspondiente a la historia.
- **Cómo se interpreta:** emoción, expresión y actuación durante esa intervención.
- **Qué ve el estudiante:** personaje, plano y texto en pantalla.
- **Qué se escucha:** voz o audio disponible, y sonido ambiental cuando proceda.
- **Cuándo continúa:** automáticamente tras concluir una acción, o cuando el estudiante intervenga.

Los textos y voces deben quedar sincronizados con la escena. Quiero poder pausar, reproducir una línea concreta y revisarla en contexto.

Si existen varias tomas de voz aprobadas o pistas de audio de un personaje, Story Studio debería poder aprovecharlas sin obligar a generar audio nuevo en cada reproducción del estudiante.

La música y los ambientes pueden enriquecer cada escena, pero deben acompañar el aprendizaje y no competir con la claridad de las voces.

---

## 8. Interacciones del estudiante

La experiencia no será exclusivamente una película. Debe permitir que el estudiante **participe sin romper el relato**.

Ejemplos de interacciones que quiero poder incorporar:

- **Continuar:** el estudiante decide cuándo avanzar al siguiente momento.
- **Elegir:** selecciona una respuesta entre opciones disponibles.
- **Responder:** escribe o completa una intervención breve cuando la actividad lo requiera.
- **Observar y tocar:** identifica un objeto o elemento relevante en el escenario.
- **Escuchar otra vez:** vuelve a reproducir una intervención.
- **Consultar una palabra:** abre su información léxica y puede guardarla.
- **Practicar:** aparece una pequeña actividad relacionada con lo que acaba de suceder.

Una interacción puede detener el avance del relato hasta que se resuelva. **No todo se define por segundos:** una animación puede tener duración fija, mientras que una pregunta puede esperar al estudiante el tiempo necesario.

El objetivo es que la participación se sienta integrada y que el alumno entienda siempre qué debe hacer, sin convertir cada diálogo en una interrupción permanente.

---

## 9. Integración educativa con SpanStories

Este punto distingue nuestro producto de un editor cinematográfico genérico.

**El Story Engine existente sigue siendo la autoridad del contenido educativo.** Story Studio dirige su presentación; no inventa un currículo paralelo ni crea copias desconectadas de las historias.

La experiencia 3D debe respetar:

- Las Stories y sus versiones existentes, y la identidad estable del contenido.
- Las frases y ocurrencias léxicas seleccionables de cada historia.
- Las relaciones entre palabras, Lexeme/Sense y diccionario.
- La opción de guardar palabras y consultarlas sin abandonar el contexto narrativo.
- Las actividades y el progreso del estudiante cuando correspondan.
- Las restricciones y objetivos de vocabulario y gramática del currículo A1.

Por ejemplo, cuando Samuel dice una frase, el estudiante puede escucharla, leerla y seleccionar una palabra con su comportamiento léxico habitual. La puesta en escena 3D no debe perder esa capacidad ni reemplazarla por un texto plano sin identidad lingüística.

**Regla editorial:** la historia publicada mantiene su identidad y coherencia curricular; las instrucciones escénicas son una capa de dirección asociada a ella.

---

## 10. Los escenarios y el mundo existente

Barcelona es nuestro punto de partida porque **ya existe un visor con editor y capacidades de carga, navegación y optimización**.

Story Studio debe aprovechar los escenarios, zonas, objetos y personajes disponibles, sin forzar una reconstrucción del proyecto.

Quiero poder:

- Seleccionar una ubicación del mundo ya disponible.
- Colocar personajes y objetos útiles para la acción.
- Recuperar posiciones y encuadres para otras historias.
- Cambiar de localización entre escenas de una misma Story.
- Reutilizar espacios comunes —por ejemplo, un aula, una calle o un mostrador— con historias diferentes.
- Mantener presente la zona necesaria mientras transcurre una escena, aunque exista carga dinámica por sectores.
- Conservar una experiencia fluida en el navegador y en dispositivos modestos.

La mejora narrativa debe coexistir con los sistemas de optimización ya desarrollados para escenarios grandes.

**No se trata de convertir cada historia en un archivo 3D autónomo.** Los escenarios, personajes y recursos compartidos deben poder servir para muchas historias.

---

## 11. Director narrativo: el resultado que esperamos

La pieza central de la experiencia será un **Director Narrativo** que coordine lo que ocurre durante la reproducción.

Para el creador debe sentirse como pulsar **Reproducir** y comprobar que todas las decisiones editoriales se convierten en una escena fluida.

Para el estudiante debe actuar de forma invisible: conserva el orden de los acontecimientos, sabe quién habla, cuándo mover la cámara, cuándo reproducir una animación y cuándo detener la historia para permitir una respuesta.

Quiero que coordine como una sola experiencia:

**escenario + personajes + cámara + movimientos + expresiones + diálogos + voz + sonidos + interacciones + continuidad educativa**.

Si el estudiante vuelve atrás, repite una frase o reanuda una historia, el estado narrativo debe seguir siendo comprensible y consistente.

Este Director no sustituye al Story Engine: **orquesta la experiencia escénica de una Story ya identificada**.

---

## 12. Dos experiencias sobre el mismo contenido

### A. Desarrollo / autoría

La persona que crea la historia puede editar el mundo y sus elementos, trabajar con la cámara, escribir y vincular diálogos, elegir animaciones, ajustar la línea de tiempo, guardar borradores y previsualizar el resultado.

La aplicación debe conservar las posibilidades del editor de Barcelona que ya funcionan; agregar narrativa **no significa retirar las herramientas de construcción del escenario**.

### B. Estudiante / reproducción

El estudiante ve una presentación limpia, guiada por la historia. No aparecen los controles de edición, la línea de tiempo o los paneles de desarrollo.

El estudiante puede leer, escuchar, avanzar, responder e interactuar con lo autorizado por la escena. No necesita desplazarse libremente por Barcelona para completar una historia lineal.

La **navegación libre o exploración guiada** queda como capacidad futura: debe poder convivir con el mismo mundo, pero no ser requisito de la primera experiencia narrativa.

---

## 13. Guardar, editar, reutilizar y publicar

Una historia no debe perderse cuando cierro el navegador o cambio de sesión.

Quiero conservar borradores editables, poder volver sobre una escena, reutilizar actuaciones y encuadres, y distinguir claramente **lo que todavía estoy creando** de **lo que ya ve un estudiante**.

Las escenas y recursos comunes deben poder reutilizarse sin copiar innecesariamente escenarios, personajes o audios.

Una Story publicada debe reproducirse de forma estable y corresponder con su versión de texto y puesta en escena. Los cambios posteriores de autoría no deben alterar silenciosamente la experiencia que ya estaba publicada.

---

## 14. Qué vamos a aprovechar de herramientas existentes

El objetivo es construir **SpanStories Story Studio sobre lo que ya poseemos**, utilizando herramientas abiertas como componentes especializados, no reemplazando toda la plataforma por una aplicación ajena.

| Necesidad del producto | Candidato que Codex puede adaptar | Qué debe aportar |
|---|---|---|
| Mapa de escenas, acontecimientos y esperas | **React Flow** (`xyflow/xyflow`) | Organizar visualmente el flujo de la historia. |
| Escritura y edición de diálogos | **Tiptap** (`ueberdosis/tiptap`) | Edición clara de intervenciones y narración. |
| Línea de tiempo y pistas | **React Timeline Editor** (`xzdarcy/react-timeline-editor`) | Ordenar y sincronizar elementos de una escena. |
| Edición cinematográfica detallada | **Theatre.js** (`theatre-js/theatre`) | Cámaras y propiedades animables; candidato a evaluar como complemento o alternativa al editor temporal. |
| Controles de propiedades | **Leva** (`pmndrs/leva`) | Controles sencillos cuando mejoren los ya existentes. |
| Referencia de narrativa interactiva | **Ink + inkjs** (`inkle/ink`, `y-lohse/inkjs`) | Ideas sobre decisiones, condiciones y estados; integración opcional. |
| Escenarios, modelos y reproducción 3D | **Visor SpanStories actual / Three.js** | Conservar el mundo, la navegación, las optimizaciones y el editor existente. |
| Contenido curricular, vocabulario y versiones | **Story Engine de SpanStories** | Conservar la autoridad educativa y las identidades de contenido. |

**No hay una obligación de integrar todas las bibliotecas.** Codex puede elegir las que de verdad simplifiquen el resultado y evitar piezas redundantes. Lo importante es alcanzar la experiencia descrita, respetando los sistemas que ya funcionan.

Las licencias acompañan a sus repositorios originales. Se incluyen referencias de código abierto para evaluación y adaptación; la elección final debe respetar las condiciones de distribución correspondientes.

---

## 15. Primera experiencia completa que queremos obtener

No quiero empezar por un conjunto de paneles vacíos ni por una auditoría general del repositorio.

El primer resultado significativo debe ser **una historia breve y completa, creada y reproducida desde Story Studio, utilizando un escenario real del visor existente**.

Por ejemplo, una escena con Samuel en un lugar de Barcelona y otro personaje disponible:

1. Se presenta visualmente el lugar y los personajes.
2. La cámara establece la situación.
3. Un personaje inicia una conversación.
4. Samuel escucha, reacciona y responde.
5. La cámara cambia para acompañar la conversación.
6. El estudiante escucha y lee el diálogo.
7. Aparece una interacción breve o una pausa para continuar.
8. La historia retoma su ritmo y llega a un cierre claro.

El creador debería poder **abrir esa historia, comprender su estructura, modificar una frase o actuación, ajustar un plano y volver a reproducirla** sin tener que reprogramarla.

No estamos obligados a utilizar personajes o escenas que todavía no existan en el catálogo. El ejemplo debe apoyarse en recursos disponibles y permitir su sustitución posterior.

Este resultado concentra la intención del proyecto: demostrar una experiencia narrativa completa desde la perspectiva del creador y del estudiante.

---

## 16. Cualidades que no quiero sacrificar

**Simplicidad.** Las operaciones frecuentes deben ser visuales y comprensibles. La potencia avanzada no puede volver engorroso el trabajo cotidiano.

**Coherencia narrativa.** Los movimientos y cambios de cámara deben acompañar lo que se dice, no distraer ni producir escenas artificiales.

**Identidad curricular.** Las historias, el vocabulario y el progreso siguen perteneciendo a SpanStories.

**Continuidad del proyecto.** Conservamos el visor de Barcelona, el editor de objetos, la infraestructura del mundo y los modelos y animaciones que ya tenemos.

**Reutilización.** Escenarios, personajes, cámaras, gestos, voces y actuaciones se aprovechan en múltiples historias.

**Rendimiento.** La incorporación del editor narrativo y la reproducción escénica no debe inutilizar las optimizaciones del mundo ni exigir hardware potente al estudiante.

**Independencia.** La reproducción de una historia publicada no debe depender de servicios de IA de pago ni de mantener activo un editor de desarrollo.

**Extensibilidad.** Debe ser posible añadir en el futuro actividades nuevas, otras ciudades, escenas más ambiciosas y exploración limitada sin rehacer el sistema narrativo.

---

## 17. Lo que NO buscamos en este encargo

- No crear otra plataforma educativa desde cero.
- No sustituir Three.js ni descartar el visor y el editor de Barcelona actuales.
- No duplicar el Story Engine, sus Stories publicadas o las identidades léxicas.
- No transformar todas las historias en aventuras ramificadas complejas.
- No construir un simulador de ciudad abierta con inteligencia artificial para todos los NPC.
- No exigir herramientas profesionales complicadas para editar una conversación sencilla.
- No convertir este documento en instrucciones técnicas paso a paso.
- **No establecer una auditoría o revisión general del código como primera entrega.**

La prioridad es clara: **poder contar y dirigir historias 3D interactivas con nuestras herramientas existentes, desde una interfaz visual, y que el estudiante pueda vivirlas y aprender con ellas**.

---

## 18. Definición del resultado final

Consideraré que Story Studio cumple su propósito cuando pueda sentarme ante una historia de SpanStories y, sin programar, responder visualmente a estas preguntas:

**¿Dónde sucede? ¿Quién aparece? ¿Qué dice cada personaje? ¿Qué hace mientras habla? ¿Qué ve y escucha el estudiante? ¿Cuándo avanza la historia? ¿Qué interacción ocurre? ¿Cómo termina?**

Y cuando al pulsar **Reproducir** la escena 3D represente esas decisiones de forma convincente, mientras el estudiante conserva las herramientas de lectura, escucha y aprendizaje propias de SpanStories.

**Ese es el producto que queremos construir.**
