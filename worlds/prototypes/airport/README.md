# Aeropuerto SpanStories — prototipo caminable

> **⚠ Regla maestra de estilo** (guardada en [`ESTILO.md`](ESTILO.md)): la proximidad define
> la técnica — lo cercano y principal va en 3D o en ilusión 2.5D (capas 2D con parallax +
> shading horneado, como los arbustos); lo lejano va en 2D plano. Por ahora **sin personas ni carros**.
>
> **Versión 2 (v2.0.0) — versión vigente del proyecto.** Ya no es una «copia»: nació el
> 2026-09-23 de una copia de trabajo y fue promovida a v2 el 2026-09-24 tras auditarla contra la
> v1 (`D:\Español\imagen para animación\Aeropuerto`, visualmente obsoleta y conservada intacta
> como referencia histórica; no contiene ningún archivo que falte aquí). Self-contained;
> Three.js r180 vendado en `vendor/`.
> Servidor: `python serve.py [--port N]` o `npm run dev` → `http://127.0.0.1:<puerto>/Aeropuerto/`
> (la URL siempre usa `/Aeropuerto/`, aunque la carpeta se llame `Aeropuerto_v2`).
> Cambios respecto a la v1 (el texto de abajo dice «original» = v1): zona **D01 · Facturación** — piso diseñado (una textura
> canvas horneada: baldosas, alfombras de cola, guías y flechas) y fila de **ATM 2.5D** contra la
> pared oeste (cuerpo extruido de 14 cm + frente ilustrado horneado + rótulo «CHECK-IN AUTOMÁTICO») —
> y zona **D00 · Entrada**: forecourt exterior (`engine/ExteriorIllusion.js`) con acera de baldosas,
> paso de cebra, banda de calle, bolardos, jardineras, tótems directorio/promo mirando a la calle y
> vegetación **billboard 2.5D** (palmeras y arbustos por capas — copa trasera/tronco/copa delantera con
> offsets en Z para parallax —, shading y AO horneados en canvas, `alphaTest:.5` y sombra elíptica
> independiente en el suelo), siguiendo la regla de estilo SpanStories (arquitectura 3D, objetos
> secundarios 2.5D, nada de geometría vegetal densa). Nombre gemelo «ENTRADA» añadido en el shell de
> D00 para ocultar el dorso espejado del letrero visto desde dentro. Rediseño visual v2 de la entrada:
> cristal de fachada con reflejos y montantes horneados + resplandor cálido interior, aleros de
> marquesina con focos empotrados y claros de luz en el pavimento, aleros laterales de cristal
> reflectante, nubes 2D planas de fondo, bolardos de metal con banda ámbar, jardineras de hormigón
> con canto, y vegetación 2.5D redibujada (frondas con folíolos y masas de hojas orgánicas).
> Rótulo interior «ENTRADA» redundante eliminado (su dorso espejado se leía desde la calle).
> El taxi animado no se muestra en D00 (guía de estilo: sin carros por ahora).
> Nubes del cielo: assets toon generados por IA (`assets/clouds/cloud-a.png`, `cloud-b.png`),
> planos 2D lejanos con sombreado de 3 tonos que las hace leer volumétricas.
> Vegetación de la entrada: assets toon generados por IA (`assets/entrance-palm-toon.png`,
> `entrance-bush-toon.png`) como billboards recortados.
> Base de la palmera (D00): la antigua losa plana se convirtió en **jardinera real** — paredes
> laterales + borde superior ligeramente sobresaliente, superficie de **tierra oscura horneada en
> canvas** (`drawSoil`) unos centímetros por debajo del borde, tronco del GLB hundido en la tierra
> (la geometría de tierra tapa físicamente el corte inferior del tronco), blob de AO en la unión
> tronco–tierra y sombra de contacto jardinera–piso. Jerarquía visual: tronco → tierra → borde →
> paredes → piso.
> **Objetos movibles desde el visor**: todo lo del forecourt está etiquetado `userData.movable` —
> cada palmera y cada base de palmera son entidades **independientes** (clic en el árbol = solo el
> árbol; clic en la jardinera = solo la base; las sombras AO de la palmera la siguen como
> `followers`), además de jardineras con arbustos, arbustos sueltos, tótems, bolardos, nubes,
> árboles lejanos 2D y el fondo de cielo. **Clic derecho** selecciona (caja ámbar de referencia),
> **flechas** mueven en el plano del suelo respecto a la cámara, **PageUp/PageDown** ajustan la
> altura, **Shift** paso fino, **Esc** suelta. La colisión asociada se traslada con el objeto.
> **Persistencia automática**: cada ajuste se guarda solo en `localStorage`
> (`aeropuerto.movable-positions.v1`, clave `etiqueta#índice` en el recorrido de la escena) y se
> restaura al recargar y al entrar en la zona. Para volver al diseño original: borrar esa clave.
> Implementado en `lab.js`; el script lleva `?v=` para invalidar la caché del módulo.
> Árboles del jardín del pórtico (D00): se **generan proceduralmente** con
> `../generar-arboles.py` en el mismo lenguaje del arte de referencia del usuario
> (copas de racimos esculpidos tipo coliflor, 3 tonos de verde, tronco marrón con
> ramas visibles entre el follaje). El script pinta un **atlas de 3 celdas por
> variante** (`assets/trees/tree-1..3-layers.png`): fondo oscuro completo / masas
> medias con copetes claros / acentos de luz delanteros. Cada racimo pertenece
> **entero a una capa**, así no hay cortes ni artefactos entre capas (el recorte
> por luminancia de los PNG pintados troceaba racimos y se notaba). `engine/PorticoGarden.js`
> apila las 3 celdas en Z (paralaje real al moverse), con sombra de contacto,
> seguimiento parcial de cámara y vaivén sutil. Se usan 3 variantes reutilizadas con distinta
> altura y espejado. Siguen siendo seleccionables y movibles con clic derecho + flechas.
> **Pórtico izquierdo y jardín (D00)**: el pórtico se prolonga hacia el oeste (x −22 → −6, 10 columnas
> cuadradas de 0,44 m, techo con focos empotrados) sobre un **jardín solo visual** (`engine/PorticoGarden.js`;
> el jugador no puede entrar: el límite caminable sigue en el borde oeste del hall). Césped horneado,
> arbustos al fondo del pórtico, línea de horizonte 2D plana (norte y oeste) y 10 **árboles 2D en capas**
> (copa trasera oscura / tronco + masas medias / masas iluminadas delante, separadas en profundidad): al
> caminar las capas se desplazan entre sí (paralaje) y el árbol se lee como volumen. Cada árbol gira solo
> parcialmente hacia la cámara, se mece muy poco y usa un draw call. Son movibles («árbol del jardín»).
> **Luz y estilo (2026-09-23)**: `engine/Luz25D.js` porta la luz 2.5D del aula. Todo el decorado de D00/D01
> (cajas del kit, acera, calle, césped, piso de D01, bolardos, arbustos y palmera) usa albedo neutro + luz toon
> compartida: sombra fría multiplicada, 3 bandas en los volúmenes, interior/exterior por posición, lámparas en
> bandas y 5 ambientes (panel «Luz y estilo» o `?amb=`). Hay contorno cartoon por casco invertido con jerarquía,
> y las sombras del sol multiplican la acera. Las reglas están en `ESTILO.md` §3. Con `?dev`, el visor expone
> `window.__airport`. Respaldo previo: `../respaldo-antes-luz-20260923/`.
> **Fachada con más resolución arquitectónica (2026-09-23)**: el techo de todas las salas sube de 5 a 7,5 m
> (`DIMENSIONS.ceiling`; Luz25D decide interior/exterior con esa altura). En D00 hay un ventanal alto (5 → 7,5 m)
> con montantes y travesaños 3D. La marquesina baja a 7,2 m (`CANOPY_SOFFIT` en `routes.js`) y lleva losa gris con
> juntas, fascia azul marino, plafón con paneles y 5 focos 3D (aro metálico, lente y centro emisivos). Los pilares
> principales llegan a la marquesina. Los letreros son cajas con marco, tapas metálicas y cara ilustrada con avión
> vectorial. La entrada tiene jambas y dintel, y el ala derecha tiene revestimiento modular hasta 7,2 m. El pórtico
> conserva su altura, y las palmeras pasan a escala 6,4. Respaldo previo: `../respaldo-antes-fachada-20260923/`.
> Vistas nuevas en la página de verificación: `shot=8` (fachada completa) y `shot=9` (ventanal visto desde dentro),
> o `&cam=x,y,z,lx,ly,lz`.
> **Acera, calle y pórtico según la referencia (2026-09-23)**: la acera es de losas de hormigón gris claro de 1 m
> y termina en un bordillo de piedra con juntas. La calzada queda 14 cm más abajo (`STREET` en `routes.js`), tiene dos
> carriles, asfalto con árido y línea central discontinua blanca, y el paso de cebra la cruza de bordillo a bordillo. Hay
> pavimento táctil ocre frente a las puertas, bolardos-farola oscuros con ventana de luz y dos postes en el acceso. Se quitaron
> el tapete exterior y la franja oscura sobrante. El piso del vestíbulo es un damero crema y blanco. El pórtico lleva pilares
> de lámina (0,3 × 0,9 m), un alero más grueso (faja azul marino y remate gris con juntas), dos filas de focos al tresbolillo
> (`PORTICO_BACK_SPOTS`, `PORTICO_ROWS`) y un seto casi continuo detrás. Respaldo previo: `../respaldo-antes-acera-portico-20260923/`.
> Página de verificación: `dev/preview-d01.html?zone=D00|D01&shot=N[&amb=noche]` (D00: `6` pórtico, `7` vista aérea). Tests: `node --test tests/*.test.js` (19/19).

El visor actual abre en primera persona, a 1,62 m, con FOV de 52°. Incluye el recorrido completo de salidas y llegadas, mobiliario procedural, portales, colisiones básicas, streaming de una zona HIGH y fondos exteriores 2D/2.5D a distintas profundidades. El ventanal de D05 sugiere una pista sin construirla como geometría. Los vehículos exteriores son sprites planos; no se ha incorporado ningún avión ni NPC 3D. El avión del usuario se integrará cuando lo entregue.

Los apartados históricos de abajo documentan la primera entrega técnica y sus mediciones; sus referencias a cámara orbital, slice parcial y carga de Samuel ya no describen el visor actual. Para medir el estado actual, usar el panel «Diagnóstico y mediciones» del visor y exportar un JSON nuevo.

## Ejecutar

En PowerShell:

```powershell
Set-Location -LiteralPath 'D:\Español\imagen para animación\Aeropuerto_v2'
python serve.py
```

Abrir <http://127.0.0.1:8766/Aeropuerto/> (o `?dev`). El servidor solo escucha en localhost y solo sirve esta carpeta (Three.js va vendado en `vendor/`). No instala dependencias. Para detenerlo, Ctrl+C.

Pruebas: `node --test tests/*.test.js` desde esta carpeta.

### Mapa de carpetas (v1, v2 y respaldos)

| Carpeta | Qué es |
|---|---|
| `Aeropuerto_v2\` (esta) | **Versión vigente.** Aquí se trabaja. |
| `Aeropuerto\` | v1, visualmente obsoleta. Solo referencia histórica; no editar. |
| `Aeropuerto_v2_respaldos\` | Respaldos `respaldo-antes-*-20260923`, capturas `shots/` y `.bak` sueltos (`bak-sueltos/`) del desarrollo de la v2. |
| Copia de Kimi (`Documents\kimi\tasks\...\Aeropuerto`) | Origen de la v2; obsoleta, no editar. |

El puerto **7100** sirve esta carpeta (entrada `aeropuerto` de `Animación 3D\.claude\launch.json`).
| `herramientas\` | Scripts de los árboles del jardín (`generar-arboles.py`, `recortar-arboles.py`); escriben en `assets/trees/`. |

## Alcance y aislamiento

- Three.js **r180**, vendado en `vendor/` (copia idéntica a `Animación 3D/samuel-face/vendor/`); sin CDN ni actualización.
- No se modifican `SpanStories`, el visor facial, el aula, el GLB ni la especificación original.
- No había motor de aeropuerto que refactorizar. Se creó una base modular con adaptadores, sin sustituir sistemas existentes.
- El laboratorio es una herramienta de ingeniería con cámara orbital y botones de transición, no el controlador caminable final.
- Sol debe continuar sobre este motor y completar primero D01 → D02 → D04 → D05; no construir todas las zonas antes de validar el slice real.

## Arquitectura implementada

| Módulo | Responsabilidad |
| --- | --- |
| `engine/ZoneManager.js` | Ruta, estados, cola de transiciones, preparación HIGH, ventana de tres chunks, rollback de carga/preparación y descarga |
| `engine/AssetRegistry.js` | Una carga por clave, leases, cancelación del último consumidor, scopes de recursos/listeners/mixers |
| `engine/GLBAssetSource.js` | Fetch de GLB autocontenido, errores HTTP, timeout de red, aborto, parseo, recursos compartidos; loader configurable |
| `engine/AirportWorld.js` | Un mundo a la vez; libera el anterior antes de crear el siguiente; admite una fábrica de chunks propia |
| `engine/AirportChunk.js` | Shell procedural, detalle instanciado, preparación de shaders, colliders simples, lista de interacción, LOD de prueba |
| `engine/PortalGate.js` | Cruce de plano con dirección, apertura e histéresis; bloquea solicitudes duplicadas |
| `engine/LODController.js` | LOD por distancia dentro de la zona, histéresis y sesgo por calidad |
| `engine/PerformanceController.js` | FPS, mediana/P95, calls/triangles/recursos, HIGH/STANDARD/ECO y adaptación opcional con cooldown |
| `engine/ThreeResources.js` | Materiales compartidos, instancing y liberación explícita de geometrías/materiales/texturas/bitmaps/esqueletos |
| `engine/routes.js` | Contrato de dimensiones para 13 zonas y planta plegada del slice de cuatro zonas |

### Contrato de chunk

La fábrica `async (meta, context) => chunk` recibe `scene`, `renderer`, `camera`, `registry` y `signal`. Debe devolver:

```js
{
  async prepareHigh(signal) {}, // Preparar fuera de la escena visible; no activar aún.
  setActive(enabled) {},       // Activación síncrona e infalible; también interacción/audio.
  discardHigh() {},            // Reversible: conservar shell LOW, liberar detalle HIGH.
  update(dt, camera, profile) {},
  dispose() {}                 // Idempotente y completo; liberar leases, mixers y listeners.
}
```

Las funciones de lifecycle y los observadores de eventos deben ser infalibles; los fallos de red/decodificación/shader se comunican rechazando las promesas de fábrica o `prepareHigh`. El gestor conserva el HIGH anterior ante esos fallos. Una precarga vecina fallida se reintenta cuando se solicita el portal.

`N-1` conserva shell LOW/RETIRING, `N` es el único ACTIVE_HIGH, `N+1` tiene shell LOW y `N+2` **solo metadata**, sin carga de red/GPU. Se libera antes de cargar para no necesitar un cuarto chunk. El detalle de una zona retirada se libera; al volver, su shell sigue disponible, pero HIGH debe prepararse de nuevo tras un portal cerrado.

El cambio de mundo exige una cubierta opaca hasta resolver `switchRoute`. Si falla, conservar la cubierta o un estado de error con reintento; nunca dejar avanzar hacia geometría ausente. El laboratorio utiliza una cubierta completa. A00 solo existe como shell diagnóstico para probar el ciclo de vida.

### Assets y propiedad

Obtener un lease, esperar `lease.ready` y liberar una sola vez al retirar su consumidor. No hacer `dispose()` sobre geometrías/materiales/texturas de una instancia compartida. `ResourceScope` automatiza la liberación y admite mixers y listeners. La última liberación cancela fetch si aún estaba en curso; una decodificación que termine después se elimina.

`GLBAssetSource.instantiateStatic(url, scope)` clona nodos, compartiendo materiales/geometrías/texturas. Rechaza modelos skinned: para personajes se debe usar la fábrica y el rig existentes o clonado de esqueletos explícito. No usar `scene.clone(true)` para NPC skinned.

Meshopt/Draco/KTX2 se inyectan en el `GLTFLoader` del host cuando existan assets que lo requieran. No se instala un decoder sin necesidad. El adaptador acepta GLB autocontenidos, no archivos con dependencias externas no administradas. El laboratorio carga el Samuel real por este adaptador.

### Integración de portales y colisiones pendiente del contenido

`PortalGate.sample(position, manager)` detecta el cruce y espera `manager.enter(to)`. El controlador debe mantener al jugador antes de la barrera hasta recibir `true`; si rechaza, mostrar reintento. Crear un portal separado para el sentido inverso, con normal invertida. Usar posición de pies y normal unitaria. No liberar una barrera solo por cercanía a una sala.

La prueba usa botones cubiertos por transición; **aún no conecta un controlador caminable ni aplica colisiones al jugador**. Las cajas y aperturas métricas proporcionan el contrato. Añadir paredes/oclusores finales y probar físicamente la línea de visión antes de declarar ausencia de pop-in. El techo se omite en la vista técnica para inspeccionar el interior.

### Renderizado

Un renderer, sRGB, NoToneMapping, rampa toon y luces con los parámetros del aula existente. El laboratorio no carga la personalización facial completa de Samuel: lo muestra con sus materiales originales como referencia métrica. No modifica ese pipeline.

Arquitectura y mobiliario repetido se instancian. Solo la lista de interacción del chunk activo se raycastea; `instanceId` identifica cada repetición. Los semantic IDs son ejemplos técnicos y no crean currículo nuevo. El LOD de prueba tiene tres representaciones de un objeto de fondo y una cuarta condición invisible; no reemplaza arbitrariamente el modelo principal de Samuel.

Los perfiles aplican DPR, far plane y umbrales LOD en vivo. Exponen presupuestos NPC/sombras para los sistemas finales; **el laboratorio no tiene NPC, sombras dinámicas ni audio**. No confundir configuración con implementación de esos sistemas.

## Escala y presupuesto de Samuel

Medido en el navegador con `Box3.setFromObject(model, true)`, sin escalado:

- Alto: **1,700 m**; ancho en pose de referencia: **1,557 m**. El ancho de brazos no es el radio del collider caminando.
- Se conserva escala 1; solo se centra y apoya en el suelo mediante transformaciones de la instancia.
- Mostrador 1,10 m; puerta 2,80 m; paso 4 m; techo 5 m; radio inicial del jugador 0,32 m, por validar con su pose y controlador.
- GLB: **40.391.656 bytes**, 21 clips. La carga no inicia esos clips.
- Referencia original en D01: 17 draw calls y 215.220 triángulos totales frente a 7 / 396 sin Samuel: **214.824 triángulos adicionales**.
- Texturas del personaje: aproximadamente **256 MiB RGBA**, según dimensiones y política de mipmaps. Es una estimación, no medición de VRAM. `renderer.info.memory` cuenta recursos, no bytes.

Un Samuel original ya supera el presupuesto orientativo de triángulos skinned de la especificación. No usar 4–6 copias completas por defecto. Mantener un protagonista, reutilizar recursos y preparar representaciones de NPC y texturas de distribución aprobadas. No remallar ni sobrescribir el original. Los presupuestos del aeropuerto y del personaje deben contabilizarse por separado y sumarse al medir el render global.

## Validación y siguiente fase

Consultar `HANDOFF_SOL.md` y los JSON en `validation/` para evidencia y limitaciones. El rendimiento observado pertenece al **blockout técnico**, no al contenido final. Los 60 segundos por zona, NPC animados, audio, recorrido caminable, peor caso visual y perfilado de heap/VRAM real quedan para cuando exista ese contenido.
