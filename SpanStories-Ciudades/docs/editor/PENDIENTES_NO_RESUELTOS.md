# Pendientes y cosas no resueltas del Editor de escenarios

Fecha: 20/11/2026. Lo que **no** se pudo resolver o verificar, y por qué.

## Requiere una acción tuya (no la pude hacer yo)
1. **Reiniciar el motor (`npm run dev:visor`)**. El servidor de 8877 ya estaba en marcha y no carga las rutas nuevas de `serve.py` (`/shared-styles/grass-*.js`, `/grass-james/`). Hasta reiniciarlo, el panel «Terreno y vegetación» avisa «el césped no está disponible» (el resto del editor funciona). El sistema me denegó arrancar otro servidor de prueba.
2. **Verificación visual** del césped, la pintura de terreno, las variantes y los prefabs: están escritos y los datos/algoritmos probados en Node, pero **no vistos en pantalla**.
3. **Commit**: no hice ninguno. Hay ~380 archivos modificados sin commit en el árbol (muchos de Codex en el Taller; no los toqué).

## No resuelto
| Tema | Estado | Por qué |
|---|---|---|
| Nubes volumétricas (cielos V7.1 modos 21–27, calidad «Alta») | No portadas | Los shaders `newFrag` del HTML son de un renderizador WebGL2 propio; QA_V7_1 los marca «NO VERIFICABLE» sin GPU real. Se portaron las **paletas** de los 27 cielos (`Presets.js`); las tres calidades usan el cielo ligero del compositor. |
| Cielos históricos (aeropuerto, hotel…) | Solo colores | Su lienzo/shader propio no se porta. |
| Césped V2, V3 (863 304 triángulos), V4 y Pradera V5 | Listados «Pendiente de portar» | Son módulos propios incrustados en base64 en V12; no son parámetros de `GrassField`. Hay que extraerlos y decidir cuáles merecen un motor propio. |
| «Colina original» | Solo en colinas | Ya existe en `ColinaQuijote`; no se puede aplicar a otros escenarios sin portarla. |
| Altura y color **locales** del césped | No disponible | `GrassField` usa una altura y un color por perfil; el mapa solo regula densidad. |
| Pintura de terreno con mezcla suave | Bordes con salpicado | El compositor es diferido: no admite transparencia parcial, se usa `alphaTest`. Sin verificar el aspecto. |
| Relieve (alturas) | No hecho | Fuera de esta entrega. |
| Vistas ortográficas | Aproximadas | Vista alineada con campo estrecho (12°); no se sustituye la cámara perspectiva (no se toca `CityNavigation`). |
| Instanciación GPU explícita de copias | No hecha | Las copias comparten el GLB descargado y pasan por el optimizador existente; falta medirlo antes de adoptar `InstancedMesh`. |
| Variante dentro del Estudio | Parcial | Aplica visibilidad; la luz la sigue dirigiendo la escena del Estudio. |
| Pincel de dispersión: coste por copia | Sin optimizar | Cada copia se prepara por separado (el archivo se descarga una vez, pero se vuelve a leer y compilar). Con renderizado por software la primera tardó ~40 s; hay que medirlo en tu GPU y, si hace falta, compartir geometría entre copias. El tope por trazo es 60. |
| Biblioteca sin el servidor del visor (3000) | No funciona | Registrar/leer GLB propios usa `/api/city-library`. |
| Rendimiento en tu equipo (FPS, GPU) | No medido | Solo probé con renderizado por software. |
| Mover estructuras de lugares del Generador y sectores | Existía; sin pruebas nuevas en navegador | Se reutiliza `AtlasEdicion` (con tests previos); añadí adaptadores y «cambios sin destino». |

## Avisos sobre pruebas
- 3 pruebas antiguas del puente del Estudio fallan por `win.clearTimeout` (ya fallaban antes de mi trabajo; las verifiqué en la línea base).
- Las 2 pruebas de NLP/spaCy de la raíz fallan por el entorno Python.
