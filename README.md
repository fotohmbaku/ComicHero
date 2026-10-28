# ComicHero

A comic and manhwa reader you host on your own computer (Mac or Windows) and read in any browser, including your
iPhone, for example over Tailscale. Comics stay as zip files and are read straight out of the zip without
unpacking, so large (multi-GB) archives are fine.

- **Home**: a cover carousel, Continue Reading with progress bars, your bookmarks, recently added comics,
  a Top list (longest, your ratings, recently read) and a pick of the day.
- **Library**: search, filters (reading, not started, finished, bookmarked, rated), chapter-length filter and sorting.
- **Comic page**: continue / next unread / latest buttons, bookmark, your own 1–5 star rating, and a searchable
  chapter list where you can tick chapters read.
- **Reader**: one continuous vertical strip, remembers your page, marks a chapter read when you reach the end,
  adjustable page width and gap. Keys: ← → change chapter, B bookmark, Esc back.
- **History**, and **⌘K** (or `/`) to search from anywhere.

Progress, bookmarks and ratings are saved in `state.json` next to the server.

## Running it

Requires Python 3.9 or newer; nothing to install.

```
python3 server.py "/path/to/your/comics"
```

Or copy `config.example.json` to `config.json` and set `comicsDir` (and optionally `port`, default 7777, and
`host`), then run `python3 server.py`. The environment variables `COMICHERO_DIR`, `COMICHERO_PORT` and
`COMICHERO_HOST` work too; the command line wins over both.

The server prints the addresses to open. By default it listens on every network interface so other devices can
reach it; from your phone over Tailscale use `http://<your-computer's-tailscale-name>:7777`. To keep it to this
computer only, use `--host 127.0.0.1`.

## Comic zip layout

Each comic is one `.zip` (or `.cbz`) file anywhere under the comics folder. Two layouts are understood:

**With a `manifest.json`** (preferred). The manifest gives the title, the chapter order and each page's size:

```
academys-undercover-professor.zip
├── manifest.json
├── cover.webp
└── pages/
    ├── 001/0001.webp, 0002.webp, ...
    └── 002/...
```

```json
{
  "format": "asura-offline",
  "series": { "title": "Academy's Undercover Professor", "slug": "academys-undercover-professor", "cover": "cover.webp" },
  "chapters": [
    { "number": 1, "title": "Chapter 1", "pages": [{ "file": "pages/001/0001.webp", "w": 800, "h": 1422 }] }
  ]
}
```

**Plain folders.** The comic is named after the zip file, the cover is `cover.jpg` (or the first image in a
`cover/` folder), and each chapter is a folder, sorted by the number in its name:

```
My Comic.zip
├── cover/front.jpg
└── Chapter/
    ├── 1/001.jpg, 002.jpg, ...
    ├── 2/...
    └── 10/...
```

Either layout can sit inside one top-level folder. macOS extras (`__MACOSX`, `._*`, `.DS_Store`) are ignored.

## API

| Route | Returns |
| --- | --- |
| `GET /api/library` | every comic (slug, title, chapter counts, size) plus saved reading state |
| `GET /api/series/:slug` | one comic with its chapters and page sizes |
| `GET /cover/:slug` | the cover image |
| `GET /page/:slug/:file` | one page; only files the comic lists are served |
| `POST /api/state/:slug` | merge reading state (`bookmarked`, `rating`, `lastChapter`, `lastPage`, `read`) |
| `POST /api/settings` | merge reader settings |
| `POST /api/rescan` | look for added or changed zips |

## Tests

```
python3 -m unittest discover tests
```
