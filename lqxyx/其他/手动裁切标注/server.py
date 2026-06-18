#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
MATERIAL_DIR = PROJECT_ROOT / "素材"
OUTPUT_DIR = PROJECT_ROOT / "导出精灵"
CROP_DIR = ROOT / "crops"
META_PATH = ROOT / "items.json"

SOURCES = ["杨云-红边.png", "杨云-蓝边.png", "董继豪.png"]
ACTIONS = ["上-静止", "下-静止", "左-静止", "右-静止", "上-左腿", "上-右腿", "下-左腿", "下-右腿", "左-迈腿", "右-迈腿"]
SAFE_NAME_RE = re.compile(r"[^\w\-.\u4e00-\u9fff]+", re.UNICODE)


def safe_name(name: str) -> str:
    name = unquote(name).strip().replace("/", "_").replace("\\", "_")
    name = SAFE_NAME_RE.sub("_", name)
    return name[:120] or "sprite"


def parse_source(filename: str) -> tuple[str, str]:
    stem = Path(filename).stem
    if stem.endswith("-sprite"):
        return stem[:-len("-sprite")], ""
    if "-" in stem:
        character, color = stem.split("-", 1)
    else:
        character, color = stem, ""
    return character, color


def components_from_alpha(im: Image.Image, count: int = 10) -> list[dict]:
    arr = np.array(im.convert("RGBA"))
    alpha = arr[:, :, 3]
    h, w = alpha.shape
    mask = alpha > 8
    seen = np.zeros(mask.shape, dtype=bool)
    comps: list[dict] = []
    for sy in range(h):
        for sx in range(w):
            if seen[sy, sx] or not mask[sy, sx]:
                continue
            stack = [(sx, sy)]
            seen[sy, sx] = True
            minx = maxx = sx
            miny = maxy = sy
            area = 0
            while stack:
                x, y = stack.pop()
                area += 1
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (not seen[ny, nx]) and mask[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((nx, ny))
            bw = maxx - minx + 1
            bh = maxy - miny + 1
            if area > 100 and bw > 10 and bh > 20:
                comps.append({"area": area, "x": minx, "y": miny, "w": bw, "h": bh})
    if len(comps) < count:
        raise RuntimeError(f"只检测到 {len(comps)} 个角色块，少于 {count}")
    chosen = sorted(comps, key=lambda b: b["area"], reverse=True)[:count]
    chosen.sort(key=lambda b: (b["y"], b["x"]))
    rows: list[dict] = []
    row_tol = max(24, h * 0.06)
    for comp in chosen:
        row = next((r for r in rows if abs(r["avg_y"] - comp["y"]) < row_tol), None)
        if row is None:
            row = {"avg_y": comp["y"], "items": []}
            rows.append(row)
        row["items"].append(comp)
        row["avg_y"] = sum(i["y"] for i in row["items"]) / len(row["items"])
    rows.sort(key=lambda r: r["avg_y"])
    boxes: list[dict] = []
    for row in rows:
        row["items"].sort(key=lambda b: b["x"])
        boxes.extend(row["items"])
    return boxes


def padded_box(box: dict, im_w: int, im_h: int, pad: int = 3) -> dict:
    x = max(0, int(box["x"]) - pad)
    y = max(0, int(box["y"]) - pad)
    x2 = min(im_w - 1, int(box["x"]) + int(box["w"]) - 1 + pad)
    y2 = min(im_h - 1, int(box["y"]) + int(box["h"]) - 1 + pad)
    return {"x": x, "y": y, "w": x2 - x + 1, "h": y2 - y + 1}


def body_anchor_x(crop: Image.Image) -> float:
    arr = np.array(crop.convert("RGBA"))
    h, w = arr.shape[:2]
    y1 = int(h * 0.45)
    y2 = max(y1 + 1, int(h * 0.95))
    ys, xs = np.where(arr[y1:y2, :, 3] > 8)
    if len(xs) < 20:
        return w / 2
    return float(np.median(xs))


def normalize_crop(src: Image.Image, box: dict, out_w: int = 128, out_h: int = 128, foot_pad: int = 4) -> Image.Image:
    crop = src.crop((box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]))
    anchor = body_anchor_x(crop)
    half_w = max(anchor, crop.width - anchor, 1)
    scale = min(1.0, out_w / (half_w * 2), max(1, out_h - foot_pad) / crop.height)
    dw = max(1, round(crop.width * scale))
    dh = max(1, round(crop.height * scale))
    dx = round(out_w / 2 - anchor * scale)
    dy = round(out_h - foot_pad - dh)
    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    resized = crop.resize((dw, dh), Image.Resampling.NEAREST)
    out.alpha_composite(resized, (dx, dy))
    return out


def generate_crops() -> list[dict]:
    CROP_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict] = []
    for filename in SOURCES:
        p = MATERIAL_DIR / filename
        if not p.exists():
            continue
        character, color = parse_source(filename)
        src = Image.open(p).convert("RGBA")
        comps = components_from_alpha(src, 10)
        for idx, comp in enumerate(comps, 1):
            box = padded_box(comp, src.width, src.height, 3)
            out = normalize_crop(src, box)
            item_id = f"{Path(filename).stem}-{idx:02d}"
            crop_name = f"{item_id}.png"
            out.save(CROP_DIR / crop_name)
            items.append({
                "id": item_id,
                "source": filename,
                "character": character,
                "color": color,
                "index": idx,
                "box": box,
                "cropUrl": f"/crops/{crop_name}",
                "suggestedAction": ACTIONS[idx - 1] if idx <= len(ACTIONS) else f"动作{idx}",
            })
    META_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    return items


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        rel = path.lstrip("/") or "index.html"
        return str((ROOT / rel).resolve())

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/items"):
            items = json.loads(META_PATH.read_text(encoding="utf-8")) if META_PATH.exists() else generate_crops()
            self.send_json({"ok": True, "items": items, "actions": ACTIONS})
            return
        if self.path.startswith("/api/regenerate"):
            items = generate_crops()
            self.send_json({"ok": True, "items": items})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/api/save"):
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            try:
                saved = self.save_labeled(payload)
            except Exception as exc:  # noqa: BLE001
                self.send_json({"ok": False, "error": str(exc)}, status=400)
                return
            self.send_json({"ok": True, "saved": saved})
            return
        self.send_error(404)

    def send_json(self, obj: object, status: int = 200) -> None:
        data = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def save_labeled(self, payload: dict) -> list[str]:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        items = json.loads(META_PATH.read_text(encoding="utf-8"))
        by_id = {i["id"]: i for i in items}
        labels = payload.get("labels") or []
        saved: list[str] = []
        for lab in labels:
            item_id = str(lab.get("id") or "")
            action = safe_name(str(lab.get("action") or "").strip())
            if not action:
                continue
            item = by_id[item_id]
            character = safe_name(item["character"])
            color = safe_name(item.get("color") or "")
            filename = f"{character}-{color}-{action}.png" if color else f"{character}-{action}.png"
            src = ROOT / item["cropUrl"].lstrip("/")
            dst = OUTPUT_DIR / filename
            shutil.copyfile(src, dst)
            saved.append(str(dst))
        if not saved:
            raise ValueError("没有可保存的动作名")
        return saved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=16623)
    args = parser.parse_args()
    os.chdir(ROOT)
    items = generate_crops()
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Manual sprite labeler: http://127.0.0.1:{args.port}")
    print(f"Generated crops: {len(items)} -> {CROP_DIR}")
    print(f"Outputs: {OUTPUT_DIR}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
