'use strict';

// Finds comic zips in the comics folder and keeps a small cache of opened
// archives so page requests don't re-read the zip's directory every time.

const fs = require('fs/promises');
const path = require('path');
const { openZip, openEntryStream, readEntry } = require('./archive');
const { describeComic, naturalCompare } = require('./comic');

const MAX_OPEN_ZIPS = 8;

function toId(relPath) {
  return Buffer.from(relPath, 'utf8').toString('base64url');
}

function fromId(id) {
  return Buffer.from(id, 'base64url').toString('utf8');
}

class Library {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.open = new Map(); // relPath -> Promise<{ key, zip, entries, comic }>
    this.described = new Map(); // relPath -> { key, comic }, kept after the zip is closed
  }

  async findZips(dir = this.dir) {
    const found = [];
    for (const dirent of await fs.readdir(dir, { withFileTypes: true })) {
      if (dirent.name.startsWith('.')) continue;
      const full = path.join(dir, dirent.name);
      if (dirent.isDirectory()) found.push(...(await this.findZips(full)));
      else if (/\.(zip|cbz)$/i.test(dirent.name)) found.push(path.relative(this.dir, full).split(path.sep).join('/'));
    }
    return found;
  }

  async stat(relPath) {
    const full = path.resolve(this.dir, relPath);
    if (!full.startsWith(this.dir + path.sep)) throw notFound();
    const stat = await fs.stat(full).catch(() => null);
    if (!stat || !stat.isFile()) throw notFound();
    return { full, key: `${stat.size}:${stat.mtimeMs}` };
  }

  async describe(relPath) {
    const { key } = await this.stat(relPath);
    const known = this.described.get(relPath);
    if (known && known.key === key) return known.comic;
    return (await this.load(relPath)).comic;
  }

  async load(relPath) {
    const { full, key } = await this.stat(relPath);

    const cached = this.open.get(relPath);
    if (cached) {
      const archive = await cached.catch(() => null);
      if (archive && archive.key === key) {
        // refresh LRU position
        this.open.delete(relPath);
        this.open.set(relPath, cached);
        return archive;
      }
      this.evict(relPath);
    }

    const loading = (async () => {
      const { zip, entries } = await openZip(full);
      const title = path.basename(relPath).replace(/\.(zip|cbz)$/i, '');
      const comic = await describeComic([...entries.keys()], (name) => readEntry(zip, entries.get(name)), title);
      this.described.set(relPath, { key, comic });
      return { key, zip, entries, comic };
    })();
    this.open.set(relPath, loading);
    loading.catch(() => {
      if (this.open.get(relPath) === loading) this.open.delete(relPath);
    });

    while (this.open.size > MAX_OPEN_ZIPS) this.evict(this.open.keys().next().value);
    return loading;
  }

  evict(relPath) {
    const entry = this.open.get(relPath);
    this.open.delete(relPath);
    if (entry) entry.then((a) => a.zip.close(), () => {});
  }

  async list() {
    const zips = (await this.findZips()).sort(naturalCompare);
    const comics = [];
    for (const rel of zips) {
      try {
        const comic = await this.describe(rel);
        comics.push({ id: toId(rel), title: comic.title, chapterCount: comic.chapters.length, hasCover: !!comic.cover });
      } catch (err) {
        console.warn(`Skipping ${rel}: ${err.message}`);
      }
    }
    return comics.sort((a, b) => naturalCompare(a.title, b.title));
  }

  get(id) {
    return this.describe(fromId(id));
  }

  // Returns { stream, size, name } for the cover or a page, chosen by index so
  // clients can never ask for arbitrary paths inside the zip.
  async image(id, which) {
    const archive = await this.load(fromId(id));
    const { comic } = archive;
    const name =
      which === 'cover' ? comic.cover : comic.chapters[which.chapter]?.pages[which.page]?.file;
    const entry = name && archive.entries.get(name);
    if (!entry) throw notFound();
    return { stream: await openEntryStream(archive.zip, entry), size: entry.uncompressedSize, name };
  }

  close() {
    for (const rel of [...this.open.keys()]) this.evict(rel);
  }
}

function notFound() {
  const err = new Error('Not found');
  err.status = 404;
  return err;
}

module.exports = { Library, toId, fromId };
