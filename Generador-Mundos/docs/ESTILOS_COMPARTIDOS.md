# Pool de estilos del creador y visor

Fuente canónica: `src/estudio/render/pipeline.js`, `ghibli.js`, `dispatch.js`, `ghibli-assets/` y `style-pool.js` de Generador-Mundos. El visor activo consume estos archivos directamente mediante `/shared-styles/`; no depende de tener abierto el servidor Vite del creador.

Catálogo activo: Trigun, Zelda, Studio Ghibli, Dispatch, Color y Color + línea. Los modos numéricos existentes se conservan. Dibujo lineal y Línea + trama migran a Color + línea; Arcilla migra a Color cuando se resuelve un ID antiguo. Las definiciones antiguas del visor se conservan para compatibilidad, fuera del arranque vigente.

Los ajustes se guardan en `D:\Español\Generador-Mundos\.style-pool\settings.json`. Ambos servidores exponen `/api/style-pool` y escriben mediante `server/style-pool.js`: validación por campo, bloqueo entre procesos, fusión por estilo y escritura atómica. Se comparten estilo activo, ambiente y parámetros por estilo. Cambiar cámara, geometría, nombre o transformaciones no modifica el pool. Abrir un proyecto antiguo no reemplaza el pool por sus preferencias guardadas.

Las ventanas abiertas consultan cambios cada 1,5 segundos. Los cambios de código se ven al recargar el visor; Vite mantiene su recarga habitual. No se comparten automáticamente los cambios de código en páginas ya cargadas sin recarga.

El adaptador del visor conserva UV, texturas, skin/morph, instancias, categorías de superficie y ayudas de selección. La composición visual usa el código del creador; geometría, luz y vegetación propias de cada escena siguen siendo datos diferentes y no producen imágenes idénticas entre lugares distintos.

Alcance: integración local. Una publicación remota necesita servir este mismo endpoint con almacenamiento compartido; un hosting de archivos estáticos por sí solo no permite guardar ajustes globales. No se ha publicado ni configurado acceso remoto. Los builds del visor empaquetan una instantánea de la fuente canónica para que sus imports y nubes sean resolubles.
