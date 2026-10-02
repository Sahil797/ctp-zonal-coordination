'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const geo = require('../geo');
const models = require('../models');
const { wrap, fail, str, toCsv } = require('../util');

const router = express.Router();

/** HQ contact details follow the same privacy rule as centre contacts. */
function showContacts(req) {
  if (req.user) return true;
  const settings = store.db().settings || {};
  return settings.showContactsPublicly === true;
}

function recordFor(data, zoneName) {
  return (data.zones || []).find((z) => z.zone === zoneName) || null;
}

/** Live counts so the zone list doubles as a coverage dashboard. */
function statsFor(data, zoneName) {
  const centres = data.centres.filter((c) => c.zone === zoneName);
  const ids = new Set(centres.map((c) => c.id));
  const sessions = data.sessions.filter((s) => ids.has(s.centreId));
  return {
    centres: centres.length,
    activeCentres: centres.filter((c) => c.status === 'active').length,
    states: new Set(centres.map((c) => c.address.state).filter(Boolean)).size,
    sessions: sessions.length,
    ongoing: sessions.filter((s) => s.status === 'ongoing').length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    learners: sessions.reduce((a, s) => a + (s.enrolledCount || 0), 0),
    certificates: sessions.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0)
  };
}

router.get('/', wrap((req, res) => {
  const data = store.db();
  const opts = { showContacts: showContacts(req) };
  const items = geo.ZONES.map((ref) => Object.assign(
    models.publicZone(recordFor(data, ref.name), ref, opts),
    { stats: statsFor(data, ref.name) }
  ));
  const unzoned = data.centres.filter((c) => !c.zone);
  res.json({
    items,
    unzoned: {
      label: geo.UNZONED_LABEL,
      centres: unzoned.length,
      centreIds: unzoned.map((c) => c.id),
      list: unzoned.map((c) => ({ id: c.id, name: c.name, state: (c.address || {}).state || '', city: (c.address || {}).city || '' }))
    }
  });
}));

router.get('/export.csv', auth.requireAuth, wrap((req, res) => {
  const data = store.db();
  const rows = geo.ZONES.map((ref) => ({
    ref,
    record: recordFor(data, ref.name) || {},
    stats: statsFor(data, ref.name)
  }));
  const csv = toCsv(rows, [
    { label: 'Zone', value: (r) => r.ref.name },
    { label: 'Number', value: (r) => r.ref.number },
    { label: 'States covered', value: (r) => r.ref.description },
    { label: 'HQ Zone Coordinator', value: (r) => (r.record.hqCoordinator || {}).name || '' },
    { label: 'HQ Phone', value: (r) => (r.record.hqCoordinator || {}).phone || '' },
    { label: 'HQ Email', value: (r) => (r.record.hqCoordinator || {}).email || '' },
    { label: 'Centres', value: (r) => r.stats.centres },
    { label: 'Sessions', value: (r) => r.stats.sessions },
    { label: 'Learners', value: (r) => r.stats.learners },
    { label: 'Certificates distributed', value: (r) => r.stats.certificates }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ctp-zones.csv"');
  res.send(csv);
}));

router.get('/:zone', wrap((req, res) => {
  const ref = geo.findZone(req.params.zone);
  if (!ref) fail(404, 'Unknown zone.');
  const data = store.db();
  res.json({
    zone: Object.assign(
      models.publicZone(recordFor(data, ref.name), ref, { showContacts: showContacts(req) }),
      { stats: statsFor(data, ref.name) }
    )
  });
}));

router.put('/:zone', auth.requireAdmin, wrap((req, res) => {
  const ref = geo.findZone(req.params.zone);
  if (!ref) fail(404, 'Unknown zone.');
  const body = req.body || {};
  let saved = null;
  store.update((d) => {
    const index = (d.zones || []).findIndex((z) => z.zone === ref.name);
    const existing = index >= 0 ? d.zones[index] : { zone: ref.name };
    saved = models.normaliseZoneRecord(Object.assign({}, body, { zone: ref.name }), existing);
    if (index >= 0) d.zones[index] = saved;
    else d.zones.push(saved);
  });
  store.logActivity(req.user.email, 'zone.updated',
    `${ref.name} HQ coordinator: ${str((saved.hqCoordinator || {}).name) || 'cleared'}`);
  res.json({ ok: true, zone: Object.assign(models.publicZone(saved, ref, { showContacts: true }), { stats: statsFor(store.db(), ref.name) }) });
}));

module.exports = router;
