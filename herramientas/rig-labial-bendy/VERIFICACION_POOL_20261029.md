# Verificación de fuente única — 2026-10-29

## Resultado
Versión activa única: **0.8.42**. Código, skill, referencias y tests residen en `codex/plugins/rig-labial-codex`. Los accesos de Claude Code, Codex y Blender leen esa fuente física. Una edición no necesita instalar, copiar, sincronizar ni pedir actualización al otro agente.

## Correcciones
- Codex ignoraba una carpeta de versión que fuera junction. Su caché ahora es un contenedor real con .codex-plugin, .claude-plugin, assets, skills y tests enlazados a la fuente. No contiene copias de esos recursos. El plugin.json raíz de compatibilidad solo está en la fuente; Codex utiliza el manifiesto nativo .codex-plugin/plugin.json, compartido.
- Se retiraron los enlaces de caché 0.8.32 y 0.8.41. Cada agente tiene únicamente 0.8.42 en su caché activa. Los respaldos históricos se conservan fuera de ella.
- Los gestores oficiales reconocen 0.8.42 instalada y habilitada en ambos agentes.
- Se corrigieron rutas truncadas, preguntas exclusivas de un agente, instrucciones de espera Unix y la contradicción entre camino automático, permisos destructivos y aprobación de marcadores. El bucle manual exige detenerse tras detectar para revisar/aprobar aunque la API no se detenga. El camino automático requiere marcadores aprobados y usa permisos=None explícito.
- Se corrigieron descripciones de manifiestos que todavía anunciaban 0.8.30.
- pool.py verifica registros reales, identidad de archivos y una sola entrada por caché. Instalación conjunta opcional, bloqueo de concurrencia, validación de versión, protección ante archivos faltantes y cachés divergentes. Las copias idénticas generadas por los gestores se apartan fuera de las cachés activas; no se mezclan con la fuente.
- empaquetar.py vuelve a funcionar como entrada compatible al instalador conjunto. No genera otro ZIP independiente. El uso habitual es editar directamente el pool, sin ejecutar este instalador después.
- Se recargó el add-on en la conexión Blender disponible, sin reiniciar ni guardar.

## Evidencia ejecutada
1. `python -m unittest test_pool -v`: seis pruebas aprobadas (versión inválida, manifiesto faltante, tres formatos de versión, rutas de movimiento restringidas, conservación de una copia divergente y exclusión de instalaciones simultáneas).
2. `python empaquetar.py --sin-blender`: código de salida 0. Ambos gestores instalados/habilitados en 0.8.42 y rutas compartidas correctas. Blender se comprobó separadamente por MCP porque su junction no se resuelve desde el sandbox.
3. `claude plugin validate <pool>`: Validation passed.
4. `claude plugin details rig-labial@spanstories-local`: 0.8.42; un skill, rig-labial-bendy.
5. `codex plugin list --marketplace rig-labial-codex-local --json`: installed=true, enabled=true, version=0.8.42.
6. API nativa app-server, `plugin/read`, marketplacePath=<codex>/.agents/plugins/marketplace.json: installed=true, enabled=true, localVersion=0.8.42; skill rig-labial-codex:rig-labial-bendy habilitado y path directamente en el pool. No se ejecutó otro agente/modelo para esta prueba. `skills/list` por sí solo no es evidencia de inventario de skills de plugins; el inventario específico sí lo es.
7. Identidad física con os.path.samefile: 131 archivos por cada acceso de Claude (fuente y caché), 130 en Codex (excluido únicamente el plugin.json raíz de compatibilidad). Sin diferencias.
8. Prueba reversible: archivo temporal nuevo en references, editado por acceso Claude y luego por acceso Codex. En ambos sentidos todos los accesos vieron el contenido inmediatamente, sin instalar ni sincronizar. Se retiró únicamente ese archivo temporal al acabar.
9. Blender: versión 0.8.42, codigo_al_dia=true, add-on habilitado, ruta real en pool/assets/rig_labial_bendy. Objetos, frame, ubicación/escala, archivo abierto y estado dirty permanecieron iguales durante la recarga. La conexión disponible tenía la escena inicial Camera/Cube/Light, sin archivo guardado; no se afirma una prueba visual de Tom ni de otro personaje.

## Cómo se mantiene
Editar el pool una vez. No reinstalar para compartir cambios. Los dos agentes leen los mismos bytes. No hay monitor, sincronizador periódico ni hook persistente añadido.

Una conversación puede conservar instrucciones ya leídas, y Blender conserva módulos importados. Leer de nuevo/abrir una sesión nueva o recargar Python actualiza esa memoria; no integra fuentes distintas. No se puede prometer que una conversación ya iniciada cambie retroactivamente su contexto.

Si alguien ejecuta una reinstalación externa y reemplaza los enlaces por copias, altera esta configuración. pool.py lo detecta. El comando conjunto permite recuperarla, pero esa reinstalación externa no es parte del flujo habitual ni es necesaria al editar el complemento.

No se cambió código geométrico del rig, UV, materiales, shape keys ni animaciones. En el add-on solo cambió el número del manifiesto. No se guardó ningún .blend.
