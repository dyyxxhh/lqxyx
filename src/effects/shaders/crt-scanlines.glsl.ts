export const CRT_SCANLINES_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uIntensity;
varying vec2 outTexCoord;
void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  float scanline = sin(outTexCoord.y * 800.0) * 0.5 + 0.5;
  color.rgb *= 1.0 - uIntensity * scanline;
  gl_FragColor = color;
}
`;
