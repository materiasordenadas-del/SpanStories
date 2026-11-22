# Rendimiento web SpanStories

Guía condicional: lee solo las secciones necesarias. Aplica al código autorizado de ciudades procedurales o importadas; no obliga a refactorizar escenas pequeñas ni partes ajenas. Mantén ESTILO, modularidad, selección y persistencia. No añadas dependencias/sistemas sin una necesidad concreta.

## Diagnóstico y prioridades

Antes de optimizar una escena existente, registra una muestra reproducible: dispositivo/navegador, viewport/DPR, cámara/recorrido, carga inicial, bytes transferidos, frame time (mediana/p95), calls/triangles y recursos de `renderer.info`. El número de texturas/geometrías no mide sus bytes de VRAM; estima memoria con dimensiones, formato, caras/capas y mipmaps, indicando el método. Mide todos los pases, incluidos contornos, sombras y reflejos, evitando dobles conteos. Separa CPU, GPU, red y memoria.

En nuevos proyectos fija en PLAN presupuestos razonados de frame time, descarga inicial, memoria estimada, draw calls y concurrencia para el dispositivo objetivo. Si no se conoce, declara un supuesto ajustable; no inventes un umbral universal ni bloquees un prototipo por falta de benchmark. Centraliza umbrales/configuración, sin duplicarlos en cada builder. Compara antes/después bajo condiciones equivalentes; escala el trabajo al cuello de botella real.

Prioridad predeterminada, no diez sistemas obligatorios:

| Orden | Área | Regla |
| --- | --- | --- |
| 1 | Texturas / VRAM / descarga | Resolución por tamaño en pantalla; KTX2 si compatible; recursos compartidos. |
| 2 | Draw calls / meshes | Instancing de repetidos compatibles; fusiones locales que preserven identidad. |
| 3 | Streaming | Ciudad grande: sectores y carga progresiva; nunca carga completa obligatoria al inicio. |
| 4 | LOD | Menos detalle con distancia/tamaño proyectado; preservar silueta y landmarks. |
| 5 | Geometría | Quitar detalle invisible seguro; módulos reutilizables y compresión de transferencia. |
| 6 | Culling | Frustum y zonas con límites correctos; no ocultar lo potencialmente visible. |
| 7 | Luces / sombras | Conservar Luz25D; pocos casters cercanos y mapas acotados. |
| 8 | Materiales / shaders | Toon/NPR existente, pocos materiales/variantes; controlar pases y overdraw. |
| 9 | Vegetación / NPC | Instancing/LOD compatibles; actividad por cercanía/relevancia. |
| 10 | Runtime | Reutilización, pooling cuando convenga, tareas repartidas y liberación segura. |

La evidencia puede cambiar qué se interviene primero. Mantén calidad visible, legibilidad educativa, proporciones, selección y funcionamiento previo. Una compresión menor o menos calls no prueba por sí sola una mejora de frame time.

## Activos: texturas y GLB

### Texturas
- Reutiliza texturas/materiales inmutables entre módulos y chunks con caché común y ownership explícito. Clona solo lo que se edita individualmente. Una misma URL no garantiza una sola textura GPU si cada carga crea objetos distintos; deduplica también en runtime.
- Elige resolución por importancia y tamaño proyectado con la cámara real, considerando DPR; evita 4K injustificado. Conserva detalle cercano/landmarks, mipmaps y filtrado razonables. Cambiar resolución es offline preferentemente; no reproceses imágenes cada frame.
- KTX2/Basis cuando la cadena lo soporte: configura `KTX2Loader`, detección de capacidades y transcodificadores de la misma revisión antes de cargar. Verifica rutas, workers/WASM, CORS y entrega local/hosting. Usa la opción de calidad adecuada al alfa/normales y comprueba artefactos. Si no hay soporte, prepara un derivado compatible y declara el coste; nunca renombres una textura para fingir conversión.
- JPEG/WebP/PNG reducen descarga pero normalmente se decodifican a texturas sin compresión GPU. KTX2/Basis puede reducir VRAM al transcodificar a un formato GPU disponible; no garantiza el mismo ahorro en todos los equipos.
- Albedo en espacio de color correcto; normales/datos sin conversión de color. Prueba alfa recortada, tintes, UV y normales con Luz25D; no asumas que cualquier shader acepta toda variante comprimida.
- Atlas solo cuando reduzca cambios de material y no fuerce descargar una textura enorme por un sector pequeño. Añade gutters y UV/mipmaps que eviten sangrado; no mezcles mapas con distinta semántica/color space. Compartir atlas entre chunks requiere residencia/refcount común; atlas locales pueden ser mejores si reducen la memoria activa.
- Evita duplicados tanto en archivos como en GPU. Texturas embebidas iguales en varios GLB siguen pudiendo duplicar transferencia; usa assets externos compartidos cuando el pipeline lo permita, o compara el coste con GLB autocontenidos. No descargues un paquete gigante únicamente para extraer un objeto.

### Ruta GLB (uno o varios)
Inspección acotada → derivado no destructivo → preservar nodos/IDs/transforms → texturas y deduplicación → partición espacial e instancing compatibles → LOD offline → compresión final/exportación → prueba en loader real.

- Conserva originales; reutiliza un derivado válido existente. No copies una ciudad completa por rutina ni sobrescribas archivos importantes. Registra origen/hash, opciones relevantes y pendientes para invalidar solo derivados afectados.
- Inspecciona bounds, unidades/pivots, nodos, repetidos, materiales/texturas, animaciones/skins/morphs y extensiones requeridas. Deduplica por contenido/compatibilidad, no solo nombre; no aplanes transformaciones, rigs o jerarquías necesarias para editar.
- Quita caras interiores/ocultas solo si nunca serán necesarias para navegación, cámara, sombras, colisión o edición prevista. Conserva silueta, UV, normales, alfa y seams al simplificar. Colisión/navmesh son representaciones separadas y simplificadas.
- Prefiere simplificación offline. LOD0/1/2 cuando las diferencias sean útiles; no generes tres copias inútiles de un mesh simple ni simplifiques durante gameplay. Impostors/billboards para fondo según ESTILO.
- Meshopt **o** Draco según compatibilidad y coste de descarga/decodificación; no los encadenes para la misma geometría por rutina. Comprimen transferencia, no aseguran menor geometría/VRAM tras decodificar. Aplica compresión tras las operaciones estructurales, con el pipeline compatible disponible.
- La plantilla trae GLTFLoader local, pero no KTX2Loader, DRACOLoader ni MeshoptDecoder configurados. `cargarArticuloCatalogo()` crea un loader por llamada y el adaptador clona geometrías/materiales: es una base para artículos individuales, no caché/streamer masivo. Para una ciudad añade soporte/reutilización acotados, comprobados y compatibles con esa revisión; no cambies Luz25D, cámara ni panel como efecto secundario.
- GLB monolítico no permite streaming espacial real solo ocultando nodos después de cargarlo: divide/exporta archivos o usa un pipeline de carga parcial verificado. Un archivo por sector puede referenciar dependencias comunes. Conserva IDs semánticos en manifiesto/metadatos aunque el exportador reordene nodos.
- Instancing importado, rigs, morphs y animaciones requieren adaptación explícita; no conviertas silenciosamente NPC animados en instancias estáticas ni declares soporte automático del adaptador.

## Mundo: procedural, chunks, LOD y runtime

### Construcción e identidad
Diseña módulos reutilizables + geometría/materiales compartidos + registro semántico + batches por sector/LOD + culling + carga progresiva según escala. Reutiliza factories/layout y medidas centralizadas; no construyas toda la ciudad primero para luego ocultarla.

- Árboles, farolas, ventanas, bancos, autos estáticos, postes y señales repetidos: `InstancedMesh` si geometría, materiales y comportamiento lo permiten. Un objeto compuesto puede necesitar varios batches coordinados por ID. NPC con skin/morph/animación requieren sistema específico; repetición por sí sola no garantiza compatibilidad.
- Mantén IDs independientes del índice de instancia, orden de exportación y estado cargado. El adaptador debe resolver picking `instanceId`, get/set de transformaciones, edición/color/resaltado individual y límites; ocultar/eliminar una instancia no debe afectar otras. Actualiza buffers/bounds solo al cambiar datos. No uses escalas negativas no soportadas para espejar instancias: crea una variante compatible o conserva la raíz independiente.
- Una sola instancia gigante para toda la ciudad perjudica culling/streaming: batches acotados por sector y LOD. LOD de `InstancedMesh` es de batch si no hay sistema por instancia; `THREE.LOD` no resuelve automáticamente el LOD de cada árbol en un batch.
- Fusión estática solo entre geometrías/materiales compatibles dentro de una unidad semántica/sector; grupos de material pueden seguir generando varias calls. Fusionar unidades distintas exige adaptador probado de identidad/picking/edición; de lo contrario conserva raíces. Mantén bounds y ownership, sin mezclar muebles y arquitectura.

### Streaming y LOD
- Ciudad grande: manifiesto ligero con IDs, bounds, URLs, dependencias y LOD; carga inicial del sector actual y vecinos necesarios. El radio depende de visibilidad, velocidad y presupuesto, no de una regla rígida de un vecino.
- Precarga en dirección del recorrido; conserva skyline lejano de bajo coste cuando sea visible. Cambiar visibilidad no descarga memoria; culling y streaming son sistemas diferentes. Reduce alcance visual solo si se conserva la escena aprobada; no modifiques cámara/far plane de un proyecto existente sin autorización.
- Carga asíncrona con concurrencia y memoria acotadas, integración GPU repartida y estados vacío/cargando/listo/error. Deduplica peticiones en curso; cancela cuando sea posible y descarta resultados obsoletos sin fugas. Añade reintentos limitados/placeholders, evita huecos y cargas que reaparezcan tras salir del sector.
- Usa histéresis en carga/descarga y cambios LOD para evitar thrashing y popping; teletransporte o giro rápido deben priorizar el destino. Evita cargar simultáneamente todos los LOD; conserva solo el necesario y el de transición cuando corresponda.
- LOD según distancia **o tamaño proyectado** (especialmente cámara casi ortográfica). `THREE.LOD` o sistema equivalente con umbrales configurables; conserva base, escala, silueta y transformaciones. A distancia extrema usa representación 2D plana coherente con ESTILO; evita crossfades caros si no aportan calidad.
- Conserva estado de mundo, IDs, selección/ediciones y colisión/navmesh necesarios aunque una representación se descargue. El registro actual no ofrece automáticamente identidades descargadas: diseña y prueba la adaptación; no reasignes IDs al recargar ni cambies claves movable.

### Culling, luces y actividad
- Mantén `frustumCulled` donde sea correcto; recalcula bounds al editar instancias/geometrías. Usa volúmenes conservadores para animación y contornos. Prueba bordes del frustum, espejos y casters: algo fuera de cámara puede seguir siendo necesario para sombra/reflejo.
- Culling por zonas/portales solo con visibilidad demostrable: interiores ocultos pueden excluirse, pero calles tras un giro o fachadas que proyectan sombras requieren comprobación. No presupongas oclusión automática por activar frustum culling. Evita comprobaciones caras por objeto cada frame.
- Conserva la iluminación dinámica compartida de Luz25D y sus ambientes. Limita casters y alcance/resolución/frecuencia de shadow maps según relevancia; no borres sombras que definen volumen ni alfa de vegetación cercana. No añadas luces por ventana/farola cuando emisivos/charcos existentes basten.
- **No hornees luz direccional en albedo**: contradice ESTILO y los cambios de ambiente. Se permite detalle/oclusión de contacto y sombras falsas compatibles; luz baked solo ante un requisito explícito y adaptación de estilo aprobada. Ilustraciones lejanas se tiñen según el contrato existente.
- Comparte materiales toon/NPR y limita variantes/pases de contorno. Conserva controles de estilo; mide coste de outlines/reflejos solicitados. Vegetación lejana plana; alfa recortada cuando proceda y overdraw acotado: cientos de billboards superpuestos también cuestan GPU.
- NPC: IA/animación/nav activa cerca o por relevancia visible; lejos, menor frecuencia/simulación resumida sin romper progresión, eventos, colisiones ni determinismo requerido. Instancing solo si compatible. No dependas de un FPS fijo para tiempo/simulación.
- Evita asignaciones/creación/destrucción continuas por frame; reutiliza temporales y usa pooling para elementos recurrentes con reset completo y límite de capacidad. Sistemas no visuales por intervalos; trabajos pesados offline/worker si aporta valor, no por obligación.
- Descarga con gestor de recursos/refcounts: retira render/picking/listeners/animación del chunk; `.dispose()` de geometrías, materiales, texturas y render targets propios solo sin consumidores activos o pendientes. Disponer material no dispone sus texturas. Assets compartidos y cachés requieren límites/evicción; libera también referencias CPU y workers al terminar, según ownership. No dispongas renderer/recursos globales al salir de un sector.

## Verificación de rendimiento

Ejecuta solo comprobaciones pertinentes al cambio además de las geométricas/registro requeridas:
- Instancing/fusión: clic y selección por ID; editar/ocultar uno conserva vecinos y persistencia. Bounds correctos tras edición; IDs estables tras compactar instancias.
- Streaming: cruzar fronteras, ir/volver repetidamente, giro/teletransporte, red lenta/error y respuesta tardía. Sin duplicados, huecos visibles ni estado perdido. Tras estabilizar caché, recursos/memoria no crecen indefinidamente y los compartidos siguen funcionando al descargar vecinos.
- LOD/culling/texturas: cámara real y cambios de ambiente; silueta, seams, alfa, normales, sombras, reflejos y selección. Capturas de puntos representativos; pruebas Node no sustituyen evidencia GPU/visual.
- Compara carga fría/caliente y frame time/calls/triangles/memoria estimada con el mismo recorrido/viewport. Revisa picos de carga/decodificación/subida GPU, no solo FPS promedio. Separa datos medidos de estimaciones y límites del equipo usado.

Si faltan navegador, dispositivo o activos reales, entrega el código/reglas verificados y declara pendiente la medición o prueba visual concreta; no atribuyas una mejora no medida a esta guía.
