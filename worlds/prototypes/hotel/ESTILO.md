# Guía de estilo SpanStories (regla maestra)

> Contrato visual base de todo proyecto SpanStories 3D/2.5D. Viene con el plugin;
> al crear un proyecto se copia a su raíz como `ESTILO.md`. Lo específico del
> proyecto va en la sección 4, sin contradecir las secciones 1–3.

## 1. Regla maestra: la proximidad define la técnica

**Lo que está cerca y es principal a la escena va en 3D**: geometría real o
**ilusión de 3D** (planos con profundidad por capas, normal map, toon shading y
sombras suaves). El detalle pintado puede reforzar el volumen.
**Lo que está más lejos va en 2D plano**, sin intentar la ilusión de 3D.

| Distancia / rol        | Técnica                                                        |
| ---------------------- | -------------------------------------------------------------- |
| Cerca + principal      | 3D simple o 2.5D con parallax, normales y luz toon suave       |
| Lejos / secundario     | 2D plano (billboard simple, una sola cara, sin capas)          |
| Fondo / horizonte      | 2D plano pintado (backdrop, cielo, nubes, siluetas)            |

**Ejemplos**
- La fachada de entrada (cerca, protagonista) → arquitectura 3D.
- Un letrero lejano o un árbol lejano → 2D plano, una cara.
- Los arbustos de las jardineras usan planos 2D con albedo, normal map y luz
  toon. La jardinera oculta la base de los planos.

## 2. Estilo visual

- **2.5D cartoon limpio**: geometría simple, materiales mate, colores planos,
  shading suave, sombras blandas, outlines discretos.
- Cámara casi ortográfica / perspectiva muy suave. Nada de realismo
  fotográfico, bloom ni efectos cinematográficos.
- Todo elemento 2D/2.5D vertical que se apoya en una superficie (árbol,
  palmera, planta, personaje) usa **pivot bottom-center (0.5, 0)**.
  La base visible, sin padding transparente inferior, coincide con el suelo
  o la superficie de apoyo. Comprobar el alpha del PNG/WebP y recortar sus UV.
- Dentro de jardineras, situar el plano ligeramente hundido y detrás del borde
  frontal: la geometría de la jardinera debe tapar la base naturalmente.
- La vegetación y los personajes 2D importantes usan **albedo de iluminación
  neutra + normal map + MeshToonMaterial**. Deben responder al DirectionalLight,
  proyectar una sombra recortada por alpha y mantener la geometría plana.
  Conservar el sombreado pintado solo como detalle secundario; los fondos
  lejanos, carteles y nubes pueden seguir siendo ilustraciones sin relighting.
- Añadir una sombra de contacto muy sutil en la unión con suelo o maceta.
  La sombra dinámica sobre suelo debe conservar el alpha de la silueta.
- `alphaTest` (≈ .5) para recortes con transparencia; evita problemas de
  ordenación entre capas.
- Ligero para web: nada de geometría vegetal densa ni miles de polígonos.

## 3. Luz y contorno

Los personajes y el decorado comparten el mismo lenguaje de luz, y todo se
decide como lo haría un ilustrador.

- **Luz calculada, no horneada.** Las texturas guardan solo el **albedo neutro**,
  sin degradados de luz, viñetas, brillos metálicos ni sombras pintadas. El relieve
  va en un normal map: juntas de baldosa, césped, hojas. Se permite hornear el
  detalle que no es luz: vetas, manchas y oclusión de contacto.
- **Una sola luz compartida.** Zona iluminada = albedo × color de la luz.
  Sombra = albedo **multiplicado por un tono frío**, nunca hacia el negro. El corte
  es duro pero antialiasado. Los volúmenes usan **3 bandas** (sombra, medio, luz);
  los planos usan 2 bandas + relieve. Sin tone mapping, sin especular y sin PBR.
- **Luz del mundo.** El sol queda arriba a la izquierda del espectador en la vista
  principal, el mismo lado que la luz de los personajes. Las superficies bajo techo
  usan la luz de techo y fuera usan el sol; se decide por fragmento, sin materiales
  interiores aparte.
- **Ambientes:** Mañana, Mediodía, Tarde, Nublado y Noche. Cada uno fija sol, luz de
  techo, cielo pintado, sombras, lámparas y tintes.
- **Lámparas en bandas.** Charcos de luz en el suelo (tenues de día, plenos de
  noche); apenas tocan las paredes.
- **Sombras del sol.** Los receptores del suelo **multiplican** por el tono frío
  del ambiente.
- **Ilustraciones sin relighting.** Carteles, pantallas, fondo, nubes y árboles
  lejanos no se re-iluminan: solo se tiñen con el ambiente. Los paneles de luz del
  techo y los focos son emisivos.
- **Contorno grueso (casco invertido).** Grosor constante en píxeles (1,4 px por
  defecto, ajustable y desactivable). El color sale del relleno ×0,55 en sRGB,
  nunca negro, y se oscurece de noche. Jerarquía: `fuerte` para los personajes,
  `medio` para el mobiliario cercano y `fino` para la arquitectura grande (>2,6 m).
  Suelo, techo y paredes enteras no llevan trazo, y los planos 2.5D (vegetación,
  carteles) lo llevan dibujado en el albedo.
- **Reflejo (excepción, solo si el usuario lo pide).** Suelo brillante con espejo
  plano tenue y algo borroso solo del mobiliario de la sala; el suelo sigue siendo
  toon por debajo y no hay especular en ningún otro material.
- **Movimiento a tramos.** El vaivén de la vegetación avanza a ~12 pasos por segundo.
- **Para un objeto nuevo:** volúmenes con material toon de 3 bandas + contorno;
  planos grandes con material toon de albedo + normal. No sombrear con
  `MeshStandardMaterial` ni con luces three.js sueltas.

## Regla estructural: modularidad y selección

Cada elemento creado tiene una raíz semántica independiente, ID estable, tipo y etiqueta.
Una silla y sus piezas forman una unidad seleccionable; no se fusiona con piso, paredes
ni otros muebles. Reutilizar módulos no elimina la identidad de cada objeto. Conserva
la selección y persistencia existentes al integrar este contrato (ver MODULARIDAD.md).

## 4. Alcance del proyecto

Hotel Palma Real, hotel urbano 5 estrellas **moderno** (no colonial) en Colombia. Revisión del 30 de septiembre de 2026:

- Edificio Grand Hotel con sus texturas originales autorizadas. Solo se adapta la planta baja, que es lo que ve el estudiante: entrada frontal desde la acera, como en el aeropuerto. **No se añaden balcones ni piezas pegadas a la fachada**; todo lo que toca el edificio se coloca sobre su superficie medida.
- Ascensor y escalera integrados en el lobby (doble altura). La galería de P1 lleva, por una puerta doble, al pasillo de habitaciones de doble crujía (impares a la izquierda, pares a la derecha); solo se entra en la suite 201, que tiene balcón.
- Patio de llegada de un solo sentido: entrada derecha y salida izquierda con barreras levadizas independientes, inicialmente abiertas. U existente alrededor de la fuente; cruces peatonales y rampas sin escalón hacia la calle. Muro continuo de piedra en el borde exterior de la acera opuesta; frente del hotel abierto. Suelos con albedo neutro + normal (adoquín, losa, césped, asfalto, granito) en `objetos/SuelosExterior.js`.
- Lujo en estilo cartoon: piedra clara, bronce, latón, vidrio, madera, alfombras, arte botánico.
- LOD 3 conserva el contorno, el artesonado, vigas, revestimientos, barandas, alfombras, arte y luminarias; solo simplifica muebles y omite objetos pequeños.
- Palmeras solo al aire libre (fachada, terraza, patio descubierto del restaurante); bajo techo, plantas en maceta.
- Sin lagos, coches ni horizonte nuevos; la vista lejana del balcón se conserva sin ampliarla.
- Restaurante buffet (1 de octubre de 2026): zona alternativa `buffet` («Restaurante buffet» en el menú), copia del restaurante para comparar; el original (`restaurante`, con patio abierto) no se toca. Todo bajo techo: sin patio ni fuente ni palmeras; la terraza es la zona `terraza`, a la que se sale por una puerta del muro este. Estaciones de lujo (isla central fría, carvery, isla de postres, línea de desayuno) con base de listones, nichos iluminados y dosel de luz; medidas en `BUFFET` y piezas en `objetos/Buffet.js`, tests en `tests/buffet.test.js`.
- Reorganización del buffet (3 de octubre de 2026): recinto de 27 × 24 × 5,5 m, conservando las 13 mesas y sus identidades; escenario contra el centro del muro frontal y pasillos libres de al menos 1,5 m entre mesas y estaciones. Medidas y relaciones exclusivas en `routes.js`, reexportadas desde `engine/dimensions.js`. Ventanas con vanos reales y vidrio toon transparente, sin construir exterior ni añadir plantas, flores o decoración. Se recolocan únicamente los elementos existentes. Lámparas específicas del buffet mediante la API compartida, sin cambiar Luz25D ni la iluminación de otras áreas.
