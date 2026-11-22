# Integración local de editores — 10/11/2026

Trabajo en curso. Las pruebas técnicas y las revisiones visuales se registran por separado. No hay publicación ni sincronización remota.

Estado y alcance actualizados: [Plan revisado del 11/11](PLAN_INTEGRACION_REVISADO.md). Las cifras del catálogo de este documento son históricas. El usuario ha reservado las 50 actuaciones para Claude; no se modifican ni se vuelven a auditar en esta continuación.

## Fuentes inspeccionadas y diferencias

| ZIP local | Funciones comprobadas en su fuente | Situación en SpanStories / decisión |
|---|---|---|
| Ekza Studio | Layouts por tarea, foco, paneles acoplables; Dope Sheet, Graph Editor, selección de claves, encuadre de curvas, tangentes, IK y poses | El Taller ya tiene IK, poses, claves, capas y curvas. Se añaden foco y ancho de paneles al Estudio, y encuadre y selección de claves al gráfico facial. Tangentes y curvas de referencia quedan para otra etapa. No se instala otro editor ni auto-rig. |
| MyMotion Studio | Cámara con propiedades animadas, interpolación/easing, escenas, transiciones y exportación de vídeo | Dirección por tarjetas de escenas y momentos; reordenación, duplicación, duración, propiedades de cámara y entradas por fundido desde negro o barrido. Se adapta `src/lib/animation.ts` para suavizado y se conserva el reloj del director existente. Exportación de vídeo y otros tipos de transición pendientes. |
| Pascal Editor | Inspector contextual, herramientas arquitectónicas, snapping, distribución, medidas, plantas y aberturas | Referencia de organización de paneles y controles plegables. No se ha copiado su motor ni integrado todavía snapping/arquitectura. Requiere comparar con Atlas antes de tocar geometría existente. |
| StemStudio Engine | Behaviors por objeto con ciclo de vida, atributos, eventos, colisiones y runtime independiente | La interacción léxica y las puertas narrativas ya existen. Falta decidir qué interacciones adicionales necesita una Story concreta; no se integra su motor, backend, multiplayer ni física. No confundir estos behaviors con las 50 actuaciones. |
| Theatre | Curvas y propiedades evaluadas en tiempo, secuencias y editor visual | Se conserva el director determinista y el reloj de SpanStories. No se incorpora otro store ni reloj. Core declara Apache-2.0 y Studio AGPL-3.0-only en sus paquetes; no se ha incorporado código de Studio. |

Esta tabla distingue código adaptado, patrones de IU y capacidades todavía pendientes. Examinar cinco proyectos no significa integrar cinco aplicaciones completas.

## Primer circuito implementado

- Tres menús de autoría: Estudio, Taller de animación y Taller facial.
- Taller facial abre siempre el editor facial general (`?perfil=general`), el mismo para cualquier personaje Mixamo + FACEIT; Rachel es solo el maniquí de pruebas. Incluye las 50 actuaciones, intensidad, fuerza por shape key, vida, habla, controles manuales y físicas de personaje (11/11/2026). Ver `Vale 2/rachel_threejs/EDITOR_GENERAL.md`.
- La sesión procedente del Taller no lee ni sobrescribe el proyecto facial independiente del navegador.
- Al aplicar y volver se incluyen los campos aún editados en el inspector: nombre, intensidad, tiempos y curvas. Cambiar al menú corporal mantiene abierta la sesión facial para retomarla.
- Rachel está registrada como personaje reutilizable. Su GLB original se sirve desde el Taller sin copiarlo ni modificarlo.
- Aeropuerto: entrada D00 del prototipo original, servida en el motor 8877 mediante `airport-source`, una unión de directorio al prototipo vigente. No se arranca otro visor ni se duplica el aeropuerto. El resto del aeropuerto no se carga en esta vista inicial. Se utiliza el mismo renderer con la salida compatible del prototipo; no se mezcla su materialización con el compositor diferido de ciudades. Rachel conserva sus materiales originales en este escenario.
- El enlace `http://localhost:3000/escenarios?modo=estudio&zone=aeropuerto-entrada` abre un ensayo independiente con Rachel. No carga primero Barcelona ni reemplaza los proyectos guardados. El ensayo no está publicado.
- El selector de modelo permite trabajar con Rachel conservando el papel, posición y diálogos. Rechaza sustituir un modelo cuando tiene actuaciones incompatibles guardadas.
- Nuevas funciones de IU: enfocar escenario y ajustar ancho de biblioteca/inspector. Los controles avanzados permanecen plegados.

## Procedencia y licencias de código adaptado

`features/story-studio/motion-easing.ts` adapta las fórmulas de `my-motion-studio-main/src/lib/animation.ts`. Copyright (c) 2026 rodolphe37. Licencia MIT íntegra: `docs/third-party/my-motion-studio-main-MIT.txt`.

El editor facial incluye su aviso de Ekza en `THIRD_PARTY_NOTICES.md`. No se añadieron dependencias npm de ninguno de los ZIP.

## Verificación de esta etapa

- Taller: 14 pruebas del núcleo aprobadas; compilación final correcta (avisos de importación estática/dinámica ya existentes).
- Facial: 22 pruebas del núcleo/movimiento/adaptador aprobadas; una prueba adicional del encuadre de curvas aprobada.
- Estudio: 10 pruebas de cámara/director aprobadas, incluidas persistencia, búsqueda hacia atrás y compatibilidad de planos antiguos. TypeScript correcto.
- Motor: cuatro pruebas específicas de puente y actuación aprobadas.
- Navegador: aeropuerto con Rachel completa; ida al Taller, edición en la interfaz facial original, retorno, guardado, reapertura y reproducción en el Estudio. Búsqueda al segundo 2 de la actuación.
- Variante de prueba: `da395b69-15b3-4b47-b5b1-a85cc18935de.json`; segunda versión enviada al Estudio: `18749ff8-6385-49fe-b368-1952671c9e4d.json`, ambas en `taller-animacion/biblioteca/comportamientos`. Nombre «Rachel · sonrisa leve · integración», duración 5 s, intensidad 0,60, 67 pistas (14 de morphs). Se comprobaron también las curvas modificadas de ambas comisuras. Estado: sin revisión visual, no aprobado.
- Inventario real con 371 clips cargados: 50 objetivos, 23 con candidato corporal disponible, 27 sin animación corporal específica y 49 con candidato facial disponible. Ninguna actuación está aprobada visualmente. Informe por ID: `taller-animacion/reports/integracion-20261110/estado-50-actuaciones.json`.
- Capturas del Estudio y del taller facial en esa misma carpeta de informes.

## Pendientes reales

- El circuito técnico mínimo con Rachel está comprobado; falta aprobación artística. El Idle candidato inclina la cabeza: necesita autoría/revisión corporal y no se considera una actuación acabada.
- Las 50 fichas siguen siendo objetivos/candidatos: no son 50 animaciones aprobadas.
- Exportación autosuficiente, otros escenarios y adaptación entre personajes requieren verificación adicional.
- Falta feedback del usuario sobre la distribución nueva y sobre cada actuación facial/corporal. Las demás mejoras de Pascal, Stem y Theatre descritas en la matriz siguen pendientes; no se presentan como integradas.
