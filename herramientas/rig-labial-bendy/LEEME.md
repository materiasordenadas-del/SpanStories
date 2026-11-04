# Rig Labial Bendy

Complemento de Blender que hace el rig de labios con Bendy Bones de Vale (el método del tutorial de YouTube, partes 1–3) en cualquier cara, paso a paso. Reutiliza todo lo que se hizo para Vale:

- **Boca:** dientes estilo anime, en banda continua, lengua y fondo oscuro, ajustados a la boca nueva.
- **Ojos:** globo, iris, pupila y brillos de Vale, desde `biblioteca/ojos_vale.blend`, o los ojos que ya tenga el personaje.
- **Cara:** párpados con las pestañas pegadas, que bajan en un solo movimiento, cejas y mejillas.
- **Gestos:** 12, de alegría, tristeza, rabia y sorpresa.

Instalación: Blender > Preferencias > Get Extensions > Install from Disk… > `rig_labial_bendy_0.4.1.zip`. El panel aparece en la vista 3D: barra lateral (N) > **Rig labial**.

**Novedades de la 0.3.0**, probadas en Malcon, de Tripo:
- **Inspeccionar partes:** pone nombre a lo que trae la malla con grupos `RLB_<parte>`: piel, medio globo de cada ojo, dientes, lengua, cavidad, cejas, mechón y otros. Deja una foto de colores en `RLB_revision/<cara>/partes.png`.
- **Ojos de Tripo:** el medio globo pegado a la piel se busca en la malla, se borra y se ponen los ojos del complemento.
- **Dientes de Tripo pegados a los labios:** son una pared que sella la boca. Se borran y la boca abre de verdad.
- **8b. Ajustar iris y pupila:** usa dos proporciones medidas en la imagen de referencia del personaje, iris / ancho del ojo y pupila / iris.
- La revisión incluye también el ojo derecho.

**Novedades de la 0.8.2 (eficiencia):**
- **`pasos.auto_iniciar(cara)`**: los 19 pasos + revisión en UNA llamada, en segundo plano (un paso por tick de Blender, sin «Request timed out»).
  El estado se escribe en `RLB_revision/<cara>/auto_estado.json` (un agente espera con un bucle de shell sin gastar) y se consulta con `pasos.auto_estado()`.
  Se para solo si hay que decidir algo, si falla un paso o al terminar.
- **Permisos** (`permisos='todos'`): `analizar` hornea rotación/escala, centra la cara en X y borra shape keys previas sin parar a preguntar.
- **Posición en la escena**: cada paso trae el personaje al origen con todo lo suyo (rig, ojos, piezas, marcadores), trabaja y lo devuelve (`posicion.py`, `pasos.centrar/devolver`);
  las hojas se renderizan con el resto de personajes ocultos. Ya no hace falta apartar a nadie.
- **Validación numérica** (`validar.py`): marcadores (pivote de mandíbula, ojos, mentón, labios sobre la piel) y visemas (A abre, MBP cierra, O/U redondean, E/I estiran). Solo se
  saca una foto si algo falla. Revisión final: UNA hoja `hoja_resumen.png` (10 renders) en vez de cinco hojas (50 renders).
- **Detección de la boca**: tolerancia de centrado 6 % (descartaba en silencio la cara de Ichigo), `buscar_boca` informa de los descartes y, si el pelo tapa los labios, parte de
  los ojos del personaje; el pivote de la mandíbula ignora patillas y mechones de delante (en Ichigo quedaba delante de la cara). `cfg['cabeza_zmin']` recorta una isla de cuerpo entero a la cabeza.

## Pasos

1. **Analizar malla.** Comprueba transformaciones, cuantización, aristas de 3 caras, normales personalizadas y shape keys. No cambia nada.
2. **Detectar marcadores.** Pon el cursor 3D en la boca (Shift + clic derecho) y pulsa el botón. Coloca empties `RLB_<cara>_*` en las comisuras, el centro de cada labio, la mandíbula, el mentón y los ojos (el tamaño del empty es el radio del globo). También busca las cejas y las pestañas. Si algo no cuadra, **mueve los marcadores** y pulsa *Simetrizar*.
3. **Arreglar malla.** Quita la cuantización de la boca, borra las solapas de las comisuras e iguala las normales de la boca. Siempre parte de las coordenadas guardadas en `<cara>_malla_respaldo_rlb`.
4. **Rig de labios.** Crea 115 huesos en `<cara>_Rig_Labios`.
5. **Pesos + labio dentro.**
6. **Interior de la boca.** Tiene ajustes de dientes y lengua.
7. **Ojos.** De Vale, del personaje o ninguno.
8. **Párpados, cejas y mejillas.**
9. **Gestos.** Crea un asset de pose por gesto, `<rig>_Gesto_*`, para la Pose Library, y la acción `<rig>_Gestos` con marcadores en el timeline.

*Construir 3 → 9* hace todos los pasos seguidos. *Revisión* deja hojas de renders de cerca en `RLB_revision/<cara>/`, junto al .blend.

Cada paso se puede repetir. Si repites el 3, que borra las shape keys, tienes que repetir también el 5 y el 8.

## Requisitos de la malla

- La cara mira a −Y, con Z hacia arriba, centrada en X = 0 y con las transformaciones aplicadas.
- Para usar los globos de ojo, los ojos tienen que tener hueco en la malla.
- Solo se deforman la isla de la cara y las piezas que están dentro de la boca.

## Por código

Así lo usa Claude con el skill `rig-labial-bendy` del plugin `rig-labial`:

```python
from bl_ext.user_default.rig_labial_bendy.nucleo import pasos
pasos.detectar(cara, (0, y, z)); pasos.todo(cara); pasos.revisar(cara)
```

## Gestos propios

Crea `gestos_extra.json` en la carpeta del complemento con el mismo formato que `GESTOS` de `nucleo/gestos.py`. Los valores van en metros a escala de Vale; el complemento los escala a cada personaje.

## Probado

Se probó en una copia de Vale partiendo de la malla original de Tripo (`Vale 2/prueba_complemento.blend`, objetos `ValeT` y `ValeU`). El resultado es equivalente al rig hecho a mano: huesos a 0,2 mm de mediana y los mismos grupos de pesos. Solo se ha revisado con renders Workbench. Todavía falta probarlo en otro personaje.

## Novedades de la 0.4.0 (Señor Gómez)

**Párpados con huesos radiales.** Son 9 por párpado y giran sobre el globo.
- Usan un modificador propio con Dual Quaternion, solo en la zona de los párpados.
- Los pesos se calculan por distancia geodésica desde el borde del ojo, se alisan y se apagan antes de los rabillos.
- El ángulo de cierre se mide en la malla.

**Controles nuevos.**
- `parpado_in` y `parpado_out` dan forma al párpado.
- Con `mirada`, los ojos y el párpado siguen la dirección de la mirada.

**Cejas.**
- Las cejas sueltas quedan pegadas a la piel en todas las keys.
- Acompañan al ojo: bajan un poco al parpadear.

**Comprobaciones.**
- Hoja de párpados: `pasos.revisar_ojos`.
- Comprobación de cierre por rayos: `pasos.comprobar_parpados`.

**Gestos.** Hay 14: los de siempre más `sospecha` y `cansado`. Enojo y tristeza ya usan la forma del párpado.

## 0.4.1: contacto real de los párpados

**Correctiva `parp_contacto`.** Al cerrar, los bordes de arriba y de abajo se juntan en 3D, no solo vistos de frente.
- Sale de una curva común entre los dos bordes.
- Se pasa al espacio de la key con el jacobiano medido de la deformación.

**Drivers del párpado superior.** Se ajustan solos para que los bordes sigan en contacto con el párpado inferior
subido.

**Medición.** `pasos.medir_contacto` da la separación y el cruce de los bordes en milímetros.
