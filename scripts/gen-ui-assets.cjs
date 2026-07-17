const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '最终素材', 'UI');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function createPNG(width, height) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0; png.data[i+1] = 0; png.data[i+2] = 0; png.data[i+3] = 0;
  }
  return png;
}

function setPixel(png, x, y, r, g, b, a) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (y * png.width + x) * 4;
  png.data[idx] = r; png.data[idx+1] = g; png.data[idx+2] = b; png.data[idx+3] = a;
}

function getPixel(png, x, y) {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return [0,0,0,0];
  const idx = (y * png.width + x) * 4;
  return [png.data[idx], png.data[idx+1], png.data[idx+2], png.data[idx+3]];
}

function blendPixel(png, x, y, r, g, b, a) {
  const [br, bg, bb, ba] = getPixel(png, x, y);
  const sa = a / 255, da = ba / 255;
  const outA = sa + da * (1 - sa);
  if (outA < 0.001) return;
  setPixel(png, x, y,
    Math.round((r*sa + br*da*(1-sa))/outA),
    Math.round((g*sa + bg*da*(1-sa))/outA),
    Math.round((b*sa + bb*da*(1-sa))/outA),
    Math.round(outA*255));
}

function fillRect(png, x, y, w, h, r, g, b, a) {
  for (let py = y; py < y+h; py++)
    for (let px = x; px < x+w; px++)
      setPixel(png, px, py, r, g, b, a);
}

function savePNG(png, filename) {
  const buf = PNG.sync.write(png);
  fs.writeFileSync(path.join(OUT_DIR, filename), buf);
  console.log(`  saved ${filename} (${png.width}x${png.height})`);
}

function lerp(a,b,t){return a+(b-a)*t;}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff;
}
function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash(ix, iy), b = hash(ix+1, iy), c = hash(ix, iy+1), d = hash(ix+1, iy+1);
  const ux = fx*fx*(3-2*fx), uy = fy*fy*(3-2*fy);
  return lerp(lerp(a,b,ux), lerp(c,d,ux), uy);
}

function drawOrnateFrame(png, margin, colors, cornerSize, cornerStyle) {
  const w = png.width, h = png.height;
  const cx = margin, cy = margin, cw = w - margin*2, ch = h - margin*2;
  const [outer, mid, inner, glow] = colors;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dl = px - cx, dr = cx + cw - 1 - px;
      const dt = py - cy, db = cy + ch - 1 - py;
      const de = Math.min(dl, dr, dt, db);

      if (de < 0) { setPixel(png, px, py, 0,0,0,0); continue; }

      const inCorner =
        (px < cx+cornerSize && py < cy+cornerSize) ||
        (px >= cx+cw-cornerSize && py < cy+cornerSize) ||
        (px < cx+cornerSize && py >= cy+ch-cornerSize) ||
        (px >= cx+cw-cornerSize && py >= cy+ch-cornerSize);

      if (de === 0) setPixel(png, px, py, ...outer, 255);
      else if (de === 1) setPixel(png, px, py, ...mid, 220);
      else if (de === 2) setPixel(png, px, py, ...inner, inCorner ? 240 : 180);
      else if (de === 3) setPixel(png, px, py, ...glow, inCorner ? 140 : 70);
      else if (de <= 4 && inCorner) setPixel(png, px, py, ...glow, 50);
    }
  }

  if (cornerStyle === 'bracket') {
    const bl = 5;
    const corners = [
      [cx, cy, 1, 1], [cx+cw-1, cy, -1, 1],
      [cx, cy+ch-1, 1, -1], [cx+cw-1, cy+ch-1, -1, -1]
    ];
    for (const [bx, by, dx, dy] of corners) {
      for (let i = 0; i < bl; i++) {
        setPixel(png, bx + dx*i, by, ...inner, 255);
        setPixel(png, bx, by + dy*i, ...inner, 255);
      }
      setPixel(png, bx, by, ...glow, 255);
    }
  }
}

function genSkillFrame() {
  console.log('Generating 技能框.png...');
  const png = createPNG(64, 64);
  drawOrnateFrame(png, 3, [
    [20, 15, 10], [60, 50, 30], [190, 160, 50], [240, 210, 90]
  ], 8, 'bracket');
  savePNG(png, '技能框.png');
}

function genWeaponFrame() {
  console.log('Generating 武器框.png...');
  const png = createPNG(80, 80);
  drawOrnateFrame(png, 4, [
    [10, 15, 30], [30, 45, 80], [60, 130, 220], [100, 190, 255]
  ], 10, 'bracket');
  const cx = 40, cy = 40;
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    for (let r = 18; r < 26; r++) {
      const px = Math.round(cx + Math.cos(angle)*r);
      const py = Math.round(cy + Math.sin(angle)*r);
      blendPixel(png, px, py, 100, 180, 255, 25);
    }
  }
  savePNG(png, '武器框.png');
}

function genMiniMapFrame() {
  console.log('Generating 小地图边框.png...');
  const s = 256;
  const png = createPNG(s, s);
  drawOrnateFrame(png, 6, [
    [20, 15, 10], [60, 48, 28], [170, 140, 45], [220, 190, 70]
  ], 24, 'bracket');

  const ccx = s - 32, ccy = 32;
  const needleColor = [200, 50, 40];
  setPixel(png, ccx, ccy, 180, 150, 50, 255);
  for (let i = 1; i <= 10; i++) setPixel(png, ccx, ccy - i, ...needleColor, 255);
  setPixel(png, ccx-1, ccy-6, ...needleColor, 200);
  setPixel(png, ccx+1, ccy-6, ...needleColor, 200);
  setPixel(png, ccx-2, ccy-3, ...needleColor, 150);
  setPixel(png, ccx+2, ccy-3, ...needleColor, 150);
  for (let i = 1; i <= 3; i++) {
    setPixel(png, ccx, ccy + i, ...needleColor, 200 - i*50);
  }

  const labelN = [[0,-12],[0,-13]];
  for (const [dx,dy] of labelN) setPixel(png, ccx+dx, ccy+dy, 180,150,50, 180);

  savePNG(png, '小地图边框.png');
}

function genBigMapFrame() {
  console.log('Generating 大地图边框.png...');
  const w = 768, h = 512;
  const png = createPNG(w, h);
  drawOrnateFrame(png, 8, [
    [20, 15, 10], [60, 48, 28], [170, 140, 45], [220, 190, 70]
  ], 32, 'bracket');
  savePNG(png, '大地图边框.png');
}

function genBarFrame(filename, w, h, colors) {
  console.log(`Generating ${filename}...`);
  const png = createPNG(w, h);
  const [outer, mid, inner, bg] = colors;
  fillRect(png, 2, 2, w-4, h-4, ...bg, 255);
  for (let px = 0; px < w; px++) {
    setPixel(png, px, 0, ...outer, 255);
    setPixel(png, px, h-1, ...outer, 255);
  }
  for (let py = 0; py < h; py++) {
    setPixel(png, 0, py, ...outer, 255);
    setPixel(png, w-1, py, ...outer, 255);
  }
  for (let px = 1; px < w-1; px++) {
    setPixel(png, px, 1, ...mid, 200);
    setPixel(png, px, h-2, ...mid, 150);
  }
  for (let py = 1; py < h-1; py++) {
    setPixel(png, 1, py, ...mid, 200);
    setPixel(png, w-2, py, ...mid, 150);
  }
  savePNG(png, filename);
}

function genBarFill(filename, w, h, colors) {
  console.log(`Generating ${filename}...`);
  const png = createPNG(w, h);
  const [top, bot, hi] = colors;
  for (let py = 0; py < h; py++) {
    const t = py / (h-1);
    const r = Math.round(lerp(top[0], bot[0], t));
    const g = Math.round(lerp(top[1], bot[1], t));
    const b = Math.round(lerp(top[2], bot[2], t));
    for (let px = 0; px < w; px++) {
      setPixel(png, px, py, r, g, b, 255);
    }
  }
  for (let px = 2; px < w-2; px++) {
    const n = hash(px, 0);
    if (n > 0.4) {
      setPixel(png, px, 1, ...hi, 180);
      if (n > 0.7) setPixel(png, px, 2, ...hi, 100);
    }
  }
  savePNG(png, filename);
}

function genLightPillar(filename, color, w, h) {
  console.log(`Generating ${filename}...`);
  const png = createPNG(w, h);
  const [cr, cg, cb] = color;
  const cx = w / 2;
  for (let py = 0; py < h; py++) {
    const ty = py / h;
    const bw = Math.max(2, (w/2) * (1 - ty*0.25));
    for (let px = 0; px < w; px++) {
      const dx = Math.abs(px - cx);
      const d = dx / bw;
      if (d > 1.3) continue;
      let a;
      if (d < 0.25) a = lerp(200, 70, ty);
      else if (d < 0.6) a = lerp(140, 40, ty) * (1 - (d-0.25)/0.35);
      else a = lerp(50, 8, ty) * Math.max(0, 1-(d-0.6)/0.7);
      a = Math.round(a);
      if (a > 0) {
        const n = (hash(px, py) - 0.5) * 40;
        blendPixel(png, px, py, clamp(cr+n,0,255), clamp(cg+n,0,255), clamp(cb+n,0,255), a);
      }
    }
    if (py > h*0.65 && hash(py, Math.floor(py*7)) > 0.6) {
      const px = Math.round(cx + (hash(py, 3)-0.5) * bw * 1.2);
      for (let i = 0; i < 2; i++) blendPixel(png, px+i-1, py, cr, cg, cb, 100);
    }
  }
  for (let i = -10; i <= 10; i++) {
    for (let j = -3; j <= 2; j++) {
      const dist = Math.abs(i)/10;
      blendPixel(png, Math.round(cx)+i, h-5+j, cr, cg, cb, Math.round(220*(1-dist)));
    }
  }
  savePNG(png, filename);
}

function genVignette(filename, w, h, edgeColor, innerRadius, edgeWidth) {
  console.log(`Generating ${filename}...`);
  const png = createPNG(w, h);
  const cx = w/2, cy = h/2;
  const maxR = Math.sqrt(cx*cx + cy*cy);
  const [er, eg, eb] = edgeColor;

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const t = clamp((dist - innerRadius*maxR) / (edgeWidth*maxR), 0, 1);
      const eased = t * t * (3 - 2*t);
      const a = Math.round(eased * 240);
      if (a > 0) {
        const n = (smoothNoise(px*0.02, py*0.02) - 0.5) * 30;
        setPixel(png, px, py,
          clamp(er + n, 0, 255),
          clamp(eg + n, 0, 255),
          clamp(eb + n, 0, 255), a);
      }
    }
  }
  savePNG(png, filename);
}

function genDeathText() {
  console.log('Generating 你死了.png...');
  const w = 320, h = 96;
  const png = createPNG(w, h);
  const glyphs = {
    '你': [
      "011101110",
      "010101010",
      "011101110",
      "010101010",
      "010101010",
      "110101011",
      "100101001",
      "001001010",
      "001001010",
    ],
    '死': [
      "111100100",
      "001001100",
      "011001010",
      "001011110",
      "001001000",
      "011011110",
      "100100010",
      "111101010",
      "100101110",
    ],
    '了': [
      "001000000",
      "111101110",
      "001001000",
      "001001110",
      "011100010",
      "001000110",
      "011100010",
      "010101110",
      "001000000",
    ]
  };
  const scale = 8;
  const ox = 16, oy = 8;
  const chars = ['你', '死', '了'];
  for (let ci = 0; ci < chars.length; ci++) {
    const ch = glyphs[chars[ci]];
    const cx = ox + ci * (9*scale + 12);
    for (let gy = 0; gy < ch.length; gy++) {
      for (let gx = 0; gx < ch[gy].length; gx++) {
        if (ch[gy][gx] === '1') {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + gx*scale + sx, py = oy + gy*scale + sy;
              const edge = (sx === 0 || sy === 0 || sx === scale-1 || sy === scale-1);
              const drip = (gy === ch.length-1 && hash(gx, ci) > 0.5 && sy < 3);
              let r = 180, g = 20, b = 20, a = 255;
              if (edge && !drip) { r = 100; g = 5; b = 5; }
              if (drip) {
                const da = 255 - sy * 80;
                if (da > 0) setPixel(png, px, py+sy, 150, 10, 10, da);
              }
              setPixel(png, px, py, r, g, b, a);
            }
          }
        }
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const px = Math.floor(hash(i, 99) * w);
    const py = Math.floor(hash(i, 100) * h);
    if (hash(i,101) > 0.5) setPixel(png, px, py, 200, 30, 30, 100);
  }
  savePNG(png, '你死了.png');
}

console.log('=== Generating UI assets (v2) ===\n');
genSkillFrame();
genWeaponFrame();
genMiniMapFrame();
genBigMapFrame();
genBarFrame('血条背景.png', 256, 28, [[40,12,12],[90,25,20],[160,40,30],[15,5,5]]);
genBarFill('血条填充.png', 252, 24, [[220,50,50],[130,15,15],[255,100,100]]);
genBarFrame('理智条背景.png', 256, 28, [[12,18,40],[25,45,90],[50,90,180],[5,8,25]]);
genBarFill('理智条填充.png', 252, 24, [[80,140,240],[30,50,140],[140,200,255]]);
const rarityColors = {
  '蓝': [70,130,255], '紫': [170,70,220], '绿': [60,200,90],
  '金': [255,190,40], '白': [210,210,235]
};
for (const [name, color] of Object.entries(rarityColors)) {
  genLightPillar(`光柱-${name}.png`, color, 64, 192);
}
genVignette('视野黑雾.png', 512, 512, [0,0,0], 0.25, 0.55);
genVignette('理智消散边缘.png', 512, 512, [90,0,0], 0.35, 0.5);
genDeathText();
console.log('\n=== Done ===');
