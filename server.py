#!/usr/bin/env python3
"""ComicHero server.

Serves the web reader from ./static and reads comics straight out of the
.zip / .cbz files in your comics folder, without unpacking them. Reading
progress, bookmarks and ratings are kept in ./state.json.

    python3 server.py [COMICS_DIR] [--port 7777] [--host 0.0.0.0]

Settings come from, in order of priority: the command line, environment
variables (COMICHERO_DIR, COMICHERO_PORT, COMICHERO_HOST), then config.json.
"""

import argparse
import errno
import json
import mimetypes
import os
import re
import socket
import threading
import time
import unicodedata
import zipfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse

HERE = Path(__file__).resolve().parent
STATIC = HERE / "static"
STATE_FILE = HERE / "state.json"
CONFIG_FILE = HERE / "config.json"

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}
CONTAINER_DIRS = {"chapter", "chapters", "pages"}

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")
mimetypes.add_type("application/javascript", ".js")


# ---------- reading a comic zip ----------

def natural_key(text):
    return [int(p) if p.isdigit() else p.lower() for p in re.split(r"(\d+)", text)]


def first_number(text):
    m = re.search(r"\d+(?:\.\d+)?", text)
    if not m:
        return None
    n = float(m.group())
    return int(n) if n.is_integer() else n


def is_junk(name):
    parts = name.split("/")
    return (
        name.endswith("/")
        or parts[0] == "__MACOSX"
        or any(p.startswith("._") or p in (".DS_Store", "Thumbs.db") for p in parts)
    )


def common_root(names):
    """'folder/' when every file sits inside one top-level folder, else ''."""
    roots = {n.split("/", 1)[0] + "/" if "/" in n else "" for n in names}
    return roots.pop() if len(roots) == 1 else ""


def from_manifest(manifest, root, files):
    def resolve(f):
        return root + f if f and root + f in files else None

    chapters = []
    for i, ch in enumerate(manifest.get("chapters") or []):
        number = ch.get("number")
        if not isinstance(number, (int, float)):
            number = first_number(str(number or "")) or i + 1
        pages = []
        for p in ch.get("pages") or []:
            p = {"file": p} if isinstance(p, str) else p
            f = resolve(p.get("file"))
            if f:
                pages.append({"file": f, "w": p.get("w"), "h": p.get("h")})
        if pages:
            chapters.append({"number": number, "title": ch.get("title") or f"Chapter {number}", "pages": pages})
    chapters.sort(key=lambda c: c["number"])
    series = manifest.get("series") or {}
    return {
        "title": series.get("title"),
        "slug": series.get("slug"),
        "cover": resolve(series.get("cover")),
        "chapters": chapters,
    }


def from_folders(root, names):
    images = sorted(
        (n[len(root):] for n in names if PurePosixPath(n).suffix.lower() in IMAGE_EXT),
        key=natural_key,
    )
    cover = next((n for n in images if re.fullmatch(r"cover\.[a-z]+", n, re.I)), None)
    cover = cover or next((n for n in images if n.lower().startswith("cover/")), None)

    groups = {}
    for img in images:
        if img == cover or img.lower().startswith("cover/"):
            continue
        groups.setdefault(str(PurePosixPath(img).parent), []).append(img)

    chapters = []
    for i, d in enumerate(sorted(groups, key=natural_key)):
        name = "" if d == "." else PurePosixPath(d).name
        container = name.lower() in CONTAINER_DIRS
        number = (None if container else first_number(name)) or i + 1
        title = name if name and not container and not name.isdigit() else f"Chapter {number}"
        chapters.append({
            "number": number,
            "title": title,
            "pages": [{"file": root + f, "w": None, "h": None} for f in groups[d]],
        })
    chapters.sort(key=lambda c: c["number"])
    return {"title": None, "slug": None, "cover": root + cover if cover else None, "chapters": chapters}


def describe(zf, fallback_title):
    names = [n for n in zf.namelist() if not is_junk(n)]
    files = set(names)
    root = common_root(names)
    comic = None
    if root + "manifest.json" in files:
        try:
            comic = from_manifest(json.loads(zf.read(root + "manifest.json")), root, files)
        except (ValueError, KeyError, AttributeError):
            comic = None
        if comic and not comic["chapters"]:
            comic = None
    if comic is None:
        comic = from_folders(root, names)
    if not comic["cover"] and comic["chapters"]:
        comic["cover"] = comic["chapters"][0]["pages"][0]["file"]
    comic["title"] = comic["title"] or fallback_title
    return comic


def slugify(text):
    # "Café" -> "cafe": split accents off their letters, then drop them
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "comic"


class Series:
    """One archive on disk, opened lazily and kept open for page reads."""

    def __init__(self, path: Path, slug_taken=lambda s: False):
        self.path = path
        self.lock = threading.Lock()
        self._zip = None
        st = path.stat()
        self.mtime, self.size = st.st_mtime, st.st_size
        comic = describe(self.zip, path.stem)
        if not comic["chapters"]:
            raise ValueError("no pages found")
        slug = slugify(comic["slug"] or path.stem)
        base, n = slug, 2
        while slug_taken(slug):
            slug, n = f"{base}-{n}", n + 1
        self.slug = slug
        self.title = comic["title"]
        self.cover = comic["cover"]
        self.chapters = comic["chapters"]
        self.files = {p["file"] for c in self.chapters for p in c["pages"]} | {self.cover}

    @property
    def zip(self):
        if self._zip is None:
            self._zip = zipfile.ZipFile(self.path)
        return self._zip

    def read(self, name: str) -> bytes:
        with self.lock:
            return self.zip.read(name)

    def page_url(self, file):
        return f"/page/{self.slug}/{file}"

    def summary(self):
        numbers = [c["number"] for c in self.chapters]
        return {
            "slug": self.slug,
            "title": self.title,
            "chapterCount": len(self.chapters),
            "firstChapter": min(numbers),
            "lastChapter": max(numbers),
            "latest": sorted(numbers, reverse=True)[:3],
            "pageCount": sum(len(c["pages"]) for c in self.chapters),
            "added": self.mtime,
            "size": self.size,
        }

    def detail(self):
        data = self.summary()
        data["chapters"] = [
            {
                "number": c["number"],
                "title": c["title"],
                "pages": [{"file": p["file"], "w": p["w"], "h": p["h"]} for p in c["pages"]],
            }
            for c in self.chapters
        ]
        return data


class Library:
    def __init__(self, folder: Path):
        self.folder = folder
        self.series = {}
        self.scan()

    def find(self):
        for path in sorted(self.folder.rglob("*"), key=lambda p: natural_key(str(p))):
            if path.suffix.lower() in (".zip", ".cbz") and path.is_file() and not any(
                part.startswith(".") for part in path.relative_to(self.folder).parts
            ):
                yield path

    def scan(self):
        known = {s.path: s for s in self.series.values()}
        found = {}
        for path in self.find():
            s = known.get(path)
            if not s or s.mtime != path.stat().st_mtime:
                try:
                    s = Series(path, slug_taken=found.__contains__)
                except (zipfile.BadZipFile, ValueError, OSError) as e:
                    print(f"skipping {path.name}: {e}")
                    continue
            found[s.slug] = s
        self.series = found
        print(f"library: {len(found)} comics in {self.folder}")


class State:
    """Small JSON store for per-user reading state."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        try:
            self.data = json.loads(path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            self.data = {}
        self.data.setdefault("series", {})
        self.data.setdefault("settings", {})

    def save(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=1))
        tmp.replace(self.path)

    def patch_series(self, slug: str, changes: dict):
        with self.lock:
            entry = self.data["series"].setdefault(slug, {})
            for key, value in changes.items():
                if key == "read":
                    # merge chapter -> timestamp maps; null clears one
                    read = entry.setdefault("read", {})
                    for ch, ts in value.items():
                        if ts is None:
                            read.pop(ch, None)
                        else:
                            read[ch] = ts
                elif value is None:
                    entry.pop(key, None)
                else:
                    entry[key] = value
            self.save()
            return entry

    def patch_settings(self, changes: dict):
        with self.lock:
            self.data["settings"].update(changes)
            self.save()
            return self.data["settings"]


# ---------- HTTP ----------

class Handler(BaseHTTPRequestHandler):
    library: Library
    state: State

    def log_message(self, fmt, *args):
        pass

    def send_bytes(self, body: bytes, ctype: str, cache: str = "no-cache"):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, obj, status=HTTPStatus.OK):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def not_found(self):
        self.send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(length) or b"{}")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        parts = [p for p in path.split("/") if p]

        if parts[:2] == ["api", "library"]:
            return self.send_json({
                "series": [s.summary() for s in self.library.series.values()],
                "state": self.state.data,
            })
        if parts[:2] == ["api", "series"] and len(parts) == 3:
            s = self.library.series.get(parts[2])
            if not s:
                return self.not_found()
            data = s.detail()
            data["state"] = self.state.data["series"].get(s.slug, {})
            return self.send_json(data)
        if parts and parts[0] in ("cover", "page") and len(parts) >= 2:
            s = self.library.series.get(parts[1])
            name = s.cover if s and parts[0] == "cover" else "/".join(parts[2:])
            # only files the comic actually lists can be served
            if not s or not name or name not in s.files:
                return self.not_found()
            ctype = mimetypes.guess_type(name)[0] or "application/octet-stream"
            return self.send_bytes(s.read(name), ctype, "public, max-age=31536000, immutable")

        # static files, falling back to index.html for app routes
        target = (STATIC / path.lstrip("/")).resolve()
        if not target.is_file() or STATIC not in target.parents:
            target = STATIC / "index.html"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_bytes(target.read_bytes(), ctype)

    def do_POST(self):
        parts = [p for p in urlparse(self.path).path.split("/") if p]
        try:
            body = self.read_body()
        except json.JSONDecodeError:
            return self.send_json({"error": "bad json"}, HTTPStatus.BAD_REQUEST)
        if not isinstance(body, dict):
            return self.send_json({"error": "expected an object"}, HTTPStatus.BAD_REQUEST)

        if parts[:2] == ["api", "state"] and len(parts) == 3:
            if parts[2] not in self.library.series:
                return self.not_found()
            return self.send_json(self.state.patch_series(parts[2], body))
        if parts[:2] == ["api", "settings"]:
            return self.send_json(self.state.patch_settings(body))
        if parts[:2] == ["api", "rescan"]:
            self.library.scan()
            return self.send_json({"count": len(self.library.series)})
        self.not_found()


# ---------- startup ----------

def load_config(argv=None, env=os.environ):
    file = {}
    if CONFIG_FILE.exists():
        try:
            file = json.loads(CONFIG_FILE.read_text())
        except json.JSONDecodeError as e:
            raise SystemExit(f"Could not read config.json: {e}")

    ap = argparse.ArgumentParser(description="ComicHero comic reader server")
    ap.add_argument("comics_dir", nargs="?", help="folder with your comic zips")
    ap.add_argument("--port", type=int)
    ap.add_argument("--host")
    args = ap.parse_args(argv)

    comics = args.comics_dir or env.get("COMICHERO_DIR") or file.get("comicsDir") or "~/Comics"
    return {
        "comics_dir": (HERE / Path(comics).expanduser()).resolve(),
        "port": int(args.port or env.get("COMICHERO_PORT") or file.get("port") or 7777),
        "host": args.host or env.get("COMICHERO_HOST") or file.get("host") or "0.0.0.0",
    }


def lan_addresses():
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except socket.gaierror:
        return []
    return sorted({i[4][0] for i in infos if not i[4][0].startswith("127.")})


def main():
    config = load_config()
    if not config["comics_dir"].is_dir():
        raise SystemExit(
            f"Comics folder not found: {config['comics_dir']}\n"
            'Pass it as an argument, or set "comicsDir" in config.json (see config.example.json).'
        )

    t = time.time()
    Handler.library = Library(config["comics_dir"])
    Handler.state = State(STATE_FILE)
    print(f"indexed in {time.time() - t:.1f}s")

    try:
        server = ThreadingHTTPServer((config["host"], config["port"]), Handler)
    except OSError as e:
        if e.errno != errno.EADDRINUSE:
            raise
        raise SystemExit(
            f"port {config['port']} is already in use — ComicHero is probably already running "
            f"at http://localhost:{config['port']}\n(or pick another port with --port)"
        )

    port = config["port"]
    print(f"Open on this computer:   http://localhost:{port}")
    if config["host"] in ("0.0.0.0", ""):
        for ip in lan_addresses():
            print(f"Open from another device: http://{ip}:{port}")
        print("Over Tailscale, use this computer's Tailscale name or 100.x address with the same port.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
