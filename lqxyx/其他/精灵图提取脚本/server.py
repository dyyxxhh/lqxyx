#!/usr/bin/env python3
"""临时精灵图提取工具服务器。

启动：python3 server.py --port 16534
打开：http://127.0.0.1:16534
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
MATERIAL_DIR = PROJECT_ROOT / "素材"
OUTPUT_DIR = PROJECT_ROOT / "导出精灵"

SAFE_NAME_RE = re.compile(r"[^\w\-.\u4e00-\u9fff]+", re.UNICODE)


def safe_name(name: str) -> str:
    name = unquote(name).strip().replace("/", "_").replace("\\", "_")
    name = SAFE_NAME_RE.sub("_", name)
    return name[:120] or "sprite"


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        # Serve everything from the script directory.
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        rel = path.lstrip("/") or "index.html"
        return str((ROOT / rel).resolve())

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/api/images"):
            self.send_json(self.list_images())
            return
        if self.path.startswith("/materials/"):
            rel = unquote(self.path[len("/materials/"):].split("?", 1)[0])
            p = (MATERIAL_DIR / rel).resolve()
            if not str(p).startswith(str(MATERIAL_DIR.resolve())) or not p.is_file():
                self.send_error(404)
                return
            self.serve_file(p)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path.startswith("/api/save"):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length)
            try:
                payload = json.loads(body.decode("utf-8"))
                saved = self.save_sprite(payload)
            except Exception as exc:  # noqa: BLE001
                self.send_json({"ok": False, "error": str(exc)}, status=400)
                return
            self.send_json({"ok": True, "saved": saved})
            return
        self.send_error(404)

    def serve_file(self, p: Path) -> None:
        ctype = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(p.stat().st_size))
        self.end_headers()
        with p.open("rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def send_json(self, obj: object, status: int = 200) -> None:
        data = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def list_images(self) -> dict:
        exts = {".png", ".jpg", ".jpeg", ".webp"}
        files = []
        if MATERIAL_DIR.exists():
            for p in sorted(MATERIAL_DIR.iterdir()):
                if p.is_file() and p.suffix.lower() in exts:
                    files.append({"name": p.name, "url": f"/materials/{p.name}"})
        return {"ok": True, "files": files}

    def save_sprite(self, payload: dict) -> list[str]:
        # Save data URLs posted by browser canvas export.
        import base64

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        character = safe_name(str(payload.get("character") or "角色"))
        action = safe_name(str(payload.get("action") or "sprite"))
        color = safe_name(str(payload.get("color") or ""))
        suffix = f"-{color}" if color else ""
        ts = time.strftime("%Y%m%d-%H%M%S")
        images = payload.get("images") or []
        if not isinstance(images, list) or not images:
            raise ValueError("images 为空")
        saved: list[str] = []
        for idx, item in enumerate(images, 1):
            data_url = str(item.get("dataUrl") or "")
            item_action = safe_name(str(item.get("action") or action))
            if not data_url.startswith("data:image/png;base64,"):
                raise ValueError("只支持 PNG data URL")
            raw = base64.b64decode(data_url.split(",", 1)[1])
            filename = f"{character}{suffix}-{item_action}-{ts}.png" if len(images) == 1 else f"{character}{suffix}-{idx:02d}-{item_action}-{ts}.png"
            out = OUTPUT_DIR / filename
            out.write_bytes(raw)
            saved.append(str(out))
        return saved


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=16534)
    args = parser.parse_args()
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Sprite extractor: http://127.0.0.1:{args.port}")
    print(f"Materials: {MATERIAL_DIR}")
    print(f"Outputs:   {OUTPUT_DIR}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
