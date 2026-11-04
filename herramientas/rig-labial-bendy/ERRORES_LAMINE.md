# Errores al llevar a Lamine por la línea completa (0.6.9, 2026-10-21)

Prueba: `pasos.siguiente(cara)` en bucle, como lo haría Sonnet, sobre Lamine (Tripo, cuerpo entero de 1 m, malla
simétrica, ojos esculpidos, sin texturas). Blender abierto, sin guardar. Claude diagnostica; un subagente Sonnet
arregla el complemento.

| # | Paso | Qué pasó | Arreglo |
|---|---|---|---|
| 1 | detectar | `mandibula` y `menton` salían de Vale escalada por el ancho de la boca: pivote 50 mm detrás de la oreja y mentón en el cuello. | `deteccion.mandibula()`: mentón por el perfil x = 0 (lo más saliente antes del cuello); pivote delante de la oreja (y mínima de lo más ancho − 0,3 hw). Vale solo como último recurso y con aviso. HECHO. |
| 2 | detectar | Un modelo pequeño no puede revisar marcadores leyendo coordenadas. | `pasos.foto_marcadores` (frente y perfil, bolitas de color); `siguiente()` siempre para tras detectar y pide mirarla. HECHO. |
| 3 | detectar | La primera detección dio la comisura 25 mm más adentro (y −15,8) que la segunda (−41,5) con el mismo punto. | Sin explicar; vigilar en la próxima cara. |
| 4 | F_ojos | La ruta completa no densificaba los párpados (solo la ruta «solo párpados»): aristas de 4,6 mm para una línea de 2 mm, borde del delineado poligonal y con muesca. | `preparar()` densifica tras descuantizar y sellar (cortes automáticos: 2 si p90 > 0,12 r). HECHO. |
| 5 | F_ojos | Tras densificar, la piel del contorno sale granulada: normales crudas por vértice sobre la subdivisión plana. | Normales suavizadas (8 pasadas) en la zona del ojo: probado a mano, piel limpia y línea lisa. EN CURSO. |
| 6 | F_delineado | Ojo cerrado: mancha negra en el centro de la línea (la cara de abajo del reborde gira hacia delante). `delineado_tope` (0.6.7) solo se llamaba con bandera en la ruta «solo párpados». | Aplicarlo en la ruta completa. EN CURSO. |
| 7 | F_ojos | En sorpresa (eyeWide) la piel encima del párpado se arruga y el borde de la línea negra sale en picos. | Pendiente (método de giro para eyeWide). |
| 8 | editor | El «Editor de expresiones» no listaba nada en Lamine: las acciones `<cara>_FACS_*` solo las creaba un botón escondido tras «Modo construcción». | Paso 18 `F_expresiones` en la línea y en `siguiente()`; `scene.rlb.cara` queda puesta. HECHO. |
| 9 | rehacer | No había forma limpia de repetir la parte FACS: quedaban `facs_preparada`, keys, control, drivers y el rig viejo apagado. | `pasos.rehacer(cara, desde)`. Probado en Lamine desde F_preparar. HECHO. |
| 10 | siguiente | `n` contaba el paso siguiente, no los hechos; `_corto` escondía listas y dicts pequeños. | HECHO. |
| 11 | F_ojos | Con la densificación F_ojos tarda 44 s (antes 22): cerca del límite del MCP en mallas mayores. | Vigilar. |
| 12 | boca | Boca correcta: comisuras sin desgarros, jawOpen 1 baja el labio 13,8 mm. En 3/4 con la boca abierta se ve el forro oscuro en la comisura y en «furia» las bandas de dientes se solapan (mordida). | Aceptable; sin cambios. |
| 13 | mantenimiento | `sincronizar.py` solo copiaba: quedaban archivos viejos en el add-on instalado, en la copia de Codex y en la caché del plugin. | Espejo (borra lo que ya no existe) y `empaquetar.py --instalar` registra la versión nueva y borra las viejas. HECHO. |
| 14 | rehacer | `rehacer(cara, 'detectar')` sobre una malla ya procesada volvió a ejecutar arreglar, abrir_ojos, rig, cuenca… sobre la malla densificada: 33 019 → 31 325 vértices y picos saliendo de los ojos (índices guardados, respaldo, `facs_basis_original` y máscara de la cuenca ya no casaban). | `pasos.primer_paso_seguro` (malla procesada: `rig`; densificada: `oclusion`); `rehacer` sube el `desde` con aviso y deja los anteriores como hechos; `siguiente()` omite (marca y avisa) pasos inseguros sobre malla procesada; `arreglar` y `quitar_cuenca` se niegan en malla procesada/densificada; «Empezar de nuevo» usa el rehacer seguro. HECHO, sin probar en Blender. |
| 15 | habla | El lipsync existía pero escondido en Avanzado; sin audio fallaba con las pausas del texto (tupla de 2 en vez de 3). | Arreglo en `secuencia`; panel «Hacer que hable», paso 19 `F_habla` con hoja de visemas, `pasos.hablar`. HECHO (0.7.1). |
| 16 | habla | «Antinatural»: texto distinto del audio (se estiraba «Buenos días…» sobre otra frase), mandíbula que castañetea, cierres de labios de golpe, espejo perfecto, la sonrisa de fondo tapaba el redondeo de O/U y la b/v entre vocales cerraba del todo. | Aviso texto↔audio (razón de duraciones), suelo y filtro en la mandíbula, rampas en MBP, asimetría leve, sonrisa × (1 − 1,5·redondeo), visema `BL` para [β]. HECHO (0.7.2). |
