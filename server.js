'use strict';
const path = require('path');
const express = require('express');
const config = require('./server/config');
const store = require('./server/store');
const database = require('./server/db');
const auth = require('./server/auth');
const { HttpError } = require('./server/util');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(auth.attachUser);

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/centres', require('./server/routes/centres'));
app.use('/api/zones', require('./server/routes/zones'));
app.use('/api/sessions', require('./server/routes/sessions'));
app.use('/api/programs', require('./server/routes/programs'));
app.use('/api/enrollments', require('./server/routes/enrollments'));
app.use('/api/notices', require('./server/routes/notices'));
app.use('/api/admin', require('./server/routes/admin'));
app.use('/api', require('./server/routes/meta'));

app.get('/api/health', (req, res) => {
  const data = store.db();
  res.json({
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    centres: data.centres.length,
    sessions: data.sessions.length,
    users: data.users.length
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.originalUrl}` });
});

app.use('/vendor/leaflet', express.static(path.join(config.ROOT, 'node_modules', 'leaflet', 'dist')));
app.use(express.static(config.PUBLIC_DIR, { extensions: ['html'] }));

app.get('*', (req, res) => {
  res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err instanceof HttpError ? err.status : (err.status || err.statusCode || 500);
  if (status >= 500) console.error('[error]', err);
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Something went wrong on the server.'
    : err.message || 'Unexpected error.';
  res.status(status).json({ error: message, details: err.details });
});

let server = null;

function banner() {
  const data = store.db();
  const shown = config.HOST === '0.0.0.0' || config.HOST === '::' ? '127.0.0.1' : config.HOST;
  console.log('');
  console.log('  CTP Zonal Coordination');
  console.log(`  → http://${shown}:${config.PORT}   (bound on ${config.HOST})`);
  console.log(`  Storage:   ${store.describe()}`);
  console.log(`  Uploads:   ${store.usingDatabase() ? 'Postgres (ctp_blobs)' : config.UPLOAD_DIR}`);
  console.log(`  Centres: ${data.centres.length} | Sessions: ${data.sessions.length} | Users: ${data.users.length}`);
  if (data.users.some((u) => u.email === config.DEFAULT_ADMIN.email && u.mustChangePassword)) {
    // The configured password is only ever applied while seeding. On an existing database the
    // stored one still governs, so printing the configured value would be an outright lie.
    if (!store.wasSeeded()) {
      console.log(`  Admin: ${config.DEFAULT_ADMIN.email}  (existing account — its current password still applies)`);
    } else if (config.DEFAULT_ADMIN.generated) {
      console.log('  ──────────────────────────────────────────────────────────────');
      console.log('  CTP_ADMIN_PASSWORD was not set, so one was generated for you.');
      console.log(`  Admin: ${config.DEFAULT_ADMIN.email} / ${config.DEFAULT_ADMIN.password}`);
      console.log('  Save it now — sign in and change it. It is not shown again');
      console.log('  once the password has been changed.');
      console.log('  ──────────────────────────────────────────────────────────────');
    } else {
      console.log(`  Default admin: ${config.DEFAULT_ADMIN.email} / ${config.DEFAULT_ADMIN.password}  (change it after first sign-in)`);
    }
  }
  console.log('');
}

// Postgres cannot be read synchronously, so the database is loaded before the first request is
// ever accepted. Failing here is deliberate: serving an empty directory would look like data loss.
async function start() {
  await store.init();
  server = app.listen(config.PORT, config.HOST, banner);
}

start().catch((err) => {
  console.error('');
  console.error('  Could not start CTP Zonal Coordination.');
  console.error(`  ${err.message}`);
  if (store.usingDatabase()) {
    console.error('  Check that DATABASE_URL is correct and the database is reachable.');
  }
  console.error('');
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received — saving data and shutting down.`);
  const done = () => database.close().finally(() => process.exit(0));
  store.save()
    .catch(() => {})
    .then(() => (server ? server.close(done) : done()));
  setTimeout(() => process.exit(0), 10000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
