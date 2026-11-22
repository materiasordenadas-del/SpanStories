# Estilos

El panel **Estilos → Estilo visual** selecciona `Luz25D`, `Zelda`, `Trigun` o `StudioGhibli`.
El ambiente y las preferencias anteriores de luz siguen siendo independientes.

- `Luz25D/`: adaptador del motor original, conservado en `engine/Luz25D.js` con sus imports públicos.
- `Zelda/`: respuesta difusa pictórica, rebote cromático, pigmento discreto, atmósfera y contornos suaves.
- `Trigun/`: planos de sombra anime, contraste, reflejos por categoría y luz de borde.
- `StudioGhibli/`: pigmentos en coordenadas locales, masas de follaje, personajes ilustrados, humedad y cielo pintado.
- `GestorEstilos.js`: registro, selección, uniformes y persistencia por estilo.

Las reglas artísticas de sombreado, paleta, controles y contorno pertenecen a cada módulo.
Los componentes compartidos están fuera: `CityStyle.js` conserva la adaptación GLB y las variantes de render;
`StyleShader.js`, las conexiones GLSL y la clasificación semántica; `StyleSky.js`, el pase de cielo.
No se duplican escenas, navegación, modelos ni la carga por sectores. Los ajustes por uniformes no recompilan shaders.
El primer cambio a un estilo puede compilar programas nuevos. Cada estilo nuevo añade un pase de cielo;
conserva los lotes, instancias, LOD y sombras de árboles existentes, sin habilitar sombras de edificios para toda la ciudad.

Para añadir otro estilo, exportar un descriptor desde una carpeta nueva y registrarlo con
`gestor.registrar(descriptor)` o añadirlo a `ESTILOS` en `index.js`. El panel se genera desde ese registro.
Contrato: `id`, `nombre`, `crearUniformes()`, `fragmento(shader, metadata)`;
opcionales: `descripcion`, `controles`, `vertice(shader, metadata)`, `contorno(shader)`, `trazo`, `cielo`,
`fragmentoCielo`, `entorno({ambiente,variante,uniformes})`, `ambientes` y `preparar(profile)`.
`preparar` carga recursos solo al activar el estilo y puede devolver una función de liberación.
Los uniformes específicos deben tener nombres propios. `uEstiloTrazo` es el control común de contornos.

Compatibilidad: `new CityStyle()` y `montarPanelEstilo({luz,contenedor})` mantienen el uso anterior.
Las preferencias nuevas usan `spanstories.ciudades.estilos.v1`; las preferencias de luz existentes no se migran.

Ghibli añade Atardecer y Lluvia sobre los ambientes base Tarde y Nublado, sin modificar `Luz25D.js`.
La lluvia afecta a paleta, humedad, suelo y reflejos discretos; no añade un sistema de partículas.
`StudioGhibli/assets/nubes.png` es un derivado optimizado RGBA de 768 × 538 del recurso pintado `cloud.png` del archivo
`D:/Español/imagen para animación/Animation app/ghibli style landscape.blend` proporcionado por el usuario.
SHA-256 del original: `FD3E8625CE2D7D36047DC528769A6111D2A52E2843BE32BBC89363FE71136D3F`.
La geometría y los albedos de Barcelona se conservan; el acabado depende también del detalle de los modelos fuente.
Las nubes tienen anchos angulares de 28, 34 y 30 grados, manteniendo la proporción de la imagen.
Las texturas activas son `nube-ghibli-alta.png`, `nube-ghibli-compacta.png` y `nube-ghibli-alargada.png`.
Generadas con la herramienta de imágenes a partir de la pintura de referencia Ghibli: tres formas con base redondeada completa y alfa real.
Los originales generados y prompts están en `reports/nubes-png/`; `scripts/preparar_nubes_png.mjs` prepara las versiones web de 768 × 538 sin deformar ni ampliar los límites angulares.
Comparten un solo triángulo de cielo; fuera de sus regiones no se muestrea la textura. La corrección previa en Blender queda como derivado inactivo.
Las tres nubes giran continuamente a 0,25 grados por segundo alrededor del eje vertical, manteniendo tamaño y elevación.
