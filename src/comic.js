'use strict';

// Turns the list of files inside a comic zip into a normalized comic:
//   { title, cover, chapters: [{ number, title, pages: [{ file, w, h }] }] }
//
// Two layouts are understood:
//   1. A manifest.json (format "asura-offline") listing chapters and page sizes.
//   2. Plain folders: a cover image (cover.jpg or a `cover/` folder) and one
//      folder per chapter (e.g. `Chapter/1/`, `pages/001/`), sorted numerically.
// Either layout may sit inside a single top-level folder.

const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const CONTAINER_DIRS = new Set(['chapter', 'chapters', 'pages']);

const naturalCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function isJunk(name) {
  return (
    name.endsWith('/') ||
    name.startsWith('__MACOSX/') ||
    name.split('/').some((part) => part.startsWith('._') || part === '.DS_Store' || part === 'Thumbs.db')
  );
}

function isImage(name) {
  return IMAGE_EXT.has(path.posix.extname(name).toLowerCase());
}

// If every file lives under one top-level folder, return "folder/", else "".
function commonRoot(names) {
  let root = null;
  for (const name of names) {
    const slash = name.indexOf('/');
    if (slash === -1) return '';
    const first = name.slice(0, slash + 1);
    if (root === null) root = first;
    else if (root !== first) return '';
  }
  return root || '';
}

function firstNumber(text) {
  const match = /\d+(\.\d+)?/.exec(text);
  return match ? Number(match[0]) : null;
}

function fromManifest(manifest, root, files) {
  const resolve = (file) => (file && files.has(root + file) ? root + file : null);
  const chapters = (manifest.chapters || [])
    .map((ch, i) => ({
      number: typeof ch.number === 'number' ? ch.number : firstNumber(String(ch.number ?? '')) ?? i + 1,
      title: ch.title || `Chapter ${ch.number ?? i + 1}`,
      pages: (ch.pages || [])
        .map((p) => (typeof p === 'string' ? { file: p } : p))
        .map((p) => ({ file: resolve(p.file), w: p.w || null, h: p.h || null }))
        .filter((p) => p.file),
    }))
    .filter((ch) => ch.pages.length > 0)
    .sort((a, b) => a.number - b.number);

  const series = manifest.series || {};
  return { title: series.title || null, cover: resolve(series.cover), chapters };
}

function fromFolders(root, names) {
  const images = names.filter((n) => isImage(n)).map((n) => n.slice(root.length));

  let cover = null;
  const coverFile = images.find((n) => /^cover\.[a-z]+$/i.test(n));
  const coverDirImages = images.filter((n) => /^cover\//i.test(n)).sort(naturalCompare);
  if (coverFile) cover = coverFile;
  else if (coverDirImages.length) cover = coverDirImages[0];

  const groups = new Map();
  for (const img of images) {
    if (img === cover || /^cover\//i.test(img)) continue;
    const dir = path.posix.dirname(img);
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(img);
  }

  const chapters = [...groups.entries()]
    .sort(([a], [b]) => naturalCompare(a, b))
    .map(([dir, pages], i) => {
      const name = dir === '.' ? '' : path.posix.basename(dir);
      const isContainer = CONTAINER_DIRS.has(name.toLowerCase());
      const number = (isContainer ? null : firstNumber(name)) ?? i + 1;
      return {
        number,
        title: name && !isContainer && !/^\d+$/.test(name) ? name : `Chapter ${number}`,
        pages: pages.sort(naturalCompare).map((file) => ({ file: root + file, w: null, h: null })),
      };
    })
    .sort((a, b) => a.number - b.number);

  return { title: null, cover: cover ? root + cover : null, chapters };
}

/**
 * @param {string[]} allNames every entry name in the zip
 * @param {(name: string) => Promise<Buffer>} read reads one entry
 * @param {string} fallbackTitle used when the zip doesn't name the comic (the zip's file name)
 */
async function describeComic(allNames, read, fallbackTitle) {
  const names = allNames.filter((n) => !isJunk(n));
  const files = new Set(names);
  const root = commonRoot(names);

  let comic = null;
  if (files.has(root + 'manifest.json')) {
    try {
      const manifest = JSON.parse((await read(root + 'manifest.json')).toString('utf8'));
      comic = fromManifest(manifest, root, files);
      if (comic.chapters.length === 0) comic = null;
    } catch {
      comic = null; // unreadable manifest: fall back to folder layout
    }
  }
  if (!comic) comic = fromFolders(root, names);

  if (!comic.cover) comic.cover = comic.chapters[0]?.pages[0]?.file || null;
  comic.title = comic.title || fallbackTitle;
  return comic;
}

module.exports = { describeComic, naturalCompare };
