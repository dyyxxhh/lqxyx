const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '最终素材', 'UI');

function createPNG(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i]=0; png.data[i+1]=0; png.data[i+2]=0; png.data[i+3]=0; }
  return png;
}
function setPx(png,x,y,r,g,b,a){if(x<0||x>=png.width||y<0||y>=png.height)return;const i=(y*png.width+x)*4;png.data[i]=r;png.data[i+1]=g;png.data[i+2]=b;png.data[i+3]=a;}
function getPx(png,x,y){if(x<0||x>=png.width||y<0||y>=png.height)return[0,0,0,0];const i=(y*png.width+x)*4;return[png.data[i],png.data[i+1],png.data[i+2],png.data[i+3]];}
function blendPx(png,x,y,r,g,b,a){const[br,bg,bb,ba]=getPx(png,x,y);const sa=a/255,da=ba/255;const oa=sa+da*(1-sa);if(oa<0.001)return;setPx(png,x,y,Math.round((r*sa+br*da*(1-sa))/oa),Math.round((g*sa+bg*da*(1-sa))/oa),Math.round((b*sa+bb*da*(1-sa))/oa),Math.round(oa*255));}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function save(png,f){const buf=PNG.sync.write(png);fs.writeFileSync(path.join(OUT_DIR,f),buf);console.log(`  saved ${f} (${png.width}x${png.height})`);}
function loadPNG(fp){return PNG.sync.read(fs.readFileSync(fp));}

const TARGET_W = 96, TARGET_H = 144;
const cabinetPath = path.join(__dirname, '..', '最终素材', '手机柜-正着.png');
const src = loadPNG(cabinetPath);

function scaleImage(src, tw, th) {
  const dst = createPNG(tw, th);
  const sx = src.width / tw, sy = src.height / th;
  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const sx0 = Math.floor(px * sx), sy0 = Math.floor(py * sy);
      const [r,g,b,a] = getPx(src, clamp(sx0,0,src.width-1), clamp(sy0,0,src.height-1));
      setPx(dst, px, py, r, g, b, a);
    }
  }
  return dst;
}

const cabinet = scaleImage(src, TARGET_W, TARGET_H);

function clonePNG(s) {
  const d = createPNG(s.width, s.height);
  for (let py = 0; py < s.height; py++)
    for (let px = 0; px < s.width; px++) {
      const [r,g,b,a] = getPx(s, px, py);
      setPx(d, px, py, r, g, b, a);
    }
  return d;
}

function drawGlow(png, cx, cy, radius, color, maxAlpha) {
  const [cr, cg, cb] = color;
  for (let py = cy - radius; py <= cy + radius; py++) {
    for (let px = cx - radius; px <= cx + radius; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist > radius) continue;
      const t = dist / radius;
      const a = Math.round(maxAlpha * (1 - t*t));
      if (a > 0) blendPx(png, px, py, cr, cg, cb, a);
    }
  }
}

function drawEdgeGlow(png, color, intensity) {
  const [cr, cg, cb] = color;
  const w = png.width, h = png.height;

  for (let py = 1; py < h-1; py++) {
    for (let px = 1; px < w-1; px++) {
      const [r,g,b,a] = getPx(png, px, py);
      if (a < 50) continue;
      const neighbors = [
        getPx(png, px-1, py),
        getPx(png, px+1, py),
        getPx(png, px, py-1),
        getPx(png, px, py+1)
      ];
      let edge = 0;
      for (const [,,_,na] of neighbors) {
        if (na < 50) edge += 0.25;
      }
      if (edge > 0) {
        const ga = Math.round(intensity * edge);
        blendPx(png, px, py, cr, cg, cb, ga);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const [,,_,na2] = getPx(png, px+dx, py+dy);
            if (na2 < 50) {
              blendPx(png, px+dx, py+dy, cr, cg, cb, Math.round(ga * 0.5));
            }
          }
        }
      }
    }
  }
}

function addParticles(png, cx, cy, count, color, spread) {
  const [cr, cg, cb] = color;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * spread;
    const px = Math.round(cx + Math.cos(angle) * dist);
    const py = Math.round(cy + Math.sin(angle) * dist);
    const size = Math.random() < 0.3 ? 2 : 1;
    const a = Math.round(150 + Math.random()*105);
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        blendPx(png, px+dx, py+dy, cr, cg, cb, a);
      }
    }
  }
}

function drawScanLine(png, y, color, alpha) {
  const [cr,cg,cb] = color;
  for (let px = 8; px < png.width-8; px++) {
    const dx = px - png.width/2;
    const fade = 1 - Math.abs(dx)/(png.width/2-8);
    const a = Math.round(alpha * Math.max(0,fade));
    if (a > 0) blendPx(png, px, y, cr,cg,cb,a);
  }
}

function drawSparks(png, cx, cy, count, color) {
  const [cr,cg,cb] = color;
  for (let i = 0; i < count; i++) {
    const angle = Math.random()*Math.PI*2;
    const dist = 2+Math.random()*10;
    const px = Math.round(cx+Math.cos(angle)*dist);
    const py = Math.round(cy+Math.sin(angle)*dist);
    blendPx(png, px, py, cr,cg,cb, 200);
  }
}

const f1 = clonePNG(cabinet); save(f1, '破译帧1.png');

const f2 = clonePNG(cabinet);
drawScanLine(f2, 55, [0,255,100], 160);
drawScanLine(f2, 57, [100,255,150], 80);
drawSparks(f2, 48, 55, 5, [0,255,100]);
save(f2, '破译帧2.png');

const f3 = clonePNG(cabinet);
drawGlow(f3, 48, 52, 20, [0,255,100], 140);
for (let i = 0; i < 15; i++) drawSparks(f3, 40+Math.random()*16, 42+Math.random()*20, 1, [0,255,150]);
drawScanLine(f3, 60, [0,255,100], 100);
save(f3, '破译帧3.png');

const f4 = clonePNG(cabinet);
drawEdgeGlow(f4, [255,200,50], 100);
drawGlow(f4, 48, 52, 25, [255,180,30], 80);
drawGlow(f4, 76, 80, 15, [255,200,50], 60);
addParticles(f4, 48, 70, 15, [255,220,80], 30);
save(f4, '破译帧4.png');

const f5 = clonePNG(cabinet);
drawEdgeGlow(f5, [255,220,80], 180);
drawGlow(f5, 48, 60, 45, [255,220,80], 180);
drawGlow(f5, 48, 72, 35, [255,200,50], 150);
for (let py = 0; py < f5.height; py++) {
  for (let px = 0; px < f5.width; px++) {
    const dx = px - 48, dy = py - 65;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 30) {
      const t = dist/30;
      const a = Math.round(120 * (1-t*t));
      blendPx(f5, px, py, 255, 240, 150, a);
    }
  }
}
addParticles(f5, 48, 65, 60, [255,240,100], 50);
addParticles(f5, 48, 65, 30, [255,200,50], 40);
save(f5, '破译帧5.png');

console.log('\n=== Lockpick frames regenerated ===');
