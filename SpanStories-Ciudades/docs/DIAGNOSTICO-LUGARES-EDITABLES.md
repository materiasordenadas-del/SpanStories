# Diagnóstico: lugares del Generador editables en el Editor de escenarios

Fecha: 15/11/2026 · Rama local `atlas/lugares-editables`.

## 1. Síntoma

En `/escenarios?modo=editor`, los lugares publicados por el Generador de mundos («Escuela generada», «Barcelona · Passeig de Gràcia» generado) no se podían editar. Se podía seleccionar un elemento y encuadrarlo, pero no moverlo, girarlo, escalarlo ni ocultarlo. Barcelona y Madrid, hechas a mano, sí se editaban.

## 2. Causa

1. **El motor no montaba el editor en estos lugares.** En `SpanStories-Ciudades/main.js`, la rama `if(!aprendizaje&&manifest.atlas)` solo montaba `atlasSourcePanel` (en `engine/AtlasPlaces.js`): una lista de elementos con un enlace al Generador. `montarEditorCiudad` (en `engine/CityEditor.js`) quedaba en la rama `else`, así que en un lugar Atlas `editor` era `null`.
2. **Los elementos no son nodos.** `AtlasAssets.prepare` (en `engine/AtlasPlaces.js`) registra cada elemento como un `Group` vacío con `userData.atlasBounds`, sin geometría. Lo que se dibuja es la geometría fundida del sector. Por eso `EditorGizmo.js` rechazaba estos proxies (`!root.userData.atlasBounds`).
3. **El Generador funde a propósito.** `Generador-Mundos/src/estudio/export/spanstories.js` (`exportGroup`) reparte la geometría en celdas de 50 m (`SECTOR=50`) y, dentro de cada celda:
   - **Estructura** (`splitStatic`): junta los triángulos de todos los edificios, calles y suelo en **una malla por categoría** (`estructura_arquitectura`, `_cristal`, `_terreno`…). Se exporta **no indexada** y conserva la identidad de cada triángulo en el atributo por vértice `entity_id`, que el GLB guarda como `_ENTITY_ID`.
   - **Repetidos** (ventanas, balcones, árboles, farolas, bancos…): un `InstancedMesh` por prefab y parte, con `userData.instanceEntityIds`, que es el dueño de cada instancia. Si hay menos de 12 en una celda (`BAKE_BELOW`), se «hornean» dentro de la estructura con su `entity_id`.
   - **Comercios y rótulos** (`splitCommerce`): instancias con `instanceEntityIds`, o malla con `entity_id`.
   - **Modelos GLB de edificios** (`building-model-root`): nodos propios.
   - `entidades.json` / `zona.json.entities` traducen cada número de entidad a su id, por ejemplo `gen:edificio:1`.

   Fundir sirve para tener **pocas llamadas de dibujo** y **sectores pequeños**: así un lugar de miles de elementos puede verse en el navegador.

## 3. Mediciones de las revisiones publicadas

Medido leyendo todos los GLB con `@gltf-transform` + Meshopt (sin pérdida).

| | Escuela generada | Passeig de Gràcia (generado) |
|---|---:|---:|
| Sectores GLB | 36 | 242 |
| Tamaño | 26,0 MB | 209,0 MB |
| Triángulos | 498 525 | 6 203 007 |
| Llamadas de dibujo (primitivas) | 356 | 3 787 |
| Entidades en el manifiesto | 380 | 3 106 |
| Primitivas fundidas (con `_ENTITY_ID`) | 109 | 808 |
| Primitivas instanciadas (con `instanceEntityIds`) | 247 | 2 979 |
| Instancias | 4 181 | 61 583 |
| Primitivas **sin** identidad | 0 | 0 |
| Entidades con parte fundida | 179 | 1 844 |
| Entidades con instancias | 258 | 2 091 |
| Entidades con ambas (estructura + ventanas…) | 63 | 1 120 |
| Entidades por primitiva fundida (media / máx.) | 3,4 / 14 | 5,7 / 58 |
| Mayor malla fundida (vértices) | 26 529 | 92 775 |
| Primitivas indexadas | 0 | 0 |

Conclusión clave: **el 100 % de la geometría publicada conserva la identidad del elemento**, por vértice o por instancia, y nada está indexado. Por eso un elemento se puede separar de lo fundido **sin pérdida**: mismos vértices, normales, colores, superficie, UV, material y contorno.

## 4. Opciones

| Opción | Calidad | Rendimiento | Generador | Revisiones publicadas | Veredicto |
|---|---|---|---|---|---|
| **a) Separar al editar, en el visor.** Las instancias recalculan su matriz; los triángulos fundidos del elemento se copian a una «pieza» con su mismo material y contorno, y en la malla fundida quedan con área cero. | Idéntica: los mismos datos y el mismo material | Sin coste si no se edita. Cada elemento separado añade 2 llamadas (pieza + contorno) | Sin cambios | Funcionan todas, sin volver a publicar | **Elegida** |
| b) Exportar cada elemento como nodo propio | Idéntica | Escuela: de 356 a ~1 000 llamadas. Passeig de Gràcia: de 3 787 a ~10 000+ (3 106 entidades × categorías), y un GLB más pesado. El motor tendría que volver a fundir con `CityBatches`/`CityMultiBatches`, que no se usan con Atlas | Cambia el formato y todos los consumidores (`package-loader`, `package-preview`, `AtlasPackage.js`) | Habría que volver a publicar cada lugar | Descartada: empeora el caso común (ver) para mejorar el raro (editar) |
| c) Híbrido: exportar separado solo lo marcado como editable | Idéntica | Intermedio | Hay que cambiar el exportador y la interfaz del Generador | Hay que volver a publicar | Innecesaria: (a) da lo mismo sin tocar el Generador |

La opción (a) es en la práctica un híbrido en tiempo de ejecución: **fundido para dibujar, separado solo lo que se edita**.

## 5. Coste medido de la solución

Prueba con la mayor malla publicada (92 775 vértices, 58 entidades, 6 atributos):
- Separar un elemento la primera vez: **≈ 51 ms**, una sola vez por malla, al empezar a moverlo. Incluye indexar los triángulos por entidad.
- Cada fotograma mientras se arrastra: **≈ 0,07 ms**, porque solo cambia la matriz de la pieza.
- Volver a unirlo (deshacer hasta la posición original): **≈ 8 ms**.
- Memoria: la pieza duplica solo los vértices del elemento, y se guarda una copia de sus posiciones originales para poder deshacer.
- Un lugar sin ediciones no reserva nada: ni copias, ni piezas, ni cambios de vértices (cubierto por una prueba).

## 6. Diseño implementado

- `engine/AtlasEdicion.js`: `aplicarEnSector`, `restaurarSector`, `EdicionAtlas` y `cajaEditada`. La edición de un elemento es la transformación de su proxy en coordenadas del mundo respecto a su posición publicada (identidad = sin cambios).
- `engine/AtlasPlaces.js`:
  - `AtlasAssets` mete los proxies en la escena (grupo `atlas-elementos`) y los enlaza con `EdicionAtlas` mediante `instanceBinding.sync/bounds`, el mismo contrato que usan las instancias editables de Barcelona (`CityEditor.aplicarObjeto` → `instanceBinding.sync()`).
  - Cada sector que llega o vuelve por streaming recibe las ediciones vigentes (`aplicarSector`).
- `engine/VegetacionAtlas.js`: al cambiar de especie, retira las ediciones del sector, sustituye los árboles y vuelve a aplicarlas. Así un árbol movido sigue movido con otra especie.
- `main.js`:
  - `montarEditorCiudad` también se monta en lugares Atlas, en su propio contenedor, sin borrar el panel del lugar ni el de árboles.
  - Se guarda en IndexedDB `spanstories.ciudades.editor` con la clave `atlas:<lugar>:<revisión>`: otra versión del lugar no hereda movimientos ajenos.
  - Al descargar un sector, sus ediciones pasan a `pending` y se vuelven a aplicar al volver.
  - La caja de selección, el encuadre y las colisiones usan la caja editada.
- `engine/EditorGizmo.js`: acepta proxies `atlasEditable` y coloca el gizmo en el centro de la caja editada.

## 7. Límites conocidos

- El movimiento se guarda en este navegador (IndexedDB), igual que en las ciudades manuales. **No se escribe en el proyecto del Generador.** Si el lugar se vuelve a publicar, la nueva revisión empieza sin ediciones, y la anterior las conserva.
- Las ventanas y otros repetidos de un edificio se mueven con él porque comparten dueño. Un repetido «horneado» (menos de 12 por celda) también, porque lleva el `entity_id` del edificio.
- Las colisiones de un elemento movido usan su caja transformada (aproximada si se gira).
- No se ha verificado en el navegador desde esta rama: el visor vivo ocupa los puertos y las reglas no permiten abrir otro.
