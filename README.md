# SpanStories ligero para Google AI Studio

Editor, Estudio y talleres corporal/facial con la misma interfaz. Sin Generador de mundos. Único escenario: Colina de Don Quijote procedural. Únicos GLB: Don Quijote y Rocinante. Sin bibliotecas de animaciones ni clips faciales importados, otras ciudades, Blender, historias personales, cachés, credenciales o historial anterior.

## Abrir

Importa la rama `main` en Google AI Studio (Build → Add files → Import from GitHub). Ejecuta `npm ci` y `npm run dev`. El postinstall instala el taller. Node >=20.9. No necesita Python ni claves de Gemini para abrir el Estudio.

La vista previa en `/` abre primero el Estudio en `/escenarios?modo=estudio`, con su inicio de historias. El escenario se carga al abrir una historia. Entrada única en `0.0.0.0:3000` (o `PORT`). Motor y talleres usan rutas del mismo origen, aptas para HTTPS. Next y Vite se ejecutan internamente. El Generador no se instala ni se arranca; solo se conserva el código de render compartido necesario para el motor, en `shared-styles`.

Desde el Estudio se eligen ambos personajes y se abren los talleres. Modelos guardados una sola vez en `SpanStories-Ciudades/assets/avatar`. Bibliotecas importadas vacías; herramientas y animaciones por código incluidas. Herramientas opcionales que requieren Blender u otros programas externos no vienen instaladas.

Los catálogos reducidos y el arranque para nube solo pertenecen a esta rama. La instalación local original permanece intacta. Las historias y ediciones nuevas se guardan en el disco del entorno: su permanencia depende de Google AI Studio.
