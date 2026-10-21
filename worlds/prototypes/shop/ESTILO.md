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

## 4. Alcance del proyecto

Proyecto: **La Estrella**, Sistema 5 · Comercio (plan en `PLAN.md`).
- Zonas activas: acera y fachada (escaparate, puerta de vidrio corredera, letrero), isla de
  promoción, 4 góndolas dobles, pared de exposición (oeste), frescos/exhibición (este),
  refrigeradores/exposición especial (fondo), caja con fila, almacén con puerta de servicio.
- Dos modos sobre el mismo casco: `super` y `general`. Lo común (casco, góndolas, cajas,
  almacén) no cambia al cambiar de modo; lo del modo se reconstruye en su propio grupo.
- **Sin modo ropa/zapatos ni probadores** (usuario, 2026-09-25).
- Región Colombia con selector de moneda (COP por defecto). Sin personas en escena.
- Productos: `InstancedMesh` con color por instancia (extensión de `Luz25D.js`: `vTinte`),
  sin marcas reales.
