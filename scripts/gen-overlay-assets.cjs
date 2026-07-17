const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '最终素材', 'UI');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function createPNG(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i]=0; png.data[i+1]=0; png.data[i+2]=0; png.data[i+3]=0; }
  return png;
}
function setPx(png,x,y,r,g,b,a){if(x<0||x>=png.width||y<0||y>=png.height)return;const i=(y*png.width+x)*4;png.data[i]=r;png.data[i+1]=g;png.data[i+2]=b;png.data[i+3]=a;}
function getPx(png,x,y){if(x<0||x>=png.width||y<0||y>=png.height)return[0,0,0,0];const i=(y*png.width+x)*4;return[png.data[i],png.data[i+1],png.data[i+2],png.data[i+3]];}
function blendPx(png,x,y,r,g,b,a){const[br,bg,bb,ba]=getPx(png,x,y);const sa=a/255,da=ba/255;const oa=sa+da*(1-sa);if(oa<0.001)return;setPx(png,x,y,Math.round((r*sa+br*da*(1-sa))/oa),Math.round((g*sa+bg*da*(1-sa))/oa),Math.round((b*sa+bb*da*(1-sa))/oa),Math.round(oa*255));}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function save(png,f){const buf=PNG.sync.write(png);fs.writeFileSync(path.join(OUT_DIR,f),buf);console.log(`  saved ${f} (${png.width}x${png.height})`);}

function loadPNG(filepath) {
  const buf = fs.readFileSync(filepath);
  return PNG.sync.read(buf);
}

function drawGlowingEye(png, cx, cy, radius) {
  for (let py = cy - radius*3; py <= cy + radius*3; py++) {
    for (let px = cx - radius*3; px <= cx + radius*3; px++) {
      const dx = px - cx, dy = py - cy;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < radius) {
        const t = dist / radius;
        if (t < 0.4) {
          setPx(png, px, py, 20, 0, 0, 255);
        } else if (t < 0.7) {
          const a = Math.round(255 * (1 - (t-0.4)/0.3));
          setPx(png, px, py, 180, 0, 0, a);
        } else {
          const a = Math.round(200 * (1 - (t-0.7)/0.3));
          blendPx(png, px, py, 255, 30, 30, a);
        }
      } else if (dist < radius * 2.5) {
        const t = (dist - radius) / (radius * 1.5);
        const eased = 1 - t*t*(3-2*t);
        const a = Math.round(120 * eased);
        if (a > 0) blendPx(png, px, py, 255, 20, 20, a);
      }
    }
  }

  setPx(png, cx, cy, 0, 0, 0, 255);
  setPx(png, cx-1, cy, 0, 0, 0, 255);
  setPx(png, cx+1, cy, 0, 0, 0, 255);
  setPx(png, cx, cy-1, 0, 0, 0, 255);
  setPx(png, cx, cy+1, 0, 0, 0, 255);

  for (let angle = 0; angle < 8; angle++) {
    const a = (angle / 8) * Math.PI * 2 + 0.3;
    for (let r = radius+1; r < radius*2; r++) {
      const px = Math.round(cx + Math.cos(a)*r);
      const py = Math.round(cy + Math.sin(a)*r);
      const t = (r - radius) / radius;
      blendPx(png, px, py, 200, 0, 0, Math.round(60 * (1-t)));
    }
  }
}

function genBloodEye() {
  console.log('Generating 血瞳.png...');
  const size = 128;
  const png = createPNG(size, size);

  const headPath = path.join(__dirname, '..', '最终素材', '角色动作', '但宇轩-头部部件.png');
  const head = loadPNG(headPath);

  let eyePositions = [];
  let minDist = Infinity;

  for (let cy = 30; cy < 80; cy++) {
    for (let cx = 45; cx < 75; cx++) {
      const [r,g,b,a] = getPx(head, cx, cy);
      if (a > 100 && r < 80 && g < 60 && b < 60) {
        let darkCount = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const [pr,pg,pb,pa] = getPx(head, cx+dx, cy+dy);
            if (pa > 100 && pr < 80 && pg < 60 && pb < 60) darkCount++;
          }
        }
        if (darkCount >= 8) {
          let tooClose = false;
          for (const [ex, ey] of eyePositions) {
            if (Math.sqrt((cx-ex)**2 + (cy-ey)**2) < 8) { tooClose = true; break; }
          }
          if (!tooClose) {
            eyePositions.push([cx, cy]);
          }
        }
      }
    }
  }

  console.log(`  Found ${eyePositions.length} eye positions:`, JSON.stringify(eyePositions));

  if (eyePositions.length >= 2) {
    eyePositions = eyePositions.slice(0, 2);
  } else if (eyePositions.length === 1) {
    const [ex, ey] = eyePositions[0];
    eyePositions = [[ex-4, ey-6], [ex+4, ey+6]];
  } else {
    eyePositions = [[54, 48], [60, 60]];
  }

  for (const [ex, ey] of eyePositions) {
    drawGlowingEye(png, ex, ey, 4);
  }

  for (let i = 0; i < 30; i++) {
    for (const [ex, ey] of eyePositions) {
      const angle = Math.random() * Math.PI * 2;
      const len = 5 + Math.random() * 12;
      const px = Math.round(ex + Math.cos(angle)*len);
      const py = Math.round(ey + Math.sin(angle)*len);
      const a = Math.round(80 * (1 - len/17));
      if (a > 0) blendPx(png, px, py, 200, 0, 0, a);
    }
  }

  save(png, '血瞳.png');
}

function genLockpickFrames() {
  console.log('Generating lockpick animation frames...');
  const cabinetPath = path.join(__dirname, '..', '最终素材', '手机柜-正着.png');
  const src = loadPNG(cabinetPath);
  console.log(`  Source cabinet: ${src.width}x${src.height}`);

  const TARGET_W = 96;
  const TARGET_H = 144;

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

  function drawScanLine(png, y, color, alpha) {
    const [cr, cg, cb] = color;
    for (let px = 8; px < png.width - 8; px++) {
      const dx = px - png.width/2;
      const fade = 1 - Math.abs(dx) / (png.width/2 - 8);
      const a = Math.round(alpha * Math.max(0, fade));
      if (a > 0) blendPx(png, px, y, cr, cg, cb, a);
      if (y > 0) blendPx(png, px, y-1, cr, cg, cb, Math.round(a*0.5));
      if (y < png.height-1) blendPx(png, px, y+1, cr, cg, cb, Math.round(a*0.5));
    }
  }

  function drawSparks(png, cx, cy, count, color) {
    const [cr, cg, cb] = color;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 15;
      const px = Math.round(cx + Math.cos(angle)*dist);
      const py = Math.round(cy + Math.sin(angle)*dist);
      const len = Math.floor(1 + Math.random() * 4);
      const a = Math.round(200 * (1 - dist/18));
      for (let j = 0; j < len; j++) {
        const jx = Math.round(px - Math.cos(angle)*j);
        const jy = Math.round(py - Math.sin(angle)*j);
        blendPx(png, jx, jy, cr, cg, cb, Math.max(0, a - j*40));
      }
    }
  }

  function drawGlowRect(png, x, y, w, h, color, alpha) {
    const [cr, cg, cb] = color;
    for (let py = y-4; py < y+h+4; py++) {
      for (let px = x-4; px < x+w+4; px++) {
        const dx = Math.max(x-px, px-(x+w-1), 0);
        const dy = Math.max(y-py, py-(y+h-1), 0);
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 5) {
          const a = Math.round(alpha * (1 - dist/5));
          blendPx(png, px, py, cr, cg, cb, a);
        }
      }
    }
  }

  function drawOpenDoor(png, doorX, doorY, doorW, doorH, openAmount) {
    for (let py = doorY; py < doorY + doorH; py++) {
      for (let px = doorX; px < doorX + doorW; px++) {
        const [r,g,b,a] = getPx(png, px, py);
        if (a > 0) {
          setPx(png, px, py, 0, 0, 0, 0);
        }
      }
    }

    const newW = Math.max(2, Math.round(doorW * (1 - openAmount)));
    for (let py = doorY; py < doorY + doorH; py++) {
      for (let px = doorX; px < doorX + newW; px++) {
        const srcX = Math.round(doorX + (px - doorX) / Math.max(0.01, 1 - openAmount*0.5));
        const [r,g,b,a] = getPx(cabinet, clamp(srcX,0,cabinet.width-1), py);
        setPx(png, px, py, r, g, b, a);
      }
    }

    const lightX = doorX + newW;
    const lightW = doorW - newW;
    if (lightW > 0) {
      for (let py = doorY; py < doorY + doorH; py++) {
        for (let px = lightX; px < doorX + doorW; px++) {
          const t = (px - lightX) / Math.max(1, lightW);
          const a = Math.round(200 * (0.5 + 0.5*t) * openAmount);
          const intensity = Math.round(200 + 55*t);
          blendPx(png, px, py, intensity, Math.round(intensity*0.7), Math.round(intensity*0.2), a);
        }
      }
      drawGlowRect(png, lightX-3, doorY, Math.min(lightW+6, png.width-lightX-1), doorH, [255,220,80], Math.round(80*openAmount));
    }
  }

  function clonePNG(src) {
    const dst = createPNG(src.width, src.height);
    for (let py = 0; py < src.height; py++) {
      for (let px = 0; px < src.width; px++) {
        const [r,g,b,a] = getPx(src, px, py);
        setPx(dst, px, py, r, g, b, a);
      }
    }
    return dst;
  }

  const frame1 = clonePNG(cabinet);
  save(frame1, '破译帧1.png');

  const frame2 = clonePNG(cabinet);
  drawScanLine(frame2, 50, [0, 255, 100], 180);
  drawScanLine(frame2, 52, [100, 255, 150], 100);
  for (let i = 0; i < 5; i++) {
    drawSparks(frame2, 48, 50, 3, [0,255,100]);
  }
  save(frame2, '破译帧2.png');

  const frame3 = clonePNG(cabinet);
  drawGlowRect(frame3, 35, 40, 26, 30, [0, 255, 100], 150);
  for (let i = 0; i < 20; i++) {
    drawSparks(frame3, 40 + Math.random()*16, 45 + Math.random()*20, 1, [0,255,150]);
  }
  drawScanLine(frame3, 55, [0, 255, 100], 120);
  save(frame3, '破译帧3.png');

  const frame4 = clonePNG(cabinet);
  drawOpenDoor(frame4, 28, 20, 40, 80, 0.4);
  for (let i = 0; i < 10; i++) {
    drawSparks(frame4, 35 + Math.random()*20, 30 + Math.random()*40, 1, [255,220,80]);
  }
  drawGlowRect(frame4, 24, 16, 48, 88, [255,200,50], 60);
  save(frame4, '破译帧4.png');

  const frame5 = clonePNG(cabinet);
  drawOpenDoor(frame5, 20, 10, 56, 100, 0.75);
  drawGlowRect(frame5, 10, 5, 76, 110, [255,220,80], 100);
  for (let i = 0; i < 25; i++) {
    drawSparks(frame5, 20 + Math.random()*56, 15 + Math.random()*90, 1, [255,240,100]);
  }
  for (let py = 0; py < frame5.height; py++) {
    for (let px = 0; px < frame5.width; px++) {
      const dx = px - 48, dy = py - 60;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 50 && Math.random() < 0.1) {
        blendPx(frame5, px, py, 255, 240, 150, Math.round(30*(1-dist/50)));
      }
    }
  }
  save(frame5, '破译帧5.png');
}

console.log('=== Generating overlay & animation assets ===\n');
genBloodEye();
genLockpickFrames();
console.log('\n=== Done ===');
