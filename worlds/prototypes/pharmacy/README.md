# Farmacia del Barrio (SpanStories)

Escenario 3D en three.js, sin bundler: una farmacia de barrio con la entrada, el piso de
venta, las góndolas, los anaqueles, el refrigerador de bebidas, las botanas y el mostrador.
Usa el mismo estilo 2.5D que el aeropuerto y el restaurante.

```
python serve.py            # http://127.0.0.1:7300/Farmacia/
```

También se abre con la entrada `farmacia` de `.claude/launch.json`.

- Para moverse: **WASD** o las flechas para caminar, **Shift** para ir más rápido y arrastrar para mirar. Pulsar un objeto muestra su nombre. En pantallas táctiles se camina con los botones ▲▼.
- Parámetros de la URL: `?vista=calle|entrada|vestibulo|botanas|refri|pasillo|mostrador|dependiente`, `?amb=manana|mediodia|tarde|noche` y `?dev`, que expone `window.__farmacia` con `view`, `ir`, `fijar`, `soltar`, `ambiente` e `info`.
- Medidas, referencias y el registro de auditoría están en [PLAN.md](PLAN.md).

| Archivo | Qué hace |
| --- | --- |
| `app.js` | Renderer, jugador con colisiones, vistas y panel de luz. |
| `engine/config.js` | Plano en metros: local, puerta, aparador, mostrador, góndolas, anaqueles y vistas. |
| `engine/Casco.js` | Muros, piso encerado, plafón con paneles de luz, fachada, calle y vecinos. |
| `engine/Mobiliario.js` | Muebles y surtido determinista. |
| `engine/Productos.js` | Atlas de empaques genéricos e instancias con su trazo. |
| `engine/Rotulos.js` | Letreros, viniles y carteles dibujados en canvas. |
| `engine/Luz25D.js`, `Kit.js`, `Reflejos.js` | Copia fija del motor del restaurante, con el atlas y el trazo por instancia. |
