# Herramientas: IK renovado y herramientas del add-on de Blender «Herramientas»

17/11/2026. Reimplementación nativa (three.js) de las funciones del add-on de Blender **Herramientas** (Tal Hershkovich, MIT, `bl_info` 0.0.7.6) sobre el motor del Taller: tiras, capas y claves al estilo iClone. No se copió código Python: se leyeron sus algoritmos y se rehicieron (créditos en `docs/THIRD_PARTY_NOTICES.md`). No se ocultó ni se quitó ninguna función existente.

Respaldo previo: `D:\Español\RESPALDO_NO_CARGAR\taller-animacion-antes-herramientas-20261117\` (con `RESTAURAR.md`).

## Dónde está cada cosa en la interfaz

| Herramienta | Dónde | Atajo / comando IA |
|---|---|---|
| IK ⇄ FK sin saltos | Herramientas › IK ⇄ FK. También los interruptores de siempre (Rig, Selector, Esquema), que ahora son sin saltos. | `ikCambiar`, `ik` |
| Controles temporales IK y en espacio mundo, hornear, cancelar, convertir a FK | Herramientas › Controles temporales y horneado | `controlTemporal`, `controlesTemporales`, `hornearControl`, `hornear` |
| Trayectoria editable | Herramientas › Trayectoria · Mostrar › 〰 | Mayús+P · `trayectoria` |
| Intercalar / espejo / base | Herramientas › Intercalar y mezclar poses | `intercalar` |
| Copiar / pegar matriz (mundo, relativa) | Herramientas › Copiar y pegar matriz · barra «Copiar y pegar» (🌐⧉ 🌐📋 ⛓⧉ ⛓📋, junto a los de siempre) | `copiarMatriz`, `pegarMatriz` |
| Pivote temporal relativo | Herramientas › Pivote temporal (gizmo turquesa propio) | `pivote` |
| Desfase en cascada, compartir claves, Multikey | Herramientas › Desfase, compartir claves y Multikey | `desfase`, `compartirClaves`, `multikey` |
| Retimer con marcadores | Herramientas › Retimer; marcadores ▼ en la regla de la línea de tiempo (se arrastran) | M · `marcador`, `retimer` |

El menú **Herramientas** está en la barra superior (Alt+Q), como Motion Director o Look At.

## Qué hace cada una

### IK renovado: la causa de la pierna rota
Antes, el solver de dos huesos solo «apuntaba» cada hueso. La torsión del muslo no se corregía, el polo salía de la flexión de la animación (inestable con la pierna casi recta) y el resultado no respetaba los límites. Eso daba rodillas hacia delante o de lado y piernas cruzadas.

Ahora `solveLimb` (`src/core/ik.js`):
1. Dobla la rodilla o el codo **solo alrededor de su bisagra anatómica**, entre 0° y 150° (solución cerrada).
2. Gira el miembro entero hasta el plano del polo.

El polo por defecto viaja con el miembro. En las piernas sigue además el giro del pie: la rodilla mira hacia donde va el pie. Sin ediciones, el resultado es exactamente la animación. El polo se guarda en el marco de la cadera (`doc.ikv = 2`), así que acompaña al cuerpo cuando gira. Los documentos antiguos con polos se siguen leyendo como antes.

**Muñeca natural.** Antes, al mover la mano por IK, la mano conservaba su giro en el mundo: la muñeca se doblaba hasta 150° (90° fuera de rango) y la mano no seguía a la muñeca. Ahora (`Engine.naturalWrist`):
- la mano **sigue al antebrazo** (conserva su relación con él);
- si se gira la mano a propósito, la pronación o supinación la hace sobre todo el antebrazo (75 %, como el radio y el cúbito) y no la muñeca;
- la muñeca no pasa de su rango natural (salvo que la animación ya viniera así).

Vale igual al girar la mano en FK con el gizmo. Las anclas de mano y «palma abajo» (Reach Target) siguen mandando en el mundo. Se desactiva con «Límites naturales».

**Sin realimentación.** Poner clave, pegar, espejo, girar un hueso de un miembro en IK y el comando `rotar` ya no guardan como FK la pose resuelta por el IK (eso hacía que el IK resolviera dos veces). Un miembro en IK se guarda como IK: efector y polo emparejados con lo que se ve (`keyChainPose`, `keyPoseSmart`).

**IK ⇄ FK sin saltos** (`switchIK`):
- A IK: empareja la pose actual.
- A FK: hornea lo que hacía el IK en todo el rango, con claves inteligentes, y no salta en ningún fotograma.

### Controles temporales (Temp IK / Temp FK / World Space Ctrls)
- **IK temporal** (mano o pie, en un rango): el efector pasa a ser un objetivo absoluto en el mundo, con claves solo donde hacen falta.
  - Mover el control cambia la clave de ese fotograma; las vecinas se quedan (edición local, también sobre mocap).
  - «Hornear» lo deja en claves FK. «Cancelar» lo devuelve todo exactamente como estaba.
- **Mundo temporal**: un hueso conserva su giro de mundo (la cadera, también su posición) aunque el cuerpo se mueva. Se edita girándolo y se hornea igual.
- **Convertir a FK** (FK temporal): el IK de un miembro se hornea a giros FK en un rango, para retocar hueso a hueso.
- **Hornear lo que se ve**: lo que producen el IK, Look At o los controles queda como FK. Si una mano no llegaba y el IK inclinaba la columna y el hombro, esos huesos se hornean también (si no, cambiaría la pose).

El horneado es inteligente (`src/core/edit/bake.js`): inserta el fotograma de mayor error hasta que todo queda dentro de la tolerancia (0,3° / 0,6° / 1,5°, o una clave por fotograma), y luego comprueba el resultado.

### Trayectoria editable
Muestra el camino de lo elegido: mano, pie, cadera, cabeza u otro hueso.
- Naranja: lo ya recorrido. Azul: lo que falta. Puntos por fotograma y bolas amarillas en las claves.
- Arrastrar una bola cambia la clave de ese fotograma:
  - mano/pie: objetivo IK;
  - cadera: traslación;
  - otro hueso: giro del padre.
- Mayús elige varias; Alt + arrastrar las escala. Clic: ir a ese fotograma.
- **Influencia ±N** (por defecto 6): las claves vecinas acompañan con caída suave. Sobre mocap o controles temporales, con claves en casi todos los fotogramas, no queda un pico de un fotograma.
- Se muestra alrededor del cabezal (±N) o en todo el rango.

### Copiar / pegar matriz
- **Mundo**: el hueso vuelve al mismo sitio y giro del mundo.
- **Relativa**: guarda la relación con el hueso activo (el último elegido). Al pegarla en un rango se mantiene fotograma a fotograma, con anclas absolutas para manos y pies (mano en la cadera, en la cabeza, en el hombro de otro…).
- Los modos anteriores (local, global, espejo, a lo largo del tiempo) siguen igual.

### Intercalar y mezclar
Deslizador en el fotograma actual, en espacio mundo o local:
- hacia la clave anterior o la siguiente (breakdown);
- hacia la pose reflejada del otro lado;
- hacia la animación sin esta capa.

### Retimer con marcadores
Marcadores ▼ en la regla. Al arrastrar uno, el tiempo entre sus vecinos se estira o se encoge; la deformación es lineal por tramos y nunca invierte el orden.
- Mueve las claves (todas las capas o la activa).
- Con «También la base», deforma también las tiras, mocap incluido, con `strip.timeMap`.
- Viaja en el enlace y en los proyectos.

### Desfase, compartir claves y Multikey
- **Desfase en cascada**: cada hueso elegido se retrasa un poco más que el anterior (solapamiento), en orden de selección o de la raíz a la punta.
- **Compartir claves**: todos los huesos elegidos con clave en la unión de fotogramas. Cada clave nueva parte la curva por de Casteljau, así que el movimiento entre claves no cambia (exacto en lineal, suave, sale/llega lento, Bézier y en giros «auto»).
- **Multikey**: *Escalar* exagera (>1) o suaviza (<1) el movimiento respecto a su neutro; *Variar* suma ruido repetible (semilla).

### Pivote temporal relativo
Una esfera turquesa con su propio gizmo. Los huesos elegidos giran a su alrededor; la cadera también se traslada y manos y pies van por su objetivo IK. Si va pegada a un hueso, lo acompaña en cada fotograma. Ejemplo: girar todo el cuerpo sobre la punta del pie de apoyo.

## Código

- `src/core/ik.js`: `limbInfo`, `limbFrame`, `solveLimb`. `solveTwoBone` se queda para `acting.js`.
- `src/core/animation.js`:
  - `applyIK` con el nuevo solver; `poleFrameQ` e `ikVersion`;
  - `keyChainPose`, `keyPoseSmart`, `switchIK`, `chainOfBone`, `chainPose`;
  - controles temporales: `tempAt`, `applyTempWorld`, `keyTempWorld`, y `keyIK` dentro de un IK temporal;
  - `stripPose` con `timeMap`.
- `src/core/edit/`: `bake.js`, `temp.js`, `motionpath.js`, `keyops.js` (desfase, compartir, Multikey), `retime.js`, `inbetween.js`, `matrix.js`, `pivot.js`.
- `src/ui/`: `herramientas.js` (panel), `motionpath.js` (trayectoria en el visor), `pivotview.js` (pivote). También cambian `timeline.js` (marcadores), `topmenu.js` (menú), `panels.js` (accesos en «Copiar y pegar» y «Mostrar»; los interruptores IK/FK usan `app.setIK`) y `viewport.js`.
- `src/main.js`: `setIK`, claves sin realimentación, pegado, espejo, atajos M y Mayús+P, gizmo de cadera en ejes del mundo con «Arrastrar».
- `src/ia.js`: comandos nuevos. Además, `run()` ya acepta los comandos antiguos escritos con `f:`: `anclar`, `fijarPies`, `ikPeso`, `dedos`, `gizmo`, `ikOpciones`, `ayudas`, `curva`, `curvaTira` y `arrastrar` fallaban siempre con «c.fn is not a function».
- `src/io/url.js`: `iv` (versión del IK), `mr` (marcadores) y `T…` (mapa de tiempo de cada tira).
- Pruebas: `tests/herramientas.test.js`, 22 pruebas con dos esqueletos (Rachel y el Anciano Mixamo).

## Fuera de esta tanda

- **Rigger Toolbox** (B-bone widgets, unir armaduras): edita esqueletos, y en el Taller los personajes llegan ya rigueados (regla de `AGENTS.md`). Se hace en Blender. Lo cercano que el Taller ya tiene: objetos pegados a la mano, accesorios (`accessories.js`) y tamaño y visibilidad de los controles.
- Convert / Find Rotation Mode: el Taller trabaja en cuaterniones; el editor de curvas ya muestra Euler.
- Link / Unlink Temp Chains: los controles temporales son por miembro o por hueso.
