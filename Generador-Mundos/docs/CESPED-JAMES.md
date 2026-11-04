# Césped de James Smyth · integración en Atlas

La entrada existente `src/estudio/render/grass.js` conserva `GrassField`. No hay otra escena ni proyecto. `grass-geometry.js` adapta directamente `generateBlade` de James Smyth: cinco vértices y los mismos tres triángulos por hoja. Se reutilizan sus texturas originales `grass.jpg` y `cloud.jpg` y la onda con amplitud distinta en media hoja y punta. Licencia original en `public/grass-james/LICENSE`.

Christian Ortiz inspira las ráfagas con fase espacial, la distribución determinista y el material opaco. AssetScattering aporta exclusivamente el principio de sectores, instancing y trabajo de actualización limitado por frame. No se utilizan su geometría, shaders de césped, estética, movimiento, audio ni Babylon.js.

Los estilos usan la misma geometría, altura, semilla y distribución. El pase de estilo existente decide la iluminación final. Solo cambia el césped y su integración con las superficies verdes. Alcance inicial aprobado por el usuario: 20 m de detalle y 50 m de cobertura, transición de 5 m.

- LOD 0: hojas de James; distancia elegible de 10/20/30/40/50 m. LOD 1: un triángulo por mata, densidad ajustable y cobertura hasta 100 m. La banda de transición comparte únicamente la representación dispersa para suavizar el cambio. Después del radio de cobertura elegido: cero instancias y solo material del terreno. Los valores originales de 10/20 m siguen disponibles.
- Dos batches, atributos compactos de cuatro floats por mata, sin matrices individuales. Frustum por sectores con límites ampliados para viento. Los buffers se conservan; se actualiza su contenido al cambiar la selección espacial. La animación solo actualiza uniforms.
- Sectores de 4 m con semilla global, pool y generación limitada a dos sectores/frame de forma predeterminada. Se conservan los sectores del radio anterior que sigan siendo útiles. No se reconstruye el campo entero al caminar.
- Máscara cenital de las superficies ya construidas, altura de 16 bits y exclusión de pavimento/agua/edificios. Se hornea al cambiar el contenido, nunca por el viento. Resolución 2048²: su precisión horizontal depende del tamaño del área. CPU y GPU conservan 16 MiB cada una para máscara/alturas; las cifras del panel son estimaciones de buffers, no memoria total del navegador.
- Altura 2 cm–2 m, accesos Ciudad (12 cm) / Bosque (80 cm). Los cambios de altura, color y viento no regeneran posiciones ni geometría. Configuraciones JSON con validación y versiones, exportables/importables desde el panel actual.
- Calidad Bajo/Medio/Alto/Ultra/Personalizado, presupuestos de instancias/triángulos, interacción optativa y sombras proyectadas desactivadas inicialmente. Calidad automática opcional con media temporal, histéresis y descenso gradual de densidad.
- La densidad solicitada tiene deslizador directo. Para radios amplios se reparte el presupuesto por todo el área visible, dando prioridad perceptual a los primeros 10 m; no se consume todo en los primeros sectores dejando los siguientes vacíos. La densidad efectiva depende también de máscara, agrupación, distancia y presupuestos.
- Comparación con/sin césped sobre la misma escena/cámara, mediana de siete pares de render completos sincronizados mediante lectura GPU. Informa milisegundos, porcentaje y diferencias de draw calls/triángulos. Son FPS equivalentes de render, no una medición del bucle completo del juego. El tiempo puede fluctuar según la carga del equipo.
- Los ajustes también viajan dentro de Guardar proyecto/Abrir proyecto y el autosalvado existente, cuando está activado. No se añaden coordenadas ni excepciones específicas de ciudades.
- FPS/frame/CPU y contadores reales del renderer separados de estimaciones de memoria. El cronómetro GPU usa EXT_disjoint_timer_query_webgl2 cuando existe. No se presenta el tiempo CPU de envío como tiempo GPU. Los triángulos son enviados, no píxeles visibles; no hay medición de overdraw.

Desde 0.13.0 el aspecto sigue la demo web (no el ZIP): ver INFORME_SESION_0.13.0.md.

Verificación: `node --test tests/estudio-grass.test.js`, `npm test`, `npm run build`; comprobación visual en el lugar real servido en 5179. Las pruebas técnicas no constituyen aprobación estética del usuario.
