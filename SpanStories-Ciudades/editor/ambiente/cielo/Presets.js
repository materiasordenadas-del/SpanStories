// Los 27 cielos de la biblioteca V7.1 como PALETAS. Cada paleta = [cenit, horizonte, nube iluminada, nube en sombra, factor de luz]
// por hora del día (manana · mediodia · tarde · nublado · noche). Se aplican a través del compositor real de Atlas
// (tablas de ambientes de pipeline.js y Luz25D), no con un renderizador propio.
//
// «paletas: null» = el cielo propio del estilo activo (Trigun, Zelda, Ghibli, Dispatch, Color): no se sustituye.
// Los cielos «histórico» conservan solo los colores originales; su shader/lienzo propio no se porta (ver PENDIENTES_NO_RESUELTOS.md).
const NP = {
  21: { manana: ['#78c5e5', '#f5eec9', '#fff5d8', '#8dabbc', .67], mediodia: ['#65b5e6', '#e2f3ee', '#fff8e4', '#9aafc0', .66], tarde: ['#778fc0', '#f1ca9d', '#ffe0b8', '#9a99b0', .72], nublado: ['#91aabd', '#d9e2df', '#e7ece5', '#8999aa', .91], noche: ['#38568c', '#929dc4', '#bdc5d1', '#596b99', .55] },
  22: { manana: ['#75a6d1', '#eadbba', '#fff2d7', '#7d98ad', .58], mediodia: ['#4f96d0', '#c6e0eb', '#fffaf1', '#7f9db4', .57], tarde: ['#637d94', '#d7b5aa', '#f2c4b1', '#858390', .66], nublado: ['#84939f', '#c9cecf', '#e1e2df', '#74818e', .92], noche: ['#203554', '#687d9c', '#aab6cd', '#435472', .49] },
  23: { manana: ['#86d4e5', '#f3f5d4', '#fff6dc', '#a2b9c9', .59], mediodia: ['#76c9e1', '#ecf8d9', '#fffbe6', '#a0b6ca', .56], tarde: ['#8ea6cd', '#f4d1ab', '#ffe5be', '#9e9eae', .65], nublado: ['#9fb5c3', '#dfe7e5', '#e9eee9', '#8e9faf', .90], noche: ['#344e7d', '#7f90b1', '#b7c2d4', '#52668f', .57] },
  24: { manana: ['#72c6ed', '#f4f0d9', '#fff9ec', '#a0b8d9', .63], mediodia: ['#419fdf', '#d8f3f4', '#fffdf5', '#8baed1', .64], tarde: ['#817dcc', '#ffd5ac', '#ffe4d4', '#b599c6', .68], nublado: ['#90acbf', '#d9e5e8', '#f0f0ee', '#a0afc2', .83], noche: ['#263e78', '#899bc9', '#b1c4e7', '#526b9c', .54] },
  25: { manana: ['#83cbe2', '#fff2d2', '#fffbe9', '#c4d6df', .87], mediodia: ['#64b4e2', '#eff9ff', '#fffef6', '#b6cfe3', .89], tarde: ['#9e8dcc', '#f8c8a8', '#fff0d9', '#b5a4c9', .88], nublado: ['#a2bbc9', '#ecf2f3', '#f7f6ef', '#aebdcb', .95], noche: ['#273761', '#9ca9c9', '#dce9f9', '#7585af', .84] },
  26: { manana: ['#408db9', '#f1d9ad', '#fff0d3', '#7194ad', .52], mediodia: ['#348ec4', '#cce6e7', '#fffbef', '#719ab7', .50], tarde: ['#655b91', '#f8b078', '#ffd4b0', '#9d819e', .55], nublado: ['#8193aa', '#cbd5dd', '#e9e7e7', '#7489a5', .82], noche: ['#182c4c', '#546e9f', '#bdcde9', '#3f527e', .45] },
  27: { manana: ['#639fc8', '#ead6b4', '#fff3d7', '#8fa0ae', .48], mediodia: ['#438dcc', '#e7dcbe', '#fff7e5', '#8f9ba6', .40], tarde: ['#47638d', '#e9a271', '#ffd2a6', '#8e8492', .57], nublado: ['#798c9d', '#d1c7b6', '#d5dadb', '#7c8995', .84], noche: ['#080e25', '#25324f', '#a5afc1', '#303b55', .43] },
};
// Paleta genérica de los cielos antiguos (tabla G de V7.1)
const G = { manana: ['#91bed6', '#d7e2dc', '#f5f0e4', '#779aa8', 1], mediodia: ['#83b9d5', '#dbe6dc', '#fff9e6', '#88a6b3', 1], tarde: ['#9ebdce', '#e6d4b6', '#ffe4b9', '#9c9eb3', 1], nublado: ['#a2b9c1', '#d0d8d0', '#e1e5de', '#839da5', .88], noche: ['#1b304d', '#405870', '#7c919e', '#344b68', .32] };

export const HORAS = Object.freeze([['manana', 'Mañana'], ['mediodia', 'Mediodía'], ['tarde', 'Tarde'], ['nublado', 'Nublado'], ['noche', 'Noche']]);

// [id, nombre, grupo, modo, descripción breve, paletas]
const FILAS = [
  ['quijote', 'Don Quijote · La Mancha', 'Historias', 27, 'Horizonte seco y dorado, cúmulos dispersos y noche rural con luna.', NP[27]],
  ['genshin', 'Genshin Impact · anime', 'Nuevos', 24, 'Cúmulos orgánicos pintados, sombras celestes.', NP[24]],
  ['sky-light', 'Sky: Children of the Light', 'Nuevos', 25, 'Grandes masas de nubes y luz marfil.', NP[25]],
  ['valorant', 'Valorant · estilizado', 'Nuevos', 26, 'Formas gráficas, planos de color y luz limpia.', NP[26]],
  ['totk', 'Tears of the Kingdom · tierra', 'Nuevos', 21, 'Cúmulos tridimensionales y luz cálida.', NP[21]],
  ['totk-high', 'Tears of the Kingdom · cúmulos altos', 'Nuevos', 23, 'Cúmulos altos y horizonte turquesa luminoso.', NP[23]],
  ['ocarina', 'Ocarina of Time · remake', 'Nuevos', 22, 'Cielo naturalista, cúmulos suaves y contraste atmosférico.', NP[22]],
  ['trigun', 'Trigun', 'Del estilo', 0, 'Degradado cálido y nubes sinusoidales (cielo propio del estilo).', null],
  ['zelda', 'Zelda', 'Del estilo', 6, 'Acuarela, halo solar y cúmulos (cielo propio del estilo).', null],
  ['ghibli', 'Studio Ghibli', 'Del estilo', 7, 'Nubes pintadas que se desplazan (cielo propio del estilo).', null],
  ['dispatch', 'Dispatch', 'Del estilo', 8, 'Nubes a brochazos y halo solar (cielo propio del estilo).', null],
  ['color', 'Color', 'Del estilo', 1, 'Cielo base sin tinta (cielo propio del estilo).', null],
  ['colorline', 'Color + línea', 'Del estilo', 2, 'Mismo cielo que Color (cielo propio del estilo).', null],
  ['airport', 'Aeropuerto', 'Histórico', 10, 'Colores del cielo original del aeropuerto.', G],
  ['restaurant', 'Restaurante', 'Histórico', 11, 'Colores del cielo original.', G],
  ['bank', 'Banco', 'Histórico', 12, 'Colores del cielo original.', G],
  ['cafe', 'Cafetería', 'Histórico', 13, 'Colores del cielo original.', G],
  ['shop', 'Tienda', 'Histórico', 13, 'Mismos colores que Cafetería.', G],
  ['hostel', 'Hostal', 'Histórico', 14, 'Degradado de tres paradas.', G],
  ['pharmacy', 'Farmacia', 'Histórico', 14, 'Degradado de tres colores.', G],
  ['bus', 'Parada de autobús', 'Histórico', 14, 'Mismo cielo que Farmacia.', G],
  ['hotel', 'Hotel · fachada', 'Histórico', 15, 'Color sólido original.', G],
  ['hotelterr', 'Hotel · terraza', 'Histórico', 16, 'Color sólido original.', G],
  ['hotelbar', 'Hotel · bar', 'Histórico', 17, 'Color sólido original.', G],
  ['hotelother', 'Hotel · otras zonas', 'Histórico', 18, 'Color sólido original.', G],
  ['atlas', 'Atlas original', 'Histórico', 19, 'Degradado de la esfera original.', G],
  ['oldghibli', 'Ghibli · histórico', 'Histórico', 20, 'Versión anterior con colores propios.', G],
];

export const CIELOS = Object.freeze(FILAS.map(([id, nombre, grupo, modo, descripcion, paletas]) => Object.freeze({ id, nombre, grupo, modo, descripcion, paletas })));
export const cieloPorId = id => CIELOS.find(c => c.id === id) ?? null;
export const GRUPOS_CIELO = Object.freeze(['Historias', 'Nuevos', 'Del estilo', 'Histórico']);
