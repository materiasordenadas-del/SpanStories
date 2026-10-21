# Construcción SpanStories corregible

Lee primero ESTILO.md y PLAN.md de esta raíz y respétalos.
Prioriza estructura corregible y conserva la calidad visual; evita pulido no solicitado.

- Toda medida de posición o tamaño va a constantes con nombre en routes.js.
  Sin números sueltos en builders; solo detalles internos de piezas pueden usar literales.
  El origen cero, índices y factores matemáticos no son medidas sueltas.
- Deriva las constantes dependientes de sus medidas base; reconstruir la escena
  con otra medida base debe actualizar lo dependiente sin retocar builders.
- Coloca con engine/layout.js: align, after, place, ground y mirrorX.
  Añade una función y su test si falta una relación. Nunca calibres coordenadas a ojo.
- Repetidos: una fábrica y bucle, o InstancedMesh con selección e identidad por instancia.
- Una función por zona devuelve un THREE.Group con nombre; cada mesh importante
  tiene .name descriptivo. Cada objeto conserva raíz semántica e identidad independiente;
  instancias/batches requieren un adaptador probado de selección y edición por ID.
- X horizontal, Y arriba, Z profundidad (+Z hacia la calle); 1 u = 1 m; pivot abajo.
  Espeja el lado simétrico, sin construirlo a mano; no dupliques IDs.
- No toques engine/Luz25D.js, GlossyFloor.js, cámara ni panel.
  Conserva número, orden, etiquetas y claves de los movable existentes.
- Por cada relación importante añade en tests/ una aserción con near() que compare
  bounding boxes de los objetos del builder real: alineación, apoyo, separación y simetría.
  Incluye prueba con medidas base diferentes y ejecuta npm test al terminar.
- Prohibido «cambiar número → mirar captura → volver a cambiar».
  Corrige la regla o constante; usa la captura solo para verificar el resultado visual.
- No pulas materiales, texturas ni decoración fina fuera del alcance. Optimizar recursos
  autorizados conserva el aspecto y no permite rediseñar luz, cámara ni panel.
- Para ciudades, repeticiones masivas, GLB pesados o rendimiento, lee solo las secciones
  pertinentes de RENDIMIENTO.md. Escenas pequeñas no requieren chunks/LOD por rutina.
  Prioriza texturas/VRAM, draw calls y streaming; después LOD y demás costes medidos.
  La plantilla no trae streamer, adaptador de instancias ni decodificadores configurados.
  Conserva identidad/persistencia al cambiar representación y no dispongas recursos compartidos en uso.
- Inspecciona solo archivos afectados, usa búsquedas acotadas y evita volcar catálogos/logs.
  No delegues salvo solicitud expresa; actúa dentro del alcance ya autorizado.
- Entrega: constantes, funciones de zona, relaciones cubiertas por tests,
  resultado de npm test y pendientes o simplificaciones reales.

Aplica estas reglas a lo solicitado; conserva las partes que ya funcionan.
