# Traspaso: funciones de Control Rig (Unreal / iClone) en el taller

Documento vivo para que otro chat continúe sin releer todo. Se actualiza al cerrar cada fase.

## Encargo
El usuario pidió añadir al taller las funciones de sus 5 capturas y 4 vídeos de referencia:
- **Unreal Control Rig, MetaHuman y Character Creator:** aros en la columna, caja IK en la mano, esferas de polo, huella del pie en el suelo, raíz hexagonal con flecha, selector de cuerpo con IK/FK y cuadrícula de dedos, panel Anim Details (Location/Rotation/Scale con clave por fila, `leg_stretch` y `leg_softness`) y Sequencer con pistas por control.
- **iClone:** gizmo de rotación grande al tocar una articulación y el panel Motion Direction Control (alinear un clip con el anterior o el siguiente; Translate/Rotate; Align/Revert).

**Prioridad del usuario:** al tocar una articulación, sea una falange o la rodilla, el gizmo de rotación debe hacerse **grande**, como en la imagen 4 (aros R/G/B que rodean la zona).

Plan aprobado: `C:\Users\AdrielPereira\.claude\plans\c-users-adrielpereira-appdata-local-pac-curried-cloud.md`

## Qué muestran los vídeos (mosaicos ya revisados)
1. **2014-59:** un primer plano de los dedos con la caja de mano roja/azul, las bolitas verdes de los dedos, un aro de giro y la huella amarilla del pie con flecha. Debajo, el Sequencer con claves.
2. **2015-36:** "Layer editing Body/Face". Muestra secciones Absolute/Additive en el Sequencer, el selector facial con gráfico de controles y "Adapt motion to scene". El taller ya tiene capas; no se planificó nada nuevo aquí.
3. **2016-52:** muestras de Control Rig con aros planos gruesos amarillos/naranjas en la columna, bolitas verdes en los dedos y el selector facial.
4. **2031-54:** "Edit Motion Layer" de iClone:
   - Atajo 3/N para activarlo.
   - Selector de cuerpo con dos manos.
   - Marcadores de color en las articulaciones y caja IK magenta en la mano.
   - HOME hace zoom a la parte elegida. HOME/F ya existen en el taller: `viewport.reframe()`.

## Estado por fase
- [x] **Fase 0:** mosaicos de vídeo revisados.
- [x] **Fase 1: gizmo grande.**
  - `src/ui/viewport.js`:
    - `gizmoScale` (pref `taller:gizmoScale`, entre 0.5 y 3).
    - `applyGizmoSize()` usa base rotar 2 / mover 1 / escalar 0.9, multiplicada por `gizmoScale`. `attachGizmo()` la llama.
    - `setGizmoScale(v)`.
    - En el constructor se quitan del gizmo y del picker de rotación los mangos `E` y `XYZE`: la esfera trackball robaba los clics a otras articulaciones.
  - `src/main.js` (`bindKeys`): `+`/`-` cambian el tamaño.
  - `src/ui/panels.js` (barra de herramientas): deslizador "Gizmo".
  - `src/ia.js`: comando `gizmo {tamano, herramienta, ejes}`.
  - `npm test`: 127/127.
- [x] **Fase 2: formas de control** (`viewport.js` `buildHandles`/`updateHandles`). Hecho:
  - `COL.hips` y `COL.finger`; cada mango guarda `userData.color`.
  - Cadera = octógono naranja horizontal. Columna, cuello y cabeza = aros planos y gruesos.
  - Caja IK con colores de lado. Polo = esfera de su lado más una `THREE.Line` al codo o la rodilla (`userData.link`).
  - Pie: mango `kind:'print'` (huella en el suelo). `pick()` lo convierte en `{kind:'ik', chain}`.
  - Raíz: hexágono más flecha que sigue `facingDir()`; ayudantes `yawOf`, `facingDir`, `footDir`.
  - `main.js attachGizmo` (rama root): con Rotar, `vp.attachGizmo(hb,'rotate','world',{yOnly:true})`. `viewport.attachGizmo` acepta `{yOnly}` (`showX`/`showZ`).
- [x] **Fase 3: dedos.** Hecho:
  - `updateHandles` calcula `autoF` (el lado de la mano, su IK o un dedo elegidos) y muestra esos dedos. Los dedos son bolitas verdes.
  - `procedural.js` exporta `handPoseFrom(id,name,curl,thumb,spread)`.
  - `main.js` `setFingers(side, {all|thumb|index|middle|ring|little|spread})` guarda `this.fingerState` y aplica con clave mediante `applyHandPose`.
  - Selector (`panels.js refreshPicker`):
    - Vista Cuerpo: interruptores IK/FK en texto junto a manos y pies, y cuadrícula "Dedos" de las dos manos (viewBox 200×362).
    - Vistas de mano: deslizadores Cerrar mano / dedo a dedo / Abrir, que se aplican al soltar.
  - IA: `dedos {mano, todos, pulgar, indice, medio, anular, menique, abrir}`.
  - Verificado en el navegador: el curl gira las falanges, se ven 15 dedos al elegir la mano y no hay errores. `npm test`: 127/127.
- [x] **Extra pedido a mitad de trabajo:** mientras se arrastra el gizmo (rotar, mover o escalar), los demás controles se ocultan y solo queda el elegido (`viewport.updateHandles`, `this.gizmo.dragging`). Verificado: 24 → 1 → 24.
- [x] **Fase 4: panel de detalles** (`panels.js` panel Transformar). Hecho:
  - `mkRow` con columnas `56px 1fr 1fr 1fr 22px 22px`: ↺ (`resetRow`, que vuelve a `rig.restQ/restP/restS` con clave) y ◆.
  - Filas: Ubicación (cadera/raíz/IK/polo), Rotación (hueso/IK/raíz) y Escala (`scl`, hueso; `keyBone(..., localS)`).
  - `updateTransformValues` rellena `scl*` y la rotación de la raíz.
  - IK/polo: casilla Stretch y deslizador Softness, guardados en `doc.ikOpts[chain] = {stretch, soft, maxStretch}`.
  - Solver (`animation.js applyIK`):
    - Softness ajusta `solveTarget` con la curva exponencial de "soft IK".
    - Stretch escala `la.position`/`ea.position` hasta +30 %. Lo original se guarda en `this._stretchP[chain]` (no en `ikState`, que se rehace en cada pasada) y se deshace al principio de la siguiente pasada.
  - Verificado: estirado estable de 1.2 en 4 evaluaciones; al apagarlo vuelve a 1.0; softness deja la punta en 0.995 L.
  - IA: `ikOpciones {cadena, stretch, softness, maxStretch}`.
  - **Pendiente menor:** Stretch y Softness son ajustes de la cadena, no pistas con claves (el plan decía "animables").
- [x] **Fase 5: timeline.** Hecho:
  - `timeline.js` añade `trackQuery` y `trackCount`. `buildRows` filtra sin distinguir tildes (`\p{Diacritic}`) y marca `r.sel` con `trackIsSelected(id)`.
  - La fila elegida se pinta azul. Hacer clic en el nombre de una pista (`x < labelW`) llama a `selectTrackControl(id)`.
  - **Cambio de comportamiento:** el modo CLAVES ahora muestra todas las pistas de la capa, como el Sequencer, con la pista elegida resaltada. Antes filtraba siempre por la selección; ese filtro sigue con «▾ Sel.» (`app.onlySelected`).
  - `panels.js` barra `#tbar` (en modo CLAVES): búsqueda y contador `#tlCount` ("N de M").
  - **Pendiente:** desplazar la vista hasta la pista elegida.
  - Verificado: «indice 3» → 1 de 17, y el clic elige `index3L`.
- [x] **Fase 6: dirección de movimiento.** Hecho:
  - `animation.js`:
    - `stripPose` llama a `applyStripRoot(s, pose)` con `s.root = {x,y,z (m, ejes del personaje), yaw (°)}`.
    - `alignStrip(id,{to:'prev'|'next', translate, rotate})` guarda lo anterior en `s.rootPrev`. `revertStripAlign(id)` lo recupera.
  - `url.js`: la tira guarda el extra `R x_y_z_yaw` en el hash.
  - `panels.js`: dentro del panel Tira, la caja "Dirección de movimiento" (`motionDirection(s)`) con clip anterior/siguiente, Parte Raíz, Trasladar/Rotar, X/Y/Z, Giro Y° y los botones Alinear/Revertir.
  - IA: `alinearTira {tira, accion: alinear|revertir|fijar, con, trasladar, rotar, x,y,z, giro}`.
  - Verificado: dos `gen_caminar` seguidos pasan de un hueco de 1.347 m a 0 m.

## Estado final (17/11/2026)
Las 6 fases están hechas y `npm test` pasa 127/127. El estado de prueba se limpió del navegador.

**Pendientes opcionales, para otro chat:**
1. Stretch y Softness como pistas animables (hoy son ajustes de la cadena en `doc.ikOpts`).
2. Desplazar la timeline hasta la pista elegida.
3. Selector facial tipo MetaHuman (vídeos 2 y 3). Corresponde al taller facial, no a este.
4. Capas aditivas tipo Sequencer (vídeo 2). El taller ya tiene capas; falta revisar si coinciden.
5. Tests automáticos de `alignStrip`, `setFingers` y stretch. Hoy solo están verificados a mano en el navegador.

## Reglas
- Cada función nueva lleva su comando en `src/ia.js`.
- Verificar con `npm test` y con `node herramientas/ia.mjs` (comando `captura`). La página tiene que estar abierta en http://127.0.0.1:5189, que levanta `npm run dev:visor` desde la raíz. No arrancar otro servidor.
- Sin commits salvo que el usuario los pida.
- No duplicar archivos grandes.
