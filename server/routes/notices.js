'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const { wrap, fail, str } = require('../util');

const router = express.Router();

function isLive(notice) {
  if (notice.active === false) return false;
  if (!notice.expiresAt) return true;
  return notice.expiresAt >= new Date().toISOString().slice(0, 10);
}

router.get('/', wrap((req, res) => {
  const data = store.db();
  const showAll = req.user && req.user.role === 'admin' && str(req.query.all) === '1';
  const items = data.notices
    .filter((n) => showAll || isLive(n))
    .filter((n) => {
      if (showAll || !n.centreId) return true;
      return req.user && (req.user.role === 'admin' || req.user.centreId === n.centreId);
    })
    .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ total: items.length, items });
}));

router.post('/', auth.requireAdmin, wrap((req, res) => {
  const body = req.body || {};
  if (!str(body.title)) fail(400, 'Notice title is required.');
  let notice = null;
  store.update((d) => {
    notice = models.normaliseNotice(body, null, req.user.name);
    d.notices.unshift(notice);
  });
  store.logActivity(req.user.email, 'notice.published', notice.title);
  res.status(201).json({ ok: true, notice });
}));

router.put('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  const index = data.notices.findIndex((n) => n.id === req.params.id);
  if (index < 0) fail(404, 'Notice not found.');
  const updated = models.normaliseNotice(req.body || {}, data.notices[index], req.user.name);
  store.update((d) => { d.notices[index] = updated; });
  res.json({ ok: true, notice: updated });
}));

router.delete('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  if (!data.notices.some((n) => n.id === req.params.id)) fail(404, 'Notice not found.');
  store.update((d) => { d.notices = d.notices.filter((n) => n.id !== req.params.id); });
  res.json({ ok: true });
}));

module.exports = router;
