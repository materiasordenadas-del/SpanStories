# Plan completo · Atlas / Estudio de lugares

Objetivo activo solicitado por el usuario el 24/10/2026: completar las etapas siguientes sobre la fuente vigente D:\Español\Generador-Mundos, manteniendo el trabajo acumulado entre Codex y Claude Code.

## Reglas y criterio de cierre

Una fuente, README corto, módulos por responsabilidad, IDs estables, respaldos inmutables por versión y evidencias separadas. No modificar el visor SpanStories vigente para sortear fallos ni crear otra copia del programa. Cada etapa termina con pruebas proporcionales, ejecución visual cuando proceda y actualización de ESTADO.md. Antes de decisiones visuales importantes, presentar propuesta concreta y obtener la aprobación emergente exigida por el usuario; continuar entretanto con lo independiente.

El cierre significa capacidades implementadas y verificadas en casos representativos, con límites de datos y de reconstrucción declarados. No se puede garantizar la geometría exacta de cualquier lugar sin fuentes adecuadas. No sustituir la falta de datos por supuestas observaciones ni declarar cerrada una etapa por documentarla.

## Etapas

| Etapa | Trabajo | Criterio verificable de cierre | Estado |
|---|---|---|---|
| 1. Organización y primera fidelidad | Unificar continuidad, archivar históricos, respaldar versiones; priorizar color/material/cubierta registrados y proteger singulares de volúmenes aleatorios. | Inventarios y SHA-256; 30 pruebas y compilación; Gran Vía ejecutada. | Completada en 0.2.0 |
| 2. Proyecto editable y persistente | Guardar/reabrir proyecto completo, semillas y opciones; autosalvado recuperable; selección por ID; cambios individuales en overlays y deshacer. | Abrir sin consultar de nuevo OSM; reproducir relieve y geometría; cambiar un edificio conserva los demás y su fuente; validar archivos inválidos. | Completada en 0.3.0; 35 pruebas y guardar/reabrir desde UI |
| 3. Datos, alturas y operación | Diagnóstico de cobertura y procedencia por campo; correcciones/importaciones locales sin destruir OSM; estimación de alturas explícita y estilos regionales configurables; caché y recuperación frente a proveedores no disponibles. | Faltantes visibles, fuentes conservadas, alturas registradas protegidas; proyecto previamente guardado usable sin conexión a proveedores; pruebas de error y restauración. | Completada en 0.4.0; 41 pruebas y caso Buenos Aires |
| 4. Fachadas y edificios singulares | Perfiles por edificio/ID con referencias, materiales y parámetros de fachada; biblioteca de modelos estáticos asignables sin alterar urbanismo; ampliar estilos por datos y perfiles. | Regenerar conserva perfil/modelo y fuente; modelo alinea escala/apoyo; comparación con referencia para cada ejemplo que se declare fiel. | Completada en 0.5.0; modelo y perfil comprobados; ningún edificio real declarado fiel |
| 5. Relieve, viales e interiores | Parámetros editables de apoyo, anchura, puentes y desniveles; representación explícita de túneles; interiores modulares opcionales en edificios habilitados, con acceso y recorrido. | Casos controlados con cotas y colisiones; interiores optativos; geometrías genéricas señaladas como aproximación, sin presentarlas como ingeniería real. | Completada en 0.6.0; 48 pruebas y entrada desde UI |
| 6. Escala y rendimiento | Particionar datos/escena, carga y liberación por cercanía, detalle por distancia; ampliar selección por etapas y presupuestos; evitar reconstruir toda la ciudad por cambios locales. | Desplazamiento entre sectores carga/descarga sin perder ediciones ni IDs; medir memoria/llamadas/tiempos en el entorno real; límites explícitos por densidad y equipo. | Completada y cerrada en 0.9.0; caché caliente estable, edición conservada y prueba de 2 km |
| 7. Exportación y entrega al visor | Exportar semántica/IDs, modelos y anclas resolubles, manifiestos y materiales; compresión solo con decodificación comprobada; adaptar selección independiente en el receptor. | Reimportación del paquete reproduce entidades y recursos; prueba de selección por ID; integración preparada y verificable antes de cambiar el visor vigente. | Completada y cerrada en 0.9.0; escuela, Gran Vía y 1600 GLB del área grande verificados; receptor preparado, visor principal intacto |
| 8. Validación integral y relevo | Regresión de lugar real, escuela y colegio sobre mapa; proyectos anteriores, offline, ediciones, sectores y exportación; revisar prioridades visuales aprobadas. | Pruebas y compilación, evidencias organizadas, respaldo final con manifiesto y notas; pendientes residuales honestos. | Completada en 0.9.0; 58 pruebas, compilación, informe y respaldo de entrega |

## Orden de ejecución

Etapa 6: modo opcional de áreas mayores y carga/liberación por cercanía aprobado por el usuario; el modo actual sigue siendo predeterminado. Mantener límites visibles de edificios y memoria estimada.

Plan cerrado. Una continuación debe partir de INFORME_CONTINUACION.md y LIMITACIONES.md, sin reiniciar etapas ya verificadas. Las mejoras futuras requieren un alcance concreto; los límites residuales no se presentan como eliminados.

## Continuación 0.10.0 autorizada

- Comercios: propuesta de relieve, vidrio y fondo aparente aprobada; el usuario sustituyó los umbrales por 10 m para cargar y 10 m para descargar. Máximo 12 activos, recursos liberables, IDs persistentes y efecto opcional. No se infiere el diseño real del comercio.
- Trigun y caminar: contrastar con el módulo del visor de referencia en lectura, corregir primera/tercera persona y colisiones; no cambiar el otro proyecto.
- Datos/monumentos: el usuario exige funcionamiento automático para las ciudades que elija. Buscar identidades exactas OSM/Wikidata, conservar citas y aceptar solo alturas documentadas no ambiguas. No sustituir modelos específicos ausentes por una afirmación de fidelidad.
- Corrección añadida por el usuario: retirar la continuidad del zócalo a través de la hoja de puertas comerciales; comprobar otros portales y el modo base.
- Validación proporcional de los módulos cambiados, evidencia visual en escuela y Madrid, entrega y respaldo 0.10.0. Techos conservados.

## Continuación 0.11.0 autorizada

- Petición del usuario: generación procedural automática y correcta en lugares nuevos de Latinoamérica, estructuras (sin coches, bancos ni lo sustituible por GLB), rendimiento para su visor, IDs para nombrar, mejoras visuales; corregir los «altos y bajos» del terreno; respaldos solo en `respaldo/` y un informe en `docs/`.
- Hecho: ver [INFORME_SESION_0.11.0.md](INFORME_SESION_0.11.0.md). Pendiente siguiente sugerido: verificar una exportación completa con anclas `embedded:false` y el relleno en modo por sectores; variantes regionales del estilo colonial; LOD para las piezas fundidas.

## Techos: condición expresa del usuario

Priorizar las fachadas visibles; no añadir detalle en la parte superior de los techos. Solo aplicar una simplificación o retirada de techos si dos exportaciones comparables (misma escena, recursos, formato y compresión) demuestran que la versión con techos pesa al menos un 10 % más que la versión sin techos: (bytesConTechos - bytesSinTechos) / bytesSinTechos >= 0,10. El denominador es el peso sin techos, no el peso total con techos. Si no se alcanza ese umbral, o no existe una medición comparable, conservarlos. No sustituir bytes de archivo por FPS, conteo de triángulos o una estimación visual para decidir. Mantener los elementos de silueta visibles ajenos a la superficie superior.

## Estado inicial conservado

La primera revisión visual fue aprobada por ventana emergente el 24/10/2026: respetar cubiertas, colores y materiales registrados; evitar áticos y templetes aleatorios en edificios singulares; conservar su identidad. No se autorizó rediseñar iluminación, cámaras ni el visor vigente como efecto secundario.
