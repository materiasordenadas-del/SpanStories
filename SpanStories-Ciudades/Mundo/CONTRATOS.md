# Mundo: países, ciudades y zonas

`mundo.json` registra países; cada `pais.json` registra ciudades y cada `ciudad.json` registra zonas. `zona.json` identifica escenario, fuente/hash, sectores GLB y objetos. Las URLs se resuelven contra el manifiesto que las contiene. Identidades estables: `es`, `barcelona`, `barcelona-passeig-gracia`; ningún ID depende de posición en una lista.

Registrar otra zona consiste en exportar su GLB/metadatos y añadir la referencia a `ciudad.json`. Otro país o ciudad añade sus manifiestos al padre. El visor usa el mismo cargador, editor, iluminación y navegación. Una zona puede contener varios sectores; asignar un sector en el editor cambia organización/persistencia sin hornear posiciones o duplicar el modelo.

`Personajes/personajes.json` registra recursos reutilizables por `characterId`. `Historias/integracion.json` contiene referencias al Story Engine y al registro curricular existentes en `D:/Español/SpanStories`. No contiene un motor narrativo nuevo ni copia los blueprints. El campo `bindings` queda vacío hasta vincular historias reales. `StoryId`, `StoryVersionId` y `StoryBlueprintId` mantienen los tipos y prefijos del motor existente; Story y Blueprint no son la misma identidad.

Un vínculo añade `storyId`, `storyVersionId`, `storyBlueprintId`, `scenarios` (countryId/cityId/zoneId/objectIds) y `characterIds`. Solo transporta referencias. `validarVinculoHistoria()` comprueba identidades de escenario/personaje y separación de identidades narrativas; la publicación y validación curricular continúan siendo responsabilidad del Story Engine. La conexión de ejecución narrativa queda preparada por contrato, fuera del alcance actual.

Los GLB de Blender son derivados. El archivo original permanece en su carpeta y no se abre en la sesión de Blender de Claude. La exportación usa un proceso separado en segundo plano. Los nombres y matrices originales se verifican offline; los nodos Three conservan la jerarquía aunque se representen como instancias GPU. Los cambios del editor viven por ID en IndexedDB y se pueden exportar junto a los GLB importados; no escriben sobre Blender.
