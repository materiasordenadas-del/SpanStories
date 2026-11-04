# Expresiones Corporales (SpanStories)

Complemento de Blender 5.2 (id `expresiones_corporales`, MIT) que genera, edita, guarda, reutiliza y exporta
expresiones del tren superior que acompañan a los gestos de la cara del Rig Labial Bendy, en cualquier personaje con
rig Rigify, Mixamo o genérico (tabla editable). Diseño completo en `DISENO.md`.

## Instalar / actualizar
- Empaquetar: `python empaquetar.py --validar` → `dist/expresiones_corporales-<versión>.zip` (validado con
  `blender -c extension validate`).
- Espejo en el Blender del usuario y recarga, desde la consola de Blender:
  `exec(open(r"D:\Español\imagen para animación\Animación 3D\expresiones_corporales\sincronizar.py", encoding="utf-8").read()); sincronizar()`
  (`python sincronizar.py --comprobar` dice qué copiaría sin tocar nada).
- Prueba: `"D:\Blender 5.2\blender.exe" --background --factory-startup --python prueba_humo.py`
  (archivos en `_pruebas/`, siempre los mismos nombres).

## Uso (pestaña N «Cuerpo»)
1. Elige el rig y el estilo M/F. «Detectar perfil», «Calibrar neutra» (mide con la malla) o «Capturar neutra».
2. «Generar todas» crea `<Rig>_EC_Neutra` y `<Rig>_EC_<gesto>_<estilo>`.
3. Elige expresión y base (neutra o cualquier acción, p. ej. caminar) → «Previsualizar» (pistas NLA `EC Base` +
   `EC Expresión` en COMBINE). Los deslizadores regeneran la acción al moverlos.
4. Gira huesos a mano → «Capturar retoques» (sobreviven a regenerar y pasan a otros personajes).
5. Biblioteca de usuario, aplicar a otro personaje, JSON, vínculo con la cara, GLB y hoja de revisión.

## API (todo devuelve dicts JSON o el objeto creado)
```python
from bl_ext.user_default.expresiones_corporales.nucleo import (perfil, generador, capas, retoques, biblioteca,
                                                               vinculo, exportar, revision)
perfil.detectar(rig); perfil.asegurar(rig, forzar=False)
perfil.calibrar_neutra(rig, malla=None, separacion=None); perfil.capturar_neutra(rig)
generador.generar(rig, clave, intensidad=1.0, grupos=None, estilo=None, ligero=False)  # -> Action
generador.generar_todas(rig, estilo=None)
capas.previsualizar(rig, clave, base=None, inicio=1, intensidad=1.0); capas.quitar(rig)
capas.encadenar(rig, [claves], base=None, inicio=1, solape=None); capas.aplicar_pose(rig, clave)
retoques.capturar(rig, clave, fase='mantener'); retoques.borrar(rig, clave, hueso=None)
biblioteca.cargar(); biblioteca.guardar_usuario(rig, clave, nombre=None); biblioteca.aplicar_a(rig_destino, clave, origen=None)
vinculo.activar(rig, cara_control=None); vinculo.desactivar(rig)
vinculo.aplicar_completa(rig, gesto, frame=None, intensidad_cara=1, intensidad_cuerpo=1)
exportar.glb(rig, ruta, estilo=None, claves=None)
revision.hoja(rig, claves=None, ruta=None)  # -> ruta_png
```

## Cómo funciona (resumen)
La acción es un delta local para NLA COMBINE (cuaternión = base @ delta; Euler = base + delta, medido en 5.2). Los
parámetros dan rotaciones de mundo en el marco del cuerpo (F, U, L) en cadena FK; el perfil mide cuánto transmite el
rig real de cada hueso a los demás (en Rigify la cabeza no sigue al pecho) y el generador lo resta antes de pasar a
local. El mantener tiene ciclos enteros de respiración, balanceo, temblor, rebote y `gesto_repetido`, así que el bucle
no tiene costura. Los retoques se guardan en el marco del cuerpo con nombres semánticos.
