---
name: rig-labial-bendy
description: >
  Pone el rig de labios con Bendy Bones (el método del tutorial usado en Vale) a cualquier cara de Blender
  con el add-on Rig Labial Bendy, paso a paso, y luego lo ajusta mirando renders de cerca. Reutiliza la boca
  anime de Vale (dientes en banda continua, lengua, fondo oscuro), sus ojos (globo, iris, pupila, brillos),
  párpados con pestañas pegadas, cejas, mejillas y 12 gestos (alegría, tristeza, rabia, sorpresa). Úsalo
  cuando pidan rig de labios/boca, «el rig de Vale» en otro personaje, gestos o expresiones con este rig,
  párpados que cierren con las pestañas, o dientes/lengua/ojos para una cara nueva.
---

# Rig labial Bendy (método Vale) en cualquier cara

El add-on hace el trabajo mecánico (detectar, construir, renders). **Este skill es el criterio**: qué
mirar en cada paso, qué ajustar y qué no dar por bueno. El usuario rechazó resultados «horribles» por
fallos que solo se ven DE CERCA (picos en el borde del labio, desgarros en la comisura): mira siempre las
hojas de revisión ampliadas antes de decir que está hecho.

- Add-on en Blender: `bl_ext.user_default.rig_labial_bendy` (panel N > «Rig labial»).
  Zip: `${CLAUDE_PLUGIN_ROOT}/assets/rig_labial_bendy_0.4.1.zip`; fuente en
  `D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\`.
- **Ahorra tokens:** el objetivo del complemento es el mejor resultado con el mínimo de tokens. Todo lo
  que se pueda automatizar va al add-on (no scripts sueltos). Para probar cambios de la fuente en una sola
  llamada: `ORIGEN='Malcon'; CURSOR=(0,y,z); exec(open(r'...\rig_labial_bendy\dev_probar.py').read())`
  (copia la fuente al add-on instalado, lo recarga, rehace `<ORIGEN>R` desde cero y deja las hojas).
- Copia de trabajo dentro del mismo archivo: `cara = pasos.preparar_copia(obj)` (aplica la transformación,
  centra en X = 0 y guarda `rlb_origen_x`); `pasos.quitar(cara, tambien_cara=True)` borra todo lo creado.
- Por código (MCP de Blender, `execute_blender_code`, `result` debe ser un dict):

```python
import bpy
from bl_ext.user_default.rig_labial_bendy.nucleo import pasos
cara = bpy.data.objects['NOMBRE']
pasos.analizar(cara)                       # 1
pasos.detectar(cara, (0, y, z_boca))       # 2: punto cerca de la boca (o el cursor 3D)
pasos.todo(cara, ojos_modo='VALE')         # 3-9 (o paso a paso, abajo)
pasos.revisar(cara)                        # hojas PNG en <carpeta del .blend>/RLB_revision/<cara>/
```

Pasos sueltos: `arreglar`, `rig_labios(pinch_follow, chew)`, `pesos`, `boca_interior(ajustes)`,
`ojos_vale` / `ojos_existentes(piv_L, piv_R, raiz)`, `parpados(parametros)`, `crear_gestos`.
Si se repite `arreglar` (borra las shape keys) hay que repetir `pesos` y `parpados` después.

## Antes de empezar
- **Pregunta en popup** (AskUserQuestion) lo que no sepas: qué objeto es la cara, si los ojos son los de
  Vale o los del personaje.
- **NUNCA copias** (norma del usuario, repetida muchas veces; el disco está casi lleno): se trabaja en el
  .blend abierto y sobre el personaje. Nada de `save_as_mainfile(copy=True)`, .blend de respaldo, objetos
  duplicados ni `preparar_copia`, salvo que el usuario lo pida en ese momento. Para deshacer basta el
  respaldo de coordenadas que guarda el complemento dentro del archivo.
- Requisitos: la cara mira a −Y, Z arriba, centrada en X = 0, transformaciones aplicadas (`analizar` →
  `transform_ok`). Si no, dilo y pide permiso antes de aplicar transformaciones.
- Solo deforma la isla de la cara y las piezas de la boca; el resto del objeto queda quieto (cuerpo, pelo).
  Si el personaje ya tiene rig de cuerpo, el rig facial habrá que colgarlo del hueso de la cabeza (pregunta).

## Paso 2: marcadores (lo más importante)
Empties `RLB_<cara>_*` en la colección «RLB <cara> marcadores». Compruébalos con un render o
leyendo sus posiciones ANTES de construir:
- `comisura.L/R`: en el polo de la comisura (vértice de 6–8 aristas). Escala del rig = media anchura de la
  boca / 13,9 mm (Vale).
- `labio_sup` / `labio_inf`: en x = 0, en el **centro** de cada labio (no en el borde de contacto ni en el
  contorno). Calibrado en Vale: 58 % y 69 % del camino entre la línea de la boca y lo más saliente del labio.
- `mandibula` (pivote, delante de la oreja) y `menton`: sacados de Vale a escala; muévelos si la mandíbula
  abre rara.
- `ojo.L/R`: centro y radio (tamaño del empty) del globo. Si un globo pequeño deja ver el forro de la cara
  (manchas de piel sobre el ojo), agrándalo o muévelo hacia atrás. Sin hueco de ojo, `ojos_hueco` es False:
  avisa (los globos no se verán) y pregunta.
- Cejas: islas sueltas encima del ojo (`cejas` = vértice semilla o −1 → ceja «virtual» sobre la piel).
- Pestañas: materiales de la cara distintos de la piel junto al ojo (`pestanas_sup/inf`). Si salen vacías y
  el personaje tiene pestañas, dilo: no bajarán con el párpado.
Tras mover marcadores: `simetrizar` (copia L → R) y repetir desde el paso 4.

## Revisión (obligatoria) y ajustes
`pasos.revisar(cara)` hace 4 hojas (cara, boca, boca_34, ojo) × 10 poses. Ábrelas con Read y mira:

| Qué ves | Causa probable | Ajuste |
|---|---|---|
| Borde del labio en escalera / picos | malla cuantizada | `analizar` → `paso_cuantizacion`; `arreglar(cuant=True)` |
| Desgarro o pico en la comisura al abrir | solapa de triángulos (aristas de 3 caras) o comisura mal puesta | `arreglar(solapas=True)`; marcador `comisura` al polo |
| Sombras rotas en la boca | normales personalizadas | `arreglar(normales=True)` |
| Labios cruzados / el superior baja con la mandíbula | `labio_sup/inf` mal o `pinch_follow` | mover marcadores; `rig_labios(pinch_follow=0.05–0.2)` |
| Dientes asoman por el labio o no se ven | posición de las bandas | `boca_interior({'dientes_y': ..., 'dientes_z': ..., 'dientes_alto': ...})` (en m de Vale) |
| Lengua tapada o fuera | | `{'lengua_escala', 'lengua_y', 'lengua_z'}` |
| Pestañas separadas del párpado | materiales de pestañas no detectados | revisa `cfg['pestanas_sup/inf']` (`marco.cfg(cara)`), corrige y `parpados` |
| Piel sobre el ojo a medio cerrar | globo pequeño o lejos | marcador `ojo` (radio/posición) y `parpados` |
| Ojo no cierra del todo / cierra de más | | `parpados({'cierre_k': 0.1–0.2, 'solape': ...})` |
| Gestos flojos o exagerados | escala distinta de Vale | edita `gestos_extra.json` del add-on (mismo formato que `GESTOS`) y `crear_gestos` |

No des por buena una pose sin mirar de cerca la comisura (boca_34) y el ojo a medio cerrar. Dile al usuario
qué viste y qué no pudiste comprobar (p. ej. luz de render real: solo se usa Workbench).

## Inspección de partes e iris (0.3.0)
- `pasos.detectar` también inspecciona (`pasos.inspeccionar`). Pone nombre a las partes como grupos de
  vértices `RLB_<parte>`: piel, ojo_tripo.L/R, dientes_tripo, dientes, lengua, cavidad, ceja.L/R (sueltas o
  pegadas), mechon y otros. Deja una foto de colores en `RLB_revision/<cara>/partes.png`.
  - Mira esa foto primero, que cuesta una sola imagen.
  - Si los dientes, la lengua o la cavidad de Tripo son malos, se reemplazan por los del complemento.
- **Iris y pupila:** pide al usuario una imagen de referencia de frente. Mide en ella:
  - `iris` = ancho del iris / ancho del ojo, de lagrimal a rabillo (Vale ≈ 0,85);
  - `pupila` = ancho de la pupila / ancho del iris (≈ 0,70).

  Luego llama `pasos.ajustar_iris(cara, iris, pupila)`, o pásalos a `todo(..., iris=, pupila=)`. Se puede
  repetir, porque siempre parte de la forma original. El globo ya se ajusta solo al hueco de la malla.
- **Ceja pegada a la piel (obligatorio separarla):** `detectar` la señala en `resumen['ceja_pegada']` y «Arreglar malla» la separa SIEMPRE como isla propia (isla UV de ese lado que en espejo, respecto al centro de la cara, cae sobre la otra ceja; si no hay, espejo geométrico). Pegada, el párpado la arrastra al cerrar (Pegazo: 16 mm). Si `siguiente()` para diciendo que no pudo, sepárala a mano en el mismo objeto (Edit Mode, caras de la ceja, Mesh > Split > Selection [Y]) y repite desde detectar. Comprobar con `pasos.ceja_pegada(cara)` → None. En un personaje ya riggeado no se separa (borraría las shape keys): se avisa al usuario.
  Va **apagado** por defecto, porque en Malcon estropeó los párpados. Pendiente de resolver.
- La revisión ahora incluye `ojo_R`. Revisa los dos ojos: los lados pueden diferir (ceja suelta o pegada).

## Mallas de Tripo (Malcon): lo que viene pegado
- **Ojos:** Tripo trae medio globo ocular como parte de la piel. `detectar` lo busca en la malla
  (`ojos_esculpidos.buscar_en_malla`, por anillos de aristas, nunca con rayos). `todo` lo borra
  (`abrir_ojos`) y pone el ojo del complemento. El color del ojo se elige después.
- **Dientes:** entre los bordes de contacto de los labios hay una pared plana metida 2–4 mm (los dientes de
  Tripo) que sella la boca. `arreglar` la busca y la borra (`malla.quitar_dientes_tripo`). No hay que cortar
  la franja por la mitad: sale en escalones y la bolsa se arruga.
- La bolsa del fondo se cose al lazo de borde **más cercano a la boca**. El más largo puede ser otro
  agujero de la malla.
- El forro solo es lo que tapan los labios vistos de frente. Si no, en barbillas metidas como la de Malcon
  se borra piel del mentón.
- Si la cara sale escalada (`cara.scale` ≠ 1), todo se desplaza: el rig trabaja en coordenadas locales.

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
- Si el usuario pide trabajar sobre el personaje, no uses copias (ni `preparar_copia` ni el archivo).
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
- `view_layer.update()` antes de leer `matrix_world` de empties recién movidos.
- No restaurar la malla entera desde el respaldo: se perderían materiales asignados después (pestañas).
  El respaldo solo da las coordenadas (`<cara>_malla_respaldo_rlb`).
- Texturas: si el usuario dice que están mal puestas, no las toques salvo que lo pida.

## Párpados con huesos y cejas (0.4.0, Señor Gómez)
- `parpados` crea por defecto **huesos radiales** (`modo='huesos'`): 9 por párpado (`DEF-parp_sup/inf.<lado>.00N`), con
  la cabeza en el eje X del ojo. Giran sobre el globo y nunca lo cortan. **No** uses una cadena Bendy como la de la
  boca: se desliza por la superficie y atraviesa el ojo. Tienen un modificador propio, «Rig parpados»
  (Dual Quaternion), con máscara `RLB_parpados_zona`; el de la boca lleva la misma máscara invertida.
  `{'modo': 'keys'}` vuelve a las shape keys antiguas.
- **Pesos:** se calculan por distancia **geodésica** desde el borde del hueco del ojo (`geo_rigido`, `geo_estira`,
  `geo_inf_*`), se alisan sobre la malla (`alisar`) y se apagan antes de los rabillos (`rabillo`, `rabillo_ancho`).
  Con radios o ángulos fijos, el párpado grueso de Gómez hacía bultos, o bajaba toda la cuenca.
- **Cierre medido:** el ángulo de cierre de cada hueso es el giro con el que el borde superior, visto de frente,
  llega al inferior. Cada vértice gira con su peso. Así no salen la V ni el domo al cerrar.
- **Comprobar:** `pasos.comprobar_parpados(cara)`. Lanza rayos de frente con el ojo cerrado y `ojo_visible` debe dar
  unos 0 (Gómez: 0–4 de 5000). Para la hoja de párpados: `pasos.revisar_ojos(cara, 'L', vistas=['frente','34'])`. Cada
  hoja lleva un nombre nuevo, porque el visor guardaba la imagen vieja.
- **Controles:**
  - `parpado` (cerrar/abrir), `parpado_inf`;
  - `parpado_in` / `parpado_out`, para la forma (enojo, tristeza);
  - `mirada`: los globos la siguen y el párpado acompaña la mirada vertical.
- Hay valores intermedios en propiedades del rig (`rlb_cierre_L`…). Un driver no admite más de 256 caracteres.
- **Cejas sueltas (islas):** `_pegar_islas` hace que en cada key se muevan como la piel de debajo, sin despegarse.
  Bajan un poco al cerrar o entornar y suben al abrir (`ceja_cierre`, `ceja_abrir`, `ceja_entornar`).
- **Selección a mano** (`cfg['parpado_sel_L']`, el lado R se copia en espejo): existe, pero en Gómez quedó **peor**.
  Marcar los rabillos enteros hace picos. Úsala solo si el cálculo falla.
- **Biblioteca:** enojo/furia llevan `parpado_in`; triste/llorar/decepción, `parpado_out`. Hay dos gestos nuevos,
  `sospecha` y `cansado` (14 en total).
- **Trampas vistas:**
  - el usuario puede tocar Blender a la vez que yo (un Resize dejó la escala de la cara en 0,687; un Ctrl+Z
    deshizo todo lo hecho por código). Si algo sale absurdo, mira primero `cara.scale` y el estado del rig;
  - la acción del rig (`Gomez_Video_Habla`) sobrescribe la pose al cambiar de frame: quítala para medir.

## Contacto real de los párpados (0.4.1)
Una revisión externa de Gómez lo midió: **de frente la línea parecía cerrada, pero los bordes quedaban a 4–5 mm en
profundidad y se cruzaban**. Mira el contacto en 3D, no solo de frente.
- `parpados()` llama al final a `contacto.construir` (desactívalo con `{'contacto': False}`). Hace dos cosas:
  - crea la correctiva `parp_contacto.<lado>`, con driver `c*c*(3-2*c)` sobre `rlb_cierre_<lado>`. Lleva ambos bordes
    a una curva común: el punto medio, ajustado con una cúbica en X. El tejido de alrededor sigue por una solución
    armónica y se alisa un poco;
  - pasa el objetivo evaluado al espacio de la key con el **jacobiano medido por vértice** (tres perturbaciones de
    1 mm; vale con DQS). Nunca copies la diferencia evaluada a Basis directamente.
- Añade `+cc*(K-lf)*d` a los drivers del párpado superior, con `d` ajustado por hueso según su **X real** (en R
  los huesos van al revés). Así, con el inferior subido, los bordes siguen en contacto.
- **Medir:** `pasos.medir_contacto(cara)` da la separación 3D y el cruce en mm. En Gómez quedó en 0,08 mm al
  parpadear y 0,17–0,23 mm con el inferior al máximo; la prueba manual daba 0,19 y 0,30.
- **Rehacer solo esto:** `pasos.contacto_parpados(cara)`.
- **Trampa:** al rehacer una key con driver hay que borrar antes la curva del driver. Si no, la key nueva hereda la
  curva vieja marcada como inválida y no hace nada.
