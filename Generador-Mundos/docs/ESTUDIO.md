# Atlas · Estudio de lugares (SpanStories)

Estado vigente y cambios por versión: [ESTADO.md](ESTADO.md). Desde 0.2.0, la apariencia registrada en OSM tiene prioridad y los edificios singulares se identifican para revisión; los detalles sin referencia siguen siendo generados.

Generador de lugares para historias de SpanStories, inspirado funcionalmente en *Dokodemo Rokehan* y
*Haikei Gacha* (oyasumi-gamedev): **pones un lugar del mapa y lo construye en 3D**, con la luz
Trigun de SpanStories, líneas y tramas de manga, recorrido a pie y exportación por sectores para el visor.
Código propio: se estudiaron las técnicas descritas y el resultado visible de las referencias, sin copiar su código ni recursos.

- Arranque: `npm run dev` en `D:\Español\Generador-Mundos` → <http://127.0.0.1:5179/> (puerto fijo).
  En Claude Code: `preview_start atlas-estudio` (launch.json del espacio de trabajo).
- Atlas anterior (procedural/híbrido de Codex): <http://127.0.0.1:5179/atlas.html> (sin cambios).
- Todo se guarda en D: dentro del proyecto: capturas en `reports\estudio\`, paquetes en `exportaciones\`,
  cachés en `.geo-cache\`, temporales en `.trabajo\`.

## Modos

### Lugar real (mapa)
Buscar por nombre o «lat, lon», elegir un lugar de ejemplo o hacer clic en el mapa; tamaño 200 m–1 km; «Construir aquí».
Datos: OpenStreetMap (Overpass) + relieve (Mapzen Terrain Tiles) + **ciudad lejana de 2 km** (teselas OpenMapTiles de
OpenFreeMap, con su propio relieve). Atribución ODbL en la barra inferior y en las exportaciones.

### Escuela (gacha de colegio)
Tres tradiciones: **instituto español** (aulario en L, pabellón, pistas), **colegio latinoamericano** (pabellones en U con
galerías, patio cívico con cancha y mástil) y **escuela de estilo japonés** (bloque largo con torre-reloj, valla en azotea,
pista oval de atletismo, piscina, gradas). Opciones: nivel, plantas, campo, canchas, gimnasio, piscina, barrio.
La misma semilla da el mismo colegio. Plano 2D del recinto en el panel derecho.

### Colegio aquí (sobre el mapa real)
En «Lugar real», la sección **Colegio aquí** lista los recintos escolares de OSM: un clic sustituye el recinto por un colegio
generado, orientado con la entrada hacia la calle y sobre el relieve real. También «Colegio generado en el marcador».

## Arquitectura generada
Estilos por región y uso (`src/estudio/arq/styles.js`): madrileño clásico, residencial 60-80 (ladrillo), Eixample modernista,
andaluz encalado, colonial latinoamericano, barrio latinoamericano, oficinas, casa, edificio público, iglesia, nave, escuela
(3 variantes) y pabellón.

- Fachadas: plantas, crujías, zócalo (almohadillado), impostas, cornisa con ménsulas, pilastras, sillares de esquina,
  huecos con recercado (frontón, clave, orejas), carpintería con cuarterones, persianas, contraventanas, rejas (planas o de cajón),
  balcones de forja (individuales, corridos, con macetas), miradores, balcones coloniales de madera, aire acondicionado.
- Planta baja: portales (con montante o arco), comercios con rótulo, toldos (lisos/rayados), banderolas, faroles de pared,
  **soportales** (en plazas y también los modelados en OSM como «Simple 3D Buildings» con `min_height`), terrazas de bares.
- Cubiertas: azotea con pretil/balaustrada/barandilla, casetón, máquinas, depósitos (Latinoamérica), chimeneas, placas;
  mansarda con buhardillas; teja a cuatro aguas o dos aguas; bóveda (pabellones); pirámide, cúpula y bulbo de `building:part`;
  **templetes de esquina con cúpula** (Gran Vía, ensanches); **áticos retranqueados** con terraza en bloques modernos.
- Medianeras por alturas (por encima del vecino vuelve a haber huecos), fachadas curvas (chaflanes y rotondas) en tramos
  continuos, conjuntos uniformes en plazas mayores/de armas, iglesias con nave, rosetón, campanario, chapitel y cúpula.
- Calle: calzadas con bordillo de 15 cm y esquinas redondeadas, pasos de cebra, ejes, aceras, plazas de granito, parques,
  farolas (fernandinas/modernas/dobles), semáforos, bancos, papeleras, alcorques, coches aparcados (sedán, utilitario, furgoneta), paradas, metro, fuentes,
  estatuas; muros, vallas y setos; pistas con líneas (fútbol, baloncesto, tenis), atletismo con calles, piscinas con corcheras.
- Árboles: los GLB de Barcelona de SpanStories (sin modificar), instanciados con sombra recortada.

## Dibujo
Pase diferido propio: `SpanStories` (Luz25D + Trigun: plano de sombra con acento, sombra fría nunca negra, luz de borde,
contorno = relleno ×0,55), `Color`, `Color + líneas`, `Dibujo lineal`, `Líneas + trama` (trama de puntos por luz, color propio
y oclusión; negro en lo más oscuro; el fondo se aclara) y `Arcilla`. Ambientes: Mañana, Mediodía, Tarde, Nublado, Noche
(ventanas encendidas y estrellas). Oclusión ambiental en pantalla, sombras del sol, texturas procedurales sutiles
(ladrillo, sillería, baldosa, granito, adoquín, asfalto, césped, teja, pizarra).

## Cámaras y recorrido
Cámaras sugeridas por lugar (vista general, cenital, amplia, cruces con nombre a la altura de los ojos, calle central en
ojos/contrapicado/picado), objetivo en mm. Clic = marcador; **🚶 Explorar**: WASD, Mayús correr, ratón mirar, Espacio saltar,
V primera/tercera persona (avatar provisional), Esc salir. Colisión con fachadas, troncos y muros; sube bordillos.

## Exportación para SpanStories (`⇪ Exportar a SpanStories`)
`exportaciones\<lugar>\`: sectores `S_i_j.glb` de 50 m (coordenadas del mundo), estructura fusionada por categoría de
material (`userData.ssCategory` en extras), prefabs frecuentes instanciados (EXT_mesh_gpu_instancing con color por instancia),
`anclas.json` (árboles, bancos, terrazas, coches, estatuas: no se modelan), `sectores.json`, `lugar.json` y `LEEME.md`.
PNG del encuadre con `⇩ Exportar PNG` (2400 px).

## Rendimiento medido (GPU de escritorio, ventana del panel)
Madrid Gran Vía 300 m: 8–13 ms/fotograma. Madrid Chamberí 600 m con LOD de ventanas y balcones: 7,5–11,7 ms
(3,7 M triángulos con sombras; sin LOD eran 10,6 M). Construcción de un lugar: 0,5–1,8 s tras descargar los datos.

## Límites honestos
No es fotogrametría: alturas sin dato en OSM se estiman (🎲 «Alturas desconocidas»); estilos y huecos son una
interpretación por región. Sin interiores. Puentes (tablero, pretiles, pilas), escalinatas, cauces y vías de tren/tranvía tienen geometría genérica, sin ingeniería real; los túneles no se dibujan.
La ciudad lejana es volumétrica con ventanas dibujadas. El avatar es provisional. La exportación no comprime (Meshopt pendiente).

## Código (src/estudio)
`data/` (servicios, modelo de lugar, relieve) · `geom/` (Clipper, mallas, suelo) · `arq/` (estilos, edificios, elementos,
iglesias, calle, recinto, deportes, LOD ligero) · `render/` (material G-buffer, pase diferido, visor, cámaras, árboles, LOD,
recorrido) · `scene/` (lugar y entorno lejano) · `school/` (gacha de colegio y colegio sobre el mapa) · `export/` · `ui/`.
Servidor: `server/estudio-plugin.js` (capturas, exportaciones, relieve lejano) y `server/far-city.js` (MVT OpenFreeMap).
