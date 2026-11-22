# Taller de Animación — instrucciones para agentes

App Vite + three.js 0.180, puerto **5189**. Junto con el Estudio (visor de escenarios, `localhost:3000`) y el Taller facial forma un mismo elemento: el Estudio la abre en un marco y ella sirve el Taller facial en `/facial/` (solo dentro del Estudio).

- **Para usarla (animar o exportar)**, lee `IA.md` y usa los comandos (`node herramientas/ia.mjs …`). No hagas clics simulados.
- **Para cambiar el código**, mira el mapa de abajo y `docs/ESTADO.md`.
- **Para verificar**, usa `npm test` (núcleo), el comando `captura` (que deja un PNG para mirar) y el lote `herramientas/ejemplos/prueba-completa.json`.

## Mapa

- `facial/`: Taller facial (editor general de expresiones, 50 actuaciones F/M, vida LifeCharacter, perfiles por personaje). Ver `facial/EDITOR_GENERAL.md`.
- `src/core/acting.js`: motor de actuaciones, con articulaciones naturales (`naturalArms`). `skinfix.js` (axilas), `accessories.js` (mochila/pelo) y `bodyprofile.js` (preparación al cargar con el perfil del personaje).
- `src/core/humanoid.js`: esqueleto canónico y detección (Mixamo, Unreal/Quaternius, Rigify, VRM, genérico).
- `src/core/rig.js`: personaje ↔ espacio canónico (pose T ideal, altura de cadera).
- `src/core/clip.js`: clips canónicos; conversión desde AnimationClip.
- `src/core/animation.js`: tiras, capas, claves, IK, ajustes y evaluación.
- `src/core/director.js`: Motion Director (plan de destinos, caminos y acciones → tiras + trayectoria de la raíz). Sin DOM: `tests/director.test.js`.
- `src/ui/planner.js` (Motion Planning: el plan como nodos con condiciones), `src/ui/aim.js` (Look At y Reach Target), `src/io/studio-boot.js` (arranque dentro del Estudio: personaje de la escena desde el primer instante y precarga oculta).
- `src/ui/director.js` (panel y edición en el visor), `src/ui/topmenu.js` (menú superior: mueve los paneles de Animar, no los rehace), `src/ui/modes.js` (Maniquí / En escena) y `src/ui/scenelive.js` («En escena» sobre el escenario vivo del Estudio).
- `src/ui/motionpanel.js` + `src/ui/editlayer.js` + `src/ui/dummyrender.js`: Editar capa de movimiento (como iClone): maniquí 3D del panel, pines T/R, reposo, puño, puntillas, títere directo, mantener en la tira, capas. Los puntos de control sobre el personaje están en `viewport.js` (`buildDots`).
- `src/core/motionlab.js`: Motion Lab (estilos, amplitud, solapamiento, dirección…).
- `src/core/procedural.js`: clips y poses generados por código.
- `src/io/*`: carga, exportación GLB, paquete three.js, enlace y almacenamiento local.
- `src/ui/*`: visor, línea de tiempo (tiras, claves, curvas), paneles y escena (objetos, piezas, cámara).
- `src/ia.js`: API de comandos para IA. Si añades una función de la app, añade aquí su comando.
- `herramientas/plugin.mjs`: servidor (biblioteca, subir, guardar, FBX con Blender y puente `/api/ia`).

## Reglas

- La biblioteca va **por librerías, nunca mezcladas**: `biblioteca/mixamo` → «Mixamo»; `rutas.json` → `biblioteca/paquetes` (paquetes de animación, listados como librería aparte).
- Los personajes llegan **ya rigueados**: no hay auto-rig.
- La exportación principal es **three.js** (paquete con GLB, cargador y reproductor).
- No dupliques archivos grandes; el disco C está casi lleno.
