const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', '最终素材', 'UI');
const f4 = PNG.sync.read(fs.readFileSync(path.join(OUT_DIR, '破译帧4.png')));

function createPNG(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) { png.data[i]=0; png.data[i+1]=0; png.data[i+2]=0; png.data[i+3]=0; }
  return png;
}
function setPx(png,x,y,r,g,b,a){if(x<0||x>=png.width||y<0||y>=png.height)return;const i=(y*png.width+x)*4;png.data[i]=r;png.data[i+1]=g;png.data[i+2]=b;png.data[i+3]=a;}
function getPx(png,x,y){if(x<0||x>=png.width||y<0||y>=png.height)return[0,0,0,0];const i=(y*png.width+x)*4;return[png.data[i],png.data[i+1],png.data[i+2],png.data[i+3]];}
function blendPx(png,x,y,r,g,b,a){const[br,bg,bb,ba]=getPx(png,x,y);const sa=a/255,da=ba/255;const oa=sa+da*(1-sa);if(oa<0.001)return;setPx(png,x,y,Math.round((r*sa+br*da*(1-sa))/oa),Math.round((g*sa+bg*da*(1-sa))/oa),Math.round((b*sa+bb*da*(1-sa))/oa),Math.round(oa*255));}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function save(png,f){const buf=PNG.sync.write(png);fs.writeFileSync(path.join(OUT_DIR,f),buf);console.log(`  saved ${f}`);}
function loadPNG(fp){return PNG.sync.read(fs.readFileSync(fp));}

const TARGET_W = 96, TARGET_H = 144;
const src = loadPNG(path.join(__dirname, '..', '最终素材', '手机柜-正着.png'));
function scaleImage(src, tw, th) {
  const dst = createPNG(tw, th);
  const sx = src.width/tw, sy = src.height/th;
  for (let py=0;py<th;py++)for(let px=0;px<tw;px++){
    const[r,g,b,a]=getPx(src,clamp(Math.floor(px*sx),0,src.width-1),clamp(Math.floor(py*sy),0,src.height-1));
    setPx(dst,px,py,r,g,b,a);
  }
  return dst;
}
const cabinet = scaleImage(src, TARGET_W, TARGET_H);
function clonePNG(s){const d=createPNG(s.width,s.height);for(let py=0;py<s.height;py++)for(let px=0;px<s.width;px++){const[r,g,b,a]=getPx(s,px,py);setPx(d,px,py,r,g,b,a);}return d;}

function drawRadialGlow(png, cx, cy, maxR, color) {
  const [cr,cg,cb] = color;
  for (let py = cy-maxR; py <= cy+maxR; py++) {
    for (let px = cx-maxR; px <= cx+maxR; px++) {
      const dx=px-cx, dy=py-cy;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if (dist > maxR) continue;
      const t = dist/maxR;
      const a = Math.round(200 * (1-t*t)*(1-t*t));
      if (a > 0) blendPx(png, px, py, cr, cg, cb, a);
    }
  }
}

function drawEdgeGlow(png, color, intensity) {
  const [cr,cg,cb]=color;
  for(let py=1;py<png.height-1;py++)for(let px=1;px<png.width-1;px++){
    const[r,g,b,a]=getPx(png,px,py);
    if(a<50)continue;
    let edge=0;
    for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1]]){const[,,_,na]=getPx(png,px+dx,py+dy);if(na<50)edge+=0.25;}
    if(edge>0){const ga=Math.round(intensity*edge);blendPx(png,px,py,cr,cg,cb,ga);}
  }
}

function hash(x,y){let h=x*374761393+y*668265263;h=(h^(h>>13))*1274126177;return((h^(h>>16))&0x7fffffff)/0x7fffffff;}

const f5 = clonePNG(cabinet);
drawEdgeGlow(f5, [255,220,80], 160);
drawRadialGlow(f5, 48, 58, 50, [255,220,80]);
drawRadialGlow(f5, 48, 72, 35, [255,200,40]);

for(let i=0;i<80;i++){
  const angle = hash(i,1)*Math.PI*2;
  const dist = 8 + hash(i,2)*45;
  const px = Math.round(48 + Math.cos(angle)*dist);
  const py = Math.round(65 + Math.sin(angle)*dist*0.8);
  if(px<0||px>=f5.width||py<0||py>=f5.height)continue;
  const sz = hash(i,3) > 0.6 ? 2 : 1;
  const a = Math.round(200 * (1 - dist/53));
  for(let dy=0;dy<sz;dy++)for(let dx=0;dx<sz;dx++){
    const bright = hash(i,4)>0.3 ? 255 : 200;
    blendPx(f5, px+dx, py+dy, bright, Math.round(bright*0.85+20), Math.round(bright*0.3), a);
  }
}

for(let py=0;py<f5.height;py++){
  for(let px=0;px<f5.width;px++){
    const dx=px-48,dy=py-60;
    const dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<25){
      const t=dist/25;
      const a=Math.round(100*(1-t*t));
      blendPx(f5,px,py,255,250,200,a);
    }
  }
}

save(f5, '破译帧5.png');
console.log('Done');
