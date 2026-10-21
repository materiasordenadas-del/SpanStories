# Visor y Mundo — subida del 21 de octubre de 2026

- `SpanStories-Ciudades/`: visor/editor, código, Mundo, ciudades y recursos actuales. Origen: `D:\Español\SpanStories-Ciudades`.
- `worlds/`, `content/worlds/`, `features/worlds/` y `scripts/worlds/`: escenarios, biblioteca de personajes y catálogo por país. Origen: `D:\Español\SpanStories`.
- Los modelos GLB y sus versiones gzip se conservan directamente en Git, sin requerir Git LFS. El mayor archivo del conjunto tiene menos de 63 MB.
- Se excluyen pruebas, informes, capturas de validación, experimentos, respaldos anidados, modelos intermedios, archivos Blender, dependencias, cachés, distribución generada y ZIP. No se modificaron los archivos fuente locales.

## Uso

Catálogo y escenarios: consultar `worlds/README.md`; ejecutar `npm run worlds:serve` desde la raíz.

Visor de ciudades: desde `SpanStories-Ciudades`, ejecutar `npm run dev:source`. Para generar la distribución online, consultar `SpanStories-Ciudades/ONLINE.md`.

## Verificación previa en el proyecto local

- Visor: 128 pruebas correctas.
- Relay: 5 pruebas correctas.
- Catálogo: 8 pruebas correctas.
- Las suites se ejecutaron localmente y sus archivos no forman parte de esta subida, por indicación del usuario. Los comandos de pruebas de los proyectos fuente requieren dichas suites locales.
- El control histórico `worlds:check -- --migration` detecta diferencias previas en ocho archivos del aeropuerto: `engine/AirportChunk.js`, `engine/ExteriorAnimals.js`, `engine/ExteriorIllusion.js`, `engine/PlayerController.js`, `engine/ThreeResources.js`, `index.html`, `lab.css` y `lab.js`. Se conservó el contenido actual sin reescribir el inventario histórico ni atribuir estas diferencias a una causa no comprobada.
- No se realizó un despliegue web ni una nueva revisión visual; esta entrega conserva los archivos existentes.
