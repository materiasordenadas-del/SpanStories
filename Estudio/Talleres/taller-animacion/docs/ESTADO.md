# Taller de Animación — estado

**Versión 0.3.0 · 8/11/2026** · app independiente · `npm run dev` → http://127.0.0.1:5189
(en Claude Code: configuración `taller-animacion` de `Animación 3D/.claude/launch.json`)

Objetivo: la misma funcionalidad y biblioteca que ActionForge, con nombre, código y aspecto propios, y manejable por IA.

## Hecho

**Caballo + jinete entre Estudio y talleres (20/11/2026)**
- Pareja genérica: cualquier caballo de la escena (Rocinante u otro del catálogo) y como jinete cualquier otro actor (Don Quijote, maniquí…). Ya no hay ids fijos `rocinante`/`don-quijote` (`animales.js`: `castOf`, `horseIn`, `riderIn`).
- Al abrir Biblioteca › Animales en una escena con caballo y jinete, el jinete aparece montado (Reposo). Si la actuación de la historia ya es una escena montada, el Taller la reconstruye al abrirse (`restoreMounted`, leyendo el reparto del contexto y no del modo, que al arrancar aún no es «escena»).
- Las «Escenas con jinete» (Favoritos) se arrastran a la tira Base: caballo y jinete la ejecutan juntos. Comando IA `soltarAnimal {archivo:'fav:desmonte', f:0}` (misma ruta que soltar).
- Corregido el caballo retorcido en el Estudio: la exportación usaba como «jerarquía original» un clon ya reconectado por el editor. Los padres del GLB quedan en `userData.horseSourceParents` (`prepareHorseHierarchy`) y el `Rig` los usa; la pareja lee una copia limpia del GLB. Prueba en `tests/horse-editor.test.js`.
- Vista: con escenario vivo la cámara ya no sigue el recorrido del caballo; Estudio → Taller → Estudio conserva el encuadre. Comando `escena` devuelve `vista_del_estudio_al_entrar`.
- Taller facial: `/ecosystem/body/` sirve también `horse-editor.js` y `horse-motion.js` (que ahora importa `rig.js`); sin ellos el facial no arrancaba (pantalla negra).

**Rocinante en el editor (18/11/2026)**
- Corrección de identificación ARP: codo y rodilla usan el origen de `thigh_twist`, no el inicio de `thigh_stretch` en medio del segmento. Las mitades de deformación permanecen unidas. Capa de restricciones compartida por IK/FK y modos Anatómico/Estilizado/Libre, sin editar archivos de esqueleto. Compatibilidad de clips v2, nuevos clips v3. Alcance, calibración y limitaciones: `docs/ANATOMIA-EQUINA.md`.
- Controles anatómicos: 25 pivotes, incluidas ambas caderas traseras y los cuatro cascos. Rodilla y corvejón son independientes; puntos y aros coinciden con el origen real del hueso. El panel usa nombres de caballo sin cambiar los identificadores ni las claves nativas. Comando `controles` para consultar pivotes y alternar puntos/aros.
- Los caballos AutoRig Pro sin jinete se editan como personaje principal: puntos sobre el modelo, Mover/Rotar, IK/FK de las cuatro patas y secuencia en la tira Base inferior. El panel Editar movimiento muestra un esquema de caballo.
- Se conservan las ramas de deformación en clips nativos; el perfil conecta sus descendientes en memoria conservando matrices de mundo, piel y matrices de enlace. IK usa una cadena de cuatro puntos por pata y conserva la pose FK si no hay retoques.
- Clips propios, capas y guardado conservan también posiciones y escalas nativas. El enlace anterior de la caminata de Rocinante se recupera con la adaptación Horse y su corrección de contacto. La vista con jinete sigue separada.
- Pruebas específicas: `tests/horse-editor.test.js`, `tests/quadruped.test.js`; comprobación visual en el Taller suelto (5189). Sin validación de este flujo dentro del Estudio incrustado.

**Personajes y biblioteca**
- Personajes **ya rigueados** (no hay auto-rig, por decisión del usuario): maniquí propio, maniquíes de Quaternius (masculino y femenino), **Personaje Tripo (Mixamo)** y cualquier GLB/FBX con esqueleto. Detecta Mixamo, Unreal/Quaternius, Rigify, VRM y nombres genéricos, y permite editar el mapeo.
- Librerías separadas, nunca mezcladas: **Mixamo** (`biblioteca/mixamo`, hoy Walk y Female Start Walking), UAL 1 (43), UAL 2 (43), Humane (24), Fútbol mocap (21), Generados (14) y Tuyas. Dentro de cada una se filtra por categoría y por búsqueda, con miniaturas o lista.
- **Descargar de Mixamo** (librería Mixamo › «Descargar de Mixamo»): marcador «Taller ← Mixamo» que se pulsa en mixamo.com y abre una ventanita del Taller. Basado en el gist de Jake Cattrall, reescrito: usa la API de Mixamo por id (sin selectores ni clics), comprueba el job_uuid y el nombre del archivo; el servidor baja el FBX, lo verifica (HTTP 200, tamaño, cabecera FBX, curvas) y solo entonces lo apunta en `biblioteca/mixamo/_mixamo.json`. Progreso por id (reanudable sin saltos ni repeticiones), una sola tanda a la vez, de los paquetes solo lo que no existe suelto. Código: `herramientas/mixamo.mjs`, `public/mixamo-puente.html`, `public/mixamo-descargador.js`; prueba `tests/mixamo.test.js`; comando IA `mixamo`. Verificado con 2 exportaciones reales.
- Una animación de Mixamo importada (soltándola o con `importar`) se guarda en `biblioteca/mixamo` y aparece en la librería Mixamo. Un personaje importado se guarda en `biblioteca/personajes`.

**Animar**
- Tiras encadenadas (fundido, velocidad, bucle, espejo, al revés, en el sitio por ejes, silenciar).
- Capas: aditiva o sustituye, M/S/L, peso con claves, máscara, fusionar abajo, duplicar, devolver a la base, aplanar.
- Claves automáticas o manuales; interpolación automática, suave, lineal o escalón.
- Rotar, mover cadera y **escalar** huesos. **Varios a la vez**: Mayús+clic, caja (B), con hijos, el otro lado.
- IK/FK de brazos y piernas con polos; espejo X al girar; imán de 5° o 15°.
- **Copiar/pegar transformaciones**: local, global o reflejado, en un fotograma o a lo largo del tiempo.
- Ajustar con deslizadores, con **claves** y **por tramo**.
- Poses de cuerpo y de mano (incluidas y propias).

**Línea de tiempo**
- Tiras, **hoja de claves** (selección por caja, mover, copiar/pegar, borrar, escalar en el tiempo, limpiar, hornear) y **editor de curvas** (Euler X/Y/Z, arrastre de valor o de tiempo, escala automática, ocultar canales).

**Motion Lab**
- Estilos (cansado, enérgico, sigiloso, feliz, triste, orgulloso, caricatura, robot), amplitud por zona, solapamiento, suavizado, postura, pecho, cabeza, rebote, bajar cadera, a saltos, bucle sin salto, espejo y al revés.
- **8 direcciones**, girando todo el cuerpo o de lado mirando al frente. Se guardan en Tuyas.

**Escena**
- **Objetos en la mano** (espada, bastón, antorcha, farol, escudo, pistola de juguete, teléfono, taza, o un GLB propio), ajustables con el gizmo y exportados con el personaje; botón «el brazo sigue al objeto».
- **Escenario de referencia** (muro de 1 m, mesa y silla, casa, árbol, manzana de ciudad, calle de pueblo, claro del bosque, pieza propia) y vista de mapa desde arriba.
- **Cámara de plano**: focal y sensor, formato, resolución, inclinación, desplazamiento, recortes, mirar por la cámara, mini vista, tercios, centro, diagonales, zonas seguras y foto PNG.
- **Vista cuádruple**, piel de cebolla configurable, seguir, rayos X, gris y alambre.

**Exportar**
- **three.js (principal)**: paquete con GLB (todas las animaciones con nombre), `taller-three.js` (`cargarPersonaje` → `reproducir(nombre)` con fundido), `reproductor.html` y `LEEME.md`, en ZIP o en `exportaciones/`. Verificado: el reproductor carga y anima el personaje Tripo.
- GLB (con personaje o solo esqueleto), **FBX con Blender 5.2** en segundo plano (verificado), clip JSON, conjuntos y proyecto.

**Proyectos y preferencias**
- Guardar, abrir, autoguardado, enlace con el estado y **espacios de trabajo propios**.
- Preferencias: clave automática, interpolación por defecto y fps.

**IA**
- `src/ia.js` (unos 40 comandos), puente `/api/ia` y `node herramientas/ia.mjs`, con lotes. Guía en `IA.md`, instrucciones en `AGENTS.md` y skill `taller-animacion` en `Animación 3D/.claude/skills/`.
- Verificado con `herramientas/ejemplos/prueba-completa.json` (16 pasos, todos correctos, incluidas captura y exportación).

## Límites conocidos

- La miniatura de cada clip es una foto fija, no un vídeo al pasar el ratón.
- En las curvas, las rotaciones se editan como Euler XYZ; cerca de ±90° en Y puede haber saltos visuales (la evaluación usa cuaterniones y no se ve afectada).
- El modo «de lado» de las 8 direcciones es una aproximación (gira piernas y cadera, como mucho 70°).
- El puente IA necesita la página abierta en un navegador.
- Descargar de Mixamo necesita ventanas emergentes (Chrome, Edge o Firefox). El navegador integrado de Claude no las abre: allí se probaron la API de Mixamo y el guardado verificado, no la cadena marcador → ventanita.
- La primera vez que entren cientos de FBX de Mixamo, la librería tarda en leerlos (luego quedan en caché).

## Texto → Animación (Kimodo local) · 8/11/2026
- Pestaña **Texto** (columna derecha): escribes en inglés lo que hace la persona (uno o varios tramos), **Generar**, y el clip se guarda en `biblioteca/kimodo` (librería «Kimodo») y se aplica solo al personaje puesto (Mixamo, Quaternius…). Comando IA `texto` (timeout 600).
- Solo escribe 22 huesos del cuerpo (cadera a cabeza, brazos, piernas). Nunca toca dedos ni el rig facial.
- Motor: `kimodo/` (fuente de localai-org/kimodo.cpp con ggml 8c63e709, compilado con GCC portátil, solo CPU). Modelos en `kimodo/modelos`: SOMA RP v1.1 + Llama-3-Kimodo Q4_K + tokenizer. Puente en `herramientas/kimodo.mjs` (modo `--server`: el modelo queda en memoria).
- ~2–4 min por animación de 3–4 s en CPU. El .exe no acepta tildes en rutas: se le pasan rutas relativas a `kimodo/`.
- Recompilar: el compilador está en `D:\Kimodo\herramientas` (GCC no admite espacios en su propia ruta). Copiar al lado del .exe libstdc++-6, libgcc_s_seh-1, libwinpthread-1, libgomp-1 y libdl.
- **Guardar las que gustan**: cada generación es un **borrador** (`biblioteca/kimodo`, librería «Kimodo»). Con **★** (o «★ Me gusta: guardar» al terminar) pasa a `biblioteca/kimodo/guardadas` → librería **«Kimodo guardadas»**, con el nombre que elijas; si estaba en la tira, la tira pasa a la guardada. 🗑 descarta un borrador, «Borrar borradores» los borra todos sin tocar las guardadas. «Guardar la pose de este fotograma» la deja en Biblioteca › Poses. Comando IA `textoGuardar` (sin archivo = la última).

## Personaje por defecto y adaptación entre rigs · 8/11/2026
- **Predeterminado: maniquí de Quaternius.** Se recuerda (`quatInfo`, `charInfo:<id>`) y se pone al arrancar sin esperar a leer la biblioteca. El maniquí propio (dorado) solo sale si lo eliges tú (`propioElegido`); su esqueleto usa ahora nombres Mixamo (`mixamorigHips`…).
- **Clavícula medida desde su propio reposo** (unida al pecho), no forzada a horizontal: cada rig la tiene en otro ángulo (Quaternius ~40° atrás, Mixamo ~30° abajo) y forzarla sacaba los hombros (`rig.js`).
- **Reposo = pose de enlace de la piel** (`poseToBind`), y si la animación tiene el cuerpo girado 90°/180° respecto al reposo (FBX de Mixamo con el esqueleto tumbado en Z), se endereza antes de medir (`alignRestTo`, en `clipFromAnimation`). Arregla Walk y Female Start Walking, que flotaban una altura de cadera.
- Biblioteca por fichas (carga perezosa). IndexedDB `taller-animacion` v2:
  - `indice`: un solo registro con la ficha de cada clip (nombre, duración, bucle, avance), sin pistas. Al arrancar solo se lee esto; los archivos nuevos o cambiados se convierten en segundo plano. `LIB_INDEX_V` en `src/main.js` rehace el índice desde la caché sin descargar.
  - `cache` (clave `v7|url|bytes|mtime`): las pistas completas por archivo. `app.ensureClip(id)` las lee al usar el clip (clic, tira, IA, Motion Director, exportar). Si el motor encuentra una tira sin pistas, las pide y vuelve a pintar (`engine.onMissingClip`).
  - `miniaturas`: dibujos WebP de las tarjetas por personaje.
- El panel crea las tarjetas por tandas de 60 (`LIB_BATCH`) y dibuja solo las visibles. El servidor guarda en memoria la lista de `/api/biblioteca` (se rehace con `fs.watch`) y sirve `/bib/` con ETag.
- **Personaje con animaciones**: un archivo de `biblioteca/personajes` con 2 o más animaciones las aporta al repertorio (si el nombre dice Mixamo, a la librería «Mixamo»). Ejemplo: `Anciano Meshy (Mixamo).glb` (Meshy, rig Mixamo de 23 huesos sin dedos, 14 animaciones). Probado en los dos sentidos: sus animaciones en Quaternius y las de Quaternius/Mixamo/Generados en el Anciano.

## Articulaciones naturales, axilas y accesorios · 12/11/2026

- `src/core/acting.js` → `naturalArms` / `naturalArmQuats` (`WRIST_LIMITS`): torsión de la palma en el antebrazo, rango de prono-supinación con límite continuo, elipse de muñeca, húmero que absorbe el exceso en brazos libres, contactos IK resueltos con la muñeca natural y clavícula con ritmo escápulo-humeral. Pasada antes de las guardas de colisión y otra sin húmero después. Pruebas: «articulaciones naturales…» y «el límite de prono-supinación es continuo…» en `tests/acting.test.js`.
- `src/core/skinfix.js` → `smoothArmpitWeights` (al cargar en `main.js` y en el Taller facial): pesos de axila suavizados en memoria; `measureBody` mide con los originales.
- `src/core/accessories.js` → `installAccessoryCollisions`: mochila y similares detectados por geometría y pesos; el pelo largo no los atraviesa (sombreador).
- Todo se prepara al cargar con `src/core/bodyprofile.js` → `prepareCharacterBody`, con los ajustes por modelo de `perfiles-personaje.json` → `cuerpo` (servido en `/ecosystem/profiles`). Concepto general; lo individual, en datos.
- Pendiente: la guarda de colisión tiene saltos de un fotograma ya existentes en algunas transiciones (Mia: 32F, 02M, 05M, 10M, 32M, 44M; al sentarse en 07, donde la anatomía los acentúa un poco).

## Taller facial dentro del Taller · 12/11/2026

- El Taller facial se movió (no copió) de `Vale 2/rachel_threejs` a `facial/` y se sirve en `/facial/` desde `herramientas/ecosystem.mjs` (archivos tal cual, sin `__pycache__`, `licenses` ni `.py`). Solo se abre dentro del Estudio; el panel de comportamientos fuera del Estudio lo indica.
- `rachel.glb` y `mia.glb` están en la carpeta de modelos del estudio (`SpanStories-Ciudades/assets/avatar`), con Mia añadida al catálogo `Mundo/Personajes/personajes.json`. Las pruebas leen Rachel desde ahí.
- Servidor 8797 retirado (también de `.claude/launch.json`); `Abrir-Rachel.*` archivados en `RESPALDO_NO_CARGAR/versiones-antiguas/taller-facial-20261111`.

## Borrador por actuación del Estudio · 14/11/2026

- Dentro del Estudio, el Taller de animación guarda solo, mientras se trabaja, un borrador por actuación (personaje + escena + papel + acción) en IndexedDB `taller-animacion` › `projects` › `studio:<clave>` (`src/ui/behaviors.js`, llamado desde `autosave()` de `src/main.js`). Al volver a entrar en esa actuación se recupera, aunque no se pulsara «Usar en la historia». No aparece en la lista de proyectos.
- El Taller facial guarda su borrador en localStorage `spanstories.facial-draft.v1:<clave>` (`FacialLibrary.mjs`, opción `draftKey`) y lo recupera al abrirse para la misma actuación, también cuando el Estudio lo abre directamente (`StudioWorkshop.tsx` envía `draftKey`). Gana la versión más reciente entre el borrador facial y el del Taller de animación.
- Verificado en el navegador con Mia: expresión aplicada, salir y volver a entrar la conserva en ambos talleres.

## Edición FK/IK, línea de tiempo y curvas al estilo iClone · 15/11/2026

Flujo: elegir hueso → modificar con FK o IK → clave → curva → combinar → exportar. Todo se guarda editable en el documento (y en el enlace); el GLB se hornea solo al exportar.

**FK/IK (`src/core/animation.js` → `applyIK`, `src/main.js`)**
- Herramienta **🖐 IK** (tecla A o T): al elegir una mano o un pie se enciende el IK de su cadena y el gizmo mueve el objetivo (el brazo o la pierna siguen); un codo o una rodilla mueven su polo; la cadera se traslada; el resto gira (FK). «Mover» sigue trasladando el hueso tal cual (lo protege `tests/gizmo.test.js`).
- **Mezcla IK↔FK con claves**: pista `ik:<cadena>:w` (0 = FK, 1 = IK); deslizador en Transformar al elegir una caja IK o un polo.
- **Anclas en el mundo**: `pinIK(cadena, f0, f1)` / `unpinIK` → pistas `ik:<cadena>:abs` (posición), `:absq` (giro) y `:absw` (peso, con fundido de entrada y salida). Botones «📌 Anclar aquí», «📌 Tramo…» y «Soltar». Con los pies anclados, mover la cadera dobla las piernas sin arrastrarlos.
- La caja IK se pone **roja** si el objetivo queda fuera de alcance y **naranja sólida** si está anclada.
- La evaluación parte siempre de la animación base: cualquier fotograma da la misma pose sin importar el orden.

**Línea de tiempo**
- Las claves que caen dentro de una tira **viajan con ella** al arrastrarla (Alt: solo la tira).
- **◆◆** clave de toda la pose; etiquetas legibles para las pistas IK.

**Curvas**
- Interpolaciones nuevas por tramo: «Sale lento», «Llega lento» y **«Curva propia»** (Bézier de tiempo, `k.b = [x1,y1,x2,y2]`): botón **✎ Curva** con dos asas y curvas hechas (anticipación, pasarse y volver…). Curva el avance del tramo, así que sirve igual para rotaciones (cuaterniones) y posiciones, sin saltos de Euler.
- **Curva de tiempo de la tira** (`s.warp`, en Animar › Tira): reparte la velocidad sin cambiar principio ni fin.
- **〰 Suavizar** pistas (junto a 🧹 limpiar y 🔥 hornear, que ya existían).

**Contacto y limpieza**
- Animar › Rig › «Los pies no atraviesan el suelo» (`doc.floor`) y **«📌 Fijar pies apoyados»** (`lockFeet`: detecta los apoyos y ancla cada pie → quita el patinaje). No detecta apoyos en clips «en el sitio» (ahí el pie patina a propósito).

**IA**: comandos `ikPeso`, `anclar`, `fijarPies`, `curva`, `curvaTira`. **Pruebas**: `tests/fkik.test.js` (8).

## Edición fácil tipo iClone y límites superados · 15/11/2026 (2)

**Panel «Editar movimiento»** (Animar, arriba; `src/ui/motionpanel.js`): muñeco con las articulaciones (clic = elegir), candados 🔒 en manos y pies, 🖐 Arrastrar / ⟳ Girar, clave, restablecer, copiar/pegar/reflejar pose, ayudas y rejilla de **curvas de transición** con fuerza. La herramienta por defecto es **Arrastrar**.

**Arrastrar con lógica** (`src/main.js` → `ikRedirect`, `dragBoneTo`, `lockStart`/`applyLocks`)
- Mano o pie: IK del miembro. **Rodilla o codo: llevan el miembro entero** (gira el muslo o el brazo; tobillo y muñeca van detrás); solo si el pie o la mano están anclados en el mundo mueven el polo.
- **Cabeza, cuello y pecho**: doblan la columna de debajo (IK de columna por CCD); la cabeza conserva hacia dónde miraba.
- **Cadera**: mueve el cuerpo; las manos y los pies **con candado** se quedan en su sitio (pies con candado de serie).
- **El cuerpo acompaña a la mano** (`doc.reach`, `Engine.leanToReach`): si el brazo no llega, clavícula y columna se inclinan lo justo. Sin objetivo nuevo no cambia nada.

**Límites naturales** (`src/core/limits.js`): balanceo + torsión por articulación en espacio canónico (rodilla y codo como bisagra, hombro, cadera, muñeca, columna, cuello, cabeza). Se aplican a lo que se edita (girar, arrastrar, inclinar); si la animación ya traía un hueso fuera de rango, no se corrige. Interruptor «Límites naturales».

**Colisiones** (`doc.collide`, `guardArms` en `src/core/acting.js`): reutiliza la medición del cuerpo en la malla (ropa incluida) de las actuaciones; aparta el antebrazo y la mano que se meten en el tronco. ~0,4 ms por fotograma tras medir una vez.

**Pies**: «Quitar patinaje» funciona también en clips **«en el sitio»** (detecta con el avance real y ancla solo la altura, `doc.pinY`) y une el apoyo que cruza el **punto de bucle**.

**Curvas**: **tangentes por canal** — al elegir una clave en CURVAS salen dos asas por canal (X, Y, Z); cada canal avanza con su curva (`k.bc`). En rotaciones, un tramo con tangentes por canal se interpola por ángulos de Euler XYZ.

**IA**: `arrastrar`, `ayudas`. **Pruebas**: `tests/fkik.test.js` (12).

**Límites que quedan**: colisiones solo brazo/mano contra el tronco (no piernas entre sí ni objetos del escenario); los dedos no tienen límites; las curvas de rebote múltiple o elásticas de iClone no existen (una sola Bézier por tramo); la detección de apoyos depende de que el pie llegue a quedarse quieto.

## Motion Director, menú superior y modos · 15/11/2026 (3)

Inspirado en iClone (Motion Director: Mouse Waypoints y Path Mode; Motion Planning: Go To → acción).

**Motion Director** (menú superior › Motion Director · `src/core/director.js`, `src/ui/director.js`)
- **Destinos (waypoints)**: Alt+clic en el suelo (o la herramienta «◎ Destinos»): el personaje va andando hasta allí; cada clic añade otro destino y, si ya está reproduciendo, sigue de largo hasta el nuevo.
- **Caminos (Path Mode)**: «✎ Dibujar camino» pone puntos con clic (doble clic o Intro termina); los puntos se arrastran, Supr borra el elegido; curva suave o tramos rectos, abierto o cerrado, invertir. **Auto ▶** lo recorre solo; **🎮 Control** lo llevas tú con W/S (o ↑/↓) y queda grabado como tramos y esperas.
- **Secuencia** (como Go To → acción): ir a, recorrer camino, acción de la biblioteca (repeticiones, mantener la última pose, **asiento a N metros**), esperar, girar. Se reordena, se edita cada paso y se reproduce desde cualquiera.
- El plan vive en `doc.director` (metros sobre el suelo) y se compila a `doc.strips` (tiras marcadas `md`) + `doc.root` (trayectoria por fotograma, que `Engine.applyRoot` suma a la pose). Anda a la velocidad natural del clip (no patina), gira en el sitio si el destino queda a un lado o detrás, y las acciones empiezan donde está el personaje (`strip.anchor`). Viaja en el enlace (`md=`) y se deshace con Ctrl+Z.
- Capas, claves, IK y exportación siguen funcionando encima: la trayectoria se hornea en la cadera al exportar o al «Usar en la historia».

**Menú superior** (`src/ui/topmenu.js`): Editar movimiento, Transformar, Rig, Ajustar, Tira, Capas y Motion Director son desplegables sobre el visor (Alt+1…7). 📌 los deja abiertos y arrastrables. Los paneles son los mismos nodos, **movidos**, no rehechos; «Ventana › Herramientas de animación › En la columna derecha» los devuelve a su sitio exacto. Botones ◧ Esquema, ▤ Tiempo y Biblioteca ◨ pliegan columnas y línea de tiempo. De paso se corrigió la rejilla: al ocultar una columna el visor se colapsaba.

**Modos** (arriba a la derecha · `src/ui/modes.js`)
- **🧍 Maniquí**: animación general sobre el maniquí. Autoguardado propio (`auto:general`); «★ Guardar para todos» la deja en Tuyas en formato canónico: sirve para cualquier personaje.
- **🎬 En escena**: el personaje, para esa escena. Cada modo conserva su personaje, su documento y su deshacer; cambiar no recarga nada.
- **Dentro del Estudio** (`src/ui/scenelive.js`), «En escena» trabaja sobre el **escenario vivo** del Editor y del Estudio: el visor del Taller se vuelve transparente y debajo queda el mismo motor, colocado en ese hueco. El Taller mueve la cámara y calcula la pose; el actor de la escena la muestra con su luz, su estilo y lo que lo tapa; encima solo van los controles del rig, el gizmo y los caminos. Los destinos y caminos caen sobre el suelo real. «🏙 Escenario» alterna con el visor propio. Si el escenario no responde, el Taller sigue con su visor.

**IA**: `director`, `modo`, `escena`, `menu`. **Pruebas**: `tests/director.test.js` (7).

**Verificado**: prueba completa «recorrer un camino → saltar → ir a la silla → sentarse» (Don Quijote, con mesa y silla), y dentro del Estudio con Rachel en Passeig de Gràcia (controles alineados con el actor del motor, cámara idéntica en ambos lados, el actor camina por el escenario).

**Límites**: ~~los clips generados no traen transición de sentarse~~ y ~~no evita obstáculos~~ (resueltos el 16/11/2026, ver abajo); dentro del Estudio la cámara del motor va un fotograma por detrás de los controles al orbitar deprisa; el rostro no se transmite al escenario vivo (sí va en «Usar en la historia»).

## Motion Planning, Look At, Reach Target y paso instantáneo Estudio → Taller · 16/11/2026

Inspirado en iClone (Motion Planning, Reach Target, Look At). Todo vive en el menú superior (Alt+8, Alt+9, Alt+0) y trabaja sobre el MISMO plan del Motion Director (`doc.director`).

**Motion Planning** (`src/ui/planner.js`): el plan como lienzo de nodos. Cada paso es un nodo; sus salidas (`next`, o `yes`/`no` en una condición) son los cables. Nodos: Ir a, Recorrer camino, Girar, Acción, Esperar, Look At, Reach Target, **Condición** (Check Distance, Check Position, Check Placement, Check Trigger Zone, Check Boolean), **Decisión** (fija una variable) y **Narrativa** (diálogo, emoción, cámara: extensiones de SpanStories que dejan marcas `doc.cues` con su fotograma). Lo que se edita aquí aparece en la secuencia del Motion Director y al revés. Durante la reproducción se ilumina el nodo que se ejecuta. Un bucle sin fin se corta al compilar.

**Look At** (`src/ui/aim.js`, `Engine.applyLook`): desde un fotograma el personaje mira a un objetivo (punto, pieza, cámara u otro personaje de la escena) repartiendo el giro ojos → cabeza → torso, con tope y transición; «sin objetivo» suelta la mirada. **Reach Target**: la mano (IK) va al objetivo y lo sigue si se mueve (pieza arrastrada, otro personaje); si no llega, el cuerpo acompaña. Los dos dejan eventos en `doc.director.aims` y se compilan a `doc.aim`.

**Estudio → Taller sin espera** (medido con Rachel, Chromium sin pantalla):
- Antes: 24 s desde «Animación» hasta trabajar en el escenario (el Taller cargaba primero el último personaje usado, la biblioteca y los módulos faciales en serie, y compilaba los shaders de un cuerpo que «En escena» ni pinta).
- Ahora: el Estudio **precarga** el Taller del personaje seleccionado, oculto y en pausa (`StudioWorkshop hidden`, `.shade.warm`); «Animación» solo lo muestra. Abrir: **0,8–1,4 s** hasta estar en escena con la misma cámara; reabrir tras «Volver a la historia»: **0,5–0,7 s**, conservando el plan. Sin precarga (personaje recién elegido): ~3 s.
- Cómo: `src/io/studio-boot.js` (el Taller pide el personaje al Estudio en el primer instante y arranca con él), módulos faciales en paralelo (`preloadFacialModules`), biblioteca leída después de entrar en escena, cuerpo propio sin pintar ni sombras mientras se prepara «En escena» (`sceneLive.pre`), miniaturas aplazadas y shaders compilados en segundo plano. Mientras está oculto el Taller no dibuja (`studioHold`). El Estudio no repite la puesta en escena al abrir si ya estaba en pausa.
- Mensajes nuevos Estudio ↔ Taller: `INIT.held` y `VISIBLE {visible}`. Un Taller oculto rechaza `SCENE begin`.

**Verificado** en el Estudio (no en el Taller suelto), en dos escenarios: Barcelona · Passeig de Gràcia y Aeropuerto · Entrada. Rachel: girar → caminar a un punto → saltar → ir a otro punto → sentarse (asiento 0,45 m), reproducido sobre el escenario vivo; menús Motion Director y Motion Planning abiertos; volver y reabrir conserva el plan. Diferencias entre escenarios: solo la primera carga del motor (Barcelona ~40 s, aeropuerto ~22 s); el paso al Taller es igual.

**Límites**: el Taller y el motor comparten hilo en el navegador (mismo sitio 127.0.0.1), así que un fotograma pesado del motor retrasa al Taller y al revés; la precarga ocupa memoria con un segundo modelo del personaje (~17 MB en Rachel).

## Sentarse de verdad, rutas que esquivan, asientos con nombre y cabecera · 16/11/2026

- **Cabecera** (`src/style.css`, `src/ui/topmenu.css`): los botones ya no parten en dos líneas («MOTION LAB», «VENTANA ▾»). La fila de espacios se recorta si no cabe y hay un corte más a 1100 px. `body` usa `grid-template-columns: minmax(0, 1fr)`: antes la página medía 1314 px en una ventana de 1280.
- **Comportamientos** (`src/ui/behaviors.js`, `behaviors.css`): ahora es la pestaña «Comport.» de la columna derecha. Ya no flota sobre el visor ni tiene botón en la cabecera. Dentro del Estudio se abre sola.
- **Sentarse con mocap** (`src/core/director.js`):
  - Un paso `action` con `seat` + `sitIn` encadena: clip de sentarse → bucle sentado (`clip`) durante `hold`.
  - Las esperas siguientes siguen sentadas en ese bucle.
  - Antes del siguiente goto, path, turn o action se levanta con `sitOut`. Sin `sitOut`, la cadera sube con el fundido corto de siempre.
  - La altura del asiento se ajusta durante todo el clip de sentarse y de levantarse.
  - `D.sitClips()` (`src/ui/director.js`) elige los clips de la biblioteca: 100 Idle (`StandUpright_Normal01_To_Sit_Normal01_Front`, `Sit_Normal01_Loop01`, `Sit_Normal01_To_StandUpright_Normal01_Front01`) y, si no, 505 Survival y Church People. Sin ellos se usa `gen_sentado`.
  - El botón «+ Sentarse» y el nodo «Sentarse» del Motion Planning usan esos clips.
- **Rutas que esquivan** (`WORKSHOP_ROUTE`): en escena, `goto` pide al motor una ruta A* (la misma `crearNavegacionCuadricula` de la vida ambiental, `SpanStories-Ciudades/engine/vida/Navegacion.js`) y la recorre en lugar de la recta.
  - La primera compilación va recta; al llegar la ruta se recompila (caché en `scenelive.js`, `L.route`).
  - `step.straight: true` la desactiva.
  - Fuera del Estudio se sigue andando en línea recta.
- **Asientos con nombre** («+ Sentarse en…» en la secuencia):
  - Lista la silla de «Mesa y silla» y, en escena, los bancos y butacas del aeropuerto (`seatMarker` en `worlds/prototypes/airport/engine/HallKit.js` y `ConcourseHalls.js`, leídos con `WORKSHOP_POINTS`).
  - Elegir uno crea el objetivo, el paso «ir» de cara a donde mira el asiento y el paso de sentarse.
  - El punto de pie se calcula con lo que retrocede la cadera el clip de sentarse, para que quede sobre el centro del asiento.
  - Convención: un `Object3D` con `userData.ssPoint = asiento`, `ssSeat` (m) y `ssFacing` ([x, z] local).
  - Barcelona aún no tiene asientos marcados.

**Pruebas**: `tests/director.test.js` (9, dos nuevas: transiciones de sentarse y ruta). `npm test`: 118 + 2.

**Verificado** en el Taller suelto (Rachel, «Mesa y silla»): ir a «Silla 1», sentarse con el mocap de 100 Idle (la cadera baja de 0,90 a 0,50 m y queda en el centro del asiento), esperar sentada, levantarse y girar. Fallback con `gen_sentado` correcto. El aeropuerto carga en el Estudio con las marcas nuevas sin errores.

**Sin verificar**: la ruta A* y la lista de asientos en el escenario vivo. Hace falta una historia del aeropuerto con un personaje y abrir el Taller desde él (no se tocaron las historias existentes).

## Taller facial en la historia: escenario vivo, dos modos y vida en reposo · 17/11/2026

**Escenario vivo** (`facial/EscenaViva.mjs`, el mismo contrato que `src/ui/scenelive.js`):
- Abierto desde un personaje de la escena, el visor del Taller facial se vuelve transparente y debajo el motor dibuja el escenario de la historia.
- Cada fotograma, después de la vida, la actuación, la webcam y los dientes, manda al actor de la escena **huesos + pesos de las shape keys**.
- En el motor, `WORKSHOP_BEGIN` acepta `meshes:[{name, morphs}]` (índice por nombre de malla y de morph, no por posición) y `WORKSHOP_POSE` acepta `w`. `endWorkshop` restaura también los morphs. El Taller de animación no manda `meshes` y sigue igual.
- **Cámara fijada en el personaje** (`crearEncuadre`): el plano «Rostro» toma como ancla los ojos (o la cabeza) y «Cuerpo entero» el centro del cuerpo. El ancla se recalcula cada fotograma y la cámara la acompaña sin perder la órbita del usuario. En escena no se puede desplazar.
- **Un solo dueño de la escena** (`StudioWorkshop.tsx`, `relayScene`): solo entra en escena el taller que está a la vista. Al cambiar de taller, el oculto recibe `VISIBLE false` y suelta la escena.

**Dos modos** (cabecera del Taller facial):
- **En la historia**: personaje fijado y escenario vivo.
  - «Usar en la historia» envía `RESULT {apply:true}`; el Taller de animación (oculto) hornea cuerpo + rostro y el Estudio lo aplica al momento en un clic. Si el Taller de animación aún carga, el Estudio guarda el resultado y lo entrega al adoptar la sesión.
  - «Al Taller de animación» combina el rostro con otro cuerpo, como antes.
  - La calibración se lee de disco y aquí no se edita.
- **General · para todos** (`facial/ModoGeneral.mjs`, `facial/CorreccionesFaciales.mjs`):
  - Se corrige el gesto en edición (actuación 1–50 F/M, rostro cotidiano, preset o clip del catálogo) o una expresión de la vida o un visema.
  - «Guardar para todos» guarda solo la diferencia en `biblioteca/facial/correcciones.json`, con control de revisión (409 si otra ventana guardó antes). «Restaurar original» la borra.
  - Las correcciones se aplican en el Taller facial, en el Taller de animación al hornear (`behaviors.js`) y en la vida del motor.
  - Las variantes propias de una historia (`user.*`, con `source.componente`) no se tocan.
  - «Calibración del personaje» guarda la fuerza de shape keys y el mapa de canales en `biblioteca/facial/calibraciones/<id>.json`; vale para ese personaje en todas sus historias.
  - **Dónde se usa** (`/api/historias/usos-faciales`, pedido a través del Estudio) lista las actuaciones de las historias que usan el gesto. «Actualizar las seleccionadas» vuelve a hornear **solo las pistas de rostro** (`rehornearRostro`; conserva tiempos, cuerpo y nombres), las guarda como versión nueva e inmutable y cambia la referencia:
    - en la historia abierta, en memoria (se puede deshacer);
    - en las demás, en disco: sube la revisión, guarda copia en `historia.json1` y actualiza también el autoguardado.

**Vida en reposo** (`facial/VidaEnEscena.mjs`; datos en `features/story-studio/actor-life.ts`):
- `Actor.vida` es el ajuste de toda la escena: ánimo, energía, intensidad, mirada (cámara / deambula / otro personaje / punto) y partes.
- `cue.vida` es el cambio desde ese momento (ánimo, energía, mirada). El director lo arrastra a los momentos siguientes, como la expresión.
- El motor carga LifeCharacter por `/vida-personaje/` (`serve.py`, lista cerrada). La vida se aplica a los actores **quietos** (sin actuación horneada; acción idle, listen, look o talk), visibles y a menos de 35 m:
  - `antes()` antes del mezclador y `update()` después.
  - Se construye sobre la pose del GLB (`enReposo`), no sobre un clip a medias.
  - Funciona también en pausa mientras se dirige y en la vista del alumno.
- En el Taller facial, la sección «Vida en reposo en la historia» lee la vida del personaje (ánimo, energía, partes de «Vida del personaje»), elige a quién mira y la envía con `LIFE {vida, alcance}`. En el Estudio: Propiedades › Personajes › «Vida en reposo» y Momento › «Ánimo en reposo desde este momento».
- **Borradores separados por historia**: la clave (`draftKeyOf`, `behaviors.js` → `studioKey`) empieza por el id de la historia. La clave antigua solo se lee para no perder trabajo.

**Pruebas**:
- `facial/CorreccionesFaciales.test.mjs` (4) y `facial/VidaEnEscena.test.mjs` (3).
- `features/story-studio/__tests__/actor-life.test.ts` (3: validación, vida por momento en el director, «dónde se usa» y cambio de referencias).

**Verificado** en el Estudio (historia de prueba «Prueba Taller facial (Claude)», Rachel en el aeropuerto):
- El Taller facial se abre en escena sobre el escenario de la historia, con plano de rostro y de cuerpo entero. La comprobación de oclusión acerca la cámara si un pilar tapa al personaje.
- «Muy feliz» mueve rostro y brazos del actor de la escena.
- «Usar en la historia» vincula la actuación en un clic y se reproduce con rostro.
- Vida «nerviosa» aplicada a la escena: en pausa, el actor del motor queda con los brazos relajados y mueve la cabeza.
- General: «Guardar para todos» guarda solo la curva cambiada. «Dónde se usa» → «Actualizar» crea una versión nueva: 53/53 pistas de cuerpo iguales y solo cambia el morph corregido (`eyeWideLeft`) en las 14 pistas de rostro.
- Endpoints: 409 con revisión vieja; el motor lee `correcciones.json` por `/vida-personaje/`.

**Errores corregidos durante la verificación**:
- El hueco del escenario no se colocaba: el Taller manda su rectángulo antes de ser dueño de la escena.
- `morphTargetInfluences` es un `Array` (no tiene `.set`), tanto en `endWorkshop` como en el reapelado.
- Los gestos sin editar se guardaban como variante `user.*` y las correcciones no los reconocían.
- El panel mostraba el ánimo anterior al de la historia.

**Sin verificar**:
- La mirada «a otro personaje»: la historia de prueba tiene un solo personaje.
- El cambio de ánimo por momento en el motor: cubierto por pruebas del director, no visto en pantalla.
- Pelo y trenza con física en el motor (Rapier).

## 17/11/2026 — Funciones de Control Rig (Unreal / iClone)
- **Gizmo:**
  - Al rotar, el gizmo es grande (base 2×) y solo muestra los aros X/Y/Z: se quitaron el aro de pantalla y la esfera trackball.
  - El tamaño se ajusta con `+`/`-` o con el deslizador «Gizmo». Comando IA `gizmo`.
- **Arrastrar el gizmo:** mientras se arrastra solo queda visible el control elegido.
- **Controles en el visor:**
  - Cadera: octógono naranja. Columna, cuello y cabeza: aros planos.
  - Polos: esferas del color de su lado, con una línea al codo o la rodilla.
  - Pies: huella en el suelo.
  - Raíz: hexágono con flecha; con Rotar gira solo en Y.
- **Dedos:** aparecen solos al elegir la mano. El selector tiene una cuadrícula de dedos e interruptores IK/FK, y deslizadores Cerrar/Abrir por dedo. Comando IA `dedos`.
- **Panel Transformar:** Ubicación, Rotación y Escala con ↺ (reposo) y ◆ (clave), más Stretch y Softness en las cadenas IK. Comando IA `ikOpciones`.
- **Hoja de claves:** muestra todas las pistas, con la elegida resaltada; búsqueda; contador N de M; clic en el nombre para elegir el control.
- **Tira:** «Dirección de movimiento» alinea con el clip anterior o el siguiente (Trasladar/Rotar, Alinear/Revertir). Comando IA `alinearTira`.
- Detalle y pendientes en `docs/TRASPASO-CONTROL-RIG.md`.

## 17/11/2026 — IK renovado y Herramientas (add-on de Blender, reimplementado)
- **IK de piernas y brazos renovado.** La rodilla y el codo doblan solo por su bisagra anatómica (0–150°); el polo es estable con la pierna recta y sigue a la cadera y al pie. Corrige la rodilla hacia delante o de lado, la pierna torcida y las piernas cruzadas.
- **Muñeca natural.** La mano sigue al antebrazo al moverla por IK (antes la muñeca se doblaba hasta 150°). La pronación la hace sobre todo el antebrazo, y la muñeca no pasa de su rango. Vale también al girar la mano en FK.
- **Sin realimentación.** Poner clave, pegar, espejo y girar un hueso con su miembro en IK guardan IK (efector + polo) en vez de la pose resuelta como FK.
- **IK ⇄ FK sin saltos.** Todos los interruptores usan `app.setIK`. A FK se hornea todo el rango con claves inteligentes.
- **Menú «Herramientas»** (Alt+Q): controles temporales IK y en espacio mundo, hornear inteligente, trayectoria editable (Mayús+P), intercalar / espejo / base, copiar/pegar matriz de mundo y relativa, pivote temporal relativo, desfase en cascada, compartir claves, Multikey y retimer con marcadores (M; se arrastran en la regla, también estiran el mocap de base).
- **Comandos IA nuevos:** `ikCambiar`, `controlTemporal`, `controlesTemporales`, `hornearControl`, `hornear`, `trayectoria`, `intercalar`, `copiarMatriz`, `pegarMatriz`, `desfase`, `compartirClaves`, `multikey`, `marcador`, `retimer`, `pivote`.
- **Arreglado:** los comandos escritos con `f:` (`anclar`, `fijarPies`, `ikPeso`, `dedos`, `gizmo`, `ikOpciones`, `ayudas`, `curva`, `curvaTira`, `arrastrar`) fallaban siempre por IA.
- **Tras verificar sobre mocap real:** influencia suave al mover la trayectoria (sin picos), compartir claves exacto entre claves, y hornear o pasar a FK un brazo que se inclina para llegar incluye columna y hombro.
- **Detalle:** `docs/HERRAMIENTAS.md`. **Pruebas:** `tests/herramientas.test.js`. **Licencia:** `docs/THIRD_PARTY_NOTICES.md`.
- **Respaldo previo:** `D:\Español\RESPALDO_NO_CARGAR\taller-animacion-antes-herramientas-20261117\`.

## 17/11/2026 — Editar capa de movimiento (Edit Motion Layer de iClone)
El panel **Editar movimiento** (Alt+1) pasa a ser **Editar capa de movimiento** (`src/ui/motionpanel.js`; lógica en `src/ui/editlayer.js`, instalada como métodos de la app):
- **Modo IK · Modo FK · Títere** en pestañas (IK = Arrastrar, FK = Girar).
- **🧍 Reposo** (Reset Pose): de pie con los brazos relajados, como clave en el fotograma actual; las cadenas en IK reciben su efector (no pasan a FK). `app.resetPose()`.
- **Palmas** a los lados del muñeco: arrastrar hacia abajo cierra el puño, hacia arriba lo abre; doble clic alterna. `app.palm(lado, grados)` (usa `setFingers`).
- **Puntillas izq./der.** (efector IK del pie): el pie gira sobre los dedos, que se quedan en el suelo, y el talón sube; los dedos compensan para quedar planos. `app.tiptoe(lado, grados)`.
- **Pines T/R**: el candado de cada mano y pie cicla libre → **TR** → **T** (solo posición) → **R** (solo giro); la letra aparece sobre la articulación. Preajustes **Sin pines · Ambas manos · Ambos pies · Miembros**. `applyLocks` respeta T y R. Los antiguos `true` se leen como TR.
- **Títere directo**: con la cadera, una mano o un pie elegidos, **👁 Vista previa** (el ratón sobre el visor mueve el control en este fotograma) o **● Grabar** (reproduce desde aquí y guarda una clave por fotograma; clic en el visor, Esc o el final paran). Respeta los pines: con «Ambas manos», al llevar la cadera las manos se quedan. Sensibilidad ajustable. El bucle llama a `app.puppetTick` antes de evaluar.
- **Mantener en toda la tira**: una edición queda igual del principio al final de la tira donde está el cabezal (claves en sus extremos; fuera no cambia nada). `holdSnapshot` / `holdToStrip` alrededor del arrastre.
- **Capas de animación** dentro del panel: activar/desactivar con la casilla, elegir la capa en la que se edita, **+ Capa** con nombre, **Copiar claves / Pegar claves** de un fotograma.
- **IA**: `pines`, `reposo`, `palma`, `puntillas`, `titere` (lleva un control de un desplazamiento a otro con clave por fotograma), `capaNueva`, `capaActiva`, `mantenerTira`, `clavesFotograma`.
- **Verificado** en el Taller suelto (maniquí de Quaternius): reposo, puño, puntillas (los dedos no se mueven, el talón sube 6 cm), cadera bajada 25 cm con «Miembros» (la mano no se mueve), mantener en la tira (claves en 0 y 90), activar/desactivar capa. `npm test`: 151 correctas.

## 18/11/2026 — Editar capa de movimiento como iClone, puntos de control y «En escena» sincronizado
- **Panel rehecho** (`src/ui/motionpanel.js`, estilos `#pMotion .eml*` en `src/style.css`): barra de iconos (reposo, reflejar · títere, límites, suelo, patinaje, puntos/aros), pestañas **Modo IK · Modo FK · Títere directo**, escenario negro con un **maniquí 3D** dibujado con three.js (`src/ui/dummyrender.js`, imagen cacheada por estado de las manos), manos grandes que se cierran en puño, puntos con relieve, candados dibujados y la etiqueta **T/R** sobre la articulación con pin, fila de pin T · pin R · 4 preajustes · IK/FK, barra de claves (anterior, clave, siguiente, mantener en la tira) y Poner clave · Restablecer · Copiar pose · Pegar pose. Debajo: Títere directo, Capas de animación (con **Peso** de la capa activa y doble clic para renombrar) y Curva de transición, plegables.
- **Puntos de control sobre el personaje** (`viewport.js`, `buildDots`/`updateDots`): círculos planos de cara a la cámara, semitransparentes y sin borde — naranja en el centro, verde lima en el lado derecho, cian en el izquierdo; el elegido en lima y más grande, y solo él lleva el gizmo. Mano y pie en IK: el punto es su efector. Los aros siguen disponibles con el icono de puntos (preferencia `taller:ctlStyle`).
- **Títere directo** como Direct Puppet: Ajustes IK (Reflejar, Hombro realista), Mover (según la pantalla, horizontal, vertical), Girar (según la pantalla, principal, secundario), Vista previa / Grabar desactivados hasta elegir cadera, mano o pie, **Espacio** empieza y para la vista previa. El control nunca se aleja más de 1,1 alturas de cadera. `app.setPuppetOpts`; IA `titere` acepta `girar`, `angulo` y `reflejar`.
- **Arreglos del maniquí** (el «empeoramiento» tras el primer intento): la prueba anterior se había hecho sobre el documento real del usuario (capa «Hombros», reposo, puño, puntillas, cadera bajada, mano IK a 3,9 m); se guardó una copia como proyecto «Respaldo antes de limpiar (18/11)». Además: **Pose de reposo** parte de la pose T canónica (con la de enlace, Mia quedaba con los pies en punta y los dedos en el suelo); **Puntillas** refresca las matrices antes de medir (giraba sobre los dedos de antes del IK); **keyIK** toma la referencia sin la ayuda «suelo» (la clave guardaba un desplazamiento falso y el pie de puntillas bajaba 4 cm); **Mantener en toda la tira** ya no fija los efectores IK.
- **«En escena» dentro del Estudio**: el visor del Taller volvía a ser opaco (negro) porque el Estudio pasó a estilo claro y el Taller declaraba `color-scheme: dark`; ahora declara `light` (`topmenu.css`). Los controles se dibujan con la **misma cámara que el escenario acaba de pintar**: el Taller numera cada vista (`seq`), el Estudio la reenvía y el motor confirma con `WORKSHOP_DRAWN` (`scenelive.js`, `StudioWorkshop.tsx`, `StoryStudioBridge.js`); si el motor no confirma en 400 ms se usa la cámara de siempre.
- **«Usar en la historia»** acepta una animación hecha a mano (antes exigía elegir un clip del catálogo).
- **IA**: `proyecto {accion:'cargar', doc}` pone un documento (el Taller incrustado en el Estudio tiene su propio almacenamiento); `clavesFotograma` copia todas las claves salvo `soloElegido`.
- **Verificado** en el Estudio con la historia **«Mia en el aeropuerto · Editar capa de movimiento»** (`Estudio/Historias/mia-en-el-aeropuerto-editar-capa-de-movimiento-2m6i17`, revisión 2), cuatro momentos con su actuación horneada:
  1. **¡Llegué! (pose de puño)**: reposo → puñetazo (cadera con pies fijos, pie de atrás en IK y de puntillas — los dedos quedan a 0,073, el talón sube a 0,131 —, giro de columna y pecho, brazos en IK, puños desde la palma), copiar/pegar claves para mantener la pose.
  2. **La maleta (pines)**: agachada con las manos en la maleta; «Ambas manos» + girar la cadera (la mano se desvía 0), «Miembros» + mover la cadera (manos y pies 0).
  3. **Títere directo**: manos fijadas, cadera llevada por el títere (mover según la pantalla) y luego girada (principal), una clave por fotograma; la mano fija se desvía 0,0001.
  4. **Por la terminal (capas)**: caminar 120 fotogramas; hombros arriba en el fotograma 0 mantenidos en toda la tira (claves en 0 y 119); capa «Torso» con giros cada 15 fotogramas copiados y pegados; desactivar la capa cambia el torso 7°.
  Puntos alineados con Mia en el escenario vivo al acercar y girar la cámara. `npm test`: 151 correctas; `vite build` sin errores.
- **Pendiente conocido**: el puño cierra los dedos pero el pulgar queda hacia arriba (sistema de dedos anterior); la pose del cuerpo aún puede ir un fotograma por detrás del punto al arrastrar deprisa (solo la cámara está sincronizada).

## 18/11/2026 — Taller facial: no cargaba en modo escenario
- **Síntoma:** en el Estudio, «🎬 En la historia» dejaba el visor del Taller facial negro (ni escenario ni personaje), aunque el motor sí dibujaba la escena debajo y el Taller decía «En escena».
- **Causa:** `facial/studio-theme.css` declaraba `color-scheme: dark` y el Estudio es claro. Con esquemas distintos Chrome pinta opaco el marco y tapa el escenario vivo (el mismo fallo que ya se había corregido en el Taller de animación solo en modo escena).
- **Arreglo:** los dos talleres declaran `color-scheme: light` siempre, igual que el Estudio (`facial/studio-theme.css` y `:root` en `src/ui/topmenu.css`), en vez de cambiarlo según el modo.
- **Verificado** en el Estudio con «Mia en el aeropuerto»: Taller facial y Taller de animación muestran el escenario y a Mia.

## 18/11/2026 — «En escena»: fluidez y controles al paso de la malla
- **Síntoma:** en el Estudio, «En escena» (Taller de animación y facial) iba con mucho retraso al mover cámara o personaje, y en arrastres rápidos los puntos y el gizmo iban un fotograma por delante de la malla. Fuera de escena todo iba fluido.
- **Causas:** (1) cada vista y cada pose viajaban Taller → Estudio (localhost:3000, otro proceso) → escenario (8877), y la confirmación de pintado volvía por el mismo camino: ~55–60 ms (3–4 fotogramas) medidos; (2) solo se esperaba a la *cámara* que el escenario había pintado, no a la *pose*; (3) cada movimiento del ratón sobre el gizmo recalculaba claves, pose, línea de tiempo y panel; (4) el cuerpo propio del Taller se seguía dibujando (sin color) con su piel en la GPU que comparte con el escenario; (5) el Taller facial oculto seguía calculando vida/actuación y pintando.
- **Arreglos:** canal directo `MessageChannel` que el Estudio reparte al entrar en escena (`WORKSHOP_PORT` → Taller, puerto en `WORKSHOP_BEGIN` → motor): vista, pose y `WORKSHOP_DRAWN` van de marco a marco (los dos los sirve 127.0.0.1); si el motor deja de confirmar 1,5 s, el Taller vuelve al relé del Estudio, que avisa de la sesión perdida. Vista y pose comparten un nº de estado (`seq`), el motor confirma el mayor una vez por fotograma y el Taller dibuja puntos, efectores IK y gizmo con la cámara **y la pose** confirmadas (`sceneLive.applyDrawn`). El gizmo marca el cambio y `flushGizmo` lo aplica una vez por fotograma antes de enviar y pintar. Cuerpo propio con material `visible: false` (el clic sobre la malla sigue funcionando). Taller facial oculto (`escena.held`): el bucle no hace nada.
- **Archivos:** `src/ui/scenelive.js`, `src/ui/viewport.js`, `src/main.js`, `src/ui/behaviors.js`, `facial/EscenaViva.mjs`, `facial/GeneralFacialEditor.mjs`, `components/world-lexicon/StudioWorkshop.tsx`, `SpanStories-Ciudades/engine/StoryStudioBridge.js`.
- **Verificado** en el Estudio con «Mia en el aeropuerto»: entra en escena, puntos sobre Mia, el actor del escenario sigue la reproducción y vista/pose ya no pasan por el Estudio. `npm test`: 151 correctas. La fluidez final hay que comprobarla con la ventana a la vista: el panel del navegador de la app estaba en segundo plano y Chromium limitaba sus marcos a ~1 fps durante la prueba.

## 18/11/2026 — Una sola historia: guardado compartido entre talleres y Estudio; cámara sobre el suelo

Antes, una corrección hecha «En escena» en el Taller de animación quedaba solo en su borrador local (IndexedDB de 5189): el Taller facial y el Estudio seguían viendo la actuación antigua hasta pulsar «Usar en la historia», y cada guardado creaba un archivo nuevo en `biblioteca/comportamientos/`.

- **Dos formas de guardar** (sustituyen a «★ Guardar para todos»):
  - **✔ Corrección general**: la animación de la biblioteca queda *reemplazada* por la corregida (mismo id, marca `corregida`; el escaneo de disco no la vuelve a pisar). Borrarla en Tuyas devuelve el original. En el Taller facial › General: el gesto se corrige como antes y «Actualizar» reemplaza en su sitio las actuaciones de las historias (`correccionGeneral`), sin versiones nuevas.
  - **✎ Modificación en historia**: solo esta actuación de esta historia. La primera vez se crea la copia propia de la historia (`owner` = historia:personaje:escena:papel:acción); después se reemplaza en su sitio (`/ecosystem/library` con `replace`, mismo id, `revision`+1).
- **Se lleva sola a la historia**: al pasar de un taller al otro o volver al Estudio, el Estudio pide `FLUSH` a cada taller; lo pendiente se guarda en la historia sin cerrar ni recargar nada. El Taller facial recibe el cuerpo nuevo en caliente (`BEHAVIOR_UPDATE`) y mantiene el cuerpo de la historia aunque la actuación sea conjunta. El motor relee la actuación por su `revision` (`StudioBehavior.js`).
- **Borradores**: el del Taller de animación guarda sobre qué versión de la historia se hizo; el del facial pierde frente a una versión más nueva de la historia. Ya no pisan cambios hechos en el otro taller.
- **Cámara**: en los dos talleres no baja del suelo (y=0 bajo los pies; 5 cm de margen) ni mira a un punto bajo él. Solo perspectiva.
- Comprobado en el Estudio (:3000) con «Prueba Taller facial (Claude)»: dos «Modificación en historia» seguidas → un solo archivo nuevo, la segunda con `revision 1`; el Taller sigue abierto. Pendiente de comprobar a mano: cambio de cuerpo → Taller facial lo muestra; rostro → Estudio.
