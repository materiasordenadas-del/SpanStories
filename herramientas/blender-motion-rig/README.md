# Blender Motion Rig 1.0.0

Complemento para Codex: una habilidad, dos scripts de verificación, una referencia
local de articulaciones. Sin dependencias pip, servidores MCP, hooks ni procesos
residentes añadidos. No es un panel/add-on de Blender ni un autorig universal.
Reutiliza Blender conectado o su Python en modo background.

Por defecto asume mallas de Tripo, Meshy u otros generadores: revisa conectividad y
forma de bucles antes de trabajar pesos. No exige reconstruir las zonas que funcionan.

La habilidad dirige auditoría, postura de reposo, retopología localizada y ejecución
del rig usando las capacidades existentes del agente. Los scripts automatizan los
conteos y pruebas; no construyen por sí solos una retopología anatómica.

## Ejecución de los verificadores

Dentro de Blender, usando la ruta real donde esté el plugin:

```python
import runpy
from pathlib import Path
skill = Path(r'D:\Español\blender-motion-rig\skills\blender-motion-rig')
audit = runpy.run_path(str(skill / 'scripts' / 'audit.py'))['audit']
result = audit(['nombre_real_de_la_malla'])
```

`audit(mesh_names, regions=None, max_influences=None, weight_tolerance=0.001,
weight_jump_limit=0.75, leakage_tolerance=0.01)`
comprueba geometría base, transformaciones, modificadores y pesos deformantes.
Las regiones son `{nombre: {center: [x,y,z], radius: número}}` en WORLD.
Cada región puede añadir `allowed_bones: [nombres_reales]` para medir contaminación
anatómica; también se detectan cambios abruptos de pesos por arista. Los umbrales
son ajustables y deben interpretarse según piel blanda o pieza rígida.
No detecta automáticamente anatomía, edge flow, simetría ni postura óptima.
Las estadísticas de una región cuentan caras/aristas que tocan alguno de sus vértices.

`stress(armature_name, mesh_names, cases, regions=None, edge_ratio_limit=3.0,
collapse_ratio=0.05, capture=None)` aplica rotaciones locales relativas y restaura
los canales de pose al terminar, incluso si una captura falla. Ejemplo de caso:

```python
{'name': 'flexion90', 'rotations': {
    'nombre_real_del_control': {'axis': [1, 0, 0], 'degrees': 90}
}}
```

No asumir el eje ni el nombre del control. Las métricas se calculan en WORLD sobre
la malla evaluada; las regiones se fijan por posición inicial. `capture` opcional
permite obtener evidencia visual durante cada pose (callback sin ediciones de escena).
No movimiento o cambio de conectividad significa prueba inconclusa.
No se mide volumen ni se detectan automáticamente intersecciones/pinzamientos.
Todas las métricas sin avisos necesitan también revisión visual.

Los scripts no guardan archivos, no insertan claves, no cambian selección/frame/modo
ni aplican modificadores. Requieren OBJECT o POSE; no cambian automáticamente de modo.
En rigs complejos, ejecutar las poses en una instancia aislada porque drivers y
handlers del propio archivo pueden tener efectos adicionales.

## Referencias consideradas

- https://github.com/arjun988/blender-skills — rigging y retopología.
- https://github.com/ra100/blender-claude-plugin — separación entre ejecución MCP y referencias API.

Implementación propia: no se copian paquetes ni se cargan sus habilidades.
