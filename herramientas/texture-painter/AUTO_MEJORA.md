# Ley de auto-mejora

Cada error técnico que ocurra y se resuelva debe actualizar el complemento de
Codex y el add-on de Blender cuando corresponda. Una reparación específica de
un personaje no cuenta como corrección del programa.

Para cerrar un error:

1. Reproducir el fallo e identificar qué componente lo causa. Distinguir fallos
   técnicos de una región sin nombrar, un color sin elegir o una aprobación pendiente.
2. Corregir la causa en la fuente responsable, con una solución reutilizable.
   Actualizar ambos componentes si el fallo afecta a su contrato compartido.
3. Añadir una prueba de regresión que falle con la causa original y pase con la
   corrección. Verificar también la conservación de las partes que funcionaban.
4. Actualizar las instrucciones del agente y registrar únicamente aprendizajes
   comprobados: síntoma, causa, solución, prueba y limitaciones.
5. Versionar, construir y sincronizar los paquetes e instalaciones autorizadas.
   Verificar la versión realmente cargada; un ZIP creado no prueba una instalación.
6. Informar por separado fuente modificada, instalación, ejecución y verificación.
   Si un paso está bloqueado, conservar el pendiente sin declarar el error cerrado.

Esta ley no autoriza guardar un .blend, cambiar diseños, borrar datos, modificar
malla/UV/rig ni ampliar el alcance. Respetar las autorizaciones de la conversación.
La mejora se hace mediante cambios de código e instrucciones comprobados; no
se afirma haber modificado los pesos ni el conocimiento general del modelo.

## Aprendizajes verificados

### 0.2.4 — Herramientas del espacio SSTP en el panel lateral

- El menú del espacio SSTP (boca, gotero, caras, malla, regiones, seleccionar,
  Pincel 3D/UV, borrador, catálogo, preparar/aplicar/deshacer/capas, Piel, PNG,
  GLB, guardar, Codex) no existía en el panel lateral «SpanStories».
- `sstp.action` ejecuta la misma `run_action`; `draw_tools` dibuja los mismos
  botones con sus estados. Fuera del espacio SSTP, Piel se abre dentro del panel
  (`piel_ui.draw_panel`) y Pincel UV avisa que necesita el mapa UV.
- tests/run_panel_herramientas.py compara las acciones del menú con las del panel.

### 0.2.3 — Gotero y pincel con la capa Piel

- Síntoma (Hamibi): el gotero daba gris 0,8 y Pincel 3D / Pincel UV no pintaban.
- Gotero: leía Base Color esperando una imagen; con Piel viene de «Piel Limpia
  Mezcla» y devolvía el valor por defecto del socket. Ahora sigue la entrada A
  hasta la textura y aplica piel limpia, capas y, donde la máscara R manda, el color
  del shader de piel: toma lo que se ve.
- Pincel: preparar desenganchaba la Piel del material original antes de validar y
  luego rechazaba todo el personaje porque los Tiny Eye tienen Base Color procedural.
  Ahora valida a través de la Piel sin tocar el original y marca las superficies
  procedurales como no pintables (se conservan tal cual, sin copia ni exportación).
- Aun preparado, lo pintado quedaba bajo «Piel limpia» y bajo el shader de piel
  («Piel Mezcla» = máscara R). Orden nuevo: base → piel limpia → capas, y el factor
  de «Piel Mezcla» es R × (1 − alfa pintado). La exportación sigue el mismo orden.
- tests/run_piel_gotero_pincel.py falla con 0.2.2 (gris 0,8) y pasa con 0.2.3.
- Limitación: el gotero sobre piel usa «Color Base» del grupo, sin poros ni luz.
- «Aplicar color» por caras (modo Caras) no cambiaba nada en piel: el material
  «Caras exactas» copia la capa Piel y su «Piel Mezcla» seguía mostrando el shader
  de piel. `piel.cover_constant` multiplica ese factor por (1 − alfa del relleno).
  Probado en run_piel_gotero_pincel.py (falla sin el cambio) y en vivo en Hamibi.
- Limitación: los materiales «Caras exactas» no siguen los cambios del panel Piel
  hasta el siguiente relleno.

### 0.2.0 — Panel Piel y conservación de labios

- Recolorear por máscara perdía labios si estos pasaban el filtro de caras de piel:
  las caras más rojas quedaban como huecos con su forma exacta. La máscara de
  labios ya no depende de ese filtro y cierra los huecos de los brillos pálidos.
- Medir piel por distancia al color de referencia dejaba sin cubrir zonas pálidas;
  admitir todo el eje hacia el blanco metía camisetas y cordones. Se exige la mitad
  del color de la piel y un parche con caras cercanas a la referencia.
- Cambiar a un tono oscuro dejaba labios y rubor claros: siguen ahora el cambio
  de la piel, con razón 1 si el color no cambia.
- Las UV de Tripo fragmentan el ruido: las coordenadas son Generated escaladas,
  estables con el rig. tests/run_piel.py cubre lo anterior, GLB y retirada.
- Hamabi (pelo rojo, sin rig ni interior de boca): el pelo era la mayor superficie
  cálida de la cabeza y se tomó por piel. La referencia se limita a tonos de piel,
  pesa la cara frontal y la boca sin rig se busca como franja roja horizontal.
- Luis: la sombra rojiza bajo la nariz entraba como labio; la zona de búsqueda se
  limita a la altura real de unos labios. El panel solo seguía la selección dentro
  del espacio de pintura; ahora la sigue siempre, sin cambiar de modo ni encuadrar.
- El panel Piel no existía para quien trabaja en el espacio SSTP: ese espacio oculta
  la barra lateral y captura los clics. El botón Piel minimiza Referencia y Textura y deja Piel como panel derecho.
  Maximizar el área es fiable; mover bordes por código da tamaños desactualizados.
  Comprobar cualquier interfaz nueva también en ese espacio, no solo en Layout.
- Limpiar manchas cubre marcas finas y restos claros, con ojos, cejas y boca
  protegidos. El relieve de poros va al GLB como mapa normal solo si hay relieve.
- Camila seguía manchada: Tripo hornea colores ajenos sobre cada superficie. Cada
  isla UV toma su color mayoritario y pinta lo demás en una imagen propia. Una isla
  con color de piel es piel entera. Votar por vecinos extendía la piel a la camiseta.
  La cara sigue por las islas vecinas de la cabeza. Solo quedan protegidos labios,
  ojo y trazo de ceja; la máscara es opaca hasta el borde para que nada se transparente.
- Una ceja con isla propia es una pieza de malla: la piel de debajo se pinta entera.
  Solo la ceja pintada sobre la cara se conserva como trazo. La cabeza se mide desde
  la boca: la malla base de un personaje con rig no está a su altura posada.
- Limitar la altura de los labios por igual recortaba el inferior: el límite inferior
  es mayor que el superior. preparar debe soltar la capa limpia antes de validar Base Color.
- tests/run_piel_ui.py usa clics reales con --enable-event-simulate.

### 0.1.24 — Aplicar color quedaba oculto bajo rellenos por cara

- En Zonas, Aplicar color solo detectaba rellenos existentes al borrar. Al
  recolorear una zona sin UV compartidas escribía píxeles, pero el material de
  relleno anterior seguía encima y no se veía el color nuevo.
- La UI usa relleno exacto cuando la selección intersecta un relleno existente,
  también al pintar. El borrado conserva su restricción a la capa activa.
- tests/run_existing_face_color.py comprueba el operador real, color visible,
  vecino intacto, geometría/UV/rig conservados, deshacer, rehacer y borrado.
- Los brazos y manos de Hama se identificaron por seis islas de piel verificadas
  (3.118 caras), coincidentes con su relleno anterior; el color procede del
  selector actual, sin convertirlo a un color de paleta ni pintar cara/cuello.

### 0.1.23 — Selección y malla con modificadores de topología

- Hama tiene 28.209 caras base y 107.722 evaluadas por geometría oculta y
  subdivisión. El selector y el overlay rechazaban la diferencia de cantidades.
- Un atributo entero FACE en una copia desechable propaga el índice original
  por los modificadores. El original no recibe atributos ni cambios. Las caras
  generadas sin procedencia quedan en -1 y no se asignan a una cara arbitraria.
- Selección, contorno y rejilla usan ese mapa. El gotero interpola UV de la cara
  visible y respeta los rellenos exactos por cara original. La caché se invalida
  ante actualizaciones de geometría y se limpia al cargar/desactivar.
- La comprobación de identidad de la copia acepta solo error flotante de una
  millonésima del tamaño, conservando topología y UV exactas. Subdivisión puede
  producir diferencias numéricas de 1.2e-7 sin modificar la superficie real.
- tests/run_surface_map.py cubre subdivisión, caras eliminadas, UV superpuestas,
  cara generada sin origen, pose abierta, limpieza de temporales y caché.

### 0.1.22 — Apertura temporal de boca para texturizar

- La interfaz abría el espacio SSTP sin activar jawOpen: no existía una pose de
  pintura. La apertura se vincula ahora a entrada, reentrada y cambio de objetivo.
- Se utiliza una shape key libre jawOpen/mouthOpen o su control escalar declarado
  por un driver SINGLE_PROP. No se reescriben drivers ni se mueven huesos.
- La pose anterior se restaura al salir/cambiar objetivo/desactivar/cargar otro
  archivo. Guardar y exportar suspenden la pose y la reanudan incluso ante fallo.
- tests/run_mouth_preview.py cubre ambos tipos de control, idempotencia, cambios
  de objetivo, suspensión anidada, exportación fallida, guardado, desactivación y
  controles no compatibles. No se guardan archivos .blend durante la regresión.
- Limitación: no crea apertura para mallas sin shape key/control compatibles.

### 0.1.21 — Exportación web automática sin exigir 4K

- El trabajo nuevo ya comenzaba en 1024, pero GLB heredaba todo el atlas nativo.
  WebP reducía descarga sin reducir memoria RGBA. La resolución de edición no
  debe imponerse al archivo online ni aumentar por costumbre a 4096.
- La exportación prueba reducciones con filtro de área en luz lineal, conserva
  proporciones y no aumenta mapas pequeños. Evalúa texeles de superficies UV:
  RMSE global <=2.5/255, percentil 99 <=12/255 y RMSE de cada parche <=8/255.
  Conserva alpha, mapas de datos y mapeados no compatibles en resolución nativa.
  Si falla la prueba, conserva detalle en vez de reducir a una resolución fija.
- El GLB incluye todo y WebP solo se acepta con igualdad RGBA al decodificar y
  ahorro de bytes. La reducción espacial se informa como aproximada; el informe
  separa resolución, descarga y estimación de memoria de Base Color con mipmaps.
- export_painting incluye GLB por defecto y ready_file. PNG solo es editable y
  no se marca como threejs_ready. El servidor toma su versión del manifiesto.
- Los ojos externos documentados por Rig Labial y sstp_export_objects se incluyen
  mediante referencias explícitas, sin adivinar nombres. Colores procedurales de
  adjuntos se convierten a COLOR_0 glTF en mallas temporales, incluso sin UV,
  sin unwrap ni cambios del original. Esta conversión es aproximada por vértices.
- tests/run_web_auto.py pasa 37 comprobaciones; tests/run_agent.py pasa 21.
  Incluyen detalle pequeño, alpha, proporciones, buffers de geometría/morphs,
  materiales, imágenes originales, adjuntos, limpieza y exportación por defecto.
- La comparación real de Hama protege su atlas cuando los parches detectan
  variación excesiva. No garantiza reducción de resolución para cada personaje.
  El navegador de Work está desactivado: no afirmar revisión visual en el visor.

### 0.1.20 — Aplicar color dejaba oscura una franja con UV compartidas

- En la cara 21103, la selección ocupa 44 texeles y ninguno es exclusivo; su isla
  tiene 1684 texeles y solo 444 exclusivos. La protección impedía sobrescribir la
  franja. Los controles del pincel ya estaban sincronizados: es otra causa.
- Aplicar color en UI solicita shared_fallback: si una selección comparte algún
  texel, toda la región recibe relleno exacto por caras. Evita resultados parciales
  y conserva las superficies no seleccionadas. La API de agente no cambia por defecto.
- El borrado de región reconoce rellenos exactos también en modo Zonas.
- `tests/run_shared_fill.py`: 15 comprobaciones con UV totalmente coincidentes,
  capa oscura previa, cambios de color, vecino preservado, deshacer/rehacer,
  visibilidad de capa, borrado y geometría/UV/rig intactos.
- El pincel conserva su protección: esta versión resuelve la petición mediante
  Aplicar color, no mediante pincel continuo sobre superficies con UV compartidas.

### 0.1.19 — Arrastre izquierdo acumulaba inclinación lateral

- Reproducido matemáticamente: multiplicar giros locales Y y X en cada evento
  acumula roll al alternar arrastres. El personaje termina oblicuo tras rodearlo.
- Reconstruir orientación desde azimut alrededor de Z global y elevación sobre
  X de cámara, sin roll. Limitar elevación a (0.001, pi-0.001); conservar azimut
  en vistas polares. No cambiar la vista actual al cargar la corrección.
- `tests/run_turntable.py`: 18 comprobaciones; el algoritmo anterior reproduce
  inclinación y el nuevo conserva horizonte tras 120 arrastres, alturas y rumbos
  independientes, vistas polares y orientación inicialmente torcida.
- El desplazamiento derecho y la navegación UV siguen en sus ramas existentes.

### 0.1.18 — Pincel negro pese al color visible en la interfaz

- En Blender 5.2, image_paint.unified_paint_settings conservaba color negro y
  tamaño 100, con use_unified_color/use_unified_size activos. El add-on buscaba
  el bloque en ToolSettings, donde ya no existe, y actualizaba solo Brush.
- color_changed sincroniza el bloque de ImagePaint y conserva fallback al bloque
  antiguo. Respeta los indicadores de uso unificado y los demás controles.
- `tests/run_unified_brush.py`: prueba la función real contra ambas ubicaciones,
  color/tamaño/intensidad efectivos, valores desactivados y ausencia de Brush.
- La pintura incorrecta anterior no se elimina automáticamente al actualizar.
  Se requiere autorización y comprobación de los píxeles precisos a restaurar.

### 0.1.17 — Ctrl + clic para seleccionar hileras de caras

- Antes, Ctrl no se conservaba al diferir el clic del modelo hasta soltar el ratón
  y no existía selección por recorrido. Ahora se conserva y se calcula el camino
  más corto de caras que comparten arista, con adyacencia cacheada por geometría.
- El ancla es la última cara elegida. El recorrido añade sin alternar los extremos;
  Mayús conserva su alternancia. Vaciar selección elimina el ancla. Sin conexión
  solo se añade el destino; nunca se cruza un hueco ni se modifica la malla.
- `tests/run_face_path.py` comprueba A→D con B/C, sentido inverso, ancla nueva,
  componentes separados, Mayús, vaciado, clic normal inicial y rutas UI modelo/UV.

### 0.1.16 — Bloqueos al desplazar y ampliar el panel UV

- La clave de caché incluía origen y escala en pantalla: cada movimiento
  recorría todas las caras, convertía coordenadas y reconstruía buffers GPU.
- Reutilizar buffers en coordenadas UV y transformar con gpu.matrix, restaurando
  la matriz al salir. Generar aristas por bloques y evitar Vector/tessellation
  para caras triangulares; conservar teselación para polígonos cóncavos.
- `tests/run_uv_performance_live.py`: nueve comprobaciones GPU en el original
  abierto, con 29.868 caras. Mediana de seis vistas: redibujado durante navegación
  de 1093.65 ms a 2.00 ms; primera construcción de 1198.07 ms a 41.78 ms.
  Cada versión mide cinco vistas posteriores a la construcción inicial.
  Tres comparaciones raster de vistas de prueba resultaron idénticas.
- `tests/run_interactive_performance.py`: 44 comprobaciones pasaron, incluyendo
  reutilización durante pan, invalidación por detalle/geometría, colores y mezcla.
- Conservados fingerprint de malla/UV/rig, hashes de todas las imágenes cargadas,
  selección y estado. No se guardó el .blend. No se reprodujo un cierre del proceso;
  estos resultados no descartan causas adicionales de crash ni miden toda la UI.

### 0.1.15 — Optimización web sin pérdida

- La textura principal PNG 2048 pesaba 4.03 MB. El codificador WebP de Blender
  con quality=100 produjo 1.96 MB con RGBA decodificado exactamente idéntico.
  Marcar el búfer temporal como modificado es necesario: una imagen cargada
  limpia puede copiar los bytes PNG aunque se haya elegido WEBP.
- Cada conversión se acepta solo si ocupa menos y los valores RGBA son iguales.
  El GLB recompone los bufferViews con alineación de cuatro bytes y declara
  EXT_texture_webp. El GLTFLoader del visor vigente ya soporta esa extensión.
- Un relleno opaco de color constante se exporta como baseColorFactor PBR, sin
  crear un atlas 2K adicional. Se conserva el límite de materiales por caras.
- La regresión de relleno/exportación pasa con el material constante y conserva
  el render de retorno. WebP reduce descarga; no equivale a compresión GPU KTX2.

### 0.1.14 — Relleno exacto sin subir la resolución

- El labio seleccionado tenía 49 caras y 177 texeles, todos con el color pedido.
  La máscara protegía centros de texel, pero el filtrado interpolaba ese color
  sobre superficies no seleccionadas. Aumentar resolución no es un límite exacto.
- Aplicar color en modo Caras usa grupos de materiales por conjunto de rellenos,
  conservando la identidad del atlas para selección, píxeles, resolución y UV.
  Solo cambian asignaciones de material de los polígonos autorizados. Capas,
  deshacer, rehacer, borrar y restaurar originales incluyen los rellenos exactos.
- GLB aplana cada variante de material a un PNG estándar y conserva el límite
  mediante primitivas glTF. PNG incluye variantes y asignaciones en el manifiesto.
  El GLB se carga con GLTFLoader sin código especial ni retoques de materiales.
- `tests/run_exact_face_fill.py`: 27 comprobaciones, con UV compartidas, render
  de cara vecina idéntico píxel a píxel y exportación/reimportación glTF estándar.
  Pasaron además 22 regresiones de selección/materiales y 13 de selección por cara.
- La comprobación de retorno compara el color con tolerancia a cuantización PNG
  y variación de muestras del render. No equivale por sí sola a validar una
  publicación web. Los pinceles UV/nativos conservan su comportamiento de textura.

### 0.1.13 — Ver malla mostraba aristas ocultas

- Reproducido con el personaje femenino: el sesgo fijo de -4e-4 en profundidad
  de clip, con una vista ortográfica de alcance 1000 m, exponía aristas detrás
  de la cara. No era necesario cambiar ni simplificar la malla.
- El prepaso, la selección y las líneas comparten ahora una proyección cuya
  profundidad se ajusta a los límites del objetivo, conservando XY. El pequeño
  sesgo de las líneas se aplica en ese rango, independiente del clip del visor.
- `tests/run_wire_occlusion_live.py`: regresión GPU real que reproduce líneas
  ocultas con el algoritmo anterior y las oculta con la corrección; conserva
  líneas delanteras, encuadre y tres rangos de clip. 15 comprobaciones pasaron.
- Comprobado visualmente en Blender: rejilla superficial legible. Base y capa
  previa idénticas píxel a píxel; geometría, UV, shape keys y modificadores
  idénticos. No se pintaron labios ni dientes, ni se guardó el .blend.

### 0.1.12 — El resaltado ocultaba el color aplicado

- Un clic físico en Aplicar color pintó 458675 texeles y protegió 7 compartidos,
  pero el relleno naranja con alpha 0.58 ocultaba visualmente el azul elegido.
  Ocultar temporalmente la selección confirmó el resultado en modelo y UV.
- El usuario eligió contorno y relleno tenue: alpha 0.08 en ambos paneles, con
  contorno del límite de las caras seleccionadas en el modelo y oclusión por profundidad.
- Solo cambian los overlays; selección, todas las imágenes y fingerprint de
  geometría/UV/rig permanecen idénticos. Revisión visual ejecutada en Blender.
- La regresión de redibujado comprueba relleno tenue, contorno opaco y caché.

### 0.1.11 — Pintar píxeles exclusivos sin aceptar superficies compartidas

- Tras una edición de malla, el caso vivo tenía 3069 texeles seleccionados y
  1445 compartidos con otra isla. El usuario eligió conservar los compartidos.
- exclusive_mask resta todos los texeles de caras no seleccionadas del mismo
  material, incluso caras de la misma isla parcialmente seleccionada.
- La interfaz rellena y pinta UV con máscaras exclusivas; el saneado de pintura
  nativa restaura también texeles compartidos. No se cambian UV ni materiales.
  Si no hay texeles exclusivos, se bloquea sin escribir imágenes.
- La API conserva su contrato anterior salvo al pedir exclusive=True.
- `tests/run_exclusive_live.py`: once comprobaciones en la malla editada real:
  1624 texeles exclusivos pintados y 1445 compartidos bit a bit intactos;
  demás superficies, geometría, UV, rig y selección preservados. Prueba restaurada.

### 0.1.10 — Pinceles visibles y Mayús explícito

- El atajo nativo de Image Paint con Mayús usa brush_toggle=SMOOTH. Pasar el
  evento al keymap activa Suavizar, no necesariamente el pincel elegido.
  Invocar image_paint explícitamente con mode=NORMAL y brush_toggle=None.
- Pincel UV exige también Mayús; el modelo sigue girando con izquierdo y el
  derecho conserva desplazamiento en los tres paneles.
- Menú con Pincel 3D, Pincel UV, Borrador, catálogo nativo Pinceles 3D y tamaño/
  intensidad. Catálogo verificado visualmente con miniaturas de Blender.
  Al cambiar de superficie se conserva el pincel nativo existente.
- `tests/run_shift_brush_live.py`: diez comprobaciones, trazo nativo que cambia
  píxeles, enrutado de Mayús, controles y restauración exacta de todos los píxeles.
  No equivale a una prueba física de Mayús con el ratón. Once regresiones de
  selección bidireccional adicionales pasaron en la escena abierta.

### 0.1.9 — Clic y arrastre sin bloquear selección bidireccional

- Causa: el controlador consumía el clic del modelo como giro, incluso sin
  movimiento; una liberación perdida dejaba view_drag activo y bloqueaba la UV.
- Separar clic de arrastre con umbral de cuatro píxeles; en SELECT el clic
  selecciona al soltar, mientras el arrastre gira sin tocar la selección.
  Cualquier nueva pulsación descarta un arrastre anterior atascado.
- `tests/run_click_selection_live.py`: 11 comprobaciones con rayos y UV reales
  del personaje abierto, incluido modelo→UV, UV→modelo, liberación perdida,
  movimiento pequeño, giro, geometría/UV/rig y todos los píxeles conservados.

### Desplazamiento en referencia y textura

- El derecho mueve también ambos IMAGE_EDITOR, con image.view_pan y signo
  inverso al delta para seguir el cursor. Esc restaura la posición de las imágenes.
- `tests/run_navigation_live.py`: 18 comprobaciones en Blender, con movimiento
  de ambas imágenes y conservación de geometría, píxeles e historial. View2D
  requiere redibujar con ventana, área y región explícitas para medir el cambio.

### 0.1.8 — Composición y redibujado sin cambiar el personaje

- Mezclar RGB de un atlas 2K completo generaba temporales grandes y acceso
  intercalado: 326 ms. Mezclar por canales y bloques de filas conserva exactamente
  la aritmética float32 y el alpha de base: 73 ms en la misma prueba.
- En el original abierto, composición completa: 451 ms antes y 204 ms después;
  los resultados son idénticos. No equivale a medir todos los gestos ni FPS.
- El resaltado UV reutiliza buffers GPU hasta cambiar geometría, selección,
  material, detalle o coordenadas de vista. Conserva colores y orden de dibujo.
- El arrastre derecho usa dx y dy en el plano de pantalla; conserva rotación,
  zoom, controles existentes, selección e historial. Izquierdo sigue orbitando.
- `tests/run_interactive_performance.py` verifica igualdad exacta, caché acotada,
  invalidación y ambos ejes del arrastre. En vivo: 22 imágenes sin cambios,
  geometría/UV/rig preservados y .blend sin guardar.
- La recarga cambia solo funciones concretas; no desregistra controles ni sale
  del modo de pintura. La instalación conserva los demás cambios del add-on.

### 0.1.7 — Navegación directa

- El controlador modal capturaba izquierdo para seleccionar/pintar; no había
  arrastre de navegación. Ahora izquierdo orbita, derecho desplaza verticalmente
  y Mayús + izquierdo conserva la herramienta activa. Gotero y botones conservan
  prioridad. La navegación solo modifica RegionView3D.
- Selector de seis ejes proyectado desde la rotación actual; reemplaza la botonera
  flotante. Esc restaura la vista previa al arrastre.
- `tests/run_navigation_live.py`: 12 comprobaciones en el Blender abierto,
  incluyendo geometría/UV/rig, píxeles, selección, herramienta e historial intactos.
  Eventos modales simulados; la comodidad del gesto requiere revisión del usuario.

### 0.1.6 — Caras, gotero en el modelo y vista cómoda

- La selección admite caras sueltas (`face-N`) además de islas UV; todo el motor
  (máscaras, solapes, relleno, pincel 2D/nativo, grupos) resuelve ambos con
  `core.island_of`. Una cara no cuenta como solape con su propia isla.
- Gotero del modelo: rayo sobre la malla evaluada, pesos del polígono, UV del punto
  y lectura de un solo texel (base protegida + capas visibles). También en UV.
- La rejilla de caras se dibuja con sesgo de profundidad hacia la cámara.
- Vista: subir/bajar y girar en Z, X e Y desde botones o flechas, sin tocar la malla.

### 0.1.5 — Pausas al aplicar color

- Perfil en Vale a 2048: detección de solapamientos 1.43 s, máscara seleccionada
  0.27 s y composición 1.73 s; se repetían para la misma selección y píxeles.
- Reutilizar máscaras exactas mediante LRU de 64 MiB y resultados de solapamientos
  por geometría, selección y resolución. Un refresco de geometría invalida las máscaras.
- Reutilizar la conversión lineal de bases protegidas e invalidar la vista previa
  cuando cambian imágenes/capas/material/visualización, no al volver a seleccionarlas.
- El margen de 16 píxeles conserva el mismo orden de competencia; solo propaga
  semillas que cambiaron y trabaja sobre píxeles vacíos cercanos a las islas.
- Prueba 2K de márgenes: 13.67 s → 5.32 s, con fuentes y destinos idénticos.
  72 regresiones exactas y 28 comprobaciones de costuras, pinceles y render pasaron.
- Mantener resolución, colores, alpha, protección de vecinos, capas y deshacer.
  La primera selección todavía puede requerir calcular máscaras; no prometer
  que cualquier operación a cualquier resolución es instantánea.

### 0.1.4 — Personaje y textura sincronizados

- Causa reproducida: el objetivo del complemento seguía siendo Lamine al elegir
  otra malla activa; PointerProperty no tenía actualización y una malla importada
  sin capas preparadas no tenía imagen de vista previa.
- Corrección: sincronizar elección, objeto activo e imagen de Base Color; aislar
  la malla solo en la vista local del editor. El mapa UV en modo Edición puede
  requerir update_from_editmode antes de leerse mediante Mesh.
- Malla y UV eligen la superficie de pintura, conservando selección y capas.
  El modo UV funciona sin activar ni capturar el pincel nativo de la vista 3D.
- Pruebas: tests/run_target_modes.py (8 comprobaciones), más 22 comprobaciones
  existentes de selección, materiales, preservación y exportación.
- Prueba en el original abierto: Vale tiene 304 islas y 114462 esquinas UV;
  su textura Tripo es de 2048 × 2048. Esto demuestra que tiene UV, pero no que
  coincidan con un modelo anterior sin comparar ambos archivos.
- La recarga debe convertir bpy_prop_array a tuple antes de desregistrar clases;
  no conservar referencias RNA temporales. No guarda el archivo Blender.

### 0.1.3 — Costuras entre islas UV

- Síntoma: líneas claras al rellenar regiones contiguas, especialmente el centro
  del rostro. La máscara acababa en el último centro de píxel interior a la UV.
- Causa: el filtrado bilineal mezclaba pintura con texeles transparentes de fuera
  de la isla y dejaba ver la base. El pincel nativo solo tenía 2 píxeles de margen.
- Corrección: margen de 16 texeles en capas de trabajo, con competencia entre
  todas las islas del material. No extender la máscara de selección ni la de
  detección de solapamientos. Los texeles de otra isla permanecen intactos.
- Borrado y deshacer deben actualizar o restaurar también el margen. Exportación
  y pinceles deben usar el mismo criterio, conservando alpha, originales y UV.
- Un fondo blanco opaco en una textura de delineado puede ser parte del original.
  No convertirlo automáticamente a piel o transparencia en todos los personajes:
  inspeccionar su contenido y aplicar solo la pintura autorizada.
- Pruebas y sus resultados: `tests/run_padding.py` y `evidence/padding-0.1.3.json`.

- 0.2.5 · Protector de labios en «Aplicar color» por caras: el relleno exacto
  creaba un material liso que ignoraba la máscara de labios y los tapaba (Hamibi,
  57 caras de boca). Ahora el material de relleno termina en «Relleno Protector
  Labios», que devuelve el original donde «Piel Borde Labios» está activo, y
  ace_fill.export_color hace lo mismo en el GLB. Verificado en vivo: render de
  boca y exportación con labios iguales al original (dif. máx. 0,0014).
  Pendiente: prueba de regresión automática en segundo plano.
- 0.2.6 · El protector de labios también protege las capas de pintura: Aplicar
  color por píxeles, pinceles y borrador. Cada capa entra con alfa × (1 − borde
  de labios) (piel.lip_guard), y core.composite hace lo mismo al exportar.
  Verificado en vivo con Hamibi: render y composición con los labios iguales al original.

- 0.2.7 · Labios de Hamibi: (1) costura UV en el centro del labio: la máscara se
  calculaba en espacio UV y los desenfoques veían texeles vacíos al borde de la isla
  (piel y labio a 0). piel.seam_close cierra labios y piel en 3D. (2) Labio de
  Tripo desplazado 2,2 mm a la derecha: piel.recentre_lips mide el centro por
  filas respecto a la boca y mueve color y máscara en 3D sobre «Piel limpia» (la
  imagen original no se toca) con sangrado al borde de isla; se informa en
  labios_centrado_mm. (3) La detección usaba material_index actual: las caras
  de «Caras exactas» dejaban de ser piel; ahora usa exact_base_slots. (4) El
  relleno por caras apagaba el shader de piel también en los labios y cada lado
  se veía distinto; cover_constant respeta el borde de labios. Verificado con
  render de cerca en Hamibi y 	ests/run_piel.py en Camila (PIEL OK).