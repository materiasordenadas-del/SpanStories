# Capa visual — autoridad de diseño

Esta carpeta es la autoridad de **apariencia y composición visual** de SpanStories.

## Baseline visual canónico

La referencia visual actual es:

`components/visual/baseline-v1/`

Los HTML de esa carpeta proceden directamente del proyecto aprobado de Claude Design. **No son una reinterpretación del UI anterior de Codex.**

Pantallas canónicas actuales:

- `SpanStories Web.dc.html` — landing y demostración del lector;
- `Niveles.dc.html` — selector de niveles;
- `Islas.dc.html` — vista de islas;
- `Progreso.dc.html` — progreso;
- `_ds/.../styles.css` — sistema visual Modernist usado por esas pantallas.

### Regla de conservación

Lo que no se pida cambiar debe permanecer visualmente igual al baseline.

El prototipo visual anterior fue retirado del árbol activo y archivado fuera del repositorio. Las pantallas nuevas deben tomar como única referencia este baseline.

## Puedes modificar

- layout y composición;
- tipografía;
- colores;
- espaciado;
- bordes, sombras y superficies;
- iconografía;
- animaciones y transiciones;
- responsive;
- estados visuales (`hover`, `selected`, `disabled`, `locked`, etc.);
- componentes puramente presentacionales.

Haz cambios únicamente cuando se soliciten. No modernices, simplifiques ni adaptes otras zonas por iniciativa propia.

## No debes modificar

- `lib/`;
- `features/`;
- currículo ni archivos de `content/`;
- IDs canónicos (`LEX-*`, `SENSE-*`, `FORM-*`, etc.);
- Lexical Engine;
- learner events o progreso;
- persistencia/base de datos;
- contratos de datos;
- reglas pedagógicas;
- lógica de negocio.

## Integración técnica

Un diseño aprobado debe poder conectarse al motor **sin rediseñarlo**.

El flujo correcto es:

```text
baseline-v1 / pantalla aprobada
        ↓
componente visual fiel
        ↓ props / callbacks
lib/adapters/
        ↓
features/ + lib/
```

La integración técnica sustituye mocks por datos y acciones reales. Puede modificar el markup cuando sea necesario para implementar fielmente la pantalla, pero no debe conservar el layout legacy si entra en conflicto con el baseline aprobado.

## Estructura de trabajo

- `baseline-v1/` — fuente visual canónica actual;
- `primitives/` — futuros controles presentacionales extraídos del baseline;
- `layouts/` — futuros shells/composición reutilizable;
- `patterns/` — futuros patrones visuales de producto;
- `screens/` — futuras implementaciones React aprobadas.

**Visual authority:** esta carpeta y el baseline aprobado deciden cómo se ve.
**Technical authority:** `features/` y `lib/` deciden cómo funciona.
