# SpanStories — MOTOR Fase 1: Curriculum Importer + Canonical Registry

**Versión:** 1.0  
**Repositorio objetivo:** `materiasordenadas-del/SpanStories`  
**Rama obligatoria:** `prueba`  
**Agente previsto:** Claude Code, razonamiento **muy alto**  
**Tipo de trabajo:** técnico / backend de dominio; **sin trabajo visual**  
**Objetivo de cierre:** dejar la Fase 1 implementada, probada, documentada, commiteada y subida a GitHub en `origin/prueba`.

---

> ## Estado: `MIGRATED / PASS`
>
> Fase 1 está **implementada y migrada** al release `A1-CURRICULUM-v1.51`.
> Este documento es la especificación original de la fase; se conserva como
> autoridad de diseño y se ha actualizado a las cifras vigentes.
> Copia canónica: `docs/architecture/fases-motor/fase1-curriculum-importer-registry-v1.0.md`.
>
> **BASELINE ACTIVO**
>
> ```text
> CurriculumRelease = A1-CURRICULUM-v1.51
> Registry schema   = curriculum-registry/2.0.0
> 8 módulos / 11 islas / 32 StoryBlueprints
> 985 primeras introducciones = 448 FOCUS + 537 SUPPORTED
> 2867 aristas de retorno = 985 FIRST + 950 SECOND + 932 THIRD
> ```
>
> **HISTORICAL BASELINE — SUPERSEDED:** `A1-CURRICULUM-v1.44`, 32 islas,
> 103 StoryBlueprints, 2955 aristas, registry schema `1.0.0`.
>
> Cambios de esquema respecto de la especificación original: la arquitectura
> publica filas `ISLAND` y ninguna `MODULE` (los módulos se agrupan por
> `module_id`); las asignaciones llevan `story_id`/`island_id` y
> `intro_salience` (`FOCUS`/`SUPPORTED`); el grafo de retorno usa
> `FIRST/SECOND/THIRD_RETURN` y une por (`target_id`, `introduction_story`) en
> lugar de `allocation_id`, con **1 a 3** retornos por target.
> Detalle en `HANDOFF_NEXT_PHASE.md` y `docs/curriculum-import.md`.

---

# 1. Misión de esta fase

Construye únicamente la **Fase 1 del motor canónico**:

```text
ARTEFACTOS CURRICULARES A1 PUBLICADOS
        ↓
INSPECCIÓN Y VALIDACIÓN DE FUENTES
        ↓
SCHEMAS CANÓNICOS
        ↓
CURRICULUM IMPORTER
        ↓
VALIDATORS / INVARIANTS
        ↓
CurriculumRelease + hashes
        ↓
CANONICAL REGISTRY GENERADO
        ↓
QUERY API
        ↓
TESTS AUTOMATIZADOS
```

El resultado debe demostrar que el currículo publicado puede convertirse de forma **determinista, reproducible, trazable y consultable** en objetos de dominio aptos para las fases posteriores.

**Esta fase NO implementa todavía el Lexical Engine como motor.** Puede definir los contratos estructurales mínimos que el importer necesita (`Lexeme`, `LexemeForm`, `Sense`, etc.), pero no debe adelantar la lógica de Fase 2.

---

# 2. Regla principal: inspecciona antes de asumir

**No des nada por hecho.**

Antes de escribir código debes inspeccionar el estado real del repositorio, los archivos curriculares, sus headers, formatos, IDs, relaciones, scripts, dependencias, tests y convenciones existentes.

Los documentos arquitectónicos describen el diseño esperado, pero **el código y los artefactos canónicos reales deben ser verificados**.

No debes asumir que:

- una ruta existe porque aparece en un documento;
- un CSV conserva exactamente los headers esperados;
- los conteos documentados coinciden con los archivos actuales;
- los IDs tienen un patrón uniforme sin comprobarlo;
- una columna vacía significa `null` y no otra cosa;
- una relación entre archivos puede deducirse por nombre;
- el package manager es `npm` si el repositorio usa otro;
- ya existe un framework de tests;
- un archivo prototípico es autoridad curricular;
- una contradicción debe resolverse escogiendo silenciosamente una de las versiones.

## 2.1 Protocolo de contradicciones

Si encuentras una discrepancia entre:

```text
arquitectura
vs
CSV canónico
vs
currículo consolidado
vs
código existente
vs
tests / fixtures
```

haz lo siguiente:

1. identifica exactamente la contradicción;
2. determina qué artefactos participan;
3. comprueba si puede resolverse objetivamente mediante IDs, referencias o datos del repositorio;
4. si puede resolverse sin inventar una regla, implementa la interpretación demostrable y documenta la decisión;
5. si requiere una decisión curricular/editorial no especificada, **NO la inventes**;
6. registra el caso como `BLOCKER_CONTRADICTION` o equivalente en el reporte/handoff;
7. implementa todo lo demás que no dependa de esa decisión;
8. el importer debe fallar explícitamente cuando la contradicción comprometa la validez de la release.

Nunca modifiques datos canónicos para que “encajen” con los conteos esperados.

Nunca ocultes una inconsistencia mediante `try/catch`, defaults silenciosos, coerciones laxas o filtrado de filas problemáticas.

---

# 3. Autoridades que debes respetar

## 3.1 Autoridad curricular

La autoridad curricular A1 reside en los artefactos publicados bajo la zona de contenido curricular del repositorio, actualmente esperada en:

```text
content/a1/vocabulary/
```

Debes **verificar la ruta real** antes de usarla.

## 3.2 Arquitectura técnica

La implementación debe integrarse preferentemente en la frontera existente:

```text
features/curriculum/
```

pero antes inspecciona si ya existe una estructura equivalente. No crees duplicados solo para coincidir con este documento.

## 3.3 Prototipos

Archivos como:

```text
lib/curriculum.ts
lib/lexical-prototype.ts
lib/learner-event-prototype.ts
components/story-reader.tsx
content/a1/module-1/island-1/story-1.ts
```

son prototipos/fixtures, no autoridad curricular final.

**No los borres ni los reescribas en esta fase.**

---

# 4. Auditoría inicial obligatoria del repositorio

Antes de implementar, realiza y documenta una auditoría breve.

Comprueba como mínimo:

```text
1. repositorio remoto real;
2. rama actual;
3. existencia de la rama `prueba` local y remota;
4. git status y cambios no relacionados;
5. package manager y lockfile;
6. versión de Node declarada/real;
7. scripts existentes en package.json;
8. framework de tests existente, si lo hay;
9. estructura de features/curriculum/;
10. estructura real de content/a1/vocabulary/;
11. presencia exacta de los CSV requeridos;
12. encoding, delimitador y headers reales de cada CSV;
13. documentación vigente relacionada con arquitectura/importer;
14. cualquier importer, validator o schema ya existente que pueda reutilizarse;
15. estado de lint/typecheck/build antes de tus cambios.
```

### Regla Git durante la auditoría

Si existen cambios locales ajenos a esta fase:

- no los borres;
- no hagas `reset --hard`;
- no hagas `clean` destructivo;
- no los mezcles en tu commit;
- evita modificar esos mismos archivos salvo necesidad demostrable.

---

# 5. Inputs canónicos mínimos a inspeccionar e importar

Debes localizar y verificar estos artefactos por contenido/nombre:

```text
spanishstories_a1_ws_normalization_master_v1.37.csv
spanishstories_a1_ws_source_assertions_modes_v1.40.csv
spanishstories_a1_ws_sequencing_architecture_v1.51.csv
spanishstories_a1_ws_sequencing_allocation_v1.51.csv
spanishstories_a1_ws_story_blueprints_v1.51.csv
spanishstories_a1_ws_recycling_edges_v1.51.csv
```

Validadores cruzados adicionales esperados:

```text
spanishstories_a1_ws_coverage_final_v1.40.csv
spanishstories_a1_ws_sequencing_final_audit_v1.51.csv
```

Documentación humana consolidada esperada:

```text
docs/curriculum/a1-restructure/spanstories_a1_implementation_manifest_v1.51.md
```

> **SUPERSEDED.** Las cinco fuentes `*_v1.44.csv` y
> `spanishstories_curriculo_a1_prueba1_v1.44.md` pertenecen al release
> histórico. Las CSV están archivadas en
> `content/a1/vocabulary/respaldo/a1-curriculum-v1.44/` y ya no se importan.

## 5.1 Si falta algún archivo

No inventes su contenido ni generes un sustituto falso.

Determina primero si:

- fue renombrado;
- existe una versión posterior que oficialmente lo sustituye;
- está en otra ruta del mismo repositorio;
- el código ya usa otro artefacto canónico.

Si no existe una sustitución demostrable, repórtalo como bloqueo de fuente.

---

# 6. Alcance exacto de implementación

Debes implementar como mínimo los siguientes componentes conceptuales.

## 6.1 Schemas TypeScript canónicos

Crea contratos tipados para representar únicamente lo necesario para importar y consultar la release curricular.

Entidades mínimas esperadas:

```text
CurriculumRelease
Level
Module
Island
StoryBlueprint
CurriculumTarget
GrammarUnit
MwuUnit
Lexeme
LexemeForm
Sense
SourceAssertion
RecycleEdge
```

No supongas campos concretos antes de inspeccionar los CSV.

Distingue con claridad:

```text
raw CSV row
!=
validated input row
!=
canonical domain object
```

No uses `any` como vía normal de modelado.

Si una propiedad puede estar ausente, represéntalo explícitamente en el contrato y documenta por qué.

## 6.2 Parser / loader

Implementa lectura robusta de los CSV canónicos.

Debe:

- respetar encoding real;
- manejar correctamente comillas, comas y saltos de línea internos si existen;
- conservar IDs exactamente como fueron publicados;
- reportar número de fila/archivo ante errores cuando sea posible;
- no ignorar columnas desconocidas silenciosamente si estas pueden indicar cambio de schema;
- diferenciar error de parsing, error de schema y error de dominio.

No agregues una dependencia nueva solo por conveniencia sin revisar primero las dependencias ya instaladas.

Si agregas una dependencia, debe ser gratuita/open source, estar justificada y quedar reflejada en lockfile.

## 6.3 Curriculum Importer

El importer debe transformar los artefactos raw en objetos canónicos.

Requisitos:

```text
same inputs
→ same canonical semantic output
```

Debe ser posible ejecutarlo desde una máquina limpia con el repositorio y las dependencias instaladas.

No debe depender de:

- UI;
- navegador;
- `localStorage`;
- PostgreSQL;
- API externa;
- IA;
- red en tiempo de importación normal.

## 6.4 Validators e invariants

Implementa validaciones estructurales y cruzadas.

Como mínimo deben detectar:

```text
- IDs publicados duplicados;
- referencias a IDs inexistentes;
- Sense sin Lexeme válido;
- LexemeForm sin Lexeme válido;
- SourceAssertion huérfana;
- StoryBlueprint inexistente referenciado por allocation/recycle;
- target inexistente;
- first introduction duplicada cuando el modelo exige unicidad;
- recycle edge a Story inexistente;
- recycle edge temporalmente inválido/backward cuando esté prohibido por la secuencia;
- A2 boundary programado como target A1;
- target regional receptivo convertido en productivo universal;
- conteos críticos incompatibles con la release declarada;
- schema/version mismatch;
- IDs con patrón inválido cuando el patrón esté demostrado por las fuentes;
- filas obligatorias incompletas;
- tipos de target desconocidos sin manejo explícito.
```

Los errores críticos deben producir:

```text
IMPORT FAIL
```

No una release parcialmente válida presentada como correcta.

## 6.5 CurriculumRelease

Cada importación canónica debe producir un manifest reproducible equivalente a:

```text
CurriculumRelease
- releaseId
- schemaVersion
- sourceFiles
- sourceHashes
- importedAt / generatedAt con semántica clara
- expectedCounts
- actualCounts
- validationResult
```

### Hashes

Calcula **SHA-256** de cada fuente utilizada.

Debes distinguir entre:

```text
reproducibilidad del contenido
vs
timestamp de ejecución
```

Un timestamp variable no debe provocar que una prueba de determinismo semántico falle injustificadamente.

## 6.6 Registry generado

Genera una representación apta para runtime sin parsear CSV durante requests.

La arquitectura espera aproximadamente:

```text
generated/curriculum/a1/
├── release.json
├── lexemes.json
├── forms.json
├── senses.json
├── source-assertions.json
├── modules.json
├── islands.json
├── story-blueprints.json
├── targets.json
└── recycle-edges.json
```

**La ruta exacta puede ajustarse si el repositorio ya tiene una convención mejor**, pero debe existir una única salida canónica clara.

No dupliques los mismos datos en múltiples árboles sin necesidad.

## 6.7 Query API mínima

Expón consultas técnicas estables suficientes para demostrar que el registry sirve como autoridad ejecutable.

Como mínimo debe poder:

```text
- getLexemeById(LEX-A1-*)
- getFormById(FORM-A1-*)
- getSenseById(SENSE-A1-*)
- obtener SourceAssertions de un Sense/target cuando la relación exista;
- obtener módulos e islas en orden curricular;
- obtener StoryBlueprint por ID;
- resolver un CurriculumTarget por ID;
- obtener la first introduction de un target;
- obtener recycle edges / recycle path de un target;
- distinguir un target no encontrado de un resultado vacío válido.
```

Los nombres exactos pueden adaptarse al estilo del repositorio. La semántica no.

---

# 7. Conteos esperados: comprobar, no falsificar

La arquitectura vigente establece estos invariantes esperados para la release A1:

```text
LEXEME_COUNT             = 599
LEXEME_FORM_COUNT        = 666
SENSE_REGISTRY_COUNT     = 608
A1_SENSE_COUNT           = 602
A2_BOUNDARY_SENSES       = 6
MWU_COUNT                = 214
GRAMMAR_UNITS            = 169
MODULE_COUNT             = 8
ISLAND_COUNT             = 11
STORY_BLUEPRINT_COUNT    = 32
FIRST_INTRO_OBJECTS      = 985
FOCUS_FIRST_INTRO        = 448
SUPPORTED_FIRST_INTRO    = 537
RECYCLE_EDGE_COUNT       = 2867
FIRST_RETURN_EDGES       = 985
SECOND_RETURN_EDGES      = 950
THIRD_RETURN_EDGES       = 932
```

> **HISTORICAL BASELINE — SUPERSEDED:** v1.44 declaraba `ISLAND_COUNT = 32`,
> `STORY_BLUEPRINT_COUNT = 103` y `RECYCLE_EDGE_COUNT = 2955`. No son
> expectativas activas.

También se espera:

```text
orphan senses                  = 0
orphan forms                   = 0
A2 boundary scheduled as A1    = 0
backward recycle edges         = 0
published ID duplicates        = 0
```

## Regla crítica

Estos números son **criterios de aceptación que debes verificar contra los datos**, no constantes que debas forzar mediante filtros, truncados, deduplicación arbitraria o filas inventadas.

Si los artefactos canónicos reales no producen estos conteos:

```text
EXPECTED != ACTUAL
```

el importer debe reportar la discrepancia con suficiente detalle para localizarla.

---

# 8. Determinismo y reproducibilidad

Ejecuta el import al menos dos veces con las mismas fuentes.

Debes demostrar que:

```text
same source bytes
+
same importer version
→
same canonical semantic registry
```

Comprueba al menos:

- mismos IDs;
- mismas relaciones;
- mismos conteos;
- mismo orden canónico donde el orden sea significativo;
- mismos hashes de fuentes;
- mismo hash/representación semántica de la salida excluyendo campos legítimamente variables como `generatedAt` si existe.

No dependas del orden accidental de objetos, filesystem o iteración no determinista.

---

# 9. Tests obligatorios

No cierres esta fase sin tests automatizados.

Adapta el framework de tests al repositorio existente. Si no existe ninguno, selecciona la opción mínima compatible con el stack y justifica la decisión.

## 9.1 Happy path

Debe probar:

1. import completo de la release A1;
2. conteos esperados;
3. cero referencias huérfanas;
4. lookup real por al menos un `LEX-A1-*`;
5. lookup real por al menos un `FORM-A1-*`;
6. lookup real por al menos un `SENSE-A1-*`;
7. resolución Sense → Lexeme;
8. resolución Form → Lexeme;
9. recuperación de módulos/islas/Stories en secuencia;
10. recuperación de first introduction;
11. recuperación de recycle path/edges;
12. manifest con hashes SHA-256.

## 9.2 Corrupción deliberada

Las pruebas de error deben usar **fixtures/copias temporales**, nunca modificar destructivamente los CSV canónicos.

Debes demostrar `IMPORT FAIL` al menos ante:

```text
A. ID duplicado
B. FK/ID referenciado inexistente
C. Sense huérfano
D. Form huérfana
E. Story/recycle destination inexistente
F. target A2 introducido como A1
G. first introduction inválida/duplicada
H. conteo crítico inconsistente
```

Si algún caso no puede construirse porque el schema real demuestra otra semántica, documenta la razón y crea el test equivalente que pruebe el mismo invariant.

## 9.3 Determinismo

Incluye una prueba que ejecute/importa dos veces y compare la salida semántica.

## 9.4 Regresión general

Al final ejecuta, según existan en el repo:

```text
lint
typecheck
tests
build
```

Si algún comando ya fallaba antes de la fase, demuestra la diferencia preexistente y no la atribuyas falsamente a tus cambios.

---

# 10. Errores de dominio explícitos

No devuelvas `undefined` silencioso ante errores estructurales.

Usa errores/códigos diferenciables equivalentes a:

```text
CURRICULUM_IMPORT_INVALID
CURRICULUM_SCHEMA_MISMATCH
CURRICULUM_DUPLICATE_ID
CURRICULUM_REFERENCE_NOT_FOUND
CURRICULUM_COUNT_MISMATCH
CURRICULUM_RELEASE_MISMATCH
CURRICULUM_TARGET_INVALID
CURRICULUM_SEQUENCE_INVALID
```

No es obligatorio usar exactamente estos nombres si el repositorio ya posee una convención coherente.

Cada error importante debe conservar contexto suficiente:

```text
source file
row / record id
field
referenced id
reason
```

cuando sea técnicamente posible.

---

# 11. Qué puedes tocar

Dentro de esta fase puedes modificar/crear únicamente lo necesario para el Curriculum Importer y Registry, por ejemplo:

```text
features/curriculum/**
scripts relacionados con curriculum import, si son necesarios
generated/curriculum/** o ruta equivalente
tests del curriculum importer/registry
docs/curriculum-import.md
package.json / lockfile SOLO si una dependencia o script es realmente necesario
config de tests/typecheck SOLO si es indispensable y no rompe el resto del repo
HANDOFF_NEXT_PHASE.md o equivalente
```

También puedes hacer una modificación mínima fuera de esas rutas **solo si es estrictamente necesaria** para compilar/probar la Fase 1. Debes justificarla en el reporte final.

---

# 12. Qué NO debes tocar

## Prohibición absoluta de alcance

No implementes ni modifiques funcionalmente:

```text
features/lexical-engine/        # Fase 2, salvo tipos compartidos mínimos si ya existe contrato común
features/story-engine/          # Fase 3
features/learner-progress/      # Fase 4
PostgreSQL / migrations / ORM   # Fase 5
Python NLP / spaCy              # Fase 6
Auth.js / autenticación
mastery
spaced repetition
recomendador adaptativo
stories A1 reales
```

No rediseñes ni alteres el baseline visual:

```text
components/visual/baseline-v1/**
components/visual/**
```

No cambies la UI para “mostrar” la Fase 1.

No reemplaces todavía:

```text
lib/curriculum.ts
lib/lexical-prototype.ts
lib/learner-event-prototype.ts
components/story-reader.tsx
```

salvo una adaptación mínima inevitable y justificada. Preferencia: **no tocarlos**.

No:

- migres a monorepo;
- cambies Next.js/React;
- cambies package manager;
- agregues PostgreSQL;
- agregues una API externa;
- uses servicios de pago;
- generes IDs desde surface strings;
- recalcules nivel CEFR por frecuencia/cognados/NLP;
- conviertas todos los MWU en Lexemes;
- hagas parsing de CSV en componentes React o request-time;
- copies manualmente los CSV a arrays TypeScript dispersos;
- “limpies” datos canónicos sin una regla editorial demostrable;
- hagas cambios de diseño visual;
- borres fixtures/prototipos útiles;
- hagas `git push --force`;
- toques `main`.

---

# 13. Restricciones de Git y GitHub

La fase debe terminar **subida a GitHub**.

## 13.1 Rama

La rama autorizada por la arquitectura es:

```text
prueba
```

El usuario puede referirse coloquialmente a ella como “pruebas”, pero **no inventes una rama nueva** por esa diferencia de nombre.

Primero verifica las ramas reales.

## 13.2 Antes de modificar

Debes:

```text
git remote -v
git branch -a
git status
```

Verifica que el remoto corresponde a:

```text
materiasordenadas-del/SpanStories
```

y que trabajas sobre `prueba`.

Sin perder cambios locales ajenos, sincroniza de forma segura con remoto si corresponde. Prefiere operaciones no destructivas (`fetch`, `pull --ff-only` cuando sea aplicable).

## 13.3 Prohibido

```text
NO checkout main para desarrollar
NO commit en main
NO push a main
NO force push
NO reset --hard de trabajo ajeno
NO rebase destructivo de commits ajenos
NO incluir cambios no relacionados en el commit
```

## 13.4 Commit

Cuando todos los tests posibles estén verdes y la revisión final sea satisfactoria:

1. inspecciona `git diff` completo;
2. verifica que no se incluyeron secretos, archivos temporales ni artefactos ajenos;
3. añade únicamente archivos de esta fase;
4. crea un commit claro, por ejemplo:

```text
feat(curriculum): implement canonical importer and registry
```

El mensaje puede ajustarse a la convención real del repositorio.

## 13.5 Push obligatorio

Haz push explícito a:

```text
origin/prueba
```

Ejemplo conceptual:

```text
git push origin prueba
```

Después verifica que el push terminó correctamente y reporta el commit SHA resultante.

**No consideres la fase terminada si el commit solo existe localmente.**

---

# 14. Documentación obligatoria

Crea o actualiza:

```text
docs/curriculum-import.md
```

Debe explicar de forma corta pero suficiente:

```text
- fuentes canónicas consumidas;
- schema/version de la release;
- comando para ejecutar el importer;
- dónde se genera el registry;
- invariantes críticos;
- comportamiento ante errores;
- cómo ejecutar tests;
- qué NO resuelve todavía esta fase.
```

No conviertas el documento en una repetición extensa de la arquitectura general.

---

# 15. Handoff obligatorio para Fase 2

Crea un handoff breve, preferentemente:

```text
HANDOFF_NEXT_PHASE.md
```

o en la ubicación documental ya establecida por el repositorio.

Debe contener únicamente información operativa para el siguiente chat:

```text
1. commit SHA de Fase 1;
2. archivos/entrypoints principales;
3. comando para regenerar el registry;
4. comando para tests;
5. contratos públicos disponibles;
6. ubicación del generated registry;
7. errores/contradicciones abiertas;
8. deuda técnica deliberadamente pospuesta;
9. restricciones que Fase 2 debe respetar;
10. confirmación de que el push llegó a origin/prueba.
```

No copies conversaciones enteras al handoff.

---

# 16. Definition of Done — no cierres antes de cumplirla

La Fase 1 está completa solamente si se cumplen **todos los puntos aplicables**:

```text
[ ] repositorio y rama fueron inspeccionados antes de modificar
[ ] se preservaron cambios ajenos
[ ] se inspeccionaron headers y relaciones reales de los CSV
[ ] contradicciones fueron investigadas, no asumidas
[ ] existen schemas canónicos tipados
[ ] existe importer ejecutable
[ ] existe CurriculumRelease manifest
[ ] existen hashes SHA-256 de fuentes
[ ] existe registry generado apto para runtime
[ ] no se parsean CSV en runtime/request de la UI
[ ] existe query API mínima
[ ] LEX-A1 lookup funciona
[ ] FORM-A1 lookup funciona
[ ] SENSE-A1 lookup funciona
[ ] first-introduction lookup funciona
[ ] recycle lookup/path funciona
[ ] validación de FKs funciona
[ ] validación de IDs duplicados funciona
[ ] validación de A2-boundary funciona
[ ] validación de secuencia/recycling funciona
[ ] conteos esperados fueron comprobados contra los datos reales
[ ] discrepancias no fueron maquilladas
[ ] pruebas de corrupción deliberada fallan correctamente
[ ] determinismo fue probado
[ ] lint/typecheck/tests/build relevantes fueron ejecutados
[ ] prototipos no fueron borrados
[ ] UI/baseline visual no fue rediseñado
[ ] PostgreSQL/NLP/Learner Engine/Story Engine no fueron adelantados
[ ] docs/curriculum-import.md existe/está actualizado
[ ] handoff de Fase 2 existe
[ ] git diff final fue revisado
[ ] commit de Fase 1 fue creado
[ ] push a origin/prueba fue exitoso
[ ] SHA final fue reportado
```

Si un punto no puede cumplirse, no lo marques como cumplido. Explica exactamente por qué.

---

# 17. Reporte final que debes entregar en este chat

Al terminar, responde de forma técnica y breve con esta estructura:

```text
FASE 1 — RESULTADO

Estado:
PASS | PASS_WITH_WARNINGS | BLOCKED

Implementado:
- ...

Archivos principales:
- ...

Auditoría / contradicciones encontradas:
- ...

Conteos reales:
- Lexemes: ...
- Forms: ...
- Senses: ...
- A1 senses: ...
- A2 boundary: ...
- MWU: ...
- GrammarUnits: ...
- Modules: ...
- Islands: ...
- StoryBlueprints: ...
- First introductions: ...
- Recycle edges: ...

Tests:
- lint: PASS/FAIL/N/A
- typecheck: PASS/FAIL/N/A
- unit/integration: PASS/FAIL
- build: PASS/FAIL/N/A
- corruption tests: PASS/FAIL
- determinism: PASS/FAIL

Git:
- branch: prueba
- commit: <SHA>
- push: origin/prueba PASS/FAIL

Pendiente deliberadamente para Fase 2:
- ...
```

No declares `PASS` si existe una contradicción crítica sin resolver o si el push obligatorio falló.

---

# 18. Regla final

Esta fase no consiste en “hacer que los CSV carguen”.

Consiste en demostrar técnicamente que:

```text
CURRÍCULO PUBLICADO
        ↓
IMPORTACIÓN DETERMINISTA
        ↓
VALIDACIÓN ESTRICTA
        ↓
IDENTIDADES CANÓNICAS CONSERVADAS
        ↓
REGISTRY REPRODUCIBLE
        ↓
CONSULTAS ESTABLES
```

puede convertirse en la **autoridad ejecutable** sobre la que se construirá el Lexical Engine.

Si los datos contradicen la arquitectura, **descubre la contradicción**. No la escondas.  
Si el código contradice los datos, **demuéstralo**. No lo normalices por intuición.  
Si una decisión no está autorizada por las fuentes, **no la inventes**.
