# Referencias de imagen por Sense

`bindings.json` es la única fuente editorial de este sistema. No contiene
imágenes: cada entrada es una `SenseImageBinding` con una URL externa por
candidato (Openverse, Wikimedia Commons, ...), su licencia y su atribución.
SpanStories nunca descarga ni redistribuye el archivo — el lector enlaza
directamente al proveedor.

Flujo editorial:

```bash
npm run lexical-media:find-candidates -- "gato"
```

Busca candidatos en los proveedores soportados e imprime un JSON con
`remoteImageUrl`, `thumbnailUrl`, `sourcePageUrl`, `creator`, `license`,
`licenseUrl` por cada uno.

El curador elige un candidato, le añade `rank`, `status` y `altText`, y lo
agrega a mano a `bindings.json` bajo el `senseId` correspondiente
(`SENSE-A1-NNNNNN`). Puede añadir 2–3 candidatos por Sense (`rank` 1, 2, 3...)
como cadena de respaldo si una URL deja de resolver.

Después:

```bash
npm run lexical-media:build
```

Valida `bindings.json` y regenera `generated/lexical-media/a1/images.json`,
que es lo único que el runtime lee.

Una Sense sin binding no es un error: la mayoría de las Senses A1 (palabras
gramaticales, MWUs funcionales) no llevan imagen.
