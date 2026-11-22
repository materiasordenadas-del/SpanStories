# Animaciones Unreal → Taller → personajes GLB con rig Mixamo

Integración local realizada el 9 de noviembre de 2026 para **Free100Animations.zip**, sin instalar ni ejecutar Unreal Editor.

## Resultado y ubicación

- Original único: `D:\Español\imagen para animación\Animación 3D\taller-animacion\biblioteca\fuente\Free100Animations.zip`. Se conserva aquí porque es el archivo fuente; no se movió ni se copió el ZIP.
- Animaciones utilizables: `biblioteca\Free 100 Animations\`: **202 GLB**, uno por secuencia, incluidos **3 clips de pose estática**. Ocupan aproximadamente 101 MiB.
- En el taller: **Biblioteca → Free 100 Animations**. Es una librería independiente; no se mezclan estos archivos con las descargas de Mixamo.
- Trazabilidad: `biblioteca\Free 100 Animations\_manifest.json`, `_conversion.json` y `_verification.json`.
- No se modificaron los personajes originales ni el código de retargeting, interfaz o biblioteca. Se añadieron archivos y herramientas de conversión.

El nombre comercial del ZIP dice 100, pero contiene 202 secuencias recuperables. Se conservaron sus nombres originales; no se deduplicaron acciones por similitud de nombre.

## Usar con un GLB Mixamo

1. Abrir el taller en `http://127.0.0.1:5189` (`npm run dev` desde la carpeta del taller si está apagado).
2. Elegir el personaje GLB ya rigueado con Mixamo en Preparar. Los personajes permanecen en `biblioteca\personajes`.
3. Abrir Biblioteca, elegir **Free 100 Animations** y usar el clip deseado o arrastrarlo a la línea de tiempo.
4. Revisar inicio, mitad y final. Elegir «en sitio» o desplazamiento según la acción; ajustar bucle si hace falta.
5. Exportar desde el taller para obtener el **personaje de destino con la animación aplicada**. Los GLB de esta biblioteca contienen el esqueleto de origen y movimiento, sin malla: son entradas del retargeter, no personajes Mixamo ya exportados.

El taller detecta los nombres Mixamo (`mixamorigHips`, etc.), convierte el movimiento de origen a su espacio canónico y lo aplica al rig del personaje. No se deben renombrar los huesos del GLB de origen como si fueran Mixamo: sus ejes y su pose de referencia son distintos.

Ejemplo por la API existente, con la página del taller abierta:

```powershell
Set-Location 'D:\Español\imagen para animación\Animación 3D\taller-animacion'
node herramientas/ia.mjs ponerPersonaje '{"id":"Anciano"}'
node herramientas/ia.mjs biblioteca '{"libreria":"Free 100 Animations","limite":5}'
node herramientas/ia.mjs usarClip '{"id":"lib:free_100_animations:mf_unarmed_walk_fwd"}'
node herramientas/ia.mjs reproducir '{"activo":true}'
```

## Cómo se convirtió este set

El ZIP no contiene FBX, GLB ni GLTF: contiene assets editables `.uasset`. La herramienta [UAssetAPI 1.1.0](https://github.com/atenfyr/UAssetAPI) permite leer sus propiedades sin el editor.

1. `herramientas\unreal-reader` lee el ZIP en memoria. Recupera `TransformParameterNamesAndCurves` de las secciones FK del `AnimationSequencerDataModel`: canales de traslación, rotación y escala de cada `*_CONTROL`. No ejecuta scripts ni plugins del proyecto Unreal.
2. Del asset `SK_Mannequin.uasset` se leen **161 huesos**, su jerarquía y pose de referencia. Se comprueban los índices de padres y la cantidad de transformaciones.
3. `herramientas\unreal-glb.mjs` genera GLB autocontenidos a **30 fps**. Convierte centímetros a metros, coordenadas Unreal a glTF (`[x,y,z] → [-y,z,x]`) y rotadores Unreal a cuaterniones con el cambio de base correspondiente. Conserva la jerarquía y el reposo, y asegura continuidad del signo de los cuaterniones.
4. Cada GLB se prueba con `Rig` y `clipFromAnimation` del propio taller. Las 202 secuencias producen **52 pistas canónicas** cada una. La carga de la biblioteca y el retargeting existente se encargan del personaje Mixamo.

## Reproducir la conversión

Requisitos: Node y dependencias del taller instalados, .NET SDK 10 y acceso a NuGet en la primera restauración. No requiere Unreal, Blender ni FBX. Ejecutar desde la raíz del taller:

```powershell
Set-Location 'D:\Español\imagen para animación\Animación 3D\taller-animacion'

# Usar una carpeta de canales nueva en cada extracción: no sobrescribe datos existentes.
dotnet run --project herramientas/unreal-reader -- 'biblioteca/fuente/Free100Animations.zip' 'reports/free100-import/canales'
dotnet run --project herramientas/unreal-reader -- 'biblioteca/fuente/Free100Animations.zip' 'reports/free100-import/canales' --skeleton

node herramientas/unreal-glb.mjs 'reports/free100-import/canales' 'reports/free100-import/canales/_skeleton.json' 'biblioteca/Free 100 Animations'
node herramientas/verificar-unreal.mjs 'biblioteca/Free 100 Animations' 'biblioteca/personajes/Anciano Meshy (Mixamo).glb'
```

El lector produce `_extraction.json` con el resultado de cada asset. El conversor produce `_conversion.json`: rechaza un GLB ya existente si su contenido es diferente; si es idéntico lo conserva. Los informes de estas herramientas se actualizan al ejecutarlas. Los temporales de compilación de .NET se guardan en `reports\unreal-reader-build`, fuera de las carpetas observadas por Vite.

Si el taller estaba abierto durante la conversión, recargar la página una vez terminada: las escrituras directas de archivos no envían el evento del descargador Mixamo.

## Límites y decisiones de esta integración

- Se recuperaron **202 secuencias** de los **207 assets** bajo `Anims`. Los otros 5 son `AO_Pistol`, `AO_Rifle`, `MM_Pistol_Fire_Montage`, `ABP_Unarmed` y `BS_Idle_Walk_Run`: lógica/mezcladores, no clips independientes. Se registran en el manifiesto y no se presentan como animaciones fallidas.
- Los 3 assets `MM_Rifle_Idle_ADS_AO_CC/CD/CU` tienen un único fotograma. Se exportan como poses sostenidas de dos muestras iguales, con duración de 1/30 s.
- En 8 secuencias hay 20 nombres de huesos correctivos que no existen en el esqueleto de referencia usado: `correctiveroot`, `twistcor` y `kneeback`. Se omiten mediante una lista de patrones limitada y se enumeran por clip en el manifiesto. Ningún hueso corporal desconocido se omite silenciosamente. Mixamo no recibe estos correctivos específicos de Unreal.
- Se exporta el movimiento de las secuencias, no notifies, blueprints, aim offsets compuestos, montajes, lógica de juego, armas o materiales Unreal. Un clip llamado Additive entra como movimiento/pose de origen; no se reconstruye automáticamente su configuración de mezcla de Unreal.
- Este lector sirve para el **formato FK editable encontrado en este ZIP**. No es un importador universal de `.uasset`, assets cocinados, Control Rigs arbitrarios o animaciones comprimidas. Los canales cúbicos, velocidades distintas y huesos desconocidos hacen fallar la conversión para evitar aproximaciones silenciosas.
- La compatibilidad geométrica depende también del skin y pesos del personaje. La prueba no modifica pesos, mallas, rig facial ni ropa.

## Verificación realizada

- Integridad del ZIP: correcta; 0 FBX/GLB/GLTF originales.
- Conversión: 202/202 secuencias, sin errores; 3 poses estáticas identificadas.
- Lectura real de los 202 GLB mediante `GLTFLoader` y conversión mediante el núcleo del taller.
- Aplicación sobre `Anciano Meshy (Mixamo).glb`, detectado como Mixamo con 22 huesos mapeados: inicio, mitad y final de cada clip; matrices finitas, cuaterniones normalizados y conservación de las traslaciones locales de los huesos salvo la cadera. La prueba de Node omite únicamente la carga de materiales/texturas; conserva malla, skin e inversas de enlace.
- El taller abierto informó **202 clips** en la nueva librería.
- Revisión visual de muestras reales sobre el Anciano: caminar, discutir, ataque y reacción de muerte. Capturas en `reports\capturas\free100_anciano_*.png`. Es una revisión de muestras, no aprobación visual del usuario ni revisión manual de los 202 clips.
- `npm test`: 9 pruebas aprobadas. `npm run build`: correcto; advertencias de empaquetado por imports estáticos/dinámicos.

Para otro set, conservar su ZIP fuente, usar otra librería y verificar su esqueleto, formato de datos y resultado en un personaje destino antes de darlo por compatible.
