# Practice Mode V1

Repaso de las palabras que el estudiante guarda mientras lee.

```text
Historia → Guardar palabra → PracticeItem (Sense/Lexeme) → /progreso → /progreso/practica → /progreso/practica/flashcards
```

Código: `features/practice/` (frontera pública `features/practice/index.ts`), adaptadores en
`lib/adapters/practice.ts` (cliente) y `lib/adapters/practice-library.ts` (servidor), pantallas en
`components/visual/screens/{PracticeHubScreen,FlashcardsScreen}.tsx`.

## Conceptos

| Concepto | Qué es |
| --- | --- |
| `PracticeTarget` | Identidad canónica de una palabra guardada: `SENSE` (SenseId) o `LEXEME` (LexemeId) |
| `PracticeItem` | La unidad guardada: un target, cuándo se guardó y desde qué aparición (`savedFrom`, solo procedencia) |
| `PracticeItemRepository` | `list` / `save` / `remove` / `has`; `save` es idempotente por target |
| `PracticeMode` | Registro de modos (`PRACTICE_MODES`); hoy solo `flashcards` |
| `Flashcard` | Tarjeta derivada de un item con contenido publicado; nunca se guarda |

`PracticeItem != Flashcard` · `practice != mastery` · `guardar != conocer`.

## Identidad

```text
Sense RESOLVED                  → SENSE:<SenseId>
Sense no resuelto + Lexeme      → LEXEME:<LexemeId>
sin Lexeme (SurfaceToken, construcción) → no se puede guardar
```

- La identidad sale de la `LexicalOccurrence` publicada que el lector ya trae en `eventContext`,
  nunca del texto: `surface != identity`, `lemma != identity`.
- Mismo SenseId en dos apariciones («soy», «es») → un item. Dos Senses de un Lexeme → dos items.
  La misma forma de dos Lexemes → dos items. Un Sense sin resolver nunca se infiere.
- Un `SurfaceToken` se puede consultar y escuchar en la ficha, pero el botón «Guardar palabra» no aparece.

## Persistencia

- Clave propia `spanstories.practice:v1` (`{ schemaVersion: 1, items }`), separada de
  `spanstories.reading-memory:v1`, que ahora solo guarda `lastStory` y `finished`.
- Adaptadores: `InMemoryPracticeItemRepository` y `LocalStoragePracticeItemRepository` (con `StorageLike`,
  sin `window`). Al leer se descartan formas desconocidas, ids que no cumplen el patrón publicado y duplicados.
- Las palabras guardadas antes de V1 (`lema:…`, `forma:…` dentro de reading-memory) **no se migran**: no tenían
  identidad canónica y convertir un lema en Lexeme sería inferirla. Se ignoran y desaparecen con la siguiente escritura.
- Si el navegador no permite escribir, la interfaz sigue en memoria durante la visita.

## Flashcards

Recuperación activa escrita: se muestra la traducción, el estudiante escribe la palabra en español y pulsa
Enter o «Comprobar»; «No lo sé» revela la respuesta. Después: respuesta con audio (`browser-speech.ts`),
estado sobrio (correcto / incorrecto / revelada), frase de la historia y «Siguiente».

Contenido de cada tarjeta, todo derivado de lo publicado (`collectPracticeOccurrences` sobre el modelo del lector):

| Campo | Fuente |
| --- | --- |
| prompt | traducción: referencia editorial de la aparición o `WordPanelViewModel.translation` |
| answer | `Lexeme.lemma` |
| details | categoría (misma precedencia que la ficha) y nivel CEFR del panel |
| context | frase de la aparición donde se guardó, con la palabra marcada por rango |
| image | reservado (`image?: { src, alt }`); nada lo publica todavía |

- Un item SENSE puede tomar la traducción de otra aparición del mismo Sense; un item LEXEME solo usa la
  aparición desde la que se guardó (otra aparición puede ser otro sentido).
- Sin traducción publicada, el item **sigue guardado pero no entra al mazo**. La interfaz distingue
  `savedCount` y `flashcardEligibleCount` (`summarizePractice`).
- Comparación: da igual mayúsculas, espacios y signos alrededor («¡Hola!»); tildes y ñ cuentan. Si solo fallan
  tildes o ñ, la respuesta es incorrecta con una indicación («revisa las tildes o la ñ»).
- La sesión (`engine/flashcard-session.ts`) es pura: `ANSWERING → FEEDBACK → … → FINISHED`. Sin SRS, mastery,
  puntos, rachas ni XP. El mazo se fija con la primera respuesta.

## Añadir un modo

1. Añadir el id a `PRACTICE_MODE_IDS` y su entrada en `PRACTICE_MODES` (`slug`, `countAvailable`).
2. Añadir su texto en `MODE_COPY` de `PracticeHubScreen.tsx` (el tipo lo exige).
3. Crear la ruta `app/progreso/practica/<slug>/page.tsx`.

## Límites actuales

- Hoy solo «hola» (Historia 1) tiene traducción publicada, así que el mazo tiene como máximo una tarjeta.
  El resto de palabras se puede guardar, pero no entra en las flashcards hasta que se publiquen traducciones.
- La traducción editorial está ligada a una aparición; la práctica la trata como traducción del Sense.
  Cuando existan traducciones por Sense, deberían sustituir a esta fuente.
- Sin imágenes por palabra: las ilustraciones de escena no representan la palabra. La búsqueda de imágenes es la
  siguiente fase.
- Las palabras guardadas viven en el navegador (sin cuenta ni sincronización entre dispositivos).

## Tests

`features/practice/__tests__/practice-items.test.ts` (identidad y repositorios) y
`features/practice/__tests__/flashcards.test.ts` (mazo, sesión e integración con la Historia 1).
