# Mallas de Tripo, partes e iris

> Referencia del skill rig-labial-bendy. Se lee solo cuando hace falta. `FP` = `nucleo.facs.pipeline`;
> hay dos módulos `ojos`: `nucleo/ojos.py` (rig de huesos, lente, abertura visible) y `nucleo/facs/ojos.py` (FACS, contacto).

## Pestañas de Tripo (0.7.2): detectar, quitar, no usar nunca
Las pestañas de Tripo no se usan: se retiran SIEMPRE y las sustituye el delineado (`FP.delineado`, estilos `anime`, `marcado`, `fino`).
La identificación es solo geométrica y UV (nada de mirar el visor), en cascada, y `quitar` la hace sola dentro del paso `abrir_ojos`
(antes de tocar los ojos). `pasos.siguiente` ya avisa en el paso `detectar` (`resumen.pestanas_tripo`).
1. **Isla geométrica** suelta junto al globo (`PT.buscar`, Camilo sin soldar: arco fino de ~130 vértices).
2. **Isla UV** (`PT.candidatas_uv`): cinta fina que rodea el globo, aunque comparta vértices con la piel (Tronchatoro, Camilo
   soldado: Tripo la pone en su propia isla UV). Grosor por ÁREA de la isla (< 2,5 R²), no por la caja (una cinta curva sobre el
   párpado tiene caja gorda); la piel (isla enorme), el globo, el iris y la ceja se descartan solos. Se suman los fragmentos pequeños
   (< 40 caras) pegados a una cinta aceptada (colita del rabillo). Seguridad `alta` solo si los DOS ojos coinciden (≤ 8 islas, vértices
   a menos de 1,6×); si no es `baja` y NO se borra solo.
3. **Ninguna** (Modelo C): no se toca nada y se sigue con el delineado.
- `pasos.diagnosticar_pestanas(cara)` (solo lee): `metodo` geometrica | uv | ninguna, `seguridad`, `lados`, `dudosas`, `accion`.
- **Selección manual** si es `baja`/dudosa: `pasos.pestanas_seleccionar(cara)` marca las caras candidatas y entra en modo edición; el
  usuario ajusta la selección y `pasos.quitar_pestanas_manual(cara)` (botones «Marcar pestañas» / «Quitar = selección» / «Devolver» en
  el paso 3b del panel). Se niega si alguna cara está a > 3 radios del ojo o son > 5 % de la malla (`forzar=True` lo salta).
- Solo se borran CARAS (los vértices quedan sueltos: índices, pesos y keys intactos) y se guardan en `cfg['pestanas_tripo_quitadas']`:
  `pasos.restaurar_pestanas(cara)` las devuelve. Nunca caras de una isla UV de piel.
- **Exportación:** los vértices sueltos no salen en el GLB (solo triángulos; comprobado). Lo que SÍ reaparece es lo oculto por el
  modificador `RLB_OcultarOjosUV` (la exportación apaga los nodos): `exportar_glb` llama a `PT.preparar_exportacion`, que lo borra de
  verdad y devuelve `{ocultas_borradas, pestanas_guardadas, reaparecidas, vertices_sueltos}` (`reaparecidas` tiene que ser 0).
- Probado: Tronchatoro (UV, 362 caras, 2 ojos), Camilo (UV tras soldar, 424 caras), sintéticos A/B/C y B asimétrico con selección manual.

## Inspección de partes e iris (0.3.0)
- `pasos.detectar` también inspecciona (`pasos.inspeccionar`). Pone nombre a las partes como grupos de
  vértices `RLB_<parte>`: piel, ojo_tripo.L/R, dientes_tripo, dientes, lengua, cavidad, ceja.L/R (sueltas o
  pegadas), mechon y otros. Deja una foto de colores en `RLB_revision/<cara>/partes.png`.
  - Mira esa foto primero, que cuesta una sola imagen.
  - Si los dientes, la lengua o la cavidad de Tripo son malos, se reemplazan por los del complemento.
- **Iris y pupila:** pide al usuario una imagen de referencia de frente. Mide en ella:
  - `iris` = ancho del iris / ancho del ojo, de lagrimal a rabillo (Vale ≈ 0,85);
  - `pupila` = ancho de la pupila / ancho del iris (≈ 0,70).

  Luego llama `pasos.ajustar_iris(cara, iris, pupila)`, o pásalos a `todo(..., iris=, pupila=)`. Se puede
  repetir, porque siempre parte de la forma original. El globo ya se ajusta solo al hueco de la malla.
- **Ceja pegada a la piel (obligatorio separarla):** `detectar` la señala en `resumen['ceja_pegada']` y «Arreglar malla» la separa SIEMPRE como isla propia (isla UV de ese lado que en espejo, respecto al centro de la cara, cae sobre la otra ceja; si no hay, espejo geométrico). Pegada, el párpado la arrastra al cerrar (Pegazo: 16 mm). Si `siguiente()` para diciendo que no pudo, sepárala a mano en el mismo objeto (Edit Mode, caras de la ceja, Mesh > Split > Selection [Y]) y repite desde detectar. Comprobar con `pasos.ceja_pegada(cara)` → None. En un personaje ya riggeado no se separa (borraría las shape keys): se avisa al usuario.
  Va **apagado** por defecto, porque en Malcon estropeó los párpados. Pendiente de resolver.
- La revisión ahora incluye `ojo_R`. Revisa los dos ojos: los lados pueden diferir (ceja suelta o pegada).

## Mallas de Tripo (Malcon): lo que viene pegado
- **Ojos:** Tripo trae medio globo ocular como parte de la piel. `detectar` lo busca en la malla
  (`ojos_esculpidos.buscar_en_malla`, por anillos de aristas, nunca con rayos). `todo` lo borra
  (`abrir_ojos`) y pone el ojo del complemento. El color del ojo se elige después.
- **Dientes:** entre los bordes de contacto de los labios hay una pared plana metida 2–4 mm (los dientes de
  Tripo) que sella la boca. `arreglar` la busca y la borra (`malla.quitar_dientes_tripo`). No hay que cortar
  la franja por la mitad: sale en escalones y la bolsa se arruga.
- La bolsa del fondo se cose al lazo de borde **más cercano a la boca**. El más largo puede ser otro
  agujero de la malla.
- El forro solo es lo que tapan los labios vistos de frente. Si no, en barbillas metidas como la de Malcon
  se borra piel del mentón.
- Si la cara sale escalada (`cara.scale` ≠ 1), todo se desplaza: el rig trabaja en coordenadas locales.

## Labios solapados y forro (0.8.50, «Ojos y textura»)
- Los marcadores de labio se usan como semillas: se buscan **sobre la piel** (`Cara.cerca_piel`). En el aire, la bola del labio inferior atrapaba el borde del superior, solapado 0,3 mm: la mandíbula bajaba medio labio de arriba.
- `interior.vaciar_forro` (al final de `terminar`): con la boca abierta lanza rayos por la abertura real y quita, capa a capa, lo que no es labio. Va después de contener la bolsa y nunca toca `piel_exterior`: antes, la bolsa salía bajo la mandíbula y aparecía un agujero junto a la comisura.
- `Giro._frac_suave` ignora los rabillos, donde la abertura tiende a 0: esas fracciones hacían girar el párpado 23 mm con una sonrisa.

## Topología de párpados antes del rig (0.8.46)

`pasos.preparar_parpados(cara, aplicar=False, centros=None, forzar=False)` (nucleo/preparar_parpados.py). Solo se usa si lo piden.
- Tripo suele cerrar el ojo con una membrana en abanico de triángulos (polos de hasta 12 aristas) dentro de un lazo cerrado de 25 vértices.
- El lazo se elige entre los bucles cerrados que rodean el ojo: el más interior cuya cara de dentro es pared. Una membrana que mira al frente se descarta.
- Solo se limpian los anillos cerrados que no crecen más de ×1,25 respecto al lazo; desde ahí empieza la cara y no se toca.
- Solo se actúa sobre triángulos reales. Colapsar rombos sin triángulo encoge los anillos y crea polos de 8.
- La cuenca son tres anillos que se abren bajo el párpado y bajan hasta un ancho medio del lazo, más una tapa en rejilla. Hereda material y UV del borde.
- Paridad: un disco con borde impar no admite solo quads; por eso queda un triángulo, puesto en el anillo más profundo.
