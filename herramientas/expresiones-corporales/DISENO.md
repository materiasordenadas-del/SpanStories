# Expresiones Corporales (SpanStories) — diseño

Sistema completo, igual que **Rig Labial Bendy**: un complemento de Blender 5.2 y un plugin de
Claude Code (skill) para que Claude (o un modelo pequeño) lo haga todo en orden y de la forma más
automática posible, **en cualquier personaje**. Lamine es solo el personaje de prueba.

El sistema genera, edita, guarda y reutiliza **expresiones corporales** (torso, hombros,
brazos, manos, cuello y cabeza) que acompañan a las expresiones faciales del complemento facial
sin tocarlo. Hay **una expresión corporal por cada gesto facial** (40, todos menos `neutro` y
`ojos_cerrados`), cada una en estilo **masculino (M)** y **femenino (F)**.

## 0. Piezas y responsables

```
expresiones_corporales/                  carpeta del proyecto
  DISENO.md                              este documento
  sincronizar.py  empaquetar.py  prueba_humo.py   (como en rig_labial_bendy)
  investigacion/                         notas de referencia por gesto (subagentes)
  expresiones_corporales/                la extensión (id expresiones_corporales, MIT)
    blender_manifest.toml
    __init__.py                          registro, paneles y operadores
    nucleo/
      pasos.py  linea.py                 línea de pasos: siguiente(), rehacer()   [Claude principal]
      rig_cuerpo/                        rig corporal automático (Rigify)          [Claude principal]
        medir.py metarig.py pesos.py cara.py
      perfil.py                          perfil de rig + pose neutra               [subagente Opus]
      generador.py                       parámetros -> acción                      [subagente Opus]
      retoques.py                        capturar/borrar/convertir retoques        [subagente Opus]
      biblioteca.py                      JSON de serie + biblioteca de usuario     [subagente Opus]
      capas.py                           NLA: base + expresión, cadenas            [subagente Opus]
      vinculo.py                         enlace con la cara                        [subagente Opus]
      exportar.py                        GLB + contrato JSON para three.js         [subagente Opus]
      revision.py                        hojas de render para revisar              [subagente Opus]
    biblioteca/expresiones_corporales.json   las 40 × M/F (+ neutra)              [Claude principal]
    threejs/ejemplo_capas.js
plugins-local/spanstories-market/expresion-corporal/   skill para Claude         [al final]
```

Prefijos: operadores `ecorp.*` (`ECORP_OT_*`), paneles `ECORP_PT_*` en la pestaña N
**"Cuerpo"**, propiedades `ECORP_*` (`Scene.ecorp`, `Object.ecorp`), marcadores
`ECB_<personaje>_*`, acciones `<Rig>_EC_<gesto>_<estilo>`. Código y nombres en español ASCII
snake_case, como el complemento facial.

## 1. Ideas clave

1. **Una expresión = parámetros + retoques + tiempos.** La acción se regenera desde los datos y
   los retoques manuales sobreviven.
2. **Independiente del rig.** Todo se define en el *marco del cuerpo* y sobre *huesos
   semánticos*; un *perfil* traduce a los huesos reales (Rigify y Mixamo se detectan solos;
   otros, con una tabla editable).
3. **Capas.** La acción es un **delta** sobre la pose base, en una pista NLA `COMBINE` encima de
   la base (quieto, caminar, hablar…). Solo canales de tren superior.
4. **Dos estilos de actuación** M y F: mismos gestos, distinta postura y gesticulación.
5. **Cara y cuerpo van juntos pero no atados**: el gesto facial activa el corporal del mismo
   nombre y estilo del personaje; cada uno tiene su intensidad y sus tiempos.

## 2. Línea de pasos (para cualquier personaje)

`pasos.siguiente(malla)` hace un paso por llamada y devuelve
`{'hecho','n','de','siguiente','parar','avisos','resumen'}` (mismo contrato que Rig Labial).
Estado en `malla['ecorp_hechos']`. `pasos.rehacer(malla, desde)` repite sin restos.

| n | paso | qué hace | se salta si |
|---|---|---|---|
| 1 | `detectar` | malla del cuerpo, rig facial, objetos de cara, rig corporal existente, hacia dónde mira, altura, pose A/T | — |
| 2 | `medir` | articulaciones desde la malla (y/o un esqueleto Mixamo de la escena, `rig_cuerpo/mixamo.py`: propia, Mixamo o mezcla) → marcadores `ECB_*` + esqueleto de vista previa en vivo + foto; **para**: el usuario ajusta en el panel «1. Esqueleto» (`rig_cuerpo/ui.py`, `ajuste.py`: botón Mover por articulación, flechas por grupo, simetría, volver a lo detectado) y pulsa **Confirmar** | ya hay rig corporal |
| 3 | `rig` | metarig Rigify ajustado a los marcadores, generar `<P>_Rig` | ya hay rig corporal |
| 4 | `pesos` | pesos del cuerpo sin tocar los de la cara; cabeza rígida (`rig_cuerpo/pesos.py`: proxy vóxel de la isla mayor + Bone Heat + transferencia). Retoque manual en el panel «2. Pesos y cara» (`ui_pesos.py`: poses de prueba, pintar por zona, volver a lo automático, Easy Weight si está instalado) | ya hay rig corporal |
| 5 | `cara` | emparentar rig facial / ojos / control al hueso de la cabeza sin cambio visual; modificador del cuerpo el primero | no hay cara |
| 6 | `perfil` | perfil semántico + pose neutra calibrada | — |
| 7 | `expresiones` | genera las 40 acciones del estilo del personaje (+ neutra) | — |
| 8 | `vinculo` | activa el enlace cara → cuerpo | no hay cara |
| 9 | `revisar` | hoja de renders de todas las expresiones; **para** para mirar | — |
| 10 | `exportar` | GLB + contrato JSON | si no se pide |

## 3. Marco del cuerpo y huesos semánticos

Marco del personaje (espacio de la armadura): `F` = adelante, `U` = arriba, `L` = izquierda
del personaje, `L = U × F`. Si mira a −Y: `F = −Y`, `U = +Z`, `L = +X`.

| semántico | Rigify (FK) | Mixamo |
|---|---|---|
| `cadera` | `torso` (solo rotación) | `Hips` |
| `columna` | `spine_fk.001` | `Spine` |
| `pecho` | `chest` | `Spine2` (+`Spine1`) |
| `cuello` | `neck` | `Neck` |
| `cabeza` | `head` | `Head` |
| `hombro.L/R` | `shoulder.L/R` | `LeftShoulder` |
| `brazo.L/R` | `upper_arm_fk.L/R` | `LeftArm` |
| `antebrazo.L/R` | `forearm_fk.L/R` | `LeftForeArm` |
| `mano.L/R` | `hand_fk.L/R` | `LeftHand` |
| `pulgar…menique.L/R` | `thumb.01_master.L`, `f_index.01_master.L`, `f_middle…`, `f_ring…`, `f_pinky…` | `LeftHandThumb1..3` etc. (curl repartido) |

Rigify: brazos en FK (`IK_FK = 1.0` en `upper_arm_parent.L/R`); comprobar y avisar/poner.
Respetar el `rotation_mode` de cada hueso.

## 4. Pose neutra

Las mallas de Tripo vienen en pose A o T. Los parámetros se miden **desde la pose neutra de
pie** (brazos colgando, separación natural, sin atravesar la cadera). `calibrar_neutra(rig)`
automática (medir con la malla si se puede) o `capturar_neutra(rig)` desde la pose actual.
Acción `<Rig>_EC_Neutra`. Delta: `delta_local = neutra⁻¹ · objetivo`.

## 5. Parámetros de una expresión

Ángulos en grados. `intensidad` (0–1.5) multiplica todo; intensidad por grupo `torso`,
`hombros`, `brazos`, `manos`, `cabeza` (0–1.5). Sin sufijo = los dos lados; `_L`/`_R` = un lado
(el sufijo gana).

- **Torso** (cadera/columna/pecho 15/35/50 %): `torso_inclinar` (+ adelante), `torso_lateral`
  (+ a su izquierda), `torso_girar` (+ a su izquierda), `torso_encorvar` (+ encorvarse, sobre
  todo pecho), `pecho_abrir` (+ pecho fuera / − hundido).
- **Hombros**: `hombro_subir` (+ arriba), `hombro_adelante` (+ adelante / − atrás).
- **Brazos**, desde el brazo colgando: modo ángulos `brazo_abrir` (separar de lado),
  `brazo_adelantar` (+ adelante / − atrás), `brazo_girar` (+ interna), `codo` (+ flexión),
  `antebrazo_girar` (+ pronación); o modo objetivo `mano_objetivo` = [afuera, adelante, arriba]
  desde el hombro en longitudes de brazo (afuera < 0 = hacia la línea media) + `codo_direccion`
  (grados, + codo hacia fuera); IK analítico de dos huesos.
- **Manos**: `muneca_doblar` (+ hacia la palma), `muneca_desviar` (+ hacia el pulgar),
  `dedos_cerrar` 0–1 (puño, escalonado índice→meñique), `dedos_abrir` 0–1, `pulgar_cerrar` 0–1.
- **Cuello y cabeza** (40/60 %): `cabeza_inclinar` (+ barbilla abajo), `cabeza_lateral`
  (+ a su izquierda), `cabeza_girar` (+ a su izquierda), `cuello_adelantar` (+ barbilla
  adelante).
- **`pico`**: diccionario opcional de parámetros (absolutos) en el pico de la entrada; luego se
  asienta en `params` durante `asentar`.
- **Vida** (bucle del mantener, sin costura): `respiracion`/`respiracion_periodo`,
  `balanceo`/`balanceo_periodo`, `temblor`/`temblor_frecuencia`, `rebote`/`rebote_periodo`,
  y opcional `gesto_repetido` (ver §5b).
- **Tiempos** (fotogramas a 24 fps, se reescalan): `entrada`, `asentar`, `mantener`, `salida`,
  `anticipacion` 0–0.3, `sobrepaso` 0–0.3, `curva_entrada`/`curva_salida`
  (`suave`|`rapida`|`elastica`|`lenta`), `desfase` (fotogramas por eslabón), `orden`
  (`torso_primero`|`cabeza_primero`|`manos_primero`).

### 5b. Gestos repetidos
Algunas expresiones tienen un movimiento propio durante el mantener (risa: el pecho y los
hombros botan; pensativo: la cabeza va y vuelve; aburrido: peso de un lado a otro). Formato:
`"gesto_repetido": {"params": {...delta...}, "periodo": s, "forma": "seno"|"golpe"}`, que se
suma oscilando al mantener.

## 6. Retoques manuales

- **Capturar retoques**: por hueso que difiera de la pose generada en el fotograma actual se
  guarda un delta de rotación (y ubicación) en **espacio de la armadura** relativo al reposo, con
  la `fase` (`pico`|`mantener`|`todas`). Al regenerar se aplican encima con la misma envolvente.
- A otro personaje: `delta_local = R_reposo⁻¹ · delta_arm · R_reposo` (y cambio de marco si
  miran a sitios distintos).
- Borrar retoques de un hueso o de todos; **bloquear** una expresión (no se regenera; se edita
  la acción a mano).

## 7. Acciones, capas y biblioteca

- `<Rig>_EC_<gesto>_<estilo>`, solo tren superior, `pose_markers` `entrada`, `pico`,
  `mantener`, `salida`, `fin`. Datos de la expresión en el rig (PropertyGroup) y exportables a
  JSON.
- NLA: pista `EC Base` (neutra o caminar…) y `EC Expresión` (`COMBINE`) encima. Encadenar
  expresiones con fundido automático.
- `biblioteca/expresiones_corporales.json` (esquema `spanstories.cuerpo.biblioteca/1`):
  `expresiones {"<gesto>_<M|F>": {gesto, familia, estilo, titulo, nota, params, pico?, vida,
  tiempos, retoques?}}` y `vinculos` (excepciones: `neutro`/`ojos_cerrados` → `neutra`).
- Biblioteca de usuario en `bpy.utils.extension_path_user(...)`, sobrevive a reinstalar.

## 8. Vínculo con la cara (sin modificar el complemento facial)

Datos del facial (Rig Labial Bendy 0.6.9):
- Estado vivo = props `v_<canal>` del objeto `<cara>_Cara_Control` (lleva `["facs_cara"]`).
- Gestos = acciones `<cara>_FACS_<gesto>` (CONSTANT en el frame 1 sobre `["v_*"]`, slot de
  objeto, props `rlb_facs_expr`, `intensidad`, `mirada`).
- Elegir gesto: `scene.rlb_editor.expr` (enum con update; id = nombre de la acción) desde
  editor/estantería; `scene.rlb.facs_expr` + `rlb.facs paso='expresion'` (botón Aplicar).
- Enganche: `bpy.msgbus.subscribe_rna` sobre `scene.rlb_editor.expr` (owner propio, se
  re-suscribe en `load_post`) + `depsgraph_update_post` que compara el vector `v_*` del control
  con el anterior y lo clasifica contra las acciones `*_FACS_*` (cubre Aplicar, Neutra y habla).
- **Expresión completa** desde el panel corporal: pone los `v_*` del gesto y la acción
  corporal; con «en la línea de tiempo» inserta claves para que la cara entre a la vez que el
  cuerpo (la cara un poco antes, 2–3 fotogramas) y salgan juntas.
- Intensidad de la cara y del cuerpo separadas.

## 9. GLB / three.js

- Un GLB por personaje: malla con piel (solo huesos de deformación, animación muestreada) y las
  shape keys como morphs; modificadores Armature del rig facial apagados durante la exportación
  (como hace el facial). Clips: `EC_neutra` (bucle), `EC_<gesto>_<estilo>_entrada`, `_bucle`,
  `_salida`, como poses absolutas (neutra + delta).
- Contrato `<personaje>_expresiones.json`: por gesto, los pesos de morph de la cara (evaluando
  los drivers con el gesto aplicado) y los nombres de clip del cuerpo, tiempos e intensidades.
- `threejs/ejemplo_capas.js`: `THREE.AnimationUtils.makeClipAdditive(clip, 0, clipNeutra)` sobre
  caminar/hablar + tween de morphs de la cara.
- Sin acciones temporales en el .blend al terminar.

## 10. Normas del proyecto

- Nunca copiar ni guardar el .blend sin permiso; nada de objetos duplicados.
- No tocar el rig facial, sus acciones ni sus shape keys (solo emparentarlo a la cabeza).
- No reconstruir rigs existentes.
- Blender 5.2: acciones con capas/slots (`action.layers[0].strips[0].channelbag(slot)`), sin
  `action.fcurves`.
- Las pruebas de desarrollo van en Blender en segundo plano; el Blender abierto del usuario lo
  maneja solo el Claude principal.

## 11. Los 40 gestos

Alegría: sonrisa_leve, sonrisa_abierta, feliz_ojos_cerrados, risa_fuerte, aliviado, guino,
guino_boca_abierta, seguro_de_si. Tristeza: triste, triste_boca_abierta, dolor_leve,
dolor_fuerte, avergonzado, verguenza. Miedo: miedo, terror, desorientado. Enfado: enojado,
enojado_boca_abierta, molesto_leve, desafiante, determinado, esfuerzo. Sorpresa: sorpresa,
incredulo, curioso. Asco: asco, disgusto, repulsion. Otras: sospechoso, esceptico, sarcastico,
cansado, sonoliento, aburrido, pensativo, concentrado, confundido, dudoso, altanero.
