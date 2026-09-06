# ETAPA B — Arquitectura A1 de 32 StoryBlueprints

**Estado:** `APPROVED_TOPOLOGY_WITH_MINOR_HARDENING`  
**Fecha:** 2026-09-06

## Topología aprobada

```text
MODULES = 8
ISLANDS = 11
STORY_BLUEPRINTS = 32
STORIES_PER_ISLAND = 2..4
```

Distribution:

```text
M01 = 1 island / 4 stories
M02 = 2 islands / 5 stories
M03 = 2 islands / 5 stories
M04 = 1 island / 4 stories
M05 = 1 island / 3 stories
M06 = 1 island / 3 stories
M07 = 1 island / 3 stories
M08 = 2 islands / 5 stories
TOTAL = 11 islands / 32 stories
```

## New islands

1. `B32-I01` — Primeros contactos — M01 — 4 Stories
2. `B32-I02` — Personas y perfiles — M02 — 3
3. `B32-I03` — Casa, estudio y trabajo — M02 — 2
4. `B32-I04` — Tiempo y rutina — M03 — 3
5. `B32-I05` — Aula y habilidades — M03 — 2
6. `B32-I06` — Moverse por la ciudad — M04 — 4
7. `B32-I07` — Comer, comprar y elegir — M05 — 3
8. `B32-I08` — Un fin de semana con amigos — M06 — 3
9. `B32-I09` — Preparar un viaje — M07 — 3
10. `B32-I10` — Opinar y responder — M08 — 2
11. `B32-I11` — Información e integración A1 — M08 — 3

## 32 provisional Stories

```text
B32-S01 Primer día en la escuela
B32-S02 La ficha del grupo
B32-S03 Conocer a un compañero
B32-S04 No entiendo
B32-S05 Una foto de familia
B32-S06 Así es Ana
B32-S07 ¿Quién es quién?
B32-S08 Mi apartamento
B32-S09 Dos personas, dos actividades
B32-S10 Una cita a las diez
B32-S11 Un día normal
B32-S12 Hoy cambia el horario
B32-S13 En clase
B32-S14 ¿Sabes hacerlo?
B32-S15 En el centro
B32-S16 Cómo llegar
B32-S17 Necesito información
B32-S18 Llegar a tiempo
B32-S19 ¿Qué comemos?
B32-S20 En el restaurante
B32-S21 La compra con problema
B32-S22 ¿Qué te gusta?
B32-S23 Después de clase
B32-S24 El cumpleaños del sábado
B32-S25 Viaje en tren
B32-S26 Buscar hotel
B32-S27 Mañana cambia el plan
B32-S28 ¿Qué opinas?
B32-S29 Sí, pero...
B32-S30 Una ficha del mundo hispano
B32-S31 Otra ciudad, otra información
B32-S32 Capstone: llegar, resolver y contar
```

`B32-Sxx` and `B32-Ixx` are provisional editorial keys, not published IDs.

## Hardening

- Planning labels such as `CONTEXT_BUILD`, `DEVELOPMENT`, `INTEGRATION`, `CHECKPOINT`, `CAPSTONE` are analytical only; they are not a canonical enum and must not be exported to release schema.
- M02 study/work = identity/profile (`¿A qué te dedicas?`, `Soy estudiante`, `Trabajo en...`).
- M03 study/work = activity/routine (schedules, routines, classroom, abilities, what I do and when).
- The 8/11/32 topology is reopened only for an objective prerequisite, sequencing, recycling or modality contradiction, not for aesthetic preference.
- Formal old-island 32→11 traceability is materialized in ETAPA C.

## Load note

Historical first-introduction pressure is 985 across 32 Stories, average 30.78. This is not a per-Story approved target budget. Load policy is resolved separately in ETAPA D/E.

## Gate

ETAPA B changes no canonical CSVs, target IDs, runtime registry or Fase 1/2 code. Fase 3 remains blocked.
