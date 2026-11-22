// Copia literal del grass.frag.glsl que sirve https://smythdesign.com/demos/grass/
// (bundle.js, Three r131). James Smyth (MIT, 2020–2021). Licencia: public/grass-james/LICENSE.
// La web usa contraste 2 / brillo -0.5; el ZIP de GitHub conserva una versión anterior (1.5 / 0.1).
export const JAMES_FRAGMENT_SOURCE = "uniform sampler2D texture1;\r\nuniform sampler2D textures[4];\r\n\r\nvarying vec2 vUv;\r\nvarying vec2 cloudUV;\r\nvarying vec3 vColor;\r\n\r\nvoid main() {\r\n  float contrast = 2.;\r\n  float brightness = -0.5;\r\n  vec3 color = texture2D(textures[0], vUv).rgb * contrast;\r\n  color = color + vec3(brightness, brightness, brightness);\r\n  color = mix(color, texture2D(textures[1], cloudUV).rgb, 0.4);\r\n  gl_FragColor.rgb = color;\r\n  gl_FragColor.a = 1.;\r\n}\r\n";
