'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { Library } = require('../src/library');
const { createServer } = require('../src/server');
const { writeZip, tempDir } = require('./helpers');

function setup() {
  const dir = tempDir();

  // Manifest layout, as produced by the downloader F uses, with macOS junk.
  const manifest = {
    format: 'asura-offline',
    version: 1,
    series: { title: 'Academy’s Undercover Professor', slug: 'aup', cover: 'cover.webp' },
    chapters: [
      { number: 2, title: 'Chapter 2', pages: [{ file: 'pages/002/0001.webp', w: 800, h: 1200 }] },
      {
        number: 1,
        title: 'Chapter 1',
        pages: [
          { file: 'pages/001/0001.webp', w: 800, h: 533 },
          { file: 'pages/001/0002.webp', w: 800, h: 14081 },
          { file: 'pages/001/missing.webp', w: 800, h: 10 },
        ],
      },
    ],
  };
  writeZip(path.join(dir, 'aup.zip'), {
    'aup/manifest.json': JSON.stringify(manifest),
    'aup/cover.webp': 'COVER',
    'aup/._cover.webp': 'junk',
    'aup/.DS_Store': 'junk',
    'aup/pages/001/0001.webp': 'P1-1',
    'aup/pages/001/0002.webp': 'P1-2',
    'aup/pages/002/0001.webp': 'P2-1',
    '__MACOSX/aup/._cover.webp': 'junk',
  });

  // Folder layout from the project description: cover/ and Chapter/<n>/.
  writeZip(path.join(dir, 'My Folder Comic.zip'), {
    'cover/front.jpg': 'COVER',
    'Chapter/10/1.jpg': 'C10-1',
    'Chapter/2/2.jpg': 'C2-2',
    'Chapter/2/10.jpg': 'C2-10',
    'Chapter/1/01.png': 'C1-1',
    'Chapter/notes.txt': 'ignored',
  });

  writeZip(path.join(dir, 'broken.zip'), {});
  require('fs').writeFileSync(path.join(dir, 'not-a-zip.zip'), 'nope');

  return new Library(dir);
}

test('reads a manifest comic, sorted by chapter number, skipping missing pages', async () => {
  const library = setup();
  const comics = await library.list();
  const aup = comics.find((c) => c.title === 'Academy’s Undercover Professor');
  assert.ok(aup);
  const comic = await library.get(aup.id);
  assert.deepStrictEqual(
    comic.chapters.map((c) => [c.number, c.pages.length]),
    [
      [1, 2],
      [2, 1],
    ],
  );
  assert.strictEqual(comic.chapters[0].pages[1].h, 14081);
  assert.strictEqual(comic.cover, 'aup/cover.webp');
  library.close();
});

test('reads a folder comic named after its zip, chapters and pages in numeric order', async () => {
  const library = setup();
  const comics = await library.list();
  const folder = comics.find((c) => c.title === 'My Folder Comic');
  assert.ok(folder);
  const comic = await library.get(folder.id);
  assert.deepStrictEqual(
    comic.chapters.map((c) => c.number),
    [1, 2, 10],
  );
  assert.deepStrictEqual(
    comic.chapters[1].pages.map((p) => p.file),
    ['Chapter/2/2.jpg', 'Chapter/2/10.jpg'],
  );
  assert.strictEqual(comic.cover, 'cover/front.jpg');
  library.close();
});

test('skips unreadable zips instead of failing the whole library', async () => {
  const library = setup();
  const titles = (await library.list()).map((c) => c.title);
  assert.ok(!titles.includes('not-a-zip'));
  library.close();
});

test('HTTP API serves library, chapters, cover and pages', async (t) => {
  const library = setup();
  const server = createServer(library).listen(0);
  await new Promise((r) => server.once('listening', r));
  t.after(() => {
    server.close();
    library.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const { comics } = await (await fetch(`${base}/api/library`)).json();
  const aup = comics.find((c) => c.title.startsWith('Academy'));

  const detail = await (await fetch(`${base}/api/comics/${aup.id}`)).json();
  assert.strictEqual(detail.chapters.length, 2);

  const chapter = await (await fetch(`${base}/api/comics/${aup.id}/chapters/0`)).json();
  assert.strictEqual(chapter.next, 1);
  assert.strictEqual(chapter.prev, null);
  assert.strictEqual(chapter.pages.length, 2);

  const page = await fetch(base + chapter.pages[1].url);
  assert.strictEqual(page.headers.get('content-type'), 'image/webp');
  assert.strictEqual(await page.text(), 'P1-2');

  const cover = await fetch(`${base}/api/comics/${aup.id}/cover`);
  assert.strictEqual(await cover.text(), 'COVER');

  assert.strictEqual((await fetch(`${base}/api/comics/${aup.id}/pages/0/99`)).status, 404);
  assert.strictEqual((await fetch(`${base}/api/comics/Li4vZXRj/cover`)).status, 404); // "../etc"
  assert.strictEqual((await fetch(`${base}/..%2Fpackage.json`)).status, 404);
  assert.strictEqual((await fetch(`${base}/`)).status, 200);
});
