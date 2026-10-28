'use strict';

// ComicHero server: serves the reader web app from public/ and a small JSON API
// over the comic zips in your comics folder.
//
//   GET /api/library                          all comics
//   GET /api/comics/:id                       one comic with its chapter list
//   GET /api/comics/:id/chapters/:c           pages of chapter c (0-based)
//   GET /api/comics/:id/cover                 cover image
//   GET /api/comics/:id/pages/:c/:p           page p of chapter c (0-based)

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { Library } = require('./library');
const { loadConfig } = require('./config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-cache' });
  res.end(data);
}

function sendError(res, err) {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  if (res.headersSent) return res.destroy();
  sendJson(res, status, { error: status === 404 ? 'Not found' : 'Something went wrong' });
}

async function sendImage(res, image) {
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(image.name).toLowerCase()] || 'application/octet-stream',
    'Content-Length': image.size,
    'Cache-Control': 'private, max-age=86400',
  });
  pipeline(image.stream, res, () => {});
}

function sendStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 404, { error: 'Not found' });
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: 'Not found' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    pipeline(fs.createReadStream(file), res, () => {});
  });
}

function chapterSummary(comic) {
  return comic.chapters.map((ch, index) => ({
    index,
    number: ch.number,
    title: ch.title,
    pageCount: ch.pages.length,
  }));
}

function createServer(library) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });

      if (parts[0] !== 'api') return sendStatic(req, res, url.pathname);

      if (parts[1] === 'library' && parts.length === 2) {
        return sendJson(res, 200, { comics: await library.list() });
      }

      if (parts[1] === 'comics' && parts[2]) {
        const id = parts[2];
        if (parts.length === 3) {
          const comic = await library.get(id);
          return sendJson(res, 200, { id, title: comic.title, hasCover: !!comic.cover, chapters: chapterSummary(comic) });
        }
        if (parts[3] === 'cover' && parts.length === 4) {
          return sendImage(res, await library.image(id, 'cover'));
        }
        if (parts[3] === 'chapters' && parts.length === 5) {
          const comic = await library.get(id);
          const c = Number(parts[4]);
          const chapter = comic.chapters[c];
          if (!chapter) return sendJson(res, 404, { error: 'Not found' });
          return sendJson(res, 200, {
            index: c,
            number: chapter.number,
            title: chapter.title,
            prev: c > 0 ? c - 1 : null,
            next: c < comic.chapters.length - 1 ? c + 1 : null,
            pages: chapter.pages.map((p, i) => ({ url: `/api/comics/${id}/pages/${c}/${i}`, w: p.w, h: p.h })),
          });
        }
        if (parts[3] === 'pages' && parts.length === 6) {
          const chapter = Number(parts[4]);
          const page = Number(parts[5]);
          if (!Number.isInteger(chapter) || !Number.isInteger(page)) return sendJson(res, 404, { error: 'Not found' });
          return sendImage(res, await library.image(id, { chapter, page }));
        }
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendError(res, err);
    }
  });
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

if (require.main === module) {
  const config = loadConfig();
  if (!fs.existsSync(config.comicsDir)) {
    console.error(`Comics folder not found: ${config.comicsDir}`);
    console.error('Set "comicsDir" in config.json (see config.example.json), or pass the folder as an argument.');
    process.exit(1);
  }
  const library = new Library(config.comicsDir);
  createServer(library).listen(config.port, config.host, () => {
    console.log(`ComicHero is reading comics from ${library.dir}`);
    console.log(`Open on this computer:  http://localhost:${config.port}`);
    for (const ip of lanAddresses()) console.log(`Open from another device: http://${ip}:${config.port}`);
    console.log('Over Tailscale, use this computer\'s Tailscale name or 100.x address with the same port.');
  });
}

module.exports = { createServer };
