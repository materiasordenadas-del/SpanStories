# A1 Curriculum v1.44 — respaldo histórico

**Estado:** `ARCHIVED_COPY_STAGED`  
**Release histórico:** `A1-CURRICULUM-v1.44`  
**Sucesor curricular:** `A1-CURRICULUM-v1.51` RC1  
**Audited origin HEAD:** `2bc6851ebf12085be5eccbff9af5ef0826ebe0b4`

## Motivo

v1.44 representa la topología anterior:

```text
8 modules
32 islands
103 StoryBlueprints
985 first introductions
2955 recycle edges
```

La reestructuración aprobada produce v1.51 RC1:

```text
8 modules
11 islands
32 StoryBlueprints
985 first introductions
2867 recycle edges
```

## Archivos históricos copiados byte-for-byte

- `spanishstories_a1_ws_sequencing_architecture_v1.44.csv`
- `spanishstories_a1_ws_sequencing_allocation_v1.44.csv`
- `spanishstories_a1_ws_story_blueprints_v1.44.csv`
- `spanishstories_a1_ws_recycling_edges_v1.44.csv`
- `spanishstories_a1_ws_sequencing_final_audit_v1.44.csv`

## Archivos que NO se archivan aquí

`spanishstories_a1_ws_coverage_final_v1.40.csv` permanece como fuente compartida porque audita cobertura de inventarios y no codifica la topología 32-islas/103-stories sustituida.

Asimismo permanecen activas las fuentes léxicas compartidas —por ejemplo normalización y source assertions— cuando no fueron sustituidas por la reestructuración.

## Compatibilidad temporal

En el momento de crear este respaldo el importer de Fase 1 todavía ejecuta v1.44. Por eso las cinco fuentes continúan temporalmente también en `content/a1/vocabulary/`.

**No son dos releases activos.** La copia dentro de `respaldo/` es histórica; la copia de raíz es un pin de compatibilidad hasta que Claude Code active v1.51. El implementation manifest exige eliminar las copias v1.44 de raíz solo después de que v1.51 pase importer, hashes, registry, query API, corrupción y determinismo.
