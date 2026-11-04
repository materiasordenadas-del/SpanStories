# Código: funciones sueltas, cara FACS y fuente

> Referencia del skill rig-labial-bendy. `P = nucleo.pasos`, `FP = nucleo.facs.pipeline`. Lo normal es `P.siguiente(cara)`
> en bucle; esto es para llamar un paso aislado. Una llamada MCP por función (el límite de tiempo del MCP es corto).

## 1. Pasos sueltos (`nucleo/pasos.py`)
- `analizar(cara)`: inventario de UV, islas y materiales (solo lee).
- `soldar(cara)`: suelda los vértices partidos por costuras UV del GLB de Tripo.
- `detectar(cara, cursor=None, foto=True)`: marcadores RLB_* desde la malla (boca, comisuras, labios, ojos, cejas, mandíbula, mentón).
- `foto_marcadores(cara)`: hoja PNG frente+perfil con una bolita por marcador (no cambia nada).
- `hablar(cara, texto, audio=None)`: la cara dice `texto` (WAV opcional; sin audio, tiempos típicos del español), sin contrato JSON. Reemplaza `<cara>_Habla` en `<cara>_Cara_Control`, ajusta el rango de frames. Devuelve `{'accion', 'frames', 'canales_que_se_mueven', 'maximos', 'audio'}`.
- `foto_habla(cara)`: hoja PNG de los visemas A, E, I, O, U, MBP, FV (columnas, rotuladas; arriba de frente, abajo de perfil) con los pesos de `biblioteca/expresiones_facs.json` → `visemas`. Workbench; quita la acción del control un momento y lo restaura todo. Devuelve la ruta (`RLB_revision/<cara>/hoja_habla.png`).
- `malla_procesada(cara)`: True si la malla ya pasó por arreglar/abrir ojos/cuenca/densificado.
- `primer_paso_seguro(cara)`: primer paso que se puede repetir sin romper la malla.
- `simetrizar(cara)`: espeja comisuras y ojos; centra labios, mandíbula y mentón en x = 0.
- `arreglar(cara, ...)`: cuantización, solapas, normales y dientes de la malla (borra shape keys).
- `abrir_ojos(cara)`: quita el bulto de los ojos esculpidos y deja el hueco.
- `quitar_pestanas(cara)`: borra las pestañas de Tripo (islas junto al globo); `restaurar_pestanas` las devuelve.
- `rig_labios(cara)`: armature con Bendy Bones de los labios.
- `pesos(cara)`: pesos de la cara y shape keys del roll hacia dentro.
- `boca_interior(cara)`: dientes, lengua y fondo de la boca.
- `ojos_lian(cara, color)` (por defecto) / `ojos_vale(cara)` / `ojos_existentes(cara, piv_L, piv_R)`: globo, iris y pupila.
- `parpados(cara)`: huesos radiales, shape keys y drivers de párpados, cejas y mejillas (rig viejo).
- `cuenca(cara)`: margen del párpado apoyado en el globo y bolsa oscura (ojos con hueco).
- `oclusion(cara)`: lente de oclusión delante del globo; `medir_oclusion(cara)` debe dar 0.
- `crear_gestos(cara)`: shape keys de gestos; `seguir_keys(cara)` las copia a dientes y lengua.
- `revisar(cara)`: hojas de render de poses; `revisar_ojos(cara, lado)`: hoja de párpados y cejas.
- `medir_cierre(cara)`: vértices del párpado dentro del ojo en varias poses y miradas.
- `estado(cara)`: qué pasos de la línea están hechos y cuál toca (solo lee).
- `siguiente(cara)`: hace el siguiente paso; devuelve `parar`, `avisos`, `siguiente`.
- `rehacer(cara, desde)`: deshace los pasos desde `desde` y los olvida (sube al primer paso seguro en malla procesada).

## 2. Cara FACS por código (`FP`)
Orden y una llamada MCP por función (`construir_todo` pasa del tiempo límite):
1. `FP.preparar(cara)`: guarda el original, alisa la rejilla, cierra labios.
2. `FP.boca(cara)`: bolsa, forro, dientes en banda, lengua y formas de la boca.
3. `FP.ojos(cara, modo='giro')`: densifica, párpados, cejas, mejillas, nariz y lente.
4. `FP.delineado(cara, modo='uv', estilo='anime')`: pestañas pintadas en la piel del párpado.
5. `FP.controles(cara)`: `<cara>_Cara_Control` con huesos y canales `v_<forma>`.
6. `FP.terminar(cara)`: drivers de las piezas, correctivas, rig viejo apagado.
Además:
- `FP.parpados(cara, param=None, delinear=True, ...)`: SOLO párpados que giran + delineado (sin boca ni controles).
- `FP.medir_parpados(cara)`: vértices dentro del globo, triángulos invertidos y ojo visible al cerrar.
- `FP.expresion(cara, nombre, peso=1.0)`: pone una expresión de la biblioteca en los canales.
- `FP.lista_expresiones()`: nombres disponibles.
- `FP.hablar(cara, bloques, accion=None, intensidad=1.1, ...)`: lip sync en español con capa de actuación y contrato JSON (con `contrato=False` no escribe el JSON; el agente usa mejor `P.hablar`).
- `ajustes.cambiar_densidad(cara, 'boca'|'cejas', n)`: puntos de ajuste por zona (boca 6/8/10/12, cejas 2/3/4); migra los valores de todas las expresiones.

## 3. Pasos de la línea (`nucleo/linea.py`, COMPLETA)
| id | nº panel | función |
|---|---|---|
| analizar | 1 | `P.analizar` |
| detectar | 2 | `P.detectar` |
| arreglar | 3 | `P.arreglar` |
| abrir_ojos | 4 | `P.abrir_ojos` |
| rig | 5 | `P.rig_labios` |
| pesos | 6 | `P.pesos` |
| interior | 7 | `P.boca_interior` |
| ojos | 8 | `P.ojos_lian` / `ojos_vale` |
| parpados | 9 | `P.parpados` |
| cuenca | 10 | `P.cuenca` |
| oclusion | 11 | `P.oclusion` |
| F_preparar | 12 | `FP.preparar` |
| F_boca | 13 | `FP.boca` |
| F_ojos | 14 | `FP.ojos` |
| F_delineado | 15 | `FP.delineado` |
| F_controles | 16 | `FP.controles` |
| F_terminar | 17 | `FP.terminar` |
| F_expresiones | 18 | `poses.crear(cara)` (acciones `<cara>_FACS_*` del Editor de expresiones) |
| F_habla | 19 | `P.hablar` + `P.foto_habla` (frase de prueba y hoja de visemas; `siguiente()` para y pide mirarla). En el panel: `rlb.facs(paso='habla')` |
Ruta SOLO (párpados): detectar, abrir_ojos, ojos, S_parpados (`FP.parpados`), S_medida (`FP.medir_parpados`).

## 4. Fuente (pool único, solo en la máquina del usuario)
Antes de nada: `pasos.version()` debe dar la misma versión que el skill; si no, recargar/reiniciar Blender.
El código, el skill y las referencias viven en `D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\codex\plugins\rig-labial-codex` (add-on en `assets/rig_labial_bendy`). Las rutas históricas, Blender y las cachés de ambos agentes son enlaces a esa fuente. Una edición ya está compartida, sin acciones posteriores de integración.
- `python pool.py`: verifica enlaces, versión y registros reales de ambos gestores. `--instalar` configura o recupera ambos conjuntamente; `--instalar --version X.Y.Z` actualiza también los registros oficiales. No lo uses después de cada edición. `empaquetar.py` es una entrada compatible al instalador conjunto, sin ZIP independiente.
- `prueba_humo.py`: `blender --background --factory-startup --python prueba_humo.py` lo comprueba.
