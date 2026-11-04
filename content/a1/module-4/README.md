# Historias del módulo 4

La lectura continua está en [HISTORIAS.md](HISTORIAS.md). Los archivos 01–04 contienen cada historia, preparación del significado, input paralelo, apoyo funcional, actividades y guion de escucha.

Se aplicó el skill instalado en `C:\Users\AdrielPereira\.codex\skills\spanstories-storytelling`. Las instrucciones del usuario prevalecen: extensión libre, reciclaje de repertorio previo y uso autorizado de «pero». No se modificaron los módulos anteriores, el currículo ni el funcionamiento de la aplicación.

## Diseño

| Historia / blueprint | Estructuras guía | Misión, complicación y cambio |
| --- | --- | --- |
| La casa del plano / A1-M04-I05-S1 | Está aquí; está allí; está lejos | Samuel necesita sacar a Nico de una casa representada en un plano mágico. Dibuja una puerta y cambia la ubicación de la biblioteca para reunirse con él. |
| El hombre del papel / A1-M04-I05-S2 | A la derecha; todo recto; a pie | Ana orienta a un hombre que va a la escuela. Descubre que aprende a leer para comprender lo que escribe su nieta y decide acompañarlo de nuevo. |
| La llave del sobre / A1-M04-I05-S3 | Oficina de información; está abierto; está cerrado | Rosa necesita identificar una dirección anónima. Una oficina cerrada obliga a preguntar en el quiosco; la llave termina siendo una invitación a compartir un hogar. |
| Un billete de ida y vuelta / A1-M04-I05-S4 | Billete de ida; ida y vuelta; en autobús | Samuel busca el autobús de su padre antes de su salida. Renuncia a trayectos rápidos porque su propósito es acompañarlo en su último día de trabajo. |

Las alternativas de las tareas ofrecen reconocimiento antes de recuperación; cada respuesta tiene un modelo completo. Las variantes regionales se presentan para reconocimiento, sin exigir producción. Los apoyos contienen parte del vocabulario nuevo para que las narraciones no sean inventarios.

## Verificación y límites

Se ejecutó el verificador del skill sobre los textos reales y por separado sobre el contenido dirigido al alumno. Los cuatro contratos coinciden con el registro local v1.51 y la referencia del skill: 39, 30, 24 y 29 primeras introducciones. El ledger recoge evidencia contextual para esas 122 introducciones; las formas flexionadas de «conducir», «estar abierto» y «estar cerrado» se revisaron aparte. Esto no equivale a validación de publicación.

**Estado: revisión editorial pendiente; no se declara PASS.** El contrato también pide 354 retornos programados. Los informes distinguen candidatos de coincidencia, evidencia gramatical y pendientes: no están todos realizados ni auditados semánticamente. Las candidatas de vocabulario futuro requieren cerrar su clasificación; «pero» está expresamente autorizado. No se presenta el margen diagnóstico de 0–1000 tokens como una prueba de calidad o comprensión.

Hay guiones de escucha, pero no audio grabado. Las historias están guardadas como contenido editorial; no se publicaron ni se conectaron al lector de la web. No se ejecutó el Publication Validator ni se crearon bindings técnicos.

Reproducción desde la raíz del proyecto: `python -X utf8 content/a1/module-4/auditoria/verificar.py`. Los JSON conservan la salida del verificador sin alterar sus avisos; los CSV documentan la evidencia y los pendientes. El script también reconstruye la recopilación de lectura a partir de las cuatro fuentes.
