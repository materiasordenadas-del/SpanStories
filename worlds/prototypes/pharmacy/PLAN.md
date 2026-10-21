# Farmacia del Barrio: plan, referencias y auditoría

Escenario SpanStories: una **farmacia de barrio mexicana** pequeña, tipo cadena de
genéricos con consultorio, que además vende botanas y bebidas. El alcance es **la
entrada** (fachada y acera), **el piso de venta con sus estantes** y **el mostrador**
con la zona del dependiente. La bodega y el consultorio solo tienen la puerta, cerrada.

Se abre con la entrada `farmacia` de `.claude/launch.json` (puerto 7300) en
`http://localhost:7300/Farmacia/`. Con `?dev` se expone `window.__farmacia`.

## 1. Referencias consultadas

| Fuente | Qué se tomó |
| --- | --- |
| [Leafio: Pharmacy layout](https://www.leafio.ai/blog/pharmacy-layout/) | El mostrador debe **verse desde la entrada**. Zona caliente a la derecha de la puerta, refrigeración en zonas frías y producto de alto margen entre 76 y 137 cm. |
| [OY Display: Small pharmacy layout](https://oydisplay.com/small-pharmacy-layout-ideas/) | El mostrador va al fondo como «ancla» que hace recorrer el piso de venta. La farmacia comunitaria mide entre 46 y 93 m² y se divide en zonas: despacho, venta, consulta y bodega. |
| [Tecnyfarma: mobiliario para farmacias pequeñas](https://tecnyfarma.com/mobiliario-para-farmacias-pequenas/) | En locales chicos conviene **trabajar en vertical** y aprovechar la altura. |
| [Pinterest: mostradores de farmacia](https://es.pinterest.com/insidepharmacy/mostradores-de-farmacia/) | El mostrador lleva **vitrina de cristal al frente** y el anaquel va detrás. |
| [Muebles para farmacias y tiendas (MX)](https://www.mueblesparafarmaciasytiendas.com.mx/muebles-para-farmacias) | Mobiliario mexicano: mostrador con vitrina, anaqueles murales detrás, góndolas, melamina y minisúper integrado. |
| [Vitrinas para farmacias (MX)](https://www.vitrinasfarmacias.com/) | El mostrador lleva vitrina frontal para la venta de impulso en la caja, vitrinas murales y LED. |
| [Muebles para negocio (MX)](https://mueblesparanegocio.mx/muebles-para-farmacias/) · [Mostradores para farmacias (MX)](https://mostradoresparafarmacias.com/) | Hay tendencia a la farmacia con tienda de conveniencia: **bebidas y botanas**. |
| [Anclamar: medidas de góndolas](https://www.anclamar.com/blog-detail/19-medidas-de-gondolas-de-supermercado-alturas-lar) · [Offimobile: góndolas](https://offimobile.mx/blogs/offiblog/gondolas-de-exhibicion-para-tienda-y-negocio-tipos-medidas-y-como-elegir-las-correctas) | Las góndolas de farmacia miden entre 1,20 y 1,40 m de alto y de 0,70 a 0,90 m de fondo. En abarrotes, la isla típica mide 1,50 × 0,90 × 0,60 m. |
| [Brizuela: vitrina curva de farmacia](https://brizuelamm.com/catalogo-de-muebles/mostradores/vitrina-curva-farmacia/) | La vitrina mide 45 cm de fondo y tiene un frente de 1,20 a 1,80 m. |
| [NRS: c-store layout](https://nrsplus.com/blog/how-to-lay-out-your-convenience-store/) · [Cubic: c-store design](https://www.cubic-us.com/feeds/blog/convenience-store-interior-design) | El camino al refrigerador se bordea de botanas. En la caja van chicles, dulces y productos de impulso. |
| [Wikipedia: Farmacias Similares](https://es.wikipedia.org/wiki/Farmacias_Similares_S.A._de_C.V.) · [Saludiario: consultorios](https://www.saludiario.com/donde-estan-los-consultorios-medicos-de-farmacias-similares/) | El modelo mexicano es de genéricos con **consultorio anexo** de consulta barata. |

A eso se suma lo típico de la farmacia de barrio en México: cortina metálica
enrollada, letrero de caja de luz con cruz verde, cruz de bandera, vinil en el
aparador, báscula de moneda, silla y cartel de toma de presión gratis, red fría,
espejo convexo, pizarrón en la acera y guarnición amarilla.
**No se usa ninguna marca real**: el nombre es «Farmacia del Barrio» y los productos son genéricos.

## 2. Plano (config.js)

El local mide 6,4 × 9,4 m, con plafón reticular a 3,0 m. La calle queda al sur.

```
 z=-9.4 ┌── anaquel de medicamentos (piso a techo, 6 categorías) + cajonera ──┐
        │ red fría · banco · escalera                        puerta BODEGA ▐
 z=-7.5 ├═════════════ MOSTRADOR con vitrina (1,00 m) ══════════╗ media   │
 z=-6.9 │ silla · cartel presión   «Espere aquí su turno»  rack ║ puerta  │
 CONSUL-▌                                                                 │
 TORIO  │ BOTANAS  │ góndola A │  pasillo  │ góndola B │  CUIDADO PERSONAL│
 z=-5.2 │ (pared)  │ galletas /│  central  │ libre vta/│  Y BEBÉ (pared)  │
        │          │ vitaminas │   1,8 m   │ prim. aux.│                  │
 z=-2.6 │          └ OFERTA ───┘           └ 2×1 ──────┘  REFRIGERADOR    │
        │ báscula   tapete  canastillas                     bebidas      │
 z=0    └── [ PUERTA doble ] ─────────── aparador con vinil ─────────────┘
       x=-3.2   -2.5   -1.0                                         x=3.2
```

- **Entrada:** puerta doble de vidrio de 1,5 m que se abre sola al acercarse, con viniles de horario y «ABIERTO». Encima van el cajón de la cortina y el letrero de caja de luz. La cruz de bandera sale en ménsula.
- **Piso de venta:** dos góndolas de 1,40 m que no tapan el mostrador desde la puerta. Los anaqueles de pared miden 2,10 m y llevan frisos de categoría y tira de precios. Hay carteles colgantes por pasillo.
- **Mostrador:** vitrina iluminada con perfumes, rastrillos, termómetros y vitaminas. Encima tiene mampara de acrílico, punto de venta, terminal de tarjetas, dulcero, chicles, gel, timbre y baumanómetro. Al lado hay un exhibidor de botanas y la media puerta de «solo personal».
- **Detrás del mostrador:** anaquel de piso a techo con cajonera y seis categorías (analgésicos, antibióticos, gastro, respiratorio, cardio y pediatría).

## 3. Técnica (mismo contrato que el aeropuerto y el restaurante)

- `engine/Luz25D.js` es una **copia fija** de la luz 2.5D del restaurante. Usa toon de 3 bandas, sombra fría multiplicada y una lámpara por panel del plafón. Se le añadió:
  - `atlas`: el material toma su celda de un atlas por instancia (`aCelda`).
  - `crearMaterialContornoInstancias`: el trazo lleva el color de cada empaque.
- `engine/Productos.js` dibuja por código el atlas de empaques: 9 × 9 celdas y 73 diseños genéricos. Hay unos 3900 productos en solo cuatro InstancedMesh (caja, bolsa, botella y frasco) más su trazo. Las filas de atrás no llevan trazo.
- `engine/Rotulos.js` reúne letreros, viniles y carteles en canvas, sin relighting y teñidos por el ambiente.
- `engine/Casco.js` hace muros, piso encerado, plafón, fachada, calle y vecinos. `engine/Mobiliario.js` hace los muebles y el surtido, con un relleno determinista.
- Hay cuatro ambientes: mañana, mediodía, atardecer y noche. De noche se encienden el letrero, la cruz y las luces de la acera.

## 4. Bucle de auditoría

Cada vuelta capturó todas las vistas del recorrido (y la planta cenital con `__farmacia.fijar`), anotó los defectos, los corrigió y volvió a capturar.

| Vuelta | Hallazgo | Corrección |
| --- | --- | --- |
| 1 | Había 1,25 M de triángulos, y las botellas y frascos de 14 lados eran los que más pesaban. | Se pasó a tornos de 9 lados con perfil simplificado, bolsas con menos subdivisión y 2 filas de fondo. Quedaron 443 k. |
| 1 | Las paredes tenían manchas de estuco que no son de farmacia. | Se cambió a `texturaPintura`: vinílica lisa con grano finísimo. |
| 1 | Los carteles salían con NaN por argumentos invertidos en `poster()`. | Se corrigieron las llamadas. |
| 2 | Algunas cajas y frascos se veían moteados. | Las celdas múltiplo de 9 saltaban de columna por el error de interpolación del varying. La celda ahora se redondea. |
| 2 | El dulcero parecía un cubo blanco opaco. | Ahora es de acrílico real, con vidrio reflectante y los dulces visibles. |
| 2 | Los carteles colgantes se leían en espejo por detrás. | Se hicieron de dos láminas espalda con espalda. |
| 2 | La vista «Vestíbulo» dejaba al jugador atrapado en las canastillas. | Se movieron las canastillas y se cambió la vista. Además, se puede salir si uno empieza rozando un mueble. |
| 3 | Las filas ocultas llevaban trazo. | Ya no lo llevan. Quedaron 339 k triángulos y 137 llamadas. |
| 3 | En el exhibidor de botanas, las charolas atravesaban las bolsas y el cabezal no tenía rótulo. | Se hicieron charolas inclinadas con las bolsas recargadas y el rótulo BOTANAS. |
| 3 | De noche los muros se veían moteados. | La cara interior coincidía con el borde del rectángulo interior. El rectángulo ahora sobresale 10 cm. |
| 3 | El vinil del aparador encimaba las cruces sobre el texto. | El espaciado se calcula con `measureText`. |
| 4 | Con el panel abierto aparecía scroll horizontal, porque el lienzo fijaba su ancho en píxeles. | Se usa `setSize(…, false)` y el lienzo va en posición absoluta. |
| 4 | En el teléfono vertical solo se veía la puerta y no había forma de caminar. | Se conserva el FOV horizontal y hay botones táctiles ▲▼. |
| 4 | Las cabeceras parecían cajas rojas lisas vistas desde el mostrador. | Se les puso rótulo a dos caras. Se añadió también la franja «Espere aquí su turno». |

Resultado final: las ocho vistas se revisaron en los cuatro ambientes, sin errores de consola. También se probó caminar de la calle al mostrador por los tres pasillos con colisión, y el pulsado de objetos, que muestra el nombre.
