# Paquetes y maniquí femenino — 9/11/2026

Los cuatro paquetes se leen en su sitio desde:

`D:\Español\imagen para animación\Ambiente\animaciones\paquetes`

No se copiaron a la biblioteca local del taller. `biblioteca\rutas.json` conserva el enlace a esa carpeta.

| Librería | Archivos activos | Clips |
|---|---:|---:|
| UAL 1 | 1 GLB Standard | 43 |
| UAL 2 | 1 GLB Standard + maniquí femenino GLB | 43 |
| Humane | 24 FBX | 24 |
| Fútbol (mocap) | 21 FBX UE5 | 21 |
| Total | 48 | 131 |

## Organización sin duplicados

- Los ZIP/RAR originales se **movieron** a `paquetes\fuente`. Se comprobaron sus SHA-256 antes y después del movimiento.
- Cada paquete conserva una carpeta propia. Los archivos activos están en `Masculinas` o `Femeninas`.
- UAL usa solamente los GLB Standard. Las variantes Unity/FBX, Blender y Root Motion permanecen en los comprimidos; no se extrajeron variantes equivalentes adicionales.
- Fútbol usa solamente los 21 FBX UE5, sin extraer las variantes Unity o iClone.
- El maniquí femenino está una sola vez en `Universal Animation Library 2[Standard]\Femeninas\Mannequin_F.glb` y aparece como **Maniquí femenino (Quaternius)** en Preparar.
- `paquetes\_organizacion.json` registra rutas, entrada de archivo original, perfil, tamaño y SHA-256 de cada archivo extraído y de los cuatro comprimidos movidos.

## Masculinas y femeninas

Se aplica el criterio solicitado: **la clasificación pertenece a la carpeta/maniquí de origen, no al personaje elegido para reproducir el clip**. Los archivos de las cuatro bibliotecas de movimiento quedaron organizados en Masculinas. El maniquí femenino tiene perfil femenino, pero no contiene clips propios: el README incluido en su carpeta original explica que reutiliza las animaciones de las bibliotecas porque comparte su rig.

**Corrección: UAL 1 y UAL 2 se muestran en ambos filtros, Masculinas y Femeninas**, porque comparten las secuencias entre los maniquíes. Cada librería tiene 43 clips únicos: Masculinas muestra esos 43 y Femeninas muestra los mismos 43, con idénticos IDs, sin archivos ni entradas duplicados. Las tarjetas indican «Masculinas y femeninas». El perfil de origen de la carpeta se conserva como metadato; no restringe la disponibilidad compartida de UAL. Humane y Fútbol conservan su clasificación anterior.

Cada carpeta clasificada contiene `_biblioteca.json`:

```json
{"perfil":"male"}
```

Se admite `male` o `female`. El servidor hereda el perfil hacia las subcarpetas, y una subcarpeta puede definir otro perfil. Los archivos sin metadatos conservan el clasificador existente basado en su indicación explícita. Las bibliotecas anteriores no se reclasificaron en bloque.

El taller aplica el perfil al cargar los clips, también cuando están en caché. Los filtros existentes **Masculinas**, **Femeninas** y **Sin especificar** usan ese dato; para UAL, reconocen expresamente la pertenencia a ambos perfiles. La API `biblioteca` devuelve `perfil` (origen) y `perfiles` (pertenencia a los filtros), y acepta el filtro `perfil`:

```powershell
node herramientas/ia.mjs biblioteca '{"libreria":"UAL 2","perfil":"male","limite":100}'
node herramientas/ia.mjs ponerPersonaje '{"id":"femenino"}'
node herramientas/ia.mjs usarClip '{"id":"lib:ual_1:walk_loop"}'
```

## Verificación

- El servidor encuentra 48 archivos activos, sin hashes de contenido repetidos.
- El taller carga los 131 clips esperados y detecta el maniquí femenino con 52 huesos canónicos mapeados.
- Se comprobaron poses de una muestra de cada librería sobre `Anciano Meshy (Mixamo).glb`, sin valores no finitos. Informe: `reports\paquetes_verificacion.json`.
- Se revisaron capturas reales del maniquí femenino con UAL 2 y caminando con UAL 1: `reports\capturas\paquetes_maniqui_femenino_*.png`.
- La consola del navegador no informó errores ni advertencias durante la carga.
- `npm test`: 9 aprobadas. `npm run build`: correcto, con las advertencias existentes de imports estáticos/dinámicos.

La revisión visual es de muestras; no representa una aprobación del usuario ni una revisión manual de todos los fotogramas de los 131 clips.

## Esperas (100 Idle) — 14/11/2026

- Origen: `100 Idle Animation Pack (Iclone fbx).zip` (en `imagen para animación\Blender Add ons\MOcap`). Se extrajeron sus 108 FBX en `biblioteca\paquetes\100 Idle Animation Pack\` con nombre limpio (`AS_X.AS_X.fbx` → `AS_X.fbx`), se comprobó cada uno contra el zip por SHA-256 y el zip **se eliminó** a petición del usuario (no se movió a `fuente`). Hashes en `_organizacion.json`.
- Aunque el zip dice «iClone», el esqueleto es el del maniquí de **Unreal (UE4)**: `pelvis`, `upperarm_l`, `thigh_r`… (68 huesos, sin malla). Lo lee la convención `ue`; no es un rig AccuRig.
- Aparece como librería **Esperas (100 Idle)** (108 clips, 2–65,7 s): de pie, apoyado, en barra/agarradera y sentado (normal, teléfono, dormir). Sin perfil masculino/femenino: el pack no lo indica.
- Verificado: diferencia ≤ 1,5° por segmento entre el FBX original y el clip convertido (StandUpright, StandLean, Sit_Phone); probado en el Estudio con Rachel (sentada con teléfono y de pie).
- En la misma carpeta MOcap sigue `100 Idle Animation Pack_UE5.1+.rar` (variante UE5 del mismo pack); no se tocó.

## MOcap abiertos (FBX/BVH) y categorías — 14/11/2026

Se importaron a `biblioteca\paquetes\` **679 archivos** de los packs de `imagen para animación\Blender Add ons\MOcap` que traían formato abierto, sin duplicados (SHA-256 contra toda la biblioteca: 0 repetidos). Todo está registrado en `_organizacion.json` (origen, entrada, perfil, bytes y hash). Los originales se **eliminaron** de MOcap tras comprobar cada hash y ver los clips cargados en el Taller.

| Carpeta (librería en el panel) | Origen | Archivos | Perfil |
|---|---|---:|---|
| `505 Survival Mocap` (Supervivencia (505)) | 505_Survival_Mocap_Animations.rar | 354 | Sin especificar |
| `Church People` (Iglesia (Church People)) | ChurchPeopleAnims.rar | 123 | Por nombre: Male/Female; sacerdote = Sin especificar |
| `Conversations Michael 8` (Conversación (Michael 8)) | Conversations Animation Collection - Michael 8.rar | 30 GLB | Masculinas (Genesis 8 Male) |
| `Anime Genesis 8` (Anime (Genesis 8)) | Anime Animations.rar | 10 BVH | Por carpeta Male/Female |
| `Mocap_Pack_01/02/03/04/06/07/08` | zips Mocap Pack | 132 | Sin especificar |

- 505 Survival trae cada movimiento dos veces (IP en el sitio y RM con desplazamiento): se usa IP y solo las 10 RM que no tienen versión IP.
- Mocap Pack: solo la variante UE5 (las de iClone/Rokoko son el mismo movimiento).
- Michael 8: el FBXLoader de three.js no lee esos FBX de Daz (`[0].ID` de undefined). Se convirtieron con Blender 5.2 a GLB (solo esqueleto + animación, 35 MB en vez de 500); el hash del FBX original se guarda en `converted` dentro de `_organizacion.json`.
- Nuevo en el código: lector **BVH** (`src/io/loaders.js`), convención **Daz Genesis 8** (`src/core/humanoid.js`) y nombres de librería (`packName` en `src/main.js`).
- `Mocap_Pack_05_Soccer.zip` de MOcap era idéntico (SHA-256) al de `paquetes\fuente`: se eliminó la copia de MOcap.

### Panel de biblioteca
- `src/core/library-categories.js`: **Categoría › Subcategoría** por nombre del clip y carpeta de origen (inglés o español), ~20 categorías y ~80 subcategorías (Conversación › Escuchar, Vida diaria › Puertas y ventanas, Locomoción › Agacharse y sigilo…).
- «Todas las librerías» busca por categoría en todos los packs; cada tarjeta muestra su librería, su categoría y su perfil.
- El árbol cuenta con el filtro Masculinas/Femeninas/Sin especificar aplicado; el buscador encuentra por nombre, categoría, librería o carpeta.

### Lo que sigue en MOcap (no importado)
- **rlMotion / iMotion / iMotionPlus** (formato cifrado de iClone, ~4.500 movimientos): solo iClone los abre. iClone 8 Personal está instalado (`D:\AccuRig\iClone 8`) y se probó un plugin propio (`Bin64\OpenPlugin\SpanStoriesConversor`) que exporta a FBX: funciona, pero la edición Personal limita la exportación FBX a **30 usos en total** y corta a 30 s. Se gastaron 2 en la prueba. Queda pendiente de decisión del usuario.
- **uasset** de Unreal (Cooking Basics, Female Mocap Vol1, gestures mocap collection, 100 Idle UE5): hacen falta Unreal Engine para exportarlos. El 100 Idle UE5 es la variante del pack ya importado.
- **iAvatar** (Business People, Beachwear, Catering, Construction, EMTs) y **OBJ** (Law Enforcers): son personajes, no animaciones.
- **Studio Mocap-Magical Moves.rar**: pide contraseña.
- **SCARED .unitypackage**: hace falta Unity.

## Animales › Caballo y jinete — 18/11/2026

Pestaña **Biblioteca › Animales** (`src/ui/animales.js`). El caballo tiene esqueleto propio (no humanoide): sus clips se reproducen nativos con un `AnimationMixer` sobre su modelo y **no pasan por el espacio canónico**. El **jinete es el maniquí del Taller** y sí es humanoide: sus clips están en la librería normal **Jinete (a caballo)** y sirven para cualquier personaje.

### Caballo (nativo)
- Origen: `Horse Animset Pro (Riding System) v4.5.2.unitypackage` (Malbers). **137 clips FBX** de `Animations Clips/Horse` (sin `Horse_A`, pose de referencia de duración 0), el modelo `Horse Realistic.fbx` y su albedo y normal marrón (≈ 60 MB).
- Dónde: `biblioteca/animales/Caballo/{clips,modelo}/` + `_animal.json` (modelo, texturas, mallas a ocultar —silla, riendas, armadura, copias LOD, 2.ª crin—, color del pelo, `excluir`, `montura`). Otra especie = otra carpeta con la misma forma.
- Servidor (`herramientas/plugin.mjs`): `/api/animales` y `/animales/<especie>/…`. `biblioteca/animales/` queda **fuera** de `/api/biblioteca` y de la vigilancia, para que el conversor humanoide no lea esqueletos de caballo.
- Categorías (por nombre): Marcha (paso, trote, medio galope, galope y carrera, laterales), Giros, Saltos, Reposo y gestos, Reacciones, Natación, Vuelo, y **Montar y desmontar** (clips del jinete). Nombres traducidos al español.
- Reproductor: ▶/⏸, posición, velocidad 0,25–2×, bucle, **En el sitio** (quita el avance de la raíz; por defecto sí) y **Con jinete**. El modelo cuelga de un nodo `Root`; del `Root` de los clips solo cuenta lo que cambia respecto al primer fotograma (traen el eje del exportador en todos los fotogramas).

### Jinete (humanoide, maniquí)
- 84 clips `Rider_*` movidos (sin copia) a `biblioteca/paquetes/Jinete (Horse Animset Pro)/`; librería **Jinete (a caballo)** (autor Malbers), en la categoría **Animales** (Marcha, Saltos, Reposo, Reacciones, Nadar y volar, Montar y desmontar).
- Nueva convención de esqueleto `malbers` (`src/core/humanoid.js`): huesos `R_…`; la cadera es `R_Pelvis` (R_CG, su padre, queda sin mapear). Se mapean los 52 huesos canónicos.
- Con **Con jinete** activado, al elegir un clip del caballo el **maniquí** (Maniquí cuando no se está dentro del Estudio) toma el clip de jinete que corresponde: 92 coincidencias exactas por nombre, 33 aproximadas (p. ej. `Trot_Strafe_*` → `Trot`) y 12 sin pareja (comer, beber, recuperarse, vuelos laterales) que se quedan sentado en reposo. El reloj del caballo manda; el jinete muestra el mismo instante.
- Se sienta con `engine.mount` (`src/core/animation.js › applyMount`): desplazamiento de la cadera en metros de mundo, solo de visualización (no se guarda ni se exporta). `montura` en `_animal.json` lo fija; en montar/desmontar se calcula para que el último fotograma caiga en el asiento y se conserva el avance del clip.
- Al entrar en Animales se pasa a modo Maniquí y se recuerda el modo y el documento; al salir (o quitar «Con jinete») se devuelven tal cual. Mientras se está en Animales, la animación del maniquí es la del jinete elegido.

### Fuera a propósito y límites
- No extraído: `.anim` de Unity (`Jump_*_Land`, `Canter`, `Gallop_Left`: YAML de Unity), `Wings_*` (caballo alado), carro, dragón, elefante y armas del jinete (sin las armas no tienen sentido).
- 7 clips (`Eat`, `Gallop_*`) traen pistas de `Chest`/`Back`, huesos que este modelo no tiene; se ignoran.
- Montar (clips `Rider_*` sueltos) sigue siendo aproximado. El **desmonte de las escenas** ya no usa el clip de Malbers (atravesaba a Rocinante): es procedimental, ver abajo.

### Física del jinete y escenas (18/11/2026)
- `src/core/rider-physics.js`: tras colocar la pelvis del clip `Rider_*`, contacto real con el asiento (campo de alturas de la silla rígido a su hueso; glúteos a −0,6 cm, dos pasadas con el IK de piernas), piernas por IK hasta los estribos (rodilla adelante y afuera, talón abajo), brazos por IK a un punto de riendas fijo delante del borrén y puños de rienda (muñeca recta, pulgar tendido sobre la rienda, palmas enfrentadas). La rienda entra por el meñique y sale sobre el pulgar.
- `src/core/rider-dismount.js`: desmonte por la izquierda de 3 s medido sobre la silla y el cuerpo del caballo (borrén, arzón, estribos, grupa, barril): manos a la cruz y al borrén, pierna derecha estirada en arco sobre la grupa, cruzado sobre la silla, deslizamiento con las manos en el asiento, aterrizaje con flexión y dos pasos sin patinar.
- `animales.js`: transiciones con fase alineada (cada marcha termina en el punto de su ciclo que coincide con el clip siguiente) y avance sin deslizamiento en clips de una vez (parada, salto): velocidad de los cascos apoyados; en el aire se conserva el momento.
- Alturas: Rocinante 2,00 m en reposo (orejas) y Don Quijote 1,85 m, según `personajes.json`. En `H_Idle_01` el caballo baja la cabeza a 1,71 m: no es un error de escala.
- Verificado en el Taller suelto (5189): trote con el maniquí montado, montar por la izquierda, volver al estado anterior al salir, 84 clips de jinete convertidos con la convención `malbers`, `npm test` (151) y build. **No probado dentro del Estudio (3000).**

### Rig con Animales abierto, favoritos y pack (18/11/2026)
- Antes, con Biblioteca › Animales abierta, el Taller ocultaba todos los controles (`handles.visible = false`) y la escena montada era solo vista previa: «Rig», «Editar movimiento» y Mover/Rotar/Escalar no hacían nada visible.
- Ahora, abrir **Rig** o **Editar movimiento**, o elegir **Arrastrar/Mover/Rotar/Escalar** en la barra del visor, pide el rig (`animales.pedirRig`): con el jinete, la escena pasa a la **capa Base** (se guarda, deja de ser vista previa) y se ven sus puntos y círculos; el motor manda (tiras + claves del usuario) y la escena solo lo vuelve a sentar en la silla. Con Rocinante (o si el personaje elegido es el caballo) se abre el **editor de cuatro patas**.
- En el panel Rig, «Rig de»: botones **Jinete** / **Rocinante** para cambiar entre los dos.
- Favoritos por separado: Galope, Salto, Medio galope, Trote, Paso, Parada, Reposo y Desmonte (más la escena completa).
- **Pack** (Favoritos › Pack (en la capa Base)): las ocho seguidas, una tira por animación en Base, sin fundido entre clips del jinete (blend 0). Al pulsarlo va directo a Base con el rig listo.
- Tras recargar, una escena que estaba en Base conserva el documento con las claves (`animalSesion.base`).
- Verificado en el Taller (5189, con el estado del Estudio): rig visible del jinete y de Rocinante, clave de cabeza que se mantiene y se deshace, pack con 8 tiras, recarga conservando la clave. `npm test` 169. **No probado dentro del iframe del Estudio (3000).**
