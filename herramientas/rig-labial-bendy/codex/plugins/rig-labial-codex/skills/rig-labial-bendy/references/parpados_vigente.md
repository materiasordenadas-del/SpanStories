# Párpados y delineado: lo vigente (0.6.6 y 0.6.7)

> Referencia del skill rig-labial-bendy. Se lee solo cuando hace falta. `FP` = `nucleo.facs.pipeline`;
> hay dos módulos `ojos`: `nucleo/ojos.py` (rig de huesos, lente, abertura visible) y `nucleo/facs/ojos.py` (FACS, contacto).

Lo vigente es la 0.6.7 (al final). Lo de antes explica por qué se descartaron otros métodos: no volver a ellos.

Este archivo es lo VIGENTE. La historia de lo descartado (0.4.0 a 0.6.5) está en `parpados_historial.md`.

## Solo párpados y delineado (0.6.6)
`FP.parpados(cara, param=None, delinear=True, estilo='anime')` (botón «Solo párpados + delineado», `rlb.solo_parpados`):
solo los párpados que giran + el delineado; sin boca, cejas, controles ni el resto del rig. Crea las keys ARKit
`eyeBlink/eyeBlink_mid/eyeSquint/eyeWide/eyeLookDown/eyeLookUp/lidAngry/lidSad` por lado, las correctivas `eyeBlink×X`,
cejas pegadas a la piel y lente si hay hueco. Devuelve `r['medida']`.
- Secuencia mínima en un personaje Tripo (cara centrada en X=0, transformación aplicada):
  `pasos.detectar(cara, punto_boca)` → `malla.respaldo(cara)` → `pasos.abrir_ojos` → `pasos.quitar_pestanas` →
  `pasos.ojos_lian` → `pasos.cuenca` y `pasos.oclusion` (no hacen nada si no hay hueco) → `FP.parpados(cara)`.
- **La cara DEBE estar en X=0**: `deteccion.boca` lanza rayos en x = 0,0005·S. Martín (en -0,91, -5,31, 0,03) falló con
  «No encuentro la línea de la boca»: se construye en el origen y luego se devuelve a su sitio.
- **`abrir_ojos` iguala los globos**: si la esfera de un lado sale >8 % mayor que la del otro, se limita con
  `deteccion.radio_comun` (la menor no se toca). Motivo: en Martín el bulto R ajustaba 17 mm frente a 13,4 mm del L;
  con ese radio borraba 8 mm más allá de la abertura, junto al borde del párpado, y quedaba un ojo roto con esquirlas
  que luego se tapaba con cuenca y lente. Con el arreglo ambos ojos salen limpios e idénticos y, al quedar el hueco
  cerrado, ya no necesitan cuenca ni lente.
- **Medir con `FP.medir_parpados(cara)`**: por key (y el parpadeo con cada combinación) da `dentro_globo` (vértices
  a >0,2 mm dentro), `invertidos` (triángulos) y, con los ojos cerrados, `ojo_visible_%` (rayos de frente que llegan
  al globo sin tocar piel). Martín (antes del rediseño del giro): 0 dentro en las 22 poses, 0–4 invertidos (antes ~620)
  y <0,75 % de ojo visible cerrado.

### Cierre con contacto real (0.6.6)
El giro (`parpados_giro.py`) da solo el movimiento SUAVE; el cierre exacto lo da un contacto aparte.
- **Giro**: cuánto rota cada vértice (falloff) va por distancia GEODÉSICA al borde. Solo con el ángulo de elevación
  fallaba en Martín: la piel de una ceja que sobresale (1,7 r delante del centro) tenía «poca altura» y rotaba entera
  (pico de 22 mm); además se limita por el ángulo cerca de la ceja. Reparto superior/inferior por altura u dentro de cada
  columna. El ángulo se alisa sobre la malla (`alisar`=12 pasadas) con bordes y lo que no se mueve fijos: sin esto la
  rejilla gruesa de Tripo mostraba facetas y una muesca.
- **Abandonado**: forzar el cierre exacto con la rotación propia de cada vértice del zigzag plegaba la placa (muesca
  en el centro). No volver a intentarlo.
- **Contacto** (receta de Codex, Gómez): ambos bordes van a una curva común (punto medio en Y/Z, cúbica en X) y el tejido
  sigue con un solve armónico (`facs/ojos.contacto_parpadeo` sobre eyeBlink; `facs/ojos.contacto_pos` sobre posiciones
  cualesquiera). También en las correctivas blink×X (squint, look down, angry, sad): objetivo de giro + el mismo contacto.
- **Medir y corregir en el borde VISIBLE de frente** (`nucleo/ojos.abertura_visible`, como Gómez/Lian), no en el geométrico
  (el más cercano al eje): en el reborde grueso de Tripo el geométrico queda más adentro y se medía el contacto donde no
  se ve.
- **Cejas sueltas (islas Tripo) NO siguen las keys de párpado** (`pegar_islas` solo con keys de ceja/mejilla/nariz/boca).
  Lo más cercano era el reborde del párpado y la ceja bajaba 22 mm al parpadear («V»). La piel bajo la ceja no rota:
  girarla hacia abajo la empuja ADELANTE y atravesaba la ceja.
- **Bolsillo interior** (rota entero con su párpado) = solo lo que el globo tapa de frente (dentro de su silueta y
  detrás de su cara frontal). Antes «cerca de la esfera y detrás» arrastraba piel de encima del ojo.
- `medir_parpados` da por pose cerrada `sep3d_max/media` y `cruce_max` (bordes visibles interpolados en la misma X,
  128 muestras, 1 mm excluido en cada extremo; misma métrica que Gómez).
- Martín (eyeBlink + 4 combinaciones, ambos ojos): sep3d media 0,10–0,14 mm, cruce ≤0,13 mm, 0 vértices dentro del globo,
  9–15 triángulos invertidos, ojo visible ≤0,74 %. sep3d máx 1,3 mm solo en la comisura externa de L (último mm).
- Pendiente: pliegue pequeño junto al lagrimal y leve muesca en el centro del párpado L; cerrado, la pintura oscura del
  delineado en la cara interior del párpado se lee como línea negra gruesa (la geometría sin textura cierra como arruga fina).

## Párpados 0.6.7: parpadeo que se resuelve (Martín, 2026-10-20)
Sustituye al cierre por giro/contacto de la 0.6.6 SOLO para `eyeBlink` y `eyeBlink_mid` (`nucleo/facs/parpados_arap.py`,
`cierre='arap'` por defecto; el giro de `parpados_giro.py` sigue dando entornar, abrir, mirar, enfado y tristeza).
El giro decidía el ángulo de cada vértice por distancias y vecinos de la misma piel recibían giros distintos: arrugas,
picos en V y banda negra. Ahora el parpadeo se calcula:
1. **Borde visible de frente en toda la abertura** (`parpados_arap.bordes_finos`), unido en cadena por la malla. El
   detector viejo `_columnas_abertura` (`nucleo/ojos.py`) solo miraba de −0,012·E a +0,0215·E y en Martín se quedaba a
   3 mm del lagrimal: al cerrar quedaba un agujero.
2. **El reborde** (borde + labio + cara de abajo, hasta `d_rig` = 0,15 del borde) gira ENTERO sobre el eje X del ojo hasta
   una curva común de cierre (superior 75 %, inferior 25 %): se juntan las crestas de los labios, no los bordes de
   dentro, y la cara de abajo queda escondida.
3. **La piel de encima** (hasta `w_sup`/`w_inf` × r del borde) se estira por ARAP lo más rígida posible (no se comprime ni
   se arruga), con el ojo como colisión: el globo y un casquete (`casquete`=58°) que cubre la córnea mire a donde mire.
4. Taubin suave encima (`alisar`=25), sin encoger.
5. **Normales propias de Tripo** (`parpados_arap.normales_auto`): no siguen a las shape keys y eran gran parte de las
   «arrugas» del párpado cerrado. En la zona que se mueve se cambian por las de la malla; fuera, igual.
6. **Delineado** (`parpados_arap.delineado_tope`): medía su alto de frente y, al cerrar, la cara de abajo del reborde giraba
   hacia delante (mancha negra de 4 mm). Por encima del borde, la altura de la UV es como mínimo la distancia por la piel
   al borde (alisada): en reposo casi igual, cerrado una línea.
Parámetros en `PARAM` de `parpados_arap.py`; para volver al método de la 0.6.6: `param={'cierre': 'giro'}` en `FP.ojos` /
`FP.parpados`. Medir siempre con `FP.medir_parpados(cara)`.


## 0.7.2: pliegues del cierre ARAP, causas aisladas (Tronchatoro, 2026-10-22)
Todo está en `facs/parpados_arap.py` (los pasos de contacto de `F_terminar` solo retocan ≤ 1,2 mm dentro de la región del ARAP).
Se midió con ablaciones sobre `Cierre.resolver` (triángulos de reposo no degenerados y de frente; `FP.medir_parpados` cuenta todos).
1. **Cresta inferior extrapolada** (`_crestas`/`_curvas`): L tenía muestras de cresta solo en x = −10,6…2,3 mm de un borde de −10,7…12,6;
   el polinomio de grado 4 daba 69°, 299° y 767° en el rabillo y los objetivos del reborde saltaban hasta 90°.
   Arreglo: se guarda el rango con muestras y fuera de él se sigue la forma del borde (`_cresta`). L: 446 → 96 invertidos visibles.
2. **Recorte radial duro contra el globo** en `objetivos`: reordenaba vértices vecinos del reborde (60–90 % de los invertidos con los
   tres vértices fijos). Arreglo: empuje suavizado (`PARAM['empuje_suave']`=4, `_empuje`; 0 = recorte antiguo). 96/128 → 47/66.
3. **Banda de piel demasiado estrecha** (`w_sup`=0,55): la piel libre de encima se ESTIRABA (área ×1,88 de mediana, p95 ×4), no se
   comprimía; es lo que arrugaba. `w_sup`=1,2 → ×1,2 de mediana. Visualmente desaparecen los pliegues verticales.
- No influyen: `comprime`, `d_rig`, `cierre`, `iters`, `alisar`, `cresta`. Pendiente aparte: hueco gris rectangular en el párpado
  inferior R al 75–100 %, y delineado irregular en el rabillo en reposo.
- Causa raíz de 1 (no tocada): la detección de la cresta inferior en L solo muestrea la mitad de la abertura (`_crestas`, criterio `fuera`).


## 0.7.2 (2.ª tanda, vídeo del habla en Tronchatoro L): anillos que se mueven y anillos que no
Síntoma: al reproducir el habla, los anillos de aristas pegados a la abertura del párpado se quedan quietos y los de encima se mueven
y se arrugan. No era el parpadeo: eran las cejas (`browInnerUp/OuterUp/Down` en `facs/ojos.py`, clase `Arriba._ceja`).
- **Causa:** el peso de la ceja se apagaba con `ss(0,05 r, 0,45 r, dist_borde)`: el borde del párpado queda a 0,01–0,2 mm y a 0,4 r
  de él la piel ya se movía hasta 6 mm; aristas vecinas con desplazamientos ×2,5–3 su longitud (96–136 aristas bruscas por tecla).
  Arreglo: `PARAM['ceja_fade']` 0,45 → 1,2 (3–14 aristas bruscas); `ceja_suavizar` = 4 pasadas (parámetro).
- **Rabillos:** `Cierre.objetivos` decidía «párpado de arriba/abajo» con un corte duro (`dU ≤ dL`); vértices vecinos recibían objetivos de
  curvas distintas. Ahora `PARAM['mezcla_lados']`=0,5 mezcla ambos con transición suave (invertidos del reborde L 45→14, R 55→27).
- **Párpado inferior:** `w_inf` 0,45 → 0,8: la piel de debajo se movía 2 mm y a 0,45 r valía 0 (escalón = el «hueco gris rectangular»
  del ojo derecho al 75–100 %; desapareció en las renders).
- **Cresta inferior L** (`_crestas`): sin vértices «hacia fuera» en la mitad externa de la abertura; ahora esos tramos se rellenan con el
  extremo del reborde. Muestras 17 → 27, rango completo.
- Resultado en Tronchatoro (`FP.medir_parpados`): invertidos al 100 % L 176→115, R 232→84; cruce de bordes ≤ 0,63 mm.
- Sin tocar: grosor del delineado (estilos de las referencias del usuario; `comprime` lo afina al cerrar), escalones del borde del
  delineado (dependen de las filas de caras), bultos de la malla de Tripo en reposo, esquirlas rojas de la boca en O/U.


## 0.8.8–0.8.9: sin densificar por defecto + retoque de párpados a mano por expresión
- `cfg['densificar']` vale **'nunca'** por defecto: los párpados se dejan como están (la densificación del paso parpados/F_ojos
  rompía la piel en enojo/guiño/sorpresa en KAKA 2). `'auto'`/`'siempre'` siguen existiendo si se piden.
- Cuando UNA expresión sale mal, el usuario mueve a mano cada vértice del párpado (`facs/retoque_parpados.py`, botones en
  «2. Editar expresiones» → Ojos → «Párpados de esta expresión»): `preparar(cara, expr)` entra en modo edición con la cara ya en
  esa expresión; `guardar(cara, expr)` guarda SOLO lo movido de la zona de los párpados (< 2,4 r de cada ojo) en la shape key
  `pp_<expr>` (canal `v_pp_<expr>`, driver como los ajustes finos, 100 % en esa expresión). No toca el Basis ni otras expresiones.
  `quitar(cara, expr)` lo borra. El editor solo muestra el canal `pp_` de la expresión abierta.
- Delineado: SIEMPRE manual (lo marca el usuario). Si `pasos.version()` avisa «código viejo cargado», Blender corre código antiguo.


## 0.8.45: borde real, labios por silueta e interior de la boca (Pegazo, 2026-10-30)
- **Borde del párpado:** `facs/anillo.py` busca el lazo cerrado de la malla que pasa por las semillas de `abertura_visible` (hay que llamarla con `posicion.en_origen`; desplazado devuelve 0). Solo se usa si los dos ojos dan lazos en pareja (≤ 48 vértices, mismo ancho); si no, `cara['facs_anillo_no']` y sigue el borde medido en la esfera (Ichigo, Kakashi, Lamine).
- **Con lazo:** `parpados_arap.Cierre` usa curvas por interpolación del propio borde, sin crestas; los rabillos cierran aunque queden dentro de la esfera del globo. Antes un borde falso daba abertura 0 y `rigidizar` movía el ojo 45 mm con cualquier forma de boca.
- **Labios:** `geometria.bordes_silueta` da los dos bordes como aristas frente/espalda y `cara['facs_bordes_labios']` los fija. Si la boca no tiene abertura limpia devuelve None y se usa el cierre anterior.
- **Interior:** `piel_exterior` choca con toda la cabeza; con solo el radio, los rayos entraban por la coronilla y la bolsa se arrugaba. `boca_tom.a_contacto` deja los incisivos a −0,08 hw (sup) y −0,22 hw (inf) del contacto real.
- **Revisar la boca** siempre en Anatómico y color «Texture»: en «Material» los dientes parecen una banda lisa. El objeto `_Oclusion_*` sale opaco en Workbench: quítalo al mirar el cierre.
- Un corte de sección con malla y piezas enseña en un momento lo que los números no dicen (bolsa arrugada, paredes de Tripo dentro de la boca).
