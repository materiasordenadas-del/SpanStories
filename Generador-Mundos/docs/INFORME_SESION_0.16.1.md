# Atlas 0.16.1 · Correcciones de generación y exteriores

26/10/2026. Fuente única: `D:\Español\Generador-Mundos`.

## Alcance y resultado

Se investigaron fallos reproducibles de interpretación geográfica, colocación y reconstrucción. El usuario mantuvo la activación manual de interiores y posteriormente centró expresamente el trabajo en exteriores. No se habilitó generación automática de interiores. Se conservan los estilos, modelos de árboles, shaders, cámaras y el visor principal de SpanStories.

## Correcciones exteriores

1. Partes de edificios asociadas por superficie compartida, no por un centroide que puede caer en un patio. La cobertura es la unión de las partes: dos volúmenes superpuestos no suman dos veces el mismo suelo ni hacen desaparecer el cuerpo restante.
2. `building:part=no` no crea un edificio. Un elemento con `building` y `building:part` afirmativos se interpreta como parte, evitando duplicar el contorno junto a sus componentes. El área descuenta los patios.
3. Los edificios que cruzan el borde se conservan completos aunque su centro quede fuera. No se crea una fachada ficticia sobre el límite de selección.
4. El relleno inferido comprueba la intersección poligonal exacta antes de aceptar cada parcela; la rejilla de ocupación ya no es su única protección frente a superposiciones.
5. Túneles y vías cubiertas permanecen en los datos. Los túneles no originan calzadas, escaleras, fachadas orientadas a calles subterráneas ni arbolado de superficie. Su representación aproximada sigue siendo optativa.
6. La superficie de calzada se recorta ante edificios ocupados de planta baja; las marcas también se recortan por su contorno completo. Se conserva el eje y se informa del conflicto, sin inventar por dónde debería pasar la calle. Los volúmenes elevados y las marquesinas no se tratan como un bloque macizo en el suelo.
7. Agua, parques y otras áreas se unen con anillos y huecos orientados correctamente, incluso cuando otra zona ocupa el hueco de una primera.
8. Árboles registrados y generados: comprobaciones de calzadas, vías de servicio, agua, canchas y distancia exacta a fachadas. Un punto fuente contradictorio no se mueve ni borra: se conserva, se omite su representación y se registra el motivo. La vegetación inferida evita superficies incompatibles.
9. Los márgenes de colocación pertenecen al borde del mundo, no al borde de cada sector. Los árboles situados sobre una costura o cerca de ella conservan un único propietario y no desaparecen al activar streaming.
10. El entorno lejano excluye edificios que invaden la zona detallada o duplican sus huellas, y conserva huecos de agua, parques y edificios. La transición usa el terreno efectivo filtrado/local, actualizándose cuando cambia el relieve o las huellas.
11. El proveedor lejano envuelve las coordenadas de teselas al atravesar ±180°, valida la longitud y aplica de verdad la caducidad binaria. Las consultas simultáneas de una misma tesela comparten solicitud; temporales únicos evitan errores de renombrado y cachés incompletas.
12. Overpass valida contenido antes de cachear y antes de dar por bueno un proveedor. Respuestas HTTP 200 incompletas o JSON inválido pasan al espejo; entradas antiguas inválidas se vuelven a solicitar.
13. Medidas: conversión de m/cm/mm/km y pies/pulgadas, sin aceptar como medida única valores ambiguos como `12;15` o `3-5`. Las geometrías con coordenadas/anillos incompletos generan aviso, en lugar de inventar tramos o rellenar un patio ausente.

## Correcciones interiores previas al cambio de prioridad

Se mantuvo el control manual existente. Se corrigieron colisión del dintel, salto/cámara contra techo, cara interior del dintel y remapeo de IDs de superficies interiores en sectores. La prueba de ejecución permitió entrar y caminar; altura máxima de cabeza 2,26 m con techo a 2,38 m. No se añadieron plantas, mobiliario ni nuevos diseños interiores.

## Verificación realizada

- `npm test`: **115/115**, sin fallos. Se añadieron 20 pruebas de regresión y se observaron fallar antes de corregir sus casos. Archivos: `tests/estudio-generation-regression.test.js` y `tests/estudio-placement-regression.test.js`.
- `npm run build`: aprobado, 118 módulos. Permanece el aviso informativo de Vite sobre paquetes superiores a 500 kB; no es un fallo de compilación.
- `node scripts/verify-generation-fixes.mjs`: fuentes guardadas de Madrid y Buenos Aires, sin nuevas consultas. Madrid: 880 → 923 entidades; Buenos Aires: 36 → 47. El incremento incluye edificios antes omitidos en bordes y una interpretación corregida de partes; no significa más exactitud certificada. Las 876 y 36 huellas respectivamente comunes a ambas reconstrucciones se conservaron exactamente. Fuente JSON original sin mutación.
- Tres tradiciones escolares: arquitectura e instancias idénticas por SHA-256 al respaldo previo. Siete archivos de render/estilos sin cambios, también comprobados por SHA-256.
- Arequipa, consulta real de 200 × 200 m, centro −16,3989 / −71,53696: 167 elementos fuente, **57 edificios, 35 vías, 16.641 muestras de relieve**, escena reconstruida y revisada visualmente. 26 alturas continuaban estimadas. Este ensayo comprueba generación y ejecución; no certifica correspondencia arquitectónica de cada fachada ni exactitud del DEM.
- Exportación exterior controlada: `exportaciones/ensayo-controlado-datos-sinte-ticos-20261026110508390-e9cbde6b/`. **17 GLB**, 16 con Meshopt; 26 archivos del manifiesto, 15.634.059 bytes. 132 entidades declaradas, 130 con geometría; los 4 edificios tienen geometría. 51 texturas embebidas, ningún recurso pendiente. Hashes y todos los GLB decodificados con `scripts/verificar-paquete.mjs`.
- Receptor de Atlas: reapertura real de **17/17 sectores**. El proyecto exportado también se decodificó y validó. No se instaló ni publicó nada en el visor principal.
- Pruebas de navegador con `autoguardado=0`; no se sustituyó la recuperación local del usuario. El primer arranque restringido no pudo escribir la exportación por permisos del entorno; se repitió con permisos sobre la carpeta autorizada y el paquete final quedó verificado.

## Evidencias

`reports/estudio/0.16.1/`: `regresion-offline.json`, `exportacion-verificada.json`, proyectos de control y de fuentes guardadas, `arequipa-en-vivo.json`, capturas `arequipa-exterior-ui.png`, `control-exterior-ui.png` y `control-interior-ui.png`.

Los resultados de clases escolares y archivos de estilo se pueden reproducir con `node scripts/verify-generation-fixes.mjs`. Para otra base, el primer argumento admite la ruta del respaldo anterior.

Respaldo previo verificado: `respaldo/versiones/0.16.0-previo-correcciones-geometria-20261026T032758Z`. La entrega se respalda con la etiqueta `0.16.1-correcciones-exteriores`, sin sobrescribir históricos.

## Límites que permanecen

No se certifica la reconstrucción precisa de cualquier lugar. Las huellas independientes que ya se contradicen en la fuente pueden requerir corrección local. Recortar una calle ante un edificio elimina una interpenetración visible, pero no identifica cuál de los dos registros está mal ni resuelve el trazado real. Patios, alturas, puentes, pasos cubiertos complejos y vegetación dependen de datos disponibles; no se añadió reconstrucción por fotos, catastro, LiDAR o planos. Las copas procedurales conservan su diseño y pueden acercarse a obstáculos aunque el tronco tenga sitio válido.

La continuidad del fondo respeta el DEM efectivo; no convierte un DEM de proveedor en levantamiento exacto. El modo por sectores mantiene sus presupuestos y límite de 2 km. La fidelidad de un monumento necesita una referencia/modelo específico. Ver `docs/LIMITACIONES.md` para los demás límites del proyecto.
