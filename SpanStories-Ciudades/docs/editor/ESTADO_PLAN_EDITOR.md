# Estado del plan del Editor de escenarios (20/11/2026)

Leyenda: ✅ hecho y probado · 🟡 parcial · 🔵 escrito pero **sin ver en pantalla** (requiere reiniciar el motor) · ❌ falta.
Verificación: `npm test` en `SpanStories-Ciudades` (137 pruebas; 134 pasan, 3 fallos antiguos ajenos), pruebas de ruta/Estudio, `tsc --noEmit` limpio y comprobaciones en un navegador real (renderizado por software, 1080p). Detalle de lo que falta: `PENDIENTES_NO_RESUELTOS.md`. Mapa de archivos: `editor/EDITOR.md`.

## Tus peticiones tras revisar el plan
| Petición | Estado |
|---|---|
| Gizmo con ratón como el Taller (no con teclas) | ✅ Botones Mover/Girar/Escalar, tamaño ajustable, aros grandes, sin esfera central. Teclas W/E/R solo opcionales |
| Saber en qué eje estoy | ✅ Ejes X rojo/Y verde/Z azul en gizmo, inspector (el eje activo se ilumina), guías y widget de ejes tipo Blender. **Quitado** el mini-panel «Mover X +1,20 m» como pediste |
| Selector tipo Blender | ✅ Selector Global/Local en la barra + widget de ejes (pulsar un eje coloca la vista) |
| Mover con clic izquierdo y derecho | ✅ Izquierdo: desliza por el suelo; derecho: sube/baja. Clic derecho sin arrastrar: menú |
| No atravesar suelo ni objetos | ✅ `Colision.js` (probado) + interruptores Colisión/Apoyo; Alt los suspende. En navegador: movimiento deslizante y deshacer |
| Menú de clic derecho (eliminar, copiar, pegar…) | ✅ Sobre objeto, varios y vacío; cortar/copiar/pegar aquí/duplicar/eliminar/renombrar/agrupar/aislar/bloquear/ocultar/al suelo/restaurar/encuadrar. Copiar/duplicar solo objetos **añadidos** |
| Sistema visual ordenado, todo en un sitio | ✅ Registro único de acciones → menús, barra, clic derecho, atajos y paleta (Ctrl+K). Panel «Opciones» antiguo reubicado en el menú Vista |
| Tema claro, espacio en 1080p | ✅ Tema claro por defecto (oscuro opcional), panel izquierdo de 184 px, paneles redimensionables/ocultables |
| Cada menú superior abre en el panel derecho | ✅ |
| Biblioteca de objetos + inventario solo de la historia | ✅ Biblioteca (objetos propios + 18 árboles del ambiente) e Inventario (vocabulario que usan las escenas de este lugar, con aviso de faltantes/ocultos) |
| Contar objetos distintos, no ejemplares | ✅ «19 objetos distintos · 112 ejemplares»; jerarquía agrupa «Árbol ×66» |
| Quitar los avisos pegados | ✅ Tooltips propios eliminados (se usan los del navegador) |
| Código subdividido | ✅ 60+ archivos, ninguno > ~250 líneas (`editor/EDITOR.md`) |
| No tocar Taller | ✅ Solo lectura de `viewport.js` |

## Plan de ChatGPT, punto por punto
**5. Interfaz de cinco áreas** ✅ barra, herramientas, jerarquía, visor, inspector, biblioteca, estado; paneles contraíbles/redimensionables; pantalla completa; espacios de trabajo (Objetos / Terreno y vegetación / Cielo e iluminación / Estilo visual / Preparación de escena).

**6.1 Transformación** ✅ seleccionar, mover, rotar, escalar, local/global, imán, restaurar original, ajustar al suelo, interruptor flotante. 🟡 «Pivote» configurable: el pivote es el centro de la selección. 🟡 «Transformación libre» no distinta de mover/girar.
**6.2 Biblioteca** ✅ registro único por SHA-256, miniaturas, categorías, búsqueda, favoritos, dimensiones y triángulos, copias independientes, arrastrar GLB para añadir. 🟡 «Disponibilidad» y duplicar desde biblioteca: se coloca varias copias; instanciación GPU explícita ❌ (ver pendientes).
**6.3 Colocación** ✅ fantasma semitransparente sobre el suelo, colocar varias, giro con Mayús+rueda, duplicar, selección múltiple, agrupar, eliminar, deshacer/rehacer, encuadrar. 🟡 Los atajos existen pero todo se alcanza con el ratón.
**6.4 Jerarquía, carpetas y capas** ✅ grupos, capas (ocultar/bloquear), aislar, renombrar, visibilidad compuesta que no pisa «ocultar».
**6.5 Inspector contextual** ✅ objeto, varios, escenario, y un panel por espacio de trabajo.

**7.1 Cielos V7.1** 🟡 27 cielos como paletas × 5 horas, hora, giro/altura/intensidad del sol, luna, nubes, niebla, colores propios, clima y estación, calidad; coordinados con luz y sombras del compositor real y **sin tocar el estilo global**. ❌ Nubes volumétricas y shaders propios (ver pendientes).
**7.2 Césped V12** 🔵 perfiles (8 de 13 disponibles), apariencia, viento, luz, calidad, pincel (añadir, borrar, ±densidad, suavizar, radio, intensidad, dureza), rellenar/vaciar, historial por pincelada, guardado comprimido; motor `GrassField` probado en Node. ❌ V2/V3/V4/Pradera, altura/color local.
**7.2-C Pintar terreno** 🔵 hierba, tierra, arena, piedra, suelo seco, borrar, colores; independiente del césped. ❌ relieve.
**7.3 Estilos** ✅ galería de los 6 estilos, parámetros, previsualizar/aplicar/cancelar, comparar A/B, presets, restablecer, copiar/pegar configuración, **estilo por escenario separado del global**. ✅ Cotejo del catálogo con el Generador (`VERIFICACION_FUENTES.md`: 6/6 estilos, parámetros y 51/51 valores de césped idénticos).
**8. SceneEnvironment** ✅ controlador único (cielo, estilo, clima; césped y terreno enchufados); global / escenario / previsualización; el clima ya no escribe en el pool.
**9. Estructuras** ✅ adaptadores (`glb`, `atlas`, `original`, `bloqueado`) y «Editar en el Generador». 🟡 Mover estructuras Atlas usa `AtlasEdicion` (ya existía y tiene pruebas); no repetí la prueba en navegador de colisiones/sectores.
**10. Herramientas avanzadas** ✅ selección múltiple, duplicar, grupos, ocultar, bloquear, alinear al terreno, snap, alinear y distribuir, reemplazar seleccionado, guardar como prefab, aislar, historial unificado, marcadores de cámara. 🟡 Vistas ortográficas aproximadas. ✅ Pincel de dispersión (árboles/rocas: radio, separación, escala y giro aleatorios, un trazo = una entrada de historial; algoritmo probado, y en el navegador funciona la colocación por lotes, pero con renderizado por software tarda ~40 s la primera copia: no vi el resultado completo).
**11. Variantes de escenario** 🔵 variantes (ambiente + objetos ocultos), cámaras guardadas, puntos de aparición y marcadores de personajes; en la prueba se creó una variante con un solo deshacer.
**12. Arquitectura** ✅ documento único v2 con migración v1→v2 (los proyectos antiguos se abren), historial unificado con transacciones, adaptadores, persistencia por revisiones (la ruta acepta v1 y v2; los GLB se guardan una vez por proyecto).
**13. Errores a evitar** ✅ gizmo siempre actualiza el objeto real; no hay iframes de los HTML; perfiles por escenario; ayudas de edición marcadas como overlay; ✅ cambios sin destino se listan, no se reasignan.

## Fases
| Fase | Estado |
|---|---|
| 0 Auditoría | ✅ Comparación con la rama del 5-nov (el árbol local ya traía gizmo y guardado en disco), línea base de pruebas, verificación de fuentes |
| 1 Editor visual | ✅ (criterio «10 objetos, guardar, recuperar»: guardado/recuperación probados en pruebas y ruta; no guardé desde el navegador para no ensuciar tus ediciones reales) |
| 2 Ambiente | 🟡 cielo/estilo ✅; césped/terreno 🔵 |
| 3 Mundos Atlas | 🟡 adaptadores, huérfanos, enlace al Generador; movimiento de estructuras y colisiones ya existían |
| 4 Herramientas avanzadas | 🟡 falta relieve; la dispersión no se vio terminada en pantalla |
| 5 Preparación narrativa | 🔵 variantes, cámaras, marcadores; Story Studio: campo `variantId`, selector «Variante del escenario» y mensaje `APPLY_VARIANT` (visibilidad) |

## Pruebas funcionales del plan (sección 16)
Añadir GLB ✅ · arrastrar objeto con la geometría real ✅ · duplicar copias independientes ✅ · guardar/reabrir ✅ (pruebas) · deshacer/rehacer ✅ · cambiar de sector (mecanismo `pending` existente) 🟡 · pintar césped 🔵 · cambiar cielo ✅ · cambiar estilo ✅ · perfil visual sin afectar otros escenarios ✅ (pool global comprobado sin cambios) · exportar al visor 🟡 (el visor del estudiante aplica ambiente y variante guardados; sin prueba visual) · modo exploración y colisiones 🟡 · rendimiento antes/después ❌ no medido.
