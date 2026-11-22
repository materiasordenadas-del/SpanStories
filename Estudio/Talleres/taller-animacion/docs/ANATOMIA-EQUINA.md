# Articulaciones equinas del Taller

Revisión del 18/11/2026. Perfil de edición de Rocinante, no modelo veterinario de simulación muscular.

## Causa comprobada

Se inspeccionaron las cabezas, colas y relaciones de los huesos del archivo `Personajes/rocinante/fuentes/Rocinante.blend` en Blender en segundo plano, sin guardar, y se contrastaron con el GLB cargado en el Taller.

Auto-Rig Pro divide la tibia y el antebrazo en dos mitades de deformación: `thigh_twist` y `thigh_stretch`. El origen de `thigh_stretch` está en medio del segmento, no en el codo ni en la rodilla. El editor anterior lo trataba como una articulación independiente y dejaba `thigh_twist` siguiendo al segmento proximal.

| Articulación | Nodo original ARP, lado izquierdo | Altura en la referencia GLB |
| --- | --- | --- |
| Hombro | `c_thigh_b_dupli_001.l` | 0,980 m |
| Codo | `thigh_twist_dupli_001.l` | 0,730 m |
| Carpo | `leg_stretch_dupli_001.l` | 0,480 m |
| Menudillo anterior | `foot_dupli_001.l` | 0,160 m |
| Control distal anterior | `toes_01_dupli_001.l` | 0,100 m |
| Cadera | `c_thigh_b.l` | 0,940 m |
| Rodilla posterior | `thigh_twist.l` | 0,700 m |
| Corvejón | `leg_stretch.l` | 0,490 m |
| Menudillo posterior | `foot.l` | 0,170 m |
| Control distal posterior | `toes_01.l` | 0,100 m |

El antiguo punto de «codo» estaba a 0,605 m y el de «rodilla» a 0,595 m: ambos eran los comienzos de las mitades `stretch`. Son medidas del personaje estilizado, no medidas de un caballo real. Los nombres canónicos `upperArmL`, `lowerArmL`, etc. son alias de compatibilidad; no determinan la anatomía.

La corrección usa el origen proximal `thigh_twist` como pivote, cuelga de él tanto la mitad `stretch` como la siguiente articulación, y mantiene rígidas las mitades del mismo segmento. Se ajustó también el retargeting de `HorseMotion`. Las matrices de enlace, geometría, pesos, archivos GLB y `.blend` originales se conservan.

Los clips nativos v2 se leen a través de su jerarquía anterior y se convierten en memoria antes de mezclarse. Esa conversión conserva sus matrices. Al evaluar la animación se corrige además la deformación antigua: ambas mitades de antebrazo/tibia comparten el giro del segmento completo, se recuperan las longitudes de referencia y se conserva el objetivo animado del menudillo/casco dentro del alcance. Esto corrige el quiebre que aparecía al conservar literalmente las transformaciones antiguas. Las exportaciones y los nuevos clips usan v3. La información de compatibilidad sobrevive a clonar el personaje. No se reescriben los clips existentes para migrarlos.

## Capa compartida por IK y FK

`src/core/anatomical-constraints.js` registra articulaciones, ejes locales y pose de referencia. El editor aplica la misma proyección de cuaterniones en FK y dentro de las iteraciones IK. Los humanoides siguen usando sus restricciones anteriores.

- Modos **Anatómico**, **Estilizado** y **Libre** en **Rig → Anatomía**, persistidos en el documento y el enlace. Estilizado amplía las envolventes; Libre permite editar sin esta capa.
- Bisagra del codo y movilidad secundaria restringida en rodilla, carpo, corvejón y extremos distales. Descomposición swing-twist, sin recortar Euler globales.
- Longitudes y escalas de los miembros preservadas frente a las ediciones, objetivos fuera de alcance limitados y protección contra invertir el plano de flexión.
- Resistencia suave durante el giro interactivo. La proyección que usa el solver es idempotente para conservar el emparejamiento IK/FK.
- Relación rodilla–corvejón obtenida de 25 muestras de los centros articulares del clip activo. Se conserva la pose base, se admiten pequeñas diferencias y se omite la relación si la referencia no contiene variación suficiente. Es una aproximación de edición al aparato recíproco, no una relación musculotendinosa validada.
- Colisiones aproximadas con cápsulas de miembros distales y tronco; se toleran las intersecciones ya presentes en la animación original. No sustituyen una superficie muscular ajustada.
- Se conserva el sistema de anclas y mezcla IK/FK. Si un objetivo no es alcanzable con las restricciones, queda un residuo informado en `controles`; el objetivo IK no se hace pasar por la articulación resuelta.

Las envolventes numéricas de `PROFILES` son valores conservadores de edición respecto a este rig. **No son límites fisiológicos absolutos ni los ROM de locomoción de las tablas científicas.** Una pose base que los supera se conserva; se restringen las correcciones nuevas. Hace falta calibración especializada para certificar esos límites como biomecánicos.

Como referencia terminológica se consultaron los capítulos de [miembro anterior](https://open.lib.umn.edu/largeanimalanatomy/chapter/thoracic-limb-forelimb/) y [miembro posterior](https://open.lib.umn.edu/largeanimalanatomy/chapter/pelvic-limb/) de CVM Large Animal Anatomy. Las conclusiones sobre los pivotes de Rocinante proceden de la inspección de sus archivos, no de inferir coordenadas de esas fuentes.

## Controles y límites del rig

En estilo Puntos: círculos = articulaciones, cuadrados huecos = objetivos IK, rombos violetas unidos por una línea = polos auxiliares. El círculo permanece en el pivote incluso si el objetivo no llega. `controles` devuelve ambos por separado; `anatomia` informa ejes, modo, límites y disponibilidad de calibración. Los controles seleccionados muestran verde/amarillo/rojo según el estado del límite.

El esqueleto exportado no contiene una escápula independiente con deslizamiento, articulaciones separadas de cuartilla e interfalángica distal, ni una cadena de vértebras cervicales independientes. El punto «Casco» es un control distal compuesto, no prueba de una articulación interfalángica distal independiente. El cuello tiene un límite por control y conserva las ramas de deformación existentes; no se inventaron vértebras. La mandíbula se expresa mediante morphs faciales. Añadir esos grados de libertad reales requeriría ampliar el rig y calibrarlo, fuera de esta corrección del Taller.

## Verificación

- Suite completa y pruebas específicas de GLB/FBX real. Resultados de la ejecución final en `reports/anatomia-tests.log`; compilación en `reports/anatomia-build.log`.
- `tests/anatomical-constraints.test.js`: GLB real de Rocinante, pivotes frente a mitades de segmento, compatibilidad v2 y clonación, reparación de la deformación v2, restricciones FK/IK, longitud, alcance, independencia de otras patas, evaluación determinista, IK/FK y modo en URL; además, caminata FBX real sin separar las mitades de deformación.
- Compilación Vite correcta.
- Taller abierto con el enlace del usuario: prueba IK→FK y FK→IK en los fotogramas 0, 10, 18 y 30, después de reparar los segmentos. Diferencia máxima entre los 25 puntos: 0,00000134 m. Error máximo de alineación de las mitades sobre el segmento completo: 0,000000129 m. Resultados en `reports/anatomia-validacion-viva.json`. El documento original se restauró en memoria, conservando sus 7 pistas y 9 claves.
- Revisión visual en 5189; no se ha comprobado este cambio dentro del Estudio incrustado ni se ha certificado contra captura de movimiento veterinaria.

## Galope con jinete · 18/11/2026 (segunda revisión)

**Carpo, rodilla y corvejón congelados (causa principal del movimiento pobre).** Los FBX de Horse Animset Pro (Biped de 3ds Max) guardan esas bisagras solo en la curva Z de `Lcl Rotation`; X e Y tienen una clave. El `FBXLoader` de three r180 toma los tiempos del eje X y descartaba el resto: en paso, trote, galope y saltos el carpo, la rodilla y el corvejón quedaban fijos (en `H_Canter` no, porque sus tres ejes tienen claves). `src/io/FBXLoaderEjes.js` remuestrea los tres ejes sobre la unión de tiempos y lo usan Animales y los scripts de `reports/`. Con él, el carpo del galope llega a −118° en la fase aérea. Los clips humanos siguen con el lector original.

**Ajuste de apoyo sin inversiones.** `solveHorseLeg` ya no es FABRIK libre: conserva el ángulo animado del carpo/corvejón, resuelve codo/rodilla de forma analítica en su plano y del lado en que ya se doblaba, y solo abre la articulación distal hasta su apertura de reposo si el casco no alcanza. Antes el apoyo doblaba el carpo hacia delante (hasta +34°). En la corrección de suelo durante el vuelo se conserva la orientación animada del casco (antes se enderezaba y el menudillo se invertía).

**Tamaño real.** Tripo exporta los personajes a 1 m. `SpanStories-Ciudades/Mundo/Personajes/personajes.json` guarda `alturaM` (Don Quijote 1,85; Rocinante 2,0 hasta la cabeza, `alturaCruzM` 1,49) y `/ecosystem/characters` lo devuelve. La vista de Animales escala el caballo y el jinete a esas medidas; los GLB no cambian. `HorseMotion.world` conserva la escala de reposo de cada hueso para que un caballo escalado no se encoja.

**Jinete.** Los clips `Rider_*` se reproducen sin tocar. Como en Horse Animset Pro, van referidos a un punto de montura fijo al hueso que lleva la silla (`spine`): el asiento se mide en la silla en reposo (punto más bajo entre perilla y borrén), la altura de pelvis sobre la silla sale de la malla del propio jinete y la media de su cadera en el clip se calibra una vez. Cada fotograma la pelvis sigue la traslación y la rotación de la silla. El motor del Taller coloca los esqueletos en coordenadas de mundo (el contenedor solo escala), por eso el asiento se aplica a la pelvis evaluada. Montar y desmontar siguen usando `montura` del `_animal.json`.

Pendiente: los estribos de Rocinante quedan más bajos que los pies del clip de galope (el jinete de Malbers va en dos puntos); no hay IK de pies a estribos, por decisión de no rehacer la animación del jinete.

## Escena montada y correcciones del galope · 18/11/2026 (tercera revisión)

**Patas que cruzaban por delante del pecho.** El hueso «Pelvis» del Biped gira hasta 19° de guiñada y 34° de alabeo alrededor de sus caderas, mientras su columna se mantiene nivelada. En Rocinante ese giro se aplicaba alrededor de `root.x` (25 cm por delante de las caderas) y además movía columna y pecho: la raíz de las patas oscilaba hasta 8 cm de lado a lado. Ahora la grupa gira alrededor del centro de las caderas y el tronco sigue a la columna del FBX. Además, ningún casco se acerca a la línea media más del 60 % de su separación de reposo (el FBX lleva la mano derecha casi al centro en el apoyo).

**Cabeceo del tronco.** El tronco del Biped cabecea unos 30° por tranco; con el hueso `spine` de Rocinante 0,45 m bajo la silla, la silla basculaba 23 cm. Se conserva el 50 % (`HorseMotion.trunkPitch`).

**Pretal.** La silla y el pretal son una malla rígida en `spine`; el pretal atravesaba el pecho. `src/core/horse-tack.js` la convierte en memoria en malla con piel: la parte delantera hereda los pesos de la superficie del cuerpo que tiene debajo (hombros, pecho, base del cuello); la silla sigue rígida. Error de reposo 2·10⁻⁷ m.

**Jinete.** Se equilibra: la pelvis sigue toda la posición de la silla, el 35 % de su cabeceo y el 55 % de su rebote (elevada para no atravesarla en el punto más alto); el tronco, el 10 %. Movimiento de la cabeza de Don Quijote en el galope: de 50 a 17 cm adelante-atrás y de 28 a 14 cm arriba-abajo.

**Riendas.** Del aro dorado del bocado (localizado por el color de la textura, en el espacio del hueso `head`) a las manos, con caída de rienda floja y el sobrante entre las manos.

**Clips del jinete.** El lector corregido rellena con su valor de reposo los ejes que no tienen curva: `Rider_Mount_Dismount_*` traía antebrazos y piernas con una pista `[0]` y la pose salía NaN (el jinete desaparecía). El paquete «Jinete (Horse Animset Pro)» se lee con `FBXLoaderEjes` y usa la clave de caché `v7j|`, así que se vuelve a convertir una vez. El resto de paquetes humanos no cambia. Prueba: `tests/fbx-ejes.test.js`.

**Escena «galope, salto y desmonte»** (Biblioteca › Animales, botón; `taller.animales.escena({...})`). Solo clips existentes: `H_Gallop`+`Rider_Gallop` 3,6 s → `H_Jump_Gallop`+`Rider_Jump_Gallop` sobre una valla → galope → `H_Canter` → `H_Trot` → `H_Walk` → `H_Walk_End_L` → `H_Idle_01` → segunda mitad de `Rider_Mount_Dismount_Left` (1,7–3,4 s) → de pie. Fundidos de 0,3 s del caballo y del jinete. Avance: velocidad sin deslizamiento en aires cíclicos; en salto y parada, avance del FBX suavizado (el `Root` del salto está en escalones). La valla se coloca donde los cuatro cascos van más altos, con el larguero al 70 % de esa altura. El desmonte parte del asiento y termina con los tobillos a su altura de reposo; su trayectoria se orienta al lado del nombre del clip, porque la conversión del Taller gira 90° la traslación de esos clips. Ningún casco atraviesa el suelo en toda la escena. No se guarda en el documento.

Pendiente: pies del jinete en los estribos (no hay IK de pies; decisión de no rehacer su animación), comprobación dentro del Estudio, y el editor IK/FK del caballo con estas correcciones.
