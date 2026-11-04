# World Lexicon

Interacción léxica en mundos 3D: el estudiante toca un objeto de la escena, escucha su palabra en español, la escribe y, si acierta, la palabra se guarda.

## Reparto de responsabilidades

| Lado | Hace | Nunca hace |
| --- | --- | --- |
| Visor (`SpanStories-Ciudades/engine/Lexico*.js`) | Detecta el toque, resalta, reproduce audio, muestra la barra, envía el **texto escrito** | Conocer la ortografía esperada, validar, calcular progreso o mastery |
| Anfitrión (esta feature) | Valida contra el registro A1 publicado, registra evidencia, guarda la palabra | Declarar «Conocida» o fijar un porcentaje de mastery |

`answering != knowing`: un acierto es evidencia de producción escrita (`PRACTICE`, evidencia `FORM_RECALL`, `targetProductive`). Nunca emite `STATE_DECLARED`.

## Cómo se conecta un objeto 3D con un SenseId

`vocabulario.json` de la zona (mapa editorial) → entrada `{ id, senseId, lexemeId, selectors, highlight, speech, audio? }`.

Selectores admitidos (nunca por nombre de malla): `registryKind` (p. ej. `tree`), `collection` (colección de origen del modelo; las mallas hijas heredan la de sus ancestros) y `objectIds`.
`validateWorldLexiconMap` rechaza SenseIds desconocidos o no A1, léxemas que no corresponden, `speech.text` distinto de la forma canónica publicada, claves desconocidas y selectores por nombre.

## Política de validación (`domain/attempt.ts`)

- Se ignoran mayúsculas, espacios en los extremos y espacios internos repetidos.
- Se admite el sustantivo sin artículo. Con artículo solo si el género está anotado en `editorial/noun-annotations.ts` (el registro publicado no trae género de sustantivos) y el artículo es el correcto: `el/un` o `la/una`.
- Tildes: una tilde **ausente** se acepta con corrección (`CORRECT_ACCENT_MISSING`) y cuenta como evidencia asistida; una tilde de más o cambiada es error; `REQUIRED` no perdona nada. `ñ` y `ü` nunca se perdonan.
- Evidencia asistida (segundo intento tras un fallo, o tilde ausente) no avanza el estado calculado.

## Transporte

El visor es una app estática en otro origen, así que usa `postMessage` (`bridge/protocol.ts`): solo se atienden mensajes del origen exacto, de la ventana del iframe y con el esquema estricto; se responde siempre a un origen concreto. Si el visor comparte la página React, el mismo `submitAttempt` se pasa como callback.

## Pendiente

- Añadir el origen de producción a `LEXICO.hostOrigins` (`SpanStories-Ciudades/routes.js`).
- Revisión editorial del género de los sustantivos del piloto y del mapa casa/iglesia/calle.
- Los cinco audios locales están generados con Microsoft Helena Desktop (es-ES); la voz española del navegador queda como respaldo.
- El modo local por defecto permite caminar en primera persona y habilita las cinco entradas (árbol, casa, iglesia, calle y puerta). No hay historia obligatoria ni botón Continuar.
- El control narrativo queda disponible de forma opcional con `?historia=1`, usando un fixture técnico DRAFT, sin blueprint curricular. No representa una historia publicada.

## Prueba local integrada

En `SpanStories-Ciudades`, ejecutar `npm run dev:lexico` (127.0.0.1:8877). En la raíz, `npm run dev`.
Abrir `http://localhost:3000/mundo/piloto-lexico`; `?modo=desarrollo` conserva editor, importación, guardado, estilo y diagnóstico.
Los aciertos aparecen en `http://localhost:3000/progreso/practica`. Las palabras sin traducción/contexto publicado se guardan y muestran su forma canónica, sin inventar ejercicios curriculares.

`npm run build:web` en `SpanStories-Ciudades` genera `dist-web` local sin CityEditor, CityNavigation, NarrativaEditor ni PanelEstilo; no publica nada. La exploración libre solo se habilita en la aplicación de desarrollo.
El resaltado educativo es una silueta de pantalla de la geometría con alfa; la caja del editor permanece intacta.
Se distinguen exposiciones OBJECT/AUDIO de intentos PRACTICE y de SAVED. Ninguna de estas acciones declara KNOWN.
