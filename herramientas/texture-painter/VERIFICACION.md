# Verificación — 22 de octubre de 2026

## Actualización 0.1.2 — selección y preservación de pestañas

Ambos paquetes actualizados a 0.1.2. El add-on temporal de la sesión también se
actualizó, conservando los ajustes, referencias, grupos, capas y el historial de
píxeles. No se guardó ni sobrescribió Lamine.blend.

La selección cambiaba internamente pero el resaltado 3D no se dibujaba en la vista
simplificada. Ahora usa POST_PIXEL y un paso de profundidad propio, independiente
del interruptor de overlays. UV, clic 3D, grupos y agentes comparten la selección,
el objeto y la página de material. Mayús quita/añade islas y vuelve al atlas de la
selección restante. El controlador se reinicia después de cargar un archivo.

Los manipuladores del rig quedan ocultos únicamente en el pintor y los eventos
CLICK/RELEASE de selección no se propagan a herramientas nativas. No se bloquean
los eventos de la pintura nativa. Esto se reaplica al abrir el espacio de trabajo
y al cargar archivos antiguos, sin afectar el espacio habitual de rigging.

La comparación con materiales originales reprodujo el defecto de pestañas solo
con las bases preparadas antiguas. La textura original de 1024×256 se estaba
convirtiendo en 1024×1024 y sus nodos de muestreo se reemplazaban. Se conserva ahora
una copia nativa exacta del búfer actual y el nodo original de muestreo en la copia
del material. Se protegen también píxeles generados o aún no guardados. Las bases
antiguas se migran sin perder pintura ni borrar la base anterior.

Verificación de esta versión:

- 31 pruebas del flujo de pintura y exportación aprobadas de nuevo.
- 21 pruebas del flujo simple para agentes aprobadas de nuevo.
- 22 pruebas nuevas de selección entre materiales, máscaras rectangulares,
  muestreo, migración y dimensiones de PNG incorporadas en GLB aprobadas.
- Render GPU real de ambos callbacks: la misma isla uv-46e6ad17bd112e8a queda
  resaltada desde UV y desde modelo, con overlays de Blender desactivados.
  Evidencia: selection-gpu-result.json, selection-model-gpu.png y selection-uv-gpu.png.
- Comparación del área de los ojos entre material de trabajo corregido y original:
  diferencia media lineal de 0,000078; no reaparece el aspecto roto. Evidencia:
  eye-material-compare.json, eye-working.png y eye-original.png.
- Se conservan coordenadas de vértices, topología, UV y coordenadas de Shape Keys.
  Durante la sesión interactiva variaron valores de expresión y matrices de pose;
  no se certifica igualdad de esos valores con la primera captura ni se los fuerza
  a valores anteriores. Las pruebas GPU inmediatas sí conservaron sus respectivas
  instantáneas completas. Se añade protección frente a clics en manipuladores.
- MCP real: cuatro herramientas simples y contexto de selección compartido.
  El modo avanzado incorpora selection_status; la habilidad del agente se actualizó.
- GLB y PNG de Lamine regenerados, con delineado nativo 1024×256. El GLB corregido
  volvió a renderizar en Three.js r180/WebGL 2 con passed=true, sin errores de sRGB
  o flipY. Se mantiene el límite ya documentado: no certifica transporte del rig.
- El validador de extensiones de Blender aprobó el ZIP. Integridad y hashes en
  dist/packages.json. El puente de prueba se detuvo al finalizar.

Computer Use se interrumpió mediante Escape durante la revisión. No se reanudó en
ese turno. La comprobación final de resaltado usó renderizado GPU de las funciones
reales, sin automatizar nuevos clics; el controlador registró interacción durante
la sesión. La instalación permanente de los ZIP sigue pendiente.

## Actualización 0.1.1 — agente simplificado

El plugin expone solo cuatro herramientas por defecto: painter_help,
start_painting, paint_named_region y export_painting. Las 25 anteriores se
conservan como modo avanzado opcional. La habilidad principal da un flujo corto;
los detalles técnicos quedan en una referencia aparte. Se añadió manifiesto
para Claude Code y se mantuvieron los de Codex y el formato portable.

21 comprobaciones del flujo automático aprobadas en una escena sintética:
`evidence/agent-test-results.json`. Incluyen pintura por nombres de región/color,
preparación automática, reutilización de capas, conversión de hex sRGB, protección
de malla/UV/Shape Keys, exportación PNG/GLB y bloqueo antes de modificar datos si
faltan nombres, hay UV compartidas sin autorización o el destino ya existe.

Se probó el protocolo MCP real con el Lamine abierto: devuelve exactamente cuatro
herramientas y el grupo existente CHAQUETA_PRUEBA, con respuesta compacta y sin
volcar caras o coordenadas UV. Evidencia: `evidence/mcp-agent-test.json`. Esa prueba
solo consultó Lamine; no lo pintó ni lo guardó. El puente temporal se detuvo al
terminar. La interfaz manual del add-on no se modificó para esta actualización.

El usuario o agente principal debe mapear regiones y nombrar colores una vez.
Después el flujo repetitivo puede ejecutarse sin interpretar la geometría.
No se ha ejecutado aún una prueba con Luna o Haiku como modelos. La instalación
permanente del plugin y del add-on 0.1.1 sigue pendiente; los ZIP están construidos.

## Resultado comprobado

Add-on local de Blender y plugin local de Codex construidos como paquetes privados.
El add-on está cargado temporalmente en el Blender abierto para la prueba; esto
no equivale a instalación permanente. El plugin de Codex está empaquetado y su
servidor MCP se probó como proceso real, pero no se instaló en el host de Codex.

## Lamine y conservación

Archivo utilizado: `D:\Español\imagen para animación\Nueva carpeta\Lamine.blend`.
Malla principal: Lamine; 33.019 vértices, 36.162 caras, 121 Shape Keys y 288 islas
contando todos los materiales. Cada atlas muestra únicamente el material activo.

`evidence/final-preservation.json` confirma que los hashes de vértices, aristas,
caras, UV y coordenadas/valores de Shape Keys coinciden con la inspección inicial.
También se conservan modificadores, acciones y drivers de Shape Keys. Las
definiciones de huesos de los rigs coinciden con la inspección inicial.

Se observó una diferencia en salidas evaluadas de algunos huesos de párpados
respecto a la primera inspección de la sesión. No se atribuye a la pintura: la
prueba de activación de pincel y la exportación, comparadas inmediatamente antes
y después, conservaron exactamente los datos del rig y la pose de sus respectivas
instantáneas. No se escribieron valores de pose para intentar forzar coincidencias
con un estado evaluado anterior. No se ejecutó guardado de Lamine.blend.

## Interfaz y selección

- Interfaz propia sobre tres áreas internas de Blender, con paneles habituales,
  barras de herramientas, cabeceras y estanterías ocultos en ese espacio de trabajo.
- Atlas blanco sobre negro: `evidence/atlas-uv-limpio.png`. Cobertura blanca real
  75,58 %. No es un dibujo nuevo: procede de las UV existentes.
- Se corrigió la superposición incorrecta de UV de materiales auxiliares sobre el
  material principal. Las líneas internas quedan desactivadas por defecto.
- El controlador de eventos de la interfaz se probó en ambas direcciones con
  coordenadas de pantalla: UV → isla de chaqueta, modelo → isla de la cara pulsada.
- El contador pasó de 2 eventos de prueba a 13 eventos registrados mientras se
  utilizaba la interfaz. Seleccionar almacena identificadores y dibuja overlays;
  no pinta píxeles ni cambia coordenadas UV o geometría.
- Computer Use se detuvo cuando el usuario pulsó Escape. No se volvió a utilizar.
  Las comprobaciones posteriores usaron Blender Native, archivos y pruebas aisladas.

## Pintura y persistencia

31 comprobaciones aisladas aprobadas en Blender 5.2.0 LTS. Resultado detallado:
`evidence/test-results.json`. Incluyen identificadores estables de isla, regiones
superpuestas y confirmación, grupos, relleno limitado, capas/visibilidad,
borrado, trazos con máscara UV, deshacer/rehacer, exportación PNG y GLB, conservación
de la malla y Shape Keys, y guardado/reapertura de un archivo sintético.

Activación real del pincel 3D Paint Hard con máscara de caras y retorno a Object
Mode verificada sin cambios de malla o rig: `evidence/brush-activation-result.json`.
No se certifica aquí una sesión manual completa de pincel 3D con todos los modelos.

## Three.js

Prueba con `evidence/Lamine-export/Lamine_ThreeJS.glb`, de 55.145.464 bytes.
Se abrió con GLTFLoader de Three.js r180 y se renderizó en Chrome/WebGL 2.
Resultado visual: `evidence/threejs-lamine.png`.

La prueba mostró 20 mallas, 6 con UV, 6 materiales con textura, 12 mallas con morphs,
0 materiales con espacio de color incorrecto y 0 texturas con flipY incorrecto.
El resultado automático visible en la captura fue `passed: true`.
El rojo corresponde solamente a la región de chaqueta aprobada; no se coloreó
el resto del personaje. Los PNG de 8 bits se comprobaron leyendo sus bytes y
comparándolos con el color sRGB esperado, incluido el PNG incorporado en el GLB.

El GLB de prueba contiene 0 skins. Se verifica transferencia de texturas y morphs,
no la reproducción íntegra del rig de Blender en Three.js. La conservación del
rig original de Blender se verifica por separado, como se describe arriba.
La exportación GLB no modifica la malla del archivo de trabajo.

## Codex y paquetes

Servidor MCP Node probado mediante initialize, tools/list y consultas reales al
Blender conectado: 25 herramientas descubiertas, estado de Lamine y una región
de 1.586 caras consultada correctamente. Resultado: `evidence/mcp-test.json`.
Se detuvo el puente temporal al finalizar las pruebas. El botón Codex lo activa
de nuevo cuando se necesite. No se guardan credenciales en los paquetes.

Los ZIP se inspeccionaron y pasaron comprobación de integridad; contienen solo
runtime/licencia/manifiestos/habilidad, sin escenas, respaldos, cachés ni pruebas.
El ZIP de Blender pasó el validador de extensiones de Blender con salida correcta.
Hashes y tamaños: `dist/packages.json`. Instrucciones y límites: `README.md`.

Pendiente: instalación permanente en Blender/Codex y verificación de descubrimiento
en el host de Codex después de esa instalación. El aislamiento de subregiones,
UDIM y la transferencia íntegra del rig quedan fuera de esta primera versión.
