// Paleta de superficies del Estudio, afinada para la luz Trigun de SpanStories
// (cenit #58a9d3, horizonte #e4d5b7, sombra fría #69759c): albedos claros y cálidos.
import * as THREE from 'three';

const C=hex=>new THREE.Color(hex);
export const GROUND={
  asphalt:C('#6c707b'),asphaltDark:C('#62666f'),asphaltLight:C('#7d818a'),
  paving:C('#d8d0c2'),pavingAlt:C('#cdc5b6'),plaza:C('#d4cec3'),plazaAlt:C('#cbc4b8'),pedestrian:C('#c8c2b7'),
  curb:C('#c7c1b5'),curbSide:C('#a7a196'),
  grass:C('#9fc46a'),grassDark:C('#86b158'),park:C('#a3c96c'),forest:C('#78a352'),scrub:C('#9cb767'),
  sand:C('#e8d29f'),albero:C('#e4c27c'),gravel:C('#c9c0ae'),farmland:C('#c9cf86'),
  water:C('#58a9d3'),waterDeep:C('#3f8fbe'),sea:C('#4c9ccc'),pier:C('#a57a52'),breakwater:C('#a9a397'),pool:C('#5fc4e0'),poolRim:C('#eeeae2'),
  pitch:C('#71b257'),pitchLine:C('#f6f4ee'),track:C('#c86d52'),court:C('#5f8fb8'),playground:C('#e2b98c'),
  parking:C('#8b8e97'),marking:C('#f5f2ea'),markingYellow:C('#ebc24c'),
  school:C('#dccfb8'),rail:C('#a69d90'),railSteel:C('#7a7a80'),
};

// Fachadas: familias por estilo. Colores sRGB; el material aplica la luz.
export const FACADE={
  madrid:['#e9d3a8','#e6c48f','#ead9b9','#e2b48a','#d99a72','#f0e2c4','#e7cfa0','#d7a77c','#efe7d6','#c98f6a','#e5d0ac','#dcc09a'],
  eixample:['#e8dcc6','#e2cfae','#d9c19c','#efe4d0','#d6b996','#e6d6bc','#cfb38f'],
  andaluz:['#f6f1e6','#f8f4ea','#f3ece0','#f6efe2','#efe6d4'],
  colonial:['#f2c14e','#e9805a','#5fa8c9','#8fc08a','#f0d9a0','#e58fa0','#b7d3e8','#f5e6c8','#d96c4f','#9b8fd0','#f3a65a'],
  moderno:['#e4e1db','#d9d5ce','#cfc8bd','#c9b9a4','#e9e4da','#bdb5aa','#d4c2a8'],
  ladrillo:['#b56a4c','#c27a58','#a85f45','#c98b67','#b9785d'],
  oficinas:['#d7dbe0','#c9cfd6','#e2e2de','#bfc6cf'],
  industrial:['#c9c6bd','#b8bcc0','#d2c9b6','#a9b2ba'],
  piedra:['#d8ccb4','#cfc0a2','#e0d4bd','#c6b593'],
};
export const TRIM={light:C('#f4efe4'),stone:C('#e8dcc4'),white:C('#f7f5ef'),dark:C('#5d5a57'),wood:C('#8a5a3b'),green:C('#3f6b52'),iron:C('#3c3f45'),brown:C('#6b4a35')};
export const ROOF={tile:['#c4673f','#b85c3a','#cf7a4d','#b4573a','#d08450'],slate:['#5e6670','#6b7480','#57606b'],flat:['#c9c3b8','#bdb7ac','#d3cdc2','#b2aca2'],zinc:['#8e99a3','#9aa4ad'],green:['#6f9a8a']};
export const GLASS={day:C('#40566e'),dayLight:C('#6f8fae'),shop:C('#4c6a82'),night:C('#ffd58a')};
export const AWNING=['#c8463c','#2f6e8f','#3d7d4f','#e0a33a','#8a3f5f','#d9d2c3','#c45a2c','#28547a'];
export const SIGN=['#2b4a7a','#a8322d','#2f6b4f','#d9a52b','#4a3b6b','#1f1f24','#c75b1f','#f3efe6'];
