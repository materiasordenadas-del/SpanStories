# Informe de la sesión · Atlas 0.15.0 · 25/10/2026

Fuente vigente: `D:\Español\Generador-Mundos` (puerto 5179). Continúa 0.14.2. Respaldo previo verificado: `respaldo/versiones/0.14.2-previo-zelda-acuarela-20261025T014836Z` (296 archivos, SHA-256).

Encargo: perfeccionar el estilo «Zelda · SpanStories» hacia *Breath of the Wild* con más acuarela: sombras, color, saturación, césped más claro y cómo deben verse los personajes. Referencias del usuario: dos fotogramas pintados estilo BotW (chef y médico) y una captura del juego (prado). Personajes de prueba: `Lamine.glb` (moreno, con esqueleto y clips `walk.001`/`run.001`) y `3d character model.glb` (chica blanca, sin esqueleto). Escena de trabajo: el colegio entero (`?modo=escuela`).

## 1. Qué hice

### Escena (`render/pipeline.js`, modo 6)

| Antes (0.14.2) | Ahora (0.15.0) |
|---|---|
| Sombra = albedo × gris azulado (.33,.36,.45) → sombras sucias, marrón grisáceo | Sombra con el pigmento concentrado (más croma) × lila-azul más claro, más relleno azul del cielo: nunca gris |
| Terminador suave y uniforme | Terminador dibujado por el pincel (pinceladas y aguadas lo desplazan) y franja cálida saturada donde se apaga la luz |
| Sombra arrojada con desenfoque uniforme | Borde irregular de papel mojado y borde húmedo (pigmento acumulado dentro de la sombra) |
| Curva de película por canal (lavaba el color hacia el pastel) | Curva sobre la luminancia: luces sin quemar y croma conservado |
| Saturación de albedo ×1,28 con gamma 1,12 | ×1,12 con gamma 1,04: colores vivos pero claros, sin oscurecer los medios |
| Sin trazo en pantalla, solo grano leve | **Pase de acuarela**: Kuwahara suave (manchas de pincel que respetan bordes; radio mayor a lo lejos, mínimo en personajes), borde húmedo entre manchas, temblor de la mano y granulación del papel (modelo de Bousseau). 9 lecturas por píxel |

### Césped en Zelda

Sigue la elección de 0.14.1 (Zelda usa el sombreado de césped que tenía Ghibli), pero solo en Zelda el color se lleva a verde lima de BotW: más claro y amarillo, con las sombras abiertas. La configuración compartida del césped (altura, colores del panel) no cambia.

### Personajes (`render/characters.js`, nuevo; `render/gmaterial.js`)

- Botón **👥 Personajes** (visible en Zelda): coloca a Lamine (1,74 m) y a la chica (1,62 m) en el centro de la vista, mirando a la cámara; segundo clic los retira. Lamine queda en un fotograma de su clip de caminar (sin animación continua: las sombras no se recalculan cada fotograma).
- Se escriben en el mismo G-buffer como superficie **25**, con piel (skinning) y sombras.
- Albedo de personaje: la textura fotográfica de Tripo se simplifica (mip suavizado + aplanado de la sombra horneada); quedan ojos, cejas, boca y rayas.
- Luz de personaje BotW (`zCharacter`): cel de dos tonos con borde definido; sombra cálida rosada en la piel y en tejidos cálidos, azul violácea en los fríos; la piel naranja de Tripo se lleva a melocotón; franja rojiza subsuperficial en el terminador; borde de luz claro del lado del sol y celeste en la sombra; oclusión teñida.
- Archivos: `public/personajes/lamine.glb` y `public/personajes/chica.glb` (copias de las descargas, sin modificar).

### Interfaz

En Zelda aparece «Acuarela» (0–1,5; 0 desactiva el pase) junto al botón de personajes.

## 2. Qué no cambió

- Trigun, Color, Color + líneas, Arcilla y Studio Ghibli: **2250 comparaciones GPU** contra el shader del respaldo (cinco ambientes, 15 superficies, dos distancias, tres mezclas de suelo), diferencia máxima de canal **0**. Ghibli conserva la fórmula Zelda 0.14.2 para los árboles y el césped que toma prestados. Evidencia: `reports/estudio/0.15.0/estilos-intactos-gpu.json`.
- Geometría, árboles (paletas, normal de copa), cielo, bruma, navegación y exportación.

## 3. Verificación

- 93 pruebas (3 nuevas en `tests/estudio-zelda-acuarela.test.js`) y compilación aprobadas.
- Rendimiento (colegio, 1138×955): sin y con acuarela dentro del ruido de medida (20,5–21,8 ms en ambos). La primera versión con 36 lecturas costaba ~11 ms y se descartó.
- Capturas en `reports/estudio/0.15.0/`: `antes-patio.png`, `antes-alto.png` y `zelda-015-{personajes,retrato,patio,cesped,alto}.png` (sol a 150°/35° para que se lean los volúmenes). Borradores de iteración en `respaldo/evidencias-0.15.0-borradores/`.

## 4. Pendiente real

- Aprobación visual del usuario.
- El pelo de los personajes conserva el detalle de la textura de Tripo (rizos, mechones); BotW usa masas de pelo planas con un brillo en pincelada. Requiere separar el pelo (máscara o material propio), porque la textura es un único atlas.
- La chica no tiene esqueleto: queda en pose A.
- El césped 3D en el preset «alto» (1,1 m) tapa a los personajes; es un ajuste del panel de césped, no del estilo.
- Copia al visor de España (`SpanStories-Ciudades/engine/Estilos/Zelda`): no hecha.
