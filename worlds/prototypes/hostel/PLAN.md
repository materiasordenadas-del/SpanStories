# Hostal Santa Marta — plan de diseño

Hostal **mochilero** típico del **Caribe colombiano** (Santa Marta) en una **casa
colonial de patio central** para SpanStories. Se diseña para lo que ve y hace el estudiante:
llegar, hacer el check-in, consultar precios y servicios, dejar la mochila en su litera, cocinar,
socializar en el patio y la azotea. Lo que no se ve no se modela. Estilo: `ESTILO.md`.

**Regla del usuario (2026-10-01):** todas las zonas, **muchas puertas pero una sola habitación
de verdad** (el dormitorio 1). Todo **modular y seleccionable**: al tocar un objeto **se oye su
nombre** (con artículo: «la litera», «el casillero»).

## Referencias consultadas
- Estética y programa: [Indie Traveller — hostales de Cartagena](https://www.indietraveller.co/best-hostels-in-cartagena/)
  — casas coloniales restauradas, patios amplios, piscina pequeña en el patio, azotea con bar,
  muros de color (rosa), azulejo y murales, intercambio de libros, literas tipo cubículo.
  (Las referencias son de Cartagena; el hostal se ambienta en Santa Marta, misma arquitectura caribeña.)
- Ejemplos de casas-hostal: [Nomadic Mick — 15 hostales en Cartagena](https://www.nomadicmick.com/best-hostels-in-cartagena/),
  [Lonely Planet — Casa Escallón](https://www.lonelyplanet.com/colombia/caribbean-coast/cartagena/hotels/hostal-casa-escallon)
  — casa colonial en Getsemaní, patio, azotea, dormitorios y habitaciones privadas.
- Distribución: [Coohom — hostel floor plan layout](https://www.coohom.com/article/hostel-floor-plan-layout)
  — recorrido recepción → zonas comunes → dormitorios; separar lo ruidoso de lo tranquilo con
  cocina/baños de por medio; casilleros bajo la litera de 40–45 cm; cortina por cama.
- Medidas de litera: [Heavy Duty Bunk Beds — hostel bed size](https://heavydutybunkbeds.com/how-long-are-hostel-bunk-beds/),
  [Just Better Bunk Beds — room planning](https://justbetterbunkbeds.com/pages/room-dimensions-space-planning)
  — cama 0,90 × 2,00 m; 76–91 cm entre colchones; ≥ 76 cm del colchón alto al techo.
- Fachada: piezas de `_reservas/fachada-colonial/` (Casa San Agustín / Santa Clara, Cartagena):
  muro encalado, zócalo, ventanas de arco con reja, balcón de madera con tejadillo, buganvilla,
  farol, portón de dos hojas, alero de teja.
- *Supuesto:* precios (cama en dormitorio 60.000–90.000 COP/noche) a partir de rangos típicos
  de Getsemaní; se dejan como constantes editables.

## Planta baja (metros; x al este, z al sur; la calle en z > 0)
```
                         z = -26  (muro del fondo)
 x=-10 ┌──────────────┬───────────────────┬──────────────┐ x=+10
       │  COCINA      │   COMEDOR (mesa   │  BAÑOS ▯     │
       │  COMPARTIDA  │   larga) ─ puerta │  LAVANDERÍA ▯│   z -26..-20
       ├──────▯───────┴──── galería ──────┴──────▯───────┤
       │ DORM 3  ▯    │                   │  ▯ PRIVADA 1 │
       │              │     PATIO  7×10   │              │
       │ DORM 2  ▯    │  plantas, piscina │  ▯ PRIVADA 2 │   z -20..-8
       │              │  (¿?), hamacas    │              │
       │ DORM 1 ★ ▯   │  en la galería    │  ▯ ESCALERA→ │
       ├──────────────┴──── galería ──────┴──────────────┤      azotea
       │  SALA COMÚN  │  ZAGUÁN  │   RECEPCIÓN           │   z -8..0
       │  (sofás,     │ (entrada)│   (mostrador, precios)│
       └──────────────┴──PORTÓN──┴───────────────────────┘ z = 0 fachada
                 acera (z 0..2,5) · calle (z > 2,5)
```
- Casa de 20 × 26 m, dos plantas + azotea. Crujías de 4,5 m, galería de 2 m, patio de 7 × 10 m.
- Techo de planta baja **4,2 m** (casa colonial alta); planta alta igual. Ojo del jugador 1,62 m.
- ▯ = puerta. ★ = la única que se abre (Dormitorio 1). Las demás llevan número/rótulo y, al
  tocarlas, dicen su nombre («la puerta del baño», «el dormitorio tres: ocupado»).
- **Planta alta:** galería con baranda de madera alrededor del patio y **puertas de dormitorios
  4–8 y privadas 3–4**: se ve desde el patio, no se recorre.
- **Azotea** (por la escalera del patio): hamacas, luces colgantes, barra pequeña, vista a
  tejados y cúpula de fondo en 2D.

## Dormitorio 1 (la habitación de verdad), 4,5 × 6 m
- **4 literas = 8 camas**, dos por muro largo, pasillo central ≥ 1,2 m.
- Litera: cama 0,90 × 2,00, colchón bajo a 0,45 m (encima del **casillero** de 0,45 m),
  colchón alto a 1,45 m (≈ 85 cm de hueco), escalera, **cortina**, lamparita y enchufe por cama.
- Ventilador de techo, ventana con postigos al patio, perchero, cartel de horas de silencio.

## Recorrido del estudiante
1. Acera → portón (farol, rótulo «Hostal La Buganvilla», buganvilla).
2. Zaguán → **recepción**: mostrador, timbre, **pizarra de precios y servicios** (interactiva,
   con selector de moneda COP/USD/EUR como en otros proyectos), llaves/tarjetas, mapa.
3. Sala común: sofás, estantería de intercambio de libros, guitarra, juegos de mesa, TV.
4. Patio: plantas, hamacas en la galería, (piscina pequeña), bancos.
5. Cocina compartida: estufa, nevera con comida rotulada, fregadero, estantes con cajas por
   huésped, cartel «lava lo que usas». Comedor con mesa larga.
6. Galería → puertas de dormitorios, baños, lavandería, privadas → **Dormitorio 1** (entra).
7. Escalera → azotea: hamacas, luces, barra.

## Piezas y técnica (ESTILO.md §1)
| Pieza | Distancia/rol | Técnica |
| ----- | ------------- | ------- |
| Fachada, galerías, arcos, baranda | cerca, principal | 3D simple (piezas de `FachadaColonial.js` adaptadas a 20 m) |
| Litera, casillero, cortina | cerca, principal | 3D simple + contorno `medio` |
| Mobiliario (sofás, mesa, estufa, nevera, hamacas, mostrador) | cerca | 3D simple + contorno `medio` |
| Puertas (todas) | cerca | 3D, una sola pieza en bucle con número/rótulo |
| Plantas del patio, buganvilla | cerca | planos 2.5D toon + normal, pivot abajo-centro, base tapada por maceta |
| Pizarra de precios, carteles, tablón | cerca | ilustración en lienzo, sin relighting |
| Tejados, cúpula, cielo desde la azotea | fondo | 2D plano pintado |

## Interacción (para todas las zonas)
- Cada objeto es una **raíz propia** registrada con `id`, `tipo` y `etiqueta` (registro de
  objetos del hotel, `engine/Objetos.js`). Tocar → caja de selección + **voz** con el nombre.
- La voz usa `speechSynthesis` con preferencia **es-CO → es-US/es-MX → es** (fallback silencioso).
- Etiquetas con **artículo y vocabulario colombiano**: el casillero, la nevera, la estufa, el
  lavaplatos, la hamaca, la litera, la cortina, el ventilador, el timbre, la pizarra de precios.
- Repetidos (literas, puertas, sillas): una pieza en bucle, cada copia seleccionable.

## Alcance
- Dentro: fachada + acera, zaguán, recepción, sala común, patio con galería, cocina + comedor,
  dormitorio 1 completo, galería alta (solo vista), azotea, escalera. Pizarra de precios.
  Panel según `PANEL.md` y los 5 ambientes de luz.
- Fuera (no se modela): interior de los demás dormitorios, privadas, baños y lavandería (solo
  puertas); calle con coches; personajes; ciudad en 3D (solo fondo 2D).

## Decisiones del usuario (2026-10-01)
1. **Nombre** de una ciudad más común: **Hostal Santa Marta** (constante `NOMBRE` en dimensions.js).
2. **Piscina pequeña** en el patio: sí (3,2 × 5 m, 1,3 m de hondo).
3. **Colombia**: precios en COP (selector COP/USD/EUR/MXN) y voz es-CO si el sistema la tiene.
4. **Sin plantas, sin autos, sin personajes** (se quitó la buganvilla; el patio es de piedra).
5. **Entrada y salida como en el aeropuerto/hotel**: muro de calle delante de la casa con
   **ENTRADA a la derecha (+x) y SALIDA a la izquierda (−x)** vistas de frente; el muro permite
   simular la ciudad detrás (casas vecinas, fachadas de enfrente y horizonte pintados).
6. **Comedor tipo buffet sin comida**: mostrador, bandejas vacías, platos, vasos y termos; la comida
   la aportará el usuario después.

## Construido (resumen)
- Un solo mundo continuo; las zonas son vistas de cámara: calle, patio delantero, recepción,
  sala común, patio y piscina, cocina, comedor, Dormitorio 1, galería alta y azotea.
- Dormitorio 1 = única habitación real: 4 literas (8 camas), casillero con candado, cortina,
  almohada, cobija y lámpara de lectura por cama. 15 puertas más con número y rótulo.
- Todo objeto es una raíz seleccionable; al tocarlo se ve y se oye su nombre con artículo.
- Reglas geométricas en `engine/Planta.js`; tests en `tests/hostal.test.js`.
