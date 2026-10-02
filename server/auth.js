'use strict';
const crypto = require('crypto');
const config = require('./config');
const store = require('./store');
const { id, now, fail } = require('./util');
const { hashPassword } = require('./seed');

function verifyPassword(user, password) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  const attempt = crypto.scryptSync(String(password), user.passwordSalt, 64);
  const known = Buffer.from(user.passwordHash, 'hex');
  if (known.length !== attempt.length) return false;
  return crypto.timingSafeEqual(known, attempt);
}

function setPassword(user, password) {
  const { salt, hash } = hashPassword(password);
  user.passwordSalt = salt;
  user.passwordHash = hash;
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function pruneSessions(data) {
  const cutoff = Date.now();
  data.sessionsAuth = data.sessionsAuth.filter((s) => new Date(s.expiresAt).getTime() > cutoff);
}

function createSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  store.update((data) => {
    pruneSessions(data);
    data.sessionsAuth.push({
      token,
      userId: user.id,
      createdAt: now(),
      expiresAt: new Date(Date.now() + config.SESSION_TTL_MS).toISOString()
    });
  });
  res.cookie(config.SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.SECURE_COOKIES,
    maxAge: config.SESSION_TTL_MS,
    path: '/'
  });
  return token;
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[config.SESSION_COOKIE];
  if (token) {
    store.update((data) => {
      data.sessionsAuth = data.sessionsAuth.filter((s) => s.token !== token);
    });
  }
  res.clearCookie(config.SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.SECURE_COOKIES,
    path: '/'
  });
}

/** Populates req.user (or null) for every request. */
function attachUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[config.SESSION_COOKIE];
  req.user = null;
  if (!token) return next();
  const data = store.db();
  const session = data.sessionsAuth.find((s) => s.token === token);
  if (!session) return next();
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    store.update((d) => { d.sessionsAuth = d.sessionsAuth.filter((s) => s.token !== token); });
    return next();
  }
  const user = data.users.find((u) => u.id === session.userId);
  if (!user || user.status !== 'active') return next();
  req.user = user;
  req.authToken = token;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return fail(401, 'Please sign in to continue.');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return fail(401, 'Please sign in to continue.');
  if (req.user.role !== 'admin') return fail(403, 'Administrator access is required for this action.');
  next();
}

/** True when the user is an admin or owns/manages the given centre. */
function canManageCentre(user, centreId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return Boolean(centreId) && user.centreId === centreId;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    role: user.role,
    status: user.status,
    centreId: user.centreId || null,
    designation: user.designation || '',
    zone: user.zone || '',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

function newUserRecord(input) {
  return {
    id: id('usr'),
    name: input.name,
    email: input.email,
    phone: input.phone || '',
    passwordSalt: '',
    passwordHash: '',
    role: input.role || 'coordinator',
    status: input.status || 'pending',
    centreId: input.centreId || null,
    designation: input.designation || '',
    zone: input.zone || '',
    createdAt: now(),
    lastLoginAt: null,
    mustChangePassword: Boolean(input.mustChangePassword)
  };
}

module.exports = {
  verifyPassword, setPassword, createSession, destroySession, attachUser,
  requireAuth, requireAdmin, canManageCentre, publicUser, newUserRecord, parseCookies
};
