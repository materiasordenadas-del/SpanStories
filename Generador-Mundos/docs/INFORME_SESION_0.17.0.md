# 0.17.0 · Integración de dos diseños originales

El usuario pidió integrar el diseño pintado de Claude y el kit de Blender como alternativas independientes, sin modificar ni mezclar sus diseños. Se retiró la conversión inicial de materiales y se restauraron las fuentes originales antes de verificar esta integración.

El taller y el generador comparten `buildCommerceScene`. El selector «Diseño de los comercios» ofrece «Claude · pintado» y «Blender · volumen». La opción se guarda en el proyecto como `options.commerceDesign`; los proyectos anteriores conservan Claude. La selección utiliza los comercios, categorías, región, semilla y dimensiones del lugar generado, sin una condición especial para Barcelona.

Las pinturas, atlas, cargador original, recetas y scripts de Blender coinciden por SHA-256 con el respaldo previo. Los GLB fuente se conservan; no se editó ni guardó el `.blend`. `commerce-scene.js` solo añade la entrada opcional a la nueva fábrica de integración. No se modificaron los árboles ni los interiores manuales.

Evidencia: [14 archivos originales idénticos](../reports/estudio/0.17.0/integracion-kit/fuentes-originales.json), [panadería Claude](../reports/estudio/0.17.0/integracion-kit/panaderia-claude-original.png) y [panadería Blender](../reports/estudio/0.17.0/integracion-kit/panaderia-blender-original.png).

## Ejecución y optimización

- Blender llama al ensamblador original; mantiene mallas, colores de vértice RGBA y materiales estándar. Un pase independiente los dibuja con oclusión del mundo. No se les aplica el shader del diseño pintado.
- Instancias compartidas por módulo y material; rótulos agrupados por sector. Las piezas de utilería se muestran a menos de 24 m; paredes, techo y suelo se conservan completos. Cuatro luces cercanas reutilizables.
- Meshopt en un archivo derivado: interior de 2 585 484 a 1 276 144 bytes. No se reemplaza el GLB original. Regeneración: `node scripts/preparar-kit-comercios.mjs`.
- Barcelona procedural guardada: 711 edificios, 732 escaparates, 630 montajes originales y 102 cierres por huecos bloqueados o insuficientes; 209 lotes, 8 151 instancias de utilería y 2 957 016 bytes de geometría compartida del kit. Reconstrucción observada: 2 152 ms, sin considerarlo un benchmark de FPS o memoria total.

## Verificación y límites

Suite completa: **145/145**. Seis pruebas de integración verifican diseños excluyentes, buffers originales, igualdad de colocaciones con el ensamblador, LOD sin perder paredes ni IDs, persistencia y GLB/Meshopt con vidrio y entidades. Compilación Vite aprobada.

Taller y generador ejecutados con ambos modos; panadería y farmacia revisadas visualmente durante la corrección. Las 17 categorías se ensamblan en pruebas. La aprobación visual de todas las categorías, la paridad en el visor SpanStories y un presupuesto medido de FPS por ciudad siguen pendientes. No se publicó ni se envió una nueva exportación al visor en esta integración.

Taller: `http://127.0.0.1:5179/reports/estudio/0.17.0/prototipo-escaparates.html`. «Catálogo 17» y las flechas recorren las categorías. Blender conserva su variación original por semilla; los tres layouts de pintura no sustituyen sus recetas.

Respaldo previo: `respaldo/versiones/0.17.0-previo-integracion-kit-blender-20261027T004856Z`. El [relevo anterior](../reports/estudio/0.17.0/RELEVO_CLAUDE_CODE.md) conserva la historia y la exportación de prueba anterior a Claude.
