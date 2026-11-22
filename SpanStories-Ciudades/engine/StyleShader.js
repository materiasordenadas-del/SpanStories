// Shared shader plumbing. Artistic rules belong to engine/Estilos/<style>/.
export function componerEstilo(shader, { codigo, superficie, acabado = '' }) {
  const base = 'vec3 color = albedo * mix(sombra * hemi, luzColor, lit);';
  if (!shader.includes(base)) throw new Error('Material sin punto de sombreado compatible');
  return codigo + '\n' + shader
    .replace(/float lit\s*=[^;]+;/g, 'float lit = estiloLuz(nl, umbral, suave);')
    .replace(base, superficie)
    .replace(/gl_FragColor = vec4\(color, (a|1\.0)\);/, (_, alpha) => `${acabado}\ngl_FragColor = vec4(color, ${alpha});`);
}

export function componerContorno(shader, inicio, fin) {
  return 'uniform float uEstiloTrazo;\n'+shader.replace('uGrosor * nivel',
    `uGrosor * uEstiloTrazo * (1.0-smoothstep(${inicio.toFixed(1)},${fin.toFixed(1)},clip.w)) * nivel`);
}

// Explicit GLB metadata wins; names/properties are only a fallback. No per-object audit.
export function categoriaMaterial(source, nombre = source.name) {
  const explicit = source.userData?.ssCategory || source.userData?.categoria;
  const categories = ['general','vegetacion','cesped','terreno','piedra','madera','metal','cristal','agua','arquitectura','piel','cabello','ropa'];
  if (categories.includes(explicit)) return explicit;
  const name = (nombre || '').toLowerCase();
  const rules = [
    ['agua', /water|agua/], ['cristal', /glass|cristal|vidrio/],
    ['cesped', /grass|cesped|césped/], ['vegetacion', /leaf|leaves|foliage|tree|hoja|follaje|arbol|árbol/],
    ['cabello', /hair|cabello|pelo/], ['piel', /skin|piel/], ['ropa', /cloth|ropa|shirt|dress|tela/],
    ['metal', /metal|steel|acero|iron|hierro/], ['madera', /wood|madera|bark|tronco/],
    ['piedra', /stone|rock|piedra|roca/], ['terreno', /ground|terrain|suelo|terreno|asphalt|asfalto/],
    ['arquitectura', /wall|brick|facade|fachada|ladrillo|pared|arquitectura/],
  ];
  for (const [category, pattern] of rules) if (pattern.test(name)) return category;
  if (source.transmission > .1) return 'cristal';
  if (source.metalness > .6) return 'metal';
  return 'general';
}

export const CATEGORIAS = Object.freeze({general:0,vegetacion:1,cesped:2,terreno:3,piedra:4,madera:5,metal:6,cristal:7,agua:8,arquitectura:9,piel:10,cabello:11,ropa:12});
