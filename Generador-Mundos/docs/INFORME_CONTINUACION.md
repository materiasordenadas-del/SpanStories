# Informe de entrega y continuación · Atlas 0.16.1

26/10/2026. Continuar la fuente única `D:\Español\Generador-Mundos` y leer primero [ESTADO.md](ESTADO.md) y [INFORME_SESION_0.16.1.md](INFORME_SESION_0.16.1.md). Última petición: buscar y corregir fallos de **exteriores**, especialmente calles, árboles y edificios superpuestos. Interiores manuales, sin ampliación automática ni nuevo trabajo interior. 115 pruebas, compilación, Arequipa en vivo y exportación/reapertura de 17/17 sectores verificadas. Los estilos existentes se conservaron. Los datos fuente ambiguos y la fidelidad arquitectónica universal siguen siendo límites reales.

## Historial anterior · 0.11.0

24/10/2026. Fuente vigente: **D:\Español\Generador-Mundos**. Se continúa 0.9.0 y sus ocho etapas cerradas, sin reiniciar desde la base ni trabajar en respaldos. Las [limitaciones actuales](LIMITACIONES.md) siguen explícitas: no se afirma reconstrucción universal ni fidelidad arquitectónica sin referencias.

## Entrega 0.11.0

Generación automática para lugares nuevos (contexto urbano, alturas por contexto, relleno de manzanas con ids `gen:relleno:`, contornos con partes parciales, identidad heredada por las partes, Overpass con espejos), relieve filtrado, templos de tres naves y rendimiento (fusión de variantes raras: −31/−39 % llamadas; modo solo estructura con anclas para GLB). Probado en Antigua Guatemala, Cusco, Montevideo, Guanajuato, Oaxaca y Panamá, con Madrid como control. 78 pruebas y compilación aprobadas. Detalle, métricas y pendientes: [INFORME_SESION_0.11.0.md](INFORME_SESION_0.11.0.md); evidencias: `reports/estudio/0.11.0/`.

## Entrega 0.10.0

- Comercios cercanos opcionales: **10 m para cargar y 10 m para descargar**, por corrección expresa del usuario; máximo global 12 activos. Marcos en relieve, vidrio con reflexión e interior aparente con paralaje, mostrador y estanterías. Crea/libera recursos por proximidad, conserva propietario por edificio e incluye sectores desplazados. No es local transitable ni reconstrucción de un negocio real.
- Puertas: corregida la continuidad del zócalo a través de la hoja comercial señalada en captura. También se recortan zócalos/bandas del edificio en portales y escaparates; hoja y marco llegan al umbral. Se comprueba el modo base sin detalle cercano y las dimensiones de las instancias estiradas.
- Trigun contrastado con el módulo del visor principal, completando reflejos selectivos y ajustes de transición/saturación sin cambiar albedos ni otro proyecto.
- Caminar: misma velocidad en diagonales y primera/tercera persona, teclas limpias al perder foco/salir, colisiones en subpasos/bordes de rejilla, inicio seguro, límites y cámara que se acerca ante obstáculos. Alternancia V/botón y arrastre si no se captura el ratón. Avatar provisional.
- Automatización de referencias al elegir ciudad: tiendas, históricos y obras de arte en la consulta OSM; identidades de contornos/monumentos conservadas. Wikidata por Q exacto, lotes y caché, hasta 100 identidades. Fotos/modelos enlazados como referencias; altura P2048 solo si es única, citada, en metros y no describe partes/conjuntos. Fuente original y ediciones prioritarias conservadas; guardar/abrir conserva referencias sin volver a consultar proveedores.
- El efecto cercano y Trigun son propios del render de Atlas. El GLB conserva la representación estática, puertas corregidas y metadatos; `EFECTOS_ATLAS.md` explica esta diferencia en paquetes nuevos. No se ha modificado ni instalado nada en el visor principal.

Verificación: **46 pruebas únicas de módulos afectados aprobadas** en ejecuciones acotadas (32 regresiones y 14 nuevas); compilación aprobada. No se repitieron pruebas ajenas ni se reabrieron las ocho etapas. Prueba visual de puerta con/sin detalle y teclado real de ambas vistas. Antes del último ajuste de apoyo, tres retornos a 5 m en escuela conservaron 5 escaparates, 75 300 bytes de buffers propios, 169 geometrías y 16 texturas; a 10,01 m se descargó el objetivo. Esa muestra no se presenta como benchmark del último ajuste. Madrid: 376 edificios, 207 POI y 23 referencias automáticas, incluyendo Oso y Madroño, Carlos III, Mariblanca y Real Casa de Correos. Ninguna altura ni modelo se aceptó automáticamente por falta de datos compatibles. Detalles y límites en `reports/estudio/0.10.0/VERIFICACION.md`.

También se corrigió el segundo defecto señalado por el usuario: puertas elevadas por la cota máxima de la huella. Ahora se apoyan en el suelo local ante la hoja, incluyendo comercios, portales y la fábrica separada de iglesia genérica. Auditoría final de 1319 accesos de Madrid: ninguno supera 2 cm de diferencia respecto al suelo digital; error máximo de redondeo 0,00000123 m. No se modifica estructura, techos ni dimensiones del perfil. Informe de todo el chat y pendientes: `respaldo/documentacion-0.10.0/INFORME_CHAT_20261024.md` (histórico).

Una consulta OSM ampliada devolvió HTTP 504 durante el ensayo. Se separó el complemento de tiendas/monumentos de la consulta base, conservando su clave de caché y sus registros; complemento limitado a ocho segundos y fallo con aviso, sin bloquear la ciudad disponible. La actualización explícita sigue informando el fallo. La carga final de Madrid terminó sin avisos. No se presenta el primer fallo como una verificación aprobada.

Antes de editar se verificó el respaldo `0.9.0-previo-comercios-recorrido-20261024T194639Z` mediante SHA-256. La entrega se respalda con `npm run respaldo -- 0.10.0`. Fuente vigente: raíz del proyecto; `respaldo/versiones` sigue siendo histórico de recuperación.

Pendiente real: **no existe reconstrucción automática fiel de todos los monumentos ni una altura comprobada para cada edificio**. La consulta automática solo ayuda donde los proveedores contienen identidad/citas adecuadas. No convertir un enlace o un STL de referencia en una afirmación de modelo integrado. Una siguiente mejora debe partir de un caso real verificable de esa cobertura, preservando lo entregado.

## Base 0.9.0 conservada

1. README breve, documentación vigente separada, históricos archivados y respaldos inmutables con SHA-256 por versión.
2. Guardar/abrir proyecto, autosalvado y copia anterior; selección por ID, edición individual y deshacer. La fuente original se conserva.
3. Diagnóstico de procedencia/cobertura, estimaciones configurables, GeoJSON local con fuente/licencia, caché vencida señalada y reconstrucción mediante fuente guardada.
4. Materiales/colores/cubiertas registrados prioritarios; protección de edificios singulares; perfiles de ventanas, puertas y balcones; modelos de edificio autocontenidos asignables por ID.
5. Ajustes de apoyo, ancho de calle, puentes/túneles, DEM local e interior opcional de planta baja con entrada y colisiones. Son representaciones generadas, no planos ni ingeniería real.
6. Modo opcional por bloques de 200 m, construcción/liberación por cercanía, presupuestos visibles e invalidación local de ediciones. Se corrigieron propietarios tras LOD y recortes de bordes para evitar marcas duplicadas y bordillos artificiales.
7. Paquetes por sectores de 50 m, IDs persistentes, modelos/mobiliario/texturas incluidos, proyecto fuente, manifiesto, hashes y receptor portátil. Meshopt sin pérdida de atributos cuando reduce bytes. «Revisar exportación» lee los archivos guardados y permite comprobar IDs; al salir vuelve al proyecto editable.
8. Regresión de escuela, lugar real, colegio insertado, proyectos anteriores, desconexión, edición, sectores y exportación; evidencias organizadas y respaldo de entrega.

## Verificación histórica de 0.9.0

- **58 pruebas, cero fallos; compilación aprobada.** Persiste el aviso de tamaño del paquete compartido de Three.js. Registros: `reports/estudio/0.9.0/pruebas.txt` y `compilacion.txt`.
- **Gran Vía guardada:** 354 edificios/89 vías, apertura sin proveedores y sin imágenes de mapa; búsqueda por nombre bloqueada en ese modo. Se conserva el snapshot original y el proyecto anterior de la etapa 0.3. Exportación: 58 GLB, 354/354 edificios con geometría e ID, todos los archivos comprobados y decodificados. En revisión se seleccionó `osm:relation:4715753` al pulsar una fachada.
- **Colegio sobre Madrid:** 237 registros/235 edificios dibujados, ciudad exterior conservada y lugar original guardado en `realModel`; los dos pilares pequeños quedan excluidos por el umbral previo. Apertura y captura comprobadas.
- **Escuela con interior y modelo:** interior en `gen:edificio:1` y torre de ensayo asignada a `gen:edificio:2`; JSON descargado desde UI. Paquete escolar con 36 GLB y recursos incluidos, todos decodificados. La torre es sintética; no se declara un edificio real fiel.
- **2 km sintéticos:** 400 edificios/100 bloques de detalle en datos; recorrido entre zonas mantiene la edición de 24 m/ocho plantas. Con caché caliente, dos retornos a la misma vista conservan **13 840 776 bytes de buffers estimados, 206 geometrías y 16 texturas**, con 6 bloques activos, 78 llamadas y 56 694 triángulos. No equivale a memoria total ni a FPS garantizados.
- **Exportación completa de 2 km:** 1600 GLB, 400/400 edificios con geometría; hashes de 1608 archivos y decodificación completa. GLB: 797 290 088 → 155 026 104 bytes, sin quitar geometría ni techos. Gran Vía: 263 451 944 → 111 880 872 bytes. Son muestras, no porcentajes universales.
- Atributos numéricos antes/después de Meshopt comparados exactamente; decodificación con Three.js real. El receptor rechaza paquetes incompletos y sectores corruptos. Los resultados asíncronos obsoletos se descartan y los recursos compartidos se conservan hasta su último consumidor.

Los primeros ensayos detectaron y corrigieron topología/UV de árboles, doble prefijo de atributos personalizados, invocación de fetch, restauración tras apertura fallida y recortes de sectores. Se conservan evidencias previas archivadas; la verificación final no se basa en las iteraciones fallidas.

## Dónde está cada cosa

| Contenido | Ruta dentro de la fuente vigente |
|---|---|
| Reglas, estado y plan | README.md; docs/ESTADO.md; docs/PLAN.md |
| Este informe y límites | docs/INFORME_CONTINUACION.md; docs/LIMITACIONES.md |
| Evidencias finales | reports/estudio/0.11.0/ (0.9.0 y 0.10.0 conservadas) |
| Paquete real validado | exportaciones/madrid-gran-via-20261024191946013-14f2fdcf/ |
| Paquete de 2 km validado | exportaciones/colegio-espana-rendimiento-20261024191453337-261462ee/ |
| Escuela con interior/modelo validada | exportaciones/colegio-espana-aula-1-20261024190026143-aa26cb36/ |
| Recuperación de fuentes/versiones | respaldo/versiones/; cada carpeta incluye MANIFIESTO.json y VERSION.md |

Cada paquete contiene `manifest.json`, `sectores.json`, `entidades.json`, `recursos.json`, `anclas.json`, `lugar.json`, `proyecto.json`, `AtlasPackage.js` y `LEEME.md`. Las anclas describen elementos ya incluidos: no duplicarlos colocando otros modelos. El receptor necesita Three.js en el anfitrión; la instalación real en el visor de producción no se ha hecho.

La prueba manual de Guardar de la escuela escribió una recuperación local durante la validación, manteniendo la copia anterior según el mecanismo existente. No se asegura que la recuperación actual sea la última zona que el usuario visitó. Desde 0.9.0, con `autoguardado=0`, Guardar solo descarga el JSON y no escribe esa recuperación. Los proyectos descargados de ensayo están en las evidencias; no son nuevas fuentes editables del programa.

## Continuar en otro chat

```text
Continúa Atlas 0.11.0 en D:\Español\Generador-Mundos.
Lee README.md, docs/ESTADO.md, docs/PLAN.md, docs/INFORME_CONTINUACION.md,
docs/INFORME_SESION_0.11.0.md y docs/LIMITACIONES.md. Continúa la fuente vigente y sus mejoras acumuladas;
no reinicies desde Atlas base ni trabajes dentro de respaldos.
Las ocho etapas están cerradas según sus verificaciones: no repitas pruebas
ya aprobadas sin cambios o un problema nuevo. Antes de editar, inspecciona
el módulo afectado y crea el respaldo de versión. Preserva funciones ajenas,
IDs, perfiles, fuente y proyectos. Pide aprobación emergente para nuevas
decisiones visuales importantes. Conserva techos salvo medición comparable
que pruebe al menos 10 % más de bytes con ellos que sin ellos.
Arranque: npm run dev; puerto único de Atlas: 127.0.0.1:5179.
El visor principal de SpanStories es otro proyecto: no modificarlo ni crear
visores alternativos como efecto secundario. La prioridad siguiente debe
partir de una limitación concreta del informe y referencias verificables.
```

Módulos principales: `src/estudio/data` (proyecto, ediciones, perfiles, fuentes y relieve), `arq` (apariencia, fachadas e interiores), `scene` (ensamblado y bloques), `render` (recursos, LOD, selección, recorrido y revisión), `export` (paquete y receptor); `server/estudio-plugin.js`, `server/meshopt.js`. Herramientas: `npm test`, `npm run build`, `npm run respaldo -- <version>` y `node scripts/verificar-paquete.mjs <manifest.json> [informe.json]`.
