'use strict';
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const store = require('../store');
const blobs = require('../blobs');
const auth = require('../auth');
const models = require('../models');
const geo = require('../geo');
const { wrap, fail, str, toCsv, id, now, HttpError } = require('../util');

const router = express.Router();

function viewOpts(req, centre) {
  if (req.user && (req.user.role === 'admin' || req.user.centreId === centre.id)) return { full: true };
  const settings = store.db().settings || {};
  return { showContacts: settings.showContactsPublicly !== false && Boolean(req.user) };
}

function matches(centre, q) {
  if (!q) return true;
  const zone = geo.findZone(centre.zone);
  const hay = [
    centre.name, centre.code, centre.zone, zone ? zone.description : '',
    centre.address.city, centre.address.district,
    centre.address.state, centre.address.pincode,
    (centre.contacts.coordinator || {}).name,
    (centre.contacts.zoneInCharge || {}).name
  ].join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

function listCentres(req) {
  const data = store.db();
  const q = str(req.query.q, 120);
  const zoneParam = str(req.query.zone, 40);
  const zone = zoneParam === 'unzoned' ? 'unzoned' : geo.normaliseZone(zoneParam);
  const state = str(req.query.state, 80);
  const mode = str(req.query.mode, 20);
  const status = str(req.query.status, 20);

  return data.centres
    .filter((c) => (!zoneParam || (zone === 'unzoned' ? !c.zone : c.zone === zone)))
    .filter((c) => (!state || c.address.state === state))
    .filter((c) => (!mode || c.mode === mode || (mode === 'online' && c.offersOnline)))
    .filter((c) => (status ? c.status === status : true))
    .filter((c) => matches(c, q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Zone reference plus the HQ coordinator who owns the zone, for centre responses. */
function zoneContext(centre, showContacts) {
  const ref = geo.findZone(centre.zone);
  if (!ref) {
    return {
      zone: '', number: 0, label: geo.UNZONED_LABEL, description: '',
      assigned: false, hqCoordinator: null
    };
  }
  const record = (store.db().zones || []).find((z) => z.zone === ref.name) || null;
  const hq = (record && record.hqCoordinator) || {};
  return {
    zone: ref.name,
    number: ref.number,
    label: ref.label,
    description: ref.description,
    assigned: true,
    hqCoordinator: hq.name ? {
      name: hq.name,
      designation: hq.designation || 'HQ Zone Coordinator',
      email: showContacts ? (hq.email || '') : '',
      phone: showContacts ? (hq.phone || '') : ''
    } : null
  };
}

router.get('/', wrap((req, res) => {
  const settings = store.db().settings || {};
  if (settings.showDirectoryPublicly === false && !req.user) {
    fail(403, 'The centre directory is restricted. Please sign in.');
  }
  const centres = listCentres(req).map((c) => models.publicCentre(c, viewOpts(req, c)));
  res.json({ total: centres.length, items: centres });
}));

router.get('/export.csv', auth.requireAuth, wrap((req, res) => {
  const centres = listCentres(req);
  const zoneRecords = new Map((store.db().zones || []).map((z) => [z.zone, z]));
  const hqName = (zone) => ((zoneRecords.get(zone) || {}).hqCoordinator || {}).name || '';
  const csv = toCsv(centres, [
    { label: 'Code', value: (c) => c.code },
    { label: 'Centre', value: (c) => c.name },
    { label: 'Status', value: (c) => c.status },
    { label: 'Mode', value: (c) => c.mode },
    { label: 'Zone', value: (c) => c.zone || geo.UNZONED_LABEL },
    { label: 'Zone covers', value: (c) => geo.zoneLabel(c.zone) === geo.UNZONED_LABEL ? '' : (geo.findZone(c.zone) || {}).description },
    { label: 'HQ Zone Coordinator', value: (c) => hqName(c.zone) },
    { label: 'City', value: (c) => c.address.city },
    { label: 'District', value: (c) => c.address.district },
    { label: 'State', value: (c) => c.address.state },
    { label: 'Pincode', value: (c) => c.address.pincode },
    { label: 'Address', value: (c) => [c.address.line1, c.address.line2, c.address.landmark].filter(Boolean).join(', ') },
    { label: 'Latitude', value: (c) => c.location.lat || '' },
    { label: 'Longitude', value: (c) => c.location.lng || '' },
    { label: 'Coordinator', value: (c) => c.contacts.coordinator.name },
    { label: 'Coordinator Email', value: (c) => c.contacts.coordinator.email },
    { label: 'Coordinator Phone', value: (c) => c.contacts.coordinator.phone },
    { label: 'Trainer Lead', value: (c) => c.contacts.trainerLead.name },
    { label: 'Trainer Lead Phone', value: (c) => c.contacts.trainerLead.phone },
    { label: 'Centre Secretary', value: (c) => c.contacts.centreSecretary.name },
    { label: 'Centre Secretary Phone', value: (c) => c.contacts.centreSecretary.phone },
    { label: 'Zone In-charge', value: (c) => c.contacts.zoneInCharge.name },
    { label: 'Zone In-charge Phone', value: (c) => c.contacts.zoneInCharge.phone },
    { label: 'Primary Contact', value: (c) => c.contacts.primaryPhone },
    { label: 'Volunteers', value: (c) => (c.volunteers || []).map((v) => `${v.name} (${v.role})`).join('; ') },
    { label: 'Capacity', value: (c) => c.capacity }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ctp-centres.csv"');
  res.send(csv);
}));

router.get('/:id', wrap((req, res) => {
  const data = store.db();
  const centre = data.centres.find((c) => c.id === req.params.id);
  if (!centre) fail(404, 'Centre not found.');
  const sessions = data.sessions.filter((s) => s.centreId === centre.id);
  const opts = viewOpts(req, centre);
  res.json({
    centre: models.publicCentre(centre, opts),
    zoneInfo: zoneContext(centre, Boolean(opts.full || opts.showContacts)),
    stats: {
      sessions: sessions.length,
      ongoing: sessions.filter((s) => s.status === 'ongoing').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      learners: sessions.reduce((a, s) => a + (s.enrolledCount || 0), 0),
      certificatesDistributed: sessions.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0)
    }
  });
}));

router.post('/', auth.requireAdmin, wrap((req, res) => {
  const body = req.body || {};
  if (!str(body.name)) fail(400, 'Centre name is required.');
  let centre = null;
  store.update((d) => {
    centre = models.normaliseCentre(body);
    d.centres.push(centre);
  });
  store.logActivity(req.user.email, 'centre.created', centre.name);
  res.status(201).json({ ok: true, centre: models.publicCentre(centre, { full: true }) });
}));

router.put('/:id', auth.requireAuth, wrap((req, res) => {
  const data = store.db();
  const index = data.centres.findIndex((c) => c.id === req.params.id);
  if (index < 0) fail(404, 'Centre not found.');
  if (!auth.canManageCentre(req.user, req.params.id)) fail(403, 'You can only edit your own centre.');

  const existing = data.centres[index];
  const body = Object.assign({}, req.body || {});
  if (req.user.role !== 'admin') {
    delete body.code;
    delete body.ownerUserId;
  }
  const updated = models.normaliseCentre(body, existing);
  store.update((d) => { d.centres[index] = updated; });
  store.logActivity(req.user.email, 'centre.updated', updated.name);
  res.json({ ok: true, centre: models.publicCentre(updated, { full: true }) });
}));

router.delete('/:id', auth.requireAdmin, wrap(async (req, res) => {
  const data = store.db();
  const centre = data.centres.find((c) => c.id === req.params.id);
  if (!centre) fail(404, 'Centre not found.');
  const photos = centre.photos || [];
  const sessionFiles = data.sessions
    .filter((s) => s.centreId === centre.id)
    .flatMap((s) => ((s.reflection || {}).attachments || []));
  store.update((d) => {
    d.centres = d.centres.filter((c) => c.id !== centre.id);
    d.sessions = d.sessions.filter((s) => s.centreId !== centre.id);
    d.users.forEach((u) => { if (u.centreId === centre.id) u.centreId = null; });
  });
  // The records are gone, so the stored bytes would otherwise sit in the blob table forever.
  await Promise.all([...photos, ...sessionFiles].map((f) => blobs.remove(f.storedName)));
  store.logActivity(req.user.email, 'centre.deleted', centre.name);
  res.json({ ok: true });
}));

router.post('/:id/volunteers', auth.requireAuth, wrap((req, res) => {
  if (!auth.canManageCentre(req.user, req.params.id)) fail(403, 'You can only edit your own centre.');
  const data = store.db();
  const centre = data.centres.find((c) => c.id === req.params.id);
  if (!centre) fail(404, 'Centre not found.');
  const body = req.body || {};
  if (!str(body.name)) fail(400, 'Volunteer name is required.');
  const volunteer = {
    id: id('vol'),
    name: str(body.name, 120),
    email: str(body.email, 160).toLowerCase(),
    phone: str(body.phone, 24),
    role: str(body.role, 80) || 'Volunteer'
  };
  store.update(() => { centre.volunteers.push(volunteer); });
  res.status(201).json({ ok: true, volunteer });
}));

router.delete('/:id/volunteers/:volunteerId', auth.requireAuth, wrap((req, res) => {
  if (!auth.canManageCentre(req.user, req.params.id)) fail(403, 'You can only edit your own centre.');
  const data = store.db();
  const centre = data.centres.find((c) => c.id === req.params.id);
  if (!centre) fail(404, 'Centre not found.');
  store.update(() => {
    centre.volunteers = centre.volunteers.filter((v) => v.id !== req.params.volunteerId);
  });
  res.json({ ok: true });
}));

/* ----------------------------------------------------------------- centre photographs */

// Pictures take a different path from certificate sheets: a smaller cap, image extensions only,
// and a hard ceiling per centre. Bytes go to the shared blob layer, so they survive on a host with
// an ephemeral filesystem exactly like the certificate uploads do.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_PHOTO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!config.ALLOWED_PHOTO_EXT.includes(ext)) {
      return cb(new HttpError(400, `Photos must be ${config.ALLOWED_PHOTO_EXT.join(', ')} files.`));
    }
    cb(null, true);
  }
});

/** Turns multer's own failures into a 400 rather than letting them surface as a server error. */
function receivePhoto(req, res, next) {
  photoUpload.single('photo')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof HttpError) return next(err);
    const mb = Math.round(config.MAX_PHOTO_BYTES / (1024 * 1024));
    const message = err.code === 'LIMIT_FILE_SIZE'
      ? `That photo is too large. Each one must be ${mb} MB or smaller.`
      : err.message || 'The photo could not be read.';
    next(new HttpError(400, message));
  });
}

const PHOTO_TYPES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', ext: 'gif', test: (b) => b.slice(0, 6).toString('latin1').match(/^GIF8[79]a$/) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' }
];

/**
 * Reads the file signature instead of trusting the extension. Without this a renamed HTML or SVG
 * file could be stored and later handed back from the public photo route.
 */
function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  return PHOTO_TYPES.find((t) => t.test(buffer)) || null;
}

function centreForPhotos(centreId) {
  const centre = store.db().centres.find((c) => c.id === centreId);
  if (!centre) fail(404, 'Centre not found.');
  return centre;
}

router.post('/:id/photos', auth.requireAuth, receivePhoto, wrap(async (req, res) => {
  const centre = centreForPhotos(req.params.id);
  if (!auth.canManageCentre(req.user, centre.id)) fail(403, 'You can only add photos to your own centre.');
  if (!req.file) fail(400, 'Please choose a photo to upload.');

  const current = Array.isArray(centre.photos) ? centre.photos : [];
  if (current.length >= config.MAX_CENTRE_PHOTOS) {
    fail(400, `A centre can hold ${config.MAX_CENTRE_PHOTOS} photos. Remove one before adding another.`);
  }

  const kind = sniffImage(req.file.buffer);
  if (!kind) fail(400, 'That file is not a readable image. Please upload a JPG, PNG, WEBP or GIF.');

  const stored = await blobs.put(req.file.buffer, `photo.${kind.ext}`);
  const photo = {
    id: id('pho'),
    originalName: str(req.file.originalname, 160),
    storedName: stored.storedName,
    size: stored.size,
    mime: kind.mime,
    caption: str((req.body || {}).caption, 160),
    uploadedAt: now(),
    uploadedBy: req.user.email
  };

  store.update(() => {
    if (!Array.isArray(centre.photos)) centre.photos = [];
    centre.photos.push(photo);
    centre.updatedAt = now();
  });
  store.logActivity(req.user.email, 'centre.photo_added', `${centre.name}: ${photo.originalName}`);
  res.status(201).json({
    ok: true,
    photo: Object.assign({}, photo, { url: `/api/centres/${centre.id}/photos/${photo.id}`, storedName: undefined }),
    centre: models.publicCentre(centre, { full: true })
  });
}));

router.get('/:id/photos/:photoId', wrap(async (req, res) => {
  const settings = store.db().settings || {};
  if (settings.showDirectoryPublicly === false && !req.user) {
    fail(403, 'The centre directory is restricted. Please sign in.');
  }
  const centre = centreForPhotos(req.params.id);
  const photo = (centre.photos || []).find((p) => p.id === req.params.photoId);
  if (!photo) fail(404, 'Photo not found.');
  const bytes = await blobs.get(photo.storedName);
  if (!bytes) fail(410, 'The stored photo is no longer available.');

  // A photo id is only ever issued once, so the bytes behind this URL never change - replacing a
  // picture means deleting it and uploading a new one, which mints a new id.
  res.setHeader('Content-Type', photo.mime || 'application/octet-stream');
  res.setHeader('Cache-Control', settings.showDirectoryPublicly === false
    ? 'private, max-age=3600'
    : 'public, max-age=604800, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(photo.originalName || 'photo').replace(/"/g, '')}"`);
  res.send(bytes);
}));

router.delete('/:id/photos/:photoId', auth.requireAuth, wrap(async (req, res) => {
  const centre = centreForPhotos(req.params.id);
  if (!auth.canManageCentre(req.user, centre.id)) fail(403, 'You can only remove photos from your own centre.');
  const photo = (centre.photos || []).find((p) => p.id === req.params.photoId);
  if (!photo) fail(404, 'Photo not found.');
  store.update(() => {
    centre.photos = (centre.photos || []).filter((p) => p.id !== photo.id);
    centre.updatedAt = now();
  });
  await blobs.remove(photo.storedName);
  store.logActivity(req.user.email, 'centre.photo_removed', `${centre.name}: ${photo.originalName}`);
  res.json({ ok: true, centre: models.publicCentre(centre, { full: true }) });
}));

/** Lightweight list used by public enrollment pickers. */
router.get('/public/options', wrap((req, res) => {
  const data = store.db();
  res.json({
    items: data.centres
      .filter((c) => c.status === 'active')
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        zone: c.zone,
        city: c.address.city,
        state: c.address.state,
        mode: c.mode,
        offersOnline: c.offersOnline
      }))
      .sort((a, b) => (a.state || '').localeCompare(b.state || '') || a.name.localeCompare(b.name)),
    zones: geo.ZONES.map((z) => ({ name: z.name, number: z.number, label: z.label, description: z.description }))
  });
}));

module.exports = router;
