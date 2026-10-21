# Continuación del aeropuerto en Sol

La especificación es `SpanStories_Airport_Architecture.md`, pero las instrucciones posteriores del usuario tienen prioridad: cámara fija de primera persona a altura de ojos, exterior 2D/2.5D con paralaje y pista solo aparente. No crear avión: el usuario aportará el suyo. No crear NPC 3D: se añadirán después. Priorizar el diseño visual con el menor coste posible; evitar dedicar tiempo excesivo a revisar la cámara.

## Estado implementado

- Visor Three.js r180 en `index.html` y `lab.js`: primera persona, cámara a 1,62 m, FOV 52°, arrastre para mirar, WASD/flechas para caminar. El visor ocupa toda la ventana y el panel de viaje se abre con «Viaje y opciones».
- Rutas completas de salidas D00–D06 y llegadas A00–A05, con portales alineados de 4 m. `PlayerController` aplica límites y colisiones básicas. `ZoneManager` conserva un único HIGH y hasta tres chunks.
- `AirportComponents.js` dibuja mobiliario y objetos pedagógicos mediante instancing: facturación, seguridad, pasaportes, tiendas, sala, embarque, equipaje, aduana y salida. Cinta de maletas, bandejas y puertas tienen movimiento barato. No hay personajes.
- `ExteriorIllusion.js` dibuja fondos de plataforma/calle, capa intermedia y vehículos planos; no hay pista geométrica ni vehículos 3D. `AirportChunk.js` añadió pasillos pintados detrás de los portales para ocultar chunks descargados. `ThreeResources.js` comparte materiales, atlas de señales, pantalla de vuelos y textura del pasillo.
- Audio ambiental opcional en `AirportAudioSystem.js`. Métricas, perfiles HIGH/STANDARD/ECO, prueba de recursos y exportación JSON en el panel.

## Verificación y pendientes

- `node --test tests/*.test.js`: 19/19 pruebas aprobadas tras las modificaciones recientes. Hay evidencia visual en el navegador local de la vista interior y el exterior plano; la última composición del panel completo y los pasillos se ha comprobado en ejecución.
- El test WebGL de ciclos de recursos calentó texturas compartidas y completó dos vueltas de la ruta de salidas sin error, regresando a D00. No tomarlo como test de FPS sostenidos.
- Falta una auditoría final de todos los criterios de la especificación y pruebas sostenidas en varios tamaños/calidades. No declarar terminado el plan completo sin esas verificaciones. Las mediciones históricas de `validation/` corresponden al primer blockout técnico.
- Cualquier mejora adicional debe centrarse en arte y composición visibles a altura de ojos, con siluetas, señales y capas pintadas de bajo coste. Preservar el avión original del usuario, el GLB de Samuel y otros proyectos.

## Ejecutar

Desde esta carpeta: `python serve.py`; abrir `http://127.0.0.1:8766/Aeropuerto/`. Ejecutar las pruebas con `node --test tests/*.test.js`.
