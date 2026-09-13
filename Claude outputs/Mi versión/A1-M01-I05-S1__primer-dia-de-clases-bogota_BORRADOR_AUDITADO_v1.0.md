# A1-M01-I05-S1 — «Primer día de clases en Bogotá»

> **Estado:** borrador narrativo corregido · pendiente de realineación con el StoryBlueprint S1.
>
> **Criterio editorial de esta versión:** no se fuerza la aparición de `salud`, un estornudo ni `buenas noches`. Si el StoryBlueprint actual sigue exigiendo esos targets como FIRST_INTRO/FOCUS, la discrepancia debe resolverse en el currículo o en otra capa, no deformando la escena principal.

---

## 1. Historia corregida

### CORE_STORY

> Hola. Yo soy Samuel.
>
> Soy de Argentina.
>
> Hoy voy a mi nueva escuela.
>
> —Buenos días, clase —dice el Sr. Taylor.
>
> —Hola, buenos días, profesor —dice la clase.
>
> El Sr. Taylor mira la lista y dice:
>
> —¿Quién es Samuel López?
>
> Nadie contesta.
>
> —Eh... Perdón, señor. Yo soy Samuel Gómez, no López. El apellido es Gómez.
>
> El Sr. Taylor mira la lista otra vez.
>
> La lista dice:
>
> **NOMBRE:** Samuel  
> **APELLIDO:** López
>
> —¿Hay un Samuel López? —dice el Sr. Taylor.
>
> —Samuel, ¿de dónde eres?
>
> —Soy de Buenos Aires, Argentina.
>
> —Bienvenido, Samuel —dice el Sr. Taylor.
>
> —Gracias, señor Taylor —dice Samuel.
>
> Samuel está contento. Es su primer día de clases.

---

## 2. Qué funciona narrativamente

La premisa es clara y suficientemente pequeña para A1:

**Samuel llega → el profesor lee un apellido equivocado → Samuel corrige su identidad → el profesor comprueba la lista → Samuel da su procedencia → el intercambio se resuelve.**

El conflicto se comprende sin necesidad de una trama secundaria. El error `López → Gómez` hace que `apellido`, `quién`, `yo`, `señor`, `perdón` y la identificación personal tengan una función pragmática real.

La selección de **Samuel** también reduce fricción para un estudiante anglófono porque la grafía es muy familiar. `Argentina`, `Buenos Aires` y `Bogotá` son nombres propios y pueden apoyarse visualmente sin exigir que sean objetivos léxicos.

---

## 3. Targets de S1 que ya están presentes

### 3.1 FOCUS presentes

| Target | Evidencia |
|---|---|
| `hola` | «Hola. Yo soy Samuel.» / «Hola, buenos días, profesor.» |
| `buenos días` | «Buenos días, clase.» |
| tratamiento `Sr./señor` | «Sr. Taylor» / «señor Taylor» |

### 3.2 SUPPORTED presentes

| Target | Evidencia |
|---|---|
| `apellido` | «El apellido es Gómez.» / `APELLIDO: López` |
| `eh` | «Eh...» |
| `el` | «El apellido...» / «El Sr. Taylor...» |
| `gracias` | «Gracias, señor Taylor.» |
| `perdón` | «Perdón, señor.» |
| `señor` | «señor Taylor» |
| `un` | «¿Hay un Samuel López?» |
| `yo` | «Yo soy Samuel.» / «Yo soy Samuel Gómez...» |
| `quién` | «¿Quién es Samuel López?» |
| `ser identificativo` | «Yo soy Samuel.» / «Yo soy Samuel Gómez.» |
| `ser de` | «Soy de Argentina.» / «Soy de Buenos Aires, Argentina.» |
| `de dónde` | «¿De dónde eres?» |
| nombres propios sin artículo | Samuel |
| apellidos sin artículo | López / Gómez |
| vocativo | «Samuel, ¿de dónde eres?» / «Bienvenido, Samuel.» |

---

## 4. Targets actuales de S1 que faltan

### 4.1 FOCUS faltantes

| Target | Estado |
|---|---|
| `chao` | faltante |
| `encantado` | faltante |
| `salud` | **omitido deliberadamente**; no se añadirá un estornudo solo para realizarlo |
| `buenas noches` | **omitido deliberadamente**; no corresponde pragmáticamente a una escena de mañana |
| `hola, ¿qué tal?` | faltante |

**Consecuencia:** con el StoryBlueprint actual, S1 no puede recibir `PASS` mientras estos FOCUS sigan asignados a esta Story y no aparezcan en ninguna capa learner-facing permitida.

### 4.2 SUPPORTED faltantes

| Target / unidad | Estado |
|---|---|
| `adiós` | faltante |
| `fecha de nacimiento` · SENSE | faltante |
| `fecha de nacimiento` · MWU | faltante |
| `lugar de nacimiento` | faltante |
| `nosotros` | faltante |
| `vos` | faltante |
| `buenas tardes` | faltante |
| `hasta mañana` | faltante |
| hipocorísticos / diminutivos de nombres propios | faltante |
| personas gramaticales | realización parcial: domina `yo`; faltan las demás formas previstas en la unidad |

`GRAM-A1-004` también queda **parcial**: aparecen `Sr.` y `señor`, pero no se intenta introducir artificialmente `Sra.` / `don` / `doña` dentro del CORE.

---

## 5. Léxico y construcciones que están de más para el S1 actual

Estos elementos hacen la escena más natural, pero **no pertenecen al inventario secuenciado de S1** tal como está diseñado actualmente.

| Superficie / construcción | Uso en la historia | Problema curricular |
|---|---|---|
| `hoy` | «Hoy voy...» | fuera del repertorio S1 |
| `ir` → `voy` | «voy a...» | verbo no disponible en S1 |
| `mi` | «mi nueva escuela» | posesivo posterior |
| `nuevo/nueva` | «nueva escuela» | fuera de S1 |
| `escuela` | «nueva escuela» | target posterior |
| `clase` | «Buenos días, clase» / «día de clases» | target posterior |
| `profesor` | «buenos días, profesor» | target posterior |
| `no` | «no López» | `no` se introduce formalmente después |
| `nombre` | etiqueta `NOMBRE:` | `nombre` se introduce en S3 |
| `haber` → `hay` | «¿Hay un Samuel López?» | verbo no disponible en S1 |
| `bienvenido` | «Bienvenido, Samuel» | fuera de S1 |
| `estar` → `está` | «Samuel está contento» | verbo no disponible en S1 |
| `contento` | «está contento» | fuera de S1 |
| `su` | «Es su primer día...» | posesivo posterior |
| `primer` / `día` | cierre y título | no son targets propios de S1 |

### Elementos puente ya aceptados en la arquitectura previa

`mirar`, `decir`, `contestar` y `lista` funcionan como lenguaje narrativo de apoyo. No son targets de S1, pero son mucho menos problemáticos porque ya formaban parte del aparato narrativo mínimo utilizado para sostener el conflicto.

---

## 6. Decisión editorial recomendada

No conviene obligar a esta historia a contener los 33 targets solo porque el Blueprint actual los asigna a S1.

Especialmente:

- `salud` exigiría inventar un estornudo;
- `buenas noches` sería pragmáticamente incoherente en una escena matinal;
- algunos targets de datos personales pueden pasar a soporte funcional o a historias posteriores;
- varios elementos que hacen natural esta nueva historia (`escuela`, `clase`, `profesor`, `no`, `nombre`) están actualmente secuenciados demasiado tarde para el tipo de escena que se quiere contar.

Por tanto hay dos opciones arquitectónicas:

1. **Mantener el StoryBlueprint actual:** habría que volver a diseñar la historia para cubrir todos los FOCUS y justificar cada adelanto.
2. **Mantener esta historia más natural:** habría que **revisar la asignación de targets de S1**, desplazando los que resultan forzados y adelantando formalmente algunos términos básicos necesarios para una primera escena escolar.

Para esta dirección narrativa, la segunda opción es más coherente.

---

## 7. Estado editorial

**`REVISE_BLUEPRINT_REQUIRED`**

La historia funciona como historia A1, pero **no cumple todavía el contrato de targets del S1 actual**.

La discrepancia principal no es de gramática ni puntuación: es de **secuenciación curricular**.
