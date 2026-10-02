'use strict';
const express = require('express');
const store = require('../store');
const auth = require('../auth');
const models = require('../models');
const { wrap, fail, str } = require('../util');

const router = express.Router();

function sorted(list) {
  return list.slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
}

router.get('/', wrap((req, res) => {
  const data = store.db();
  const all = req.user && req.user.role === 'admin' && str(req.query.all) === '1';
  const items = sorted(data.programs.filter((p) => all || p.active !== false));
  res.json({ total: items.length, items });
}));

router.post('/', auth.requireAdmin, wrap((req, res) => {
  const body = req.body || {};
  if (!str(body.name)) fail(400, 'Program name is required.');
  let program = null;
  store.update((d) => {
    program = models.normaliseProgram(body);
    if (!program.order) program.order = d.programs.length + 1;
    d.programs.push(program);
  });
  store.logActivity(req.user.email, 'program.created', program.name);
  res.status(201).json({ ok: true, program });
}));

router.put('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  const index = data.programs.findIndex((p) => p.id === req.params.id);
  if (index < 0) fail(404, 'Program not found.');
  const updated = models.normaliseProgram(req.body || {}, data.programs[index]);
  store.update((d) => { d.programs[index] = updated; });
  store.logActivity(req.user.email, 'program.updated', updated.name);
  res.json({ ok: true, program: updated });
}));

router.delete('/:id', auth.requireAdmin, wrap((req, res) => {
  const data = store.db();
  const program = data.programs.find((p) => p.id === req.params.id);
  if (!program) fail(404, 'Program not found.');
  store.update((d) => { d.programs = d.programs.filter((p) => p.id !== program.id); });
  store.logActivity(req.user.email, 'program.deleted', program.name);
  res.json({ ok: true });
}));

router.post('/reorder', auth.requireAdmin, wrap((req, res) => {
  const order = Array.isArray((req.body || {}).order) ? req.body.order : [];
  store.update((d) => {
    order.forEach((programId, index) => {
      const program = d.programs.find((p) => p.id === programId);
      if (program) program.order = index + 1;
    });
  });
  res.json({ ok: true, items: sorted(store.db().programs) });
}));

module.exports = router;
