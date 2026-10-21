# SpanStories · Mundo

Visor/editor independiente de la ciudad Barcelona/Passeig de Gràcia. Reutiliza geometría del Blender guardado, Luz25D/PanelEstilo compartidos, editor del hotel, navegación/mediciones del aeropuerto y Samuel del aula. No modifica los proyectos de referencia.

Iniciar desde PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Español\SpanStories-Ciudades'
npm run dev
```

Abrir http://127.0.0.1:8767/?dev. `npm test` ejecuta las pruebas locales. Requiere WebGL2 y Python para servir archivos; Three.js, GLTFLoader y MeshoptDecoder están incluidos, sin CDN.

Editor: clic selecciona el nodo original; Opciones contiene búsqueda, sectores, posición/rotación/escala XYZ, importación GLB, deshacer/rehacer y guardado. Botón derecho gira, central desplaza y rueda acerca. Flechas mueven el seleccionado 25 cm; Mayús cambia a 1 m. Cada GLB añadido conserva nodos individuales y una raíz para mover todo el archivo. Exportar proyecto genera JSON portable con los GLB añadidos; guardar usa IndexedDB de este navegador/origen.

Primera/tercera persona: WASD o flechas, Mayús rápido, ratón/arrastre para mirar y Esc para volver a editor. Samuel se carga al entrar en tercera persona. Colisiones básicas círculo/AABB y terreno con pendiente; no simulan interiores complejos, gravedad o saltos.

Mundo/CONTRATOS.md explica cómo registrar países/ciudades/zonas y vincular personajes e historias por ID usando el Story Engine existente. No se ha construido el país ni historias nuevas.

Diagnóstico muestra FPS/frame time/calls/triángulos, bytes descargados, recursos y memoria estimada. La memoria es buffers únicos más texturas RGBA8 con mipmaps; excluye driver, CPU y caché. El tiempo de envío de render no es tiempo GPU. Comparar instancias activas/inactivas bajo misma cámara/calidad; no atribuir a Meshopt una reducción de VRAM. Los informes finales y capturas se guardan en reports/.

Barcelona actualizada desde el Blender guardado el 13/10/2026: 3.292 nodos exportados en nueve sectores; los GLB finales suman 229.366.900 bytes. Se conservan identidades, jerarquías, pivotes, geometría y materiales de origen; los intermedios no se cargan en el visor. La versión anterior está en `reports/barcelona-anterior-20261013/`.

Optimización de la ciudad ya importada: agrupación con BatchedMesh y WEBGL_multi_draw, instancias para geometría idéntica, recursos compartidos y carga progresiva por sectores. Los sectores lejanos se descargan de memoria tras 10 segundos; se conserva la selección y se restauran las ediciones al recargar. Vista general carga y mantiene los nueve sectores. Se mantiene el render individual cuando multi_draw no está disponible.

En la comparación con igual cámara/calidad, las llamadas de dibujo bajaron de 8.755 a 1.264 (85,6%); se conservaron los 11.913.362 triángulos renderizados, incluidos contornos. La vista general sigue siendo exigente: no se garantiza 60 FPS con toda la ciudad visible. La compresión sin pérdida reduce los nueve GLB de 229.366.900 a 82.851.653 bytes. Se verificó el primer sector en 5,5 segundos con caché vacía, 10 Mbps y 80 ms; el resto se carga progresivamente.

Preparación para alojamiento estático: [ONLINE.md](ONLINE.md). El proyecto continúa local; no se ha publicado. Evidencia: `reports/barcelona-optimization-ab-before.json`, `reports/barcelona-optimization-ab-after.json`, `reports/barcelona-optimization-persistence.json` y `reports/barcelona-online-network-final.json`. Las 60 pruebas locales pasan, incluida edición independiente, descarga/restauración, arranque y transporte comprimido. Se optimizó la revisión importada, sin volver a importar ni modificar Blender.
