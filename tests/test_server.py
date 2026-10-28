import json
import tempfile
import threading
import unittest
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import server


def write_zip(path, files):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_STORED) as z:
        for name, data in files.items():
            z.writestr(name, data)


def make_library(dir):
    # manifest layout inside a top-level folder, with macOS junk
    manifest = {
        "format": "asura-offline",
        "series": {"title": "Academy’s Undercover Professor", "slug": "aup", "cover": "cover.webp"},
        "chapters": [
            {"number": 2, "title": "Chapter 2", "pages": [{"file": "pages/002/0001.webp", "w": 800, "h": 1200}]},
            {"number": 1, "title": "Chapter 1", "pages": [
                {"file": "pages/001/0001.webp", "w": 800, "h": 533},
                {"file": "pages/001/0002.webp", "w": 800, "h": 14081},
                {"file": "pages/001/missing.webp", "w": 800, "h": 10},
            ]},
        ],
    }
    write_zip(dir / "aup.zip", {
        "aup/manifest.json": json.dumps(manifest),
        "aup/cover.webp": "COVER",
        "aup/._cover.webp": "junk",
        "aup/.DS_Store": "junk",
        "aup/pages/001/0001.webp": "P1-1",
        "aup/pages/001/0002.webp": "P1-2",
        "aup/pages/002/0001.webp": "P2-1",
        "__MACOSX/aup/._cover.webp": "junk",
    })
    # plain folder layout, named after the zip
    write_zip(dir / "My Folder Comic.cbz", {
        "cover/front.jpg": "COVER",
        "Chapter/10/1.jpg": "C10-1",
        "Chapter/2/2.jpg": "C2-2",
        "Chapter/2/10.jpg": "C2-10",
        "Chapter/1/01.png": "C1-1",
        "Chapter/notes.txt": "ignored",
    })
    write_zip(dir / "empty.zip", {})
    (dir / "not-a-zip.zip").write_text("nope")
    return server.Library(dir)


class LibraryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.lib = make_library(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_manifest_comic_sorted_and_missing_pages_skipped(self):
        s = self.lib.series["aup"]
        self.assertEqual(s.title, "Academy’s Undercover Professor")
        self.assertEqual([(c["number"], len(c["pages"])) for c in s.chapters], [(1, 2), (2, 1)])
        self.assertEqual(s.chapters[0]["pages"][1]["h"], 14081)
        self.assertEqual(s.cover, "aup/cover.webp")

    def test_folder_comic_in_numeric_order(self):
        s = self.lib.series["my-folder-comic"]
        self.assertEqual(s.title, "My Folder Comic")
        self.assertEqual([c["number"] for c in s.chapters], [1, 2, 10])
        self.assertEqual([p["file"] for p in s.chapters[1]["pages"]], ["Chapter/2/2.jpg", "Chapter/2/10.jpg"])
        self.assertEqual(s.cover, "cover/front.jpg")

    def test_unreadable_zips_are_skipped(self):
        self.assertEqual(sorted(self.lib.series), ["aup", "my-folder-comic"])


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.Handler.library = make_library(Path(cls.tmp.name))
        server.Handler.state = server.State(Path(cls.tmp.name) / "state.json")
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.tmp.cleanup()

    def get(self, path):
        with urlopen(self.base + path) as r:
            return r.status, r.headers.get("Content-Type"), r.read()

    def post(self, path, body):
        req = Request(self.base + path, json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urlopen(req) as r:
            return json.loads(r.read())

    def status(self, path):
        try:
            return self.get(path)[0]
        except HTTPError as e:
            return e.code

    def test_library_series_cover_and_pages(self):
        lib = json.loads(self.get("/api/library")[2])
        self.assertEqual({s["slug"] for s in lib["series"]}, {"aup", "my-folder-comic"})

        detail = json.loads(self.get("/api/series/aup")[2])
        self.assertEqual(len(detail["chapters"]), 2)

        status, ctype, body = self.get("/page/aup/aup/pages/001/0002.webp")
        self.assertEqual((status, ctype, body), (200, "image/webp", b"P1-2"))
        self.assertEqual(self.get("/cover/aup")[2], b"COVER")
        self.assertEqual(self.get("/page/my-folder-comic/Chapter/2/10.jpg")[2], b"C2-10")

    def test_only_listed_files_are_served(self):
        self.assertEqual(self.status("/page/aup/aup/manifest.json"), 404)
        self.assertEqual(self.status("/page/aup/aup/pages/001/missing.webp"), 404)
        self.assertEqual(self.status("/page/nope/x.webp"), 404)
        self.assertEqual(self.status("/api/series/nope"), 404)

    def test_static_files_stay_inside_static(self):
        _, ctype, body = self.get("/..%2Fserver.py")
        self.assertIn(b"<!doctype html>", body)  # falls back to the app, never the source
        self.assertEqual(self.status("/"), 200)

    def test_state_merges_and_clears(self):
        self.post("/api/state/aup", {"bookmarked": True, "read": {"1": 100}})
        entry = self.post("/api/state/aup", {"rating": 4, "read": {"2": 200}})
        self.assertEqual(entry, {"bookmarked": True, "rating": 4, "read": {"1": 100, "2": 200}})
        entry = self.post("/api/state/aup", {"bookmarked": None, "read": {"1": None}})
        self.assertEqual(entry, {"rating": 4, "read": {"2": 200}})
        lib = json.loads(self.get("/api/library")[2])
        self.assertEqual(lib["state"]["series"]["aup"]["rating"], 4)


if __name__ == "__main__":
    unittest.main()
