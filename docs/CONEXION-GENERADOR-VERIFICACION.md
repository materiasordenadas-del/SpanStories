# Conexión generador → visor: verificación del 26/10/2026

Implementado en el generador `D:\Español\Generador-Mundos` y el visor vigente `D:\Español\SpanStories-worktrees\visor-mundo-20261021`, rama `feat/visor-mundo-20261021`.

## Resultado comprobado

- El botón **Enviar al visor** exportó y registró `Escuela generada`: 36 sectores, 380 identidades y aproximadamente 27,4 MB de archivos por versión.
- **Lugares del generador** permitió abrirla dentro de la entrada única del visor. Carga real revisada en Desarrollo y Visor Web.
- Selección del aulario `gen:edificio:1` y vínculo a su proyecto fuente comprobados.
- La herramienta `scripts/lugares.mjs editar` creó un borrador cambiando exclusivamente la altura del aulario a 14 m. El generador abrió ese borrador y **Actualizar en el visor** creó v2 con el mismo ID.
- Comparación directa de los JSON guardados: `model` idéntico entre v1 y v2; `overrides` contiene solo `gen:edificio:1: {height:14}`. El metadato exportado `lugar.json` registra 14 m para ese edificio.
- El catálogo contiene un lugar y dos versiones. La primera sigue disponible desde **Versión del lugar** y sus archivos se conservan.
- Barcelona cargó antes de la prueba con su editor y sin errores de ejecución observados. Se preservaron los cambios existentes del worktree.
- Se corrigieron dos incompatibilidades del adaptador Atlas: multiplicación del color por instancia y contornos de instancias que aparecían en el origen. El código general de luz y materiales del visor permanece intacto.

ID del lugar: `atlas-63aee54a-a63b-424a-870a-18c13c8e9182`.

- v1: `ba99e8eb-85ac-44e4-be0e-ccd21fe650c4`.
- v2: `15926703-711f-4cae-b437-4ec6ebd5adb2`.

Entrada del ejemplo: http://localhost:3000/mundo/piloto-lexico?modo=desarrollo&zone=atlas-63aee54a-a63b-424a-870a-18c13c8e9182

Captura final: [visor-v2.jpg](../SpanStories-Ciudades/reports/atlas-connection/visor-v2.jpg).

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Suite del generador | 117 pruebas aprobadas |
| Revisión final de biblioteca, proyectos y exportación | 12 pruebas aprobadas |
| Suite del motor del visor, incluidos 6 casos del adaptador Atlas | 28 pruebas aprobadas |
| TypeScript del proyecto del visor | `npm run typecheck` aprobado |
| Compilación del generador | `npm run build` aprobado; aviso de chunks mayores de 500 kB |
| Navegador real | Envío, apertura, selección, borrador, actualización, historial y Visor Web revisados |

Los casos nuevos cubren integridad, confinamiento de rutas, conflictos de hash/revisión, conservación de fuentes, independencia de IDs, descarga de sectores compartidos, relieve, colores y contornos de instancias. No son una garantía de rendimiento de cualquier ciudad o dispositivo.

Registros locales: `SpanStories-Ciudades/reports/atlas-connection-tests.log`, `generated/atlas-typecheck.log` y, en el generador, `.trabajo/visor-tests.log`, `.trabajo/visor-final-tests.log`, `.trabajo/visor-build.log`.

## Uso y límites

Guía y comandos de edición: `D:\Español\Generador-Mundos\docs\CONEXION-VISOR.md`.

Las ediciones de edificios y calles se hacen en el proyecto fuente y se envían como una nueva versión. Los elementos procedurales, como árboles, conservan ID para selección, pero su modificación depende de los controles del generador. El acabado depende de la luz del visor; efectos exclusivos de Atlas no se convierten automáticamente en efectos del visor. Las colisiones usan cajas de edificios. No se asignan automáticamente vocabulario, audio ni historias.

La conexión es local. No se realizó publicación en Internet. El ejemplo de prueba queda disponible con sus dos versiones.
