'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const seed = require('../seed');
const models = require('../models');
const geo = require('../geo');
const { wrap, fail, str, email, phone, bool, oneOf, now } = require('../util');

const router = express.Router();
router.use(auth.requireAdmin);

router.get('/users', wrap((req, res) => {
  const data = store.db();
  const centresById = new Map(data.centres.map((c) => [c.id, c]));
  const items = data.users
    .map((u) => Object.assign(auth.publicUser(u), {
      centreName: centresById.has(u.centreId) ? centresById.get(u.centreId).name : ''
    }))
    .sort((a, b) => {
      const rank = (x) => (x.status === 'pending' ? 0 : 1);
      return rank(a) - rank(b) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  res.json({ total: items.length, items, pending: items.filter((u) => u.status === 'pending').length });
}));

router.post('/users', wrap((req, res) => {
  const body = req.body || {};
  const mail = email(body.email);
  const name = str(body.name, 120);
  const password = str(body.password, 200);
  if (!name || !mail) fail(400, 'Name and a valid email address are required.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters long.');
  const data = store.db();
  if (data.users.some((u) => u.email === mail)) fail(409, 'A user with this email already exists.');

  const centreId = str(body.centreId, 60) || null;
  if (centreId && !data.centres.some((c) => c.id === centreId)) fail(404, 'Centre not found.');

  let user = null;
  store.update((d) => {
    user = auth.newUserRecord({
      name,
      email: mail,
      phone: phone(body.phone),
      role: oneOf(body.role, ['admin', 'coordinator'], 'coordinator'),
      status: 'active',
      centreId,
      designation: str(body.designation, 80),
      zone: geo.normaliseZone(body.zone),
      mustChangePassword: true
    });
    auth.setPassword(user, password);
    d.users.push(user);
  });
  store.logActivity(req.user.email, 'user.created', `${name} (${mail})`);
  res.status(201).json({ ok: true, user: auth.publicUser(user) });
}));

router.put('/users/:id', wrap((req, res) => {
  const data = store.db();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found.');
  const body = req.body || {};

  if (user.id === req.user.id && body.role && body.role !== 'admin') {
    fail(400, 'You cannot remove your own administrator role.');
  }
  if (user.id === req.user.id && body.status && body.status !== 'active') {
    fail(400, 'You cannot deactivate your own account.');
  }

  const centreId = body.centreId !== undefined ? (str(body.centreId, 60) || null) : user.centreId;
  if (centreId && !data.centres.some((c) => c.id === centreId)) fail(404, 'Centre not found.');

  store.update(() => {
    if (body.name !== undefined) user.name = str(body.name, 120) || user.name;
    if (body.phone !== undefined) user.phone = phone(body.phone);
    if (body.designation !== undefined) user.designation = str(body.designation, 80);
    if (body.zone !== undefined) user.zone = geo.normaliseZone(body.zone);
    if (body.role !== undefined) user.role = oneOf(body.role, ['admin', 'coordinator'], user.role);
    if (body.status !== undefined) user.status = oneOf(body.status, ['pending', 'active', 'suspended'], user.status);
    user.centreId = centreId;
    if (body.newPassword) {
      const pwd = str(body.newPassword, 200);
      if (pwd.length < 8) fail(400, 'Password must be at least 8 characters long.');
      auth.setPassword(user, pwd);
      user.mustChangePassword = true;
    }
  });

  if (body.status === 'active') {
    store.logActivity(req.user.email, 'user.approved', `${user.name} (${user.email})`);
  }
  res.json({ ok: true, user: auth.publicUser(user) });
}));

router.delete('/users/:id', wrap((req, res) => {
  const data = store.db();
  const user = data.users.find((u) => u.id === req.params.id);
  if (!user) fail(404, 'User not found.');
  if (user.id === req.user.id) fail(400, 'You cannot delete your own account.');
  if (user.role === 'admin' && data.users.filter((u) => u.role === 'admin' && u.status === 'active').length <= 1) {
    fail(400, 'At least one active administrator must remain.');
  }
  store.update((d) => {
    d.users = d.users.filter((u) => u.id !== user.id);
    d.sessionsAuth = d.sessionsAuth.filter((s) => s.userId !== user.id);
  });
  store.logActivity(req.user.email, 'user.deleted', user.email);
  res.json({ ok: true });
}));

router.get('/settings', wrap((req, res) => {
  res.json({ settings: store.db().settings });
}));

router.put('/settings', wrap((req, res) => {
  const body = req.body || {};
  let settings = null;
  store.update((d) => {
    const s = Object.assign(seed.defaultSettings(), d.settings || {});
    if (body.orgName !== undefined) s.orgName = str(body.orgName, 120) || s.orgName;
    if (body.shortName !== undefined) s.shortName = str(body.shortName, 20) || s.shortName;
    if (body.subtitle !== undefined) s.subtitle = str(body.subtitle, 120);
    if (body.tagline !== undefined) s.tagline = str(body.tagline, 300);
    if (body.mission !== undefined) s.mission = str(body.mission, 1200);
    if (body.supportEmail !== undefined) s.supportEmail = email(body.supportEmail);
    if (body.supportPhone !== undefined) s.supportPhone = phone(body.supportPhone);
    if (body.basicProgramName !== undefined) s.basicProgramName = str(body.basicProgramName, 140);
    if (body.basicProgramFormUrl !== undefined) {
      const url = str(body.basicProgramFormUrl, 600);
      s.basicProgramFormUrl = /^https?:\/\//i.test(url) ? url : '';
    }
    if (body.showDirectoryPublicly !== undefined) s.showDirectoryPublicly = bool(body.showDirectoryPublicly);
    if (body.showContactsPublicly !== undefined) s.showContactsPublicly = bool(body.showContactsPublicly);
    if (body.autoApproveUsers !== undefined) s.autoApproveUsers = bool(body.autoApproveUsers);
    if (body.accentColor !== undefined) s.accentColor = models.colour(body.accentColor, s.accentColor);
    d.settings = s;
    settings = s;
  });
  store.logActivity(req.user.email, 'settings.updated', '');
  res.json({ ok: true, settings });
}));

router.get('/activity', wrap((req, res) => {
  res.json({ items: store.db().activity.slice(0, 200) });
}));

router.get('/backup', wrap((req, res) => {
  const data = JSON.parse(JSON.stringify(store.db()));
  delete data.sessionsAuth;
  data.users = data.users.map((u) => {
    const copy = Object.assign({}, u);
    delete copy.passwordHash;
    delete copy.passwordSalt;
    return copy;
  });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="ctp-backup-${now().slice(0, 10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
}));

router.post('/demo-data', wrap((req, res) => {
  const result = require('../demo').install(req.user);
  res.json(Object.assign({ ok: true }, result));
}));

router.post('/demo-data/clear', wrap((req, res) => {
  const removed = require('../demo').clear();
  res.json({ ok: true, removed });
}));

module.exports = router;
