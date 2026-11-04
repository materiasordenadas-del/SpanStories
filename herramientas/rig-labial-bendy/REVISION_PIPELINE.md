# Revisión del pipeline de Rig Labial Bendy (0.6.7)

Motivo: el usuario se queja de que el complemento «se salta partes». Esta revisión lista todos los pasos y botones
que había antes de la 0.6.7, qué dejan hecho y cómo se comprueba, qué se podía saltar y qué huecos hay. Al final, lo
que se cambió (línea de trabajo con pasos bloqueados).

## 1. Pasos y botones (estado de antes de la 0.6.7)

Panel principal (`rlb.paso`, funciones de `nucleo/pasos.py`):

| Botón | Función | Necesita antes | Deja hecho / cómo comprobarlo |
|---|---|---|---|
| 1. Analizar UV, malla e islas | `analizar` | cara elegida | Solo lee; **no deja rastro**. |
| Ver/ocultar mapa de regiones | `mostrar_regiones` | – | Material de regiones (`RLB_regiones`); `p.ver_regiones`. |
| 2. Detectar boca semiautomática | `detectar_boca` | cursor 3D en la boca | 4 marcadores `RLB_<cara>_comisura.L/.R`, `_labio_sup`, `_labio_inf`; `cfg['semiauto_boca_pendiente']=True`. |
| Aprobar marcadores | `aprobar_marcadores` | `detectar_boca` | `cfg['semiauto_boca_aprobada']`, pendiente=False. `rig_labios` lo valida (`contrato_semiauto`). |
| 2. Detectar marcadores | `detectar` (+`inspeccionar`) | cursor 3D | Los 8 marcadores `RLB_<cara>_*` (incl. `ojo.L/R`, mandíbula, mentón), `cfg['seed']`, `ojos_hueco`, `ojos_esculpidos`, grupos `RLB_<parte>`. |
| Inspeccionar partes | `inspeccionar` | marcadores | Grupos de vértices por parte y foto. Ya lo hace `detectar`. |
| Simetrizar marcadores | `simetrizar` | marcadores | Copia L a R. Ya lo hace `detectar`. |
| 3. Arreglar malla | `arreglar` | marcadores | `cfg['respaldo']` + malla `<cara>_malla_respaldo_rlb`. **Borra shape keys**. |
| 3b. Abrir ojos esculpidos | `abrir_ojos` | marcadores de ojo; ojo = bulto | `cfg['ojos_abiertos']`, `ojos_hueco`. Falla si ya está abierto o no hay bulto. |
| 4. Rig de labios | `rig_labios` | marcadores (aprobados si semiauto) | Objeto `<cara>_Rig_Labios`. |
| 5. Pesos + labio dentro | `pesos` | rig | Vertex groups + shape keys `labio_sup_dentro`/`labio_inf_dentro`. |
| 6. Interior de la boca | `boca_interior` | rig | Objetos `<cara>_Dientes_sup/_inf`, `_Lengua`, `_Boca_Fondo`. |
| 7. Ojos | `ojos_lian`/`ojos_vale`/`ojos_existentes` | rig (Lian/Vale importan pivotes) | `<cara>_OjoPivote_L/R` + hijos; `cfg['ojos_modo']`, `cfg['pivotes']`. |
| 8. Párpados, cejas y mejillas | `parpados` | rig, ojos | Huesos `DEF-parp_*` en el rig, shape keys, `cfg['cuenca']`/`['oclusion']` si ya estaban. |
| Sincronizar pestañas UV | `sincronizar_pestanas_uv` | rig, regiones UV aprobadas | Pesos de pestañas UV (solo con la ruta de regiones UV). |
| 8c. Cuenca del ojo | `cuenca` | párpados, hueco | `cfg['cuenca']`. No hace nada sin hueco. |
| 8d. Lente de oclusión | `oclusion` | párpados | `cfg['oclusion']`, objeto lente. |
| Corte lateral de los ojos | `corte_ojo` | rig | Solo revisión (render). |
| 8b. Ajustar iris y pupila | `ajustar_iris` | ojos | `cfg['iris']` (Vale) o `ojos_lian`. |
| 9. Gestos | `crear_gestos` | rig | Acciones `<rig>_Gesto_*`, marcadores de línea de tiempo. |
| 9b. Biblioteca de expresiones | `expresiones.retarget`+`hornear` | gestos | Acciones `ref_*`, shape keys `GLB_*`. |
| 10. Exportar GLB | `exportar_glb` | 9b | Archivo `.glb`. |
| Construir 3 → 9 | `todo` | marcadores | Encadena 3, 3b (condicional), 3c quitar pestañas, 4–8, cuenca, lente, gestos. |
| Revisión (renders) | `revisar` | rig | PNG en `RLB_revision/`. |

Panel «Cara FACS» (`rlb.facs`, `nucleo/facs/pipeline.py`) y camino corto (`rlb.solo_parpados`):

| Botón | Función | Necesita antes | Deja hecho / cómo comprobarlo |
|---|---|---|---|
| F1. Preparar malla | `preparar` | rig (pasos 1–8) | `cara['facs_preparada']`, atributo `facs_basis_original`. Repetir no hace nada. |
| F2. Boca | `boca` | F1 | shape keys `jawOpen`…, lista `cara['facs_keys']`; forro, dientes, lengua. |
| F3. Ojos, cejas, mejillas | `ojos` | F1, ojos con pivote | `eyeBlink_L/R`, `eyeBlink_mid_*`, `eyeSquint`… en `facs_keys`; correctivas `eyeBlink_<X>_<lado>`. (0.6.7: parpadeo por ARAP). |
| F4. Delineado | `delineado` | F3 | `cara['facs_delineado_uv']` (material, imagen, caras); pestañas Tripo borradas. |
| F5. Controles | `controles` | F2–F4 | Objeto `<cara>_Cara_Control` con canales `v_*`. |
| F6. Drivers y terminar | `terminar` | F5 | Rig viejo apagado (modificadores Armature con `show_viewport=False`), shape keys no FACS silenciadas. **Sin marca propia**. |
| Construir cara FACS (todo) | `construir_todo` | pasos 1–8 | F1–F6 seguidos. |
| Solo párpados + delineado | `FP.parpados` | marcadores, ojos (y abrir_ojos si hay bulto) | `facs_densificado`, `eyeBlink_*`, `facs_delineado_uv`, `r['medida']`. |

## 2. Qué se podía saltar (antes de la 0.6.7)

- Todos los botones estaban siempre activos. Se podía pulsar F1 sin rig (error), F4 sin F3, F5 sin F2, «Terminar» sin controles, etc.
  Algunos fallaban con un mensaje (falta rig / faltan marcadores); otros **funcionaban a medias sin avisar**:
  - `ojos` (F3) sin `preparar` (F1): trabaja sobre un Basis sin alisar ni labios sellados.
  - `delineado` sin párpados: pinta con la abertura sin keys; no sigue al parpadeo.
  - `terminar` sin `controles`: los drivers se crean sin canales.
  - `parpados` (8) antes de `ojos` (7): error, pero `parpados` antes de `cuenca`/`oclusion` también es posible y cambia el resultado (las rehace solo si ya existían).
  - `abrir_ojos` omitido en Tripo con bulto: los párpados se calculan sobre el bulto (el agujero de ojos no existe).
  - `quitar_pestanas` (3c) solo corría dentro de `todo`/`delineado`; ya no es botón.
- «Construir 3 → 9» y «Construir cara FACS (todo)» eran la única forma de garantizar el orden, pero no avisaban de lo que ya estaba hecho ni de lo que quedaba por rehacer.
- El camino de la ruta corta («Solo párpados + delineado») dependía de pasos previos que solo describía el tooltip.
- Dos paneles separados (principal y FACS) con numeraciones distintas (1–10 y F1–F6): el orden entre ellos no era visible.

## 3. Fallos y huecos que vi

1. **Sin estado**: nada recordaba qué paso estaba hecho; `analizar` y `terminar` no dejan rastro verificable.
2. **`arreglar` borra shape keys** y el panel no avisaba de que 5 y 8 (y todo FACS) había que rehacerlos.
3. **`abrir_ojos` falla si no es necesario** (ojo sin bulto): con una línea estricta habría que darlo por hecho cuando `ojos_esculpidos` es falso.
4. **`cuenca`/`oclusion`** no hacen nada sin hueco, pero estaban mezcladas con pasos obligatorios.
5. **Duplicidad de rutas**: gestos/9b/GLB (rig) y FACS (shape keys ARKit) son caminos alternativos para la salida; no estaban distinguidos.
6. **Ruta corta**: `medir_parpados` ya va dentro de `FP.parpados`; no había un botón de medida independiente.
7. **Sincronización**: la copia en `codex/plugins/rig-labial-codex/assets/rig_labial_bendy` y `sincronizar.py` siguen en 0.6.6 hasta que alguien los sincronice.

### Hallazgos de esta noche (Martín; ya corregidos en el código de párpados 0.6.7)

(a) **Detector de borde visible**. `_columnas_abertura` en `nucleo/ojos.py` solo mira de −0,012·E a +0,0215·E y en Martín se quedaba
a 3 mm del lagrimal: al cerrar quedaba un agujero. `parpados_arap.bordes_finos` mide toda la abertura.
(b) **Normales propias de Tripo**. No siguen a las shape keys y eran gran parte de las «arrugas» del párpado cerrado.
`parpados_arap.normales_auto` las cambia por las de la malla en la zona que se mueve.
(c) **Altura del delineado**. Medía su alto de frente y, al cerrar, la cara de abajo del reborde giraba hacia delante (mancha negra
de 4 mm). `parpados_arap.delineado_tope` pone como mínimo la distancia por la piel al borde (alisada).

## 4. Cambio de la 0.6.7: línea de trabajo

- Nuevo `nucleo/linea.py`: lista ordenada de pasos, estado y bloqueo.
- Panel principal: pasos numerados con icono de estado (hecho / toca / bloqueado) y el botón desactivado hasta que el anterior esté hecho.
- Nuevo operador `rlb.siguiente_paso` («Siguiente paso»): ejecuta el primer pendiente llamando a los mismos operadores.
- Nuevo operador `rlb.medir_parpados` (paso final de la ruta corta).
- Nueva propiedad `rlb.ruta` (completa / solo párpados + delineado).
- Estado: `cara['rlb_hechos']` (JSON). Si no existe, se deduce de los objetos y propiedades de la tabla de arriba y se guarda en la primera marca.

### Ruta completa (17 pasos)

| Nº | Paso | Hecho si (deducción) | Operador |
|---|---|---|---|
| 1 | Analizar UV, malla e islas | marca; deducido = hay marcadores | `rlb.paso analizar` |
| 2 | Detectar marcadores | 4 marcadores `RLB_<cara>_*` y sin aprobación pendiente | `rlb.paso detectar` (variante semiauto: `detectar_boca` + `aprobar_marcadores`) |
| 3 | Arreglar malla | marca / rig o `cfg['respaldo']` | `arreglar` |
| 4 | Abrir ojos esculpidos | `cfg['ojos_abiertos']` o ojo sin bulto (se da por hecho: «no hace falta») | `abrir_ojos` |
| 5 | Rig de labios | existe `<cara>_Rig_Labios` | `rig` |
| 6 | Pesos + labio dentro | shape key `labio_sup_dentro` | `pesos` |
| 7 | Interior de la boca | existe `_Dientes_sup` o `_Boca_Fondo` | `interior` |
| 8 | Ojos | existe `_OjoPivote_L` o modo Sin globos | `ojos` |
| 9 | Párpados, cejas y mejillas (rig) | huesos `DEF-parp*` en el rig | `parpados` |
| 10 | Cuenca del ojo | sin hueco: no hace falta; con hueco: `cfg['cuenca']` | `cuenca` |
| 11 | Lente de oclusión | sin hueco: no hace falta; con hueco: `cfg['oclusion']` | `oclusion` |
| 12 | FACS: preparar malla | `facs_preparada` | `rlb.facs preparar` |
| 13 | FACS: boca | `jawOpen` en `facs_keys` | `boca` |
| 14 | FACS: ojos, cejas, mejillas | `eyeBlink_L/R` en `facs_keys` | `ojos` |
| 15 | FACS: delineado | `facs_delineado_uv` | `delineado` |
| 16 | FACS: controles | existe `<cara>_Cara_Control` | `controles` |
| 17 | FACS: drivers y terminar | marca / rig viejo apagado + controles | `terminar` |

Fuera de la línea (opcionales, siempre que haya rig): mapa de regiones, simetrizar, inspeccionar, sincronizar pestañas UV, iris y pupila,
corte lateral, gestos, biblioteca de expresiones, GLB, revisión, y los atajos «Construir pasos 3 a 11» y «Construir cara FACS» (solo tras el paso 11).

### Ruta corta (5 pasos)

1 Marcadores · 2 Abrir ojos esculpidos · 3 Ojos · 4 Párpados + delineado · 5 Medida.

### Riesgos conocidos de la nueva línea

- Una cara hecha a mano antes de la 0.6.7 se deduce; si algo se hizo con ajustes raros, el icono puede mentir. Para forzarlo: borrar la propiedad personalizada `rlb_hechos` de la cara.
- El paso 17 no deja un rastro propio fiable: se apoya en la marca (si se hizo con código sin pasar por el operador, se deduce del rig apagado).
- El paso 1 no deja rastro: en archivos viejos se da por hecho si hay marcadores.
- Repetir el paso 3 deja pendientes del 5 al 17 (salvo 4 si los ojos ya están abiertos).
