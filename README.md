# SpanStories

SpanStories es una plataforma experimental para aprender español mediante historias conectadas e islas de conocimiento.

## Visor local vigente

Carpeta de trabajo: `D:\Español\SpanStories-worktrees\visor-mundo-20261021`.
Arranque único: `npm run dev:visor` desde esta raíz (o `npm run dev` desde `SpanStories-Ciudades`).
Abrir **http://localhost:3000/mundo/piloto-lexico** y cambiar entre Desarrollo y Visor Web dentro de esa página.
El motor de `SpanStories-Ciudades` es un recurso interno compartido, no otro visor para abrir por separado.
No hay redirecciones ni servidores de compatibilidad en puertos antiguos. El motor interno se usa dentro de la aplicación.
`dist-online` y `dist-web` son distribuciones generadas, no fuentes para editar; el arranque local usa los archivos fuente actuales.
Las versiones anteriores se conservan fuera del área activa en `D:\Español\RESPALDO_NO_CARGAR\versiones-antiguas\visores-anteriores-20261022`.

## Estado

El proyecto está en construcción. El desarrollo de la primera versión funcional se realiza en ramas de prueba antes de integrar cambios en `main`.

Baseline técnico vigente del motor:

```text
CurriculumRelease = A1-CURRICULUM-v1.51   (8 módulos / 11 islas / 32 StoryBlueprints)
LexiconRelease    = A1-LEXICON-v1.0

Fase 1 Curriculum Importer + Registry   MIGRATED / PASS
Fase 2 Lexical Engine                   REVALIDATED / PASS
Fase 3 Story Engine                     READY — no iniciada
```

## Documentación

La autoridad técnica del proyecto está versionada en este repositorio; no
depende de carpetas locales fuera de él.

| Documento | Qué es |
| --- | --- |
| `docs/architecture/README.md` | Índice de arquitectura y qué copia es la canónica |
| `docs/architecture/plataforma-arquitectura-v1.0.md` | Arquitectura de plataforma |
| `docs/architecture/plan-implementacion-motor-v1.0.md` | Plan de implementación del motor, Fases 1–6 |
| `docs/architecture/fases-motor/` | Especificaciones de Fase 1 y Fase 2 |
| `docs/lexical-engine.md` | Modelo de dominio de identidad léxica |
| `docs/curriculum-import.md` | Notas de implementación de Fase 1 |
| `docs/lexical-engine-implementation.md` | Notas de implementación de Fase 2 |
| `docs/curriculum/a1-restructure/` | Paquete curricular aprobado A–H de `A1-CURRICULUM-v1.51` |
| `HANDOFF_NEXT_PHASE.md` | Estado de fases y handoff a Fase 3 |

## Arquitectura pedagógica

```text
Nivel
  ↓
Módulo
  ↓
Isla
  ↓
Actividad / Historia / Práctica
```

Niveles previstos inicialmente:

- A1
- A2
- B1
- B2
- C1

## Separación visual / técnica

La interfaz y el motor son capas distintas.

```text
components/visual/
        ↓ props
lib/adapters/
        ↓
features/ + lib/
        ↓
content / persistence / engines
```

### Autoridad visual

`components/visual/` controla cómo se ve el producto: layout, tipografía, colores, spacing, responsive, motion y componentes presentacionales.

La referencia visual canónica actual está en:

`components/visual/baseline-v1/`

Ese baseline procede directamente del diseño aprobado de Claude Design. El CSS histórico de `app/globals.css` y `components/story-reader.module.css` se considera **legacy visual** y no debe usarse como referencia para nuevas pantallas.

Lee obligatoriamente `components/visual/README.md` antes de trabajar en diseño o integrar una pantalla.

### Autoridad técnica

`features/` y `lib/` controlan comportamiento, dominio y datos: currículo, Lexical Engine, Story Engine, learner events, progreso y demás lógica de aplicación.

`lib/adapters/` es la frontera para transformar modelos técnicos en props simples para la UI.

### Regla de integración

Un diseño aprobado debe conectarse a datos reales sin ser reinterpretado visualmente. La integración técnica sustituye mocks por datos/acciones reales; no rediseña silenciosamente componentes aprobados.

Lo que no se haya pedido cambiar debe permanecer visualmente igual al baseline aprobado.

## Estructura de trabajo

```text
components/
└── visual/
    ├── baseline-v1/
    ├── primitives/
    ├── layouts/
    ├── patterns/
    └── screens/

features/
├── curriculum/
├── lexical-engine/
├── story-engine/
└── learner-progress/

lib/
├── adapters/
├── curriculum.ts
├── lexical-prototype.ts
└── learner-event-prototype.ts
```

Los archivos prototipo existentes se conservan temporalmente donde están para no romper el vertical slice actual; se migrarán al dominio canónico cuando corresponda.

## Desarrollo

La rama experimental valida progresivamente:

1. navegación de nivel → módulo → isla;
2. lector de historias;
3. Lexical Engine;
4. estado e historial del estudiante;
5. conexión del currículo canónico A1;
6. persistencia y procesamiento lingüístico.

## Principios

- `main` se mantiene estable durante la fase experimental;
- currículo e interfaz son capas diferentes;
- forma ≠ lema ≠ sentido;
- historial y estado actual son datos diferentes;
- la apariencia aprobada no debe cambiar como efecto colateral de una integración técnica;
- el código priorizará arquitectura mantenible y tipada;
- el MVP no dependerá de servicios de pago obligatorios.

## Escenarios, países y personajes

La organización 3D y sus reglas para colaboradores e IA están en
[worlds/README.md](worlds/README.md). Incluye servicios compartidos, paquetes por país,
biblioteca de personajes sin copias por país y comandos de verificación.
