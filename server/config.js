'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Most cloud hosts (Azure App Service, Render, Railway, Fly, Cloud Run) inject PORT and expect the
// app to listen on 0.0.0.0. CTP_PORT / CTP_HOST stay available for local overrides.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const dir = (envValue, fallback) => (envValue ? path.resolve(envValue) : fallback);

// On hosts with an ephemeral filesystem the app folder is wiped on every deploy, so point these at
// a mounted disk (Render) or a persisted path such as /home/data (Azure App Service).
const DATA_DIR = dir(process.env.CTP_DATA_DIR, path.join(ROOT, 'data'));
const UPLOAD_DIR = dir(process.env.CTP_UPLOAD_DIR, path.join(ROOT, 'uploads'));

module.exports = {
  ROOT,
  IS_PRODUCTION,
  PORT: Number(process.env.PORT || process.env.CTP_PORT || 5090),
  HOST: process.env.CTP_HOST || (IS_PRODUCTION ? '0.0.0.0' : '127.0.0.1'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  DATA_DIR,
  DATA_FILE: path.join(DATA_DIR, 'ctp-data.json'),
  BACKUP_DIR: dir(process.env.CTP_BACKUP_DIR, path.join(DATA_DIR, 'backups')),
  UPLOAD_DIR,
  SESSION_COOKIE: 'ctp_session',
  SESSION_TTL_MS: 1000 * 60 * 60 * 12,
  SECURE_COOKIES: process.env.CTP_SECURE_COOKIES
    ? process.env.CTP_SECURE_COOKIES !== '0'
    : IS_PRODUCTION,
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  ALLOWED_UPLOAD_EXT: ['.xlsx', '.xls', '.csv', '.pdf'],
  DEFAULT_ADMIN: {
    name: process.env.CTP_ADMIN_NAME || 'CTP National Administrator',
    email: (process.env.CTP_ADMIN_EMAIL || 'admin@ctp.org').toLowerCase(),
    password: process.env.CTP_ADMIN_PASSWORD || 'Ctp@2026'
  }
};
