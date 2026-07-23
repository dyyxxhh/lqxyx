export const FILM_GRAIN_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uIntensity;
uniform float uTime;
varying vec2 outTexCoord;
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float grain = random(outTexCoord + vec2(uTime)) - 0.5;
  color.rgb += grain * uIntensity;
  gl_FragColor = color;
}
`;
