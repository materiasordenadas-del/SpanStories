# Adapters

Frontera entre datos/lógica técnica y componentes visuales.

Aquí se transforman modelos del motor en props simples para `components/visual/`.

Ejemplo conceptual:

```text
CurriculumIsland + LearnerProgress
        ↓ adapter
IslandCardProps
        ↓
components/visual
```

No introducir decisiones de diseño aquí y no trasladar lógica de dominio a los componentes visuales.