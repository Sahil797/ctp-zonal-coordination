'use strict';
const { Pool } = require('pg');

/**
 * Postgres connection used when the app runs on a host with an ephemeral filesystem.
 *
 * The app keeps its whole database as a single JSON document in memory (see store.js), so this
 * module only needs three things: one row to hold that document, one table for uploaded files,
 * and a small table of snapshots taken before destructive operations.
 */

let pool = null;

function isEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Managed Postgres (Neon, Render, Supabase) terminates TLS with certificates the Node bundle does
 * not always carry, so verification is relaxed unless PGSSLMODE explicitly asks for a full check.
 * The connection itself is still encrypted.
 */
function sslOption(url) {
  if (process.env.PGSSLMODE === 'disable' || /[?&]sslmode=disable/.test(url)) return false;
  if (process.env.PGSSLMODE === 'verify-full') return { rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

function getPool() {
  if (!isEnabled()) throw new Error('DATABASE_URL is not set.');
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool({
      connectionString,
      ssl: sslOption(connectionString),
      max: Number(process.env.PGPOOL_MAX || 4),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ctp_state (
  id         SMALLINT     PRIMARY KEY,
  rev        BIGINT       NOT NULL DEFAULT 1,
  doc        JSONB        NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT ctp_state_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS ctp_blobs (
  stored_name TEXT        PRIMARY KEY,
  bytes       BYTEA       NOT NULL,
  size        INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ctp_backups (
  id         BIGSERIAL    PRIMARY KEY,
  label      TEXT         NOT NULL,
  doc        JSONB        NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
`;

async function init() {
  await query(SCHEMA);
}

/** Retries briefly: a sleeping Neon branch can refuse the first connection while it wakes. */
async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      const waitMs = 500 * 2 ** i;
      console.warn(`[db] attempt ${i + 1} failed (${err.message}); retrying in ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
}

module.exports = { isEnabled, getPool, query, init, withRetry, close };
