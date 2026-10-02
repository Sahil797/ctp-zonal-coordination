'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

const file = config.DATA_FILE;
if (fs.existsSync(file)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
  const target = path.join(config.BACKUP_DIR, `ctp-before-reset-${stamp}.json`);
  fs.copyFileSync(file, target);
  fs.unlinkSync(file);
  console.log(`Existing database backed up to ${target} and removed.`);
} else {
  console.log('No database file found — nothing to reset.');
}
console.log('Start the server with "npm start" to seed a fresh database.');
