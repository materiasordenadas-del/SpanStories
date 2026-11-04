# Informe de sesión 0.16.0 · Estilo Dispatch

Fecha: 26/10/2026 · Agente: Claude Code · Partida: 0.15.0 (respaldo `respaldo/versiones/0.15.0-previo-dispatch-20261026T011419Z`).

## Qué se pidió

Añadir al Generador de mundos (Estudio) el estilo del videojuego *Dispatch*.

## Referencia

*Dispatch* (AdHoc Studio, 2025, Unreal Engine 4.27). Su director de arte describe un aspecto sin sombreadores sofisticados, cercano a la animación clásica de cine y televisión: personajes con sombreado simple, fondos pintados a mano y composición; el estudio lo llama «anime occidental». La crítica lo describe como mitad cómic, mitad realismo estilizado, con líneas limpias y fondos de atardecer que brillan con las luces de la ciudad. No se usa ningún recurso del juego: solo se imitan esos rasgos.

## Qué se hizo

- `src/estudio/render/dispatch.js` (nuevo): paletas por ambiente (cenit, horizonte, resplandor, sombra, borde de neón, bruma, tinta, luz del cielo) y GLSL de cielo, superficie, atmósfera y tinta.
- `pipeline.js`: `MODES.dispatch=8`; ramas `mode==8` en cielo, superficie, atmósfera, saturación (1,08) y tinta. Las condiciones de patrón de material, ventanas lejanas y noche pasan de `mode<=2||mode==6||mode==7` a `mode<=2||mode>=6` (idénticas para los modos 0–7).
- `viewer.js`: volumen de copa también en Dispatch.
- `main.js`: botón «Dispatch · SpanStories» en el selector de estilos (se guarda/reabre como los demás mediante `view.mode`).
- Aspecto:
  - Cel de dos tonos con borde duro (`fwidth`) y sombra arrojada nítida.
  - Sombra = color concentrado × tinte violáceo del ambiente; en la piel (superficie 25), rosado.
  - Fondos: brochazos anchos de gouache en espacio mundo, más marcados con la distancia; perspectiva aérea hacia la bruma del ambiente y fusión con el cielo a 1,5–4,2 km.
  - Tinta del color de la tinta del ambiente (no negra), plena hasta 160 m y nula a 700 m.
  - Borde de luz cálido del lado del sol; borde de neón en la sombra (cian de día, magenta por la tarde, cian por la noche).
  - Cielo: degradado de atardecer, halo ancho del sol, estratos alargados con base sombreada.

## Verificación

- `npm test`: 95/95 (dos nuevas: paletas de los cinco ambientes; alternar a Dispatch y volver no cambia colores ni parámetros de los demás estilos).
- `vite build` correcto. Shader compilado sin errores en el navegador (solo un aviso de variable sin inicializar del compilador HLSL).
- Revisión visual en Puerta del Sol (300 m) y colegio procedural: mediodía, tarde y noche. Capturas en `reports/estudio/0.16.0/`.
- Los modos 0–7 no cambian por construcción (solo ramas nuevas); no se repitió la comparación GPU píxel a píxel de 0.15.0.

## Pendiente

- Aprobación visual del usuario y ajuste fino (intensidad de tinta, profundidad de sombra, saturación).
- Superficies muy saturadas muy cerca de cámara (p. ej. un plano rojo a pie de calle) se ven planas: es cel puro, revisar si molesta.
- Personajes: usan el cel común con sombra rosada; no tienen aún tratamiento propio como el de Zelda.
- Comparación GPU de los estilos 0–7 contra 0.15.0 (`tests/grass-swap-gpu.js`) si se quiere evidencia formal.
- En el panel, la fila «Acuarela / Personajes» de Zelda se ve también en otros estilos (ya pasaba antes; no se tocó).
