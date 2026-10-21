# Guía de estilo SpanStories — Aeropuerto (regla maestra)

> Este archivo es el contrato visual del proyecto. Cualquier trabajo futuro en la
> escena debe respetarlo. Última actualización: 2026-09-23.

## 1. Regla maestra: la proximidad define la técnica

**Lo que está cerca y es principal a la escena va en 3D** — geometría real o
**ilusión de 3D**: planos con profundidad por capas, normal map, toon shading
y sombras suaves. El detalle pintado puede reforzar el volumen.
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
  palmera, planta, personaje futuro) usa **pivot bottom-center (0.5, 0)**.
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

## 3. Luz y contorno (`engine/Luz25D.js`)

Port de la luz del aula (`escenarios/luz25d.js`). Los personajes y el decorado
comparten el mismo lenguaje de luz, y todo se decide como lo haría un ilustrador.

- **Luz calculada, no horneada.** Las texturas guardan solo el **albedo neutro**,
  sin degradados de luz, viñetas, brillos metálicos ni sombras pintadas. El relieve
  va en un normal map: juntas de baldosa, césped, hojas. Se permite hornear el
  detalle que no es luz: vetas, manchas y oclusión de contacto.
- **Una sola luz compartida (`luz`).** Zona iluminada = albedo × color de la luz.
  Sombra = albedo **multiplicado por un tono frío**, nunca hacia el negro. El corte
  es duro pero antialiasado. Los volúmenes usan **3 bandas** (sombra, medio, luz);
  los planos usan 2 bandas + relieve. Sin tone mapping, sin especular y sin PBR.
- **Luz del mundo.** El sol queda arriba a la izquierda del espectador en la vista
  de la fachada, que es el mismo lado que la luz de los personajes. Las superficies
  **dentro de una sala** del recorrido (bajo el techo) usan la luz de techo, y fuera
  usan el sol. Esto se decide por fragmento, así que no hacen falta materiales
  interiores.
- **Ambientes:** Mañana, Mediodía, Tarde, Nublado y Noche. Cada uno fija el sol, la
  luz de techo, el cielo pintado, las sombras, las lámparas y los tintes. Se eligen en
  «Viaje y opciones → Luz y estilo» o con `?amb=noche` en la URL.
- **Lámparas en bandas.** Las pone la zona activa: charcos de techo (tenues de día,
  plenos de noche) y focos de la marquesina de D00 (tarde y noche). Pintan charcos
  en el suelo y apenas tocan las paredes.
- **Sombras del sol.** Los receptores de la acera **multiplican** por el tono frío
  del ambiente (capa «Multiplicar»).
- **Decales de luz.** La mancha de sol en el vestíbulo de D00 sigue al sol y
  desaparece de noche. El resplandor cálido tras los vidrios de la fachada se
  enciende de noche.
- **Ilustraciones sin relighting.** Carteles, pantallas, fondo, nubes y árboles
  lejanos no se re-iluminan: solo se tiñen con el ambiente (`luz.tintar`). Los paneles
  de luz del techo y los focos de la marquesina son emisivos.
- **Contorno grueso (casco invertido).** Grosor constante en píxeles (1,4 px por
  defecto, ajustable y desactivable en el panel). El color sale del relleno ×0,55
  en sRGB, nunca negro, y se oscurece de noche. Jerarquía: `fuerte` para los
  personajes, `medio` para el mobiliario cercano y `fino` para la arquitectura
  grande (>2,6 m). Suelo, techo y paredes enteras no llevan trazo, y los planos 2.5D
  (vegetación, carteles) lo llevan dibujado en el albedo.
- **Excepción: porcelanato brillante del hall de D00** (pedida por el usuario el
  2026-09-24). `engine/GlossyFloor.js` refleja en el suelo, en espejo plano, solo
  el mobiliario de la sala (capa `REFLECT_LAYER`). El reflejo es tenue, algo
  borroso y se desvanece con la altura del objeto. Los paneles de luz conservan su
  brillo. El suelo sigue siendo toon por debajo, y no hay especular en ningún otro
  material.
- **Movimiento a tramos.** El vaivén de los árboles del jardín avanza a ~12 pasos
  por segundo.
- **Para un objeto nuevo:** los volúmenes usan `kit.materials[color]` o
  `crearMaterialToon({ color, bandas: 3 })` + `contornoDe(mesh, kit.outline(color))`,
  y los planos grandes usan `crearMaterialToon({ albedo, normal })`. No uses
  `MeshToonMaterial`/`MeshStandardMaterial` ni luces three.js para sombrear.

## 4. Alcance actual

- **Por ahora NO personas ni carros** (decisión del 2026-09-23; se revisará
  cuando el usuario lo pida).
- Trabajo activo: zona **D00 · Entrada** (fachada + forecourt) y **D01 ·
  Facturación** (piso + ATM 2.5D). No modificar la estructura, dimensiones,
  navegación ni sistema de cámaras del shell.
