export const CHROMATIC_ABERRATION_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uOffset;
varying vec2 outTexCoord;
void main() {
  vec2 dir = outTexCoord - vec2(0.5);
  float r = texture2D(uMainSampler, outTexCoord - dir * uOffset * 0.01).r;
  float g = texture2D(uMainSampler, outTexCoord).g;
  float b = texture2D(uMainSampler, outTexCoord + dir * uOffset * 0.01).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`;
