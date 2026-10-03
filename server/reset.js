'use strict';
const store = require('./store');
const database = require('./db');

/**
 * Clears the stored database so the next start seeds a fresh one. A snapshot is always taken
 * first — into data/backups on a file install, or the ctp_backups table when DATABASE_URL is set.
 */
store.reset()
  .then((saved) => {
    if (saved) console.log(`Existing database backed up to ${saved} and removed.`);
    else console.log('No database found — nothing to reset.');
    console.log('Start the server with "npm start" to seed a fresh database.');
  })
  .catch((err) => {
    console.error('Reset failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => database.close());
