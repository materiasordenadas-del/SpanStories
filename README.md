# SpanStories

SpanStories es una plataforma experimental para aprender español mediante historias conectadas e islas de conocimiento.

## Estado

El proyecto está en construcción. El desarrollo de la primera versión funcional se realizará en ramas de prueba antes de integrar cambios en `main`.

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

## Desarrollo

La primera rama experimental construirá un vertical slice navegable con:

1. selector de nivel;
2. cuatro módulos por nivel;
3. una isla experimental en el primer módulo;
4. base técnica para incorporar posteriormente el lector de historias y el Lexical Engine.

## Principios

- `main` se mantiene estable y mínimo durante la fase experimental;
- el prototipo se desarrolla en una rama separada;
- la interfaz visual inicial será deliberadamente sencilla;
- el código priorizará una arquitectura mantenible y tipada;
- el MVP no dependerá de servicios de pago obligatorios.
