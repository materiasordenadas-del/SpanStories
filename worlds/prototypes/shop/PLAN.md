# La Estrella — plan de diseño (Sistema 5 · Comercio)

Tienda de barrio **típica** (Colombia, pesos colombianos; **selector de moneda** en el panel: COP · MXN · EUR · USD) para SpanStories con **dos modos** sobre el mismo
local: **Supermercado** y **Tienda general**. Se diseña para lo que ve y hace el estudiante:
mirar el escaparate, entrar, ver las ofertas, recorrer los pasillos, buscar una sección,
coger del refrigerador, hacer la fila y pagar en caja. Estilo: `ESTILO.md`.
**Sin modo ropa/zapatos** (ni probadores): lo pidió el usuario el 2026-09-25.

## Variante regional (decidido 2026-09-25)
Colombia: precios `$3.500` (punto de miles, sin decimales), «aseo» (no limpieza), «paquetes» y
«mecato», «gaseosas», «fruver» y precio **por libra**, «datáfono», leche en bolsa, pandebono y
almojábana en la isla, «Hale / Empuje» en la puerta. La moneda se cambia desde el panel y los
precios se convierten con tasas fijas aproximadas y redondeo «de góndola» (`engine/Moneda.js`).

## Referencias consultadas
- Distribución: [POS Nation, *Small grocery store layout*](https://www.posnation.com/blog/small-grocery-store-layout)
  — ofertas y temporada en la entrada; lácteos/refrigerados **al fondo** para hacer recorrer
  la tienda; frescos en el perímetro; productos de impulso en la caja; la fila no invade pasillos.
- Distribución y medidas: [Antdisplay, *Small supermarket interior design*](https://antdisplay.com/Ideas/7-steps-let-you-see-small-supermarket-interior-design/)
  — cajas junto a la entrada/salida; carril de caja 1–1,2 m; isla de promoción ≤ 1 × 1 m y
  ≤ 1,2 m de alto para no tapar la vista; tubos fluorescentes alineados con los pasillos;
  escaparate con carteles de descuento.
- Medidas (México): [JM Villegas, *Medidas de góndola para autoservicio*](https://www.jmvillegas.mx/blogs/jm-villegas/medidas-de-gondola-para-autoservicio)
  — góndola de minisúper 1,50–1,80 m de alto; módulos de 0,90/1,20 m; central doble 0,60–0,90 m
  de fondo; mural 0,40–0,55 m; paso libre ≥ 0,90 m.
- Pasillos: [Anclamar, *Medidas de góndolas*](https://www.anclamar.com/blog-detail/19-medidas-de-gondolas-de-supermercado-alturas-lar)
  — 1,30–1,50 m en supermercado; ≥ 1,60 m en entrada, salida y línea de cajas.
- Caja: [Prontometal, *Pasillo de caja (checkout)*](https://prontometal.com.uy/producto/pasillo-de-caja-completa-checkout/)
  — mueble de caja ≈ 0,60 × 1,80 m, 0,85 m de alto.
- Minisúper mexicano: [INEGI, *Tiendas de conveniencia o minisúper*](https://en.www.inegi.org.mx/contenidos/programas/ce/2019/doc/m_ticonv_ce19.pdf)
  — refrigeradores verticales de bebidas y lácteos; pago con tarjeta en caja.

Supuesto (no citado): góndola a **1,60 m** (algo más baja que el 1,80 típico) para que desde el
ojo (1,62 m) se lean los letreros colgantes de sección; simplificación de legibilidad.

## Planta (metros; x al este, z al sur; la calle en z > 0)
```
z=-14 ┌────────────── refrigeradores / exposición especial ──────────┬── ALMACÉN ──────┐
      │ [F][F][F][F][F][F][F][F]  (modo general: tarimas + focos)     │ racks · cajas   │
      │                                                               │         puerta ▯│ x=8: puerta
z=-11 │   ····· pasillo del fondo ·····                               └─ «Solo personal»┤ de servicio
      │M  ┌┐   ┌┐   ┌┐   ┌┐                                                    F  │
      │U  ││   ││   ││   ││   góndolas dobles (0,9 × 3,6 m, h 1,6)             R  │
      │R  ││   ││   ││   ││   letreros colgantes de sección                    E  │
      │A  ││   ││   ││   ││                                                    S  │
      │L  └┘   └┘   └┘   └┘   cabeceras con ofertas                            C  │
z=-5  │                                 ┌─isla─┐                               O  │
      │    [fila] [fila]                │promo │   pasillo principal           S  │
      │    ║caja1  ║caja2               └──────┘                                  │
      │                                                             banca         │
z=-1  │ ░░░░░ plataforma del escaparate ░░░░░░░░░░░░░░░░       ▯ tapete ▯          │
z=0   └── escaparate de vidrio ─────────────────────────────── puerta de vidrio ──┘
     x=-8                                                       x≈5.6            x=8
      ═════════════ acera · letrero «La Estrella» sobre la fachada ═════════════
```
Techo 3,6 m. Ojo del jugador 1,62 m. Las cifras exactas viven en `engine/config.js`.

## Recorrido del estudiante
1. **La calle**: fachada, letrero, escaparate con ofertas, puerta de vidrio.
2. **Al entrar**: zona de descompresión, cartel «Bienvenidos», isla de promoción delante.
3. **Promoción**: mesa central con productos destacados y carteles de precio/oferta.
4. **Pasillos**: góndolas con precios en el borde del estante, letreros de sección colgando.
5. **Pared de exposición**: estantería mural con señalización por secciones.
6. **Zona especializada**: refrigeradores (súper) o exposición especial (general); frescos en la pared este (súper).
7. **Almacén**: puerta «Solo personal» abierta; dentro, racks y cajas; puerta de servicio a la calle.
8. **Caja**: fila con línea «Espere aquí», caja registradora, terminal de pago, bolsas; salida.

## Modos (mismo local, cambia el contenido)
| Área | Supermercado | Tienda general |
| ---- | ------------ | -------------- |
| Letrero | La Estrella · Supermercado | La Estrella · Tienda general |
| Góndolas | abarrotes, botanas, limpieza, bebidas | hogar, papelería, juguetes, ferretería |
| Pared oeste | abarrotes/enlatados | cocina y artículos colgados (panel ranurado) |
| Pared este | **frescos**: cajones inclinados de frutas y verduras | exhibición de regalos/hogar |
| Fondo | **refrigeradores** de lácteos, carnes frías y bebidas | **exposición especial**: tarimas con focos |
| Isla promo | pan dulce, frutas de temporada | artículos de temporada |
| Escaparate | carteles de ofertas y productos | carteles y artículos de temporada |

## Piezas y técnica (ESTILO.md §1)
| Pieza | Distancia/rol | Técnica |
| ----- | ------------- | ------- |
| Fachada, escaparate, puerta, letrero | cerca, protagonista | 3D simple + contorno fino; letrero ilustrado |
| Góndolas, estantes, refrigeradores, caja | cerca, principal | volúmenes toon 3 bandas + contorno medio |
| Productos | cerca, repetidos | `InstancedMesh` con color por instancia (sin trazo si son diminutos) |
| Carteles de precio/oferta/sección | lectura | ilustración (canvas) sin relighting, teñida |
| Edificios de enfrente, cielo | fondo | 2D plano pintado |

## Alcance
- Dentro: fachada y acera, piso de venta completo, caja, almacén pequeño, señalización.
- Fuera (no se modela): oficina, baños, carnicería con personal, trastienda más allá del almacén,
  personas (como el aeropuerto y el banco), modo ropa/zapatos.

## Estado (2026-09-25)
Abrir: entrada `comercio` de `.claude/launch.json` → `http://localhost:7500/Comercio/?dev`.
URL: `?modo=super|general`, `?moneda=COP|MXN|EUR|USD`, `?vista=<id de VISTAS>`, `?amb=noche`.
`?dev` expone `window.__comercio` (view, paso, render, nombrar, usarModo, usarMoneda).
API de historias: `window.comercio` (ir, modo, moneda); eventos `comercio:modo`, `comercio:moneda`, `comercio:objeto`.

Archivos: planta en `engine/config.js`; casco y calle en `Local.js`; muebles en `Mobiliario.js`
(registran estantes con marco local); surtido y secciones en `Surtido.js`; formas y llenado en
`Productos.js`; carteles y atlas de precios en `Rotulos.js`; lo que cambia por modo en `Modo.js`.
`Luz25D.js` = plantilla del plugin + color por instancia (`vTinte`) en relleno y contorno.

Medido: súper ≈ 11 600 productos instanciados, 134 llamadas, ≈ 670 k triángulos; general ≈ 7 100
productos. Tests (`npm test`): moneda y reglas de planta (pasillos ≥ 1,3 m, principal ≥ 1,6 m,
carril 1–1,2 m, isla ≤ 1,2 m, poste de la isla al ras del cartel, frescos derivados del almacén).

Pendiente / ideas: lista de compras o misiones en el panel (como el Banco), diálogo en la caja,
más variedad de fruta por cajón.
