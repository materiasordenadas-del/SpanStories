# STARBACK — plan de diseño

Cafetería de cadena **típica de Latinoamérica** (inspirada en cómo lucen los Starbucks de México y
Colombia, **sin marca ni logo reales**) para SpanStories. Se diseña para lo que ve y hace el
estudiante: entrar, leer la carta, hacer la fila, pedir y **decir su nombre**, pagar, esperar a que
lo llamen en la entrega, añadir leche o azúcar y sentarse. Lo que no se ve no se modela.
Estilo: `ESTILO.md`.

## Decisiones del usuario (2026-09-25)
- **Español neutro** con **selector de moneda** (USD base · MXN · COP · PEN · CLP · EUR), como el Comercio.
  Las variantes regionales se enseñan al pulsar objetos («popote / pitillo / pajita»…).
- **Marca alternativa «STARBACK»** con los colores verdes de la cadena (`#00704a`, `#1e3932`,
  dorado `#cba258`) y un **emblema propio** (estrella blanca en círculo verde). **Nunca** el logo
  ni la sirena reales. Todo el nombre/colores viven en `engine/Marca.js`.
- Plan aprobado tal cual.

## Referencias consultadas
- Rediseño latinoamericano: [Merca2.0, *Starbucks presume rediseño de sus tiendas…*](https://www.merca20.com/starbucks-presume-rediseno-de-sus-tiendas-con-asientos-mas-comodos-obras-de-arte-vegetacion-y-toques-de-diseno-local-asi-lucen/)
  — pisos de madera, ladrillo, techos de madera, asientos acolchados, luz cálida, arte local,
  plantas, alfombras; **barra de espresso rediseñada para acercar al cliente a la preparación**.
- Materiales locales (México): [Expansión Obras, *Starbucks diseña con café chiapaneco…*](https://obras.expansion.mx/arquitectura/2015/08/13/starbucks-disena-con-cafe-chiapaneco-su-tienda-mas-grande-en-al)
  y [LíderLife, *Los Starbucks más bonitos de México*](https://liderlife.liderempresarial.com/los-starbucks-mas-bonitos-de-mexico-una-fusion-de-cafe-y-arquitectura/)
  — ladrillo en capas, estuco rosa, madera de tzalam/nogal, murales pintados a mano por artistas
  locales, lámparas artesanales de madera.
- Colombia: [Sprudge, *Behind the design at Starbucks' first store in Colombia*](https://sprudge.com/starbucks-colombia-design-58720.html)
  y [Daily Coffee News, *Inside Starbucks' Colombian flagship*](https://dailycoffeenews.com/2014/07/17/inside-starbucks-three-story-colombian-flagship-store-in-bogota/)
  — teca, latón, cuero, **muros verdes vivos**, murales de artistas colombianos, mesas de canto
  vivo, barra en las ventanas, mesa comunal de cata.
- Fotos (vistas en el navegador: galerías de Bing «starbucks mexico interior» y «starbucks
  colombia tienda interior», tienda de Naucalpan por Elkay Interior Systems): barra larga con
  **frente de madera y encimera clara**, **azulejo** de color detrás de la barra, **menús
  colgados sobre la contrabarra**, lámparas colgantes, techo oscuro con rieles de focos o
  listones de madera, vitrina de pan al inicio de la fila, barra de ventana con bancos altos,
  sillones de cuero, fachada de vidrio con terraza.
- Medidas: [Tanic Design, *Coffee shop bar dimensions*](https://tanic.design/blog/coffee-shop-bar-dimensions),
  [Barcircus, *Bar counter and back bar*](https://www.barcircus.com/en/conseils/professional-bar-layout-what-are-the-dimensions-of-the-bar-counter-and-the-back-bar-n9),
  [Espresso Services, *Countertop height*](https://www.espresso-services.com/espresso-blog/bid/304396/Countertop-Height-Considerations-for-Your-New-Espresso-Machine)
  — barra de pie ≈ **1,07 m** (42″), mesa de trabajo ≈ 0,91 m, fondo de barra 0,6 m,
  pasillo del barista **1,0–1,2 m**, banco alto 0,74–0,79 m; tramo accesible ≤ 0,91 m.

Supuestos (no citados): mesa bistró 0,75 m de alto y Ø 0,6 m; mesa comunal 3,6 × 1,0 m; sillón
0,85 × 0,85 m; techo 3,4 m (altura habitual de local comercial en planta baja).

Simplificaciones: nada de logo ni sirena (ver `engine/Marca.js`). Menús como ilustraciones planas (canvas). Personas: fuera, como en
el banco.

## Planta (metros; x al este, z al sur; la calle en z > 0)
```
z=-10 ┌──── azulejo · MENÚS colgados · contrabarra (máquinas, molinos, vasos) ────┐
      │  ░░░░░░░░░░░░░░░ pasillo del barista 1,1 m ░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
z=-7.6│ [leche/  ] ▐ENTREGA▌ ═══ barra de espresso ═══ ▐CAJA▌ ▐vitrina pan▐   │ muro
      │ [azúcar  ]  lámpara     (máquinas bajas: se ve     ↑    ↑ empieza    V │ verde
      │  condim.     «Recoge    al barista)             pedir  la fila     E │ vivo
      │                aquí»                                  ┊            R │
z=-5  │ MURAL        ┌────── mesa comunal (canto vivo) ─────┐ ┊ fila       D │
      │ (aves,       │  ○  ○  ○  ○  ○  ○   lámparas        │ ┊ «Haga su   E │
      │  cafetal,    └──────────────────────────────────────┘ ┊  fila aquí»  │
      │  montañas)                                             ┊  estante de  │
z=-3  │ ▣sillón ▣sillón   ◯ bistró   ◯ bistró                 ┊  café en    │
      │   alfombra                                             ┊  bolsa/termos│
z=-0.5│ ═══ barra de ventana · bancos altos ═══               ▯tapete▯       │
z=0   └──────── fachada de vidrio ──────────────────────────── puerta ───────┘
     x=-6        toldo verde · letrero «STARBACK»           x≈3.8       x=6
      ░░ terraza en la acera: 3 mesas con sombrilla + macetas ░░  z 0 → 3
      ══════════════════════ calle · edificios de enfrente (2D) ═══════════════
```
Techo 3,4 m (listones de madera sobre fondo oscuro). Ojo del jugador 1,62 m. Las cifras exactas
van a `engine/config.js` (planta) y `engine/dimensions.js` (techo, puerta, jugador).

## Recorrido del estudiante
1. **La calle**: terraza con sombrillas, fachada de vidrio, toldo y letrero, puerta.
2. **Al entrar**: estante de café en bolsa y termos, cartel «Haga su fila aquí».
3. **La fila**: línea en el piso junto a la **vitrina de pan** (precios en tarjetas).
4. **Pedir en caja**: menú colgado (bebidas calientes, frías, tamaños chico/mediano/grande,
   extras: leche vegetal, shot extra); el barista **pregunta el nombre** y lo escribe en el vaso.
5. **Pagar**: terminal de tarjeta y caja; «¿Para tomar aquí o para llevar?».
6. **Esperar**: mira la barra de espresso (se ve preparar), lo llaman en **Entrega · «Recoge aquí»**.
7. **Barra de condimentos**: leche, azúcar, canela, servilletas, tapas, popotes/pitillos.
8. **Sentarse**: mesa comunal, bistró, sillones con alfombra, barra de ventana o terraza.
   Cartel con la **clave del wifi**.

## Piezas y técnica (ESTILO.md §1)
| Pieza | Distancia/rol | Técnica |
| ----- | ------------- | ------- |
| Barra (frente madera, encimera clara), vitrina, caja | cerca, protagonista | 3D simple, toon 3 bandas + contorno medio |
| Máquinas de espresso, molinos, vasos, jarras | cerca, detalle | volúmenes simples; vasos con `InstancedMesh` |
| Mesas, sillas, bancos, sillones | cerca, repetidos | una pieza + bucle / `InstancedMesh`, contorno medio |
| Fachada, toldo, techo de listones | arquitectura | 3D simple + contorno fino; listones instanciados |
| Azulejo de la contrabarra, piso de madera | superficie | albedo neutro + normal map (juntas, tablas) |
| Muro verde vivo, macetas | cerca, vegetación | planos 2D con albedo + normal + toon (ESTILO §2) |
| Menús, mural, carteles, tarjetas de precio | lectura / arte | ilustración canvas sin relighting, teñida |
| Lámparas colgantes | luz | emisivas + charcos de luz en bandas (Luz25D) |
| Edificios de enfrente, cielo | fondo | 2D plano pintado |

## Panel (PANEL.md)
1. **Escena**: saltos de cámara (Calle · Entrada · Fila · Caja · Entrega · Mesas · Terraza), carta
   interactiva (pedido → nombre → pago → «¡Ana, tu latte mediano!»), `#status`.
2. **Luz y estilo**: `montarPanelEstilo` (piso de madera con reflejo tenue opcional).
3. **Calidad** · 4. **Diagnóstico**.

## Alcance
- Dentro: acera con terraza, fachada, salón completo, barra con caja/espresso/entrega,
  condimentos, zonas de asiento, menús y señalización.
- Fuera (no se modela): cocina/trastienda, baños (solo una puerta «Sanitarios»), segundo piso,
  personas.

## Estado (2026-09-25)
Construido: casco y calle (`engine/Local.js`), barra completa (`engine/Barra.js`), salón y terraza
(`engine/Salon.js`), carta y precios (`engine/Carta.js`, `engine/Moneda.js`), pedido interactivo
en `main.js` (fila → caja con nombre y pago → barra → vaso con el nombre en «Recoge aquí»).
Tests: `tests/planta.test.js`, `tests/moneda.test.js`. Servidor `python serve.py` → puerto 7600,
`http://localhost:7600/Cafeteria/?dev`.
