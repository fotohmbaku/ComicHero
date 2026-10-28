'use strict';

// Thin promise wrapper around yauzl. Only the zip's central directory is read
// up front, so opening a multi-GB archive is cheap; entries are streamed on demand.

const yauzl = require('yauzl');

function openZip(file) {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) return reject(err);
      const entries = new Map();
      zip.on('entry', (entry) => {
        entries.set(entry.fileName, entry);
        zip.readEntry();
      });
      zip.once('end', () => resolve({ zip, entries }));
      zip.once('error', reject);
      zip.readEntry();
    });
  });
}

function openEntryStream(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
  });
}

async function readEntry(zip, entry) {
  const stream = await openEntryStream(zip, entry);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = { openZip, openEntryStream, readEntry };
