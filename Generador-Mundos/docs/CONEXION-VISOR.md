# Lugares del generador en el visor

Conexión local con `D:\Español\SpanStories-worktrees\visor-mundo-20261021`. Entrada única: http://localhost:3000/mundo/piloto-lexico.

## Uso

1. Iniciar el visor con `npm run dev:visor` desde su raíz y el generador con `npm run dev` desde `D:\Español\Generador-Mundos`.
2. Construir o abrir un proyecto en http://127.0.0.1:5179 y pulsar **Enviar al visor**. Esperar el mensaje de éxito y pulsar **Abrir visor**.
3. Usar **Lugares del generador** en el visor para cambiar de lugar. **Versión del lugar** permite consultar las versiones anteriores; no cambia cuál es la actual.
4. **Editar lugar** abre la fuente guardada en el generador. En Desarrollo, Opciones → Escena también permite seleccionar un ID y abrir su edición.
5. **Actualizar en el visor** crea otra versión del mismo lugar. Recargar el visor para verla. Las versiones anteriores siguen disponibles. Abrir una versión anterior en el generador y enviarla crea una nueva versión, sin borrar las siguientes.

La biblioteca y sus GLB se guardan en `SpanStories-Ciudades\Mundo\Generados` dentro del visor vigente. Después del envío, explorar el lugar no requiere tener abierto el generador. No hay publicación en Internet.

## Edición por el asistente

Ejecutar desde `D:\Español\Generador-Mundos`:

```powershell
node scripts/lugares.mjs listar
node scripts/lugares.mjs entidades ID_DEL_LUGAR Aulario
node scripts/lugares.mjs versiones ID_DEL_LUGAR
```

`entidades` devuelve el hash vigente y hasta 50 coincidencias por capa. Preparar un archivo de cambios:

```json
{
  "expectedHash": "HASH_DEVUELTO_POR_ENTIDADES",
  "changes": [
    {"layer":"overrides","id":"gen:edificio:1","patch":{"height":14}}
  ]
}
```

```powershell
node scripts/lugares.mjs editar ID_DEL_LUGAR cambios.json
```

El comando valida la edición y crea un borrador independiente. Abrir la `editorUrl` devuelta, revisar el resultado y pulsar **Actualizar en el visor**. Si la página ya estaba abierta, recargarla para leer el borrador. Los cambios no se publican con solo escribir el JSON.

Capas admitidas: `overrides` (altura, plantas, apoyo, color, material y cubierta), `profiles` (fachada, modelo propio y su ajuste), `interiors` (interior de planta baja) y `roadEdits` (ancho y estructura de calles). Se aplican los validadores existentes del generador. Las propiedades de `profiles.facade` se combinan sin borrar sus parámetros hermanos. Los árboles y otros elementos generados conservan ID para selección; su edición sigue dependiendo de los controles de generación, no de estas cuatro capas por edificio/calle.

`leer ID [REVISION]` obtiene el proyecto completo; puede ser grande. `enviar paquete.json` registra una exportación ya creada. El JSON de envío contiene `carpeta` y, para una actualización, `id` y `expectedRevision`. No admite rutas arbitrarias.

## Conservación

- Archivos del paquete verificados por tamaño y SHA-256 antes de cambiar el catálogo.
- Historial inmutable por lugar, fuente editable junto a cada versión y borradores separados.
- Escritura exclusiva y sustitución atómica del catálogo; conflictos de revisión/hash se rechazan.
- Barcelona conserva sus archivos y editor. Los lugares Atlas usan un adaptador separado para sectores, Meshopt, selección por ID, relieve y materiales.
- El acabado y la luz corresponden al visor. Efectos exclusivos del generador, como el paralaje de escaparates, no están horneados en el GLB. Las colisiones usan cajas de edificios; no equivalen a un sistema de colisión interior detallado.
- Esta conexión no asigna automáticamente palabras, audios ni historias a los lugares nuevos.

La prueba inicial deja `Escuela generada` con dos versiones y el cambio aislado de altura del aulario a 14 m. Evidencia y comprobaciones: `D:\Español\SpanStories-worktrees\visor-mundo-20261021\docs\CONEXION-GENERADOR-VERIFICACION.md`.
