# Taller de objetos SpanStories

Abre **Iniciar.cmd**. La app se inicia en http://127.0.0.1:8766 y funciona sin Internet.

1. Arrastra un GLB o utiliza el sofá de ejemplo.
2. Elige cuánta geometría conservar (28 % por defecto), unidades y paleta.
3. Pulsa Transformar objeto, revisa ambas vistas y descarga el GLB.

En «Extraer del original» conserva el albedo, los factores de color, las texturas y las UV. Reduce las texturas de albedo a un máximo de 512 píxeles, mantiene materiales mate y elimina mapas de relieve, oclusión y reflejos. La paleta cálida convierte materiales opacos a colores planos. Simplifica mallas, conserva asignaciones por pieza, centra el objeto y coloca su origen en la base. No agrega luces, cámaras, contornos ni shader toon: los aporta el mundo SpanStories. La iluminación del visor es solo de presentación y no se exporta. Si el albedo original ya incluye sombras pintadas, se conservan como parte de la imagen.

Para elegir la carpeta predeterminada, pulsa «Elegir carpeta…» o escribe una ruta completa existente y pulsa «Usar carpeta». La preferencia se conserva tras reiniciar. «Guardar GLB» abre «Guardar como» desde esa carpeta: puedes elegir otro destino y nombre sin cambiar la carpeta predeterminada. Cancelar no crea ningún archivo. La copia se valida antes de publicar el .glb; si el nombre ya existe se añade un número, sin sobrescribir archivos.

La opción de suelo elimina únicamente una pieza con nombre reconocido de suelo, plana, horizontal y en la base; no elimina geometría desconocida. Desactívala si el piso pertenece al artículo.

La escala automática supone centímetros cuando el tamaño máximo supera 20 unidades. Para edificios, miniaturas o unidades distintas elige metros, centímetros o milímetros explícitamente. Por defecto conserva los ejes mundiales del archivo. Los giros manuales resuelven exportaciones mal orientadas.

La simplificación no constituye retopología manual y puede reducir detalles pequeños; aumenta el porcentaje si es necesario. Los materiales y geometría mantienen sus piezas bajo articulo-001. Al insertar varias copias en una escena asigna un ID diferente a cada instancia.

Admite GLB 2 autocontenidos de objetos estáticos hasta 200 MB. En piezas recortadas conserva los distintos colores y alpha, reduciendo las texturas a un máximo de 512 píxeles; mantiene sus UV y el umbral de recorte original. Sus materiales pasan a mate. Protege componentes planos y láminas con muchos bordes libres (al menos 20 % de sus aristas), como hojas recortadas. Las piezas con volumen, incluidos tubos con extremos abiertos, sí utilizan el porcentaje de geometría elegido. Por eso el porcentaje total puede ser mayor que el seleccionado. Rechaza rigs, animaciones y morph targets para no dañarlos. No admite recursos externos. Los decodificadores instalados de Blender determinan el soporte para compresión de entrada; el visor puede no mostrar el original comprimido, pero la app permite intentar su conversión.

Requiere Python y Blender instalados. Aquí utiliza D:\Blender 5.2\blender.exe. En otro equipo establece la variable SPANSTORIES_BLENDER con la ruta de Blender. No requiere pip ni npm.

Los originales cargados y resultados se guardan en subcarpetas únicas de resultados; nunca se sobrescribe el archivo de origen. Cada conversión incluye GLB, informe JSON y registro. La app escucha solo en 127.0.0.1 y procesa una conversión a la vez.

Para arrancar con consola: python server.py. Para detener esa ejecución: Ctrl+C. La app iniciada mediante el lanzador permanece abierta para reutilizarla.

Los archivos de vendor proceden de la plantilla local SpanStories y conservan su licencia Three.js/MIT.
