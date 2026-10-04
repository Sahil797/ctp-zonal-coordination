'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

/**
 * Storage for uploaded files - certificate sheets and centre photographs.
 *
 * On a normal server the files live on disk. On a host with an ephemeral filesystem (Render's free
 * plan, Cloud Run, Vercel) anything written to disk disappears when the instance restarts, so the
 * bytes are kept in Postgres instead. Uploads are capped by multer before they reach here (10 MB
 * for a certificate sheet, 5 MB for a photo), which is well within what a bytea column handles
 * comfortably.
 */

const usingDatabase = () => db.isEnabled();

function newStoredName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
}

async function put(buffer, originalName) {
  const storedName = newStoredName(originalName);
  if (usingDatabase()) {
    await db.query(
      'INSERT INTO ctp_blobs (stored_name, bytes, size) VALUES ($1, $2, $3)',
      [storedName, buffer, buffer.length]
    );
  } else {
    await fs.promises.mkdir(config.UPLOAD_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(config.UPLOAD_DIR, storedName), buffer);
  }
  return { storedName, size: buffer.length };
}

/** Returns the stored bytes, or null when the file is no longer available. */
async function get(storedName) {
  if (!storedName) return null;
  const safeName = path.basename(storedName);
  if (usingDatabase()) {
    const { rows } = await db.query('SELECT bytes FROM ctp_blobs WHERE stored_name = $1', [safeName]);
    return rows.length ? rows[0].bytes : null;
  }
  try {
    return await fs.promises.readFile(path.join(config.UPLOAD_DIR, safeName));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function remove(storedName) {
  if (!storedName) return;
  const safeName = path.basename(storedName);
  try {
    if (usingDatabase()) {
      await db.query('DELETE FROM ctp_blobs WHERE stored_name = $1', [safeName]);
    } else {
      await fs.promises.unlink(path.join(config.UPLOAD_DIR, safeName));
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[blobs] could not remove', safeName, err.message);
  }
}

module.exports = { put, get, remove, usingDatabase };
