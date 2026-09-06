# Respaldo curricular A1

Esta carpeta conserva releases curriculares sustituidos sin convertirlos en fuentes activas del runtime.

Reglas:

- un release archivado conserva sus bytes y su trazabilidad;
- los archivos compartidos que siguen siendo autoridad léxica/curricular no se duplican aquí solo por pertenecer cronológicamente al release anterior;
- el runtime no debe leer desde `respaldo/`;
- durante una migración puede existir temporalmente una copia de compatibilidad en la raíz mientras el importer todavía dependa del release anterior;
- la eliminación de esa copia activa solo ocurre de forma atómica con la activación del release sucesor y después de pasar regresión.

Releases archivados:

- `a1-curriculum-v1.44/` — release anterior a la reestructuración 103 → 32 StoryBlueprints.
