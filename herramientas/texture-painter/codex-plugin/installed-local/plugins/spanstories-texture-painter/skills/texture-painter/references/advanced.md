# Preparación única, para el usuario o agente principal

No necesitas esta guía para pintar regiones ya nombradas.

1. En Blender, selecciona las islas con el resaltado UV ↔ modelo y guárdalas como
   grupo con un nombre claro: CHAQUETA, PANTALÓN, PIEL, etc. No adivines correspondencias.
2. Extrae la paleta de la referencia y confirma/nombra sus colores: ROJO, PIEL, etc.
   El cuadro de color permite editar nombres. Una referencia no es un mapa UV.
3. Conserva grupos y paleta guardando el .blend solo cuando el usuario lo autorice.
4. Entrega a Luna/Haiku el objeto exacto y las regiones/colores aprobados. El agente
   puede repetir el flujo simple sin inspeccionar caras ni configurar materiales.

Para diagnóstico, iniciar el servidor MCP con `SSTP_ADVANCED_TOOLS=1` expone también
26 herramientas avanzadas. Sin esa variable, tools/list muestra solo cuatro.
Las llamadas anteriores se conservan para clientes que ya las usaban.

Con Blender Native MCP ya conectado:

```python
import sys
painter = next(m for n,m in sys.modules.items()
               if n.endswith('spanstories_texture_painter') and hasattr(m,'core'))
result = painter.core.dispatch('agent_start', object_name='Lamine')
```

`agent_paint` admite los mismos argumentos que `paint_named_region`; `agent_export`
admite los de `export_painting`. Usa el módulo activo, también si está instalado
como `bl_ext.<repositorio>.spanstories_texture_painter`; no registres otro ejemplar.
Las herramientas usan el mismo core que el add-on manual.

`selection_status` devuelve el estado compartido de UV/modelo sin pintar. Todas
las entradas de selección eligen también el personaje y el atlas de material.
No reemplaces la textura de una máscara por una versión cuadrada ni cambies su
muestreo: 0.1.2 protege una copia nativa y migra las bases antiguas conservando capas.

No Smart UV, unwrap ni cambios a geometría, Shape Keys, rigs o animaciones. No
sobrescribas originales. Un PNG para geometría glTF usa sRGB y flipY=false;
GLTFLoader lo configura automáticamente en el GLB. UDIM, UV fuera de 0–1 y fuentes
procedurales siguen fuera de esta primera versión. El GLB de prueba original
validó texturas y morphs, no la transferencia íntegra del rig de Blender.
