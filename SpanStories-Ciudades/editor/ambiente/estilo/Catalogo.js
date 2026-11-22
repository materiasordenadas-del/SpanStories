// Texto de los 6 estilos activos (del catálogo de estilos de Atlas). Los ids, modos y parámetros canónicos vienen de style-pool.js;
// aquí solo hay presentación. scripts/verificar_fuentes_editor.mjs comprueba que coinciden.
export const ESTILOS_INFO = Object.freeze({
  spanstories: { familia: 'Cel shading', tipo: 'Anime · sombras definidas', desc: 'Tonos de anime con sombra fría, borde de luz y líneas controladas.', color: '#65b2ce' },
  dispatch: { familia: 'Cel shading', tipo: 'Cómic · anime occidental', desc: 'Cel de dos tonos, sombras violetas y luz de borde neón.', color: '#ec89b8' },
  zelda: { familia: 'Pictóricos', tipo: 'Acuarela · aventura', desc: 'Sombras frescas, pigmento suave y acabado de pintura.', color: '#8dbe78' },
  ghibli: { familia: 'Pictóricos', tipo: 'Ilustración · pintura', desc: 'Color delicado, pinceladas orgánicas y atmósfera pictórica.', color: '#b9bb88' },
  color: { familia: 'Básicos', tipo: 'Color · sin contorno', desc: 'Volumen y color base sin tinta añadida; sirve como referencia.', color: '#b4abb0' },
  colorline: { familia: 'Básicos', tipo: 'Color · contornos', desc: 'El mismo color base, con líneas de silueta y detalle.', color: '#d7aa86' },
});
export const FAMILIAS_ESTILO = Object.freeze(['Cel shading', 'Pictóricos', 'Básicos']);
