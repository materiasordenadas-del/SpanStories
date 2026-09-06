# ETAPA G — DELE remap 13/13

**Versión:** 1.0  
**Estado:** `PASS`  
**Fecha:** 2026-09-06  
**Baseline:** v1.44 `SEQ16D-DELE-01..13` + ETAPA C + arquitectura B32.

## 1. Resultado ejecutivo

```text
DELE_TASK_CONTROLS          = 13
DELE_TASKS_PASS             = 13 / 13
READING_TASKS               = 4 / 4
LISTENING_TASKS             = 4 / 4
WRITING_TASKS               = 2 / 2
SPEAKING_TASKS              = 3 / 3
HISTORICAL_COMPAT_MAPPINGS  = 24
NEW_COMPAT_MAPPINGS         = 24
UNIQUE_B32_STORIES_USED      = 16
TASKS_WITH_ZERO_NEW_STORIES = 0
BLOCKERS                    = 0
```

La cobertura es de estructura de tarea y modalidad. No implica reutilización de contenido oficial DELE ni una nueva afirmación de nivel léxico/gramatical.

## 2. Regla de compatibilidad

Una Story solo pasa si cumple simultáneamente:

```text
1. modalidad adecuada
2. género/input/output compatible
3. demanda de tarea compatible
4. repertorio A1 autorizado
5. sin promoción A2 ni upgrade productivo regional
```

## 3. Matriz 13/13

| DELE | Modalidad | Estructura | Old compatible | New compatible | Justificación | Estado |
|---|---|---|---|---|---|---|
| `DELE-A1-R1` | READING | Correspondencia breve personal | `A1-M06-I04-S3`, `A1-M07-I04-S3` | `B32-S24`, `B32-S27` | Mensajes personales breves ligados a evento social y cambio/plan próximo. | **PASS** |
| `DELE-A1-R2` | READING | Textos funcionales mínimos | `A1-M03-I01-S4`, `A1-M04-I04-S3`, `A1-M03-I03-S4` | `B32-S12`, `B32-S18`, `B32-S13` | Horario/agenda, información funcional de transporte e instrucciones breves. | **PASS** |
| `DELE-A1-R3` | READING | Material informativo/promocional | `A1-M07-I02-S3`, `A1-M06-I02-S3`, `A1-M08-I03-S4` | `B32-S26`, `B32-S23`, `B32-S31` | Anuncio de alojamiento, cartel/programación de ocio y ficha informativa pública/cultural. | **PASS** |
| `DELE-A1-R4` | READING | Información pública concreta | `A1-M04-I04-S3`, `A1-M04-I03-S3` | `B32-S18`, `B32-S17` | Panel/horario/billete y señalización o información concreta de servicio. | **PASS** |
| `DELE-A1-L1` | LISTENING | Diálogos muy breves | `A1-M01-I01-S3`, `A1-M05-I02-S3` | `B32-S01`, `B32-S20` | Intercambio mínimo de saludo/cierre y diálogo muy breve de pedido. | **PASS** |
| `DELE-A1-L2` | LISTENING | Mensajes/avisos públicos | `A1-M04-I03-S3`, `A1-M04-I04-S3` | `B32-S17`, `B32-S18` | Aviso/información de servicio y anuncio de transporte con dato concreto. | **PASS** |
| `DELE-A1-L3` | LISTENING | Monólogo segmentado | `A1-M02-I02-S4`, `A1-M08-I03-S4` | `B32-S07`, `B32-S31` | Descripción segmentada de persona e información segmentada de referente/lugar. | **PASS** |
| `DELE-A1-L4` | LISTENING | Conversación cotidiana | `A1-M06-I03-S3`, `A1-M05-I02-S3` | `B32-S24`, `B32-S20` | Invitación/aceptación-rechazo y conversación cotidiana transaccional en restaurante. | **PASS** |
| `DELE-A1-W1` | WRITING | Formulario | `A1-M01-I03-S4` | `B32-S03` | Datos personales/de otra persona recuperados para completar ficha o formulario breve. | **PASS** |
| `DELE-A1-W2` | WRITING | Correspondencia breve | `A1-M06-I04-S3`, `A1-M07-I04-S3` | `B32-S24`, `B32-S27` | Mensaje social personal y mensaje breve sobre plan/cambio próximo. | **PASS** |
| `DELE-A1-O1` | SPEAKING | Presentación personal preparada | `A1-M01-I02-S3` | `B32-S02` | Ficha personal/grupal como soporte para preparar y producir una presentación personal muy breve. | **PASS** |
| `DELE-A1-O2` | SPEAKING | Tema personal próximo preparado | `A1-M06-I01-S3` | `B32-S22` | Gustos, intereses y preferencias como tema próximo preparado. | **PASS** |
| `DELE-A1-O3` | SPEAKING | Conversación guiada | `A1-M08-I04-S3` | `B32-S32` | Capstone multimodal con interacción guiada sobre funciones acumuladas A1. | **PASS** |

## 4. Contratos de Story para ETAPA H

| Story | Título | Modalidad(es) obligatorias | Tareas DELE |
|---|---|---|---|
| `B32-S01` | Primer día en la escuela | LISTENING | `DELE-A1-L1` |
| `B32-S02` | La ficha del grupo | SPEAKING | `DELE-A1-O1` |
| `B32-S03` | Conocer a un compañero | WRITING | `DELE-A1-W1` |
| `B32-S07` | ¿Quién es quién? | LISTENING | `DELE-A1-L3` |
| `B32-S12` | Hoy cambia el horario | READING | `DELE-A1-R2` |
| `B32-S13` | En clase | READING | `DELE-A1-R2` |
| `B32-S17` | Necesito información | LISTENING, READING | `DELE-A1-R4`, `DELE-A1-L2` |
| `B32-S18` | Llegar a tiempo | LISTENING, READING | `DELE-A1-R2`, `DELE-A1-R4`, `DELE-A1-L2` |
| `B32-S20` | En el restaurante | LISTENING | `DELE-A1-L1`, `DELE-A1-L4` |
| `B32-S22` | ¿Qué te gusta? | SPEAKING | `DELE-A1-O2` |
| `B32-S23` | Después de clase | READING | `DELE-A1-R3` |
| `B32-S24` | El cumpleaños del sábado | LISTENING, READING, WRITING | `DELE-A1-R1`, `DELE-A1-L4`, `DELE-A1-W2` |
| `B32-S26` | Buscar hotel | READING | `DELE-A1-R3` |
| `B32-S27` | Mañana cambia el plan | READING, WRITING | `DELE-A1-R1`, `DELE-A1-W2` |
| `B32-S31` | Otra ciudad, otra información | LISTENING, READING | `DELE-A1-R3`, `DELE-A1-L3` |
| `B32-S32` | Capstone: llegar, resolver y contar | SPEAKING | `DELE-A1-O3` |

## 5. Gate de release

ETAPA H debe fallar si deja de cumplirse:

```text
DELE_TASKS_PASS                   = 13 / 13
TASKS_WITH_ZERO_COMPATIBLE_STORY = 0
DELE_STORY_SUPPORT_CONTRACTS      = all materialized
```

Los 24 mappings históricos se usan como trazabilidad, no para reactivar Stories v1.44 ni reutilizar IDs.
