# Referencias utilizadas en 0.10.0

- Estilo: lectura de `D:\Español\SpanStories-worktrees\visor-mundo-20261021\SpanStories-Ciudades\engine\Estilos\Trigun\index.js`. Contraste 1,15; profundidad 0,7; transición 0,035; borde 0,3; saturación 1,1; tinte #69759c y cielo #58a9d3/#e4d5b7/#fff0d5. Atlas adapta estas fórmulas a su composición diferida. No se modifica el proyecto de referencia.
- [Wikidata P2048, altura](https://www.wikidata.org/wiki/Property:P2048): cantidad con unidades y posibles calificadores; no confundir valor de una parte o una altura histórica con altura actual del edificio completo. Atlas exige metros, cita y ausencia de calificadores antes de completar una altura.
- [Wikidata P4896, modelo tridimensional](https://www.wikidata.org/wiki/Property:P4896): referencia a un archivo de Wikimedia Commons, frecuentemente STL; su presencia no equivale a un GLB listo ni a licencia/reconstrucción certificada. Se ofrece el enlace, sin asignación automática.
- Referencias por lugar: entidad Q exacta de OSM → API oficial `https://www.wikidata.org/w/api.php?action=wbgetentities`, con revisión y fecha de consulta guardadas. Sin inferencia por nombre. Datos Wikidata CC0; los archivos de Commons tienen su propia licencia.
- Técnica local: Three.js 0.180.0, código de OrbitControls, geometrías y renderer instalados en `node_modules/three`. No se incorpora otra librería de navegación ni un visor alternativo.

El escaparate es una gramática creada para Atlas, aprobada por el usuario y revisada visualmente. Su caja aparente no procede de una fotografía ni describe el plano real del local.
