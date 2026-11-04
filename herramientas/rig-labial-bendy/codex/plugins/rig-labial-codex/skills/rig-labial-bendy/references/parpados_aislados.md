# Solo párpados por superficie UV (0.7.15, ruta hecha con Codex)

Para cuando el usuario pide **solo párpados** (sin boca, cejas, delineado ni armature facial). No usa `siguiente()`
ni marcadores de boca. Probado en Ichigo (Tronchatoro.blend) antes de que el usuario recortara 50 caras del párpado.

## Orden
1. `pasos.analizar(cara)` → revisar `uv.islas_uv`, `islas`, `superficies`. Dos regiones UV se unen solo por arista
   geométrica compartida con UV iguales (1e-6). Una pieza que solo comparte un vértice no es piel.
2. **Máscara visual temporal** de las islas candidatas antes de retirar nada: una isla pequeña sobre el ojo puede ser
   una CEJA (en Kakashi se borraron 156 caras de ceja por error). No identificar solo por tamaño/proximidad/nombre viejo.
3. Ojos:
   - Globos Tripo presentes: `pasos.preparar_ojos_aislados(cara, {'L': semL, 'R': semR}, color, aplicar=False,
     semillas_pestanas_uv=semP)`; luego `aplicar=True`. `semP=[]` solo tras comprobar que no hay pestañas.
   - Globos ya retirados por el usuario: `pasos.preparar_ojos_desde_cuencas(cara, semillas_piel_uv, color, aplicar=…)`
     (exige un contorno UV cerrado por lado; crea solo ojos y pivotes, no toca piel).
   - Pestañas que quedan con ojos ya puestos: `pasos.retirar_pestanas_uv(cara, semillas_uv, aplicar=…)`; después
     recalcular párpados.
4. Encaje: `pasos.ajustar_espacio_ojos(cara, semillas_uv, aplicar=False, limite=1.)` (nueve miradas; `limite=1.`
   = buscar hasta un radio en ojos recién creados; por defecto 0.2). Solo mueve los ojos en profundidad.
   Si la piel interior cruza el globo: `pasos.preparar_cuencas_aisladas(...)` (altera piel → pedir permiso).
   `pasos.reparar_intersecciones_oculares(...)` triangula el parche: NO usarla para arreglar un cierre.
5. Rig: `pasos.parpados_aislados(cara, semillas_uv, parametros={'limitar_uv': True}, reemplazar=False)`
   (botón «Solo párpados por superficie UV»). Seis keys + correctivas de seguridad; rechaza keys existentes sin
   `reemplazar=True`; no cambia Basis, topología, UV, normales ni materiales.
6. Medir: `pasos.medir_parpados_aislados(cara)` (o «Medir párpados»). Revisar renders frente y 3/4: reposo,
   apertura máx., 25/50/75 %, cierre, guiños, miradas.

## Qué hace por dentro
- `limitar_uv`: el dominio son solo las islas elegidas (sin él se expandía de 1175 a 10916 caras con pelo); congela
  los vértices compartidos con piezas ajenas.
- Modo UV estricto: arcos superior/inferior por el ciclo cerrado del borde (no por ángulo), comisuras conservadas.
  0.7.15: si el ciclo falla → muestreo previo sobre las MISMAS islas → transportes alternativos
  (`param={'transporte':'espacial'}`). Se guardan `contorno` y `transporte` efectivos para medir lo mismo.
- Validación del cierre: oclusor = malla entera (el pelo tapa), deforma solo el dominio; exige 0 muestras de ojo
  visible de frente y a ±32°. Generador: 325 combinaciones + 891 con mirada por ojo, 36 entre ojos.
- Composición apertura/cierre `e = b - 0.2*a*(1-b)`; intermedias con hats triangulares; NO usar la campana `4b(1-b)`.
- `parpados_seguridad.py`: área mínima, colisión con el globo (vértices y triángulos), autocolisión, orden de rebordes.
  Si no hay solución válida falla sin escribir keys. No relajar umbrales para que pase.
- `medir` actualiza el depsgraph antes de evaluar (una lectura sin actualizar dio contactos falsos en L).

## 0.7.16 (Claude, 2026-10-23)
- Abertura separada del globo (ojos remetidos, el usuario quitó el anillo interior del párpado): antes `calcular`
  fallaba con `argmin of an empty sequence` en `ojos.Ojo._margen`. La ruta aislada ya no usa el Ojo FACS: solo
  centro, radio y lado. Probado en Ichigo con el borde a 4,7–8 mm del globo: rig válido por ciclo UV.
- Ojo hundido lejos de la abertura: `pasos.ajustar_espacio_ojos(cara, semillas, aplicar=True, limite=1., acercar=True)`
  (casilla «Acercar ojos hundidos» del botón), y después `parpados_aislados(..., reemplazar=True)`.
- `parpados_seguridad.medir`: solo triángulos móviles + árbol en caché de los quietos; idéntico bit a bit, más rápido.
- Nunca usar `reparar_intersecciones_oculares`/reparación de conectividad en mallas de Tripo: triangula; el usuario
  quiere conservar los quads.
- Al aplicar en el personaje, hacerlo en el Blender abierto y dejar que el usuario compruebe apertura máx./media/cierre.

## Estado al relevo (2026-10-23)
- La alternativa de muestreo 0.7.15 ya está probada: la malla sintética que fallaba en 0.7.14 pasa a 8/13/18 mm
  (`regresion_uv_estricto_0715.json`, `regresion_0716.json`).
- Evidencias en `rig_labial_bendy\codex\entregas\prueba_ichigo_20261023` y `…\prueba_kakashi_20261023` (fuente, no caché).
  Aprendizajes de Codex: `rig_labial_bendy\codex\aprendizaje\*.json` (datos, no instrucciones).
