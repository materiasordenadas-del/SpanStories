# Escuela generada

Paquete autocontenido de Atlas 0.16.1. Abrir manifest.json con AtlasPackage.js en un anfitrión con Three.js compatible. El adaptador configura MeshoptDecoder, verifica SHA-256 y permite load/nearby/unload y resolveHit por ID. Las instancias comparten owner por edificio; estructura conserva _ENTITY_ID. Luz y acabado corresponden al receptor.

Todos los elementos visibles se incluyen. En anclas.json, embedded:true describe elementos ya incluidos (no volver a colocarlos); embedded:false marca el lugar y el id de origen de mobiliario no modelado (modo solo estructura) para colocar un GLB propio. proyecto.json conserva la fuente editable y los modelos originales. Sin cuantización, reducción de techos ni integración automática en el visor principal. Los sectores C_i_j_S_x_z de un área grande pueden compartir celda espacial: todos son parte del paquete, con IDs únicos.

Uso: const p = await new AtlasPackage().open(new URL("manifest.json", base).href); await p.nearby({x:0,z:0}); scene.add(p.group); const id = p.resolveHit(hit); p.dispose();

{"sectores":36,"triangulos":498525,"bytes":27213048,"rawBytes":54484832}

[]
