# Cara Viva 0.2

Complemento de Blender (5.2) para **ponerle rig facial a personajes nuevos** y reutilizar
las expresiones entre personajes.

Instalar: `Edición > Preferencias > Extensiones > Instalar desde disco…` y elegir
`cara_viva_0.2.0.zip`. El panel aparece en la vista 3D, barra lateral (N), pestaña **Cara Viva**.

## Qué hace

1. **Rig estándar de 29 huesos** (mandíbula, lengua, ojos, párpados, cejas ×3, boca ×8,
   mejillas, nariz) colocado con 9 puntos de referencia que marcas con el cursor 3D.
   Los pesos se calculan por campos de influencia y por la **topología real de la boca**
   (no se transfieren de otro personaje, que es donde estaban las trampas del rig de Lian).
2. **48 canales con nombres ARKit** (`mouthSmileLeft`, `browInnerUp`…), medidos en
   fracciones de la distancia entre ojos (IOD) y grados. Por eso una expresión vale igual
   en cualquier personaje construido con el estándar.
3. **Biblioteca portátil** en JSON: guardas una mezcla de canales o una pose de huesos tal cual
   y la aplicas en otro personaje. Exportar/importar desde el panel. Solo se guarda lo que
   cambias respecto al estándar. Ajuste «solo este personaje» por canal si su cara es más rígida.
4. **Habla en español**: texto → visemas (A E I O U M F S CH C) con coarticulación; si das un
   WAV, los silencios del audio dicen dónde cerrar la boca. También importa JSON de Rhubarb.
5. **Vida de fondo** determinista: parpadeos (con dobles y en pausas), mirada con sacadas y
   «a cámara», cabeza que respira, cejas y cabeceo en las sílabas acentuadas.
6. **Web**: hornea cada canal a un shape key (morph target) con su nombre, para three.js/GLB.
   La diferencia respecto a los huesos medida en la prueba fue 0 mm.
7. **Hoja de contacto**: todas las expresiones en una imagen, para revisar de un vistazo.

## Flujo

0. Pestaña 0 **Analizar malla** (tras marcar los puntos): mide boca, ojos, nariz, frente, mejillas y mentón
   en fracciones de IOD (longitud de arista, polos, triángulos estirados, abertura de la boca en 1–2 lazos
   o en piezas sueltas, párpados). Da semáforo por zona y qué hacer; marca el grupo de vértices `cv_revisar`
   (1.0 rojo, 0.5 amarillo). Solo corrige con confirmación lo seguro (caras de área cero, vértices sueltos).
   No retopologiza: avisa de dónde hace falta.
1. Pestaña 1: elige la malla de la cabeza (y ojos/dientes/lengua si son objetos aparte),
   marca los puntos (el panel avanza solo al siguiente) y pulsa **Construir rig facial**.
2. Pestaña 2: prueba expresiones, mezcla canales, guarda las tuyas.
3. Pestaña 3: escribe el texto, elige el WAV y pulsa **Animar habla**.
4. Pestaña 4: **Hornear shape keys** para la web y **Hoja de contacto** para revisar.

Requisitos del personaje: mira hacia −Y, su izquierda es +X, cabeza con la boca **abierta
como abertura real** (labios no soldados) y dientes/lengua como piezas sueltas. Si dientes y
encías vienen fusionados en la malla, el constructor detecta las piezas del interior de la
boca y las mueve rígidas (arriba con la cabeza, abajo con la mandíbula).

## Pruebas (hechas con la chica, no con Lian)

* `python -I pruebas/test_nucleo.py`: 17 pruebas del núcleo en Python puro.
* En Blender: construcción en 1 s, habla de 4,6 s con 2 794 claves, horneado de 39 shape keys
  en 1,7 s, paneles sin errores, la misma biblioteca aplicada a otra cabeza.

## Límites conocidos

* Boca de la chica: en gestos extremos (miedo, gruñido) el labio fino, hecho de varias
  piezas sueltas, se arruga. Una boca con labios continuos y piezas interiores separadas
  lo evita. Las arrugas de frente y nariz de tus vídeos de referencia no se pueden hacer con
  huesos: ver propuestas.
* Sin globos oculares no se ve la mirada; los canales `eyeLook*` y `tongueOut` salen «sin
  efecto» al hornear si faltan ojos o lengua.
* Al escribir solo en shape keys, el movimiento de cabeza no se escribe (es de un hueso).
* El audio debe ser WAV PCM. El alineado usa los silencios; con ruido de fondo fuerte
  conviene limpiar primero o usar el JSON de Rhubarb.
* Los números de amplitud (`ESCALA_DESPLAZAMIENTO`, `FACTOR_FAMILIA`, en `nucleo/estandar.py`)
  están calibrados con la chica; cámbialos ahí y se propaga a todos los personajes.

## Qué se tomó del complemento original (Tripo Face Rig, MIT) y qué no

Se tomaron las ideas, no el código: nombres ARKit-52 como estándar de canales, que un rig
facial se mide desde puntos de referencia y no desde porcentajes de caja, los campos de
influencia independientes de la topología, Rhubarb como entrada opcional y la hoja de
contacto para revisión. No se usó: Unity, el asistente por prompt, las plantillas canónicas
ICT-FaceKit ni sus visemas de VRChat (ingleses).

## Propuestas para mejorar eficiencia y resultados

1. **Arrugas por canal**: un mapa de normales (frente, entrecejo, nariz, pliegue nasolabial)
   mezclado por el valor de `browDown`, `noseSneer` y `mouthSmile`. Es lo que más separa tus
   referencias de un rig de huesos.
2. **Dientes y lengua sueltos desde Tripo** (o separarlos con un botón): evita casi todo el
   trabajo del interior de la boca.
3. **Correctivos de comisura**: un shape key corrector al final de la pila para la sonrisa
   y el beso, dirigido por los mismos canales.
4. **Audio con timbre**: detectar sílabas con la envolvente para anclar mejor cada vocal
   (hoy se reparte por pesos entre silencios).
5. **Biblioteca por estilo**: guardar una «biblioteca realista» y otra «dibujos» con los mismos
   nombres y cambiar de una a otra por personaje.
6. **Ajuste automático de amplitudes** comparando la hoja de contacto con fotogramas de
   referencia (los vídeos de gestos que ya tienes).
7. **Rigify**: emparentar `cv_cabeza` al hueso `head` del cuerpo con un botón, y ya vale
   para personajes completos.
