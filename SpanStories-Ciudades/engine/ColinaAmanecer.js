import * as T from './three.js';
import { COLINA } from '../routes.js';
import { CityAssets } from './CityAssets.js';

function relief(x, z, { crest, spread, base, rise }) {
  const across = (x - crest[0]) / spread[0];
  const along = (z - crest[1] + .16 * (x - crest[0])) / spread[1];
  return base + rise * Math.exp(-(across ** 2 + along ** 2)) +
    .29 * Math.sin(x * .24 + z * .13) * Math.cos(z * .19);
}

// Same two triangles as PlaneGeometry after rotation. Feet and grass follow the rendered surface.
export function hillHeight(x, z, spec = COLINA) {
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

const noise = `
  float hash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * .1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float noise2(vec2 p) {
    vec2 i = floor(p), u = fract(p);
    u = u*u*(3.0-2.0*u);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+1.0), u.x), u.y);
  }
`;

const predawnSky = `
  void main() {
    vec3 dir = normalize(ray);
    float elevation = dir.y;
    float azimuth = atan(dir.x,-dir.z);
    float alignment = max(dot(dir,sun),0.);
    float glow = pow(alignment,19.) * exp(-abs(elevation-sun.y)*22.);
    vec3 sky = mix(vec3(.071,.103,.30),vec3(.022,.048,.19),smoothstep(-.03,.55,elevation));
    sky += vec3(.25,.078,.056) * glow;

    if (elevation > .016) {
      vec2 p = dir.xz / (elevation + .21) * vec2(3.5,5.9);
      float cloudShape = .62*noise2(p) + .27*noise2(p*2.04+4.) + .11*noise2(p*4.17);
      float cloud = smoothstep(.46,.76,cloudShape) * smoothstep(.016,.075,elevation);
      float rosy = pow(alignment,8.) * (.24+.76*exp(-abs(elevation-.06)*11.));
      vec3 cloudTint = mix(vec3(.062,.083,.197),vec3(.219,.142,.236),rosy);
      sky = mix(sky,cloudTint,cloud*.69);
    }

    float disk = smoothstep(.999899,.999916,alignment);
    sky = mix(sky,vec3(.94,.31,.27),disk);
    float farRidge = .026 + .01*sin(azimuth*6.1-.9) + .006*sin(azimuth*14.+.6) +
        .004*sin(azimuth*28.+2.) + .002*sin(azimuth*72.+1.);
    float middleRidge = -.005 + .016*sin(azimuth*5.+1.7) + .009*sin(azimuth*17.+2.9) +
        .005*sin(azimuth*38.);
    float nearRidge = -.021 + .017*sin(azimuth*8.1-.6) + .008*sin(azimuth*24.-1.);
    float edge = max(fwidth(elevation),.0003);
    vec3 farTint = mix(vec3(.036,.055,.134),vec3(.070,.085,.179),pow(alignment,10.));
    float haze = exp(-abs(elevation+.039)*31.) * (.50+.4*sin(azimuth*7.-.8));
    sky = mix(sky,farTint,1.-smoothstep(farRidge-edge,farRidge+edge,elevation));
    sky = mix(sky,vec3(.025,.049,.11)+vec3(.06,.086,.15)*haze,
        1.-smoothstep(middleRidge-edge,middleRidge+edge,elevation));
    sky = mix(sky,vec3(.014,.033,.075)+vec3(.028,.048,.088)*haze,
        1.-smoothstep(nearRidge-edge,nearRidge+edge,elevation));
    gl_FragColor = vec4(sky,1.);
    #include <colorspace_fragment>
  }
`;

function createSky(spec, sun) {
  const material = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { sun: { value: sun } },
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
      uniform vec3 sun;
      ${noise}
      ${spec.predawn ? predawnSky : `
      void main() {
        vec3 dir = normalize(ray);
        float y = dir.y;
        float towardSun = max(0., dot(dir, sun));
        float warmth = pow(towardSun, 9.);
        vec3 horizon = mix(vec3(.50,.36,.33), vec3(1.,.55,.24), warmth);
        vec3 sky = mix(horizon, vec3(.075,.176,.31), smoothstep(-.02,.46,y));
        sky += vec3(.27,.097,.025) * pow(towardSun, 110.);
        if (y > .025) {
          vec2 p = dir.xz / (y + .22) * vec2(2.7,7.2);
          float wisps = .65*noise2(p) + .24*noise2(p*2.19) + .11*noise2(p*4.33);
          float clouds = smoothstep(.46,.77,wisps) * smoothstep(.025,.10,y);
          vec3 cloudColor = mix(vec3(.28,.26,.33), vec3(.94,.50,.34), warmth);
          sky = mix(sky, cloudColor, clouds*.69);
        }
        float disk = smoothstep(.99984,.99989,towardSun);
        sky = mix(sky,vec3(1.,.96,.77),disk);
        float a = atan(dir.x,-dir.z);
        float distant = .064 + .012*sin(a*7.) + .008*sin(a*17.+1.) + .004*sin(a*43.);
        float foothills = .026 + .012*sin(a*8.+1.) + .009*sin(a*20.) + .004*sin(a*53.);
        float edge = max(fwidth(y), .0003);
        sky = mix(sky,mix(vec3(.23,.24,.29),vec3(.61,.37,.24),warmth),1.-smoothstep(distant-edge,distant+edge,y));
        sky = mix(sky,mix(vec3(.15,.19,.22),vec3(.38,.28,.23),warmth),1.-smoothstep(foothills-edge,foothills+edge,y));
        gl_FragColor = vec4(sky,1.);
        #include <colorspace_fragment>
      }
      `}
    `,
  });
  const sky = new T.Mesh(new T.SphereGeometry(spec.radius, 32, 16), material);
  sky.name = 'Horizonte y sol';
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  sky.raycast = () => {};
  return sky;
}

function createGround(spec, sun, texture) {
  const geometry = new T.PlaneGeometry(spec.radius * 2, spec.radius * 2, spec.segments, spec.segments);
  geometry.rotateX(-Math.PI / 2);
  const points = geometry.attributes.position;
  for (let i = 0; i < points.count; i++) points.setY(i, relief(points.getX(i), points.getZ(i), spec));
  geometry.computeVertexNormals();
  const material = new T.ShaderMaterial({
    defines: {
      ...(texture && { GRASS_MAP: 1 }),
      ...(spec.predawn && { PREDAWN: 1 }),
    },
    uniforms: {
      sun: { value: sun },
      mistDistance: { value: spec.mistDistance },
      grassTileSize: { value: spec.grassTileSize },
      grassMap: { value: texture },
    },
    vertexShader: `
      varying vec3 p;
      varying vec3 n;
      void main() {
        p = position;
        n = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
      }
    `,
    fragmentShader: `
      varying vec3 p;
      varying vec3 n;
      uniform vec3 sun;
      uniform float mistDistance;
      uniform float grassTileSize;
      uniform sampler2D grassMap;
      ${noise}
      void main() {
        float distanceToEye = length(p-cameraPosition);
        float variation = noise2(p.xz*.61)*.57 + noise2(p.xz*2.86)*.43;
        vec3 turf = mix(vec3(.030,.050,.012),vec3(.105,.15,.039),variation);
        #ifdef GRASS_MAP
          vec2 uv = p.xz / grassTileSize;
          vec2 rotated = mat2(.8,.6,-.6,.8) * uv * .71;
          vec3 blades = mix(texture2D(grassMap,uv).rgb,texture2D(grassMap,rotated).rgb,variation);
          turf = mix(blades * vec3(.83,.74,.78) * (.69+.72*variation),turf,smoothstep(9.,47.,distanceToEye));
        #endif
        float glow = max(0.,dot(normalize(n),sun));
        #ifdef PREDAWN
          float clumps = .72+.26*noise2(p.xz*.28)+.17*noise2(p.xz*3.3);
          turf *= vec3(.37,.53,.67) * clumps * (.78+.56*glow);
          float mist = smoothstep(8.,mistDistance,distanceToEye);
          vec3 morningFog = vec3(.029,.058,.122);
          turf = mix(turf,morningFog,mist*.79);
          gl_FragColor = vec4(turf,1.);
        #else
        turf *= vec3(.74,.84,.7) + vec3(1.1,.62,.21)*glow;
        float mist = smoothstep(14.,mistDistance,distanceToEye);
        gl_FragColor = vec4(mix(turf, vec3(.28,.25,.17), mist*.84),1.);
        #endif
        #include <colorspace_fragment>
      }
    `,
  });
  const ground = new T.Mesh(geometry, material);
  ground.name = 'Suelo de la colina';
  return ground;
}

function createWindGrassMaterial(spec) {
  return new T.ShaderMaterial({
    vertexColors: true,
    side: T.DoubleSide,
    uniforms: {
      windTime: { value: 0 },
      mistDistance: { value: spec.mistDistance },
    },
    vertexShader: `
      attribute float flexibility;
      uniform float windTime;
      uniform float mistDistance;
      varying vec3 shade;
      void main() {
        vec3 p = position;
        float gust = sin(dot(p.xz,vec2(.62,.34))-windTime*1.5);
        float ripple = sin(dot(p.xz,vec2(.87,-.97))-windTime*2.8);
        p.xz += vec2(.075,.035) * flexibility * (.22+gust*.57+ripple*.21);
        float mist = smoothstep(8.,mistDistance,length(position-cameraPosition));
        shade = mix(color,vec3(.029,.058,.122),mist*.79);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.);
      }
    `,
    fragmentShader: `
      varying vec3 shade;
      void main() {
        gl_FragColor = vec4(shade,1.);
        #include <colorspace_fragment>
      }
    `,
  });
}

function createGrass(spec, sun) {
  const vertices = spec.tufts * 3 * 5;
  const positions = new Float32Array(vertices * 3);
  const colors = new Uint8Array(vertices * 3);
  const flexibility = spec.predawn ? new Uint8Array(vertices) : null;
  const bands = spec.midfieldBounds
    ? [spec.foregroundBounds, spec.midfieldBounds, spec.foregroundBounds, spec.grassBounds, spec.foregroundBounds, spec.midfieldBounds]
    : [spec.grassBounds, spec.foregroundBounds];
  const indices = new Uint32Array(spec.tufts * 3 * 9);
  let seed = 23117, vertex = 0, index = 0;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  }
  function point(x, y, z, tint, light, flex = 0) {
    positions.set([x, y, z], vertex * 3);
    colors.set([tint[0] * light, tint[1] * light, tint[2] * light], vertex * 3);
    if (flexibility) flexibility[vertex] = flex;
    vertex++;
  }
  for (let i = 0; i < spec.tufts; i++) {
    const [minX, maxX, minZ, maxZ] = bands[i % bands.length];
    const x = T.MathUtils.lerp(minX, maxX, random());
    const z = T.MathUtils.lerp(minZ, maxZ, random());
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    const density = T.MathUtils.smoothstep(edge, 0, spec.grassEdgeFalloff ?? 4);
    if (random() > density * (.81 + .19 * Math.sin(x * 1.8 + Math.cos(z * 2.1)))) continue;
    for (let j = 0; j < 3; j++) {
      const px = x + (random() - .5) * spec.tuftRadius;
      const pz = z + (random() - .5) * spec.tuftRadius;
      const angle = random() * Math.PI * 2;
      const dx = Math.cos(angle), dz = Math.sin(angle);
      const h = T.MathUtils.lerp(...spec.bladeHeight, random() ** 1.75);
      const width = T.MathUtils.lerp(...spec.bladeWidth, random()) * .5;
      const bend = spec.bladeLean * (.18 + random() * .82) * h / spec.bladeHeight[1];
      const py = hillHeight(px, pz, spec);
      const shade = random();
      const backlight = Math.abs(dx * sun.x + dz * sun.z);
      const dry = shade > .93;
      const tint = spec.predawn
        ? (dry ? [32, 49, 19] : [6 + 18 * shade, 20 + 32 * shade, 6 + 12 * shade])
        : (dry ? [124, 104, 33] : [19 + 32 * shade, 36 + 46 * shade, 5 + 12 * shade]);
      const start = vertex;
      point(px - dx * width, py, pz - dz * width, tint, .23);
      point(px + dx * width, py, pz + dz * width, tint, .32);
      point(px - dz * bend * .33 - dx * width * .56, py + h * .58, pz + dx * bend * .33 - dz * width * .56, tint, .65, 84);
      point(px - dz * bend * .33 + dx * width * .56, py + h * .58, pz + dx * bend * .33 + dz * width * .56, tint, .82, 84);
      point(px - dz * bend, py + h, pz + dx * bend, tint, .76 + .66 * backlight, 255);
      indices.set([start, start + 1, start + 2, start + 2, start + 1, start + 3, start + 2, start + 3, start + 4], index);
      index += 9;
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions.slice(0, vertex * 3), 3));
  geometry.setAttribute('color', new T.BufferAttribute(colors.slice(0, vertex * 3), 3, true));
  if (flexibility) {
    geometry.setAttribute('flexibility', new T.BufferAttribute(flexibility.slice(0, vertex), 1, true));
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius += .09; // Reserve room for the largest shader displacement.
  }
  geometry.setIndex(new T.BufferAttribute(indices.slice(0, index), 1));
  const material = spec.predawn ? createWindGrassMaterial(spec) : new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide });
  const grass = new T.Mesh(geometry, material);
  grass.name = 'Briznas de césped';
  grass.raycast = () => {};
  return grass;
}

export function createHill(spec = COLINA, texture = null) {
  const root = new T.Group();
  root.name = spec.predawn ? 'Pradera antes del alba' : 'Colina al amanecer';
  const sun = new T.Vector3(...spec.sunDirection).normalize();
  root.add(createSky(spec, sun), createGround(spec, sun, texture), createGrass(spec, sun));
  return root;
}

export class HillAssets extends CityAssets {
  constructor(options) {
    super(options);
    this.hillSpec = options.hillSpec ?? COLINA;
    this.windTime = 0;
  }

  update(dt) {
    if (!this.hillSpec.predawn) return;
    this.windTime += dt;
    for (const { wind } of this.records.values()) if (wind) wind.value = this.windTime;
  }

  async prepare({ record, url }) {
    const started = performance.now();
    let texture;
    try {
      record.controller.signal.throwIfAborted();
      record.state = 'loading';
      texture = await new T.TextureLoader().loadAsync(url);
      record.controller.signal.throwIfAborted();
      texture.colorSpace = T.SRGBColorSpace;
      texture.wrapS = texture.wrapT = T.RepeatWrapping;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      record.root = createHill(this.hillSpec, texture);
      record.wind = record.root.getObjectByName('Briznas de césped').material.uniforms?.windTime;
      record.root.userData.sector = record.sector.id;
      this.scene.add(record.root);
      record.state = 'ready';
      record.transferBytes = record.sector.bytes;
      this.loadedBytes += record.transferBytes;
      record.loadMs = performance.now() - started;
      this.errors = this.errors.filter(e => e.sector !== record.sector.id);
      this.onLoad(record);
      record.resolve(record);
    } catch (error) {
      if (record.root) {
        this.detach(record);
        this.release(record.root);
        record.root = null;
      } else texture?.dispose();
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
