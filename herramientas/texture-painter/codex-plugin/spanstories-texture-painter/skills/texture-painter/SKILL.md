---
name: texture-painter
description: Pintar automáticamente un personaje en Blender por nombres de regiones y colores, con cuatro herramientas simples. Apto para agentes pequeños; preserva malla y UV y exporta para Three.js.
---

# Pintar con cuatro herramientas

## Piel procedural (0.2.2)

En Blender se abre con el botón Piel del espacio SSTP (maximiza al personaje; Mostrar paneles vuelve) o la pestaña Piel en otros espacios.
`texturize_skin` y el panel Piel recolorean toda la piel de un personaje con el
shader de Ultimate Skin, como capa retirable: no cambian imagen, malla ni UV.
Estilo Pixar por defecto; `NATURAL` e `HIPER` solo si se piden.
Los labios no se dibujan: la máscara deja ver los texeles originales. Su forma
sale de esos texeles o, sin contraste de color, de la geometría y el rig de la
boca (`labios`: textura/geometria). Nunca copiar la forma de una imagen de
referencia. Con `lip_mode=TEXTURA` y el color detectado, los labios quedan
exactos; si cambia el tono de piel, los labios y el rubor lo siguen.
El protector de labios está activo por defecto y es visible al inicio del panel; no desactivarlo sin que lo pida el usuario.
Norma: las cejas deben ser islas separadas de la malla. Si `cejas_unidas`>0, avisa al usuario y pide quitarlas a mano con cuidado; nunca automáticamente. Revisa la cara con el pelo oculto (panel: Ocultar pelo).
Revisar siempre con render: `ok=true` no prueba que la zona sea correcta. Si
aparece ropa como piel o una zona de piel falta, corregir `zones` o informar;
no pintar encima. `export_painting` hornea la piel en el GLB; el relieve de poros
se exporta como mapa normal solo si hay relieve activo. `clean` limpia manchas finas (activo por defecto). `remove_skin` vuelve al material original.

## Recolorear rellenos existentes (0.1.24)

Aplicar color reconoce rellenos exactos previos también en modo Zonas, para que
el nuevo color no quede oculto bajo ellos. Se conservan las caras no seleccionadas.
Para usar el color actual del usuario, leer scene.sstp.color sin sustituirlo por
una paleta o una aproximación. En la API avanzada usar fill(exact_faces=True)
cuando la zona ya tenga rellenos exactos. No prometer que un pincel de textura
pueda sobrescribir un relleno de material por caras.

## Selección sobre modificadores visibles (0.1.23)

La selección 3D y el resaltado conservan la correspondencia con las caras
originales aunque subdivisión o caras ocultas cambien la topología visible.
Se propagan identificadores en una copia temporal, sin desactivar modificadores
ni cambiar la malla, las UV o la pose. La rejilla muestra los límites originales
sobre la superficie suavizada. El gotero usa las UV del punto visible y el
material/relleno de su cara original. Una superficie totalmente generada sin
cara original se rechaza; no inventar correspondencia ni seleccionar cara 0.

## Boca abierta al entrar al editor (0.1.22)

Abrir Texture Painter activa una pose temporal de boca abierta cuando existe
jawOpen o mouthOpen. Usa la shape key libre o el control escalar existente del
driver; nunca modifica sus coordenadas, drivers, huesos ni keyframes. Cambiar
de personaje o salir del espacio SSTP restaura la pose previa. Guardar y exportar
GLB suspenden la apertura y la reanudan después: la pose de pintura no se guarda.
Los personajes sin un control compatible se dejan intactos; no inventar un rig.
La revisión debe comprobar la boca abierta en el personaje real y la restauración,
además de geometría, UV, imágenes, rig y animación conservados.

## Exportación web automática (0.1.21)

4K no es obligatorio. No aumentes la resolución para pintar por costumbre: usa
el tamaño nativo de imágenes existentes; para una base nueva comienza en 1024.
La resolución de trabajo es independiente de la resolución del GLB final.

export_painting incluye GLB por defecto. El archivo indicado por ready_file es
autocontenido y listo para GLTFLoader del visor vigente: capas aplanadas, UV y
materiales incluidos y WebP sin pérdida cuando ahorra bytes. No necesita ajustar
flipY, espacio de color, convertir texturas ni instalar decodificadores adicionales.
include_glb=false solicita solo PNG editables y devuelve threejs_ready=false.

El GLB prueba reducciones de Base Color hasta 512 px y acepta únicamente las que
pasan límites de error RGB global, percentil y parches locales de 16 px sobre
las superficies UV, sin penalizar el espacio del atlas que no se utiliza. Conserva
resolución nativa si detecta pérdida de detalle; no agranda mapas pequeños, no
altera proporciones y conserva máscaras alpha y mapas de datos en tamaño nativo.
Las imágenes originales, capas y resolución de pintura permanecen intactas.
La reducción espacial es aproximada: solo la codificación WebP es sin pérdida.
No llamar al GLB completo sin pérdida cuando resolution_changed=true.
web_optimization informa tamaños, bytes, pruebas y estimación de memoria Base
Color con mipmaps; no representa toda la memoria del modelo ni garantiza FPS.
No escoger KTX2 sin soporte ya configurado en el visor. No exportar ni guardar
el .blend si no se solicitó; verificar visualmente el personaje de destino.

Los adjuntos separados deben estar asociados mediante sstp_export_objects o
eyes_external de los metadatos de Rig Labial. No adivinar por prefijos. Los
colores procedurales asociados se convierten temporalmente a COLOR_0 estándar
por vértices, sin unwrap ni cambios del original. Es una aproximación: revisar
el resultado de exportación. No afirmar compatibilidad de cualquier shader ni
de todos los controles Blender; se conservan las capacidades glTF del exportador.

## Aplicar color a zonas con píxeles compartidos (0.1.20)

Aplicar color desde la interfaz resuelve selecciones con texeles compartidos
mediante relleno exacto por caras, también en modo Zonas. Así no deja segmentos
del color anterior ni colorea otras superficies que comparten UV. Usa materiales
independientes, sin modificar la geometría, las UV ni imágenes originales.
Deshacer/rehacer, capas, borrado de región y exportación conservan el relleno.
El pincel continúa protegiendo texeles compartidos: no prometer pintura continua
independiente sobre UV solapadas. Las herramientas MCP conservan su contrato:
shared_fallback no se activa implícitamente en las llamadas de agente.

## Giro sin inclinación lateral (0.1.19)

El arrastre izquierdo gira alrededor de Z global e inclina sobre X de cámara,
sin acumular roll. Se limita la elevación antes de los polos para evitar vueltas
invertidas. Un arrastre corrige el roll previo; cargar el parche no cambia la vista
actual. El derecho conserva el desplazamiento y los controles de ejes siguen
disponibles. Solo se mueve la vista, nunca el personaje ni sus texturas.

## Color y tamaño reales del pincel en Blender 5.x (0.1.18)

Los controles unificados viven en tool_settings.image_paint.unified_paint_settings.
Sincronizar ese bloque cuando está activado, con fallback a ToolSettings para
versiones anteriores. Actualizar solo Brush deja activo otro color/tamaño: puede
pintar negro con tamaño 100 aunque la interfaz muestre azul y tamaño 30.
La corrección evita nuevos trazos incorrectos; retirar pintura anterior requiere
autorización del usuario y una máscara comprobada, sin borrar otros cambios.

## Seleccionar hileras de caras (0.1.17)

En modo Caras, Ctrl + clic añade el camino más corto por caras vecinas desde
la última cara elegida hasta la nueva, en modelo y UV. Incluye ambos extremos
y conserva otras caras seleccionadas. El primer clic puede ser normal o con
Ctrl. Mayús sigue añadiendo/quitando una cara. Sin conexión por aristas se añade
solo la cara de destino. La selección no modifica geometría ni texturas.

## Navegación UV fluida (0.1.16)

La rejilla y el resaltado se conservan en coordenadas UV en la GPU. Desplazar,
ampliar o redimensionar el panel cambia solamente una matriz; no reconstruye
los buffers. Cambiar selección, geometría, material o detalle invalida los datos
correspondientes. Se mantienen colores, resolución y protección de las texturas.
En la prueba GPU del personaje de 29.868 caras: navegación de 1094 ms a 2 ms;
construcción inicial de 1198 ms a 42 ms. Son tiempos del overlay en esa prueba,
no FPS de toda la interfaz ni garantía de ausencia de otros cierres de Blender.

## Exportación web sin pérdida (0.1.15)

El GLB comprime texturas a WebP sin pérdida y comprueba igualdad RGBA al
decodificar antes de aceptar cada conversión. Mantiene dimensiones y deja PNG
cuando no ahorra o no conserva todos los valores. El visor vigente soporta
EXT_texture_webp: el GLB es autocontenido y no requiere procesado posterior.
Rellenos por cara opacos usan baseColorFactor estándar, sin otra textura 2K.
Esto reduce descarga y texturas residentes; WebP por sí solo no comprime la
memoria GPU como KTX2. No afirmar que el peso mínimo o la web publicada hayan
sido validados sin medirlos.

## Relleno exacto de caras (0.1.14)

En el modo Caras, Aplicar color rellena polígonos mediante grupos de materiales:
no depende del número de píxeles UV ni filtra hacia la cara vecina. Conserva la
resolución y las imágenes existentes, vértices, topología, UV, shape keys y rig;
sí cambia las asignaciones de material de las caras autorizadas. Deshacer,
rehacer y la visibilidad/opacidad de las capas incluyen estos rellenos.

Exportar GLB conserva los límites exactos con materiales y PNG incrustados
estándar, sin shader especial ni retoques en Three.js. Un PNG aislado no incluye
asignaciones de material: la exportación PNG genera variantes y manifiesto;
usar GLB para carga directa en el visor. La pintura por islas y pinceles sigue
siendo pintura de textura; no prometer límites geométricos para esos pinceles.

## Malla visible para seleccionar caras (0.1.13)

Ver malla debe mostrar aristas de la superficie visible, sin transparentar el
rostro ni superponer la parte posterior. El overlay utiliza profundidad propia
ajustada al personaje; no altera la geometría ni la selección. Una franja clara
en la abertura de la boca puede ser los dientes: comprobar la superficie antes
de diagnosticarla como mancha o pintarla. No recuperar labios sin autorización.

## Revisión visual de color (0.1.12)

La selección usa contorno naranja y relleno muy tenue en modelo y UV. El
resaltado es un overlay, no pintura. Antes de diagnosticar un relleno fallido,
comprobar el mensaje, los píxeles de la capa y si el resaltado oculta el color.

## Protección de solapamientos en edición manual (0.1.11)

Aplicar color y los pinceles de la interfaz conservan los texeles compartidos
con caras no seleccionadas. Esas zonas pueden quedar sin pintar; el relleno
informa cuántos píxeles pintó y cuántos protegió. No aceptar pintar otras
superficies para ocultar el aviso. No modificar UV ni separar materiales.
Las cuatro herramientas de agente conservan su contrato de solapamientos;
exclusive=True es una opción explícita de la API avanzada, no un permiso implícito.

## Navegación manual (0.1.10)

Menú: Pincel 3D, Pincel UV, Borrador y Pinceles 3D (catálogo nativo con
miniaturas); tamaño e intensidad tienen controles visibles. En ambos modos
de pincel se pinta con Mayús + izquierdo. El catálogo activa pintura 3D;
Pincel UV usa el motor 2D protegido del complemento. No confundir superficies.
Mayús invoca explícitamente el pincel elegido, sin activar Suavizar temporal.

Con Seleccionar activo, clic izquierdo selecciona en modelo y UV y sincroniza
ambas vistas. En el modelo el clic se resuelve al soltar; arrastrar más de cuatro
píxeles gira sin cambiar la selección. Un nuevo clic recupera arrastres atascados.

En la vista 3D: arrastrar izquierdo gira libremente; arrastrar derecho desplaza
en horizontal y vertical también en referencia y textura. Mayús + izquierdo pinta o selecciona según la herramienta activa;
en selección también permite añadir zonas. El gotero conserva el clic izquierdo.
El selector de ejes permite seis vistas. Esc cancela un arrastre de navegación.
Estos gestos no modifican la malla, UV, texturas ni historial.

## Rendimiento (0.1.8)

La mezcla RGB trabaja por bloques y canales, con píxeles idénticos; el resaltado
UV reutiliza los buffers GPU hasta cambiar selección, geometría, material o vista.
Esto reduce cálculos y temporales sin bajar resolución ni modificar el personaje.

El motor reutiliza máscaras UV y comprobaciones de solapamiento sin reducir
resolución ni protección de otras islas. Las bases protegidas y la vista previa
se recalculan solo cuando corresponde. No regenerar geometría ni reconstruir
materiales para cada aplicación de color. Los márgenes conservan píxeles idénticos.
La primera operación sobre otra zona o resolución aún puede requerir cálculos.

## Edición manual en Blender (0.1.4)

Elegir un personaje actualiza su textura UV y aísla únicamente ese objeto en la
vista 3D del editor. No confundir la referencia izquierda con la textura UV central.
Los botones Malla y UV eligen dónde actúa el pincel; ambos usan color, tamaño,
intensidad, capas y selección compartidos. Primero preparar texturas protegidas
y seleccionar las zonas. Una textura importada se muestra incluso antes de preparar.
No afirmar que Tripo conserva las UV originales sin comparar ambos archivos;
encontrar una capa UV válida solo demuestra que la importación tiene UV.

## Ley obligatoria de auto-mejora

Cada error técnico resuelto debe corregirse de forma reutilizable en el plugin
y, cuando corresponda, en el add-on. Reparar solo el personaje no cierra el fallo.
Seguir [AUTO_MEJORA.md](references/AUTO_MEJORA.md): causa reproducible, corrección
en la fuente responsable, prueba de regresión ejecutada, aprendizaje verificado,
versión e instalación autorizada comprobadas. No confundir paquetes construidos
con código instalado o cargado. Si algo queda bloqueado, declararlo pendiente.
`start_painting` devuelve `addon_version` y esta ley desde el add-on activo.
Desde 0.1.3 el margen UV se calcula en el motor compartido: no corregir costuras
con rellenos ad hoc personaje por personaje ni expandir la selección a sus vecinos.
Inspeccionar el original antes de atribuir al motor manchas de delineado/pestañas.
Esta regla actualiza herramientas e instrucciones, sin afirmar que cambia el modelo.

Usa estas herramientas; no necesitas programar ni entender Blender o las UV.

| Herramienta | Cuándo usarla |
| --- | --- |
| `painter_help` | Ayuda breve si no conoces el flujo. |
| `start_painting` | Primero: devuelve personaje, regiones y colores disponibles. |
| `paint_named_region` | Pinta automáticamente una región por su nombre. |
| `export_painting` | Exporta PNG y opcional GLB para Three.js. |
| `texturize_skin` | Piel por tono y estilo, conservando los labios. |
| `skin_status` / `remove_skin` | Consulta o retira la piel. |

1. Llama `start_painting` y comprueba el nombre del personaje.
2. Copia los nombres devueltos, sin inventarlos. Pinta solo lo pedido por el usuario.
3. Para cada región, llama `paint_named_region` con `region` y `color_name`.
   También acepta `palette_index` devuelto por inicio, o `hex_color` dado por el
   usuario. Elige una sola opción de color. No conviertas colores manualmente.
4. Comprueba `ok=true` y `mesh_unchanged=true`. Exporta solo si se solicitó,
   mediante `export_painting(directory=..., include_glb=true)` a una carpeta nueva.

Ejemplo, solo si inicio devuelve estos nombres:

```json
{"region":"CHAQUETA","color_name":"ROJO"}
```

El add-on prepara texturas, selecciona islas, aplica color y verifica la malla.
No necesitas llamar herramientas avanzadas ni escribir Python.
La selección es compartida por UV y modelo; `selection` informa del mismo estado
en inicio y pintura. Conserva el tamaño, muestreo y píxeles de texturas originales,
incluidas máscaras de pestañas. Nunca resaltes una selección pintando el material.

Si `ok=false`, detente y explica `message`. No pruebes nombres al azar.
`needs_region_mapping` significa que el usuario/agente principal debe nombrar las
regiones una vez; una isla no equivale necesariamente a una prenda. Después Luna,
Haiku u otro agente pueden reutilizar esos nombres. `needs_color_choice` solicita
un color conocido. `needs_overlap_approval` exige autorización antes de pasar
`allow_overlap=true`. No asignes colores arbitrarios desde una imagen frontal.

Si no hay conexión, indica: abre el add-on en Blender y pulsa **Codex**.
Estas herramientas no guardan el .blend ni cambian geometría, UV, rig o animación.
No hagas cambios visuales adicionales por tu cuenta. Informa regiones pintadas,
archivos exportados y cualquier pendiente real. La revisión visual final no se
sustituye por un mensaje de éxito del servidor.

Solo para preparar o reparar el mapeo: [guía avanzada](references/advanced.md).
