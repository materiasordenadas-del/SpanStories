# Avisos de terceros — Taller de Animación

## Herramientas (add-on de Blender)

Las herramientas de `src/core/edit/` y el IK de miembro de `src/core/ik.js` se inspiran en el add-on de Blender
**Herramientas** de Tal Hershkovich: controles temporales IK/FK, horneado inteligente, trayectoria editable,
copiar/pegar matriz, retimer con marcadores, desfase y compartir claves, intercalar, Multikey y cursor relativo.
Los algoritmos se reimplementaron en JavaScript sobre el motor del Taller; no se copió código del add-on. Se deja
el aviso por cortesía y para cumplir la licencia si en el futuro se reutilizara código sustancial:

```
MIT License

Copyright (c) 2026 Tal Hershkovich

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of
the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Los avisos de terceros del Taller facial están en `facial/THIRD_PARTY_NOTICES.md`.

`src/io/FBXLoaderEjes.js` es una copia de `three/examples/jsm/loaders/FBXLoader.js` (three.js r180, licencia MIT, © three.js authors) con una corrección local en `interpolateRotations` (ejes de rotación con claves distintas). Se usa solo para los clips de animales.
