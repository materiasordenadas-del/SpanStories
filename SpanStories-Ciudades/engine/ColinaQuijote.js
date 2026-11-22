// Colina de Don Quijote: madrugada justo antes del alba.
// Terreno continuo y transitable, césped 3D instanciado por teselas con LOD y viento en GPU,
// flores silvestres discretas, cielo con luna, nubes y cordilleras lejanas con neblina azulada.
import * as T from './three.js';
import { COLINA_QUIJOTE } from '../routes.js';
import { CityAssets } from './CityAssets.js';

// ---------- Relieve ----------
function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  let u = x - ix, v = z - iz;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Cresta diagonal ancha: alta a la izquierda, baja a la derecha; ladera larga hacia la cámara,
// caída más corta detrás y un valle que se hunde lejos para dejar ver las sierras con neblina.
export function relief(x, z, spec = COLINA_QUIJOTE) {
  const { crest } = spec;
  const crestZ = crest.z + crest.skew * x + 2.2 * Math.sin(x * .045 + .6);
  const crestH = crest.height + crest.leftLift * Math.tanh((crest.pivot - x) / crest.span);
  const u = z - crestZ;
  const d = Math.max(Math.abs(u) - crest.flat, 0);
  const L = u > 0 ? crest.front : crest.back;
  let h = crestH * Math.exp(-((d / L) ** 2));
  // Suelo bajo la ladera y valle lejano.
  const r = Math.hypot(x, z + 25);
  h += -1.1 - spec.valleyDepth * smooth(95, 245, r) - spec.rightFall * smooth(8, 110, x) * smooth(-70, -10, z);
  // Ondulaciones amplias y pequeñas irregularidades naturales (sin deformar la cresta).
  h += .55 * Math.sin(x * .031 + 1.3) * Math.cos(z * .027 - .4);
  h += .42 * (valueNoise(x * .055, z * .055) - .5) + .16 * (valueNoise(x * .16 + 9, z * .16 - 3) - .5);
  return h;
}

// Igual que los dos triángulos de PlaneGeometry ya girado: pies y raíces siguen la superficie dibujada.
export function hillHeight(x, z, spec = COLINA_QUIJOTE) {
  const { radius, segments } = spec;
  const step = 2 * radius / segments;
  const col = Math.min(segments, Math.max(0, (x + radius) / step));
  const row = Math.min(segments, Math.max(0, (z + radius) / step));
  const ix = Math.min(segments - 1, Math.floor(col)), iz = Math.min(segments - 1, Math.floor(row));
  const u = col - ix, v = row - iz;
  const left = ix * step - radius, top = iz * step - radius;
  const low = relief(left + step, top, spec) * u + relief(left, top + step, spec) * v;
  if (u + v <= 1) return low + relief(left, top, spec) * (1 - u - v);
  return relief(left + step, top, spec) * (1 - v) + relief(left, top + step, spec) * (1 - u) +
    relief(left + step, top + step, spec) * (u + v - 1);
}

// ---------- GLSL compartido ----------
const common = /* glsl */`
  uniform vec3 dawnDir;
  uniform vec3 moonDir;
  uniform float windTime;
  uniform float fogDensity;
  // Luz que dirige el Estudio: 0 = apagada, 1 = plena (sol hasta 1.5 = mediodía).
  uniform float sunLevel;
  uniform float moonLevel;
  uniform float mistAmount, mistTop, mistFalloff, mistStart, mistFull, mistWisp;
  // 0 jirones originales · 1 cúmulos procedurales · 2 tarjetas NPR · 3 sin nubes.
  uniform float cloudStyle;
  // Suelo: 0 original (sombra oscura entre matas) · 1 césped corto pintado.
  uniform float groundStyle;
  // Densidad del césped en primer plano (1 = la del escenario).
  uniform float grassDensity;
  uniform vec3 mistColor;
  vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
  // Noche: sin luna casi negro (fotograma 1 de la referencia); con luna llena, el azul de luna (fotograma 9).
  float nightScale() { return mix(.07, 1., clamp(moonLevel, 0., 1.)); }
  // Cuánto se ha hecho de día: la paleta pasa del azul de luna al cielo diurno.
  float dayMix() { return smoothstep(.3, 1.1, sunLevel); }
  float sunOn() { return smoothstep(.25, .6, sunLevel); }
  // Sol rasante (anochecer, amanecer): horizonte encendido y nubes teñidas. 0 con la luz por defecto (.25).
  float sunset() { return smoothstep(.25, .4, sunLevel) * (1. - dayMix()); }
  float ambientScale() { return max(nightScale(), smoothstep(.1, .9, sunLevel) * 1.15); }
  // El sol sale (o se pone) por el punto del resplandor del alba: con .25 está justo bajo el horizonte.
  vec3 sunDir() { return normalize(vec3(dawnDir.x, -.075 + .3 * clamp(sunLevel, 0., 1.5), dawnDir.z)); }
  vec3 sunColor() { return mix(srgb(vec3(1.,.68,.48)), srgb(vec3(1.,.95,.88)), dayMix()); }
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), u = fract(p);
    u = u*u*(3.0-2.0*u);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+1.0), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0., a = .5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = mat2(1.6,1.2,-1.2,1.6) * p + 7.1; a *= .5; }
    return v;
  }
  // Color de la bruma según la dirección: azul lavanda, más clara hacia el alba y bajo la luna.
  vec3 hazeColor(vec3 dir) {
    vec2 h = normalize(dir.xz + 1e-5);
    float dawn = pow(max(dot(h, normalize(dawnDir.xz)), 0.), 4.);
    float moon = pow(max(dot(h, normalize(moonDir.xz)), 0.), 3.);
    vec3 c = srgb(vec3(.40,.49,.76));
    c = mix(c, srgb(vec3(.62,.62,.84)), dawn * .55);
    vec3 night = (c + srgb(vec3(.12,.12,.13)) * moon * .6 * moonLevel) * nightScale();
    vec3 day = mix(srgb(vec3(.70,.78,.92)), srgb(vec3(.98,.82,.68)), dawn * .6) * min(sunLevel, 1.2);
    vec3 col = mix(night, day, dayMix());
    // Rubor del sol saliendo (o poniéndose) en la bruma de ese lado.
    return col + srgb(vec3(1.,.62,.48)) * dawn * sunOn() * (1. - dayMix()) * .45;
  }
  // Bruma lila: su color sigue la luz (azul lavanda con luna, casi blanca de día, rosada al alba).
  vec3 mistLight(vec3 dir) {
    vec2 h = normalize(dir.xz + 1e-5);
    float dawn = pow(max(dot(h, normalize(dawnDir.xz)), 0.), 3.);
    vec3 night = srgb(mistColor) * nightScale();
    vec3 day = srgb(vec3(.86,.88,.93)) * min(sunLevel, 1.2);
    return mix(night, day, dayMix()) + srgb(vec3(1.,.66,.55)) * dawn * sunOn() * (1. - dayMix()) * .35;
  }
  // Niebla por distancia + bruma baja que se acumula en las hondonadas + bruma lila que se posa sobre la cresta.
  vec3 applyFog(vec3 col, vec3 wp) {
    vec3 v = wp - cameraPosition;
    float d = length(v);
    vec3 dir = v / max(d, 1e-3);
    float f = 1. - exp(-pow(d * fogDensity, 1.35));
    float low = exp(-max(wp.y + 1.5, 0.) * .38) * (1. - exp(-d * .03)) * .6;
    f = clamp(f + low * (1. - f), 0., .985);
    col = mix(col, hazeColor(dir), f);
    // Jirones: dos octavas de ruido que arrastra el viento, para que la bruma no sea una lámina uniforme.
    vec2 q = wp.xz * .045 + vec2(windTime * .06, windTime * .025);
    float wisp = noise2(q) * .65 + noise2(q * 2.3 + 4.1) * .35;
    float m = exp(-max(wp.y - mistTop, 0.) * mistFalloff) * smoothstep(mistStart, mistFull, d);
    m *= mix(1., smoothstep(.2, .8, wisp) * 1.35, mistWisp);
    return mix(col, mistLight(dir), clamp(m * mistAmount, 0., .9));
  }
  // Rachas: bandas coherentes que recorren la colina + oleaje secundario.
  const vec2 windDir = vec2(.94, .34);
  float gustAt(vec2 p) {
    float band = noise2(p * .03 - windDir * windTime * .45);
    float swell = sin(dot(p, windDir) * .3 - windTime * 1.3) * .5 + .5;
    return smoothstep(.3, .9, band * .7 + swell * .3);
  }
  // Manchas de color: verde oscuro, verde azulado y verde oliva claro.
  vec3 turfColor(vec2 p, float tint) {
    vec3 dark = srgb(vec3(.09,.32,.10));
    vec3 teal = srgb(vec3(.06,.31,.21));
    vec3 olive = srgb(vec3(.22,.42,.11));
    float a = noise2(p * .05), b = noise2(p * .13 + 7.3);
    vec3 col = mix(dark, teal, smoothstep(.32, .72, a));
    col = mix(col, olive, smoothstep(.5, .85, b) * .7);
    return col * (.85 + .3 * tint);
  }
  vec3 tipColor(vec2 p, float tint) {
    float b = noise2(p * .13 + 7.3);
    vec3 warm = srgb(vec3(.48,.70,.18));
    vec3 cool = srgb(vec3(.30,.62,.26));
    return mix(cool, warm, clamp(b * .8 + tint * .4 - .1, 0., 1.));
  }
  // Hojitas sueltas de una capa: en cada celda una hoja corta y afilada, peinada por el viento con algo de azar,
  // que puede salirse a las celdas vecinas (sin bordes de baldosa). Devuelve (cobertura, luz a lo largo, azar).
  vec3 bladeLayer(vec2 g, float spread) {
    vec2 i = floor(g), f = fract(g);
    vec3 best = vec3(0.);
    float wa = atan(windDir.y, windDir.x);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = i + o;
      float h1 = hash(c), h2 = hash(c + 17.3), h3 = hash(c + 5.1);
      vec2 r = f - o - vec2(h1, h2);
      float a = wa + (h3 - .5) * spread;
      vec2 l = vec2(cos(a) * r.x + sin(a) * r.y, -sin(a) * r.x + cos(a) * r.y);
      float len = .55 + .35 * h1;
      float u = l.x / len + .5;
      if (u < 0. || u > 1.) continue;
      float w = .13 * (1. - u) * (.6 + .6 * h2) + .01;
      float cov = 1. - smoothstep(w * .55, w, abs(l.y - .06 * sin(u * 3.1) * (h3 - .5)));
      if (cov > best.x) best = vec3(cov, u, h3);
    }
    return best;
  }
  // Césped corto pintado a mano (suelo entre las matas y pradera lejana): fondo moteado y dos capas de
  // hojitas claras con su sombrita. Con la distancia (blur) se funde en su color medio, sin parpadeo.
  vec3 shortGrass(vec2 p, float tint, float blur) {
    vec3 mid = turfColor(p, tint);
    vec3 tip = tipColor(p, tint);
    float mottle = noise2(p * 1.7) * .6 + noise2(p * 4.3 + 3.) * .4;
    vec3 col = mix(mid * .78, mix(mid, tip, .2), mottle);
    vec3 b1 = bladeLayer(p * 4.2, 2.2);
    vec3 s1 = bladeLayer(p * 4.2 + vec2(.06, -.09), 2.2);
    col *= 1. - s1.x * (1. - b1.x) * .22;
    col = mix(col, mix(mid, tip, .35 + .5 * b1.y) * (.92 + .2 * b1.z), b1.x * .85);
    vec3 b2 = bladeLayer(p * 9.3 + 7.7, 2.8);
    col = mix(col, mix(mid, tip, .25 + .45 * b2.y) * (.9 + .25 * b2.z), b2.x * .6);
    vec3 average = mix(mid, tip, .3) * .9;
    return mix(col, average, smoothstep(.2, .7, blur));
  }
  vec3 nightLight(vec3 n, vec3 viewDir, float t) {
    vec3 hemi = mix(srgb(vec3(.18,.26,.22)), srgb(vec3(.74,.82,.98)), n.y * .5 + .5) * nightScale();
    vec3 moon = srgb(vec3(.95,.95,.92)) * max(dot(n, moonDir) * .6 + .4, 0.) * .6 * moonLevel;
    float through = pow(max(dot(viewDir, moonDir), 0.), 3.) * t * moonLevel;
    vec3 night = hemi + moon + srgb(vec3(.55,.78,.35)) * through * .7;
    // Día: cielo claro arriba, rebote cálido de la tierra abajo; el sol entra rasante y trasluce las puntas.
    vec3 dayHemi = mix(srgb(vec3(.30,.33,.22)), srgb(vec3(.80,.86,1.)), n.y * .5 + .5) * min(sunLevel, 1.3);
    vec3 sd = sunDir();
    vec3 sun = sunColor() * sunOn() * (max(dot(n, sd) * .7 + .3, 0.) * 1.1 + pow(max(dot(viewDir, sd), 0.), 3.) * t * .6);
    return mix(night, dayHemi, dayMix()) + sun;
  }
`;

// Luz y paleta de las nubes (cielo y tarjetas NPR comparten los mismos tres tonos).
const cloudLightGLSL = /* glsl */`
      struct CloudLight { vec2 toward; float above, below, glow; vec3 shadow, mid, lit, rim; };
      // Luz principal de las nubes: la luna de noche, el sol (aunque siga bajo el horizonte) al alba y de día.
      CloudLight cloudLight(vec3 dir) {
        CloudLight c;
        float dm = dayMix();
        float sunW = clamp(sunOn() * 1.4 + dm, 0., 1.);
        vec3 L = normalize(mix(moonDir, sunDir(), sunW));
        vec2 Pd = dir.xz / (max(dir.y, 0.) + .1) * 4.;
        vec2 Lp = L.xz / (max(L.y, 0.) + .1) * 4.;
        c.toward = normalize(mix(normalize(L.xz + 1e-5), normalize(Lp - Pd + 1e-5), smoothstep(.0, .1, L.y)));
        c.above = smoothstep(-.02, .1, L.y);
        c.below = 1. - c.above;
        c.glow = pow(max(dot(dir, L), 0.), 5.);
        float ns = nightScale();
        // Noche de luna: base violeta, cuerpo lavanda, cimas casi blancas hacia la luna (referencia 04).
        vec3 nS = srgb(vec3(.21,.20,.42)) * ns, nM = srgb(vec3(.44,.43,.70)) * ns, nL = srgb(vec3(.82,.82,.96)) * ns;
        nL += srgb(vec3(.9,.9,1.)) * c.glow * .5 * moonLevel * (1. - sunW);
        // Antes del alba: las panzas que miran al resplandor se tiñen de rosa malva.
        float dawnSide = pow(max(dot(normalize(dir.xz + 1e-5), normalize(dawnDir.xz)), 0.), 3.) * smoothstep(.1, .3, sunLevel) * (1. - sunOn());
        nS = mix(nS, srgb(vec3(.42,.30,.52)) * max(ns, .3), dawnSide * .6);
        nM = mix(nM, srgb(vec3(.70,.52,.72)) * max(ns, .3), dawnSide * .45);
        vec3 lvl = vec3(min(sunLevel, 1.2));
        vec3 dS = srgb(vec3(.58,.63,.77)) * lvl, dM = srgb(vec3(.85,.88,.95)) * lvl, dL = srgb(vec3(1.,.99,.97)) * lvl;
        c.shadow = mix(nS, dS, dm); c.mid = mix(nM, dM, dm); c.lit = mix(nL, dL, dm);
        // Sol rasante: cuerpo rosa, panzas encendidas de oro hacia el sol, sombras violeta lejos de él.
        float az = pow(max(dot(normalize(dir.xz + 1e-5), normalize(L.xz + 1e-5)), 0.), 2.);
        float ss = sunset();
        c.shadow = mix(c.shadow, mix(srgb(vec3(.30,.24,.44)), srgb(vec3(.48,.30,.42)), az), ss);
        c.mid = mix(c.mid, mix(srgb(vec3(.58,.42,.62)), srgb(vec3(.90,.52,.50)), az), ss);
        c.lit = mix(c.lit, mix(srgb(vec3(.92,.66,.66)), srgb(vec3(1.,.74,.44)), az), ss);
        c.rim = c.lit * 1.25;
        return c;
      }
      vec3 shadeCloud(CloudLight c, float k, float rim, vec3 dir) {
        vec3 col = mix(c.shadow, c.mid, smoothstep(.15, .45, k));
        col = mix(col, c.lit, smoothstep(.52, .85, k));
        return col + c.rim * rim * .55;
      }
`;

// Las matas se generan con GRASS_OVERSAMPLE veces la densidad del escenario; de ellas se muestra la fracción
// que pide «Densidad del césped» en primer plano, fundiéndose con la normal hacia el plano medio.
const GRASS_OVERSAMPLE = 2;
const lodGLSL = (spec) => /* glsl */`
  float densityKeep(float d, float keep) {
    float f = mix(grassDensity, 1., smoothstep(${spec.lod.full.toFixed(1)}, ${spec.lod.thin.toFixed(1)}, d));
    return keep * f / ${GRASS_OVERSAMPLE.toFixed(1)};
  }
  float lodKeep(float d) {
    float k = mix(1., ${spec.lod.farKeep.toFixed(3)}, smoothstep(${spec.lod.full.toFixed(1)}, ${spec.lod.thin.toFixed(1)}, d));
    return k * (1. - smoothstep(${spec.lod.fadeStart.toFixed(1)}, ${spec.lod.end.toFixed(1)}, d));
  }
`;
function densityKeep(d, keep, spec, density) {
  return keep * (density + (1 - density) * smooth(spec.lod.full, spec.lod.thin, d)) / GRASS_OVERSAMPLE;
}
function lodKeep(d, { lod }) {
  return (1 + (lod.farKeep - 1) * smooth(lod.full, lod.thin, d)) * (1 - smooth(lod.fadeStart, lod.end, d));
}

function sharedUniforms(spec) {
  return {
    dawnDir: { value: new T.Vector3(...spec.dawnDirection).normalize() },
    moonDir: { value: new T.Vector3(...spec.moonDirection).normalize() },
    windTime: { value: 0 },
    fogDensity: { value: spec.fogDensity },
    sunLevel: { value: spec.light?.sol ?? .25 },
    moonLevel: { value: spec.light?.luna ?? 1 },
    mistAmount: { value: spec.mist?.amount ?? 0 },
    mistTop: { value: spec.mist?.top ?? 0 },
    mistFalloff: { value: spec.mist?.falloff ?? 1 },
    mistStart: { value: spec.mist?.start ?? 0 },
    mistFull: { value: spec.mist?.full ?? 1 },
    mistWisp: { value: spec.mist?.wisp ?? 0 },
    mistColor: { value: new T.Vector3(...(spec.mist?.color ?? [.6, .6, .8])) },
    cloudStyle: { value: spec.clouds?.style ?? 4 },
    groundStyle: { value: spec.groundStyle ?? 1 },
    grassDensity: { value: spec.grass?.nearDensity ?? 1 },
  };
}

// ---------- Cielo ----------
function createSky(spec, uniforms) {
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { ...uniforms, moonRadius: { value: spec.moonRadius }, cloudCover: { value: spec.clouds?.cover ?? .07 } },
    vertexShader: `
      varying vec3 ray;
      void main() {
        ray = position;
        vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.);
        gl_Position = clip.xyww;
      }
    `,
    fragmentShader: `
      varying vec3 ray;
      uniform float moonRadius;
      uniform float cloudCover;
      ${common}
      float ridge(float a, float base, float f1, float f2, float f3, float off) {
        return base + .012*sin(a*f1+off) + .007*sin(a*f2+off*2.3) + .0035*sin(a*f3-off) + .0015*sin(a*71.+off*5.);
      }
      vec2 hash22(vec2 p) {
        vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
        q += dot(q, q.yzx + 33.33);
        return fract((q.xx + q.yz) * q.zy);
      }
      float worley(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float d = 8.;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 r = o + hash22(i + o) - f;
          d = min(d, dot(r, r));
        }
        return sqrt(d);
      }
      float fbm3(vec2 p) {
        float v = 0., a = .5;
        for (int i = 0; i < 3; i++) { v += a * noise2(p); p = mat2(1.6,1.2,-1.2,1.6) * p + 7.1; a *= .5; }
        return v / .875;
      }
      // Densidad de cúmulo en el plano de nubes: >0 dentro. Silueta grande (fbm deformado que hierve despacio)
      // y borde abombado de coliflor (Worley invertido); fine añade la segunda octava de bultos.
      float cumulus(vec2 P, bool fine) {
        float t = windTime;
        vec2 w = vec2(noise2(P * .16 + vec2(t * .008, 0.)), noise2(P * .16 + vec2(3.7, 1.3 - t * .01))) - .5;
        P += w * 2.2;
        float shape = fbm3(P * .17);
        float b = 1. - worley(P * .75 + vec2(0., t * .015));
        if (fine) b = b * .7 + (1. - worley(P * 1.9 + vec2(t * .03, 2.))) * .3;
        return shape - .66 + cloudCover + (b - .62) * .22;
      }
      ${cloudLightGLSL}
      float importedShape(vec3 d) {
        float e = d.y;
        if (cloudStyle < 3.5) {
          vec2 p = d.xz / (e + .21) * vec2(3.5, 5.9) + vec2(windTime * .012, 0.);
          return .62 * noise2(p) + .27 * noise2(p * 2.04 + 4.) + .11 * noise2(p * 4.17);
        }
        vec2 p = d.xz / max(.18, e + .18) + vec2(windTime * .008, windTime * .003);
        return sin(p.x * 2.1 + sin(p.y * 1.7)) * .36 + sin(p.y * 3.3 - p.x * .7) * .27 + sin(p.x * 6.1 + p.y * 4.3) * .08;
      }
      void main() {
        vec3 dir = normalize(ray);
        float e = dir.y;
        float az = atan(dir.x, -dir.z);
        vec3 haze = hazeColor(dir);
        float dm = dayMix();
        vec3 sky = mix(srgb(vec3(.22,.35,.70)), srgb(vec3(.09,.15,.42)), smoothstep(.12, .8, e)) * nightScale();
        vec3 daySky = mix(srgb(vec3(.62,.74,.90)), srgb(vec3(.20,.42,.82)), smoothstep(.02, .7, e)) * min(sunLevel, 1.2);
        sky = mix(sky, daySky, dm);
        sky = mix(haze * 1.08, sky, smoothstep(-.01, .22, e));

        // Resplandor del alba: lavanda y rosa pálido con poco sol; naranja cuando el sol ya asoma.
        float dawnAlign = max(dot(normalize(dir.xz + 1e-5), normalize(dawnDir.xz)), 0.);
        vec3 glow = mix(srgb(vec3(.80,.60,.74)), srgb(vec3(1.,.62,.42)), smoothstep(.3, .8, sunLevel));
        sky += glow * pow(dawnAlign, mix(8., 4., sunOn())) * exp(-max(e, 0.) * 11.) * sunLevel * 1.2 * (1. - dm * .6);

        // Horizonte encendido al ponerse el sol (estilo «Colina al amanecer»): melocotón cerca del sol,
        // malva lejos de él, y el azul de arriba se va oscureciendo hacia la noche.
        float warmth = pow(max(dot(dir, sunDir()), 0.), 9.);
        vec3 dusk = mix(srgb(vec3(.50,.36,.40)), srgb(vec3(1.,.55,.24)), warmth) * mix(.75, 1.1, warmth);
        sky = mix(sky, dusk, sunset() * (1. - smoothstep(-.02, .42, e)) * .9);
        // Sol: disco y halo solo cuando ha salido.
        float sa = acos(clamp(dot(dir, sunDir()), -1., 1.));
        float sunUp = smoothstep(.27, .4, sunLevel);
        sky += sunColor() * (exp(-sa * 14.) * .35 + exp(-sa * 60.) * .8) * sunUp;
        sky = mix(sky, srgb(vec3(1.,.97,.9)) * 2.2, (1. - smoothstep(.022, .026, sa)) * sunUp);

        // Halo amplio de la luna (se apaga con ella y casi desaparece de día).
        float m = clamp(dot(dir, moonDir), -1., 1.);
        float ang = acos(m);
        sky += srgb(vec3(.86,.86,.82)) * (exp(-ang * 8.) * .32 + exp(-ang * 28.) * .55) * moonLevel * (1. - dm * .85);

        // Estrellas lejos de la luna y del alba; más vivas cuanto más oscura la noche.
        if (e > .15) {
          vec3 cell = floor(dir * 300.);
          float s = hash(cell.xy + cell.z * 17.13);
          float twinkle = .6 + .4 * sin(windTime * 2.3 + s * 60.);
          float dark = (1. - dm) * (1. - sunOn() * .7) * mix(2.2, 1., clamp(moonLevel, 0., 1.));
          sky += vec3(.6,.65,.85) * step(.9972, s) * smoothstep(.15, .5, e) * smoothstep(.3, 1., ang * (1.5 - clamp(moonLevel, 0., 1.))) * .22 * twinkle * dark;
        }

        // Luna llena con relieve: mares de borde recortado, cráteres con anillo claro y fondo oscuro,
        // grano fino, rayos tenues de un cráter joven y una corona ceñida además del halo amplio.
        vec3 right = normalize(cross(moonDir, vec3(0., 1., 0.)));
        vec3 up = cross(right, moonDir);
        vec2 q = vec2(dot(dir, right), dot(dir, up)) / moonRadius;
        float r = length(q);
        float disk = (1. - smoothstep(.97, 1., r)) * step(0., m);
        float moonOn = mix(.28, 1., clamp(moonLevel, 0., 1.));
        sky += srgb(vec3(.86,.89,1.)) * exp(-max(r - 1., 0.) * 2.8) * (1. - disk) * step(0., m) * .5 * moonLevel * (1. - dm * .9);
        if (r < 1.05 && m > 0.) {
          // Mares en su sitio (cara visible desde el hemisferio norte), con orillas irregulares.
          float warp = (fbm(q * 3.1 + 1.3) - .5) * .55;
          float maria = 0.;
          maria = max(maria, smoothstep(1., .72, length((q - vec2(-.30, .42)) / vec2(.30, .26)) + warp)); // Imbrium
          maria = max(maria, smoothstep(1., .72, length((q - vec2(.16, .40)) / vec2(.17, .16)) + warp)); // Serenitatis
          maria = max(maria, smoothstep(1., .72, length((q - vec2(.33, .12)) / vec2(.21, .17)) + warp)); // Tranquillitatis
          maria = max(maria, smoothstep(1., .72, length((q - vec2(.70, .30)) / vec2(.11, .13)) + warp)); // Crisium
          maria = max(maria, smoothstep(1., .72, length((q - vec2(.55, -.12)) / vec2(.13, .19)) + warp)); // Fecunditatis
          maria = max(maria, smoothstep(1., .72, length((q - vec2(.36, -.30)) / vec2(.10, .10)) + warp)); // Nectaris
          maria = max(maria, smoothstep(1., .72, length((q - vec2(-.62, .02)) / vec2(.26, .42)) + warp)); // Procellarum
          maria = max(maria, smoothstep(1., .72, length((q - vec2(-.22, -.34)) / vec2(.17, .14)) + warp)); // Nubium
          maria = max(maria, smoothstep(1., .72, length((q - vec2(-.02, .74)) / vec2(.42, .07)) + warp)); // Frigoris
          maria *= .65 + .35 * fbm(q * 5.3 + 8.);
          float grain = noise2(q * 15.) * .55 + noise2(q * 34. + 2.) * .45;
          float crater = 0.;
          for (int k = 0; k < 2; k++) {
            float s = k == 0 ? 3.2 : 6.8;
            vec2 g = q * s, id = floor(g), f = fract(g);
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 cid = id + vec2(float(i), float(j)) + float(k) * 13.1;
              if (hash(cid) < .5) continue;
              vec2 c = vec2(float(i), float(j)) + .15 + .7 * vec2(hash(cid + 3.1), hash(cid + 7.7)) - f;
              float dd = length(c) / (.1 + .22 * hash(cid + 11.3));
              crater += (smoothstep(1.2, .95, dd) * smoothstep(.7, .95, dd) * .55 - smoothstep(.9, .15, dd) * .3) * (k == 0 ? 1. : .6);
            }
          }
          // Tycho (sur) con sus rayos y Copérnico, brillante dentro del océano.
          vec2 ty = q - vec2(-.12, -.72), co = q - vec2(-.34, .13);
          float rays = pow(noise2(vec2(atan(ty.y, ty.x) * 5.5, 1.3)), 4.) * exp(-length(ty) * 2.2) * .45 + exp(-length(ty) * 16.) * .35 + exp(-length(co) * 18.) * .25;
          // Sin pasar de 1: si se satura, los mares y cráteres desaparecen y el disco vuelve a verse plano.
          vec3 high = srgb(vec3(.97,.97,.99)), sea = srgb(vec3(.66,.68,.77));
          vec3 moonCol = mix(high, sea, maria * .8) * (1. + crater * .3 + (grain - .5) * .16) + high * rays;
          moonCol *= (.88 + .12 * sqrt(max(1. - r * r, 0.))) * .98 * moonOn;
          // De día, pálida y casi transparente.
          sky = mix(sky, moonCol, disk * (1. - dm * .7));
        }

        // Nubes: cuatro estilos que se eligen en Opciones › Escena › Nubes (uniform cloudStyle).
        //  0 · Jirones originales: tres octavas de ruido muy alargadas (la primera versión).
        //  1 · Cúmulos procedurales: silueta fbm + borde de coliflor Worley, autosombra y jirones altos.
        //  2 · Tarjetas NPR: aquí solo los jirones altos; los cúmulos son tarjetas pintadas (createCloudCards).
        //  3 · Sin nubes.
        if (cloudStyle < .5 && e > .02) {
          vec2 p = dir.xz / (e + .22) * vec2(2.7, 7.2) + vec2(windTime * .01, 0.);
          float wisps = .65 * noise2(p) + .24 * noise2(p * 2.19) + .11 * noise2(p * 4.33);
          vec2 pm = (dir.xz + moonDir.xz * .02) / (e + .22) * vec2(2.7, 7.2) + vec2(windTime * .01, 0.);
          float wisps2 = .65 * noise2(pm) + .24 * noise2(pm * 2.19) + .11 * noise2(pm * 4.33);
          float clouds = smoothstep(.46, .77, wisps) * smoothstep(.02, .10, e) * smoothstep(.06, .22, ang);
          float lit = clamp((wisps - wisps2) * 8. + .55, 0., 1.);
          float cWarm = pow(max(dot(dir, sunDir()), 0.), 4.);
          vec3 cNight = (mix(srgb(vec3(.20,.19,.36)), srgb(vec3(.58,.56,.80)), lit) + srgb(vec3(.9,.9,1.)) * exp(-ang * 2.6) * lit * .35 * moonLevel) * nightScale();
          vec3 cDay = mix(srgb(vec3(.62,.66,.76)), srgb(vec3(.97,.96,.97)), lit) * min(sunLevel, 1.2);
          vec3 cloud = mix(cNight, cDay, dm);
          cloud = mix(cloud, mix(srgb(vec3(.55,.30,.42)), srgb(vec3(.94,.50,.34)), cWarm), sunset() * (.45 + .55 * cWarm));
          sky = mix(sky, cloud, clouds * .69);
        } else if (cloudStyle < 2.5 && e > 0.) {
          CloudLight cl = cloudLight(dir);
          // Jirones altos que derivan y se deshilachan.
          vec2 wp = dir.xz / (e + .2) * vec2(2.4, 6.4) + vec2(windTime * .022, windTime * .004);
          vec2 ww = vec2(noise2(wp * .45 + windTime * .006), noise2(wp * .45 + 7.3)) - .5;
          wp += ww * vec2(1.4, .5);
          float wisps = .62 * noise2(wp) + .26 * noise2(wp * 2.31 + 1.7) + .12 * noise2(wp * 5.1 + 3.1);
          vec2 wq = wp + cl.toward * .08;
          float wl = .62 * noise2(wq) + .26 * noise2(wq * 2.31 + 1.7) + .12 * noise2(wq * 5.1 + 3.1);
          float wa = smoothstep(.52, .74, wisps) * smoothstep(.03, .14, e) * (cloudStyle > 1.5 ? .45 : .62);
          float wk = clamp(.55 + (wisps - wl) * 7., 0., 1.);
          sky = mix(sky, mix(shadeCloud(cl, wk, .2, dir), haze, exp(-e * 9.) * .55), wa);
          if (cloudStyle < 1.5) {
            vec2 drift = vec2(windTime * .045, windTime * .016);
            vec2 P = dir.xz / (e + .1) * 4. + drift;
            float dens = cumulus(P, true);
            float aa = max(fwidth(dens) * 1.2, .006);
            float alpha = smoothstep(-aa, aa + .05, dens) * smoothstep(.015, .1, e);
            if (alpha > .001) {
              vec2 rh = normalize(dir.xz + 1e-5);
              float base = smoothstep(.0, .2, cumulus(P + rh * .6, false) - cumulus(P - rh * .6, false));
              float acc = 0.;
              for (int i = 1; i <= 4; i++) acc += max(cumulus(P + cl.toward * .35 * float(i), false), 0.);
              float occl = exp(-acc * 2.2);
              float th = smoothstep(0., .25, dens);
              float k = occl * .75 + (1. - th) * .3 + (cl.below * .55 - cl.above * .35) * base;
              float cRim = (1. - smoothstep(0., .1, dens)) * (.4 + .6 * cl.glow);
              vec3 cc = mix(shadeCloud(cl, clamp(k, 0., 1.), cRim, dir), haze, exp(-e * 10.) * .5);
              sky = mix(sky, cc, alpha);
            }
          }
        }
        // Formas importadas (3 Pradera antes del alba, 5 Zelda, 6 Trigun) con la luz de esta colina: se ilumina
        // la orilla que mira a la luna o al sol, comparando la forma con la de un punto desplazado hacia ella.
        if ((abs(cloudStyle - 3.) < .5 || abs(cloudStyle - 5.) < .5 || abs(cloudStyle - 6.) < .5) && e > .016) {
          CloudLight cl = cloudLight(dir);
          vec3 d2 = normalize(dir + vec3(cl.toward.x, 0., cl.toward.y) * .025);
          float s1 = importedShape(dir), s2 = importedShape(d2);
          float a;
          if (cloudStyle < 3.5) a = smoothstep(.46, .76, s1) * smoothstep(.016, .075, e) * .69;
          else a = smoothstep(.26, .52, s1) * smoothstep(.02, .15, e) * (1. - smoothstep(.65, .95, e)) * (cloudStyle < 5.5 ? .48 : .22) * 1.6;
          float k = clamp(.55 + (s1 - s2) * (cloudStyle < 3.5 ? 8. : 3.), 0., 1.);
          vec3 cc = mix(shadeCloud(cl, k, (1. - smoothstep(.0, .5, a)) * cl.glow, dir), haze, exp(-e * 9.) * .5);
          sky = mix(sky, cc, clamp(a, 0., 1.));
        }
        // Sierras lejanas a la derecha, veladas por la bruma.
        float edge = max(fwidth(e), .0004);
        float r1 = ridge(az, .030, 3.1, 7.7, 19., .4);
        float r2 = ridge(az, .012, 4.3, 11.2, 27., 2.1);
        float amb = ambientScale();
        // Al ponerse el sol, las sierras se tiñen de ocre del lado del sol (como en la «Colina al amanecer»).
        vec3 farRidge = mix(srgb(vec3(.26,.31,.58)) * amb, mix(srgb(vec3(.30,.27,.36)), srgb(vec3(.61,.37,.24)), warmth), sunset());
        vec3 nearRidge = mix(srgb(vec3(.17,.23,.48)) * amb, mix(srgb(vec3(.17,.17,.24)), srgb(vec3(.38,.28,.23)), warmth), sunset());
        sky = mix(sky, mix(haze, farRidge, .42 + .3 * sunset()), 1. - smoothstep(r1 - edge, r1 + edge, e));
        sky = mix(sky, haze, exp(-abs(e - (r1 - .012)) * 110.) * .5);
        sky = mix(sky, mix(haze, nearRidge, .55 + .3 * sunset()), 1. - smoothstep(r2 - edge, r2 + edge, e));
        sky = mix(sky, haze, exp(-abs(e - (r2 - .01)) * 100.) * .6);
        sky = mix(sky, haze, 1. - smoothstep(-.05, -.01, e));
        // Banda de bruma lila sobre el horizonte: funde la cresta con el cielo como en la referencia.
        sky = mix(sky, mistLight(dir), mistAmount * .62 * exp(-max(e + .01, 0.) * 13.));
        gl_FragColor = vec4(sky, 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new T.Mesh(new T.SphereGeometry(1000, 48, 24), material);
  sky.name = 'Cielo antes del alba';
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  sky.raycast = () => {};
  return sky;
}

// ---------- Nubes NPR en tarjetas ----------
// Atlas de 8 nubes «pintadas» generado al cargar (sin descargas): cada nube es un racimo de bultos esféricos
// sobre una base casi plana, con orillas deshilachadas. Se guarda la normal del bulto delantero (RG), el grosor (B)
// y la cobertura (A); el shader las ilumina con la luna o el sol, así cambian con la luz del Estudio.
const ATLAS = { cols: 2, rows: 4, w: 320, h: 160 };
function createCloudAtlas(seed = 4417) {
  const W = ATLAS.cols * ATLAS.w, H = ATLAS.rows * ATLAS.h;
  const data = new Uint8Array(W * H * 4);
  for (let v = 0; v < ATLAS.cols * ATLAS.rows; v++) {
    const random = rng(seed + v * 977);
    const flat = v >= 5; // las tres últimas: estratocúmulos bajos y alargados
    const peak = .55 + random() * .9, puffs = [];
    const count = flat ? 26 : 18 + Math.floor(random() * 8);
    for (let i = 0; i < count; i++) {
      const x = .14 + random() * 1.72;
      const hump = Math.max(0, 1 - ((x - peak) / (flat ? 1.1 : .75)) ** 2);
      const r = (flat ? .07 + .07 * random() : .08 + .17 * hump * (.6 + .4 * random())) * (.75 + .25 * hump);
      const y = .2 + r * .55 + random() * hump * (flat ? .08 : .32);
      puffs.push({ x, y, r, rx: r * (flat ? 1.7 : 1.08), z: random() * .05 + y * .2 });
    }
    // Colas de jirón a los lados de la base.
    for (let i = 0; i < 4; i++) puffs.push({ x: .15 + random() * 1.7, y: .2 + random() * .04, r: .03, rx: .18 + random() * .12, z: -.2, tail: true });
    const ox = (v % ATLAS.cols) * ATLAS.w, oy = Math.floor(v / ATLAS.cols) * ATLAS.h;
    for (let py = 0; py < ATLAS.h; py++) for (let px = 0; px < ATLAS.w; px++) {
      const u = px / ATLAS.h, y = 1 - py / ATLAS.h; // u en [0,2], y hacia arriba
      let field = 0, best = -1e9, nx = 0, ny = 0, thick = 0;
      for (const p of puffs) {
        const dx = (u - p.x) / p.rx, dy = (y - p.y) / p.r, d2 = dx * dx + dy * dy;
        field += Math.exp(-d2 * 1.6) * (p.tail ? .55 : 1);
        if (d2 < 1 && !p.tail) {
          const h = Math.sqrt(1 - d2) * p.r + p.z;
          if (h > best) { best = h; nx = dx; ny = dy; }
          thick = Math.max(thick, Math.sqrt(1 - d2) * p.r);
        }
      }
      // Orilla deshilachada (dos octavas) y base recortada con un leve temblor.
      const n = valueNoise(u * 9 + v * 13, y * 9) * .6 + valueNoise(u * 23 + 5, y * 23 + v) * .4;
      const base = .2 + (valueNoise(u * 6 + v, 3) - .5) * .05;
      let a = smooth(.42, .62, field + (n - .5) * .32) * smooth(base - .05, base + .05, y);
      // Fundido en los bordes de la celda.
      a *= smooth(0, .08, u) * smooth(2, 1.92, u) * smooth(1, .9, y);
      if (best < -1e8) { nx = (u - peak) * .3; ny = -.4; }
      const i = ((oy + py) * W + ox + px) * 4;
      data[i] = Math.round((Math.max(-1, Math.min(1, nx)) * .5 + .5) * 255);
      data[i + 1] = Math.round((Math.max(-1, Math.min(1, ny)) * .5 + .5) * 255);
      data[i + 2] = Math.round(Math.min(1, thick / .2) * 255);
      data[i + 3] = Math.round(a * 255);
    }
  }
  const texture = new T.DataTexture(data, W, H, T.RGBAFormat);
  texture.flipY = false;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createCloudCards(spec, uniforms) {
  const random = rng(spec.clouds?.seed ?? 8123);
  const n = spec.clouds?.cards ?? 26;
  const cards = [];
  for (let i = 0; i < n; i++) {
    // Más nubes bajas (cerca del horizonte se ven pequeñas y achatadas) y menos en lo alto.
    const el = .07 + Math.pow(random(), 1.7) * .5;
    const w = (.16 + random() * .22) * (1.15 - el * .9);
    cards.push({ az: random() * Math.PI * 2, el, w, h: w * (.42 + el * .55), cell: Math.floor(random() * ATLAS.cols * ATLAS.rows), seed: random(), speed: .6 + random() * .8 });
  }
  cards.sort((a, b) => a.el - b.el); // las lejanas (bajas) se pintan primero
  const geo = new T.InstancedBufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('card', new T.InstancedBufferAttribute(new Float32Array(cards.flatMap(c => [c.az, c.el, c.w, c.h])), 4));
  geo.setAttribute('cardInfo', new T.InstancedBufferAttribute(new Float32Array(cards.flatMap(c => [c.cell, c.seed, c.speed])), 3));
  geo.instanceCount = n;
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { ...uniforms, atlas: { value: createCloudAtlas() }, cardMode: { value: 0 }, ghibliReady: { value: 0 },
      ghibli0: { value: null }, ghibli1: { value: null }, ghibli2: { value: null } },
    vertexShader: `
      attribute vec4 card;
      attribute vec3 cardInfo;
      uniform float windTime;
      uniform float cardMode;
      varying vec2 vUv;
      varying vec3 vDir, vRight, vUp, vCenter;
      varying vec2 vInfo;
      void main() {
        float az = card.x + windTime * .0035 * cardInfo.z;
        vec3 c = normalize(vec3(sin(az) * cos(card.y), sin(card.y), -cos(az) * cos(card.y)));
        vec3 right = normalize(cross(c, vec3(0., 1., 0.)));
        vec3 up = cross(right, c);
        // Respira despacio: cada nube crece y mengua un poco a su ritmo.
        float breathe = 1. + .05 * sin(windTime * .05 * cardInfo.z + cardInfo.y * 30.);
        // Ghibli: 3 pinturas de 768x538, más grandes y solo la mitad de las tarjetas (para que no se repitan).
        vec2 halfSize = cardMode > .5 ? vec2(card.z * 1.25, card.z * 1.25 / 1.427) : card.zw;
        if (cardMode > .5 && cardInfo.y > .55) halfSize = vec2(0.);
        vec3 d = c + right * position.x * halfSize.x * breathe + up * position.y * halfSize.y * breathe;
        vUv = position.xy * .5 + .5;
        vDir = d; vRight = right; vUp = up; vCenter = c; vInfo = cardInfo.xy;
        gl_Position = (projectionMatrix * vec4(mat3(viewMatrix) * d * 500., 1.)).xyww;
      }
    `,
    fragmentShader: `
      uniform sampler2D atlas, ghibli0, ghibli1, ghibli2;
      uniform float cardMode, ghibliReady;
      varying vec2 vUv;
      varying vec3 vDir, vRight, vUp, vCenter;
      varying vec2 vInfo;
      ${common}
      ${cloudLightGLSL}
      void main() {
        vec3 dir = normalize(vDir);
        float e = dir.y;
        float cell = floor(vInfo.x + .5);
        // Las orillas hierven: el muestreo se deforma con ruido que avanza con el tiempo.
        vec2 warp = vec2(noise2(vUv * 5. + vec2(windTime * .04, vInfo.y * 20.)), noise2(vUv * 5. + vec2(7.1, windTime * .035))) - .5;
        vec2 uv = clamp(vUv + warp * .022, .004, .996);
        vec2 cellUv = (vec2(mod(cell, ${ATLAS.cols}.), floor(cell / ${ATLAS.cols}.)) + vec2(uv.x, 1. - uv.y)) / vec2(${ATLAS.cols}., ${ATLAS.rows}.);
        CloudLight cl = cloudLight(dir);
        float dm = dayMix();
        float sunW = clamp(sunOn() * 1.4 + dm, 0., 1.);
        vec3 L = normalize(mix(moonDir, sunDir(), sunW));
        // Luz en el espacio de la tarjeta (x derecha, y arriba, z hacia quien mira).
        vec3 Ls = normalize(vec3(dot(L, vRight), dot(L, vUp), -dot(L, vCenter)) + vec3(0., 0., .35));
        float belly = 1. - smoothstep(.15, .5, uv.y);
        if (cardMode > .5) {
          // Nube pintada de Studio Ghibli reiluminada: su pigmento da los tonos, la paleta la pone la luz de la colina.
          // Se refleja para que su lado claro mire a la luna o al sol.
          vec2 g = vec2(Ls.x < 0. ? 1. - uv.x : uv.x, uv.y);
          float which = mod(cell, 3.);
          vec4 paint = which < .5 ? texture2D(ghibli0, g) : which < 1.5 ? texture2D(ghibli1, g) : texture2D(ghibli2, g);
          float ga = paint.a * ghibliReady;
          if (ga < .003) discard;
          float pigment = dot(paint.rgb, vec3(.2126, .7152, .0722));
          float gk = smoothstep(.14, .55, pigment) * .85 + .15 * max(Ls.y, 0.) + (cl.below * .5 - cl.above * .2) * belly;
          float grim = (1. - smoothstep(.3, .9, paint.a)) * (.2 + 1.1 * cl.glow);
          vec3 gcol = shadeCloud(cl, clamp(gk, 0., 1.), grim, dir);
          gcol = mix(gcol, hazeColor(dir), exp(-max(e, 0.) * 11.) * .5);
          gl_FragColor = vec4(gcol, ga * smoothstep(.0, .06, e));
          #include <colorspace_fragment>
          return;
        }
        vec4 s = texture2D(atlas, cellUv);
        float erode = (noise2(vUv * vec2(9., 5.) + vec2(windTime * .02, vInfo.y * 50.)) - .5) * .35 * (1. - s.b);
        float alpha = smoothstep(.12, .55, s.a + erode);
        if (alpha < .003) discard;
        vec3 nn = vec3(s.r * 2. - 1., s.g * 2. - 1., 0.);
        nn.z = sqrt(max(1. - dot(nn.xy, nn.xy), .05));
        nn = normalize(nn);
        float k = dot(nn, Ls) * .5 + .5;
        // Panza: abajo más oscura si la luz viene de arriba; encendida si el sol aún está bajo el horizonte.
        k += (cl.below * .6 - cl.above * .3) * belly;
        k -= s.b * .18 * cl.above;
        // Ribete plateado: orillas finas a contraluz de la luna o del sol.
        float rim = (1. - smoothstep(.0, .5, s.b)) * (1. - smoothstep(.3, .9, s.a)) * (.25 + 1.2 * cl.glow);
        vec3 col = shadeCloud(cl, clamp(k, 0., 1.), rim, dir);
        col = mix(col, hazeColor(dir), exp(-max(e, 0.) * 11.) * .5);
        gl_FragColor = vec4(col, alpha * smoothstep(.0, .06, e) * .97);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new T.Mesh(geo, material);
  mesh.name = 'Nubes NPR';
  mesh.frustumCulled = false;
  mesh.renderOrder = -90;
  mesh.raycast = () => {};
  return mesh;
}

// Estilos de nubes del selector. Los «importados» repiten la forma de otros escenarios y toman la luz de esta colina.
export const CLOUD_STYLES = Object.freeze([
  { id: 0, label: 'Jirones · Colina del Quijote (original)' },
  { id: 1, label: 'Cúmulos procedurales' },
  { id: 2, label: 'Tarjetas NPR generadas' },
  { id: 3, label: 'Pradera antes del alba' },
  { id: 4, label: 'Studio Ghibli (nubes pintadas)' },
  { id: 5, label: 'Zelda' },
  { id: 6, label: 'Trigun' },
  { id: 7, label: 'Sin nubes' },
]);
const GHIBLI_CLOUDS = ['nube-ghibli-alta.png', 'nube-ghibli-compacta.png', 'nube-ghibli-alargada.png'];
function showCloudCards(cards, style) {
  const u = cards.material.uniforms;
  cards.visible = style === 2 || style === 4;
  u.cardMode.value = style === 4 ? 1 : 0;
  if (style !== 4 || u.ghibli0.value || typeof document === 'undefined') return; // sin navegador (tests): nada que cargar
  // Solo se descargan si se eligen (unos 0,8 MB).
  let loaded = 0;
  GHIBLI_CLOUDS.forEach((file, i) => {
    const texture = new T.TextureLoader().load(new URL(`./Estilos/StudioGhibli/assets/${file}?v=png-generado-v1`, import.meta.url).href, () => {
      if (++loaded === GHIBLI_CLOUDS.length) u.ghibliReady.value = 1;
    });
    texture.colorSpace = T.SRGBColorSpace;
    u['ghibli' + i].value = texture;
  });
}

// ---------- Terreno ----------
function createGround(spec, uniforms) {
  const geometry = new T.PlaneGeometry(spec.radius * 2, spec.radius * 2, spec.segments, spec.segments);
  geometry.rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) points.setY(i, relief(points.getX(i), points.getZ(i), spec));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new T.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 p;
      varying vec3 n;
      void main() {
        p = (modelMatrix * vec4(position, 1.)).xyz;
        n = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 p;
      varying vec3 n;
      ${common}
      ${lodGLSL(spec)}
      void main() {
        float d = length(p - cameraPosition);
        vec3 nn = normalize(n);
        float tint = noise2(p.xz * .9);
        vec3 mid = turfColor(p.xz, tint);
        // Cerca: sombra entre matas. Lejos: lo que se ve de la pradera rasante (puntas iluminadas).
        float covered = clamp((1. - lodKeep(d)) * 1.15, 0., 1.);
        // Entre las matas no se ve tierra sino la sombra verde de la propia hierba (fotograma 9).
        vec3 col;
        float nearDark;
        if (groundStyle < .5) {
          // Original: entre las matas, la sombra verde casi negra de la propia hierba.
          vec3 soil = mix(srgb(vec3(.015,.055,.025)), mid * .62, .58);
          vec3 field = mix(mid, tipColor(p.xz, tint), .42) * (.9 + .2 * noise2(p.xz * 2.3));
          col = mix(soil, field, covered);
          nearDark = .72;
        } else {
          // Césped corto pintado entre las matas.
          vec3 turf = shortGrass(p.xz, tint, clamp(length(fwidth(p.xz * 4.2)) * 1.2, 0., 1.));
          vec3 field = mix(turf, mix(mid, tipColor(p.xz, tint), .42), .45) * (.92 + .16 * noise2(p.xz * 2.3));
          col = mix(turf * .92, field, covered);
          nearDark = .9;
        }
        col += srgb(vec3(.12,.16,.14)) * gustAt(p.xz) * .3 * covered;
        vec3 viewDir = normalize(p - cameraPosition);
        col *= mix(nearDark, 1., covered) * nightLight(nn, viewDir, .5 * covered);
        gl_FragColor = vec4(applyFog(col, p), 1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const ground = new T.Mesh(geometry, material);
  ground.name = 'Suelo de la colina';
  return ground;
}

// ---------- Césped ----------
function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Mata de hojas anchas, puntiagudas y curvadas, abiertas en abanico (en metros, escala 1 ≈ 40 cm).
// fold: sección en V con nervio central (cerca); sin fold, hoja plana (lejos).
function createClumpGeometry(leaves, segments, fold, seed, width = 1) {
  const random = rng(seed);
  const pos = [], nor = [], leafT = [], ridge = [], tint = [], idx = [];
  const across = fold ? 3 : 2;
  const n = new T.Vector3(), side = new T.Vector3(), tmp = new T.Vector3();
  for (let l = 0; l < leaves; l++) {
    const yaw = l / leaves * Math.PI * 2 + (random() - .5) * .9;
    const r0 = .01 + random() * .07;
    const tilt = .22 + random() * .8;
    const droop = Math.min(.55 + random() * .9, 1.75 - tilt);
    const len = .28 + random() * .3;
    const W = (.014 + random() * .016) * width;
    const bt = random();
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    side.set(-sy, 0, cy);
    let x = cy * r0, y = 0, z = sy * r0;
    const start = pos.length / 3;
    const ds = len / segments;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const a = tilt + droop * t * t;
      const tx = Math.sin(a) * cy, ty = Math.cos(a), tz = Math.sin(a) * sy;
      n.set(-side.z * ty, side.z * tx - side.x * tz, side.x * ty).normalize();
      if (s === segments) {
        pos.push(x, y, z); nor.push(n.x, n.y, n.z); leafT.push(1); ridge.push(.5); tint.push(bt);
        break;
      }
      const w = W * Math.pow(Math.sin(Math.PI * (.15 + .85 * t)), .7);
      const verts = fold ? [-1, 0, 1] : [-1, 1];
      for (const k of verts) {
        const lift = k === 0 ? w * .35 : 0;
        pos.push(x + side.x * w * k + n.x * lift, y + n.y * lift, z + side.z * w * k + n.z * lift);
        tmp.copy(n).addScaledVector(side, k * (fold ? .55 : .3)).normalize();
        nor.push(tmp.x, tmp.y, tmp.z);
        leafT.push(t);
        ridge.push(k === 0 ? 1 : 0);
        tint.push(bt);
      }
      x += tx * ds; y += ty * ds; z += tz * ds;
    }
    const tip = start + segments * across;
    for (let s = 0; s < segments; s++) for (let k = 0; k < across - 1; k++) {
      const a = start + s * across + k, b = a + 1;
      if (s === segments - 1) idx.push(a, b, tip);
      else idx.push(a, b, a + across, a + across, b, b + across);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('leafT', new T.Float32BufferAttribute(leafT, 1));
  g.setAttribute('ridge', new T.Float32BufferAttribute(ridge, 1));
  g.setAttribute('bladeTint', new T.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  return g;
}

function flowerGeometry(pos, col, idx, height) {
  const g = new T.BufferGeometry();
  const count = pos.length / 3;
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(new Array(count).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setAttribute('leafT', new T.Float32BufferAttribute(Array.from({ length: count }, (_, i) => Math.min(1, pos[i * 3 + 1] / height)), 1));
  g.setAttribute('ridge', new T.Float32BufferAttribute(new Array(count).fill(.5), 1));
  g.setAttribute('bladeTint', new T.Float32BufferAttribute(new Array(count).fill(.5), 1));
  g.setIndex(idx);
  return g;
}
// Espiga de altramuz violeta.
function createLupineGeometry() {
  const pos = [], col = [], idx = [];
  const quad = (y, w, h, ang, c) => {
    const s = pos.length / 3, dx = Math.cos(ang) * w / 2, dz = Math.sin(ang) * w / 2;
    pos.push(-dx, y, -dz, dx, y, dz, -dx, y + h, -dz, dx, y + h, dz);
    for (let i = 0; i < 4; i++) col.push(...c);
    idx.push(s, s + 1, s + 2, s + 2, s + 1, s + 3);
  };
  quad(0, .01, .4, 0, [.12, .28, .13]);
  quad(0, .01, .4, Math.PI / 2, [.12, .28, .13]);
  for (let i = 0; i < 6; i++) {
    const c = [.40 + i * .03, .30 + i * .025, .70 + i * .03];
    quad(.22 + i * .035, .055 * (1 - i / 7), .04, i * .9, c);
    quad(.22 + i * .035, .055 * (1 - i / 7), .04, i * .9 + Math.PI / 2, c);
  }
  return flowerGeometry(pos, col, idx, .43);
}
// Florecilla de pétalos (el color se varía por instancia en el shader).
function createDaisyGeometry() {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(...c); return pos.length / 3 - 1; };
  const stem = [.12, .28, .13];
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * .005, dz = Math.sin(a) * .005;
    const s = push(-dx, 0, -dz, stem); push(dx, 0, dz, stem); push(-dx, .17, -dz, stem); push(dx, .17, dz, stem);
    idx.push(s, s + 1, s + 2, s + 2, s + 1, s + 3);
  }
  const center = push(0, .182, 0, [.5, .45, .2]);
  const petals = 8;
  for (let i = 0; i < petals; i++) {
    const a = i / petals * Math.PI * 2, a2 = (i + .5) / petals * Math.PI * 2, a3 = (i + 1) / petals * Math.PI * 2;
    const p1 = push(Math.cos(a) * .009, .18, Math.sin(a) * .009, [1, 1, 1]);
    const p2 = push(Math.cos(a2) * .032, .174, Math.sin(a2) * .032, [1, 1, 1]);
    const p3 = push(Math.cos(a3) * .009, .18, Math.sin(a3) * .009, [1, 1, 1]);
    idx.push(p1, p2, p3, center, p1, p3);
  }
  return flowerGeometry(pos, col, idx, .19);
}

function createVegetationMaterial(spec, uniforms, flower = false) {
  return new T.ShaderMaterial({
    side: T.DoubleSide,
    vertexColors: flower,
    defines: flower ? { FLOWER: 1 } : {},
    uniforms,
    vertexShader: `
      attribute float leafT;
      attribute float ridge;
      attribute float bladeTint;
      attribute float instanceRank;
      attribute float instanceTint;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vRoot;
      varying float vT;
      varying float vRidge;
      varying float vTint;
      varying float vInstance;
      varying float vGust;
      #ifdef FLOWER
        varying vec3 vColor;
      #endif
      ${common}
      ${lodGLSL(spec)}
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec3 root = m[3].xyz;
        float dist = distance(root, cameraPosition);
        float keep = lodKeep(dist);
        // Reducción progresiva de densidad: cada mata se encoge y desaparece según su rango.
        float shown = densityKeep(dist, keep);
        float vis = smoothstep(shown, shown - .035, instanceRank);
        float grow = 1. + .5 * (1. - keep);
        vec3 world = (m * vec4(position * vis * grow, 1.)).xyz;
        float s = length(m[0].xyz);
        float gust = gustAt(root.xz);
        float flutter = sin(windTime * (2.1 + instanceTint * 1.6) + instanceTint * 40. + root.x * 1.7 + bladeTint * 9.);
        vec2 sway = windDir * (.05 + .2 * gust) + vec2(-windDir.y, windDir.x) * flutter * .045 + windDir * flutter * .03;
        float bend = leafT * leafT * s;
        world.xz += sway * bend;
        world.y -= dot(sway, sway) * bend * 1.4;
        vWorld = world;
        vRoot = root;
        vNormal = normalize(mat3(m) * normal);
        vT = leafT;
        vRidge = ridge;
        vTint = fract(instanceTint + bladeTint * .37);
        vInstance = instanceTint;
        vGust = gust;
        #ifdef FLOWER
          vColor = color;
        #endif
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.);
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vRoot;
      varying float vT;
      varying float vRidge;
      varying float vTint;
      varying float vInstance;
      varying float vGust;
      #ifdef FLOWER
        varying vec3 vColor;
      #endif
      ${common}
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1. : -1.);
        vec3 viewDir = normalize(vWorld - cameraPosition);
        float t = clamp(vT, 0., 1.);
        #ifdef FLOWER
          vec3 col = vColor;
          if (col.r > .9) col = vInstance < .55 ? vec3(.97,.96,.98) : vInstance < .82 ? vec3(.95,.62,.86) : vec3(.98,.86,.32);
          col = srgb(col);
          vec3 lit = col * nightLight(normalize(vec3(n.x, abs(n.y) + .3, n.z)), viewDir, t) * .85;
        #else
          vec3 mid = turfColor(vRoot.xz, vTint);
          vec3 tip = tipColor(vRoot.xz, vTint);
          vec3 col = mix(groundStyle < .5 ? srgb(vec3(.03,.085,.045)) : mid * .55, mid, smoothstep(0., .4, t));
          col = mix(col, tip, smoothstep(.35, 1., t) * (.55 + .45 * vInstance));
          col *= .82 + .3 * vRidge;
          col += srgb(vec3(.12,.16,.14)) * vGust * t * t * .7;
          vec3 lit = col * nightLight(n, viewDir, t);
          // Brillo satinado de la luna sobre las hojas.
          float gloss = pow(max(dot(reflect(viewDir, n), moonDir), 0.), 18.);
          lit += srgb(vec3(.62,.70,.62)) * gloss * t * .22 * moonLevel * (1. - dayMix());
        #endif
        gl_FragColor = vec4(applyFog(lit, vWorld), 1.);
        #include <colorspace_fragment>
      }
    `,
  });
}

function densityAt(x, z) {
  // Manchas más espesas y más ralas, nunca calvas.
  const a = valueNoise(x * .07 + 31, z * .07 - 12), b = valueNoise(x * .23 - 4, z * .23 + 8);
  return .6 + .3 * a + .2 * b;
}

class GrassField extends T.Group {
  constructor(spec, uniforms) {
    super();
    this.name = 'Césped';
    this.spec = spec;
    const g = spec.grass;
    this.high = createClumpGeometry(g.leaves, g.segments, true, 9137, g.width ?? 1);
    // Lejos, hojas algo más anchas: con menos matas siguen cubriendo el suelo.
    this.low = createClumpGeometry(Math.ceil(g.leaves * .6), 2, false, 9137, (g.width ?? 1) * 1.3);
    this.material = createVegetationMaterial(spec, uniforms);
    this.tiles = [];
    const random = rng(52711);
    const matrix = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    const [minX, maxX, minZ, maxZ] = g.bounds;
    const size = g.tile;
    const max = Math.round(size * size * g.density * GRASS_OVERSAMPLE);
    for (let tz = minZ; tz < maxZ; tz += size) for (let tx = minX; tx < maxX; tx += size) {
      const matrices = [], tints = [];
      for (let i = 0; i < max; i++) {
        const x = tx + random() * size, z = tz + random() * size;
        if (random() > densityAt(x, z)) continue;
        const tall = valueNoise(x * .09 + 5, z * .09 + 2);
        const k = g.size[0] + (g.size[1] - g.size[0]) * (.4 * random() + .6 * tall);
        e.set((random() - .5) * .2, random() * Math.PI * 2, (random() - .5) * .2);
        q.setFromEuler(e);
        s.set(k, k * (.85 + random() * .3), k);
        p.set(x, hillHeight(x, z, spec) - .02, z);
        matrices.push(matrix.compose(p, q, s).clone());
        tints.push(random());
      }
      const count = matrices.length;
      if (!count) continue;
      const rank = new Float32Array(count);
      for (let i = 0; i < count; i++) rank[i] = (i + .5) / count; // el orden ya es aleatorio: rango uniforme
      const instanceMatrix = new T.InstancedBufferAttribute(new Float32Array(count * 16), 16);
      matrices.forEach((mm, i) => mm.toArray(instanceMatrix.array, i * 16));
      const rankAttr = new T.InstancedBufferAttribute(rank, 1);
      const tintAttr = new T.InstancedBufferAttribute(new Float32Array(tints), 1);
      const meshes = [this.high, this.low].map((geo, level) => {
        const geometry = new T.InstancedBufferGeometry();
        geometry.index = geo.index;
        for (const key in geo.attributes) geometry.setAttribute(key, geo.attributes[key]);
        geometry.setAttribute('instanceRank', rankAttr);
        geometry.setAttribute('instanceTint', tintAttr);
        const mesh = new T.InstancedMesh(geometry, this.material, count);
        mesh.instanceMatrix = instanceMatrix;
        mesh.computeBoundingSphere();
        mesh.boundingSphere.radius += .8; // margen del viento
        mesh.raycast = () => {};
        mesh.name = level ? 'Césped lejano' : 'Césped cercano';
        mesh.visible = false;
        this.add(mesh);
        return mesh;
      });
      const box = new T.Box3(new T.Vector3(tx, -50, tz), new T.Vector3(tx + size, 50, tz + size));
      this.tiles.push({ high: meshes[0], low: meshes[1], count, box });
    }
  }

  update(camera) {
    const c = camera.position, { lod } = this.spec, pt = new T.Vector3();
    let triangles = 0;
    for (const tile of this.tiles) {
      tile.box.clampPoint(c, pt);
      const d = Math.hypot(pt.x - c.x, pt.z - c.z);
      const keep = densityKeep(d, lodKeep(d, this.spec), this.spec, this.density ?? 1);
      const n = keep <= 0 ? 0 : Math.min(tile.count, Math.ceil(tile.count * (keep + .04)));
      const near = d < lod.geometry;
      tile.high.visible = n > 0 && near;
      tile.low.visible = n > 0 && !near;
      tile.high.count = tile.low.count = n;
      if (n) triangles += n * (near ? this.high : this.low).index.count / 3;
    }
    this.triangles = triangles;
  }
}

function createFlowers(spec, uniforms) {
  const group = new T.Group();
  group.name = 'Flores silvestres';
  const random = rng(77713);
  const [minX, maxX, minZ, maxZ] = spec.flowers.bounds;
  const [clearX, clearZ, clearR] = spec.flowers.clear;
  const material = createVegetationMaterial(spec, uniforms, true);
  for (const [geometry, perCluster, label, scale, clusters] of [
    [createLupineGeometry(), [1, 4], 'Altramuces', .75, spec.flowers.clusters * .35],
    [createDaisyGeometry(), [3, 9], 'Florecillas', .9, spec.flowers.clusters],
  ]) {
    const matrices = [], tints = [];
    const m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
    for (let c = 0; c < clusters; c++) {
      const cx = minX + random() * (maxX - minX), cz = minZ + random() * (maxZ - minZ);
      const n = perCluster[0] + Math.floor(random() * (perCluster[1] - perCluster[0]));
      const hue = random();
      for (let i = 0; i < n; i++) {
        const x = cx + (random() - .5) * 1.6, z = cz + (random() - .5) * 1.6;
        if (Math.hypot(x - clearX, z - clearZ) < clearR) continue;
        e.set((random() - .5) * .25, random() * Math.PI * 2, (random() - .5) * .25);
        q.setFromEuler(e);
        const k = (.7 + random() * .5) * scale;
        s.set(k, k * (.8 + random() * .45), k);
        p.set(x, hillHeight(x, z, spec) - .01, z);
        matrices.push(m.compose(p, q, s).clone());
        tints.push(random() < .8 ? hue : random());
      }
    }
    const count = matrices.length;
    const g = new T.InstancedBufferGeometry();
    g.index = geometry.index;
    for (const key in geometry.attributes) g.setAttribute(key, geometry.attributes[key]);
    g.setAttribute('instanceRank', new T.InstancedBufferAttribute(new Float32Array(count).map((_, i) => (i + .5) / count), 1));
    g.setAttribute('instanceTint', new T.InstancedBufferAttribute(new Float32Array(tints), 1));
    const mesh = new T.InstancedMesh(g, material, count);
    matrices.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    mesh.computeBoundingSphere();
    mesh.raycast = () => {};
    mesh.name = label;
    group.add(mesh);
  }
  return group;
}

function createLights(spec) {
  const group = new T.Group();
  group.name = 'Luz antes del alba';
  // Para los personajes que se coloquen después: cielo frío, rebote verde, luna y un toque lavanda del horizonte.
  const hemi = new T.HemisphereLight(0x9aaee6, 0x1f3a26, 1.3);
  const moon = new T.DirectionalLight(0xdfe4ff, .85);
  moon.position.set(...spec.moonDirection).multiplyScalar(50);
  const dawn = new T.DirectionalLight(0xd9b9d6, .35);
  dawn.position.set(spec.dawnDirection[0], .2, spec.dawnDirection[2]).multiplyScalar(50);
  group.add(hemi, moon, dawn);
  group.userData.lights = { hemi, moon, dawn };
  return group;
}

const nightCol = new T.Color(0x9aaee6), dayCol = new T.Color(0xd8e4ff), nightGround = new T.Color(0x1f3a26), dayGround = new T.Color(0x4d5a36);
const dawnCol = new T.Color(0xd9b9d6), sunriseCol = new T.Color(0xffb07a), noonCol = new T.Color(0xfff2e0);
// Mismas curvas que nightScale/dayMix/sunOn del shader: los personajes reciben la misma luz que la colina.
export function applyHillLight(root, { sol, luna }, spec = COLINA_QUIJOTE) {
  const u = root.userData.uniforms;
  u.sunLevel.value = sol; u.moonLevel.value = luna;
  const lights = root.getObjectByName('Luz antes del alba')?.userData.lights;
  if (!lights) return;
  const night = .07 + .93 * Math.min(1, Math.max(0, luna)), day = smooth(.3, 1.1, sol), on = smooth(.25, .6, sol);
  lights.hemi.intensity = 1.3 * ((1 - day) * night + day * Math.min(sol, 1.3));
  lights.hemi.color.copy(nightCol).lerp(dayCol, day);
  lights.hemi.groundColor.copy(nightGround).lerp(dayGround, day);
  lights.moon.intensity = .85 * luna * (1 - day * .8);
  lights.dawn.intensity = .35 * (sol / .25) * (1 - on) + 2.2 * on * Math.min(sol, 1.3);
  lights.dawn.color.copy(dawnCol).lerp(sunriseCol, on).lerp(noonCol, day);
  // Misma altura que sunDir() del shader (y nunca por debajo del suelo para los personajes).
  lights.dawn.position.set(spec.dawnDirection[0], Math.max(.02, -.075 + .3 * Math.min(sol, 1.5)), spec.dawnDirection[2]).normalize().multiplyScalar(50);
}

export function createHill(spec = COLINA_QUIJOTE) {
  const root = new T.Group();
  root.name = 'Colina de Don Quijote';
  const uniforms = sharedUniforms(spec);
  const grass = new GrassField(spec, uniforms);
  const cards = createCloudCards(spec, uniforms);
  showCloudCards(cards, uniforms.cloudStyle.value);
  root.add(createSky(spec, uniforms), cards, createGround(spec, uniforms), grass, createFlowers(spec, uniforms), createLights(spec));
  root.userData.cloudCards = cards;
  root.userData.wind = uniforms.windTime;
  root.userData.uniforms = uniforms;
  root.userData.grass = grass;
  grass.density = uniforms.grassDensity.value;
  return root;
}

export class HillAssets extends CityAssets {
  constructor(options) {
    super(options);
    this.hillSpec = options.hillSpec ?? COLINA_QUIJOTE;
    this.windTime = 0;
    // La madrugada, la bruma y el viento son del propio escenario: sin pétalos ni niebla de estación encima.
    this.sinClima = true;
    this.light = { ...(this.hillSpec.light ?? { sol: .25, luna: 1 }) };
    // Prueba de presets sin el Estudio: ?luz=sol,luna (p. ej. ?luz=.45,.3 = «Amanecer»).
    const forced = new URLSearchParams(globalThis.location?.search ?? '').get('luz')?.split(',').map(Number);
    if (forced?.length === 2 && forced.every(Number.isFinite)) { this.light = { sol: forced[0], luna: forced[1] }; this.hillSpec = { ...this.hillSpec, light: this.light }; }
  }

  /** Estilo de nubes (Opciones › Escena › Nubes): 0 jirones originales, 1 cúmulos procedurales, 2 tarjetas NPR, 3 sin nubes. */
  setCloudStyle(style) {
    this.cloudStyle = style;
    this.hillSpec = { ...this.hillSpec, clouds: { ...this.hillSpec.clouds, style } };
    for (const record of this.records.values()) {
      if (!record.root) continue;
      record.root.userData.uniforms.cloudStyle.value = style;
      showCloudCards(record.root.userData.cloudCards, style);
    }
  }

  /** Suelo entre las matas: 0 original oscuro, 1 césped corto pintado. */
  setGroundStyle(style) {
    this.groundStyle = style;
    this.hillSpec = { ...this.hillSpec, groundStyle: style };
    for (const record of this.records.values()) if (record.root) record.root.userData.uniforms.groundStyle.value = style;
  }

  /** Densidad del césped en primer plano: 1 la del escenario, de .25 a 2. */
  setGrassDensity(density) {
    this.grassDensity = Math.min(2, Math.max(.25, density));
    this.hillSpec = { ...this.hillSpec, grass: { ...this.hillSpec.grass, nearDensity: this.grassDensity } };
    for (const record of this.records.values()) {
      if (!record.root) continue;
      record.root.userData.uniforms.grassDensity.value = this.grassDensity;
      record.root.userData.grass.density = this.grassDensity;
      record.root.userData.grass.update(this.camera);
    }
  }

  /** Niveles de sol y luna que dirige el Estudio (pista «Luz»); null vuelve a los del escenario. */
  setLight(light) {
    const base = this.hillSpec.light ?? { sol: .25, luna: 1 };
    const next = light ? { sol: light.sol, luna: light.luna } : { ...base };
    if (next.sol === this.light.sol && next.luna === this.light.luna) return;
    this.light = next;
    for (const record of this.records.values()) if (record.root) applyHillLight(record.root, next, this.hillSpec);
  }

  update(dt) {
    this.windTime += dt;
    for (const record of this.records.values()) {
      if (!record.root) continue;
      record.root.userData.wind.value = this.windTime;
      record.root.userData.grass.update(this.camera);
    }
  }

  async prepare({ record }) {
    const started = performance.now();
    try {
      record.controller.signal.throwIfAborted();
      record.state = 'loading';
      // Todo es procedural: no hay descarga. Se cede un turno para no bloquear la carga del visor.
      await new Promise(resolve => setTimeout(resolve, 0));
      record.controller.signal.throwIfAborted();
      record.root = createHill(this.hillSpec);
      record.root.userData.sector = record.sector.id;
      applyHillLight(record.root, this.light, this.hillSpec);
      record.root.userData.grass.update(this.camera);
      this.scene.add(record.root);
      record.state = 'ready';
      record.transferBytes = 0;
      record.loadMs = performance.now() - started;
      this.errors = this.errors.filter(e => e.sector !== record.sector.id);
      this.onLoad(record);
      record.resolve(record);
    } catch (error) {
      if (record.root) {
        this.detach(record);
        this.release(record.root);
        record.root = null;
      }
      record.state = error.name === 'AbortError' ? 'cancelled' : 'error';
      if (record.state === 'error') {
        record.error = error.message;
        record.retryAt = performance.now() + 1000;
        this.errors.push({ sector: record.sector.id, error: error.message });
      }
      record.reject(error);
    }
  }
}
