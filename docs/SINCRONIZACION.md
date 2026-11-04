# SpanStories: misma versión local y en GitHub

Rama de trabajo: `feat/visor-mundo-20261021`. Trabajar esta noche en esta misma rama. No es necesario crear otra rama para continuar este trabajo.

## Componentes

- `Generador-Mundos/`: generador y Atlas Estudio.
- `SpanStories-Ciudades/`: motor del visor.
- `features/story-studio/`, `components/world-lexicon/`, `app/mundo/piloto-lexico/`: estudio integrado en el visor.

La raíz local vigente es `D:\Español\SpanStories-worktrees\visor-mundo-20261021`. En esta computadora, `Generador-Mundos/` es un enlace de directorio a `D:\Español\Generador-Mundos`: son los mismos archivos, no otra copia. Git sigue y versiona su contenido. En otro equipo, clonar esta rama crea una carpeta ordinaria con esos mismos archivos; no requiere el enlace de Windows.

## Continuar desde GitHub y regresar

1. Trabajar en `feat/visor-mundo-20261021` y guardar los cambios mediante commits y push.
2. En esta computadora, desde la raíz vigente, ejecutar `npm run sync:proyecto`.
3. La sincronización verifica la rama y los cambios locales, descarga la misma rama y aplica solo un avance directo. Si detecta modificaciones locales, historias divergentes o un archivo local no versionado que sería reemplazado, se detiene y conserva el trabajo para integrarlo.
4. Si cambió un archivo `package-lock.json`, ejecutar `npm ci` en su carpeta antes de arrancar.

No descargar ni extraer un ZIP encima del proyecto. No usar `reset --hard`, `clean` ni push forzado para sincronizar.

Arranque: `npm run dev:visor`. Entrada: `http://localhost:3000/mundo/piloto-lexico`; desarrollo con `?modo=desarrollo`, estudio con `?modo=historia`. Atlas se arranca desde `Generador-Mundos/` con `npm run dev`.

## Alcance de la subida

No se añaden respaldos, herramientas/add-ons ni fuentes de Blender, ni modelos de personajes nuevos. Se mantienen los personajes que ya estaban versionados y los recursos web que necesitan los escenarios. La biblioteca de animaciones de Samuel corresponde al personaje existente. Los módulos web de escaparates y sus GLB de ejecución se conservan porque los utiliza el generador.

Los modelos locales de prueba Lamine/Chica del generador se conservan en esta computadora, fuera de la subida; su previsualización opcional requiere esos recursos locales. No forman parte de la entrega remota.

Git sincroniza archivos versionados. Los borradores y audios guardados únicamente en el navegador, las exportaciones, los secretos y los archivos Blender locales no se transfieren mediante Git. No borrar sus carpetas ni los datos del navegador al actualizar.

No existe garantía absoluta contra incompatibilidades de futuros cambios. El comando de sincronización evita sobrescrituras automáticas y detiene la actualización cuando requiere integración.
