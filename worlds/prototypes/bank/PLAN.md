# Banco Horizonte — plan de diseño

Sucursal bancaria **típica** (modelo latinoamericano / español) para SpanStories.
Se diseña **para lo que ve y hace el estudiante**: entrar, sacar turno, hacer la
fila, llegar a la ventanilla.  Nada de bóvedas ni trastienda: lo que no se ve no
se modela.  Mismo motor y estilo que el aeropuerto y el restaurante
(`engine/Luz25D.js`, `Kit.js`, `Reflejos.js`; ESTILO.md §3 del aeropuerto).

## Referencias consultadas

- Zonas de una sucursal: exterior → bienvenida → transacción → consulta → trastienda
  ([Every Bit Matters, *Bank layout*](https://www.everybitmatters.com/bank-layout/)).
- La fila no debe tapar la entrada ni invadir la zona de asesoría
  ([Coohom, *Bank layout*](https://www.coohom.com/article/bank-layout)); postes con
  cinta retráctil ([Crowd Control Store](https://www.crowdcontrolstore.com/retail-bank-queue-management/)).
- Mostrador: 95–107 cm del lado del cliente, tramo accesible ≤ 91 cm, superficie de
  trabajo del cajero a ~76 cm, ventanilla 45–100 cm de ancho, bandeja pasa-valores
  bajo el vidrio ([Silva Consultants](https://www.silvaconsultants.com/design-counters-for-good-security),
  [UpCodes](https://up.codes/s/sales-service-and-information-or-teller-windows)).
- Fotos de sucursales mexicanas/colombianas: ventanillas numeradas con cartel encima,
  pantalla de turnos, sillas en fila, postes con cinta roja, vestíbulo de cajeros 24 h
  ([ARQA](https://arqa.com/arquitectura/nuevo-diseno-bancario-con-el-foco-en-la-experiencia-del-cliente.html)).

## Planta (metros; x al este, z al sur; la calle en z > 0)

```
 z=-15 ┌──────────────── zona de cajeros (solo se ve tras el vidrio) ─────────────┐
       │  muro de lamas con logo · reloj · credenzas · puerta «Solo personal»      │
 z=-10.5├─[Caja1]─[Caja2]─[Caja3]─[Caja4]─[Caja5♿]──┬─ pantalla ── puerta ────────┤
       │  ····· línea «Espere aquí» (z=-8.9) ·····  │ turnos      personal       │
       │ ┌──── fila única (3 carriles) ─────┐ ┌pref┐│  ▢▢▢▢▢  sillas     ▣ asesor │
       │ │ ◄───────────────────────────────  │ │ ▲  ││  ▢▢▢▢▢             ▣ asesor │
       │ │ ───────────────────────────────►  │ │ │  ││                    ▣ asesor │
 z=-5.5│ └─▲ «Inicio de la fila» ───────────┘ └────┘│   agua                      │
       │   │         [kiosco]   [Información]                                     │
 z=-3.6├── puerta ──┬──────────────── zona de ventanales ─────────────────────────┤
       │ VESTÍBULO  │  mesa de formularios · folletos · plantas                     │
       │ cajeros 24h│  (vidrio)                                                     │
 z=0   └─ puerta ───┴────────── fachada acristalada con rótulo ──────────────────────┘
      x=-9       x=-3.4                                                         x=9
```

Techo 3,8 m.  El jugador mide 1,62 m al ojo (como el resto de SpanStories).

## Recorrido del estudiante y detalles

1. **La calle.** Acera, fachada de piedra y vidrio, rótulo teal con letras doradas,
   marquesina sobre la entrada, «Cajeros 24 h», horario en el vidrio, bolardos,
   farola, banco de calle, jardineras.  Enfrente: ilustración plana.
2. **Vestíbulo de cajeros (24 h).** Puerta automática con lector de tarjeta para la
   noche, tres cajeros automáticos empotrados (pantalla, teclado, ranuras de tarjeta,
   billetes y recibo, visera de privacidad), papelera «Comprobantes», estante para
   apoyar el bolso, carteles de seguridad («Cubra el teclado al marcar su clave»).
   Segunda puerta automática con el aviso típico: **«Por su seguridad, retírese
   gorra, gafas de sol y casco»**.
3. **Bienvenida.** Enfrente, el cartel colgante «Cajas»; a la derecha el **kiosco de
   turnos** (táctil, con tres botones: Caja · Atención al cliente · Preferencial) y el
   **módulo de Información** (mostrador curvo con logo).
4. **La fila.** Fila única serpenteante de tres carriles con postes de acero y cinta
   teal; el cartel **«Inicio de la fila»**, avisos «Por favor, espere su turno» y
   **«Espere aquí hasta que se le llame»** con huellas en el suelo; **fila
   preferencial** aparte (embarazadas, adultos mayores, personas con discapacidad).
   Mientras esperas lees: **tipo de cambio** (compra/venta), «Evite usar el celular»,
   horario, publicidad de cuentas y préstamos.
5. **El mostrador.** Cinco ventanillas de 2,4 m con mamparas: frente de madera y
   encimera de piedra a 1,05 m, **vidrio de seguridad** hasta 2,35 m con **rejilla para
   hablar** y **bandeja pasa-valores**, datáfono con teclado, portabolígrafos con
   cadena, plaquita **«Cuente su dinero antes de retirarse de la ventanilla»**,
   número iluminado sobre cada caja (se enciende en verde cuando llama).
   Caja 1 **cerrada** (letrero «Caja cerrada» tras el vidrio); caja 5 **preferente y
   accesible**, más baja (0,85 m).  Detrás del vidrio: monitor, teclado, cajón de
   efectivo, contadora de billetes, impresora de recibos, sello y tampón, taburete,
   credenza, y al fondo el muro de lamas con logo y reloj.
6. **Atención al cliente.** Pantalla de turnos (TURNO / MÓDULO) con timbre, dos filas
   de sillas, dispensador de agua, tres escritorios de asesor con mamparas de vidrio.

## Interacción (lo que hace el estudiante)

- Caminar (WASD / flechas + arrastrar) o saltar a las vistas del recorrido.
- **Pulsar un objeto** muestra su nombre en español con artículo («la ventanilla»,
  «el poste separador», «la bandeja pasa-valores»…): vocabulario en contexto.
- **Sacar turno** en el kiosco: sale un tique impreso con la letra del servicio y el
  número, y cuántos turnos hay delante.
- **Pantalla de turnos**: llama al siguiente cada pocos segundos con «din-don» y el
  texto «Turno C-023, caja 3»; la caja llamada enciende su número.  Cuando llega tu
  turno, se destaca.
- Puertas automáticas al acercarse.
- **Ficha de depósito** en la mesa de formularios: nombre, importe con número y
  **con letra** (se corrige: «setecienos» no vale).  El cajero la recibe después.
- **Misiones** en el panel (se marcan solas): preguntar en Información, llenar la
  ficha, depositar tras la fila, cambiar dólares, sacar turno, hablar con el
  asesor, retirar en el cajero automático.
- En tabletas y móviles: cruceta táctil y campo de visión más abierto en vertical.

## Decisiones

- Nombre ficticio **Banco Horizonte** («Tu banco, cerca de ti»).  Paleta: teal
  profundo, oro cálido, crema, madera de roble; suelo porcelanato claro brillante
  con banda teal que guía de la entrada a la fila.
- Sin personas (igual que el aeropuerto); el espacio está medido para ellas: carriles
  de 1 m, pasillo libre de 1,6 m frente al mostrador.
- Cuatro ambientes de luz (mañana, mediodía, tarde, noche); de noche los rótulos y
  el interior quedan encendidos, como una sucursal con horario extendido.

## Auditoría y bucle de trabajo

Tras construir cada bloque se audita con capturas desde las vistas del estudiante
(escala, legibilidad de rótulos, colisiones, contorno, rendimiento, consola) y se
anotan los cambios en el registro de abajo.

### Registro

**2026-09-25 · Construcción.** Motor copiado del restaurante (`Kit`, `Luz25D`,
`Reflejos`, three r180 local).  Módulos: `config.js` (planta), `Arquitectura.js`,
`Mostrador.js`, `Sala.js`, `Vestibulo.js`, `Exterior.js`, `Rotulos.js`, `Planos.js`;
app en `index.html` + `app.js` + `ui.js` + `banco.css`.  Servidor `serve.py` en el
puerto 7400 (entrada `banco` de `.claude/launch.json`), URL `/Banco/` (`?dev` expone
`window.__banco`; `window.banco` es la API de las historias).

**Auditoría 1** (vistas del recorrido):
- Paredes de estuco con manchas → se leían como suciedad: pintura mate casi lisa.
- Números de caja tapados por su placa desde la fila → plano adelantado.
- Rejilla para hablar = «donut» negro gigante → disco de 12 cm perforado.
- Reflejos del vidrio del mostrador demasiado fuertes de cerca → brillos 0,3.
- Kiosco: logo con fondo negro y pantalla recortada por el cuerpo → corregido.
- Casillero de fichas: las fichas quedaban dentro de la caja → lomo + bandejas.
- Datáfono = bloque negro → cara con pantalla «NIP» y teclado.
- Tirantes de la marquesina atravesaban el rótulo → faldones laterales.
- Aviso de la gorra tapado por el paramento de cajeros → vinilo en la fachada.
- Letrero de llamada solapado con el cartel colgante «Cajas» → movido a x = 2,2.
**Auditoría 2**: pisos altos con ventanas diminutas → 6 columnas × 2 plantas por
módulo de 7,2 m; vecinos con escaparate (cafetería y papelería); farolas y focos
pintaban círculos en los pisos altos → charcos en la acera; la voz de los turnos
solo anuncia tu turno (el timbre suena si estás dentro).
Flujos probados: fila → «Espere aquí» → llamada a caja → depósito → comprobante;
cajero automático (NIP, retiro, comprobante); saldo compartido entre ambos.

**Auditoría 3**: «Inicio de la fila» no se veía al entrar → cartel de pie con
flecha frente a la puerta interior; lambrín de roble (0,95 m) con remate teal en
los muros de la fila y de los asesores; luz lineal sobre el pasillo de cajas;
franja de seguridad en la mampara del vestíbulo; tipo de cambio con punto decimal.
**Auditoría 4**: la vista «La calle» empezaba en la calzada y la colisión del
bordillo impedía llegar a la acera → se puede cruzar (sin coches), el límite es la
fachada de enfrente; las lámparas pintaban círculos en el falso techo → no iluminan
superficies que miran hacia abajo; buzón de sugerencias, asiento preferente,
ficha de depósito, misiones, cruceta táctil, vistas de Información y de la mesa.
Pruebas: recorrido a pie calle → vestíbulo (puertas) → fila serpenteante completa
con colisiones → «Espere aquí» → llamada a la caja 4; turno A-015 llamado al
módulo 3 (~24 s) y asesor; ficha con importe con letra; móvil 375 px. Consola sin
errores; ~78 llamadas de dibujo y ~59 mil triángulos.

**Estado: terminado** (2026-09-25).  Ideas para después, si se piden: personajes
(cajeros tras el vidrio, clientes en la fila) — el espacio ya está medido para ellos;
sonido ambiente de sala; una historia guiada que encadene las misiones.
