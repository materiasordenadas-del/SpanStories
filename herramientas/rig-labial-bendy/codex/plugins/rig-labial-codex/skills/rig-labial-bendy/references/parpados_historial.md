# Párpados y delineado: historial (0.4.0 a 0.6.5)

> Referencia del skill rig-labial-bendy. Se lee solo cuando hace falta. `FP` = `nucleo.facs.pipeline`;
> hay dos módulos `ojos`: `nucleo/ojos.py` (rig de huesos, lente, abertura visible) y `nucleo/facs/ojos.py` (FACS, contacto).

Lo vigente es la 0.6.7 (al final). Lo de antes explica por qué se descartaron otros métodos: no volver a ellos.

Este archivo es el HISTORIAL: explica por qué se descartaron otros métodos; no volver a ellos. Lo vigente (0.6.6 y 0.6.7) está en `parpados_vigente.md`.

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

## Cuenca y lente de oclusión (0.5.0, Camilo)
Copiado de Business girl (CC4) y adaptado a caricatura. Va dentro de `todo` (`cuenca_=True, oclusion_=True`); a mano:
`pasos.cuenca(cara)` (8c) y `pasos.oclusion(cara)` (8d). `pasos.parpados` las quita y las rehace solas.
- **Cuenca** (`malla.cuenca`): si el ojo es un agujero, extruye el borde: margen de párpado de 1–1,5 mm apoyado
  sobre la lente y bolsa oscura y lisa a r − 0,8·E mm hasta detrás del centro. Vértices nuevos al final, marcados
  con `rlb_cuenca`. El borde que toca el globo sube como mucho 0,6 mm (`rlb_cuenca_subida`) y `quitar_cuenca` lo
  deshace. Si el borde se va por una rendija (Camilo R), solo se usa el tramo junto al ojo.
- **Lente** (`nucleo/ojos.oclusion`): 7×13 anillos en ángulo sobre la superficie real del ojo (rayos, sirve para el
  elipsoide y la córnea), con pesos y keys de la piel de delante (incluidas las CV_ de Codex). Textura de banda
  plana empaquetada, BLENDED, sin sombras; es invisible en Solid. No se proyecta de frente: en el rabillo se plegaba.
- **Comprobar:** `pasos.corte_ojo(cara, 'L')` (corte por x = centro), `pasos.medir_oclusion(cara)` y
  `comprobar_parpados`. En Camilo, la rendija pasó de 4–5 a 0–1. Con la cuenca pintada de verde solo asoma una
  línea en el rabillo y en el borde inferior subido, que con el color real queda como línea de contacto oscura.

## Delineado por UV, ojos de Lian y ojos de Tripo (0.6.4, Martín)
- **Pestañas = delineado pintado en la piel** (`nucleo/facs/delineado_uv.py`, paso F4 por defecto
  `FP.delineado(cara, estilo='anime'|'marcado'|'fino')`, por defecto 'anime': negra, gruesa hacia fuera, sin puntas ni colitas: acaba romo en el rabillo, siguiendo el borde): la franja de piel del borde superior recibe material y UV
  propios (u a lo largo del ojo, v = altura sobre el borde **visto de frente**) y una textura 1024×256 (piel + línea).
  Sigue sola al parpadeo/huesos/keys; en GLB es `baseColorTexture` con los morphs. Grosor calibrado en la referencia
  (línea ≈ 13 % del alto de la abertura). `delineado_uv.quitar(cara)` deja UV y materiales como estaban (copia en
  `cara['facs_delineado_uv']`, no en atributos: un FLOAT2 de esquina sale como TEXCOORD_1). La cinta vieja: `modo='cinta'`.
  Comprobar con el borde en ROJO (`DU.crear(..., color=(0.8,0,0))`): tiene que cubrir todo el filo visible.
- En Solid el delineado no se ve (color de material): vista en Color «Texture».
- **Ojos de Lian por defecto** (`ojos_modo='LIAN'`, `pasos.ojos_lian(cara, color)`: globo, iris por color de vértice,
  pupila, córnea; colores castano/turquesa/verde/gris). Cuelgan de los mismos pivotes que los de Vale.
- **Ojos de Tripo**: `detectar` acepta globos pequeños (0,25× Vale), centro por lado y radio común (`radio_comun`, máx.
  +8 % sobre el menor); `abrir` borra también islas sueltas pegadas al globo por delante (esquirla sobre el iris).
- FACS sin regiones UV de Codex: atributos `RLB_*` opcionales (`leer_atr`), ceja virtual; `terminar` revalida drivers.
- **Pestañas de Tripo** (`nucleo/pestanas_tripo.py`, paso 3c dentro de `todo` y otra vez al empezar F4, `pasos.quitar_pestanas` /
  `restaurar_pestanas`): islas pequeñas, finas, en arco pegadas al globo (0,8–1,5 r) → se borran sus caras (vértices
  intactos, caras guardadas en cfg). Descarta cejas («lejos del globo») y el globo («es el globo»). Probado en Camilo:
  2 arcos de 130 v. **No se reutilizan pestañas de nadie** (las de Camilo y Lian dieron muchos problemas): siempre la
  máscara pintada del delineado.
- Bajo el filo del párpado la máscara pinta también la cara interior (tira de 0,12 r, apagada en los lagrimales) y
  usa el margen de la cuenca como filo: sin eso quedaba una tira gris que al cerrar parecía una solapa suelta.

## Párpados que no se rompen (0.6.5, Martín)
F3 (`FP.ojos(cara)`, `modo='giro'` por defecto; `modo='rig'` = horneado viejo) con `nucleo/facs/parpados_giro.py`:
- Cada vértice de párpado y cuenca GIRA sobre el eje del ojo con un ángulo propio. Un giro no cambia la distancia
  al centro, así que no hay vértices dentro del globo. La cuenca gira entera con su párpado (si no, cuchilla gris).
- Cejas, mejilla, nariz y boca solo giran en la zona de los párpados (`rigidizar`); correctivas
  `eyeBlink_<X>_<lado>` (X = entornar, mirar abajo, enfado, tristeza, mejilla, sonrisa). Cejas sueltas de Tripo
  (islas fuera de la zona) pegadas a la piel (`pegar_islas`).
- La lente de oclusión copia las keys FACS (`nucleo/ojos.oclusion_seguir_keys`) y apaga su armature; `apagar_rig_viejo`
  silencia las keys del rig viejo (ceja_*, parp_contacto…: con su acción puesta se sumaban).
- `Ojo._margen`: con cuenca, el borde es la piel cosida a ella (antes cogía la bolsa a 70° y la abertura salía doble).
- Delineado: la tira interior baja a 0,05 r (con 0,12 r el ojo cerrado parecía abierto).
- Medir: triángulos invertidos y vértices dentro del globo por expresión; rayos de frente con el ojo cerrado.
- Queda: rabillo exterior del ojo R de Martín ya irregular en reposo (corte de la malla); ahí el ojo cerrado
  enseña el delineado con borde dentado.

