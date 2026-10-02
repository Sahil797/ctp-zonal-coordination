'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const geo = require('../geo');
const { wrap, fail, str, email, phone, oneOf, id, now, toCsv, int } = require('../util');

const router = express.Router();

/** The headquarters coordinator for a zone, shared with applicants in their confirmation. */
function hqCoordinatorFor(zoneName) {
  const ref = geo.findZone(zoneName);
  if (!ref) return null;
  const record = (store.db().zones || []).find((z) => z.zone === ref.name);
  const hq = (record && record.hqCoordinator) || {};
  if (!hq.name) return null;
  return {
    name: hq.name,
    designation: hq.designation || 'HQ Zone Coordinator',
    email: hq.email || '',
    phone: hq.phone || ''
  };
}

function reference(data) {
  const seq = String(data.enrollments.length + 1).padStart(4, '0');
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `CTP-${stamp}-${seq}`;
}

/** Public endpoint: anyone can apply for a centre-based or online program. */
router.post('/', wrap((req, res) => {
  const body = req.body || {};
  const data = store.db();

  const name = str(body.name, 120);
  const mail = email(body.email);
  const contact = phone(body.phone);
  if (!name) fail(400, 'Your full name is required.');
  if (!contact && !mail) fail(400, 'Please provide an email address or a phone number.');

  const type = oneOf(body.type, ['online', 'basic'], 'basic');
  const program = data.programs.find((p) => p.id === str(body.programId, 60)) || null;
  const centre = data.centres.find((c) => c.id === str(body.centreId, 60)) || null;
  if (type === 'basic' && !centre) fail(400, 'Please choose the centre you want to enroll at.');
  if (centre && centre.status !== 'active') fail(400, 'That centre is not accepting enrollments right now.');

  let record = null;
  store.update((d) => {
    record = {
      id: id('enr'),
      reference: reference(d),
      type,
      programId: program ? program.id : '',
      programName: program ? program.name : str(body.programName, 140) || (d.settings.basicProgramName || 'Basic Computer Training Program'),
      name,
      email: mail,
      phone: contact,
      age: Math.max(0, int(body.age, 0)),
      gender: str(body.gender, 20),
      city: str(body.city, 80),
      state: str(body.state, 80),
      centreId: centre ? centre.id : '',
      preferredMode: oneOf(body.preferredMode, ['onsite', 'online', 'hybrid'], centre ? centre.mode : 'online'),
      preferredTiming: str(body.preferredTiming, 80),
      message: str(body.message, 1000),
      source: str(body.source, 60) || 'website',
      status: 'new',
      createdAt: now(),
      updatedAt: now(),
      handledBy: ''
    };
    d.enrollments.unshift(record);
  });

  store.logActivity(mail || contact, 'enrollment.created', `${name} → ${record.programName}`);

  const confirmation = centre ? {
    centreName: centre.name,
    centreCode: centre.code,
    coordinator: (centre.contacts.coordinator || {}).name || '',
    coordinatorPhone: (centre.contacts.coordinator || {}).phone || '',
    coordinatorEmail: (centre.contacts.coordinator || {}).email || '',
    primaryPhone: centre.contacts.primaryPhone || (centre.contacts.coordinator || {}).phone || '',
    primaryEmail: centre.contacts.primaryEmail || (centre.contacts.coordinator || {}).email || '',
    address: [centre.address.line1, centre.address.line2, centre.address.landmark, centre.address.city,
      centre.address.district, centre.address.state, centre.address.pincode].filter(Boolean).join(', '),
    weeklySchedule: centre.weeklySchedule || '',
    zone: centre.zone,
    zoneLabel: geo.zoneLabel(centre.zone),
    zoneDescription: (geo.findZone(centre.zone) || {}).description || '',
    zoneInCharge: (centre.contacts.zoneInCharge || {}).name || '',
    hqCoordinator: hqCoordinatorFor(centre.zone)
  } : null;

  res.status(201).json({
    ok: true,
    reference: record.reference,
    programName: record.programName,
    enrollUrl: program && program.enrollUrl ? program.enrollUrl : '',
    centre: confirmation,
    message: confirmation
      ? 'Registration received. Your centre details are below — please save them.'
      : 'Registration received. The program team will reach out to you shortly.'
  });
}));

function filtered(req) {
  const data = store.db();
  const centresById = new Map(data.centres.map((c) => [c.id, c]));
  const type = str(req.query.type, 20);
  const status = str(req.query.status, 20);
  const centreId = str(req.query.centreId, 60);
  const q = str(req.query.q, 120).toLowerCase();

  return data.enrollments
    .filter((e) => (!type || e.type === type))
    .filter((e) => (!status || e.status === status))
    .filter((e) => (!centreId || e.centreId === centreId))
    .filter((e) => (!q || [e.name, e.email, e.phone, e.reference, e.programName, e.city, e.state]
      .join(' ').toLowerCase().includes(q)))
    .map((e) => Object.assign({}, e, {
      centreName: centresById.has(e.centreId) ? centresById.get(e.centreId).name : ''
    }));
}

router.get('/', auth.requireAuth, wrap((req, res) => {
  let items = filtered(req);
  if (req.user.role !== 'admin') items = items.filter((e) => e.centreId === req.user.centreId);
  res.json({ total: items.length, items });
}));

router.get('/export.csv', auth.requireAuth, wrap((req, res) => {
  let items = filtered(req);
  if (req.user.role !== 'admin') items = items.filter((e) => e.centreId === req.user.centreId);
  const csv = toCsv(items, [
    { label: 'Reference', value: (e) => e.reference },
    { label: 'Received', value: (e) => e.createdAt },
    { label: 'Type', value: (e) => e.type },
    { label: 'Program', value: (e) => e.programName },
    { label: 'Name', value: (e) => e.name },
    { label: 'Email', value: (e) => e.email },
    { label: 'Phone', value: (e) => e.phone },
    { label: 'Age', value: (e) => e.age || '' },
    { label: 'City', value: (e) => e.city },
    { label: 'State', value: (e) => e.state },
    { label: 'Centre', value: (e) => e.centreName },
    { label: 'Preferred Mode', value: (e) => e.preferredMode },
    { label: 'Preferred Timing', value: (e) => e.preferredTiming },
    { label: 'Status', value: (e) => e.status },
    { label: 'Message', value: (e) => e.message }
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ctp-enrollments.csv"');
  res.send(csv);
}));

router.put('/:id', auth.requireAuth, wrap((req, res) => {
  const data = store.db();
  const record = data.enrollments.find((e) => e.id === req.params.id);
  if (!record) fail(404, 'Enrollment not found.');
  if (req.user.role !== 'admin' && record.centreId !== req.user.centreId) {
    fail(403, 'You can only update enrollments for your own centre.');
  }
  const body = req.body || {};
  store.update(() => {
    record.status = oneOf(body.status, models.ENROLL_STATUS, record.status);
    if (body.message !== undefined) record.message = str(body.message, 1000);
    if (body.centreId !== undefined && req.user.role === 'admin') record.centreId = str(body.centreId, 60);
    record.handledBy = req.user.email;
    record.updatedAt = now();
  });
  res.json({ ok: true, enrollment: record });
}));

router.delete('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  if (!data.enrollments.some((e) => e.id === req.params.id)) fail(404, 'Enrollment not found.');
  store.update((d) => { d.enrollments = d.enrollments.filter((e) => e.id !== req.params.id); });
  res.json({ ok: true });
}));

module.exports = router;
