# Actualización RLB 0.8.37: apariencia dental Anatómico (Rig) / Anime (Final)

## Qué es
Dos apariencias intercambiables para los dientes, con UNA malla y UN rig. Solo cambia el material de la ranura.
No se toca geometría, encías, lengua, huesos, shape keys, drivers ni acciones. Por defecto el rig se genera en Anatómico.

## Archivos (rutas relativas al add-on `rig_labial_bendy/`)
- `nucleo/dientes_apariencia.py`  (NUEVO, todo el sistema)
- `__init__.py`  (registra/desregistra el módulo: 2+2 líneas)
- `nucleo/pasos.py`  (`boca_interior`, `revisar`, `revisar_ojos` envueltos en `with DA.anatomico()`)

## Cómo funciona
- Escena: `scene.rlb_apariencia_dental` = `'ANATOMICO'` (defecto) | `'ANIME'`. Panel «Apariencia dental» (pestaña Rig labial) + botón «Rehacer máscara dental».
- Piezas: mallas con diente/teeth/tooth en el nombre (visibles) o ya preparadas (`obj['rlb_dental']`, JSON por ranura).
- Al pasar a ANIME por primera vez, `preparar(obj)` por cada ranura con textura de color:
  1. Huella UV de los polígonos de la ranura (islas UV).
  2. Clasificación diente/encía de la textura ORIGINAL (saturación, umbral Otsu) → solo se usa una vez.
  3. Se cierran las líneas entre dientes columna a columna (`_cerrar`, hueco máx. + 2 + `SUAVIZADO` px). Las papilas de encía (V profundas) NO se rellenan salvo `SUAVIZADO` (=4 px; entre 2 y 6 px el borde pasa de dentado a casi recto e invade encía).
  4. Se guarda la máscara UV (`RLB_mascara_dientes_<obj>_<ranura>`, Non-Color) y la textura anime recortada (`RLB_anime_dientes_*`, diente = blanco liso, resto = píxeles originales), ambas empaquetadas.
  5. Material `RLB_Dientes_Anime_*`: UVMap → Mapping (offset/escala del recorte) → Imagen → Principled (rugosidad 0,4). Se exporta a GLB con `KHR_texture_transform` (probado); sin nodos exclusivos de Blender.
- `aplicar_modo(modo)` cambia `slot.material` entre `anatomico` y `anime` (guardados en el JSON). El material original nunca se modifica.
- `anatomico()` (context manager): si estaba en Anime, vuelve a Anatómico mientras el sistema trabaja con las referencias anatómicas y luego restaura. Usado en `pasos.boca_interior`, `revisar`, `revisar_ojos`.
- Enum con `update=_cambiar`; leer/escribir con `getattr/setattr`, NO con `scene['...']` (en Blender 5.2 no está como ID property).

## Probado (Tom, dientes Jinx, Blender 5.2)
Geometría idéntica (hash) tras alternar; ida y vuelta de materiales correcta; render EEVEE de ambos modos; GLB con 2 texturas + KHR_texture_transform. Falta probar el panel con el add-on instalado (reiniciar Blender) y con otros personajes.

## Límites conocidos
- Solo dientes con textura de color en el material (atlas con encía incluida). Dientes ya lisos (materiales Diente/Encía separados): no hay nada que unificar, se avisa.
- Un cambio de la textura original exige «Rehacer máscara dental».
- Si se oculta una pieza preparada, el cambio de modo la sigue afectando (por `obj['rlb_dental']`).

## Reglas del usuario a respetar
No tocar las expresiones actuales de Tom ni guardar su .blend sin pedirlo; no duplicar geometría ni rig; arreglar en el complemento, no en el personaje.
