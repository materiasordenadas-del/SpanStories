# Informe 0.13.0 · césped igual que la demo web de James Smyth

## Causa de la diferencia
- Se copió el shader del ZIP de GitHub, que es una versión anterior a la publicada en https://smythdesign.com/demos/grass/ (bundle.js, Three r131). La web usa contraste 2 / brillo −0,5 y viento en X y Z con waveSize 5; el ZIP, 1,5 / +0,1 y solo X con waveSize 10. Las texturas grass.jpg y cloud.jpg son idénticas (SHA-256 comprobado).
- Hojas de 0,45 m en lugar de 0,8–1,4 m, un tercio de la densidad, calvas por agrupación/variación regional y aclarado fuerte desde 10 m (1/d²).
- Las tres hojas de cada mata quedaban en el mismo punto: su separación se multiplicaba por la anchura (±4 mm).
- El suelo entre hojas se pintaba con la luz Zelda, con otro color que el de las hojas.

## Cambios
- `grass-james-source.js`: fragmento literal de la web.
- `grass-shaders.js`: onda de la web (X a velocidad completa, Z a un cuarto, longitud 37,7 m, amplitud en metros escalada a hoja de 1,1 m); sin inclinación añadida; separación de hojas en metros; ensanchado al aclarar con la distancia.
- `grass-geometry.js`: atributo `aOffset` (5 vértices / 3 triángulos por hoja se conservan).
- `grass-config.js` / `grass-field.js`: valores por defecto y presets como la web; `grassKeep()` compartido CPU/GPU (densidad plena hasta 12 m).
- `pipeline.js` / `viewer.js`: en Zelda el suelo verde usa la fórmula de James sin luz y con la bruma Zelda lejana; `groundBlend` (1 por defecto) lo mezcla con el suelo pintado.
- `grass-panel.js`: botón «Igual que la web» (restaura forma, reparto y viento; conserva colores, distancias y presupuestos).

## Verificación
- 88 pruebas y `npm run build` aprobados.
- Segovia (Acueducto, 200 m), Zelda, cámara como la demo: captura `reports/estudio/0.13.0/cesped-web-segovia.png`.
- Comparar con/sin césped: 6,4 → 8,6 ms (2,2 ms, 118 114 triángulos, 2 draw calls), 60 fps.

## Pendiente
- Proyectos o vistas guardados con la configuración anterior conservan sus valores al abrirse: pulsar «Igual que la web».
- El césped Zelda no recibe sombras de árboles ni edificios (la web tampoco tiene luz); las nubes de cloud.jpg hacen de sombra móvil.
- Los otros estilos usan la misma forma y viento nuevos; su color sigue siendo el de su pase.
- Aprobación visual del usuario.
