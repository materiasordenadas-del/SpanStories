# Ojos en posición neutra y forma de la cara (0.8.0)

> Referencia del skill rig-labial-bendy. Código: `nucleo/forma.py` (lógica) y `nucleo/forma_ui.py` (panel
> «4. Ojos y forma de la cara», debajo de «3. Hacer que hable»). `FO` = `nucleo.forma`; en `pasos`: `ojos_poner`,
> `forma_preparar`, `forma_hoja`.

## Ojos: posición neutra (no es un gesto)
`FO.ojos_poner(cara, 'L'|'R', x, y, z, espejo=False)` mueve el ojo ENTERO (los hijos del pivote `<cara>_OjoPivote_L/R`:
globo, iris, pupila, córnea) en mm respecto a su sitio original. `x`: + = izquierda del personaje; `y`: + = adelante (−Y);
`z`: + = arriba. `espejo=True` mueve también el otro ojo, con el eje lateral invertido (simétrico). El desplazamiento se
guarda en `cara['rlb_ojos_pos']` y en el pivote (`rlb_loc0`, `rlb_off_basis`, `rlb_P3inv`: matriz mundo→base del pivote,
medida con el rig en reposo). Si algo mueve el pivote por fuera (p. ej. `ajustar_espacio_ojos`) se re-captura solo.
La mirada (Damped Track a `mirada.L/R`) y las expresiones se suman a esa posición. `FO.ojos_neutro(cara)` los devuelve.
**Los párpados no siguen al ojo** (son shape keys calculadas sobre el ojo de antes): `FO.ojos_poner` devuelve un aviso si el
desplazamiento pasa del 12 % del radio; entonces `FO.rehacer_parpados(cara)` (ruta de superficie UV) o el paso 9 del panel.

## Forma de la cara: mentón, mandíbula (L/R), orejas (L/R)
`FO.preparar(cara)` (idempotente, ~2 s): mide, crea los puntos rosados `RLB_<cara>_fm_menton` y `fm_oreja.L/R` (tamaño del
empty = alto de la zona; se pueden mover) y 36 shape keys `fm_<zona>[_L|_R]_<modo>` con driver a las propiedades de la
cara `rlb_f_<zona>_<modo>` («los dos lados», −100…100 %) y `…_L` / `…_R` (diferencia de cada lado, se suma). Las dos
mitades salen del mismo cálculo: simétricas por construcción (comprobado: error 0 en orejas). `FO.actualizar(cara)` rehace
las keys tras mover los puntos; `FO.reiniciar(cara, zona=None)` pone todo a 0; `FO.fijar(cara)` hornea la forma en la malla
(Basis y todas las keys) y quita keys/props, **hazlo antes de exportar al GLB** (si no, cada `fm_*` sale como morph).
Modos: mentón (forma, redondez, punta, largo, ancho, saliente), mandíbula (forma, redondez, ancho, largo), oreja (forma,
redondez, tamaño, alto, ancho, separación, punta, lóbulo, subir, adelante, inclinar). Signos: + = cuadrada/redonda/grande…
(ver `FO.ZONAS`). «Forma»: + cuadrada, − en V (un óvalo no se redondea con esto); «Redondez»: suavizado por vecinos en el
plano de la zona con compensación de tamaño (parte de cualquier forma).

**Piel por UV, nunca por proximidad:** islas de `rlb_parpados_uv_seeds` (o `cara['rlb_forma_semillas']`) + las vecinas que
comparten ≥ 8 vértices (en Ichigo: cara + orejas + bajo la mandíbula). El pelo y la ropa no se mueven. Se guarda como
atributo `RLB_forma_piel`; para recalcular: `FO.preparar(cara, forzar=True)` (vuelve a poner también los puntos).
Sin UV cae a la parte de la malla conectada por aristas a los ojos (puede incluir pelo soldado).

**Mira siempre la hoja:** `pasos.forma_hoja(cara, 'oreja', 'forma')` → PNG (filas = vistas, columnas = −100/0/+100). Ábrela
con Read. Comprobar: orejas bien encontradas (si no, mover el punto rosado y `FO.actualizar`), mentón/mandíbula sin
grietas en el cuello ni labios arrastrados. Las shape keys `fm_*` no se registran en `facs_keys` a propósito (no son
canales de expresión); el paso F_terminar no las silencia (`pipeline.py`). `arreglar` y otros pasos que limpian keys las
borran: `FO.preparada(cara)` lo detecta y basta con `FO.preparar(cara)` otra vez.

Trampas: las zonas usan la cara mirando −Y y las coordenadas locales de la malla; la mandíbula depende de la boca
(marcadores comisura.L/R si existen; si no, 40 % de mentón→ojos); `aj` (semiancho de mandíbula) sale del percentil 92 de la piel.

## 0.8.1: orejas que se modelan por partes
- Fallo de 0.8.0: cada control de oreja movía toda la oreja más la piel de alrededor (la caída llegaba a 1,9 veces la elipse, unos 390 vértices), así que con un punto se movía todo. Además, en Tronchatoro (piel = grupo, sin isla UV) la elipse quedaba 1 cm alta y deformaba el pelo.
- Ahora la oreja se busca como el bulto que sobresale de la cabeza (`_exceso`, `_buscar_oreja_saliente`) y se rellena la concha (`oreja_saliente`). Los controles globales se multiplican por esa máscara (`_zona_suave`) y la elipse corta en 1,3.
- **Modelar a mano** (casilla en Orejas, activa por defecto): 8 rombos azules en el borde de cada oreja. Cada uno tiene 3 keys `fm_oreja_<L|R>_p<h><x|y|z>` (x = afuera, y = atrás, z = arriba). Las props son `rlb_f_oreja_p<h><eje>[_L|_R]`, con un tope de ±200 %, y 100 % equivale a 0,5 veces el semialto. El peso usa la distancia geodésica dentro de la oreja: el vecino más cercano se mueve un cuarto. El arrastre sigue al ratón en el plano de la vista. Por código: `FO.puntos_locales`, `FO.ejes_mundo_local` y `FO.reiniciar_locales`.
- Un personaje preparado con 0.8.0 necesita «Actualizar zonas» para crear los puntos.
- El preset «Orejas redondas (caricatura)» es redondo 100, tamaño 80, ancho 50, separación 80 y lóbulo 15.
- Probado en Tronchatoro, Carlitos e Ichigo, sin guardar.
