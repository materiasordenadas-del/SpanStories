# Informe de la sesión · Atlas 0.11.0 · 24/10/2026

Fuente vigente: `D:\Español\Generador-Mundos` (puerto 5179). Se continuó 0.10.0 —incluido el modo «Zelda · SpanStories» que otro agente añadió después del respaldo 0.10.0— sin reiniciar nada. Respaldo previo verificado: `respaldo/versiones/0.10.0-previo-claude-visual-20261024T204338Z` (212 archivos, SHA-256).

Encargo: mejorar la generación procedural para crear lugares nuevos automáticamente y con corrección; probar lugares de Latinoamérica que no estuvieran en los ejemplos; centrarse en estructuras (sin coches, bancos ni lo que se sustituye por GLB); rendimiento para el visor propio; IDs para poder nombrar las cosas; mejoras visuales. Durante la sesión se añadió: **terreno con «altos y bajos»**, respaldos solo en `respaldo/` y este informe.

## 1. Qué hice

### Generación automática más correcta

| Mejora | Qué resuelve | Dónde |
|---|---|---|
| **Contexto urbano** | Detecta «centro histórico latinoamericano», «ciudad latinoamericana», «casco histórico» o «general» a partir de la propia fuente: templos, patrimonio etiquetado, plaza cívica, soportales («Portal de…»), monumentos con identidad y alturas conocidas. Se muestra en la leyenda y en «Datos». | `src/estudio/data/context.js` |
| **Alturas por contexto** | En Antigua casi todo salía de 4–6 plantas; ahora 1–2 (78 de 1 planta, 69 de 2). La mediana del vecindario ya no cuenta iglesias ni torres singulares. Las alturas registradas en OSM nunca se tocan. | `place-model.js` (`estimateHeights`) |
| **Relleno de manzanas** | Donde OSM no dibuja edificios, genera parcelas continuas a lo largo de las calles (frentes de 8–15 m en centro histórico). Rejilla de ocupación de 0,5 m: no invade edificios, calles, aceras, parques, plazas, agua ni árboles; descarta franjas de plaza (fondo contra calle/sendero o parque detrás) y solo actúa donde la cobertura de fachadas de la zona es < 75 % (Madrid y Panamá: 0 parcelas). Cada parcela: `gen:relleno:<id calle>:<i|d>:<metro>`, estable, marcada `inferred:true`, procedencia `inferido:relleno`. Interruptor en «Datos». | `src/estudio/data/infill.js`, `quality.js` |
| **Contornos con partes** | Si las partes 3D cubren < 60 % del contorno (Catedral de Oaxaca: solo torres; conjunto catedralicio de Antigua; Real Casa de Correos y 31 edificios más de Madrid), el contorno ya no desaparece: se dibuja con su altura (estimada si la registrada es la de la torre), retranqueado 12 cm para no compartir plano con las partes. | `place-model.js`, `buildings.js` |
| **Partes heredan identidad** | Las partes de un templo o edificio oficial heredan uso, patrimonio y Wikidata del contorno (siguen con su id). La mayor es la nave; torres y capillas en piedra sin comercios (Basílica de Panamá). | `place-model.js` |
| **Overpass con espejos** | Ante 429/5xx/tiempo agotado se reintenta en `overpass.kumi.systems` y `overpass.private.coffee` (Cusco fallaba con HTTP 502). Misma caché. | `server/geo-service.js` |
| **Relieve filtrado** | Respuesta a «altos y bajos»: era ruido del DEM (SRTM ~30 m que incluye copas y tejados), no del constructor. Filtro gaussiano σ = 18 m que **conserva las pendientes reales** (una cuesta constante queda idéntica) y quita los bultos de 40–80 m. Opciones: original / urbano 18 m / fuerte 30 m. Un DEM local del usuario no se filtra. | `data/terrain.js` (`smoothed`), `quality.js`, panel «Datos» |

### Mejoras visuales de estructuras

- **Templos con cubierta registrada** (p. ej. `roof:shape=round`) usan ya el generador de iglesias (portada, rosetón, contrafuertes, ventanas en arco) respetando la cubierta de OSM; antes salían como naves industriales con escaparates (Catedral del Cusco). Sin torres inventadas (política vigente de singulares).
- **Templos de más de 22 m de ancho: tres naves**, en bóveda o a dos aguas (central más alta, claristorio), con portadas laterales, ventanas altas y pilastras en la fachada (Cusco, Oaxaca).
- Relleno y alturas por contexto cambian sobre todo la silueta: Montevideo pasa de 54 a 101 edificios y Guanajuato de 81 a 175, con manzanas continuas.

### Rendimiento

| Medida (Puerta del Sol, misma cámara) | 0.10.0 | 0.11.0 |
|---|---|---|
| Llamadas de dibujo, vista general | 438 | **266 (−39 %)** |
| Llamadas, cruce a altura de ojos | 348 | **229 (−34 %)** |
| Llamadas, calle central | 234 | **161 (−31 %)** |
| Mallas en escena / geometrías en GPU | 834 / 697 | 432 / 403 |
| Triángulos, vista general | 1,22 M | 1,31 M (+7 %, ver límites) |
| Tiempo del relleno (Madrid) | 2,2 s (primera versión) | 0,06–0,1 s |

- **Fusión de variantes raras**: ventanas, balcones, arcos, rótulos… con ≤ 12 instancias se funden en una malla estática por sector de 100 m, con el color ya resuelto y `aId` = edificio + 1 (como los muros), así la selección y el `_ENTITY_ID` del GLB siguen funcionando. Escaparates y puertas no se funden (los usa «Comercios a 10 m»).
- **Solo estructura por defecto**: coches, farolas, bancos, papeleras, quioscos, aparcabicis, bolardos, paradas, semáforos y macetas desactivados (≈ −100 000 triángulos en Sol). Lo que OSM sitúa queda como **ancla con su id de OSM** en `anclas.json` (`embedded:false`, `pendiente:"modelo GLB del usuario"`) para colocar tus GLB. Árboles (ya son tus GLB) y estatuas/fuentes se mantienen. Todo se reactiva en «Qué construir».

### IDs para nombrar las cosas

Todo edificio dibujado tiene id estable: OSM (`osm:way:…`, `osm:relation:…`), partes con su propio id y `parent` hacia el contorno, parcelas de relleno `gen:relleno:…`, anclas con el id del nodo OSM. Aparecen en el desplegable del editor y se exportan en `entidades.json`/`_ENTITY_ID`.

## 2. Lugares probados (no estaban en los ejemplos)

Métricas completas en `reports/estudio/0.11.0/metricas-lugares-0.11.json`; capturas «antes»/«0.11» en la misma carpeta.

| Lugar | Edificios OSM | Relleno | Cobertura fachadas | Contexto | Llamadas | Triángulos | Construcción |
|---|---|---|---|---|---|---|---|
| Antigua Guatemala · Parque Central | 160 | 10 | 90 % | centro histórico latam | 164 | 0,68 M | 0,41 s |
| Cusco · Plaza de Armas | 71 | 16 | 84 % | centro histórico latam | 155 | 0,36 M | 0,40 s |
| Montevideo · Plaza Independencia | 54 | 47 | 60 % | ciudad latam (8 plantas conocidas) | 265 | 1,03 M | 0,50 s |
| Guanajuato · Jardín de la Unión | 81 | 94 | 39 % | centro histórico latam, 63 m de desnivel | 198 | 0,45 M | 0,49 s |
| Oaxaca · Zócalo | 56 | 21 | 80 % | centro histórico latam | 167 | 0,49 M | 0,32 s |
| Panamá · Casco Viejo | 189 | 0 | 93 % | centro histórico latam | 224 | 0,61 M | 0,48 s |
| Madrid · Puerta del Sol (control) | 408 | 0 | 95 % | general | 275 | 1,11 M | 1,04 s |

Defectos encontrados y corregidos con estos casos: alturas excesivas (Antigua), manzanas vacías (Montevideo, Cusco, Guanajuato), casas sobre el pavimento de la Plaza de Armas (Cusco), parcelas dentro de la Real Casa de Correos (Madrid), Catedral de Oaxaca desaparecida, Basílica de Panamá dibujada como bloques genéricos, Catedral del Cusco como nave industrial, HTTP 502 de Overpass.

## 3. Verificación

- **78 pruebas aprobadas** (`reports/estudio/0.11.0/pruebas.txt`), 6 nuevas en `tests/estudio-infill.test.js`: el filtro conserva planos y quita bultos; detección de centro histórico; relleno con ids estables sin solapes ni invadir calzada; respeto de parques y de frentes completos; proyectos antiguos sin relleno ni filtro; contornos sustituidos bloquean el relleno.
- Compilación correcta (`compilacion.txt`; persiste el aviso conocido de tamaño de Three.js).
- Comprobación visual a pie de calle y en vista general de los siete lugares.

## 4. Lo que falta y límites reales

1. **El relleno es una inferencia.** No distingue un solar, aparcamiento o patio no cartografiado de un edificio que falta en OSM; puede poner fachadas donde hay un descampado. Está señalado (`inferred`, `gen:relleno:`) y se desactiva en «Datos». Esquinas: a veces quedan huecos de 1–4 m entre parcelas de dos calles. Fondo de parcela rectangular, sin patio propio.
2. **Relieve:** queda una ondulación amplia de ±2 m a escala de ~100 m que el DEM no permite separar del terreno real. Para un lugar concreto, «Filtrado fuerte» o un DEM local. El contexto lejano (2 km) usa su propio relieve sin filtrar: puede haber escalones de ~1 m en el borde.
3. **Triángulos +7 %**: las variantes fundidas no tienen versión lejana. Si el visor de destino está limitado por triángulos en vez de por llamadas, bajar `max` en `bakeRare` o añadir LOD a las fusionadas.
4. **Barandillas de forja lejanas** se ven como bandas oscuras (sin antialiasing en el G-buffer). No se tocó.
5. **Monumentos:** sin torres ni cúpulas inventadas; las torres cartografiadas como partes reciben estilo «Edificio público» con ventanas genéricas, y edificios como la Real Casa de Correos siguen sin su ladrillo y piedra reales. Sin variantes regionales finas del estilo colonial (piedra inca del Cusco, cantera verde de Oaxaca, balcones de madera limeños).
6. **No verificado en esta sesión:** exportación completa de un paquete con las anclas nuevas (`embedded:false`), y el relleno en el modo por sectores de áreas > 1 km. El código pasa por el mismo modelo efectivo, pero no se ha ejecutado una exportación ni un recorrido por sectores.
7. Las recargas en caliente de Vite durante la sesión recargaron también tu pestaña del Atlas (la que tenía el Acueducto de Segovia); mis pruebas se hicieron después en otra pestaña con `autoguardado=0`.

## 5. Archivos

Nuevos: `src/estudio/data/context.js`, `src/estudio/data/infill.js`, `tests/estudio-infill.test.js`, `docs/INFORME_SESION_0.11.0.md`, `reports/estudio/0.11.0/`.
Modificados: `server/geo-service.js`, `src/estudio/data/{place-model,quality,terrain,appearance-policy}.js`, `src/estudio/arq/{buildings,church,instances,street}.js`, `src/estudio/scene/place-scene.js`, `src/estudio/export/spanstories.js`, `src/estudio/ui/data-panel.js`, `src/estudio/main.js`, `package.json` (0.11.0) y la documentación vigente.
Movidos a `respaldo/`: `documentacion-0.10.0/INFORME_CHAT_20261024.md` (informe del chat anterior) y `evidencias-0.11.0-intermedias/` (capturas de iteraciones superadas y diagnósticos).

URL útiles: `?relleno=0` desactiva el relleno y `?relieve=0` (o `30`) cambia el filtro al abrir. Proyectos anteriores conservan sus datos, alturas y opciones guardadas (con coches, farolas y mobiliario si los tenían): relleno y filtro solo se activan si se eligen en «Datos». Lo único que cambia al reabrirlos es la representación de templos con cubierta registrada o de más de 22 m de ancho, y la fusión de variantes raras (mismo aspecto, menos llamadas). Los contornos con partes parciales y el contexto de alturas se aplican al construir un lugar de nuevo desde OSM.
