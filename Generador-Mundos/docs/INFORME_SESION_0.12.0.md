# Informe de la sesión · Atlas 0.12.0 · 24/10/2026

Fuente vigente: `D:\Español\Generador-Mundos` (puerto 5179). Continúa 0.11.0 sin reiniciar nada. Respaldo previo verificado: `respaldo/versiones/0.11.0-previo-zelda-botw-20261024T222514Z` (240 archivos, SHA-256).

Encargo: rehacer el estilo «Zelda · SpanStories» para que se parezca de verdad a *Breath of the Wild*: sombras, texturas de acuarela, árboles con volumen (no unicolor) y césped como en la pradera `spanstories_grass_v5_5x5.html`, adaptado y muy optimizado. Solo el estilo Zelda; Trigun y los demás estilos no cambian. Después Codex lo copiará al visor de España.

## 1. Qué hice

### Composición Zelda (`render/pipeline.js`, modo 6)

| Antes | Ahora |
|---|---|
| Sombra = albedo × tono casi blanco → todo pálido | Luz de dos tonos con terminador suave; sombra fría y profunda (azul en piedra, verde azulado en vegetación), teñida por el ambiente |
| Pigmento: un seno en espacio mundo (±1,4 %) | Acuarela en espacio mundo: aguadas de 3 m y 14 m, grano del pigmento, temperatura cálida/fría, pincelada diagonal que rompe el borde de la sombra y acumulación de pigmento en el terminador |
| Colores pastel de Trigun | Albedo más saturado y con medios más profundos (no se aplica a copas ni césped) |
| Sin borde luminoso | Borde de silueta cálido al sol y celeste en sombra; translucidez de hojas a contraluz; brillo suave en piedra |
| Oclusión gris | Oclusión de contacto teñida de azul |
| Bruma por distancia desde 35 m | Perspectiva aérea BotW: desde 45 m, más densa a ras de suelo, ligera mirando desde arriba, cálida hacia el sol, con pérdida de contraste |
| Cielo Trigun recoloreado | Cielo pintado: cenit azul intenso, halo del sol, cúmulos con base sombreada |
| Contorno 0,25 hasta 400 m | Casi sin tinta: 0,16 hasta 220 m, oscurecido azulado |
| — | Respuesta de película suave (luces sin quemar) y grano de papel muy leve |

### Árboles (aprobados por el usuario, no tocar)

- `gmaterial.js`: en Zelda las copas usan una **normal de volumen** (elipsoide de la caja de hojas, 72 %) en lugar de la luz aplanada `nl*.45+.35`, de modo que tienen lado iluminado y lado en sombra. Uniforme compartido `foliageVolume` (1 en Zelda, 0 en el resto), así Trigun no cambia.
- `trees.js`: calcula el elipsoide de cada parte de hojas (`crown`).
- Composición: como el visor de Barcelona (`objetos/TreeAppearance.js`, `UrbanTrees.js`), la textura de la hoja aporta solo el valor y el color sale de **una de las cuatro paletas oliva del comparador**, elegida por árbol y variada por zona de la copa. Las copas no verdes (sakura, otoño) conservan su tono. Umbral de luz +0,22 en follaje para que la parte baja quede en sombra.

### Césped 3D Zelda (`render/grass.js`, nuevo)

Adaptado de `Ambiente/vegetacion/Arboles/spanstories_grass_v5_5x5.html`: matas de cintas opacas que se afinan hacia la punta, color de raíz a punta horneado (raíz `#2e5524`, medio `#6f9e35`, punta `#c4d266`), sin texturas ni transparencia, inclinación de «viento» fija por zonas.

- **Un único draw call** sin actualizar buffers: anillo fijo de 5721 celdas de 0,48 m (radio 20 m) que sigue a la cámara. Posición, giro, tamaño y color de cada mata salen del hash de su celda del mundo, así no «nadan» al moverse.
- **Solo donde el suelo es césped** (`SURF.grass`: parques, prados, campos): máscara cenital de 2048² (RG16F, 16 MB) horneada una vez por lugar desde la propia escena, descartando todo lo que no es césped (árboles y tejados no tapan). Guarda máscara y altura.
- Las matas fuera de césped, detrás de la cámara o descartadas por distancia salen del recorte en el vertex shader (no rasterizan). Menos densidad y altura hacia el borde del anillo; se oculta si la cámara sube más de 18 m sobre el terreno.
- Escribe el mismo G-buffer (superficie 23): recibe sombras, AO y bruma; para las líneas cuenta como follaje. Bajo el anillo el césped plano se oscurece como sombra de raíz.
- El césped plano lejano también cambió: paleta BotW con macollas oscuras y hebras cruzadas.

## 2. Verificación

- 78 pruebas y compilación aprobadas.
- Capturas en `reports/estudio/` (Acueducto de Segovia, 800 m): `zelda-v4-arbol*.png`, `zelda-v7-parque.png`, `zelda-v10-prado*.png`, `zelda-v5-amplia.png`; control Trigun `trigun-control-0.12.png` (sin cambios, césped 3D oculto).
- Rendimiento (Segovia 800 m, de pie en un prado, 1010×813 a DPR del equipo): sin césped 10,7 ms; con césped 12,5 ms (+1,8 ms, +137 k triángulos, +1 llamada). La primera versión (7 hojas, 24 m) costaba +5,5 ms y se redujo.

## 3. Pendiente real

- El viento del césped es fijo: el visor solo redibuja al moverse; animarlo exigiría redibujar siempre.
- Borde de la máscara a 0,48 m/píxel: en algún bordillo puede asomar una hoja.
- La copia al visor de España (`SpanStories-Ciudades/engine/Estilos/Zelda`) la hará Codex; las fórmulas están en el modo 6 de `pipeline.js`, `gmaterial.js` (normal de copa) y `grass.js`.
