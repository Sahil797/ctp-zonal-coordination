'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');
const seed = require('./seed');
const geo = require('./geo');

let cache = null;
let writeQueue = Promise.resolve();
let dirty = false;

function ensureDirs() {
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

function load() {
  if (cache) return cache;
  ensureDirs();
  if (fs.existsSync(config.DATA_FILE)) {
    try {
      cache = normalise(JSON.parse(fs.readFileSync(config.DATA_FILE, 'utf8')));
    } catch (err) {
      const broken = path.join(config.BACKUP_DIR, `corrupt-${Date.now()}.json`);
      fs.copyFileSync(config.DATA_FILE, broken);
      console.error(`[store] data file unreadable, moved to ${broken}:`, err.message);
      cache = normalise(seed.initialData());
    }
  } else {
    cache = normalise(seed.initialData());
    writeNow(cache);
    console.log('[store] seeded a fresh database at', config.DATA_FILE);
  }
  return cache;
}

function writeNow(data) {
  ensureDirs();
  const tmp = `${config.DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, config.DATA_FILE);
}

/** Serialised, atomic persist. Returns a promise that settles once written. */
function save() {
  dirty = true;
  writeQueue = writeQueue.then(() => {
    if (!dirty) return;
    dirty = false;
    try {
      writeNow(cache);
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

function backup(label) {
  ensureDirs();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(config.BACKUP_DIR, `ctp-${label || 'manual'}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(load(), null, 2), 'utf8');
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

module.exports = { db, save, update, backup, logActivity, ensureDirs };
