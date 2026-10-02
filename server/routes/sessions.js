'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const config = require('../config');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const { wrap, fail, str, id, now, toCsv } = require('../util');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
      cb(null, config.UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    }
  }),
  limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.ALLOWED_UPLOAD_EXT.includes(ext)) {
      return cb(new Error(`Only ${config.ALLOWED_UPLOAD_EXT.join(', ')} files are accepted.`));
    }
    cb(null, true);
  }
});

function sessionById(sessionId) {
  const data = store.db();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) fail(404, 'Session not found.');
  return session;
}

function assertCanEdit(req, session) {
  if (!auth.canManageCentre(req.user, session.centreId)) {
    fail(403, 'You can only manage sessions belonging to your own centre.');
  }
}

function decorate(session, centresById) {
  const centre = centresById.get(session.centreId);
  return Object.assign({}, session, {
    centreName: centre ? centre.name : 'Unknown centre',
    centreCode: centre ? centre.code : '',
    zone: centre ? centre.zone : '',
    state: centre ? centre.address.state : ''
  });
}

function filterSessions(req) {
  const data = store.db();
  const centresById = new Map(data.centres.map((c) => [c.id, c]));
  const centreId = str(req.query.centreId, 60);
  const status = str(req.query.status, 20);
  const zone = str(req.query.zone, 40);
  const q = str(req.query.q, 120).toLowerCase();

  return data.sessions
    .filter((s) => (!centreId || s.centreId === centreId))
    .filter((s) => (!status || s.status === status))
    .filter((s) => {
      if (!zone) return true;
      const c = centresById.get(s.centreId);
      return c && c.zone === zone;
    })
    .filter((s) => {
      if (!q) return true;
      const c = centresById.get(s.centreId);
      return [s.title, s.batch, s.programName, s.trainer, c && c.name].join(' ').toLowerCase().includes(q);
    })
    .sort((a, b) => String(b.startDate || b.createdAt).localeCompare(String(a.startDate || a.createdAt)))
    .map((s) => decorate(s, centresById));
}

router.get('/', auth.requireAuth, wrap((req, res) => {
  let items = filterSessions(req);
  if (req.user.role !== 'admin') items = items.filter((s) => s.centreId === req.user.centreId);
  res.json({ total: items.length, items });
}));

router.get('/export.csv', auth.requireAuth, wrap((req, res) => {
  let items = filterSessions(req);
  if (req.user.role !== 'admin') items = items.filter((s) => s.centreId === req.user.centreId);
  const csv = toCsv(items, [
    { label: 'Centre', value: (s) => s.centreName },
    { label: 'Zone', value: (s) => s.zone },
    { label: 'State', value: (s) => s.state },
    { label: 'Session', value: (s) => s.title },
    { label: 'Program', value: (s) => s.programName },
    { label: 'Batch', value: (s) => s.batch },
    { label: 'Mode', value: (s) => s.mode },
    { label: 'Trainer', value: (s) => s.trainer },
    { label: 'Start', value: (s) => s.startDate },
    { label: 'End', value: (s) => s.endDate },
    { label: 'Status', value: (s) => s.status },
    { label: 'Enrolled', value: (s) => s.enrolledCount },
    { label: 'Completed', value: (s) => s.completedCount },
    { label: 'Certificates Printed', value: (s) => (s.reflection || {}).certificatesPrinted || 0 },
    { label: 'Certificates Distributed', value: (s) => (s.reflection || {}).certificatesDistributed || 0 },
    { label: 'Distributed On', value: (s) => (s.reflection || {}).distributedOn || '' },
    { label: 'Highlights', value: (s) => (s.reflection || {}).highlights || '' }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ctp-sessions.csv"');
  res.send(csv);
}));

router.get('/:id', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  if (req.user.role !== 'admin' && session.centreId !== req.user.centreId) {
    fail(403, 'You can only view sessions belonging to your own centre.');
  }
  const data = store.db();
  const centresById = new Map(data.centres.map((c) => [c.id, c]));
  res.json({ session: decorate(session, centresById) });
}));

router.post('/', auth.requireAuth, wrap((req, res) => {
  const body = req.body || {};
  const centreId = req.user.role === 'admin' ? str(body.centreId, 60) : req.user.centreId;
  if (!centreId) fail(400, 'A centre must be selected before adding a session.');
  if (!auth.canManageCentre(req.user, centreId)) fail(403, 'You can only add sessions to your own centre.');
  const data = store.db();
  if (!data.centres.some((c) => c.id === centreId)) fail(404, 'Centre not found.');
  if (!str(body.title)) fail(400, 'Session title is required.');

  let session = null;
  store.update((d) => {
    session = models.normaliseSession(body, null, centreId);
    d.sessions.push(session);
  });
  store.logActivity(req.user.email, 'session.created', session.title);
  res.status(201).json({ ok: true, session });
}));

router.put('/:id', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  assertCanEdit(req, session);
  const data = store.db();
  const index = data.sessions.findIndex((s) => s.id === session.id);
  const updated = models.normaliseSession(req.body || {}, session, session.centreId);
  store.update((d) => { d.sessions[index] = updated; });
  store.logActivity(req.user.email, 'session.updated', `${updated.title} → ${updated.status}`);
  res.json({ ok: true, session: updated });
}));

router.delete('/:id', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  assertCanEdit(req, session);
  store.update((d) => {
    (session.reflection.attachments || []).forEach((a) => removeFile(a.storedName));
    d.sessions = d.sessions.filter((s) => s.id !== session.id);
  });
  store.logActivity(req.user.email, 'session.deleted', session.title);
  res.json({ ok: true });
}));

router.put('/:id/reflection', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  assertCanEdit(req, session);
  if (session.status !== 'completed') {
    fail(400, 'Reflection can only be recorded once the session status is "completed".');
  }
  const reflection = models.normaliseReflection(req.body || {}, session.reflection);
  store.update(() => {
    session.reflection = reflection;
    session.updatedAt = now();
  });
  store.logActivity(req.user.email, 'session.reflection_updated',
    `${session.title}: ${reflection.certificatesDistributed} certificates distributed`);
  res.json({ ok: true, reflection });
}));

function removeFile(storedName) {
  if (!storedName) return;
  const target = path.join(config.UPLOAD_DIR, path.basename(storedName));
  fs.promises.unlink(target).catch(() => {});
}

/** Parses an uploaded sheet so the UI can preview rows without re-reading the file. */
function parseSheet(filePath, ext) {
  if (ext === '.pdf') return { rows: 0, columns: [], preview: [] };
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: 0, columns: [], preview: [] };
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
  const columns = rows.length ? Object.keys(rows[0]).slice(0, 15) : [];
  return {
    rows: rows.length,
    columns,
    preview: rows.slice(0, 20).map((r) => {
      const trimmed = {};
      columns.forEach((c) => { trimmed[c] = String(r[c] === undefined ? '' : r[c]).slice(0, 120); });
      return trimmed;
    })
  };
}

router.post('/:id/reflection/attachments', auth.requireAuth, upload.single('file'), wrap((req, res) => {
  const session = sessionById(req.params.id);
  assertCanEdit(req, session);
  if (!req.file) fail(400, 'Please choose a file to upload.');

  const ext = path.extname(req.file.originalname).toLowerCase();
  let parsed = { rows: 0, columns: [], preview: [] };
  let parseError = '';
  try {
    parsed = parseSheet(req.file.path, ext);
  } catch (err) {
    parseError = `Could not read the sheet: ${err.message}`;
  }

  const attachment = {
    id: id('att'),
    originalName: req.file.originalname,
    storedName: req.file.filename,
    size: req.file.size,
    kind: ext.replace('.', ''),
    rows: parsed.rows,
    columns: parsed.columns,
    preview: parsed.preview,
    parseError,
    uploadedAt: now(),
    uploadedBy: req.user.email
  };

  store.update(() => {
    session.reflection = Object.assign(models.emptyReflection(), session.reflection || {});
    session.reflection.attachments.push(attachment);
    if (parsed.rows > 0 && !session.reflection.certificatesPrinted) {
      session.reflection.certificatesPrinted = parsed.rows;
    }
    session.updatedAt = now();
  });
  store.logActivity(req.user.email, 'session.certificate_sheet_uploaded',
    `${session.title}: ${attachment.originalName} (${parsed.rows} rows)`);
  res.status(201).json({ ok: true, attachment, reflection: session.reflection });
}));

router.get('/:id/reflection/attachments/:attachmentId', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  if (req.user.role !== 'admin' && session.centreId !== req.user.centreId) {
    fail(403, 'You can only download files from your own centre.');
  }
  const attachment = (session.reflection.attachments || []).find((a) => a.id === req.params.attachmentId);
  if (!attachment) fail(404, 'File not found.');
  const filePath = path.join(config.UPLOAD_DIR, path.basename(attachment.storedName));
  if (!fs.existsSync(filePath)) fail(410, 'The stored file is no longer available on disk.');
  res.download(filePath, attachment.originalName);
}));

router.delete('/:id/reflection/attachments/:attachmentId', auth.requireAuth, wrap((req, res) => {
  const session = sessionById(req.params.id);
  assertCanEdit(req, session);
  const attachment = (session.reflection.attachments || []).find((a) => a.id === req.params.attachmentId);
  if (!attachment) fail(404, 'File not found.');
  store.update(() => {
    session.reflection.attachments = session.reflection.attachments.filter((a) => a.id !== attachment.id);
    session.updatedAt = now();
  });
  removeFile(attachment.storedName);
  res.json({ ok: true });
}));

module.exports = router;
