'use strict';
const express = require('express');
const store = require('../store');
const geo = require('../geo');
const models = require('../models');
const { wrap } = require('../util');

const router = express.Router();

router.get('/meta', wrap((req, res) => {
  const data = store.db();
  const s = data.settings || {};
  res.json({
    settings: {
      orgName: s.orgName,
      shortName: s.shortName,
      subtitle: s.subtitle,
      tagline: s.tagline,
      mission: s.mission,
      supportEmail: s.supportEmail,
      supportPhone: s.supportPhone,
      basicProgramFormUrl: s.basicProgramFormUrl,
      basicProgramName: s.basicProgramName,
      showDirectoryPublicly: s.showDirectoryPublicly !== false,
      showContactsPublicly: s.showContactsPublicly === true,
      accentColor: s.accentColor
    },
    zones: geo.ZONES.map((z) => ({
      name: z.name,
      number: z.number,
      label: z.label,
      description: z.description,
      states: z.states,
      regions: z.regions
    })),
    unzonedLabel: geo.UNZONED_LABEL,
    states: geo.STATES.map((x) => ({ name: x.name, zone: x.zone, zones: x.zones, type: x.type, lat: x.lat, lng: x.lng })),
    centreModes: models.CENTRE_MODES,
    centreStatuses: models.CENTRE_STATUS,
    sessionStatuses: models.SESSION_STATUS,
    enrollmentStatuses: models.ENROLL_STATUS,
    noticeLevels: models.NOTICE_LEVELS
  });
}));

function bucket(list, keyFn) {
  const out = new Map();
  list.forEach((item) => {
    const key = keyFn(item) || 'Unassigned';
    out.set(key, (out.get(key) || 0) + 1);
  });
  return out;
}

router.get('/stats/overview', wrap((req, res) => {
  const data = store.db();
  const centres = data.centres;
  const sessions = data.sessions;
  const centresById = new Map(centres.map((c) => [c.id, c]));

  const certificatesPrinted = sessions.reduce((a, s) => a + ((s.reflection || {}).certificatesPrinted || 0), 0);
  const certificatesDistributed = sessions.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0);
  const learners = sessions.reduce((a, s) => a + (s.enrolledCount || 0), 0);
  const graduates = sessions.reduce((a, s) => a + (s.completedCount || 0), 0);

  const zoneRecords = new Map((data.zones || []).map((z) => [z.zone, z]));
  const buildZoneRow = (zoneName, meta) => {
    const zoneCentres = centres.filter((c) => c.zone === zoneName);
    const zoneIds = new Set(zoneCentres.map((c) => c.id));
    const zoneSessions = sessions.filter((s) => zoneIds.has(s.centreId));
    const hq = (zoneRecords.get(zoneName) || {}).hqCoordinator || {};
    return {
      zone: zoneName,
      number: meta.number,
      label: meta.label,
      description: meta.description,
      hqCoordinator: hq.name || '',
      centres: zoneCentres.length,
      states: new Set(zoneCentres.map((c) => c.address.state).filter(Boolean)).size,
      sessions: zoneSessions.length,
      ongoing: zoneSessions.filter((s) => s.status === 'ongoing').length,
      completed: zoneSessions.filter((s) => s.status === 'completed').length,
      learners: zoneSessions.reduce((a, s) => a + (s.enrolledCount || 0), 0),
      certificates: zoneSessions.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0),
      onlineCentres: zoneCentres.filter((c) => c.offersOnline || c.mode !== 'onsite').length
    };
  };

  const zoneRows = geo.ZONES.map((z) => buildZoneRow(z.name, z));
  const unzonedRow = buildZoneRow('', { number: 0, label: geo.UNZONED_LABEL, description: 'Awaiting an administrator' });
  if (unzonedRow.centres > 0) zoneRows.push(Object.assign(unzonedRow, { zone: '', unassigned: true }));

  const stateRows = Array.from(bucket(centres, (c) => c.address.state).entries())
    .map(([state, count]) => {
      const ref = geo.findState(state);
      const inState = centres.filter((c) => c.address.state === state);
      const ids = new Set(inState.map((c) => c.id));
      const stateSessions = sessions.filter((s) => ids.has(s.centreId));
      const zonesUsed = Array.from(new Set(inState.map((c) => c.zone).filter(Boolean)))
        .sort((a, b) => (geo.findZone(a) || {}).number - (geo.findZone(b) || {}).number);
      return {
        state,
        zone: zonesUsed.join(', ') || (ref ? ref.zone : ''),
        zones: zonesUsed,
        centres: count,
        sessions: stateSessions.length,
        learners: stateSessions.reduce((a, s) => a + (s.enrolledCount || 0), 0),
        certificates: stateSessions.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0)
      };
    })
    .sort((a, b) => b.centres - a.centres);

  const points = centres
    .map((c) => {
      const p = geo.resolvePoint(c);
      if (!p) return null;
      const ids = sessions.filter((s) => s.centreId === c.id);
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        zone: c.zone,
        mode: c.mode,
        status: c.status,
        offersOnline: Boolean(c.offersOnline),
        city: c.address.city,
        state: c.address.state,
        lat: p.lat,
        lng: p.lng,
        approx: p.approx,
        sessions: ids.length,
        ongoing: ids.filter((s) => s.status === 'ongoing').length,
        completed: ids.filter((s) => s.status === 'completed').length,
        learners: ids.reduce((a, s) => a + (s.enrolledCount || 0), 0),
        certificates: ids.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0),
        coordinator: (c.contacts.coordinator || {}).name || ''
      };
    })
    .filter(Boolean);

  const readyForDistribution = sessions
    .filter((s) => s.status === 'completed')
    .filter((s) => {
      const r = s.reflection || {};
      return (r.certificatesPrinted || 0) > (r.certificatesDistributed || 0);
    })
    .map((s) => ({
      id: s.id,
      title: s.title,
      centreId: s.centreId,
      centreName: centresById.has(s.centreId) ? centresById.get(s.centreId).name : '',
      zone: centresById.has(s.centreId) ? centresById.get(s.centreId).zone : '',
      pending: ((s.reflection || {}).certificatesPrinted || 0) - ((s.reflection || {}).certificatesDistributed || 0)
    }))
    .sort((a, b) => b.pending - a.pending)
    .slice(0, 20);

  const recentSessions = sessions
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
      enrolledCount: s.enrolledCount,
      centreName: centresById.has(s.centreId) ? centresById.get(s.centreId).name : '',
      zone: centresById.has(s.centreId) ? centresById.get(s.centreId).zone : ''
    }));

  res.json({
    generatedAt: new Date().toISOString(),
    totals: {
      centres: centres.length,
      activeCentres: centres.filter((c) => c.status === 'active').length,
      states: new Set(centres.map((c) => c.address.state).filter(Boolean)).size,
      zones: new Set(centres.map((c) => c.zone).filter(Boolean)).size,
      unzonedCentres: centres.filter((c) => !c.zone).length,
      onlineEnabledCentres: centres.filter((c) => c.offersOnline || c.mode !== 'onsite').length,
      volunteers: centres.reduce((a, c) => a + (c.volunteers || []).length, 0),
      sessions: sessions.length,
      ongoingSessions: sessions.filter((s) => s.status === 'ongoing').length,
      completedSessions: sessions.filter((s) => s.status === 'completed').length,
      plannedSessions: sessions.filter((s) => s.status === 'planned').length,
      learners,
      graduates,
      certificatesPrinted,
      certificatesDistributed,
      certificatesPending: Math.max(0, certificatesPrinted - certificatesDistributed),
      onlinePrograms: data.programs.filter((p) => p.category === 'online' && p.active !== false).length,
      enrollments: data.enrollments.length,
      newEnrollments: data.enrollments.filter((e) => e.status === 'new').length
    },
    zones: zoneRows,
    states: stateRows,
    points,
    readyForDistribution,
    recentSessions
  });
}));

module.exports = router;
