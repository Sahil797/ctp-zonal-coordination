'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const geo = require('../geo');
const { wrap, fail, str, email, phone, now } = require('../util');

const router = express.Router();

/**
 * Accounts seeded before the configured address was trimmed can carry stray whitespace, which an
 * exact comparison would never match - locking the operator out whatever password they type. The
 * submitted address arrives already trimmed and lowercased by email().
 */
function findUserByEmail(data, mail) {
  return data.users.find((u) => String(u.email).trim().toLowerCase() === mail);
}

router.post('/register', wrap((req, res) => {
  const body = req.body || {};
  const mail = email(body.email);
  const name = str(body.name, 120);
  const password = str(body.password, 200);

  if (!name) fail(400, 'Your full name is required.');
  if (!mail) fail(400, 'A valid email address is required.');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters long.');

  const data = store.db();
  if (findUserByEmail(data, mail)) fail(409, 'An account already exists for this email address.');

  const centreName = str(body.centreName, 140);
  if (!centreName) fail(400, 'Centre name is required.');

  const settings = data.settings || {};
  const autoApprove = settings.autoApproveUsers === true;

  let centre = null;
  store.update((d) => {
    centre = models.normaliseCentre({
      name: centreName,
      address: {
        line1: body.line1,
        city: body.city,
        district: body.district,
        state: body.state,
        pincode: body.pincode
      },
      zone: body.zone,
      mode: body.mode,
      status: 'active',
      contacts: { coordinator: { name, email: mail, phone: body.phone }, primaryPhone: body.phone },
      offersOnline: false
    });
    const user = auth.newUserRecord({
      name,
      email: mail,
      phone: phone(body.phone),
      role: 'coordinator',
      status: autoApprove ? 'active' : 'pending',
      centreId: centre.id,
      designation: str(body.designation, 80) || 'Centre Coordinator',
      zone: centre.zone
    });
    auth.setPassword(user, password);
    centre.ownerUserId = user.id;
    d.centres.push(centre);
    d.users.push(user);
  });

  store.logActivity(mail, 'user.registered', `${name} registered for centre ${centreName}`);
  res.status(201).json({
    ok: true,
    status: autoApprove ? 'active' : 'pending',
    zone: centre.zone,
    zoneLabel: geo.zoneLabel(centre.zone),
    message: autoApprove
      ? 'Account created. You can sign in now.'
      : 'Registration received. An administrator will approve your account shortly.'
  });
}));

router.post('/login', wrap((req, res) => {
  const body = req.body || {};
  const mail = email(body.email);
  const password = str(body.password, 200);
  if (!mail || !password) fail(400, 'Email and password are required.');

  const data = store.db();
  const user = findUserByEmail(data, mail);
  if (!user || !auth.verifyPassword(user, password)) fail(401, 'Incorrect email or password.');
  if (user.status === 'pending') fail(403, 'Your account is awaiting administrator approval.');
  if (user.status !== 'active') fail(403, 'This account has been suspended. Please contact an administrator.');

  store.update(() => { user.lastLoginAt = now(); });
  auth.createSession(res, user);
  store.logActivity(user.email, 'user.login', user.role);
  res.json({ ok: true, user: auth.publicUser(user) });
}));

router.post('/logout', wrap((req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
}));

router.get('/me', wrap((req, res) => {
  if (!req.user) return res.json({ user: null, centre: null });
  const data = store.db();
  const centre = req.user.centreId ? data.centres.find((c) => c.id === req.user.centreId) : null;
  res.json({
    user: auth.publicUser(req.user),
    centre: centre ? models.publicCentre(centre, { full: true }) : null
  });
}));

router.post('/password', auth.requireAuth, wrap((req, res) => {
  const body = req.body || {};
  const current = str(body.currentPassword, 200);
  const next = str(body.newPassword, 200);
  if (next.length < 8) fail(400, 'New password must be at least 8 characters long.');
  if (!auth.verifyPassword(req.user, current)) fail(403, 'Your current password is incorrect.');
  store.update(() => {
    auth.setPassword(req.user, next);
    req.user.mustChangePassword = false;
  });
  store.logActivity(req.user.email, 'user.password_changed', '');
  res.json({ ok: true, message: 'Password updated.' });
}));

router.put('/profile', auth.requireAuth, wrap((req, res) => {
  const body = req.body || {};
  store.update(() => {
    req.user.name = str(body.name, 120) || req.user.name;
    req.user.phone = phone(body.phone);
    req.user.designation = str(body.designation, 80);
  });
  res.json({ ok: true, user: auth.publicUser(req.user) });
}));

module.exports = router;
