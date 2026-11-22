# Editor de escenarios · mapa de módulos

Cada archivo hace **una** cosa. Para cambiar una función, abre solo su archivo: los demás no dependen de sus detalles, solo de los contratos de `core/`.
`engine/CityEditor.js` es la fachada (estado, guardado, importar); `main.js` solo llama a `montarEditorVisual()`.

| Carpeta / archivo | Qué hace | Lo que NO toca |
|---|---|---|
| `Editor.js` | Orquesta: crea el shell y conecta paneles con el motor | La lógica de cada panel |
| `acciones-base.js` | **Todas** las acciones del usuario (menús, barra, clic derecho, atajos, paleta salen de aquí) | La interfaz |
| `core/Acciones.js` | Registro único de acciones, atajos y búsqueda | Qué hace cada acción |
| `core/EscenarioDoc.js` | Formato v2 del proyecto, migración v1→v2, validación | El motor 3D |
| `core/Capas.js` | Capas, grupos, bloqueo, aislar, visibilidad compuesta | La escena original |
| `core/Seleccion.js`, `Portapapeles.js`, `Tipos.js`, `Atajos.js`, `Adaptadores.js`, `Huerfanos.js` | Selección múltiple, copiar/pegar, objetos distintos vs ejemplares, teclado, qué se puede hacer con cada objeto, cambios sin destino | La interfaz |
| `herramientas/Gizmo.js` | Manipulador 3D con ratón, ejes en color, imán | Selección, historial (usa `editor.applyMany`) |
| `herramientas/Interaccion.js` | Clic, Mayús, arrastre directo (izq. suelo / der. altura), clic derecho | Cámara (la deja pasar si el gesto no es de edición) |
| `herramientas/Colision.js` | Suelo y otros objetos al mover (puro, probado) | Three.js salvo `Box3` |
| `herramientas/Colocacion.js`, `Pincel.js`, `Alinear.js`, `Vista.js`, `Cuadricula.js`, `Marcadores.js` | Colocar desde la biblioteca, pincel compartido, alinear/distribuir, cámara, ayudas | Datos del proyecto |
| `biblioteca/` | Biblioteca de GLB (una vez por SHA-256), miniaturas, inventario de la historia | Escenas |
| `ui/` | Shell de 5 áreas, menús (panel derecho), barra, jerarquía, inspector, paleta, clic derecho, biblioteca, estado | Lógica de negocio |
| `ui/tokens.css`, `shell.css`, `iconos.js`, `componentes.js` | Sistema de diseño: color, tamaños, iconos, controles | — |
| `ambiente/SceneEnvironment.js` | Dueño único de cielo, hora, niebla, clima, estilo, césped y terreno **de este escenario** | El pool global de estilos |
| `ambiente/cielo/` | 27 cielos (paletas), perfil, panel | El shader del compositor |
| `ambiente/estilo/` | Galería de estilos, A/B, presets, copiar configuración | Los shaders (son del Generador) |
| `ambiente/cesped/` | Perfiles, mapa de densidad, campo (GrassField), panel | El código del Generador |
| `ambiente/terreno/` | Mapa de materiales, capa visual, panel | El relieve |
| `variantes/` | Variantes, cámaras guardadas, marcadores, panel de escena | La geometría |

Pruebas: `tests/editor-*.test.js` (`npm test` en esta carpeta). Solo lectura de fuentes del usuario: `scripts/verificar_fuentes_editor.mjs`.
Reglas: no tocar `engine/Luz25D.js`, `GlossyFloor.js`, `CityNavigation` ni `panel/` (el Editor reubica el DOM del panel antiguo, no edita sus archivos).
