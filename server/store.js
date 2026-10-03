'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const seed = require('./seed');
const geo = require('./geo');
const database = require('./db');

/**
 * The whole database is a single JSON document held in memory. Routes read it synchronously with
 * db() and mutate it through update(); persistence happens afterwards on a serialised queue.
 *
 * Two backends implement that persistence:
 *   - file      a JSON file on disk (the default, and what local development uses)
 *   - postgres  one JSONB row, used when DATABASE_URL is set, because hosts such as Render's free
 *               plan wipe the filesystem on every restart and deploy
 *
 * Postgres cannot be read synchronously, so init() must be awaited during start-up. Once it has
 * resolved, the public API behaves exactly as it did when a file was the only backend.
 */

let cache = null;
let writeQueue = Promise.resolve();
let dirty = false;
let rev = 0;
let initialised = false;

const usingDatabase = () => database.isEnabled();

function ensureDirs() {
  if (usingDatabase()) return;
  for (const dir of [config.DATA_DIR, config.BACKUP_DIR, config.UPLOAD_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const EMPTY = () => ({
  meta: { version: 2, createdAt: new Date().toISOString() },
  settings: {},
  users: [],
  sessionsAuth: [],
  centres: [],
  sessions: [],
  programs: [],
  enrollments: [],
  notices: [],
  zones: [],
  activity: []
});

/**
 * Brings older databases up to the current zone model.
 * v1 used directional zones (North/South/...); v2 uses the published numbered zones, so any
 * value that is not a known zone is re-derived from the state and left blank when the state
 * is ambiguous (Uttar Pradesh) or outside the published table - an administrator assigns those.
 */
function migrateZones(out) {
  const known = new Set(geo.ZONE_NAMES);
  out.centres.forEach((c) => {
    if (!c || known.has(c.zone)) return;
    const canonical = geo.normaliseZone(c.zone);
    c.zone = canonical || geo.zoneForState((c.address || {}).state) || '';
  });
  out.users.forEach((u) => {
    if (!u || !u.zone || known.has(u.zone)) return;
    u.zone = geo.normaliseZone(u.zone);
  });

  const byZone = new Map(out.zones.filter((z) => z && z.zone).map((z) => [z.zone, z]));
  out.zones = geo.ZONES.map((ref) => byZone.get(ref.name) || seed.zoneRecord(ref.name));
  out.meta.version = 2;
}

/** Guarantees every top-level collection exists after an upgrade or manual edit. */
function normalise(data) {
  const base = EMPTY();
  const out = Object.assign(base, data || {});
  for (const key of Object.keys(base)) {
    if (Array.isArray(base[key]) && !Array.isArray(out[key])) out[key] = [];
  }
  out.meta = Object.assign(base.meta, out.meta || {});
  out.settings = Object.assign(seed.defaultSettings(), out.settings || {});
  migrateZones(out);
  return out;
}

/* ------------------------------------------------------------------- file backend */

function loadFromFile() {
  ensureDirs();
  if (fs.existsSync(config.DATA_FILE)) {
    try {
      return normalise(JSON.parse(fs.readFileSync(config.DATA_FILE, 'utf8')));
    } catch (err) {
      const broken = path.join(config.BACKUP_DIR, `corrupt-${Date.now()}.json`);
      fs.copyFileSync(config.DATA_FILE, broken);
      console.error(`[store] data file unreadable, moved to ${broken}:`, err.message);
      return normalise(seed.initialData());
    }
  }
  const fresh = normalise(seed.initialData());
  writeFileNow(fresh);
  console.log('[store] seeded a fresh database at', config.DATA_FILE);
  return fresh;
}

function writeFileNow(data) {
  ensureDirs();
  const tmp = `${config.DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, config.DATA_FILE);
}

/* --------------------------------------------------------------- postgres backend */

async function loadFromDatabase() {
  await database.withRetry(() => database.init());
  const { rows } = await database.withRetry(() =>
    database.query('SELECT rev, doc FROM ctp_state WHERE id = 1'));
  if (rows.length) {
    rev = Number(rows[0].rev);
    return normalise(rows[0].doc);
  }

  const fresh = normalise(seed.initialData());
  const inserted = await database.query(
    `INSERT INTO ctp_state (id, rev, doc) VALUES (1, 1, $1)
     ON CONFLICT (id) DO NOTHING
     RETURNING rev`,
    [JSON.stringify(fresh)]
  );
  if (inserted.rows.length) {
    rev = 1;
    console.log('[store] seeded a fresh database in Postgres');
    return fresh;
  }

  // Another instance inserted first — adopt its copy instead of overwriting it.
  const again = await database.query('SELECT rev, doc FROM ctp_state WHERE id = 1');
  rev = Number(again.rows[0].rev);
  return normalise(again.rows[0].doc);
}

/**
 * Writes the document back, guarding against a second instance having written in between (which
 * Render briefly produces while a new deploy overlaps the old one). On a clash the other instance's
 * version is copied into ctp_backups before this one wins, so nothing is lost silently.
 */
async function writeDatabaseNow(data) {
  const json = JSON.stringify(data);
  const updated = await database.query(
    'UPDATE ctp_state SET doc = $1, rev = rev + 1, updated_at = now() WHERE id = 1 AND rev = $2 RETURNING rev',
    [json, rev]
  );
  if (updated.rows.length) {
    rev = Number(updated.rows[0].rev);
    return;
  }

  console.warn('[store] another instance wrote first — snapshotting it before overwriting.');
  await database.query(
    "INSERT INTO ctp_backups (label, doc) SELECT 'write-conflict', doc FROM ctp_state WHERE id = 1"
  );
  const forced = await database.query(
    'UPDATE ctp_state SET doc = $1, rev = rev + 1, updated_at = now() WHERE id = 1 RETURNING rev',
    [json]
  );
  rev = forced.rows.length ? Number(forced.rows[0].rev) : rev + 1;
}

/* -------------------------------------------------------------------- public API */

/** Loads the database. Must be awaited before the HTTP server starts accepting requests. */
async function init() {
  if (initialised) return cache;
  cache = usingDatabase() ? await loadFromDatabase() : loadFromFile();
  initialised = true;
  return cache;
}

function load() {
  if (cache) return cache;
  if (usingDatabase()) {
    throw new Error('store.init() must be awaited before the database can be read.');
  }
  cache = loadFromFile();
  initialised = true;
  return cache;
}

/** Serialised, atomic persist. Returns a promise that settles once written. */
function save() {
  dirty = true;
  writeQueue = writeQueue.then(async () => {
    if (!dirty) return;
    dirty = false;
    try {
      if (usingDatabase()) await writeDatabaseNow(cache);
      else writeFileNow(cache);
    } catch (err) {
      console.error('[store] write failed:', err.message);
    }
  });
  return writeQueue;
}

function db() {
  return load();
}

/** Mutate the in-memory database and persist. */
function update(mutator) {
  const data = load();
  const result = mutator(data);
  save();
  return result;
}

/** Snapshot the current database. Returns a description of where the copy went. */
async function backup(label) {
  const data = load();
  if (usingDatabase()) {
    const { rows } = await database.query(
      'INSERT INTO ctp_backups (label, doc) VALUES ($1, $2) RETURNING id',
      [label || 'manual', JSON.stringify(data)]
    );
    return `ctp_backups#${rows[0].id}`;
  }
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(config.BACKUP_DIR, `ctp-${label || 'manual'}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  return file;
}

function logActivity(actor, action, detail) {
  const data = load();
  data.activity.unshift({
    id: `act_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor: actor || 'system',
    action,
    detail: detail || ''
  });
  if (data.activity.length > 1000) data.activity.length = 1000;
  save();
}

/** Drops the stored database so the next start seeds a fresh one. Used by "npm run reset". */
async function reset() {
  const label = 'before-reset';
  if (usingDatabase()) {
    await database.init();
    const { rows } = await database.query('SELECT doc FROM ctp_state WHERE id = 1');
    if (!rows.length) return null;
    const saved = await database.query(
      'INSERT INTO ctp_backups (label, doc) VALUES ($1, $2) RETURNING id',
      [label, rows[0].doc]
    );
    await database.query('DELETE FROM ctp_state WHERE id = 1');
    await database.query('DELETE FROM ctp_blobs');
    return `ctp_backups#${saved.rows[0].id}`;
  }

  if (!fs.existsSync(config.DATA_FILE)) return null;
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(config.BACKUP_DIR, `ctp-${label}-${stamp}.json`);
  fs.copyFileSync(config.DATA_FILE, target);
  fs.unlinkSync(config.DATA_FILE);
  return target;
}

/** Describes the active backend for the start-up banner. */
function describe() {
  return usingDatabase() ? 'Postgres (DATABASE_URL)' : config.DATA_FILE;
}

module.exports = {
  db, save, update, backup, logActivity, ensureDirs,
  init, reset, describe, usingDatabase
};
