# Biblioteca facial de Rachel

Se abre dentro del Estudio (visor `http://localhost:3000` › Taller facial); lo sirve el Taller de Animación en `127.0.0.1:5189/facial/`.

El panel nuevo está debajo de las expresiones anteriores. Contiene 36 animaciones propias y 14.082 clips externos, con categorías, buscador y carga individual. Los externos son habla emocional sintética sin revisión visual individual; su procedencia y licencia se muestran en compatibilidad.

Selecciona una entrada → Previsualizar o Aplicar a pista. Abre «Editar expresión / clip» para duración, intensidad, regiones y curvas. Guarda variantes y exporta el proyecto JSON para conservarlo fuera de este navegador.

El modelo, Blender y los gestos anteriores se conservaron. Las dependencias de reproducción son locales.

Cada expresión tiene un gesto corporal sugerido por su emoción. «Movimiento» permite cambiarlo o desactivarlo; «Intensidad del movimiento» regula el cuerpo sin cambiar la intensidad facial. El retraso hace que el gesto empiece después del rostro. «Guardar variante» o «Actualizar clip» conserva estos ajustes. Se reutilizan familias de gestos de Rachel; los miles de clips no representan miles de movimientos corporales distintos. «Ver gesto completo» encuadra el cuerpo para revisarlo. Un clip corporal activo conserva el control de los brazos.

Informe, ejemplo portable y evidencias:
`D:\Español\output\rachel-biblioteca-facial-20261108\INFORME_BIBLIOTECA_FACIAL.md`

Pruebas: `node --test FacialCore.test.mjs`.
Auditoría completa de los clips descargados: `node validate_facial_catalog.mjs`.

No se afirma autorización comercial de los datos externos. No se han revisado visualmente todos los clips ni se ha probado otro personaje.
