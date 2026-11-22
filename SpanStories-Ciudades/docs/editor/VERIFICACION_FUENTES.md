# Verificación de fuentes del editor

Generado por `scripts/verificar_fuentes_editor.mjs` · 2026-11-20

## Estilos visuales (catálogo HTML ↔ `style-pool.js`)
- ✅ Ambos tienen 6 estilos.
- ✅ «Trigun» · id `spanstories` · modo 0 coincide (nombre del Generador: «Trigun»).
- ✅ «Dispatch» · id `dispatch` · modo 8 coincide (nombre del Generador: «Dispatch»).
- ✅ «Zelda» · id `zelda` · modo 6 coincide (nombre del Generador: «Zelda»).
- ✅ «Studio Ghibli» · id `ghibli` · modo 7 coincide (nombre del Generador: «Studio Ghibli»).
- ✅ «Color» · id `color` · modo 1 coincide (nombre del Generador: «Color»).
- ✅ «Color + línea» · id `colorline` · modo 2 coincide (nombre del Generador: «Color + línea»).
- ✅ `lineWidth` = 1 coincide.
- ✅ `outline` = 1.6 coincide.
- ✅ `contrast` = 1.15 coincide.
- ✅ `shadowDepth` = .7 coincide.
- ✅ `saturation` = 1.08 coincide.
- ✅ `paint` = 1 coincide.
- ✅ `aoStrength` = 1 coincide.
- ✅ `cloudAmount` = .22 coincide.
- ⚠️ El HTML solo expone lineWidth, contrast, saturation, paint; el Generador además tiene: outline, shadowDepth. El editor mostrará los controles del Generador (canónicos).

## Césped (V12 ↔ `grass-config.js`)
- ✅ Los 51 parámetros por defecto de V12 son idénticos a `GRASS_DEFAULTS`.
- ✅ Preset «bajo» coincide.
- ✅ Preset «medio» coincide.
- ✅ Preset «alto» coincide.
- ✅ Preset «ultra» coincide.
- ⚠️ Ocarina Remake V1 = `GRASS_DEFAULTS` + `{height:.29,width:.035,curvature:.22,sizeVariation:.65,density:100,preset:'personalizado',root:'#203b21',main:'#4d7529',tip:'#91ad43',windStrength:.18,windSpeed:1.25,blades:5,lod0:12,lod1:50,transition:4,lod1Density:.15}` → se adopta como perfil de parámetros (sin motor nuevo).

### Las 13 variantes de V12 y cómo se integran
| # | Variante | Técnica | Decisión |
|---|---|---|---|
| 1 | Trigun | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 2 | Zelda | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 3 | Studio Ghibli | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 4 | Dispatch | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 5 | Color | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 6 | Color + línea | Parámetros sobre `GrassField` + tinte del estilo | Perfil de parámetros (motor compartido) |
| 7 | Ocarina Remake V1 | `GrassField` con `ootDefaults` | Perfil de parámetros (motor compartido) |
| 8 | Colina original | `ColinaQuijote` (ya en el visor) | Se conserva; el editor expone sus controles existentes |
| 9 | Ocarina Remake V2 | Módulo incrustado `ColinaOcarinaV2.js` | Evaluar en F2 (ver PENDIENTES) |
| 10 | Ocarina Remake V3 | Módulo incrustado `ColinaOcarinaV3.js` (863 304 triángulos) | Evaluar en F2 (coste alto) |
| 11 | Ocarina Remake V4 | Módulo importado `ocarina4` | Evaluar en F2 |
| 12 | Pradera V5 | Módulo `meadow` (5×5 m) | Evaluar en F2 |
| 13 | James Smyth | `grass-james-*` ya existe en el Generador | Perfil sobre `GrassField` (material James) |

## Palabras reservadas GLSL ES 3.00 en los shaders del césped del Generador
- ✅ grass-shaders.js: sin declaraciones de palabras reservadas.
- ✅ grass-james-source.js: sin declaraciones de palabras reservadas.
- ✅ gmaterial.js: sin declaraciones de palabras reservadas.

**Sin diferencias.**
