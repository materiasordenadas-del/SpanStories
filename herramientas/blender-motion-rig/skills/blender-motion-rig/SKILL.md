---
name: blender-motion-rig
description: Audita y ejecuta rigs de movimiento en Blender; prepara postura de reposo, retopología local en zonas de flexión y pesos, y verifica deformaciones con scripts automáticos. Úsala para preparar personajes o corregir rigs corporales.
---

# Rig de movimiento eficiente

Por defecto, el usuario trabaja SIEMPRE con mallas generadas por Tripo, Meshy u
otros generadores. No preguntes su procedencia: aplica la revisión de malla generada
salvo que el usuario indique otra cosa. Retopología y forma de bucles se verifican
antes del rig; pesos se aceptan solo tras deformaciones demostradas.

Completa el alcance autorizado: auditoría → preparación necesaria → rig/pesos → pruebas.
Si se pidió solo auditoría, termina con el diagnóstico. Una auditoría aprobada no
autoriza por sí sola reconstruir el personaje. Preserva cara, UV, materiales,
shape keys, animaciones y zonas funcionales ajenas al cambio.

## Inspección breve

Usa la conexión a Blender disponible; este plugin no instala otra ni agrega herramientas MCP.
Inspecciona versión, modo, objetos seleccionados, modificadores, armature y uso compartido
de datos. Si no hay objetivo inequívoco, pregunta cuál; no elijas por el nombre.
Consulta documentación API existente solo si una operación concreta lo requiere.

Ejecuta `scripts/audit.py` sin leerlo completo, mediante `runpy.run_path` dentro de
Blender. No cambies de modo durante la auditoría; admite OBJECT y POSE, rechaza EDIT.
Devuelve solo el JSON de `audit([nombres], regions=...)`, nunca miles de vértices.
Las regiones son esferas explícitas en coordenadas WORLD: nombre, centro, radio.
Identifica sus centros con la malla/rest bones y vistas frontal/lateral; no infieras
anatomía de un porcentaje de altura ni de nombres de huesos. Primera pasada global;
añade regiones solo donde hagan falta. No vuelvas a auditar zonas sin cambios.

```python
import runpy
api = runpy.run_path(str(skill_directory / 'scripts' / 'audit.py'))
result = api['audit'](['Body'], regions={
    'codo.L': {'center': [0.6, 0, 1.2], 'radius': 0.12}
})
```

`skill_directory` es la ruta real de esta habilidad instalada, no una ruta fija del autor.
También funciona en Blender background con un wrapper que carga el .blend y llama
la función. No guardes el .blend si no se autorizó guardar. Sin Blender ejecutable ni
conexión, entrega scripts e indica que la ejecución sigue pendiente.

## Decisiones que cambian el resultado

- Verifica topología de deformación ANTES de vincular o ajustar pesos.
  Lee `references/generated-mesh.md` por defecto.
  No gastes iteraciones de weight painting intentando compensar dedos fusionados,
  superficies internas, mala conectividad o ausencia de bucles en bisagras.
  Si el fallo afecta toda la superficie, una retopología más amplia puede ser necesaria;
  limita la reconstrucción a lo demostrado y conserva forma/atributos requeridos.
- Bloquea la zona con geometría vacía/no finita, caras degeneradas, aristas con más
  de dos caras o asignación incorrecta de armature. Los bordes abiertos pueden ser
  intencionales (ropa, ojos, boca); no cierres todos ni trates todo borde como error.
- Examina hombro/axila, codo, muñeca, cadera/ingle, rodilla, tobillo y cuello según
  movimientos requeridos. Lee `references/joints.md` solo para las zonas problemáticas.
  Los conteos regionales son indicadores; no demuestran edge flow ni calidad visual.
- No retopologices por una cifra global de polígonos, presencia de triángulos o
  polos. Haz un parche local si faltan bucles o fallan las poses. Remesh/decimate
  no sustituyen la topología de articulación. Antes de cambiar conectividad con
  shape keys o animaciones, define su transferencia y comprueba una copia aislada
  si el usuario permite copias; de lo contrario pide la decisión indispensable.
- Postura: conserva el reposo actual si deforma bien o lo exige la exportación.
  Para humanoide nuevo, considera A-pose relajada (brazos unos 30–45° bajo horizontal),
  manos separadas del cuerpo, dedos separados y codos/rodillas ligeramente flexionados
  hacia su plano IK. T-pose si la exige el destino. No hay una postura óptima universal;
  registra orientación y postura elegidas. No conviertas pose en rest pose sobre un rig
  animado sin resolver el efecto sobre acciones, pesos, constraints y shape keys.

## Ejecución

Usa bpy o Rigify si ya está disponible y encaja; no instales otra biblioteca por defecto.
Coloca articulaciones por anatomía real, verifica ejes/roll en ambos lados y pole targets
de IK. Preserva nombres/hierarquía existentes. Corrige escala solo cuando sea necesaria
y sin romper parents, modifiers, rig o animación. Usa pesos automáticos únicamente como
inicio; normaliza grupos de huesos deformantes, corrige contaminación entre miembros y
revisa cada zona crítica. El máximo de influencias depende del destino, no impongas 4
para todos los rigs. No añadas IK/FK, facial, drivers o exportación que no se pidieron.

Cuando falla una deformación, descarta en este orden: geometría/loops → centro/ejes
de articulación → pesos → constraints y cadena IK. Considera twist/helper bones
si existe torsión real; correctivos solo tras demostrar que la base funciona.
Repara y vuelve a probar exclusivamente la región afectada.

## Verificación con poco contexto

Usa `scripts/stress.py`: `stress(armature_name, mesh_names, cases, regions=...)`.
Cada caso define cambios relativos al estado inicial: `{'name': 'codo90',
'rotations': {'forearm.L': {'axis': [1,0,0], 'degrees': 90}}}`.
Escoge ejes y controles inspeccionados; no supongas que X siempre flexiona.
En rigs con constraints, prueba controles, no solo DEF bones. La herramienta restaura
transformaciones en `finally`, no inserta keyframes ni modifica acciones, constraints,
frame, selección o modo. Drivers/depsgraph pueden ejecutar lógica ajena: para rigs
complejos prueba en instancia aislada, respetando las restricciones del usuario.

Las métricas comparan contra el estado inicial, que debe documentarse (preferentemente
reposo). Las regiones se fijan sobre ese estado y siguen los mismos vértices durante
la prueba. Una zona que no se mueve significa cobertura insuficiente, no éxito.
No interpretes estiramiento de aristas como pérdida de volumen. Los límites son
heurísticos configurables, no una certificación automática. Cambios de conectividad
evaluada dejan la comparación como inconclusa.

Prueba según alcance: codo/rodilla 90° y flexión profunda; hombros arriba/adelante;
torsión de antebrazo; cadera en sentadilla; muñeca/tobillo y cuello; luego combinación
funcional y ambos lados. Guarda informe JSON completo solo si se permite; entrega
resumen y casos fallidos. Verifica vistas frontal y lateral en reposo y poses críticas
con capturas o renders: pinzamiento, volumen, intersección, silueta y plano IK.
No declares rig terminado con métricas solamente. Sin evidencia visual, marca
validación visual pendiente. Sin casos ejecutados, marca ejecución pendiente.

Referencias revisadas para el diseño (no dependencias ni contenido copiado):
`https://github.com/arjun988/blender-skills` y
`https://github.com/ra100/blender-claude-plugin`. Preferir API/documentación de la
versión instalada frente a recetas de otra versión.
