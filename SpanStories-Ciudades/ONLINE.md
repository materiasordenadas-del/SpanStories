# Preparación para Internet

El proyecto sigue local. No se ha publicado ni conectado a un proveedor de alojamiento. El modo local predeterminado sirve la distribución web con red simulada y un relay real para dos clientes.

## Prueba local equivalente al protocolo online

Ejecutar `npm run dev`: reconstruye `dist-online` y lo sirve en `http://127.0.0.1:8767/?dev`. Abrir esa dirección en dos ventanas/navegadores y elegir primera o tercera persona. Ambos entran en la sala `principal` de la zona elegida. Para una sala independiente, usar el mismo `&room=nombre` en los dos clientes; máximo dos por sala y zona. Un editor conectado conserva su plaza pero no muestra un personaje remoto activo.

Perfil predeterminado `online`: RTT de 80 ms con variación de ±20 ms por muestra, 10 Mbps de bajada y 2 Mbps de subida **compartidos entre todos los clientes, archivos y workers de este servidor**. El retraso afecta realmente a HTTP, snapshots y eventos; no añade trabajo al hilo de dibujo ni modifica gráficos. `GET /api/health` informa el perfil activo. La caché HTTP funciona como en web: comparar primera visita y revisitas por separado. La carga inicial a este límite tarda más que con localhost sin restricciones.

```powershell
# Distribución ya construida; valores y perfiles en PROFILES de serve.py.
python serve.py --root dist-online --port 8767 --profile online
# Conexión más lenta: 160 ms ±40, bajada 3 Mbps y subida 1 Mbps.
python serve.py --root dist-online --port 8767 --profile slow
# Control sin retrasos artificiales, con el mismo relay y recursos.
python serve.py --root dist-online --port 8767 --profile none
```

Usar una sola orden/servidor en el puerto 8767. `npm run dev:source` queda como modo explícito de edición de fuentes sin simulación; no acredita rendimiento de la distribución. Al actualizar fuentes, reiniciar mediante `npm run dev` para reconstruir el paquete.

Cada cliente tiene su propio render, input y controlador. `CityRoomClient` usa POST `/api/room/join`, `/state`, `/leave` y SSE `/api/room/events`. Envía solo posición, orientación, movimiento, actividad y secuencia; no envía geometría, cámara ni ediciones. Solicita hasta 10 actualizaciones/s, mantiene un único envío en vuelo y sustituye muestras pendientes. El tiempo de respuesta se descuenta del intervalo; si la red es más lenta reduce la frecuencia sin acumular peticiones. El servidor valida estados, descarta secuencias antiguas y caduca sesiones sin heartbeat a los 20 s. Las salas se separan por zona. La reconexión libera la sesión anterior.

`CityMultiplayer` interpola snapshots durante 150 ms, oculta estados sin renovar durante 3 s y conserva animadores/esqueletos independientes con geometrías, materiales y texturas compartidos. El personaje remoto usa el mismo Samuel y apariencia; queda fuera del editor y de la cámara local. La edición de ciudad es local y no se replica como estado de juego.

El dibujo se pausa cuando `document.hidden` es verdadero; los heartbeats continúan. Al regresar se reinicia la ventana del contador para no contar la pausa como un frame de juego. Una ventana visible adicional sigue consumiendo GPU: dos clientes en el mismo equipo no equivalen a dos equipos independientes.

Resolución: 1080p predeterminado (máximo 1920 × 1080). En pantallas elegibles de 2K/HiDPI, STANDARD y HIGH se ajustan automáticamente hasta 2560 × 1440; las pantallas 4K/8K mantienen ese techo de 2K. ECO conserva el techo de 1080p. La selección usa las dimensiones y densidad que informa el navegador; al cambiar tamaño o densidad de pantalla se recalcula. El lienzo mantiene la proporción, y la interfaz usa el tamaño de la ventana. La adaptación no reduce modelos, materiales, luces ni LOD. No garantiza 60 FPS en cualquier GPU.

Para un despliegue posterior, servir los mismos archivos y protocolo en HTTPS: un host únicamente estático no sincroniza jugadores. El relay incluido escucha solo en 127.0.0.1 y sirve como backend local de pruebas; un servicio público necesita autenticación, protección y proxy HTTPS propios. La simulación no acredita un despliegue real, pérdida de paquetes, servidor regional ni dos equipos con GPU separada.

Los modelos se cargan por sectores con dos descargas simultáneas, cancelación de solicitudes obsoletas y reintentos limitados. El primer sector se prioriza por proximidad y tamaño. Durante el recorrido se liberan sectores lejanos tras 10 segundos; la selección permanece disponible y las ediciones se restauran. Vista general solicita toda la ciudad.

Barcelona conserva su geometría y apariencia: 3.292 objetos editables. BatchedMesh agrupa piezas por sector/material y usa WEBGL_multi_draw cuando está disponible; el render individual permite conservar compatibilidad. Los GLB gzip se descomprimen sin pérdida en el navegador, con respaldo GLB para navegadores sin DecompressionStream. Los recursos tienen URLs con versión para permitir caché prolongada.

Para actualizar la carpeta de distribución después de modificar el proyecto:

```powershell
Set-Location -LiteralPath 'D:\Español\SpanStories-Ciudades'
npm run prepare:online
npm run build:online
python scripts/package_online.py
```

`dist-online` y `SpanStories-online.zip` contienen el visor, Barcelona, Madrid y Samuel; excluyen Blender, respaldos, informes y GLB intermedios. El ZIP es un artefacto local, no un despliegue. Los GLB originales se incluyen como respaldo; el tamaño del paquete no equivale a la descarga inicial.

Cuando se publique, servir `dist-online` desde HTTP(S), con tipos MIME JS/JSON/WASM/GLB correctos. Usar HTTPS en producción. Habilitar gzip para HTML, JavaScript, CSS y JSON; `.htaccess` ofrece esa configuración para Apache. En otros servidores, configurar compresión equivalente. Los archivos `.glb.gz` solicitados directamente funcionan sin negociación HTTP adicional. Si el servidor los descomprime mediante Content-Encoding, el visor evita una segunda descompresión.

Mantener HTML, módulos y manifiestos revalidables (`Cache-Control: no-cache`); permitir caché prolongada de modelos versionados. `serve.py` conserva gzip, ETag/304 para archivos web precomprimidos y caché immutable para URLs versionadas. Las respuestas API usan `no-store`; el proxy no debe almacenar ni retener eventos SSE. Para verificar otra instancia sin cambiar el servidor habitual: `python dist-online/serve.py --port 8769`.

Evidencia anterior de ejecución: reducción de llamadas de dibujo de 8.755 a 1.264 en la misma vista y calidad; Barcelona completa comprimida, 82.851.653 bytes frente a 229.366.900 originales; primer sector en 5,5 segundos con caché vacía y conexión simulada de 10 Mbps/80 ms. Es una medición local limitada, no una garantía para todo dispositivo o proveedor. La vista general completa mantiene toda la geometría y continúa siendo exigente.

Actualización 19/10/2026: preparación automática de todos los sectores e importaciones, trabajo GLB repartido, workers de transferencia/lectura, precarga GPU, cachés de render/colisiones y corrección del giro del ratón. El contador informa FPS entregados y picos. Ensayo anterior a 1920 × 795 con dos personajes animados: 59,37 FPS medios, p95 16,8 ms y pico 33,5 ms, sin frames mayores de 50 ms; ese ensayo no incluyó red. Ahora existe el relay y la simulación local descritos arriba. Informes: `reports/OPTIMIZACION_GENERAL.md` y `reports/SIMULACION_ONLINE_LOCAL.md`. No se ha publicado.
