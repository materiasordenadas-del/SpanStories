# Taller de Animación — guía para IA (Claude, Codex)

La app se maneja con **comandos JSON de alto nivel**. No hace falta tocar el código ni hacer clic.

## Arrancar

1. `npm run dev` en esta carpeta (o, desde Claude Code, la configuración `taller-animacion` de `.claude/launch.json`). Puerto **5189**.
2. Abrir **http://127.0.0.1:5189** en un navegador: los comandos los ejecuta la página abierta. Sin página abierta, `/api/ia` responde 503.

## Mandar comandos

```bash
node herramientas/ia.mjs ayuda                                  # todos los comandos y sus argumentos
node herramientas/ia.mjs estado                                 # qué hay ahora
node herramientas/ia.mjs biblioteca '{"libreria":"Mixamo"}'
node herramientas/ia.mjs usarClip '{"id":"lib:mixamo:walk"}'
node herramientas/ia.mjs rotar '{"hueso":"head","y":20,"f":12}'
node herramientas/ia.mjs captura '{"nombre":"revision.png","f":12}'   # → ruta del PNG: léelo para ver el resultado
node herramientas/ia.mjs --lote herramientas/ejemplos/prueba-completa.json
```

Por HTTP: `POST http://127.0.0.1:5189/api/ia` con `{"cmd":"…","args":{…}}`, o `GET /api/ia?cmd=estado`.
La respuesta siempre es `{"ok":true,"result":…}` o `{"ok":false,"error":"…"}`.

## Conceptos

- **Huesos**: se nombran con el nombre canónico (`hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `shoulderL`, `upperArmL`, `lowerArmL`, `handL`, `upperLegL`, `lowerLegL`, `footL`, `toesL`, dedos `index1L`…) o con el nombre real del personaje (`mixamorigHead`, `upperarm_l`…). `huesos` devuelve el mapeo.
- **Marco del personaje** (en `mover`, `ik.objetivo` e `ik.polo`): x = su izquierda, y = arriba, z = delante, en metros.
- **Tiras**: los clips de la base (bloqueada); se encadenan con fundido.
- **Capas**: las claves van a la capa activa. `aditiva` suma sobre lo de debajo y `sustituye` reemplaza. La máscara usa los grupos `torso`, `head`, `armL`, `armR`, `legL`, `legR`, `fingersL` y `fingersR`.
- **Librerías**: Mixamo, UAL 1, UAL 2, Humane, Fútbol (mocap), Generados y Tuyas. Nunca se mezclan; dentro de cada una hay categorías (locomoción, gestos, interacción, combate, reacciones, poses).
- **Mixamo**: los FBX de Mixamo van en `biblioteca/mixamo/` (o con `importar`) y salen en la librería «Mixamo». Las descargas masivas las lanza el usuario desde mixamo.com con el marcador «Taller ← Mixamo» (librería Mixamo); `mixamo` da su estado. Los personajes van en `biblioteca/personajes/` y siempre llegan ya rigueados.
- **Exportar**: `exportar {"formato":"three"}` deja en `exportaciones/<nombre>/` el GLB con las animaciones con nombre, `taller-three.js` (cargador con `reproducir(nombre)`), `reproductor.html` y `LEEME.md`. También admite `glb`, `fbx` (con Blender 5.2 en segundo plano) y `clip` (JSON canónico).

## Flujo recomendado

1. `estado` → `personajes` → `ponerPersonaje`.
2. `librerias` / `biblioteca` → `usarClip` o `anadirTira`.
3. `capa {"accion":"nueva"}` antes de retocar, para no tocar la base.
4. `rotar`, `mover`, `ik`, `pose`, `ajustar`, `motionLab`.
5. **Verificar mirando**: `captura` en los fotogramas clave y leer el PNG.
6. `exportar {"formato":"three"}`.
7. Si algo sale mal: `deshacer`.

## Comandos

Se obtienen siempre al día con `ayuda`. Resumen:

| Comando | Para qué |
|---|---|
| estado, librerias, biblioteca, personajes, huesos, claves, pose_actual, enlace | leer |
| ponerPersonaje, usarClip, anadirTira, editarTira, quitarTira, fotograma, reproducir, rango | escena y tiempo |
| rotar, mover, escalar, arrastrar, ayudas, pines, reposo, palma, puntillas, titere (mover o girar, reflejar), capaNueva, capaActiva, mantenerTira, clavesFotograma, ik, ikPeso, anclar, fijarPies, curva, curvaTira, clave, borrarClave, pose, espejo, ajustar | animar |
| capa (nueva, activa, editar, borrar, fusionar, aplanar, duplicar) | capas |
| motionLab, ochoDirecciones | rehacer clips (estilo, amplitud, solapamiento, dirección…) |
| objeto, escenario, camara, captura | escena, cámara y foto para revisar |
| exportar, conjunto, importar, proyecto | archivos |
| director | Motion Director: destinos, caminos y secuencia de acciones (caminar → saltar → sentarse) |
| modo, escena, menu | Maniquí / En escena, escenario vivo del Estudio y menú superior |
| plan, objetivo, mirar, alcanzar | Motion Planning (nodos y condiciones), objetivos con nombre, Look At y Reach Target |
| ikCambiar, controlTemporal, controlesTemporales, hornearControl, hornear, trayectoria, intercalar, copiarMatriz, pegarMatriz, pivote, desfase, compartirClaves, multikey, marcador, retimer | Herramientas (add-on de Blender reimplementado; ver `docs/HERRAMIENTAS.md`) |
| deshacer, rehacer, interpolaciones, ayuda | utilidades |

## Motion Director

El plan (`doc.director`) se compila solo a tiras + trayectoria de la raíz. Coordenadas en metros sobre el suelo, relativas a donde está el personaje en reposo (x = su izquierda, z = delante).

```bash
node herramientas/ia.mjs escenario '{"id":"mesa","posicion":[2,0,2]}'
node herramientas/ia.mjs director '{"accion":"camino","nombre":"Entrada","puntos":[[0,0.4],[0.6,2.2],[1.2,3.5],[2.6,3.9],[3.2,3.2]]}'
node herramientas/ia.mjs director '{"accion":"recorrer"}'                          # Auto en camino
node herramientas/ia.mjs director '{"accion":"accion","clip":"gen_saltar"}'
node herramientas/ia.mjs director '{"accion":"destino","x":2,"z":2.6,"mirar":180}'   # waypoint; al llegar mira a 180°
node herramientas/ia.mjs director '{"accion":"accion","clip":"gen_sentado","mantener":1.5,"asiento":0.45}'
node herramientas/ia.mjs director '{"accion":"reproducir"}'
```

`modo {"modo":"maniqui"|"escena"}` cambia de modo; `modo {"guardar":"Nombre"}` guarda la animación general en Tuyas. Dentro del Estudio, `escena` informa del escenario vivo (y `{"accion":"apagar"}` vuelve al visor propio). Con varias páginas abiertas, la variable `TALLER_SESSION=<studioSession>` elige la del Estudio.

Desde la consola del navegador: `taller.ia.run('estado')`.

## Motion Planning, Look At y Reach Target

```bash
node herramientas/ia.mjs objetivo '{"accion":"nuevo","nombre":"Silla","x":2,"y":0.45,"z":2.6}'
node herramientas/ia.mjs objetivo '{"accion":"camara"}'                     # la cámara como objetivo
node herramientas/ia.mjs mirar '{"objetivo":"Cámara","f":0}'                # Look At: ojos → cabeza → torso
node herramientas/ia.mjs alcanzar '{"objetivo":"Silla","mano":"R","f":40}'   # Reach Target con IK
node herramientas/ia.mjs plan '{"accion":"abrir"}'                          # lienzo de nodos (mismo plan que director)
```

`plan` añade nodos (`nodo`), los conecta (`conectar` con salida `siguiente | si | no`) y fija decisiones; `ayuda` da todos los argumentos.
Dentro del Estudio el Taller se precarga oculto con el personaje seleccionado; los comandos funcionan igual cuando se muestra.

## Herramientas (IK ⇄ FK, controles temporales, trayectoria, retimer…)

**Rocinante (AutoRig Pro):** `animales {"modelo":"estudio:rocinante","clip":"H_Walk.FBX","jinete":false,"editar":true}` pone el caballo en el editor, con su secuencia en Base y sus puntos de control. `handL/handR` son las patas delanteras; `footL/footR`, las traseras. Mover, rotar, IK/FK, capas y guardar conservan las pistas nativas de todas sus ramas. Con un personaje humano elegido como jinete se mantiene la vista de montura de Animales.

`controles` devuelve los nombres anatómicos, huesos y posiciones de los controles; `controles {"estilo":"aros"}` o `{"estilo":"puntos"}` cambia su visualización. En patas traseras: `rearHipL/R` = cadera, `upperLegL/R` = rodilla, `lowerLegL/R` = corvejón, `footL/R` = menudillo, `toesL/R` = casco. Delanteras: `shoulderL/R` = hombro, `upperArmL/R` = codo, `lowerArmL/R` = carpo, `handL/R` = menudillo y `frontHoofL/R` = casco. `arrastrar` admite también estos controles y sus nombres reales.

```bash
node herramientas/ia.mjs ikCambiar '{"cadena":"footR","ik":true,"f":12}'                     # sin saltos
node herramientas/ia.mjs controlTemporal '{"tipo":"ik","cadena":"footR","desde":0,"hasta":40}'  # → id
node herramientas/ia.mjs trayectoria '{"mover":{"cadena":"footR","f":18,"pos":[0.1,0.35,0.3]}}' # solo esa clave
node herramientas/ia.mjs hornearControl '{"id":"tmp…"}'                                     # o {"id":…,"cancelar":true}
node herramientas/ia.mjs marcador '{"accion":"poner","f":30}'
node herramientas/ia.mjs retimer '{"id":"mk…","f":40,"base":true}'                         # estira 0–30 a 0–40
node herramientas/ia.mjs copiarMatriz '{"tipo":"relativa","activo":"head","huesos":["handR"],"f":0}'
node herramientas/ia.mjs pegarMatriz '{"desde":0,"hasta":60}'                              # la mano sigue a la cabeza
node herramientas/ia.mjs pivote '{"en":"footL","girar":["hips"],"grados":[0,90,0]}'         # girar sobre el pie
node herramientas/ia.mjs multikey '{"huesos":["head"],"escala":1.5}'
```

- `ik.objetivo` y `mover` **suman** a lo que ya hay: son desplazamientos, no posiciones absolutas.
- Para llevar algo a una posición exacta del mundo:
  - `trayectoria` con `mover`;
  - `copiarMatriz` / `pegarMatriz`;
  - o un control temporal y su `trayectoria`.

## Editar capa de movimiento dentro del Estudio

El Taller incrustado en el Estudio tiene almacenamiento propio (el navegador lo separa): para llevarle un trabajo hecho en el Taller suelto, saca el documento con `proyecto {"accion":"json"}` y ponlo con `proyecto {"accion":"cargar","doc":…}` usando `TALLER_SESSION=<studioSession>` (en un lote con `--lote`, porque el documento es largo). Después, «Usar en la historia» en la pestaña Comport.
