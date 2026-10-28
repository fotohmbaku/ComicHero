'use strict';

// Settings come from, in order of priority: the command line
// (`npm start -- /path/to/comics`), environment variables, then config.json.

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

function loadConfig(argv = process.argv.slice(2), env = process.env) {
  let file = {};
  const configPath = path.join(ROOT, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      file = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      throw new Error(`Could not read config.json: ${err.message}`);
    }
  }

  const comicsDir = argv[0] || env.COMICHERO_DIR || file.comicsDir || path.join(os.homedir(), 'Comics');
  return {
    comicsDir: path.resolve(ROOT, expandHome(comicsDir)),
    port: Number(env.COMICHERO_PORT || file.port || 7777),
    host: env.COMICHERO_HOST || file.host || '0.0.0.0',
  };
}

module.exports = { loadConfig };
