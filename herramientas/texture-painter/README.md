# SpanStories Texture Painter 0.1.24

Aplicar color también recolorea rellenos exactos previos en modo Zonas, sin
escribir pintura que quede oculta debajo del material anterior.

## Selección en la superficie visible

Los modos Zonas y Caras funcionan con subdivisión y caras ocultas. Los clics y
el resaltado se asocian a las caras originales sin desactivar modificadores.
La rejilla conserva esos límites sobre la superficie suavizada y la boca abierta.

## Boca abierta para pintar

Entrar o volver al editor SSTP abre temporalmente la boca con el control existente
jawOpen/mouthOpen. Se conserva el valor previo y se restaura al salir, cambiar de
personaje o desactivar el add-on. Guardar y exportar suspenden esta pose para no
incluirla en el archivo, y después la reanudan. No se editan mallas, UV, drivers,
huesos ni keyframes. Si no existe un control compatible, el personaje no cambia.

## Exportación web automática

No se exige 4K. Los mapas existentes mantienen su resolución de trabajo; una
base nueva comienza en 1024. Exportar GLB optimiza automáticamente Base Color:
prueba tamaños menores hasta 512, conserva proporciones y rechaza reducciones
que exceden el error RGB global, de percentil o de pequeños parches. Las máscaras
alpha y los mapas de normales/datos conservan su resolución. Un mapa con mucho
detalle puede permanecer en 4K; no hay una resolución única adecuada para todo.

El GLB incluye capas aplanadas, materiales, UV y texturas WebP/PNG. WebP se acepta
solo cuando reduce bytes y conserva exactamente los píxeles del tamaño elegido.
La reducción de resolución sí es aproximada y se informa por separado. La fuente
editable queda intacta. No se requiere conversión ni ajustes posteriores en el
GLTFLoader del visor actual. No requiere KTX2 ni un nuevo decodificador.

Los objetos separados asociados explícitamente (sstp_export_objects o los ojos
externos de Rig Labial) también se incluyen. Sus colores procedurales se convierten
a colores por vértice estándar sobre copias temporales, incluso sin UV. No se
cambian los originales ni se crean UV. Esa conversión es aproximada y requiere
revisión del resultado; los controles propios de Blender no se vuelven controles
de Three.js por exportar. La optimización de texturas tampoco elimina morphs ni
garantiza que un modelo con cientos de expresiones tenga una descarga pequeña.

La herramienta de agente incluye GLB por defecto y devuelve ready_file más el
informe de tamaños, bytes y memoria estimada de Base Color. Pedir solo PNG sigue
siendo posible con include_glb=false, como entrega editable. La interfaz conserva
sus botones actuales: Exportar GLB usa esta política automática.

Fundamento: https://threejs.org/manual/pages/textures.html y
https://threejs.org/docs/pages/GLTFLoader. La memoria RGBA con mipmaps se aproxima
por ancho × alto × 4 × 4/3; WebP reduce descarga, la resolución reduce memoria.

Complemento de Blender + complemento local de Codex. Ambos usan la misma API.

## Regla obligatoria de versiones vigentes y respaldos

Los archivos viejos no se acumulan en las carpetas de trabajo o de instalación.
Solo quedan como vigentes el add-on más actualizado e instalado y el complemento
vigente de Codex. Al actualizar, las versiones anteriores, instaladores antiguos
y copias de recuperación se trasladan a `RESPALDO/`, sin borrarlos.

`dist/` contiene únicamente los paquetes de la versión vigente. Los dos ZIP de
Codex son formatos de entrega del mismo complemento (directo y marketplace local).
El código fuente, las pruebas y la evidencia de verificación se conservan como
parte del proyecto; no son versiones alternativas para instalar.
El caché administrado por Codex se actualiza mediante su instalador oficial;
no se edita ni se reorganiza manualmente.

Versión vigente: **0.1.24**, con recoloreado de rellenos, selección sobre modificadores y boca abierta.
La versión 0.1.6 incorporó selección sincronizada del personaje, modos
Malla/UV y optimización de máscaras, márgenes y vista previa sin bajar resolución.
0.1.6 añade selección por cara (rejilla visible en 3D y UV), gotero sobre el modelo
y controles para subir, bajar y girar el modelo en todos los ejes.

0.1.3 incorpora la [ley obligatoria de auto-mejora](AUTO_MEJORA.md), que también
se devuelve al agente desde el add-on activo. Las correcciones deben llegar a la
fuente responsable y a las instalaciones autorizadas, con pruebas de regresión.
El motor añade margen UV de 16 texeles a las capas de pintura para evitar
costuras claras de filtrado, conservando los texeles de otras islas, originales,
alpha, UV y rig. Se aplica al relleno, pincel 2D, finalización del pincel nativo y
exportación; también migra capas de sesiones antiguas al preparar/reabrir el pintor.

## Entrega

- `dist/spanstories-texture-painter-blender-0.1.24.zip`: extensión de Blender.
- `dist/spanstories-texture-painter-codex-0.1.24.zip`: plugin privado de Codex.
- `dist/spanstories-texture-painter-codex-local-0.1.24.zip`: marketplace local para
  instalar el plugin con la CLI de Codex. No es un paquete de publicación pública.
- `evidence/Lamine-export/`: prueba PNG + GLB de Lamine; solo se pintó la región
  de chaqueta autorizada. El resto del personaje no está coloreado.

## Blender

Instalar el primer ZIP desde Preferencias → Get Extensions → Install from Disk.
Se requiere Blender 4.3 o posterior; verificado con Blender 5.2.0 LTS.
La primera apertura se hace en Vista 3D → barra lateral → SpanStories → Abrir
Texture Painter. Después el espacio propio tiene tres paneles y controles propios.

No necesita Paint System, Mio3 UV ni servicios comerciales. El ZIP de Paint System
aportado se inspeccionó como referencia; no se incorporó su motor ni su código.

El flujo es **referencia → seleccionar isla/personaje → color → aplicar → PNG/GLB**.
Las islas blancas aparecen sobre negro, sin líneas internas por defecto. Detalle
permite mostrar líneas suaves. Clic selecciona; Mayús añade/quita regiones. El clic
en el personaje y el clic en UV comparten la misma selección y el mismo resaltado.
Los colores de la parte inferior izquierda proceden de la referencia. Clic sobre
la referencia funciona como cuentagotas. El recuadro de color abre ajustes y nombres
de paleta. Capas y Regiones abren diálogos pequeños del propio complemento.

Los controles de selección y pintura no exigen editar vértices ni configurar nodos.
Desde 0.1.2, UV, modelo, grupos y agente usan la misma selección y página de
material. El resaltado del personaje tiene su propio paso de dibujo y profundidad:
funciona con los overlays habituales de Blender ocultos. No altera texturas ni
materiales para resaltar. Al reabrir un archivo se reinicia el controlador de clics.
Los manipuladores nativos del rig quedan ocultos y no reciben clics de selección
en el pintor; siguen disponibles en los otros espacios de trabajo de Blender.

Las texturas originales se protegen a su tamaño y espacio de color nativos; no se
convierten en cuadrados. Se conserva el nodo original de muestreo y sus conexiones
en la copia de trabajo. Esto corrige el aspecto roto del delineado/pestañas en
Lamine y protege otros modelos con máscaras o texturas rectangulares. También se
copian los píxeles que aún no se hayan guardado. La migración de sesiones anteriores
conserva las capas ya pintadas y mantiene la base anterior para recuperación.

El pincel 2D tiene máscara de islas. El pincel 3D usa internamente la pintura nativa
de Blender con máscara de caras; la interfaz habitual de Blender queda oculta.
La selección/resaltado no modifica imágenes. La máscara nativa solo usa indicadores
de selección temporales y se restaura al volver a Seleccionar; no cambia geometría.

## Codex

Desde 0.1.1, el agente ve solo cuatro herramientas: `painter_help`, `start_painting`,
`paint_named_region` y `export_painting`. El flujo normal no requiere Python,
seleccionar caras, configurar nodos ni interpretar coordenadas UV. Ejemplo:

```text
start_painting(object_name="Lamine")
paint_named_region(region="CHAQUETA", color_name="ROJO")
export_painting(directory="D:/salida-nueva", include_glb=true)
```

Los nombres del ejemplo deben existir en la respuesta de inicio. El usuario o
agente principal prepara una vez los grupos de regiones y los nombres de colores;
Luna, Haiku u otro agente pueden reutilizarlos. Los nombres desconocidos, elecciones
ambiguas y UV compartidas sin autorización bloquean la operación antes de pintar.
También se acepta un color hexadecimal explícito del usuario; el add-on hace la
conversión de color automáticamente. No guarda el .blend ni sobrescribe exportaciones.

La habilidad incluida es breve; los detalles avanzados están en una referencia
separada. `SSTP_ADVANCED_TOOLS=1` expone adicionalmente 26 herramientas avanzadas.
Se incluye manifiesto compatible con Claude Code para usar el mismo servidor MCP
con Haiku. No se ha ejecutado aún una prueba del flujo con Luna ni Haiku como modelos.
Para usar esta corrección hay que actualizar también el add-on a 0.1.2; su interfaz
y comportamiento de pintura manual permanecen sin cambios.

El plugin incluye un servidor MCP Node sin paquetes npm externos y una habilidad
de trabajo. Requiere Node 18+ y el add-on activo. Pulsa **Codex** en Blender para
activar el puente autenticado de loopback. No expone ejecución de Python arbitrario.

Para instalar el marketplace local: descomprime su ZIP en una carpeta estable y
ejecuta, usando la ruta real de esa carpeta:

```powershell
codex plugin marketplace add "D:\ruta\spanstories-texture-painter-local"
codex plugin add spanstories-texture-painter@spanstories-texture-painter-local
```

El ZIP de plugin individual sirve para clientes que acepten paquetes portables.
Construir y probar el servidor no instala el plugin en la cuenta ni demuestra que
su descubrimiento en el host de Codex esté completado. Deben verificarse las
herramientas del plugin después de instalarlo. También puede usarse la API a través
del Blender Native MCP ya conectado, sin crear otro servidor:

```python
import spanstories_texture_painter as painter
result = painter.core.dispatch('status', object_name='Lamine')
```

Como extensión, el módulo estará bajo `bl_ext.<repositorio>.spanstories_texture_painter`.
El archivo `skills/texture-painter/SKILL.md` explica cómo localizar el módulo activo.

## Three.js

PNG: Base Color sRGB de 8 bits con transparencia y las UV originales. Se puede
exportar a 1024, 2048 o 4096 píxeles. El manifiesto vincula material, imagen y UV.
Por defecto, las texturas sin pintura se exportan con su tamaño y proporción
originales, también dentro del GLB. Un tamaño PNG explícito conserva la proporción
del mapa; las capas pintadas usan la resolución de trabajo.
GLB: glTF 2.0 con Base Color PNG incorporado y capas combinadas; no necesita nodos
de Blender en la web. `GLTFLoader` configura sRGB y `flipY=false` automáticamente.
Para aplicar un PNG manualmente sobre una geometría importada de glTF:

```js
const texture = new THREE.TextureLoader().load('Lamine_BaseColor_0.png');
texture.colorSpace = THREE.SRGBColorSpace;
texture.flipY = false;
mesh.material.map = texture;
mesh.material.needsUpdate = true;
```

No se reordena, desenvuelve, normaliza ni sustituye la malla o las UV. Tampoco se
aplican modificadores. Exportar glTF genera su propia representación del archivo,
como hace cualquier exportador, conservando la malla de trabajo de Blender intacta.

## Límites de esta primera versión

- Se trabaja sobre una malla elegida. Las mallas adicionales se pintan por separado.
  GLB incluye sus rigs y descendientes, y permite indicar objetos adicionales.
- Atlas UV de materiales diferentes se muestran por separado; superponerlos fue
  la causa de la primera visualización incorrecta. El clic 3D cambia al material
  correspondiente automáticamente.
- Se conservan mapas Base Color existentes que estén conectados directamente a
  Principled BSDF. UDIM, coordenadas fuera de 0–1 y fuentes procedurales se rechazan
  explícitamente. No se sustituyen silenciosamente.
- Las UV compartidas se detectan en la resolución de trabajo y se pide confirmación
  antes de pintar superficies adicionales. No se separan UV reflejadas.
- El GLB transporta las texturas pintadas y los rigs/morphs compatibles con glTF.
  Los materiales procedurales de otros objetos y las restricciones exclusivas de
  Blender no se convierten automáticamente en equivalentes de Three.js.
- El sistema no identifica prendas/anatomía ni reconstruye logotipos o vistas
  ocultas automáticamente a partir de una sola imagen.
- Aislamiento por subregiones e historial persistente de rellenos tras reabrir
  quedan fuera de esta primera versión. Las capas e imágenes sí se conservan.
- Guardar un .blend es una acción explícita. La prueba en Lamine no autoriza a
  sobrescribir su archivo original. Una carga temporal de código para pruebas
  tampoco constituye instalación permanente del add-on.

## Verificación reproducible

`tests/run_blender.py`: prueba aislada de islas, UV compartidas, máscaras, rellenos,
capas, pincel, deshacer/rehacer, PNG/GLB, malla/shape keys y guardado/reapertura.
`tests/test_bridge.mjs`: protocolo MCP real y consulta al Blender conectado.
`tests/run_agent.py`: flujo automático por nombres, fallos seguros y exportación;
21 comprobaciones aisladas, sin modificar el Lamine abierto.
`tests/run_selection_materials.py`: 22 comprobaciones de selección, texturas
rectangulares, muestreo, migración y PNG/GLB.
`tests/runtime_selection_gpu.py` y `tests/runtime_eye_material_compare.py`: pruebas
reales de dibujo GPU y comparación de materiales en Blender, sin automatizar clics.
`tests/make_web_test.py`: genera una prueba local GLTFLoader utilizando el Three.js
existente en el equipo; no modifica el visor de SpanStories.
Los resultados de ejecución se guardan en `evidence/` y no se empaquetan como runtime.
