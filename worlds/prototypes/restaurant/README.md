# SpanStories · Trattoria La Nonna

Restaurante italiano clásico en three.js (r180 local, sin CDN), con la misma
lógica visual que el aeropuerto (`../airport`): luz toon 2.5D
compartida (`engine/Luz25D.js`), contorno cartoon por casco invertido y
albedo neutro. 1 unidad = 1 metro.

## Arrancar

```
python serve.py            # http://127.0.0.1:7200/Restaurante/
```

También está la entrada `restaurante` en `Animación 3D/.claude/launch.json`.
Con `?dev` se expone `window.__rest` (`view(x, z, yaw, pitch)`, `simular(seg, ['KeyW'])`).
Con `?amb=noche` (o `manana`, `mediodia`, `tarde`) se elige el ambiente.

## Recorrido

| Zona | Qué hay |
| --- | --- |
| Calle | Fachada verde con rótulo dorado, toldos a rayas, planta alta con persianas y balcón, terraza, pizarra del menú, Vespa, adoquines y edificios de enfrente pintados (2D). |
| Recepción | Doble puerta de vidrio automática, felpudo, atril con libro de reservas (pulsable), banco bajo un espejo dorado real, perchero, vitrina de postres de vidrio, lámpara de araña. |
| Comedor | Piso de madera encerado (refleja), vigas, ventiladores que giran, 6 mesas de 4 y 7 de 2 con mantel de cuadros, fiasco con vela, banco corrido de cuero, barra con espejo real y botellero, cafetera espresso, vinoteca, pizarra de especialidades. |
| Cocina | **Solo las puertas** vaivén (cerradas, con ojos de buey de vidrio): no se entra. |
| Baños | Pasillo con puertas automáticas; damas y caballeros con lavabos, espejo real, cubículo, urinarios. |

## Estructura

- `engine/config.js` — planta, huecos, ventanas y puntos de vista.
- `engine/Luz25D.js` — luz toon (copiada del aeropuerto) + UV en metros (`mundo`) + reflejo de entorno (`reflejo`) + lámparas que alumbran hacia abajo.
- `engine/Reflejos.js` — vidrio con cubo de entorno y fresnel, espejos planos reales, suelo encerado, captura de los cubos (se repite al cambiar de ambiente).
- `engine/Kit.js` — paleta, geometrías, `crearLote` (instancias + contorno + sombras de contacto), texturas de madera/estuco/azulejo.
- `engine/Arquitectura.js`, `Exterior.js`, `Recepcion.js`, `Comedor.js`, `Banos.js`, `Decor.js`, `Puertas.js`, `Comida.js`.
- `engine/menu.js` — la carta: platos, secciones, frase de pedido en español.
- `ui.js` — carta interactiva, reserva, cuenta, vocabulario, API de historias.

## Para las historias

Todo lo que pulsa el estudiante emite un evento en `document`:

| Evento | Detalle |
| --- | --- |
| `restaurante:objeto` | `{ nombre, nueva }` — p. ej. «la copa de vino» (se guarda en el vocabulario). |
| `restaurante:recepcion` / `restaurante:reserva` | `{ conReserva, nombre, personas, hora, frase }` |
| `restaurante:sentarse` | `{ mesa }` |
| `restaurante:carta` | `{ mesa }` |
| `restaurante:pedido` | `{ mesa, pedido: [{ id, cantidad }], frase, total }` |
| `restaurante:servido` | `{ mesa, platos }` |
| `restaurante:cuenta` / `restaurante:pago` | `{ mesa, total }` / `{ modo, mesa }` |
| `restaurante:sala` | `{ sala }` |

API: `window.restaurante.abrirCarta(mesa?, seccion?)`, `sentarse(n)`, `levantarse()`,
`ir('calle'|'recepcion'|'comedor'|'barra'|'cocina'|'banos')`, `pedirCuenta()`,
`abrirReserva()`, `decir(texto)`, `toast(texto)`, `pedido`, `servidos(n)`, `mesas()`, `platos`.

## Reglas de estilo

Las del aeropuerto (`../airport/ESTILO.md`), con una excepción pedida por
el usuario: **vidrio, espejos y metales reflejan** (cubo de entorno + espejos
planos). Los objetos nuevos usan `kit.mat(color)` / `kit.metal()` / `kit.esmalte()`
dentro de un `lote`; nunca `MeshStandardMaterial` ni luces three.js para sombrear.
Este prototipo pertenece al repositorio SpanStories. Conserva los cambios existentes y
consulta `../../README.md` antes de modificar la organización compartida.
