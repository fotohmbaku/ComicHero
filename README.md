# ComicHero

A comic reader you host on your own computer (Windows or Mac) and read on your iPhone, for example over Tailscale.
Comics stay as zip files and are read straight out of the zip without unpacking, so large (multi-GB) archives are fine.

## Comic zip layout

Each comic is one `.zip` (or `.cbz`) file. Two layouts are understood:

**With a `manifest.json`** (preferred). The manifest gives the title, the chapter order and each page's size:

```
academys-undercover-professor.zip
└── academys-undercover-professor/
    ├── manifest.json
    ├── cover.webp
    └── pages/
        ├── 001/0001.webp, 0002.webp, ...
        └── 002/...
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

## Running it

Requires [Node.js](https://nodejs.org) 22 or newer.

```
npm install
npm start -- "/path/to/your/comics"
```

Or copy `config.example.json` to `config.json` and set `comicsDir` (and optionally `port`, default 7777), then run
`npm start`. The server prints the addresses to open; from your phone over Tailscale use
`http://<your-computer's-tailscale-name>:7777`.

## API

| Route | Returns |
| --- | --- |
| `GET /api/library` | every comic: id, title, chapter count |
| `GET /api/comics/:id` | one comic and its chapter list |
| `GET /api/comics/:id/chapters/:c` | the pages of chapter `c` (0-based) with their sizes and previous/next chapter |
| `GET /api/comics/:id/cover` | the cover image |
| `GET /api/comics/:id/pages/:c/:p` | page `p` of chapter `c` |

## Tests

```
npm test
```
