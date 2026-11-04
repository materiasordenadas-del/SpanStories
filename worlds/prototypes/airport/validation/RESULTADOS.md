# Verificación de la fase técnica

Fecha de ejecución: 22 de septiembre de 2026 en Caracas (23 de septiembre UTC).

## Comprobado

- `node --test tests/*.test.js`: **16/16**, incluida una secuencia de **40 transiciones** simuladas y casos de fallo/cancelación/concurrencia.
- `node --check lab.js` y `node --check engine/GLBAssetSource.js`: sin errores de sintaxis.
- Render WebGL real inspeccionado visualmente; prueba inicial de **12 transiciones** con PASS y retorno a una geometría/una textura del blockout. Se observaron unos 59,9 FPS/16,7 ms con rAF activo en el navegador local. No constituye validación de los assets finales.
- Cambio D01 → shell A00 → D01: solo aparecen recursos del mundo correspondiente; una geometría/una textura antes y después. Evidencia: `world-switch.json`.
- Ensayo WebGL final guardado en `transitions-webgl.json`: 12 transiciones, 7–10 draw calls, 384–2.004 triángulos según zona, una geometría/una textura estables. El perfil cambia de HIGH a STANDARD durante ese ensayo; sirve como prueba de lifecycle, no como comparación controlada entre perfiles.
- Samuel cargado desde su GLB mediante `GLBAssetSource`, sin errores del loader; altura **1,699999809 m** y 21 clips. Evidencia: `samuel-scale.json` y `samuel-reference.png`.
- Samuel añade **214.824 triángulos** y 10 draw calls en la vista D01. El render con personaje registra 215.220 triángulos, 17 draw calls, 11 geometrías y 14 texturas (incluye texturas internas de skin/morph).
- Las texturas de material inspeccionadas son **tres de 4096×4096** con mipmaps: **256 MiB estimados en RGBA** en conjunto. El comentario del visor sobre un atlas de 8192 no describe las dimensiones observadas en este GLB. No se alteró el archivo.
- Tras descargar Samuel, el renderer vuelve a **una geometría, una textura y dos leases**: `samuel-unloaded.txt`.
- Perfil ECO seleccionado y navegación manual a D02 ejecutada: `eco-security.txt`. Los perfiles se cambian sin recargar.

Los campos `render` y `memory` de los JSON son la captura instantánea del renderer. Los FPS y campos superiores de rendimiento proceden de la última ventana temporal completa y pueden anteceder a la carga del modelo; no deben atribuirse al nuevo personaje sin esperar una muestra posterior.

## Limitaciones reales

- El cambio temporal de viewport a 1366×768 coincidió con throttling de frames. Se restauró el viewport; no se completó una matriz válida de rendimiento a 1366×768/1920×1080. El laboratorio ahora limita la espera por frames y muestra un error recuperable, en lugar de dejar un benchmark bloqueado.
- No se ejecutaron 60 s por zona con contenido final, cinco recorridos caminando ni medición real de VRAM/heap. Los conteos estables descartan acumulación de esos recursos observados, no prueban ausencia universal de fugas.
- No hay todavía NPC, audio, rig animado, señalización final, recorrido caminable, oclusión final ni assets de escenario descargados por red. El streaming procedural y el transporte GLB real se verificaron por separado.
- El rendimiento del blockout no autoriza a ampliar al aeropuerto completo. Seguir el orden de `HANDOFF_SOL.md`.
