'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const geo = require('../geo');
const { wrap, fail, str, toCsv, id } = require('../util');

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

router.delete('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  const centre = data.centres.find((c) => c.id === req.params.id);
  if (!centre) fail(404, 'Centre not found.');
  store.update((d) => {
    d.centres = d.centres.filter((c) => c.id !== centre.id);
    d.sessions = d.sessions.filter((s) => s.centreId !== centre.id);
    d.users.forEach((u) => { if (u.centreId === centre.id) u.centreId = null; });
  });
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
