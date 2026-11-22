# ADR: Jinete anclado por la pelvis, libre en todo lo demás

**Estado:** Aceptado (sustituye la regla «el caballo es el único dueño» de C4/P1)
**Fecha:** 2026-11-21
**Decide:** autor del proyecto

## Contexto

En P1 (C4) se creó el vínculo `Actor.montura = {caballoId}` en el jinete. La implementación tomó una decisión de más:
mientras está montado, el jinete **no tiene movimiento propio**. Se ignoraban sus caminatas, giros y miradas
(`actor-motion.ts`), el Estudio escondía sus campos de posición y orientación, y «Colocar con un clic» lo rechazaba.

El requisito real es otro:

- La **pelvis** del jinete va unida a la silla de la montura. Al mover o girar el caballo, el jinete va con él.
- **El resto del cuerpo** (cabeza, cuello, columna, manos, pies, tobillos…) se mueve y se edita libremente.
- **Tanto el caballo como el jinete** se pueden mover, rotar y arrastrar en el escenario y en los Talleres.

## Decisión

El vínculo sigue viviendo en el jinete y sigue siendo la única fuente de verdad para emparejar. Cambia lo que significa:

| Quién | Qué controla |
|---|---|
| Caballo | El **marco de anclaje**: posición y rumbo de la silla en el mundo. |
| Jinete | Su **desfase sobre ese marco** (posición y rumbo relativos) y **todas sus articulaciones**. |

Transformación del jinete = transformación del caballo ∘ desfase del jinete.

- Mover o girar el caballo: el jinete va con él y conserva su desfase (`carryRiders`, sin cambios).
- Mover, girar o arrastrar al jinete: cambia solo su desfase. El vínculo se mantiene y el caballo no se mueve.
- Cues propios del jinete (giro, mirada, caminata): se aplican. Después, el caballo lo lleva consigo.
- Articulaciones: las edita el Taller sobre la silla (`sentar()` coloca la cadera en la silla y los controles se
  dibujan a través de `displayXform`). No las toca la lógica del vínculo.
- Bajarse del caballo es elegir «(a pie)». Mover al jinete lejos no lo desmonta.

El desfase no se guarda en un campo nuevo. Es implícito: la posición del jinete en el mundo menos la de su montura,
expresada en el marco del caballo. El formato de las historias no cambia.

## Opciones consideradas

### A. El caballo es el único dueño (P1)
| Dimensión | Valoración |
|---|---|
| Complejidad | Baja |
| Coste de datos | Ninguno |
| Cumple el requisito | **No**: el jinete queda rígido en el escenario |

### B. Desfase implícito + movimiento propio del jinete (elegida)
| Dimensión | Valoración |
|---|---|
| Complejidad | Baja: quitar bloqueos; `carryRiders` ya conserva el desfase |
| Coste de datos | Ninguno; historias antiguas válidas |
| Cumple el requisito | Sí |

**Contra:** si el jinete tiene una caminata con destino en el mundo **a la vez** que el caballo anda, los dos
movimientos se suman y el resultado es difícil de prever. Se avisa en `checks.ts`.

### C. Campo explícito `montura.desfase` en coordenadas del caballo
| Dimensión | Valoración |
|---|---|
| Complejidad | Media: migración, validación y doble representación de la posición |
| Cumple el requisito | Sí |

**Contra:** dos fuentes para la posición del jinete (mundo y desfase), que se pueden desincronizar. Se descarta.

## Consecuencias

- Más fácil: colocar al jinete en la silla con precisión, girarlo, hacerle mirar a otro personaje mientras cabalga.
- Más difícil: nada nuevo; el aviso de caminatas simultáneas cubre el caso ambiguo.
- A revisar: si hacen falta caminatas del jinete relativas a la silla (no al mundo), habrá que pasar a la opción C.

## Acciones

1. [x] `actor-motion.ts`: aplicar los cues del jinete y luego dejar que su montura lo lleve.
2. [x] `StoryStudio.tsx`: «Colocar con un clic», posición y orientación activos también para el jinete.
3. [x] `checks.ts`: avisar solo cuando la caminata del jinete coincide con un movimiento de su montura.
4. [x] Pruebas: `mount-p1.test.ts` actualizado.
5. [ ] Prueba manual de arrastre de articulaciones del jinete montado en el Taller.
