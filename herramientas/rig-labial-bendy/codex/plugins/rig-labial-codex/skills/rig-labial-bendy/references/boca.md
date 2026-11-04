# Boca: dientes, gestos y trampas

> Referencia del skill rig-labial-bendy. Se lee solo cuando hace falta. `FP` = `nucleo.facs.pipeline`;
> hay dos módulos `ojos`: `nucleo/ojos.py` (rig de huesos, lente, abertura visible) y `nucleo/facs/ojos.py` (FACS, contacto).

## Dientes y gestos a medida (Señor Gómez)
- Si el modelo trae dientes humanos (arcadas sueltas con encía), `boca_interior` mide su tamaño
  (`interior.medir_dientes_modelo`: frente, ancho, fondo y alto de la corona) y hace las bandas a esa medida.
  La medida queda en `cfg['dientes_ref']`, porque al repetir el paso ya no están en la malla.
  `{'dientes_del_modelo': False}` vuelve a las medidas de Vale.
- Gestos propios del personaje: `cfg['gestos'] = {'sonrisa': {...}}` (mismo formato que `GESTOS`) y después
  `crear_gestos`. No toca la sonrisa de los demás. Con la boca entreabierta en reposo y bigote, CERRAR (0,5)
  aplasta los labios: el usuario rechazó las sonrisas cerradas y eligió `jaw(-0.003)` + `comis(0.0026, 0.0017, 0.0055)`.
- Comprueba la orientación con un render bien hecho (cámara en −Y mirando a +Y) antes de decir que la cara
  mira al revés: un fallo de cámara hizo girar a Gómez 180° sin necesidad.
- Pendiente: el forro de Tripo que va hasta la garganta (unas 136 caras de piel detrás de los labios) se ve
  gris de 3/4 con la boca abierta. Habría que oscurecerlo en `interior.construir`.

## Trampas conocidas (de Vale)
- La comisura de Tripo trae una solapa de 2 triángulos: picos al abrir. Se borran solo caras (índices intactos).
- Las líneas de las cadenas van por el CENTRO de cada labio; por el borde de contacto o por rayos al punto más
  abultado salen mal.
- Labios unidos en la malla: los pesos usan una barrera en la línea de la boca; más allá de la comisura
  manda la altura. Si un lado sale distinto del otro, la malla no es simétrica: revisa ese lado.
- En la comisura la deformación casi aplasta y crazyspace amplifica: las keys de «labio dentro» tienen tope.
- Workbench ignora el backface culling del material: una bolsa cerrada tapa la lengua (el fondo va abierto).
- Recrear un hueso con el mismo nombre conserva sus restricciones: se borran antes.

## Apariencia dental: Anatómico (Rig) / Anime (Final)
`nucleo/dientes_apariencia.py`; propiedad de escena `rlb_apariencia_dental` y panel «Apariencia dental». Una sola malla y un solo rig: solo cambia el material de la ranura (nunca geometría, encías, lengua, shape keys, drivers ni acciones). Por defecto Anatómico.
- Anime = dientes como banda blanca continua. La máscara diente/encía se calcula UNA vez desde la textura original (color + silueta + huella UV) y queda guardada como imagen UV `RLB_mascara_dientes_*`; el material anatómico original no se toca.
- El material Anime es UVMap → Mapping → imagen recortada → Principled (exporta a GLB con KHR_texture_transform, sin nodos exclusivos de Blender).
- `dientes_apariencia.anatomico()` (context manager) vuelve a Anatómico mientras se trabaja con las referencias anatómicas (ya envuelve `pasos.revisar`, `revisar_ojos` y `boca_interior`) y restaura el modo.
- Las papilas de encía son V profundas: `SUAVIZADO` = 4 px es el compromiso entre borde dentado (0–2) y banda que invade encía (≥ 6).
- Solo dientes con textura de color con divisiones; dientes ya lisos no necesitan Anime. Tras cambiar la textura original: botón «Rehacer máscara dental».
- Leer/escribir el modo con `getattr/setattr(scene, 'rlb_apariencia_dental')`, no con `scene[...]`.

