# Errores al seguir el skill 0.6.8 en Carlitos (2026-10-21)

Prueba: seguir el skill `rig-labial-bendy` al pie de la letra (como lo haría Sonnet), en el Blender abierto, sin
guardar. Cada fila: paso, qué pasó, por qué es un problema para un modelo pequeño, arreglo propuesto/hecho.

| # | Paso | Qué pasó | Arreglo |
|---|---|---|---|
| 1 | 1 `analizar` | Devuelve las listas completas de caras de las 262 islas UV y de las 55 islas: decenas de KB en la respuesta del MCP. | Resumen corto por defecto; detalle solo con `detalle=True`. |
| 2 | 2 `detectar` | El skill pide `(0, y, z_boca)` pero no dice cómo hallarlo; hay que lanzar rayos a mano para encontrar la boca. | Si no se da punto, buscar la boca sola (perfil de rayos en x = 0). |
| 3 | 2 `detectar` | Ojo R mal: globo de 23 mm (L 11,7) y 15 mm más bajo. En Carlitos el ojo R de Tripo es una isla suelta (181 vért.) y `buscar_en_malla` solo busca en la isla de la cara: encajó una esfera en la mejilla. No avisa de la asimetría. | Buscar también en islas sueltas junto al ojo; si L y R no se parecen, usar el bueno reflejado y avisar. |
| 4 | 2 `inspeccionar` | La foto de partes pinta el ojo R como «mechón» y una mancha de «ojo_tripo.R» en la mejilla (consecuencia del 3). | Igual que el 3. |
| 5 | 2 | Con el .blend sin guardar, las hojas van a `%TEMP%\blender_xxx\RLB_revision` y no se avisa. | Avisar en la salida (`carpeta_temporal: True`). |
| 6 | 3 `todo` | Con el ojo R mal, `todo` para en `abrir_ojos` («no parece un medio globo») DESPUÉS de haber hecho `arreglar`: la malla queda a medias y no dice qué pasos se hicieron. | `todo` comprueba antes de tocar nada (ojos, marcadores) y, si falla, dice en qué paso y qué quedó hecho. |
| 7 | 2 (arreglo del 3) | Tras buscar también en islas sueltas, ganaban esferas de los pómulos (22–26 mm, simétricas y con más caras). | Elegir por cobertura (área del bulto / media esfera: ojo 1,4, pómulo 0,1) y ajustar la isla suelta entera. HECHO 0.6.9. |
| 8 | 2 `inspeccionar` | El ojo R (isla suelta) salía también como «mechon» en la foto, encima de su color de ojo. | Saltar islas ya clasificadas. HECHO 0.6.9. |
| 9 | 3 `todo` | La salida es un dict enorme (pesos por hueso, contacto por iteración…) con `np.float64` dentro: si se devuelve tal cual por el MCP falla la serialización JSON; hay que hacer `str()[:N]`. | Resumen corto y serializable + `avisos` + `siguiente`. |
| 10 | skill | El flujo por código del skill acaba en `todo` + `revisar`, pero la ruta completa del panel (linea.py) tiene 6 pasos FACS más (`FP.preparar…terminar`) que el skill no menciona. Sonnet entrega párpados del rig viejo (en Carlitos: ceja esculpida arrugada en sorpresa/furia, cierre con línea doble rota). | Una sola llamada que haga la ruta completa; documentarla. |
| 11 | FACS | `FP.construir_todo` en una sola llamada MCP pasa del tiempo límite (timeout del MCP) aunque Blender siga trabajando: el modelo no sabe si terminó ni si falló. | Pasos FACS en llamadas separadas en el skill, o que cada paso deje su marca/estado consultable (`pasos.estado(cara)`). |
| 12 | 4 revisión | En la vista 3/4 la banda de dientes se ve como un bloque blanco plano con un corte vertical (los dientes sup. e inf. se solapan: sup. 862,8–868,4, inf. 857,5–863,0). | Pendiente de mirar con la ruta FACS (rehace los dientes). |
| 13 | 4 revisión (FACS) | `pasos.revisar` posaba los huesos del rig viejo, que FACS apaga: las 10 poses salían iguales. | Con cara FACS, cada pose es una expresión de la biblioteca (`revision.POSES_FACS`). HECHO 0.6.9. |
| 14 | 4 revisión (FACS) | Aun así las expresiones no movían la cara: los drivers de las keys estaban marcados «no válidos» (tras recargar el add-on). `terminar` los refresca una vez, pero no dura. | `biblioteca.aplicar` refresca los drivers si alguno no es válido. HECHO 0.6.9. |
| 15 | FACS `boca` | Manchas rojo oscuro en la barba alrededor de la boca, en reposo (forro/comisuras oscurecidos fuera de la boca). | Por investigar. |
| 16 | FACS `delineado` | La línea negra queda por encima del borde del párpado, en el pliegue del reborde esculpido de Tripo, no en el filo. | Por investigar. |
| 17 | FACS `ojos` | `medir_parpados`: ojo L 11,7 % visible al cerrar (R 0 %), ~20 triángulos invertidos por lado. | Por investigar tras ver las hojas. |
| 18 | 2 `detectar` | Con `buscar_boca` (nuevo) la primera boca «con ojos» era el pecho: los pectorales encajan dos esferas simétricas de 67 mm. | Se prueban todos los surcos y gana la mayor cobertura de los globos (pectoral 0,21; ojo ≥ 0,5) y ojos a 1–6 hw encima. HECHO. |
| 19 | 1 | El GLB de Tripo trae los vértices partidos en cada costura UV: la isla de la cara tenía 1 569 vértices y el resto, cientos de islas; pesos y keys solo veían un trozo. | `pasos.soldar` (Merge by Distance) en el paso 1 de `siguiente()`; `analizar` avisa. HECHO. |
| 20 | 6 `interior` | Dientes (701 v.) y cavidad (180 v.) de Tripo fuera de la caja de búsqueda: no se quitaban, quedaban inmóviles y asomaban por la barba al abrir. | Caja más amplia + centro detrás de las comisuras. HECHO. |
| 21 | 2 | `buscar_boca` + detección pasaban del tiempo límite del MCP (10 candidatos × 3,5 s). | Islas una vez, `ojos(rapido=True)`, sin repetir bocas iguales: 19 s. HECHO. |
| 22 | 2 / 4 | Objeto con espacio al final («Tronchatoro »): la carpeta de revisión no es válida en Windows y el render fallaba. | `util.carpeta_revision` sanea el nombre. HECHO. |
| 23 | 2 | Ceja gruesa (0,89 R de alto) descartada: el límite 0,8 R venía de un mechón de Lian. | Límite 1,3 R (la condición «más ancha que alta» ya quita mechones). HECHO. |
| 24 | 3 | `siguiente()`: la revisión final (terminar + medir + 25 renders) no cabía en una llamada y el resultado se perdía. | La revisión va en su propia llamada al final. HECHO. |
