export const FULLSCREEN_BLOOM_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uIntensity;
varying vec2 outTexCoord;
void main() {
  vec4 color = texture2D(uMainSampler, outTexCoord);
  vec4 bloom = vec4(0.0);
  float offset = 0.003;
  bloom += texture2D(uMainSampler, outTexCoord + vec2(offset, 0.0));
  bloom += texture2D(uMainSampler, outTexCoord - vec2(offset, 0.0));
  bloom += texture2D(uMainSampler, outTexCoord + vec2(0.0, offset));
  bloom += texture2D(uMainSampler, outTexCoord - vec2(0.0, offset));
  bloom *= 0.25;
  bloom.rgb = max(bloom.rgb - 0.5, 0.0) * 2.0;
  gl_FragColor = color + bloom * uIntensity;
}
`;
