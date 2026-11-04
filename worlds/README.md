# Organización de escenarios, países y personajes de SpanStories

Guía para colaboradores y otras IA, incluyendo Claude. La raíz actual es
`D:\Español\SpanStories`. Este documento describe lo implementado y distingue lo pendiente.

## Regla principal

Los recursos compartidos se guardan una sola vez. Cada país contiene referencias y
configuración propia. Cambiar Colombia no debe modificar Argentina, España ni el recurso
compartido. No copiar un escenario o personaje completo dentro de cada país.

## Estructura

```text
worlds/
  README.md                      Esta guía
  migration.json                 Inventario y hashes originales del traslado
  repairs.json                   Cambios puntuales posteriores a la copia
  verification.json              Resultados reales de verificación
  prototypes/
    airport/ bank/ cafe/ shop/ pharmacy/ bus-stop/ restaurant/
  characters/
    assets/<huella>/model.glb     Un archivo por contenido y sus dependencias
    assets/<huella>/texture.png   Texturas externas compartidas
  source-archive/2026-09-28/      Originales preservados; fuera de Git y del servidor
content/worlds/
  library.json                   Bases, personajes, versiones y recursos
  countries/
    ar/country.json              Argentina: es-AR, ARS
    co/country.json              Colombia: es-CO, COP
    es/country.json              España: es-ES, EUR
features/worlds/
  model.ts                       Contratos de datos
  catalog.ts                     Validación, resolución, caché y claves de estado
  index.ts                       Exportaciones públicas
  __tests__/catalog.test.ts      Pruebas de aislamiento y referencias
scripts/worlds/
  import.py                      Importación inicial, sin borrar originales
  serve.py                       Vista local de los siete prototipos
  check.ts                       Catálogo, archivos y hashes
  archive-originals.ps1           Verificación y archivo seguro del origen
```

Los identificadores internos están en inglés para mantener rutas estables y sin acentos;
los nombres que ve el usuario están en español.

## Escenarios y países

Los siete prototipos son las bases actuales de servicios comunes. `airport` proviene de
`Aeropuerto_v2`; el aeropuerto v1 y los respaldos históricos quedan fuera del traslado.
Cada país tiene referencias a las mismas bases, fijadas a la versión `import-1`.

Cada futura ciudad tendrá **cinco atracciones turísticas únicas**, además de los siete
servicios comunes adaptados. Una atracción con arquitectura propia tendrá una base propia
de tipo `attraction`. No convertir todos los países en copias de una sola ciudad.

Las ciudades, atracciones y adaptaciones culturales están pendientes. `config: {}` no
significa que una adaptación ya esté implementada. Los prototipos conservan estética,
precios, voces y almacenamiento originales; no son aún variantes argentinas, colombianas
o españolas. No asignar el restaurante italiano automáticamente a España.

En esta etapa se preservan los motores y `vendor` de cada escenario. Hay diferencias
funcionales entre ellos. No unificarlos ni actualizar Three.js como parte de una edición
de país: esa refactorización requiere una solicitud y verificación propias.

## Personajes: identidad, versión y aparición

`library.json` contiene ocho agrupaciones provisionales: directora, Gómez, José, Kakashi,
Iam, meseros, Samuel y un niño sin identificar. Una agrupación por carpeta no prueba que
todas sus exportaciones correspondan a la misma identidad.

Los GLB distintos se conservan como versiones `candidate`; ninguno se declara aprobado
automáticamente. José tiene referencias artísticas y aún no tiene un GLB registrado.
El inventario incluye las versiones cargadas por el visor anterior de Samuel y Gómez,
pero eso no sustituye la aprobación de una versión para el juego.

Cada recurso tiene un identificador `sha256:<huella>`, una ruta, tamaño, hash, información
de rig, nombres de animaciones y sus procedencias. Los duplicados exactos apuntan al mismo
archivo. Si un GLB usa dependencias externas, la huella del paquete incluye también sus
contenidos: dos GLB idénticos con texturas diferentes no se confunden.

Los `.blend`, ZIP, referencias y respaldos artísticos siguen en sus carpetas originales,
identificadas en `artSources` y `migration.json`. No forman parte automática de la descarga
del juego. La textura pintada de Samuel está guardada aparte; aplicar sus enlaces a
materiales sigue siendo responsabilidad del adaptador del personaje.

Una aparición (`appearances`) contiene un identificador local, `characterId`,
`characterVersion`, `placeId`, papel, posición, voz y configuración. El personaje mantiene
su identidad aunque cambie de país. El modelo y el vestuario se referencian, no se copian.
Las apariciones actuales están vacías hasta elegir versiones y ubicaciones.

## API y uso seguro

Importar desde `features/worlds/index.ts`:

- `validateCatalog(library, countries)` devuelve errores de identificadores y referencias.
- `new WorldCatalog(library, countries)` valida y guarda una copia independiente.
- `country(id)`, `place(countryId, placeId)`, `appearance(countryId, appearanceId)` y
  `asset(assetId)` devuelven copias de configuración; editarlas no cambia el catálogo.
- `SharedCharacterResources(load, clone)` reúne cargas simultáneas del mismo recurso,
  reutiliza el modelo cargado y permite reintentar después de un fallo.
- `storageKey(countryId, placeId, appearanceId, version, purpose)` separa estado por
  país, lugar, aparición y versión, escapando separadores.

La caché es independiente del motor y requiere un adaptador de carga y clonación.
**Para GLB con rig, no usar solamente `scene.clone()`**: clonar también el esqueleto
con una utilidad compatible con la versión de Three.js. Cada aparición necesita su
propio `AnimationMixer`, transformaciones y estado. Compartir geometría y texturas;
clonar materiales cuando se vaya a modificar su aspecto. Gestionar el ciclo de vida y
la liberación de recursos en ese adaptador antes de conectar la caché al juego.

La caché y el catálogo están implementados y probados; todavía no están conectados al
renderizador de SpanStories. No anunciar personajes jugables o voces regionales garantizadas.
La voz disponible depende del proveedor o de las voces instaladas si se utiliza el navegador.

## Añadir o modificar contenido

1. Para cambiar un país, editar exclusivamente su `country.json` y añadir recursos locales
   si realmente son diferentes. Usar `config` para los parámetros de la instancia.
2. Para un personaje, revisar identidad, rig, texturas y animaciones. Reutilizar el hash
   existente si el contenido es idéntico; crear otra versión si cambió.
3. Para elegir una versión, marcarla `approved` tras revisarla. Las apariciones deben
   referenciar esa versión explícitamente. `defaultVersion` solo admite versiones aprobadas.
4. Un vestuario alternativo es otra versión compartida o recursos referenciados por el
   adaptador; no se guarda dentro de todas las carpetas de país.
5. Para modificar una base compartida, tratarlo como un cambio que puede afectar varios
   países. Publicar una versión nueva y validar sus consumidores antes de adoptarla.
   Registrar otra entrada de base con el mismo `id` y una `version` distinta, conservando
   la versión anterior mientras tenga consumidores. Cada país elige cuándo adoptarla.
6. No sobrescribir recursos con hash ni ajustar sus hashes para esconder cambios. Un
   contenido nuevo recibe un identificador nuevo. `import.py` rechaza una reimportación
   sobre un catálogo existente para proteger las configuraciones editadas.

Las carpetas `worlds/` están fuera de `public/`: no se publican automáticamente con Next.js.
El servidor local sirve únicamente prototipos y recursos compartidos. Al integrar el juego,
servir solo los recursos referenciados por la selección activa, mediante una ruta controlada
o un manifiesto de publicación. No descargar toda la biblioteca de candidatos.

## Ejecutar y comprobar

Desde `D:\Español\SpanStories`:

```powershell
npm run worlds:serve                       # http://127.0.0.1:7810/
npm run worlds:check                       # Referencias y recursos compartidos
npm run worlds:check -- --migration        # También integridad del traslado y reparaciones
npm run worlds:test                        # Aislamiento, caché y referencias
npm run typecheck
```

Requisitos: Python 3 y Node 24 para ejecutar directamente los scripts TypeScript usados
por este repositorio. No se añadieron dependencias npm.

El visor común es de **solo lectura** y no guarda cambios de edición en los archivos.
Para editar las posiciones del aeropuerto, ejecutar su servidor original trasladado:

```powershell
python worlds/prototypes/airport/serve.py --port 7100
```

Cada prototipo conserva su servidor y URL original (`/Aeropuerto/`, `/Banco/`, etc.).
La parada conserva `npm run dev` desde su propia carpeta. Las configuraciones locales de
Claude apuntan ahora al repositorio; `.claude/` continúa excluido de Git.

Las pruebas propias de aeropuerto, cafetería, comercio y parada se ejecutan con
`npm test` desde su carpeta. Banco, farmacia y restaurante no tenían suite propia:
verificar su carga y las interacciones afectadas en el navegador. No afirmar que todas
las acciones posibles se probaron por haber abierto la vista inicial.

## Preservación y límites

No tocar cuentas, historias, progreso, currículo ni pantallas actuales para organizar
estos recursos. Respetar los cambios no confirmados existentes en el repositorio.

`migration.json` conserva los hashes del origen. `repairs.json` registra las diferencias
intencionales del destino. Las comprobaciones comparan con ambos; no modificar el
inventario original para hacer pasar un cambio accidental.

Las capturas antes/después se guardan localmente en `.cache/worlds-verification/`;
`verification.json` registra qué se comprobó y las limitaciones. Los originales de los
siete escenarios se retiran solo después de verificar copia y funcionamiento. Las
carpetas originales de personajes y los respaldos históricos se conservan.

La revisión automática bloqueó el borrado de los escenarios originales. Se preservan
en `worlds/source-archive/2026-09-28/` dentro del repositorio local, separados de las
carpetas activas y excluidos de Git, del lint y del servidor. No trabajar en ese archivo:
la única ubicación activa es `worlds/prototypes/`. Este archivo ocupa espacio local
adicional y no se descarga por país ni se publica con la aplicación.

Git preserva los bytes exactos de prototipos y recursos mediante `.gitattributes`;
mantener esa regla para que los hashes sigan siendo válidos después de un checkout
en Windows o Linux.
