# Panel por pasos e integración Codex

> Referencia del skill rig-labial-bendy. Se lee solo cuando hace falta. `FP` = `nucleo.facs.pipeline`;
> hay dos módulos `ojos`: `nucleo/ojos.py` (rig de huesos, lente, abertura visible) y `nucleo/facs/ojos.py` (FACS, contacto).

## Línea de trabajo del panel (0.6.7): pasos numerados, sin saltar ninguno
Panel «Rig labial» > «Rig Labial Bendy». Cada paso lleva un icono (✓ hecho, ○ toca, candado = falta el anterior) y su
botón está apagado hasta que el anterior esté hecho. El botón «Siguiente paso» (`rlb.siguiente_paso`) ejecuta el primero
pendiente de la ruta elegida. El estado vive en `cara['rlb_hechos']` (lista JSON; la escribe cada operador al terminar bien;
sin esa propiedad se deduce de lo que existe: marcadores `RLB_<cara>_…`, `<cara>_Rig_Labios`, shape keys, `facs_keys`,
`facs_preparada`, `facs_delineado_uv`, `<cara>_Cara_Control`). Repetir «Arreglar malla» borra las shape keys y por eso
deja pendientes los pasos de después. Código: `nucleo/linea.py`.

Ruta completa (19 pasos):
1 Analizar UV, malla e islas · 2 Detectar marcadores (con «Boca semiautomática» + «Aprobar marcadores» como variante) ·
3 Arreglar malla · 4 Abrir ojos esculpidos (se da por hecho si el ojo no es un bulto) · 5 Rig de labios · 6 Pesos + labio
dentro · 7 Interior de la boca · 8 Ojos · 9 Párpados, cejas y mejillas (rig) · 10 Cuenca del ojo y 11 Lente de oclusión
(se dan por hechos si no hay hueco) · 12 FACS: preparar malla · 13 FACS: boca · 14 FACS: ojos, cejas, mejillas ·
15 FACS: delineado · 16 FACS: controles · 17 FACS: drivers y terminar · 18 Expresiones para el editor (crea las acciones `<cara>_FACS_*` con miniatura y deja `scene.rlb.cara`) · 19 Probar que hable (`rlb.facs(paso='habla')`: frase de prueba + hoja de visemas; el modal del panel se para a mirarla).
Panel principal: sección «Hacer que hable» (`rlb.habla_animar`, `rlb.habla_reproducir`, `rlb.habla_parar`; en `nucleo/asistente.py`), visible con el rig terminado; si el editor de expresiones está abierto, lo termina antes de animar.
Fuera de la línea (opcionales): mapa de regiones, simetrizar, inspeccionar, sincronizar pestañas UV, iris y pupila, corte
lateral, gestos, biblioteca de expresiones, GLB, revisión y los atajos «Construir 3 a 11» y «Construir cara FACS».

Ruta «Solo párpados + delineado» (5 pasos): 1 Marcadores · 2 Abrir ojos esculpidos · 3 Ojos · 4 Párpados + delineado
(`rlb.solo_parpados`) · 5 Medida (`rlb.medir_parpados` = `FP.medir_parpados`).

## Integración Codex 0.5.2 (UV, regiones, boca semiautomática)
Fusionada en la fuente (`codex/entregas`); `interior.py` y `pasos.py` conservan mi `seguir_keys`. Nuevo en `pasos`:
- `analizar` devuelve `uv` e `islas`; `inventariar_uv`, `marcar_regiones_uv(cara, asignaciones, ojos_uv_seeds)` (semillas dadas por la persona, nunca por proximidad/material), `mostrar_regiones`.
- `ocultar_ojos_uv` / `restaurar_ojos_uv`: Geometry Nodes reversible, no aplicado.
- `detectar_boca` → revisar marcadores → `aprobar_marcadores`; `rig_labios` se bloquea si se movieron tras aprobar.
- `sincronizar_pestanas_uv`; con pestañas UV aprobadas `parpados` fuerza `recortar_globo=False`. `parpados_huesos.excluir_cejas_uv(cara)`.
- `marco.py` usa el centro X real (`M.cx`), pero la detección (`deteccion.boca`, `detectar_boca`) y el resto NO: la cara
  sigue teniendo que estar en X = 0 (desde 0.6.8 `deteccion.boca` lo comprueba y para con un mensaje claro).
- Límite declarado por Codex: sellado 3D de párpados no perfecto (Lian: separación ≤1,4 mm, cruce ≤0,4 mm). No probado aún en Blender desde esta fuente; no ejecutar `todo()`/`arreglar()` sobre la escena Lian.
