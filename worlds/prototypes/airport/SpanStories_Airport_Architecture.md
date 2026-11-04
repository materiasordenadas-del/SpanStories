# SpanStories Airport — Arquitectura visual y técnica para Three.js

**Estado:** especificación base para implementación en Codex  
**Versión:** 0.1  
**Fecha:** 2026-09-22  
**Objetivo:** construir un aeropuerto educativo navegable en navegador, visualmente coherente con SpanStories, detallado en los objetos pedagógicamente importantes y deliberadamente ligero para WebGL/Three.js.

---

## 1. Decisión de diseño

El aeropuerto será una **terminal lineal plegada**, no un gran edificio abierto ni una reproducción completa de un aeropuerto real.

La experiencia del alumno debe sentirse lineal:

`Entrada → Facturación → Seguridad → Pasaportes → Zona comercial → Sala de espera → Embarque → [transición de vuelo] → Inmigración → Recogida de equipaje → Aduana → Llegadas → Salida`

Sin embargo, la geometría se pliega mediante esquinas, paredes, puertas y corredores cortos para que el jugador nunca vea toda la terminal a la vez. Esto permite ocultar la carga/descarga de chunks y mantiene las líneas de visión cortas.

La ficción es **un solo aeropuerto**. Técnicamente se divide en dos actos independientes:

1. **DepartureWorld** — salida del aeropuerto de origen.
2. **ArrivalWorld** — llegada al aeropuerto de destino.

Al entrar al avión se descarga `DepartureWorld`; durante una transición breve se precarga `ArrivalWorld`. Nunca es necesario mantener ambos mundos completos en GPU simultáneamente.

### Por qué esta configuración

- El flujo coincide con el viaje de pasajeros descrito por IATA: landside/check-in → seguridad → terminal airside → embarque; y en llegada: inmigración → recogida de equipaje → aduana → salida.
- La FAA reconoce la configuración lineal como una configuración terminal válida y particularmente apropiada para terminales relativamente pequeñas.
- Para SpanStories, la linealidad favorece el aprendizaje: cada zona introduce un conjunto concreto de objetos y acciones sin convertir el espacio en un laberinto.
- Para Three.js, las esquinas y portales funcionan como **oclusores de diseño**: no dependemos de un sistema costoso de occlusion queries.

---

# 2. Lenguaje visual SpanStories

El aeropuerto debe pertenecer al mismo universo visual de los personajes del proyecto.

## Reglas visuales obligatorias

- 3D estilizado, moderno y limpio.
- Formas suaves y ligeramente redondeadas.
- Geometría legible antes que microdetalle.
- Materiales predominantemente mate.
- Texturas mínimas y limpias.
- Gradientes suaves y sombras amplias.
- Iluminación neutra y clara.
- Evitar fotorealismo.
- Evitar aspecto de plástico brillante o arcilla.
- Evitar bloom, glow, depth of field y efectos cinematográficos.
- Evitar ruido superficial y normal maps agresivos.
- No crear un pipeline de shading separado: **reutilizar el sistema de materiales, color management, iluminación y animación que ya utiliza SpanStories** cuando exista.

## Principio de detalle

> El detalle se concentra donde el estudiante aprende vocabulario; la arquitectura secundaria solo debe vender la ilusión de un aeropuerto grande.

Un lector de pasaportes cercano puede tener botones, ranura, pantalla y luz de estado. Una tienda a 25 m puede ser únicamente una fachada de 1.5–2 m de profundidad.

---

# 3. Escala global

- **1 unidad Three.js = 1 metro.**
- Altura normal de techo: `4.5–5.5 m`.
- Puertas principales: `2.4–3.0 m` de alto.
- Corredores principales: `5–8 m` de ancho.
- Corredores de transición/oclusores: `3–5 m` de ancho.
- Altura de mostradores: aproximadamente `1.05–1.15 m`.
- La escala final debe validarse contra el personaje controlable real del proyecto antes de cerrar las dimensiones.

No se debe agrandar el aeropuerto para producir sensación de escala. La sensación de amplitud vendrá de:

- techos altos;
- grandes ventanales;
- pasillos que continúan visualmente;
- señalización aérea;
- sonidos ambientales;
- NPC lejanos;
- vistas falsas del apron/pista;
- geometría de fondo simplificada.

---

# 4. Plano modular general

## 4.1 Acto A — SALIDAS

```text
                         AIRSIDE / APRON FALSO
                                │
                                │ ventanales
                                ▼

┌──────────┐   ┌───────────────────────┐   ┌────────────────────┐
│ D00      │ → │ D01                   │ → │ D02                │
│ ENTRADA  │   │ FACTURACIÓN           │   │ SEGURIDAD          │
│ 14×10 m  │   │ 24×16 m               │   │ 20×14 m            │
└──────────┘   └───────────────────────┘   └─────────┬──────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │ D03              │
                                           │ PASAPORTES       │
                                           │ 16×10 m          │
                                           └────────┬─────────┘
                                                    │
                                             giro/portal
                                                    │
                                                    └───────────────►

                         ┌──────────────────────────┐
                         │ D04                      │
                         │ ZONA COMERCIAL /        │
                         │ CONCOURSE 24×12 m        │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ D05                      │
                         │ SALA DE ESPERA / GATE   │
                         │ 24×16 m                  │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │ D06                      │
                         │ EMBARQUE + JET BRIDGE   │
                         │ 16×8 m                   │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                             TRANSICIÓN DE VUELO
```

### Longitud de recorrido aproximada

`105–120 m`, según el trazado final de las colas y pequeños desvíos pedagógicos.

---

## 4.2 Acto B — LLEGADAS

```text
                   DESDE EL AVIÓN / CORREDOR DE LLEGADA
                                  │
                                  ▼
                     ┌────────────────────┐
                     │ A00                │
                     │ CORREDOR LLEGADAS │
                     │ 14×6 m             │
                     └─────────┬──────────┘
                               │
                               ▼
                     ┌────────────────────┐
                     │ A01                │
                     │ INMIGRACIÓN /      │
                     │ PASAPORTES 20×14 m │
                     └─────────┬──────────┘
                               │
                          giro/portal
                               │
                               ▼
┌───────────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ A02                       │→ │ A03                │→ │ A04                │
│ RECOGIDA DE EQUIPAJE      │  │ ADUANA             │  │ LLEGADAS           │
│ 24×18 m                   │  │ 16×10 m            │  │ 20×14 m            │
└───────────────────────────┘  └────────────────────┘  └─────────┬──────────┘
                                                                 │
                                                                 ▼
                                                        ┌───────────────────┐
                                                        │ A05               │
                                                        │ SALIDA /          │
                                                        │ TRANSPORTE 14×10 m│
                                                        └───────────────────┘
```

### Longitud de recorrido aproximada

`65–80 m`.

---

# 5. Regla espacial crítica: recorrido lineal, planta plegada

No construir un corredor recto de 180 m.

La ruta pedagógica es lineal, pero la planta arquitectónica debe plegarse en forma de **L/S** mediante:

- control de seguridad;
- paredes opacas;
- núcleos de servicios;
- baños;
- tiendas;
- puertas automáticas;
- pasillos de 90°;
- pequeños cambios de ancho;
- jet bridge;
- corredores de inmigración.

Objetivo de línea de visión:

- normal: `15–30 m`;
- máxima habitual: `35–45 m`;
- excepcional detrás de ventanales: puede parecer superior, pero debe utilizar falsa profundidad.

Esto es intencional: si el jugador no puede ver una zona, esa zona no necesita estar renderizada.

---

# 6. Catálogo por zona

## D00 — Entrada

### 3D real cercano

- puertas automáticas;
- carros de equipaje;
- 2–4 maletas;
- panel `SALIDAS / DEPARTURES`;
- pequeña pantalla de vuelos;
- poste de información;
- papeleras;
- señal de baños/ascensor;
- 2–4 NPC.

### Fondo/falsa profundidad

- taxis y autobús detrás del vidrio;
- marquesina exterior;
- carretera simplificada;
- ciudad/arbolado en plano o geometría de fondo.

---

## D01 — Facturación

### Elementos pedagógicos obligatorios

- mostrador de facturación;
- agente de aerolínea;
- pasaporte;
- tarjeta de embarque;
- maleta;
- equipaje de mano;
- báscula;
- cinta de equipaje;
- kiosco de auto check-in;
- separadores de fila;
- pantalla de vuelos;
- letreros `FACTURACIÓN`, `EQUIPAJE`, `SALIDAS`.

### Diseño

Representar visualmente `6–8` mostradores, pero solo `2` necesitan detalle alto/interacción. Los demás se construyen mediante módulos repetidos/instanciados.

---

## D02 — Seguridad

Esta es una de las zonas de mayor prioridad pedagógica.

### Elementos obligatorios

- bandejas;
- mesa de preparación;
- cinta transportadora;
- máquina de rayos X para equipaje de mano;
- monitor del operador;
- arco detector de metales;
- escáner corporal estilizado opcional;
- detector manual opcional;
- agente de seguridad;
- policía/vigilante aeroportuario;
- separadores de fila;
- zona para ponerse nuevamente chaqueta/cinturón;
- cartelería con instrucciones.

### Interacción prevista

El alumno puede colocar en una bandeja:

- teléfono;
- cinturón;
- chaqueta;
- mochila/equipaje de mano.

El detector de metales puede disparar un efecto sonoro breve de alarma (`beep`) mediante evento. No se simula física electromagnética.

### Optimización

Visualizar `2–3` líneas de seguridad; solamente una es completamente interactiva. Las líneas adicionales funcionan como escenario vivo de fondo.

---

## D03 — Control de pasaportes

### Elementos obligatorios

- cabinas;
- agente de inmigración/control fronterizo;
- pasaporte;
- lector de pasaporte;
- pequeña cámara;
- monitor;
- e-gate opcional;
- separadores de fila;
- señales `TODOS LOS PASAPORTES` y/o equivalentes narrativamente apropiadas.

Representar `4–6` cabinas; mantener detalladas solo las dos cercanas al recorrido.

---

## D04 — Zona comercial / concourse

### Elementos

- cafetería;
- tienda;
- baños;
- máquina expendedora;
- cajero automático opcional;
- fuente de agua;
- papeleras;
- bancos/sillas;
- reloj;
- señalización de puertas;
- pantallas de vuelos;
- 6–12 NPC de fondo según perfil de rendimiento.

### Falsa profundidad

Las tiendas secundarias son **fachadas de 1.5–2.5 m de profundidad**. No construir interiores completos que el jugador no puede visitar.

---

## D05 — Sala de espera / puerta

### Elementos obligatorios

- filas de sillas;
- pantalla `PUERTA 12`;
- estados de vuelo (`A TIEMPO`, `EMBARQUE`, etc.);
- mostrador de puerta;
- agente de aerolínea;
- lector de tarjeta de embarque;
- postes de fila;
- enchufes/cargadores estilizados;
- equipaje de mano;
- pasajeros sentados;
- ventanal al apron.

### Vista exterior

Debe vender la escala del aeropuerto sin modelarla realmente.

Real:

- `12–20 m` de apron desde el ventanal;
- una pequeña sección de jet bridge;
- 1 avión low-poly cercano o parcial;
- 1–2 vehículos de servicio sencillos.

Falso:

- pista lejana;
- hangares/terminales lejanas;
- aviones distantes;
- torre de control distante;
- skyline/horizonte.

---

## D06 — Embarque / jet bridge

### Elementos

- control final de embarque;
- lector de tarjeta;
- puerta automática/barrera;
- agente;
- letrero `EMBARQUE`;
- jet bridge corto;
- ventanas laterales;
- visión parcial del avión.

El jet bridge es un **portal técnico perfecto**: mientras el jugador avanza por él, `DepartureWorld` se puede descargar y `ArrivalWorld` se puede preparar.

---

## A00 — Corredor de llegada

Zona pequeña que establece contexto y permite terminar de cargar inmigración.

- señal `LLEGADAS / ARRIVALS`;
- flechas hacia `PASAPORTES`;
- ventanas falsas al exterior;
- 2–4 NPC caminando;
- puertas/recodo que impidan ver A02.

---

## A01 — Inmigración

- cabinas;
- pasaporte;
- agente;
- lector;
- cámara;
- e-gates de fondo;
- fila de pasajeros;
- señalización.

Puede reutilizar gran parte de los assets de D03.

---

## A02 — Recogida de equipaje

Zona visualmente importante.

### Elementos obligatorios

- cinta/carrusel de equipaje;
- `8–12` maletas visuales en circulación;
- monitor con número de vuelo;
- carros de equipaje;
- señal `RECOGIDA DE EQUIPAJE`;
- 4–10 pasajeros;
- oficina/mostrador `EQUIPAJE` simplificado al fondo.

### Animación

No utilizar física para las maletas. Usar posiciones precomputadas a lo largo de una curva cerrada o puntos discretos. Si varias maletas comparten geometría/material, usar instancing y actualizar matrices.

---

## A03 — Aduana

- carril verde `NADA QUE DECLARAR`;
- carril rojo `BIENES QUE DECLARAR`;
- mostrador;
- agente;
- policía/vigilante opcional;
- pequeña mesa de inspección;
- señal `ADUANA`.

No necesita gran profundidad. Es una excelente zona de transición/oclusor antes del hall de llegadas.

---

## A04 — Hall de llegadas

- pantalla de llegadas;
- personas esperando;
- bancos;
- carros de equipaje;
- señal `SALIDA`;
- información;
- puertas automáticas;
- indicaciones a taxi/autobús.

---

## A05 — Salida / transporte

- taxi;
- autobús o shuttle;
- señal `TAXI`;
- señal `AUTOBÚS`;
- acera;
- paso peatonal sencillo;
- fondo urbano/vegetación simplificado.

No construir una ciudad completa.

---

# 7. Jerarquía de representación: qué es 3D real y qué es ilusión

| Nivel | Uso | Representación |
|---|---|---|
| **A — Interactivo** | objetos que el alumno toca, selecciona o inspecciona | 3D real low-poly, collider simple, semantic ID |
| **B — Cercano repetido** | sillas, postes, luces, bandejas, maletas, columnas | `InstancedMesh` siempre que compartan geometría/material |
| **C — Cercano variado** | varios props diferentes que comparten material | `BatchedMesh` si la versión instalada lo soporta; si no, geometría fusionada por chunk |
| **D — Fondo 3D** | NPC simplificados, avión lejano, vehículos, mobiliario distante | LOD reducido, sin collider individual |
| **E — 2.5D** | tiendas lejanas, extensiones de terminal, corredores falsos | fachadas poco profundas, planes texturizados, geometría silhouette |
| **F — Fondo puro** | horizonte, pista lejana, terminal distante | atlas/textura/panorama; sin interacción |

### Prohibido

- modelar interiores inaccesibles completos;
- modelar todos los aviones de la pista en alta resolución;
- mantener todas las tiendas abiertas y cargadas;
- usar un segundo renderer/cámara para “portales” decorativos;
- usar reflexiones en tiempo real para los ventanales;
- usar física para cintas, maletas o NPC ambientales.

---

# 8. Sistema de chunks

Cada zona principal es un `AirportChunk` independiente.

## Estados

```text
UNLOADED
   ↓
PREFETCHED       metadata + request iniciada
   ↓
LOADED_LOW       shell/LOD bajo, todavía no interactivo
   ↓
ACTIVE_HIGH      detalle alto + interacción + NPC cercanos
   ↓
RETIRING         interacción apagada; se conserva tras cruzar portal
   ↓
UNLOADED         GPU/CPU liberada cuando ya no es necesaria
```

## Ventana activa normal

```text
chunk N-1   = LOW / RETIRING
chunk N     = HIGH / ACTIVE
chunk N+1   = LOW / PRELOADED
chunk N+2   = metadata o prefetch de red únicamente
resto       = UNLOADED
```

Nunca cargar todas las zonas simultáneamente.

## Importante: streaming por progreso, no solo por distancia

Debido a que la planta está plegada, dos chunks no consecutivos pueden quedar físicamente cerca. Por eso el sistema **no debe decidir qué cargar únicamente con `camera.position.distanceTo(...)`**.

La autoridad es:

1. índice de ruta;
2. trigger/portal cruzado;
3. sentido de avance;
4. pequeño margen de histéresis.

La distancia se usa únicamente para LOD interno dentro del chunk.

## Portales/oclusores recomendados

- puertas automáticas;
- giros de 90°;
- pasillos cortos;
- paredes de seguridad;
- tienda/baño entre zonas;
- jet bridge;
- aduana;
- pasillo de inmigración.

---

# 9. Estructura lógica sugerida

Los nombres exactos deben adaptarse a la arquitectura actual del repositorio; no crear una segunda arquitectura paralela si ya existen sistemas equivalentes.

```text
airport/
  world/
    AirportWorld
    AirportRoute
    AirportChunkManager
    AirportPortalManager

  assets/
    AirportAssetRegistry
    shared/
    departures/
    arrivals/

  systems/
    AirportNPCSystem
    AirportInteractionSystem
    AirportSignageSystem
    AirportAudioSystem
    AirportPerformanceController

  zones/
    D00_Entrance
    D01_CheckIn
    D02_Security
    D03_Passport
    D04_Concourse
    D05_Gate
    D06_Boarding
    A00_ArrivalCorridor
    A01_Immigration
    A02_BaggageClaim
    A03_Customs
    A04_ArrivalsHall
    A05_Exit
```

---

# 10. AssetRegistry y ciclo de vida

Debe existir un registro central de recursos.

Responsabilidades:

- cargar cada GLB/textura una vez;
- devolver referencias compartidas;
- contar consumidores;
- evitar duplicación de materiales/texturas;
- liberar geometrías, materiales y texturas cuando el último consumidor desaparezca;
- no hacer `dispose()` de una textura compartida mientras otro chunk aún la utiliza;
- detener `AnimationMixer` y listeners al descargar un chunk;
- eliminar referencias a objetos descargados.

`GLTFLoader` advierte que los bitmaps usados por recursos glTF requieren manejo explícito de ciclo de vida. Por ello la descarga de chunks no debe limitarse a `scene.remove(group)`.

---

# 11. Estrategia de assets

## Arquitectura

Preferencia:

- paredes, pisos, marcos, paneles y mostradores modulares con geometría simple;
- fusionar geometría estática **por chunk**, no a escala de aeropuerto completo;
- conservar separación solo cuando un objeto deba animarse o interactuarse.

No fusionar todas las zonas en una única malla: eso destruye la granularidad de streaming/culling.

## Modelos glTF/GLB

Para assets complejos:

- `GLTFLoader`;
- Meshopt **o** Draco según benchmark del proyecto;
- no aplicar compresión por dogma: comparar peso, tiempo de decode y coste de CPU;
- KTX2/Basis para texturas cuando sea compatible con el pipeline existente.

## Texturas

- 512 px: props pequeños y fondos.
- 1024 px: atlas de props/señalización principal.
- 2048 px: máximo habitual para un atlas grande que realmente lo justifique.
- Evitar 4K para props del aeropuerto.
- Reutilizar atlas.
- Preferir KTX2 para reducir transferencia y memoria de texturas.

---

# 12. Materiales y shading

## Biblioteca pequeña y compartida

Objetivo: aproximadamente `10–16` familias de material para toda la terminal, con variaciones de color cuando sea posible sin duplicar shaders.

Ejemplos conceptuales:

- wall/light;
- wall/warm;
- floor;
- dark metal;
- light metal;
- glass;
- navy signage;
- accent signage;
- seat fabric/plastic;
- wood;
- skin/character pipeline ya existente.

## Vidrio

- evitar `transmission`/refracción salvo que el proyecto ya lo use y el benchmark lo permita;
- usar grandes planos simples;
- evitar vidrio doble;
- evitar muchas superficies transparentes superpuestas;
- no generar reflejos dinámicos del aeropuerto.

## Señalización

### Estática

- atlas de texturas compartido;
- una pequeña biblioteca de paneles modulares;
- no crear una textura independiente para cada palabra.

### Dinámica

Las pantallas de vuelos pueden usar una única `CanvasTexture` o equivalente, actualizada **solo cuando cambia el contenido**, nunca cada frame.

---

# 13. Iluminación

La iluminación debe mantener el aspecto suave y mate de SpanStories.

## Base

- reutilizar la iluminación global existente si el proyecto ya la define;
- si el aeropuerto requiere una configuración propia: una luz ambiental/hemisférica suave + una luz direccional principal;
- luminarias del techo: geometría/emissive; **no una PointLight por lámpara**.

## Sombras

- máximo `1` fuente principal con shadow map por escena activa;
- `1024` como valor estándar inicial;
- `2048` únicamente en perfil alto y si el benchmark lo justifica;
- `castShadow=false` en la mayoría de props repetidos;
- personajes cercanos/objetos pedagógicos pueden proyectar sombra;
- NPC lejanos pueden usar sombra blob o ninguna.

Si la iluminación es suficientemente estable, considerar baked AO/lightmaps o vertex colors para arquitectura estática.

---

# 14. Cámara y profundidad visual

Para una experiencia caminable se recomienda cámara de perspectiva.

Punto de partida:

```text
FOV:          50–55°
near:         0.08–0.10 m
far:          70–90 m
```

No tomar estos números como contrato si el controlador de cámara existente usa otros valores correctos.

## Por qué limitar el far plane

La terminal está diseñada para no necesitar visión real a cientos de metros. El apron distante es una ilusión. Esto mejora precisión de profundidad y evita renderizar contenido innecesario.

Opcional: niebla muy sutil únicamente en vistas exteriores largas para fundir el fondo, nunca como efecto evidente dentro de la terminal.

---

# 15. Presupuesto de rendimiento

Estos números son **presupuestos de ingeniería iniciales**, no garantías universales. Codex debe medirlos con `renderer.info` y perfiles reales.

## Objetivo estándar — portátil/desktop medio

| Métrica | Objetivo | Límite blando |
|---|---:|---:|
| FPS | 60 | 45 |
| Draw calls visibles | ≤ 90 | 140 |
| Triángulos totales visibles | 300k–450k | 650k |
| Triángulos estáticos/props | ≤ 300k | 450k |
| Triángulos skinned visibles | ≤ 120k | 180k |
| Materiales visibles distintos | ≤ 24 | 32 |
| Luces que proyectan sombra | 1 | 1 |
| Chunks HIGH simultáneos | 1 | 1 |
| Chunks geométricos cargados | 2–3 | 4 excepcionalmente |
| NPC SpanStories completos cercanos | 4–6 | 8 |
| NPC de fondo 3D simplificados | 6–12 | 16 |
| DPR estándar | 1.25 | 1.5 |

## Presupuesto de memoria de texturas

Objetivo operativo aproximado para assets del aeropuerto activos:

- ideal: `≤128 MB` de texturas GPU;
- vigilar a partir de `160 MB`;
- evitar superar `192 MB` por el aeropuerto en perfil estándar.

No confiar únicamente en el tamaño del archivo descargado: una textura comprimida en red puede ocupar mucho más una vez subida a GPU. KTX2 ayuda a controlar este problema.

---

# 16. Perfiles adaptativos

## HIGH

- DPR máximo `1.5`;
- shadow map hasta `2048` si mantiene presupuesto;
- 6–8 NPC completos;
- mayor densidad de fondo;
- LOD cambia más tarde.

## STANDARD — predeterminado

- DPR `1.25`;
- shadow map `1024`;
- 4–6 NPC completos;
- 6–12 NPC simplificados;
- falsa profundidad normal.

## ECO

- DPR `1.0`;
- sombras reducidas o desactivadas en NPC secundarios;
- 3–4 NPC completos;
- fondo humano mayoritariamente billboard/silueta;
- avión lejano y vehículos en LOD mínimo;
- menor far plane cuando sea posible.

El cambio de perfil debe poder ocurrir sin recargar la página.

---

# 17. Instancing, batching y geometría estática

## `InstancedMesh`

Usarlo para objetos con la misma geometría y material:

- sillas;
- postes de fila;
- bandejas;
- lámparas;
- columnas;
- papeleras;
- conos;
- maletas repetidas;
- marcos de ventanal;
- ciertos NPC extremadamente simplificados.

## `BatchedMesh`

Puede usarse cuando hay muchas geometrías distintas que comparten material y la versión instalada de Three.js lo soporta correctamente.

**Antes de usarlo, Codex debe inspeccionar la versión actual de `three` del repositorio. No actualizar Three.js solo para obtener `BatchedMesh`.**

Fallback:

- `BufferGeometryUtils.mergeGeometries()` por chunk;
- conservar aparte objetos móviles/interactivos.

## Matrices

Para meshes estáticos no animados:

- calcular matriz una vez;
- desactivar `matrixAutoUpdate` cuando sea seguro.

---

# 18. LOD

`THREE.LOD` está disponible para casos simples. Para NPC y assets del aeropuerto puede ser preferible un pequeño gestor propio porque también hay que apagar animaciones, colliders e interacción.

## Propuesta de distancia

### Props grandes / avión

```text
0–20 m     LOD0
20–40 m    LOD1
40–65 m    LOD2 / silhouette
>65 m      billboard o invisible
```

### NPC

```text
0–10 m     personaje completo + animación completa
10–20 m    modelo simplificado + animación a menor frecuencia
20–35 m    low-poly extremo / impostor
>35 m      billboard, silueta o invisible
```

Aplicar histéresis para que el LOD no oscile al cruzar un límite.

---

# 19. NPC y sensación de vida

No llenar el aeropuerto con decenas de personajes skinned.

La sensación de actividad se obtiene combinando:

- pocos personajes cercanos;
- pasajeros sentados;
- 2–4 caminantes visibles;
- figuras de fondo;
- vehículos que se mueven tras los ventanales;
- pantallas animadas ocasionalmente;
- audio ambiental;
- maletas en movimiento;
- puertas automáticas.

## Capas de NPC

### Hero/Near

- personajes SpanStories completos;
- animación corporal/facial del sistema existente;
- interacción posible.

### Mid

- modelo simplificado;
- sin elementos faciales complejos;
- clip de caminar/esperar;
- update de animación aproximadamente a `30 Hz` si visualmente funciona.

### Far

- low-poly/impostor;
- update `10–15 Hz` o animación mínima;
- sin interacción ni collider.

## Movimiento

No implementar pathfinding general para la multitud.

El aeropuerto es lineal: utilizar

- waypoints;
- rutas spline;
- posiciones de espera predefinidas;
- anchors de asiento;
- pools de NPC.

Esto es más barato, predecible y suficiente para el objetivo educativo.

---

# 20. Animaciones ambientales baratas

## Cinta de equipaje

- cinta: textura/UV o pieza simple animada;
- maletas: matrices sobre una curva cerrada;
- sin rigid bodies.

## Cinta de seguridad

- belt visual animado;
- bandejas por posiciones discretas/instancing;
- evento de “beep” del detector cuando la narrativa lo requiere.

## Puertas automáticas

- dos paneles deslizantes;
- trigger sencillo;
- animación con tween o clip corto.

## Vehículos exteriores

- spline predefinido;
- 1–3 vehículos móviles máximo en la vista actual;
- los vehículos distantes pueden ser sprites.

## Avión

No necesita sistemas aeronáuticos reales.

- avión cercano: modelo low-poly limpio;
- avión distante/taxiing: LOD extremo o billboard;
- movimiento lineal/spline lento.

---

# 21. Colisiones

No usar la geometría visual como collider general.

Usar primitivas simplificadas:

- cajas para paredes/mostradores;
- cápsula para jugador si el controlador actual la usa;
- cilindros/cajas para postes/objetos relevantes;
- trigger volumes para portales e interacciones.

Las sillas instanciadas de fondo no necesitan collider individual si el jugador no puede entrar en esas filas.

---

# 22. Raycasting e interacción educativa

No lanzar raycasts contra todo el scene graph.

Crear una colección/layer específica de objetos interactivos.

Cada objeto pedagógico debe poder portar metadatos semejantes a:

```ts
userData = {
  semanticId: 'airport.security.metalDetector',
  interactionType: 'inspect',
  vocabularyId: '...',
  zoneId: 'D02'
}
```

El ID real debe conectarse al sistema léxico existente de SpanStories; no crear un diccionario paralelo dentro del aeropuerto.

---

# 23. Cartelería y vocabulario visible

Letreros principales previstos:

- ENTRADA
- SALIDAS
- LLEGADAS
- FACTURACIÓN
- EQUIPAJE
- SEGURIDAD
- PASAPORTES
- TODOS LOS PASAPORTES
- PUERTAS
- PUERTA 12
- EMBARQUE
- SALA DE ESPERA
- BAÑOS
- INFORMACIÓN
- RECOGIDA DE EQUIPAJE
- ADUANA
- NADA QUE DECLARAR
- BIENES QUE DECLARAR
- SALIDA
- TAXI
- AUTOBÚS

No llenar el escenario con texto pequeño ilegible. La cartelería existe primero para navegación y vocabulario, no como ruido decorativo.

---

# 24. Falsa profundidad: estrategias concretas

## Ventanal de puerta

```text
Jugador
  │
  ├─ vidrio simple
  │
  ├─ 0–20 m: apron real
  │      ├─ parte de un avión
  │      ├─ carrito de equipaje
  │      └─ personal de pista simplificado
  │
  ├─ 20–40 m: geometría LOD extrema
  │      ├─ avión lejano
  │      └─ vehículos
  │
  └─ fondo: textura/panorama
         ├─ pista
         ├─ terminal lejana
         ├─ torre
         └─ horizonte
```

## Tiendas

```text
fachada 3D
│
├─ mostrador/estante cercano: 3D
├─ mercancía: atlas/textura o pocas piezas instanciadas
└─ pared trasera a 1.5–2.5 m
```

## Corredores falsos

- 8–12 m de corredor real;
- progresión de luces/columnas;
- pared final más oscura o puerta;
- no construir 50 m adicionales que el jugador no puede recorrer.

## Crowds lejanos

- siluetas 2D/3D extremadamente simples;
- movimientos lentos;
- variación de escala/ropa;
- nunca bloquear la ruta del jugador.

---

# 25. Culling

Mantener `frustumCulled=true` salvo una razón explícita.

Para `InstancedMesh`:

- calcular correctamente bounding sphere/bounding box cuando cambian sus instancias;
- evitar un único `InstancedMesh` gigantesco que abarque varias zonas, porque su volumen de bounds inutilizaría parte del culling;
- crear instancias por chunk o subzona.

Además del frustum culling, aplicar **visibility culling explícito por portal**:

- chunks no adyacentes: `visible=false` o descargados;
- capas exteriores fuera de la vista: apagadas;
- fondos específicos de una ventana solo activos mientras esa ventana puede verse.

---

# 26. Renderer y resolución

- Reutilizar el `WebGLRenderer` existente del proyecto.
- No crear un renderer adicional para el aeropuerto.
- `preserveDrawingBuffer` debe permanecer desactivado salvo necesidad real.
- No activar `logarithmicDepthBuffer` para este escenario; el mundo es deliberadamente pequeño.
- Mantener DPR limitado y adaptativo.
- Usar `renderer.info` para registrar draw calls y triángulos.
- Cuando sea apropiado, usar `compileAsync()` para preparar shaders del siguiente chunk antes de hacerlo visible y reducir stutter.

---

# 27. Audio

Audio ayuda a generar “vida” con coste gráfico prácticamente nulo.

## Loops por zona

- murmullo de terminal;
- anuncios muy lejanos/ininteligibles;
- ruedas de maletas;
- ambiente de pista junto a ventanales.

## Eventos puntuales

- beep de detector de metales;
- puerta automática;
- lector de boarding pass;
- cinta de equipaje;
- anuncio pedagógico si la historia lo requiere.

No reproducir decenas de fuentes 3D simultáneas. Mezclar un loop ambiental por chunk y unos pocos efectos cercanos.

---

# 28. Carga inicial y red

El aeropuerto no debe entrar entero en el bundle inicial.

## Inicio

Cargar:

1. shell de D00;
2. assets compartidos mínimos;
3. personaje/controlador;
4. D01 en background.

## Objetivos iniciales de payload para assets del aeropuerto

- primer tramo jugable + shared: ideal `≤8–10 MB` comprimidos;
- chunk adicional: aproximadamente `1–4 MB` según contenido;
- no descargar arrivals al abrir departures.

Estos objetivos deben medirse sobre los assets finales; no son una excusa para sacrificar objetos pedagógicos importantes.

---

# 29. Cambio de mundo Departure → Arrival

Secuencia sugerida:

```text
D06 boarding
    ↓
lector de boarding pass
    ↓
entrada al jet bridge
    ↓
la puerta se cierra detrás del jugador
    ↓
precargar Arrival shared + A00 + A01
    ↓
pequeña transición narrativa/visual
    ↓
dispose Departure chunks
    ↓
spawn en A00
```

Si la conexión es lenta, la transición debe poder prolongarse de forma natural sin mostrar geometría faltante.

---

# 30. Presupuesto orientativo por asset

No es obligatorio utilizar todo el presupuesto; debe interpretarse como techo de diseño para assets nuevos.

| Asset | Triángulos orientativos |
|---|---:|
| silla individual antes de instancing | 150–350 |
| maleta | 150–450 |
| poste de fila | 80–200 |
| bandeja seguridad | 60–150 |
| kiosco check-in | 300–800 |
| mostrador modular | 500–1.5k |
| detector de metales | 400–1k |
| máquina de rayos X | 1k–2.5k |
| cabina de pasaportes | 700–1.8k |
| sección carrusel equipaje | 2k–5k total visible |
| vehículo airside cercano | 1.5k–4k |
| avión cercano low-poly | 8k–20k |
| avión LOD1 | 2k–5k |
| avión LOD2 | 300–1k / billboard |
| NPC de fondo LOD0 | 4k–8k |
| NPC de fondo LOD1 | 1k–2.5k |

Los personajes principales ya existentes de SpanStories **no deben ser remallados arbitrariamente** para ajustarlos a esta tabla; se controla su coste limitando cuántos se muestran simultáneamente y usando LODs específicos cuando existan.

---

# 31. Presupuesto aproximado de draw calls del chunk activo

Ejemplo de distribución:

```text
arquitectura fusionada:             5–10
mobiliario instanciado:              8–15
props únicos:                       10–20
señalización/pantallas:              4–8
personajes:                          8–18
exterior/fondo:                      3–8
efectos/otros:                       3–6
-----------------------------------------
objetivo chunk activo:              45–85
```

El chunk adyacente LOW debe añadir muy poco. El objetivo global sigue siendo `≤90` draw calls en condiciones normales y nunca diseñar deliberadamente alrededor de >140.

---

# 32. Detalles que venden escala con poco coste

Priorizar estos recursos antes de aumentar geometría:

1. señalización aérea coherente;
2. audio ambiental por zona;
3. carros/maletas en movimiento;
4. pantallas con información;
5. ventanales grandes con fondo 2.5D;
6. unos pocos NPC que cruzan el campo visual;
7. filas de sillas instanciadas;
8. columnas y luces repetidas que refuercen perspectiva;
9. puertas que abren/cerran;
10. un avión visible en la puerta.

Movimiento selectivo + repetición visual produce más sensación de aeropuerto que miles de props estáticos.

---

# 33. Reglas de implementación que Codex NO debe romper

1. **No crear un único `airport.glb` gigantesco.**
2. **No cargar departures y arrivals completos al mismo tiempo.**
3. **No crear una luz real por luminaria del techo.**
4. **No crear una textura por cada cartel.**
5. **No crear una malla individual para cada silla/poste/bandeja.**
6. **No ejecutar pathfinding general para multitudes.**
7. **No usar física para equipaje, cintas o vehículos ambientales.**
8. **No raycastear todo el scene graph para seleccionar vocabulario.**
9. **No duplicar materiales que pueden compartirse.**
10. **No mantener AnimationMixers/listeners de chunks descargados.**
11. **No añadir bloom, DOF ni reflejos en tiempo real para “mejorar” el aspecto.**
12. **No actualizar Three.js solo para esta escena sin una razón comprobada.**
13. **No modelar geometría detrás de una pared únicamente porque existe en un aeropuerto real.**
14. **No sacrificar legibilidad pedagógica por realismo.**

---

# 34. Instrumentación obligatoria durante desarrollo

Añadir un panel de depuración opcional con al menos:

```text
FPS
frame time
renderer.info.render.calls
renderer.info.render.triangles
textures/geometries aproximadas
chunk actual
chunks cargados
NPC completos activos
NPC de fondo activos
perfil HIGH/STANDARD/ECO
```

Registrar también eventos de chunk:

```text
[PREFETCH] D03
[LOAD_LOW] D03
[ACTIVATE] D03
[RETIRE] D02
[DISPOSE] D01
```

Esto permitirá detectar fugas de memoria y zonas que rompan el presupuesto.

---

# 35. Pruebas de rendimiento obligatorias

## Caso 1 — Facturación

- caminar desde D00 hasta centro de D01;
- confirmar que D02 ya está disponible antes de acercarse al portal;
- medir draw calls y triángulos con la sala llena.

## Caso 2 — Seguridad

Peor caso interior esperado:

- cintas animadas;
- bandejas;
- policía/agentes;
- pasajeros;
- interacción;
- beep/sonido;
- D01 retirándose y D03 precargado.

Debe permanecer dentro del límite blando.

## Caso 3 — Gate

Peor caso visual:

- mayor número de sillas;
- NPC;
- ventanal;
- avión;
- vehículos externos;
- pantalla de vuelos.

Si gate rompe el presupuesto, reducir primero fondo/LOD/transparencia, no los elementos didácticos cercanos.

## Caso 4 — Baggage claim

- carrusel activo;
- 8–12 maletas;
- pasajeros;
- carts;
- pantalla.

No debe usar física.

## Caso 5 — 10 transiciones de chunk

Caminar adelante/atrás repetidamente. Verificar que:

- memoria no aumenta indefinidamente;
- mixers se liberan;
- listeners no se duplican;
- assets compartidos no se descargan prematuramente;
- no aparecen stutters crecientes.

---

# 36. Acceptance criteria del sistema de streaming

El aeropuerto no se considera terminado hasta cumplir:

- solo `1` chunk HIGH activo;
- normalmente máximo `3` chunks geométricos cargados;
- chunks no adyacentes invisibles o descargados;
- no hay pop-in visible al cruzar un portal en conexión normal;
- si la siguiente zona no está lista, una transición arquitectónica impide avanzar hasta que lo esté;
- volver una zona atrás no exige una recarga perceptible inmediata;
- dos zonas atrás ya pueden liberarse;
- la memoria vuelve a un rango estable después de varias transiciones;
- no hay audio ni animaciones ejecutándose en chunks descargados.

---

# 37. Acceptance criteria visuales

- El aeropuerto se percibe como parte de SpanStories.
- Los personajes no parecen insertados en un mundo de otro estilo.
- Las superficies son limpias y mate.
- El entorno no parece fotorealista.
- Los objetos pedagógicos importantes se identifican inmediatamente.
- La señalización puede leerse desde la distancia de interacción prevista.
- Hay vida ambiental sin sensación de multitud pesada.
- Los fondos exteriores sugieren una terminal mucho mayor que la geometría real.
- No hay bloom, DOF ni look cinematográfico.

---

# 38. Semantic IDs recomendados

No definen el currículo; solo establecen una interfaz consistente para conectarlo después.

```text
airport.entrance.automaticDoor
airport.checkin.counter
airport.checkin.kiosk
airport.checkin.scale
airport.baggage.suitcase
airport.baggage.carryOn
airport.security.tray
airport.security.xrayMachine
airport.security.metalDetector
airport.security.officer
airport.security.police
airport.passport.passport
airport.passport.booth
airport.passport.scanner
airport.concourse.cafe
airport.concourse.shop
airport.gate.seat
airport.gate.flightBoard
airport.gate.boardingPassScanner
airport.boarding.jetBridge
airport.arrival.immigration
airport.baggage.carousel
airport.customs.greenChannel
airport.customs.redChannel
airport.exit.taxi
airport.exit.bus
```

---

# 39. Orden de construcción recomendado

## Fase 0 — infraestructura

- `AirportChunkManager`;
- `AssetRegistry`;
- portal triggers;
- métricas de rendimiento;
- perfiles de calidad.

## Fase 1 — vertical slice

Construir solamente:

```text
D01 Facturación
      ↓
D02 Seguridad
      ↓
D04 Concourse mínimo
      ↓
D05 Gate
```

Debe incluir:

- personaje caminando;
- shading definitivo;
- 1 NPC activo;
- instancing;
- carga/descarga real;
- señalización;
- una interacción;
- audio;
- ventanal con falsa profundidad.

**No construir el aeropuerto completo hasta que este vertical slice cumpla el presupuesto.**

## Fase 2 — Salidas completas

Añadir D00, D03 y D06.

## Fase 3 — Llegadas

A00–A05 reutilizando assets compartidos.

## Fase 4 — vida ambiental

- NPC secundarios;
- vehículos;
- variaciones de maleta;
- animaciones de fondo;
- audio contextual.

## Fase 5 — integración pedagógica

- semantic IDs;
- vocabulario;
- selección de objetos;
- diálogos/historias;
- analítica educativa si corresponde.

---

# 40. Estrategia de validación del vertical slice

Antes de ampliar el aeropuerto:

1. medir 60 s quieto en cada zona;
2. caminar continuamente D01 → D05;
3. repetir recorrido 5 veces;
4. medir FPS medianos y peores caídas;
5. revisar `renderer.info.render.calls`;
6. revisar triángulos;
7. revisar memoria antes/después;
8. comprobar que cada zona se libera;
9. probar ventana a 1366×768 y 1920×1080;
10. probar STANDARD y ECO.

La optimización se hace con datos, no observando solamente si “parece fluido”.

---

# 41. Verificación 1 — coherencia técnica

**Realizada antes de entregar este documento.**

Comprobado contra documentación oficial actual de Three.js:

- `InstancedMesh` está diseñado para reducir draw calls cuando se repite la misma geometría/material.
- `BatchedMesh` permite agrupar objetos con geometrías diferentes y material compartido para reducir draw calls.
- `GLTFLoader` soporta KTX2/Basis, Draco y Meshopt mediante sus loaders/decoders correspondientes.
- `KTX2Loader` transcodifica texturas a formatos comprimidos compatibles con la GPU.
- `THREE.LOD` soporta cambio de objetos según distancia e histéresis.
- `Object3D.frustumCulled` existe y está activado por defecto.
- `WebGLRenderer.info` expone métricas como draw calls y triángulos.
- `WebGLRenderer.compileAsync()` puede utilizarse para preparar shaders y reducir bloqueos de compilación cuando el navegador soporta el mecanismo correspondiente.

Resultado: **sin dependencia técnica inventada** para las estrategias centrales del documento.

---

# 42. Verificación 2 — coherencia arquitectónica y de presupuesto

**Realizada antes de entregar este documento.**

Checklist:

- [x] Ruta completa de salida incluida.
- [x] Ruta completa de llegada incluida.
- [x] Seguridad incluye bandejas, rayos X, detector de metales y personal.
- [x] Control de pasaportes está separado de seguridad.
- [x] Recogida de equipaje incluye carrusel y maletas en movimiento.
- [x] Aduana incluye canal verde/rojo.
- [x] Gate incluye sala de espera, lector y jet bridge.
- [x] El recorrido es lineal para el alumno pero plegado espacialmente.
- [x] Departure y Arrival pueden existir como mundos técnicamente separados.
- [x] Solo un chunk HIGH necesita estar activo.
- [x] Se especifica una ventana de 2–3 chunks cargados.
- [x] Las repeticiones grandes tienen estrategia de instancing/batching.
- [x] Se evita pathfinding/physics innecesarios.
- [x] Se limita transparencia/reflejos/postprocesado.
- [x] Los objetos didácticos reciben prioridad de detalle.
- [x] Existen límites de draw calls, triángulos, NPC y DPR.
- [x] Existen pruebas de fuga de memoria y transiciones repetidas.
- [x] No se obliga a actualizar Three.js ni a sustituir sistemas existentes del proyecto.

Resultado: **arquitectura internamente consistente y lista para un vertical slice de Codex.**

---

# 43. Fuentes técnicas y de planificación

## Planificación aeroportuaria

- FAA — **AC 150/5360-13A: Airport Terminal Planning**  
  https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC-150-5360-13A-Airport-Terminal-Planning.pdf

- IATA — **Airport Governance Toolkit**, diagrama de passenger journey  
  https://www.iata.org/contentassets/fa95ede4dee24322939d396382f2f82d/iata-toolkit-on-airport-governance-a4.pdf

## Three.js

- `InstancedMesh`  
  https://threejs.org/docs/pages/InstancedMesh.html

- `BatchedMesh`  
  https://threejs.org/docs/pages/BatchedMesh.html

- `GLTFLoader`  
  https://threejs.org/docs/pages/GLTFLoader.html

- `KTX2Loader`  
  https://threejs.org/docs/pages/KTX2Loader.html

- `LOD`  
  https://threejs.org/docs/pages/LOD.html

- `Object3D.frustumCulled`  
  https://threejs.org/docs/pages/Object3D.html

- `WebGLRenderer` / `renderer.info` / `compileAsync()` / pixel ratio  
  https://threejs.org/docs/pages/WebGLRenderer.html

- Three.js manual — **Optimize Lots of Objects**  
  https://threejs.org/manual/pages/optimize-lots-of-objects.html

---

# 44. Instrucción final para Codex

> Construir el aeropuerto como una experiencia educativa modular, no como una maqueta arquitectónica completa. Mantener el lenguaje visual limpio, mate y estilizado de SpanStories. El alumno debe percibir una terminal amplia y viva, pero el navegador debe mantener activo únicamente el pequeño fragmento del aeropuerto que el jugador necesita en ese momento. Priorizar siempre legibilidad pedagógica, streaming, instancing, reutilización de assets y medición real de rendimiento antes de aumentar detalle.
