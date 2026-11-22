# Taller facial — versión única (11/11/2026)

## Webcam MediaPipe (15/11/2026)

**Modo de gestos** ofrece Normal (1×), Gestos exagerados (1,75×) y Muy exagerados (2,5×), multiplicados por la intensidad webcam y limitados a pesos faciales de 0 a 1. Normal mantiene el parpadeo y su calibración independiente. Los modos exagerados omiten los umbrales personalizados y el neutro de los canales oculares; usan la respuesta fija del detector con la intensidad del modo. El panel de calibración de ojos queda visible y deshabilitado, conservando los ajustes para volver a Normal.

Estudio › Facial › Webcam, con Don Quijote u otro personaje con canales ARKit/Faceit. Selecciona una cámara y pulsa **Activar webcam**. Solo pide vídeo; procesamiento local en worker con SDK, WASM y modelo incluidos en `vendor/mediapipe/`. No requiere un servidor externo ni sube imágenes.

**Calibrar rostro neutro** se usa mirando de frente con los ojos abiertos y la boca relajada. **Calibrar cierre de ojos (5 s)** mide el pico de cada ojo mientras los cierras completamente y parpadeas. Cada ojo tiene umbral propio: bájalo si queda entreabierto. El valor inicial es 0,50; los parpadeos responden más rápido y no dependen de la intensidad general de la webcam. Los lados son anatómicos; solo la vista previa se refleja como espejo. MediaPipe no proporciona `tongueOut`.

La webcam es una capa temporal sobre los controles existentes. **Detener webcam**, cambiar de personaje/taller o salir de la página libera la cámara y restaura la capa anterior. No modifica el GLB ni guarda cambios en la historia. **Grabar gestos** captura hasta 30 s de curvas; descarga el JSON e impórtalo en la biblioteca facial para reutilizarlo mediante el flujo habitual.

API de inspección facial: `window.tallerFacial.webcam.state` (incluye señal y peso aplicado de ambos parpadeos). Comando IA del Taller: `webcam`, con `accion: estado | iniciar | detener` y `sesion` igual a `workshopSession` del marco facial. No activa cámaras al abrir el editor.

Un solo editor para cualquier personaje que llegue con **rig corporal Mixamo + shape keys FACEIT/ARKit**. Ningún personaje tiene código, nombres de módulo ni reglas propias (12/11/2026: `ExpresionesVida`, `ManosVida`, `LifeMovement`, `DientesSonrisa`; las texturas grandes se detectan por tamaño, no por nombre de material). Todo vale para cualquier modelo y cualquier historia. Lo que cambia de un modelo a otro son datos (`rigMap`, `rigGain`, `perfiles-personaje.json`).

Ubicación: `Estudio/Talleres/taller-animacion/facial/` (dentro de `D:\Español\Generador,visor, estudio`). Estudio, Taller de animación y Taller facial son un mismo elemento: el Taller de Animación (5189) sirve esta carpeta en `/facial/` tal cual (sin Vite) y **solo se abre dentro del Estudio** (visor `localhost:3000` › Taller facial, en sesión `?perfil=general&workshopSession=…`); abierta sola muestra un aviso. Ya no existe el servidor 8797 ni nada del taller en `Vale 2`.

Modelos: los GLB que entran al estudio están en `SpanStories-Ciudades/assets/avatar/` (`rachel.glb`, `mia.glb`, `don-quijote.glb`), declarados en `SpanStories-Ciudades/Mundo/Personajes/personajes.json`. `perfiles-personaje.json` apunta a ellos con `glb` (no se copian). El exportador de Rachel (`Vale 2/rachel_threejs/exportar_rachel.py`) debe recibir esa carpeta como salida.

## Modos y escenario de la historia (17/11/2026)

- **En la historia** (se abre así desde un personaje de la escena):
  - El visor es el escenario vivo de la historia (`EscenaViva.mjs`) y la cámara apunta siempre al personaje, en plano de Rostro o de Cuerpo entero.
  - «Usar en la historia» la aplica en un clic.
  - «Vida en reposo en la historia» decide cómo vive el personaje cuando está quieto (`VidaEnEscena.mjs`).
- **General · para todos**:
  - Correcciones de gestos, expresiones de la vida y visemas para todos los personajes y todas las historias (`CorreccionesFaciales.mjs`, `ModoGeneral.mjs`).
  - Calibración de cada personaje.
  - «Dónde se usa» con «Actualizar».
- Detalle en `../docs/ESTADO.md` (17/11/2026).

## Secciones del panel

1. **50 emociones y comportamientos** — `ActingLibrary.mjs`. Cada una es rostro (actitudes que el compilador convierte en curvas con anticipación, sobrepaso, desfase entre lados y parpadeos) + cuerpo (poses clave del motor `taller-animacion/src/core/acting.js`, con contactos medidos en cada personaje y pies sobre el suelo).
   - **Configuración femenina / masculina** (selector «Configuración»): las 50 existen en las dos. El estilo es un dato de la actuación (`acting.style` = `F`/`M`; receta en `ACTING_BY_ID` con clave `id@F` / `id@M`), no del personaje: el perfil (`perfiles-personaje.json` → `estilo`) solo propone el de partida. Hay variantes de autor (`VARIANTS` en `ActingLibrary.mjs`: F en 01, 02 «muy alegre» según las referencias, 03, 04, 10, 11, 18, 33, 38, 39, 40, 49; M en 03); el resto se adapta con el perfil de estilo (`FACE_STYLE`, `BODY_STYLE`: cabeza ladeada, contrapposto, apoyo, codos, manos, cejas y mandíbula).
   - **Colisiones de brazos**: además del tronco, el motor (`acting.js` → `limbGuard`) aparta antebrazo y mano de los muslos (pantalón) y del otro brazo, con grosores medidos en la malla. Diagnóstico: `armPenetration(rig)` y `limbPenetration(rig)`; en la hoja de contacto, `collisions:true` los escribe en cada celda.
   - **Articulaciones naturales** (12/11/2026, `acting.js` → `naturalArms`, límites en `WRIST_LIMITS`): la prono-supinación la hace el antebrazo (la muñeca solo guarda un resto ≤ 22°), con rango pronación 90° / supinación 95° desde la posición neutra y un límite continuo (la palma nunca «da la vuelta»); muñeca dentro de una elipse (extensión 60°, flexión 70°, cubital 30°, radial 20°); en un brazo libre el exceso de giro lo absorbe primero el húmero (≤ 40°); los contactos se resuelven ya con la muñeca natural; la clavícula acompaña al brazo desde ~35° de elevación (≈ 30° con el brazo arriba). Diagnóstico: `wristAngles(rig)`; interruptores de prueba `ANATOMY.on/guards/contacts`.
   - **Axilas** (`skinfix.js` → `smoothArmpitWeights`, al cargar, sin tocar el GLB): suavizado laplaciano de pesos solo entre tronco, clavícula y brazo, cerca del hombro y en vértices que ya dependen de esos huesos. Las medidas del cuerpo del motor se siguen tomando con los pesos originales (`withOriginalSkin`).
   - **Accesorios** (`accessories.js` → `installAccessoryCollisions`, al cargar): detecta sin nombres lo rígido del tronco que va a la espalda (mochila, capa rígida, carcaj…) y hace que el pelo largo (huesos de cabeza/cara/cuello por debajo del cuello) se apoye por fuera en el sombreador. Los brazos ya contaban la mochila como parte del tronco.
   - **General + ajustes por modelo**: articulaciones, axilas y accesorios se preparan al cargar con `bodyprofile.js` → `prepareCharacterBody(root, rig, perfil.cuerpo)`, igual en los dos talleres. Lo propio de cada personaje va en `perfiles-personaje.json` → `cuerpo` (`articulaciones`, `axilas`, `accesorios`; ver la nota del archivo); sin ese bloque se usan los valores generales.
   - Los puntos de la cara y del tronco se miden con la posición deformada real de cada vértice (`restVertex`): hay GLB (Mia) cuya malla cuelga de un nodo desplazado con `bindMatrix` identidad.
2. **Intensidad** — de la actuación (rostro + cuerpo), y rostro y cuerpo por separado. 75 % = actuación de referencia; 100 % exagera; por debajo suaviza sin abrir los brazos en cruz y sin perder contactos ni parpadeos.
3. **Fuerza de las shape keys en este personaje** — general y por shape key (hasta 300 %), con *Calibrar automáticamente* (mide cada shape key frente a la distancia entre ojos) y *Sin corrección*. Se guarda por personaje y viaja con la actuación al Taller y al horneado. Por shape key también se edita el pico de la curva en la actuación.
4. **Vida del personaje** — `CharacterLife.mjs` + `LifeCharacter.js` (+ `ExpresionesVida.js`, `ManosVida.js`; corrección opcional de dientes al sonreír `DientesSonrisa.js`, solo si el perfil trae `cuerpo.dientesConSonrisa`): respiración, parpadeo, mirada (cámara, cursor, deambular), cabeza, postura, peso, gestos y reacciones de reposo, ánimo, energía, piso, cámara lenta, expresiones rápidas y reacción al toque (clic sobre el personaje). Si una actuación o un clip del Taller lleva el cuerpo, la vida deja el esqueleto quieto y mantiene habla, pelo y trenza.
5. **Habla** — texto → 13 visemas del español (latam / España). Si el modelo no trae visemas `vis_*`, se forman con sus canales ARKit.
6. **Controles manuales** — visemas, 52 ARKit, otros morphs, ojos y mandíbula por hueso, clips del GLB y «Todo a cero».
7. **Físicas de personaje** — colisiones del cuerpo (Rapier), pelo dinámico por color de textura y trenza (caja y cadena). Valores de partida en `perfiles-personaje.json`; lo que se ajusta en el panel se guarda en el navegador para ese personaje.
8. **Biblioteca facial**, pista, curvas, variantes, importación/exportación y **Retargeting facial** (mapa de canales para rigs con otros nombres): sin cambios.

## Actuaciones cotidianas · cuerpo (14/11/2026)

Segunda lista, aparte de las 50 procedurales (que no cambian): **50 actuaciones de la vida diaria** en `ActuacionesCotidianas.mjs` (`DAILY_ACTINGS`, ids `daily-1`…`daily-50`), ordenadas por categoría › subcategoría: Conversación (explicar, escuchar, discutir, dar indicaciones, contar una idea), Saludos y despedidas, Teléfono y pantallas, Reacciones del público, Esperar y descansar, Sentados a la mesa o en el sofá y Tareas cotidianas. Desde el 15/11/2026 llevan también rostro (`faceStatus:'listo'`, ver la sección siguiente); `faceNotes` es el guion de cada cara.

- **Fuente**: clips de mocap reales de `biblioteca/paquetes/` (no se copian ni se mueven). Cada entrada guarda `body:{raiz:'paquetes',ruta}` y su `perfil` (`male`/`female`/`unspecified`, el de la subcarpeta Masculinas/Femeninas/Sin especificar). Sin repetidos y sin elegir a la vez la versión Loop y la no-Loop del mismo movimiento.
- **Interfaz**: en la misma lista de «50 emociones y comportamientos», debajo de las 50 (grupo «51–100 · Actuaciones cotidianas»). El buscador filtra las dos. Al elegir una se carga su clip de mocap en el personaje; «Intensidad de la actuación» y «Solo cuerpo» mezclan el movimiento con su postura media: 0 % = quieto en esa postura, nunca la pose T (el rostro queda inactivo hasta que se le añada). Elegir una de las 50 de cuerpo + rostro suelta el clip. La URL del clip se resuelve con /api/biblioteca (las raíces del servidor se llaman r0, r1…).
- **Cómo suena el cuerpo** (`CuerpoBiblioteca.mjs`): se pide `/bib/paquetes/<ruta codificada>`, se lee con el FBXLoader (servido por `/ecosystem/vendor/…`, en `herramientas/ecosystem.mjs`, con un parche de una línea para los FBX de «Conversations Michael 8») y se mide con `Rig`; `clipFromAnimation` lo pasa a clip canónico y se hornea sobre los huesos del personaje (sin avance en x/z; el rostro no se toca). Los clips sentados esperan una silla o un sofá en la escena.
- **Que no se traben (15/11/2026)**: (1) `forzarEscritura(mixer)` antes de cada `mixer.update(0)`: three.js solo reescribe un hueso si su valor cambió, y `vida.antes()` devuelve cada fotograma el esqueleto a reposo, así que en los tramos quietos del mocap el personaje saltaba a la pose T. (2) `recortarSaltos` quita los fotogramas de pose de enlace del principio y del final que traen casi todos los FBX/GLB de los paquetes. (3) `cerrarBucle` funde los últimos 0,6 s hacia el primer fotograma: las 50 se repiten sin congelarse al final ni dar tirón (el fundido fija el camino de giro por hueso). Pruebas en `ActuacionesCotidianas.test.mjs`.
- **Prueba**: `node --test facial/ActuacionesCotidianas.test.mjs` (50 entradas, ids y rutas únicos, rutas existentes, sin loop/no-loop repetidos, sin choque de ids con `ACTINGS`).

## Actuaciones cotidianas · rostro (15/11/2026)

Las 51–100 ya llevan cara: `RostrosCotidianos.mjs` (`ROSTROS`, una ficha por `daily-N` con su `intencion`). El panel las marca «mocap + rostro» y «Solo rostro» vuelve a funcionar en ellas.

- **Escritura en fase**: cada ficha tiene `base` (expresión de reposo del ciclo), `beats` `[fase, pose, entrada, sobrepaso]`, `ojos`/`mira` (sacadas ≤ 0,08 s), `habla`/`risa`/`grito` por tramos y `ritmo` de parpadeo (calma, viva, fijo, tenso, triste, pantalla). `rostroEnBucle(id, D, {eventos})` lo compila al largo `D` del clip: cejas y ojos antes que la boca, lado derecho 12 ms después, sobrepaso y asentamiento, desgaste en las pausas y retorno a la base → el bucle no salta (`loop:true`, validado por `FacialCore.validatePreset`).
- **Habla procedural**: sílabas del español (a-e-i-o-u con su frecuencia, cierres p/b/m y f/v), frases de 1–2,4 s con pausas y acentos de cejas (`'cejas'`) o de ceño (`'ceño'`, para discutir) en las tónicas. Para diálogo real se sigue usando la sección Habla.
- **Mismo reloj que el cuerpo**: `GeneralFacialEditor` → `loadDaily` mide los giros de cabeza del mocap horneado (`headMoments` → `momentosDeCabeza`, cuello·cabeza) y pasa esos instantes al compilador: los parpadeos caen primero ahí, luego en los cambios de pensamiento y solo después rellenan huecos (nunca metrónomo). En las de asentir (`acentoCabeza`) las cejas suben con cada cabeceo. La biblioteca facial recibe el proyecto con `selectActing(proyecto,{clock})` y evalúa en el tiempo del clip.
- **Parpadeo**: cierre rápido con ease-in, contacto con rebote (1 → 0,9), apertura lenta; cierra desde donde esté el párpado y no parpadea si ya está casi cerrado (risa). La ceja baja y la mejilla sube un pelo con cada cierre.
- **Pruebas**: `node --test facial/RostrosCotidianos.test.mjs` (50 fichas, bucle sin salto en 2,2–24 s, parpadeos irregulares y en los giros, asimetría cierre/apertura, habla/escucha, sin saltos a 60 fps).

## Comprobar con otro personaje

**Ojos sin hueso (15/11/2026)**: si el modelo no trae huesos de ojo (Don Quijote: rig Faceit sobre malla Tripo de una pieza, solo shape keys `eyeLook*`), `LifeCharacter` → `_ojosPorMorph` coloca dos ojos virtuales en la cabeza (centro de lo que mueve cada `eyeLookOut`), mide el recorrido angular de las shape keys y convierte la mirada (sacadas, cursor, cámara, reflejo al girar la cabeza) en `eyeLookIn/Out/Up/Down`. «Ojos ↔ / ↕» de los controles manuales hacen lo mismo. Con huesos de ojo (Rachel, Mia) nada cambia.

El contrato de vida se mide en el modelo (`contractFor`): cabeza por el mapa Mixamo, ojos y mandíbula por nombre de hueso, morphs de sus mallas. Si falta algo (ojos, visemas, morphs) la sección sigue funcionando con lo que haya.

Revisión visual rápida sin reproducir: `ActingContactSheet.mjs` (consola del marco del Taller facial dentro del Estudio):

```js
const hoja=await import('./ActingContactSheet.mjs?v='+Date.now());
await hoja.sheet([{acting:'behavior-05',t:'peak',view:'body'},{acting:'behavior-05',t:'peak',view:'face',intensity:1}]);
await hoja.strip('behavior-26',{n:10,style:'F'});   // secuencia (style: 'F' | 'M')
hoja.clear();
```

## Pruebas

- `taller-animacion`: `npm test` — 50 identidades, neutralidad, intensidad, curvas, calibración, pies y contactos en dos esqueletos Mixamo de distinto tamaño, sin saltos a 60 fps, horneado.
- Las de esta carpeta van incluidas en `npm test` del Taller (`facial/*.test.mjs`).

## Archivado

La demo antigua específica de Rachel (panel LifeCharacter propio, `workshop.html`, `FacialWorkshopBridge.mjs`, `LifeCharacterAccess.mjs`, `rachel.json`) y las variantes de prueba de integración están en `D:\Español\RESPALDO_NO_CARGAR\versiones-antiguas\taller-facial-20261111`. No se cargan.
