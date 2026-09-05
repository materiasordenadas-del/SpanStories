# Capa visual — reglas para diseño

Esta carpeta es la autoridad de **apariencia y composición visual** de SpanStories.

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
- routing o lógica de negocio salvo lo mínimo necesario para previsualizar una pantalla.

## Regla principal

Un diseño aprobado debe poder conectarse al motor **sin rediseñarlo**.

Trabaja con datos mock y props simples. Ejemplo:

```tsx
<IslandCard
  title="Hola"
  progress={32}
  locked={false}
/>
```

La integración técnica sustituirá los mocks por datos reales sin cambiar el aspecto aprobado.

## Si necesitas un dato que no existe

No inventes lógica técnica dentro del componente. Define el dato visual que necesitas y deja que la capa técnica/adaptador lo proporcione.

## Estructura

- `primitives/` — botones, badges, iconos, controles visuales.
- `layouts/` — shells y composición de página.
- `patterns/` — componentes visuales reutilizables de producto.
- `screens/` — composiciones completas aprobadas para integración.

**Visual authority:** esta carpeta decide cómo se ve.
**Technical authority:** `features/` y `lib/` deciden cómo funciona.
