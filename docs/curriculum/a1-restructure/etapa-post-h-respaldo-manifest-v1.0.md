# POST-H 1/2 — Manifest de respaldo A1 v1.44

**Estado:** `D-A11_RESOLVED`  
**Fecha:** 2026-09-06  
**Rama:** `prueba`  
**Release histórico:** `A1-CURRICULUM-v1.44`  
**Release sucesor:** `A1-CURRICULUM-v1.51` RC1

## Decisión

El release curricular v1.44 queda archivado bajo:

```text
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/
```

El respaldo se creó byte-for-byte desde las cinco fuentes de secuenciación sustituidas.

```text
spanishstories_a1_ws_sequencing_architecture_v1.44.csv
spanishstories_a1_ws_sequencing_allocation_v1.44.csv
spanishstories_a1_ws_story_blueprints_v1.44.csv
spanishstories_a1_ws_recycling_edges_v1.44.csv
spanishstories_a1_ws_sequencing_final_audit_v1.44.csv
```

El manifest verificable se encuentra en:

```text
content/a1/vocabulary/respaldo/a1-curriculum-v1.44/archive-manifest-v1.44.json
```

Cada entrada registra:

- ruta original;
- ruta de respaldo;
- tamaño en bytes;
- SHA-256;
- Git blob SHA observado durante la auditoría;
- confirmación `byte_identical_to_source_at_archive_time=true`.

## Copia activa temporal

En este punto el runtime/importer todavía ejecuta `A1-CURRICULUM-v1.44`. Por ello las cinco fuentes v1.44 **no se eliminan todavía de la raíz** `content/a1/vocabulary/`.

Esto no significa que existan dos autoridades curriculares activas:

```text
respaldo/a1-curriculum-v1.44/ = archivo histórico
content/a1/vocabulary/*v1.44 = compatibility pin temporal del importer
content/a1/vocabulary/*v1.51 = release candidate aprobado
```

La eliminación de las copias v1.44 de raíz es un paso de cutover técnico y solo puede hacerse en el mismo cambio que active v1.51 después de que el nuevo importer/registry haya pasado todas las pruebas.

## Shared sources que permanecen canónicas

No se archivan por esta reestructuración:

```text
spanishstories_a1_ws_normalization_master_v1.37.csv
spanishstories_a1_ws_source_assertions_modes_v1.40.csv
spanishstories_a1_ws_coverage_final_v1.40.csv
```

Motivo: siguen siendo fuentes compartidas y no codifican la topología sustituida 32-islas/103-stories. `coverage_final_v1.40` audita cobertura de inventarios; no es el audit de secuenciación v1.44.

## Gate de eliminación de v1.44 en raíz

Claude Code puede borrar las cinco copias v1.44 de `content/a1/vocabulary/` **solo si todo lo siguiente es cierto**:

```text
releaseId = A1-CURRICULUM-v1.51
modules = 8
islands = 11
storyBlueprints = 32
firstIntroductions = 985
recycleEdges = 2867
A2 boundary scheduled as A1 = 0
regional receptive targets = 16
recycle edges claiming mastery = 0
DELE task structures = 13/13
npm test = PASS
npm run typecheck = PASS
npm run lint = PASS
npm run curriculum:check = PASS
corruption tests = PASS
determinism tests = PASS
registry regenerated = PASS
query API regression = PASS
```

Si alguno falla, las copias activas v1.44 no se eliminan.

## Prohibiciones

- No editar los bytes del respaldo para hacerlos coincidir con documentación posterior.
- No usar `respaldo/` como source directory del runtime.
- No mover inventarios compartidos solo para limpiar visualmente la carpeta.
- No tocar `main`.
- No comenzar Fase 3 como parte del archivado.

## Resultado

```text
D-A11 = RESOLVED
ARCHIVE_COPY = COMPLETE
ARCHIVE_HASH_MANIFEST = COMPLETE
ROOT_V1_44_REMOVAL = DEFERRED_TO_ATOMIC_V1_51_CUTOVER
```
