# SpanStories

SpanStories es una plataforma experimental para aprender español mediante historias conectadas e islas de conocimiento.

## Estado

El proyecto está en construcción. El desarrollo de la primera versión funcional se realiza en ramas de prueba antes de integrar cambios en `main`.

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

Lee obligatoriamente `components/visual/README.md` antes de trabajar en diseño.

### Autoridad técnica

`features/` y `lib/` controlan comportamiento, dominio y datos: currículo, Lexical Engine, Story Engine, learner events, progreso y demás lógica de aplicación.

`lib/adapters/` es la frontera para transformar modelos técnicos en props simples para la UI.

### Regla de integración

Un diseño aprobado debe conectarse a datos reales sin ser reinterpretado visualmente. La integración técnica sustituye mocks por datos/acciones reales; no rediseña silenciosamente componentes aprobados.

## Estructura de trabajo

```text
components/
└── visual/
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
