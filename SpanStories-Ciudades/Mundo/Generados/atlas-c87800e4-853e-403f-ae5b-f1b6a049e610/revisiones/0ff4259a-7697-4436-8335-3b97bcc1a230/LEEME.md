# Barcelona · Passeig de Gràcia

Paquete autocontenido de Atlas 0.17.0. Abrir manifest.json con AtlasPackage.js en un anfitrión con Three.js compatible. El adaptador configura MeshoptDecoder, verifica SHA-256 y permite load/nearby/unload y resolveHit por ID. Las instancias comparten owner por edificio; estructura conserva _ENTITY_ID. Luz y acabado corresponden al receptor.

Todos los elementos visibles se incluyen. En anclas.json, embedded:true describe elementos ya incluidos (no volver a colocarlos); embedded:false marca el lugar y el id de origen de mobiliario no modelado (modo solo estructura) para colocar un GLB propio. proyecto.json conserva la fuente editable y los modelos originales. Sin cuantización, reducción de techos ni integración automática en el visor principal. Los sectores C_i_j_S_x_z de un área grande pueden compartir celda espacial: todos son parte del paquete, con IDs únicos.

Uso: const p = await new AtlasPackage().open(new URL("manifest.json", base).href); await p.nearby({x:0,z:0}); scene.add(p.group); const id = p.resolveHit(hit); p.dispose();

{"sectores":242,"triangulos":6203007,"bytes":219139720,"rawBytes":716120108}

[{"source":"OpenStreetMap contributors","license":"ODbL 1.0","url":"https://www.openstreetmap.org/copyright","licenseUrl":"https://opendatacommons.org/licenses/odbl/1-0/"},{"source":"Mapzen Terrain Tiles / USGS / EU-DEM y proveedores regionales","license":"Licencias de las fuentes de elevación; ver atribuciones completas","url":"https://registry.opendata.aws/terrain-tiles/","licenseUrl":"https://github.com/tilezen/joerd/blob/master/docs/attribution.md"}]
