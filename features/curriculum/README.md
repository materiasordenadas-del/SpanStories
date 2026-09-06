# Curriculum feature

Registry, módulos, islas, secuenciación, targets y contratos curriculares. No
contiene estilos ni decisiones visuales.

## Frontera pública

```ts
import { loadCurriculumRegistry } from "@/features/curriculum";
```

`features/curriculum/index.ts` es el único contrato. La estructura de archivos
por debajo no lo es.

## Release activo

```text
CurriculumRelease   A1-CURRICULUM-v1.51        BASELINE ACTIVO
registry schema     curriculum-registry/2.0.0
topología           8 módulos / 11 islas / 32 StoryBlueprints
scheduling          985 primeras introducciones = 448 FOCUS + 537 SUPPORTED
grafo de retorno    2867 aristas = 985 FIRST + 950 SECOND + 932 THIRD
```

`A1-CURRICULUM-v1.44` (8 módulos / 32 islas / 103 StoryBlueprints / 2955
aristas) es **histórico**, no vigente. Sus fuentes de secuenciación están
archivadas literalmente en
`content/a1/vocabulary/respaldo/a1-curriculum-v1.44/` con manifest de bytes y
SHA-256. Ningún código activo las lee.

El inventario léxico compartido (`v1.37`, `v1.40`) no cambió con la
reestructuración: 599 lexemas, 666 formas, 608 sentidos, 214 MWU, 169 unidades
gramaticales.

## Qué hace y qué no

Importa los CSV publicados a un registry validado y reproducible, y lo consulta.
No implementa Lexical Engine, Story Engine, progreso del alumno ni persistencia.
El runtime nunca parsea CSV: lee el registry generado.

Ver `docs/curriculum-import.md` para el detalle, los invariantes y los hallazgos
sobre los datos publicados.
