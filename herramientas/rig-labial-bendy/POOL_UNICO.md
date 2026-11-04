# Fuente única de Rig Labial Bendy — 0.8.42

Una sola carpeta contiene el código, el skill, las referencias, los tests y los manifiestos:
D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\codex\plugins\rig-labial-codex

## Uso habitual: editar una vez
Claude Code y Codex leen los mismos archivos físicos. Editar el pool cambia directamente lo que leerán ambos, sin copia, sincronización, instalación posterior ni petición al otro agente. No usar plugin add/update para compartir una edición. No mantener una rama «Claude» y otra «Codex».

Las instrucciones ya cargadas en una conversación y los módulos Python ya cargados en Blender viven en memoria: abrir una sesión nueva o recargar el add-on permite leer la fuente actual; no copia ni integra versiones. No guardar, cerrar o reiniciar el .blend por actualizar el plugin.

## Rutas de acceso
- Fuente Claude: %USERPROFILE%\.claude\plugins-local\spanstories-market\rig-labial → pool.
- Caché Claude: %USERPROFILE%\.claude\plugins\cache\spanstories-local\rig-labial\0.8.42 → pool.
- Caché Codex: %USERPROFILE%\.codex\plugins\cache\rig-labial-codex-local\rig-labial-codex\0.8.42.
  Su contenedor de versión es real porque Codex ignora los contenedores junction al enumerar instalaciones.
  .codex-plugin, .claude-plugin, assets, skills y tests son junction al pool. No contienen copias.
  Codex usa .codex-plugin/plugin.json, compartido. El plugin.json raíz de compatibilidad permanece en la fuente.
- Ruta histórica rig_labial_bendy\rig_labial_bendy → pool\assets\rig_labial_bendy.
- Blender 5.2: %APPDATA%\Blender Foundation\Blender\5.2\extensions\user_default\rig_labial_bendy → pool\assets\rig_labial_bendy.

Solo existe una entrada activa de versión por agente: 0.8.42. Los respaldos históricos no se cargan.

## Configuración inicial y recuperación excepcional
Desde rig_labial_bendy:
- python pool.py: comprueba versiones, enlaces y registros reales de ambos gestores.
- python pool.py --instalar: configura/recupera ambos y comprueba; evita reinstalar si ya están registrados en la versión correcta.
- python pool.py --instalar --version X.Y.Z: mantenimiento opcional del número de versión y registros de ambos gestores. No hace falta para compartir ediciones.
- python empaquetar.py: entrada compatible al mismo instalador; no genera un ZIP con otra fuente.
- --sin-blender: solo cuando el sandbox no puede resolver su junction. Debe acompañarse de verificación real por MCP, no demuestra por sí solo el estado de Blender.

El instalador conserva las copias idénticas apartándolas fuera de la caché activa, en su mismo volumen; retira únicamente enlaces antiguos comprobados. Se niega a reemplazar copias divergentes, rutas ajenas o ejecutar dos instalaciones simultáneas. Una instalación fallida informa error y se puede reanudar.

Una reinstalación externa que sustituya los enlaces altera esta configuración; el verificador la detecta y --instalar la recupera. No existe monitor persistente ni hook oculto. Las ediciones normales del pool no alteran los enlaces ni necesitan reparaciones.

## Skill
Un solo skills/rig-labial-bendy/SKILL.md, compartido. Mantiene el flujo por pasos y las reglas UV, autorización y aprendizaje. El camino automático exige marcadores aprobados, alcance completo y permisos explícitos; por defecto se utiliza permisos=None y el bucle manual. La validación numérica no sustituye revisión visual.
Referencias históricas: references/novedades_0.8.12-0.8.32.md.
Dientes: references/boca.md.
Aprendizajes persistentes: rig_labial_bendy\codex\aprendizaje (comunes a ambos).

## Verificación reproducible
python -m unittest test_pool -v
python pool.py
Claude: claude plugin details rig-labial@spanstories-local
Codex: codex plugin list --marketplace rig-labial-codex-local --json
Blender: pasos.version(), pasos.codigo_al_dia() y os.path.realpath del módulo.

Las pruebas de infraestructura no certifican un nuevo resultado visual en un personaje. Esta reparación no modifica geometría, UV, materiales ni animaciones.
