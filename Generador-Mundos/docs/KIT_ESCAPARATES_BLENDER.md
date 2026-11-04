# Kit modular de escaparates (Blender → GLB) · 0.17.0

Piezas de escaparate modeladas en Blender, listas para que el generador procedural las ensamble por vano: **fachada** (marcos, cierre hundido, puertas, rótulos, toldos, persianas, carteles) e **interiores con volumen** (pieles de suelo/pared/techo y utilería con carácter por categoría). Las dimensiones del vano y de la caja son el límite; lo de dentro es diseño propio, sin marcas ni logotipos. La caja y las capas pintadas siguen disponibles en modo `interior:'plano'`.

- Fuente única: `scripts/blender/construir_kit_escaparate.py` (se ejecuta con Blender sin interfaz, `--factory-startup`).
- `.blend` único: `blender/kit-escaparates.blend` (objetos de salida en `MODULOS`, muestrario en `MUESTRARIO`; sin copias `.blend1`).
- Salida: `public/assets/kits-escaparate/kit-escaparate.glb` (189 KB, sin texturas) + `kit.json` (manifiesto, SHA-256 y bytes).
- Reconstruir: `npm run kit:escaparate` (variable `BLENDER` si no está en `D:\Blender 5.2\blender.exe`; `-- --sin-render` omite las hojas de muestrario). Luego `node --test tests/estudio-blender-kit.test.js`.
- Código: `src/estudio/render/commerce-blender-kit-assembly.js` (colocación pura, sin three) y `commerce-blender-kit.js` (carga y construcción con three).
- Banco visual: `http://127.0.0.1:5179/reports/estudio/0.17.0/kit-escaparates.html` (8 kits ensamblados, oblicua/lateral/persianas). Hojas de Blender: `reports/estudio/0.17.0/kit-escaparate/`.

## Medidas (tomadas del código y de `PROMPT_CODEX_escaparates_comercios.md`)

| Medida | Valor |
|---|---|
| Vano nominal / alto | 3,6 m / 3,0 m (se ensambla a cualquier ancho ≥ 1,3 m) |
| Cierre hundido (norma 2.2.8) | 0,25 m: vidrio y marco a z = −0,25; jambas, dintel y alféizar del hueco incluidos |
| Caja somera | 1,4 m nominal, 1,0–1,8 m admitido, desde el vidrio; se acota por la huella |
| Capas | 3, a 0,22 / 0,50 / 0,78 de la profundidad (≈ 0,3 / 0,7 / 1,0 m) |
| Zócalo / puerta / rótulo | 0,50 m · 1,10×2,30 m (doble 1,80; metálica 1,00×2,10) · 0,55 m |
| Toldo | 12 franjas por ancho (0,30 m a 3,6 m); vuelo 1,0–1,7 m; no baja de 1,95 m |

Ejes como `elements.js`: X a lo largo, Y arriba, +Z a la calle; origen centro inferior del hueco sobre el muro.

## Contrato

- **Escalado**: cada módulo declara `estira` (`x`, `y`, `xy`, `xyz` o `fijo`). Los barridos (marcos, zócalos, cornisas, toldos) solo se escalan a lo largo de su eje; su perfil no se deforma. **Nunca escala negativa**: hay módulos `_izq`/`_der` o UV espejada.
- **Materiales** `ss_*` con `ss_rol` en extras: `marco` (tinte 1), `piedra` (tinte 2), `metal`, `vidrio_escaparate` (BLEND), `luz_interior` / `letrero_luminoso` (MASK + emisivo), `persiana`, `toldo` (rayas a/b), `vinilo`. El GLB se basta solo; el adaptador del visor solo modula.
- **Ranuras de atlas** (`ss_slot`): las piezas con UV 0-1 por cara (caja, capas, rótulos, persiana, vinilos) declaran `tile.fondo`, `tile.capa`, `tira.suelo/techo/lateral/persiana`, `rotulo.celda/estado/lema`. Quien integre pasa `resolverSlot(slot, colocacion) → {esquinas, mapa}` con la celda del atlas **vigente**; el kit no depende de cómo se empaquete.
- **UV**: v sigue la convención glTF; `remapearUV` la invierte antes de aplicar las esquinas de `tileUV`.

## Módulos (64 · 1 714 triángulos en total)

| Familia | Módulos |
|---|---|
| Marcos (aluminio, madera, forja, piedra × jamba, dintel, montante, travesaño) + clave de piedra | 17 |
| Hueco remetido (jamba izq./der., dintel, alféizar) | 4 |
| Zócalos: liso, panel, piedra, bisel | 4 |
| Puertas: cristal, madera+vidrio, doble, metálica ciega | 4 |
| Vidrio (paño) | 1 |
| Rótulos: fascia, cajón · Cornisas: simple, dentada | 4 |
| Banderas: cuadrada, círculo, cartela, cruz luminosa | 4 |
| Toldos: recto, capota, cofre, festoneado, marquesina | 5 |
| Persiana: panel, cajón, guía | 3 |
| Cajas: recta, biselada, fondo curvo, alcoba central, cenefa con franja de luz | 5 |
| Capas: plana, curva, quebrada, con pie · Hornacinas: lisa, con baldas | 6 |
| Vinilos: cartel, estado, esquina, banda esmerilada · Umbral, alféizar, rejilla | 7 |

Ocho **kits** (preajustes de gramática) combinan módulos por categoría y perfil: clásico de piedra, madera de barrio, moderno de aluminio, escaparate ancho, latam con cortina, farmacia con cruz, café con toldo de cofre, mercado con hornacinas. `elegirKit` es estable por semilla; `ensamblar` también (misma semilla = mismo vano).

## Qué mejora respecto a las capas planas

- Capas **curvas / quebradas / con pie**: no se leen como cartulinas y el borde no se ve en oblicuo.
- Cajas **biseladas, de fondo curvo y con alcoba**: sin costura dura en el rincón; la cenefa con franja de luz tapa la unión techo/vidrio.
- **Hornacinas con baldas de obra**: paralaje real entre baldas sin mobiliario suelto.
- Cierre **hundido** con jambas visibles (norma 2.2.8), umbral, alféizar y recercados de piedra.
- Estado **cerrado**: cajón + guías + panel de persiana, no un quad pegado al vidrio.

## Medidas del banco (ensamblado real, 8 kits)

226–526 triángulos por vano completo (marcos, puerta, rótulo, toldo, caja y tres capas); la caja + capas aportan 30–70 de esos. Con 400 vanos de muestra: ≥ 60 combinaciones de módulos distintas y ≥ 45 módulos usados. **No hay medida de FPS ni de bytes por sector todavía.**

## Interiores con volumen (88 piezas, `kit-interior.glb`)

Color de vértice (`ss_in`, doble cara) y materiales emisivos para luces, brasas y pantallas; sin atlas ni texturas. El visitante siempre mira desde +Z, así que se omiten las caras traseras y las inferiores bajo 1 m.

- **Pieles** (suelo ×8, fondo ×8, techo ×4): damero, hidráulico, tablones, terrazo, baldosa roja; azulejo metro, ladrillo, listones, empapelado, dado de madera, sillar, pintura petróleo; vigas, casetones, chapa estampada. Las paredes laterales reutilizan el fondo girado ±90°.
- **Utilería** (76): horno de ladrillo con brasas y pala, cajonera de botica, jamones y chorizos colgados, escalera de biblioteca, silla y poste de barbero, expositor de gafas, pared de pantallas, frutas en cajones escalonados, barra de café con cafetera y taburetes, vitrinas (bollería, carnicería, queso, dulces), estanterías con contenido (pan, libros, botellas, cajas, ropa plegada, zapatos, frascos), perchero con prendas, maniquíes, lámparas (cúpula, globo, industrial, canasta, gota), pizarras, espejos, cuadros…
- **Recetas** (`commerce-blender-interior-assembly.js`): una por cada una de las 17 categorías, con alternativas por semilla (suelo/pared/techo, estanterías `a/b`, espejado). Reglas: nada sale de la caja; pasillo libre de 0,85 m frente a la puerta; sin solapes entre piezas libres (rejilla de 10 cm); mostradores y bancos se estrechan hasta un 62 % si no caben.
- **Presupuesto medido**: piezas de 100–1 100 triángulos; interior completo de un local 3 400–6 400. Es más de lo que pedía el relevo (≈80): hace falta un LOD (el interior solo cerca, como capa de detalle por sector) y compresión Meshopt del GLB (2,8 MB sin comprimir) antes de usarlo en una ciudad entera.

## Integración vigente: dos alternativas sin mezclar diseños

Conectado a `commerce-scene.js` mediante `commerce-blender-scene.js`, compartido por taller y generador. El selector «Diseño de los comercios» elige Claude pintado o Blender en volumen. Las recetas, módulos, colores y materiales originales se conservan; el kit Blender no utiliza las capas del interior pintado. Los rótulos usan únicamente el servicio existente de texto.

Instancias por módulo/material, utilería con LOD a 24 m y pieles completas a cualquier distancia. Meshopt derivado en `kit-interior.meshopt.glb` (1 276 144 bytes; fuente sin comprimir 2 585 484). `node scripts/preparar-kit-comercios.mjs` prepara los derivados sin alterar los GLB originales. El `.blend` permanece sin editar.

Pruebas: 145/145, incluidos montaje idéntico al ensamblador original, buffers/materiales, exclusión de diseños, LOD, persistencia y exportación glTF con IDs y Meshopt. Integración ejecutada en la ciudad procedural de Barcelona. La revisión visual completa, el rendimiento en ciudades grandes y la paridad real con el visor siguen pendientes; no se ha enviado una nueva exportación. Ver [INFORME_SESION_0.17.0.md](INFORME_SESION_0.17.0.md).

### Lista histórica previa a la conexión

1. Conectar con `commerce-scene.js` y el atlas vigente: el taller tiene ahora un `commerce-kit.js` pintado en canvas que otro agente editaba a la vez; este kit usa `resolverSlot` para no pisarlo.
2. Instanciar por módulo en el generador (hoy `construirApertura` crea una malla por pieza): una `InstancedMesh` por (módulo, material) y, si el presupuesto de llamadas lo exige, fundir por sector con la ruta `bakeRare`.
3. Exportación por prefabs con `instanceEntityIds` y roles `ss_rol` en el paquete; paridad con el visor.
4. Elegir el kit desde `commerces.js` (categoría, perfil, semilla) y fijar el criterio de variedad frente al tope de 60 variantes.
5. Hojas `_izq`/`_der` de puertas y banderas si se quiere el tirador espejado.
