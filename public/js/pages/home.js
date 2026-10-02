/* Home page: national snapshot, India map, notices and online program highlights. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  function noticeCard(n, major) {
    return CTP.noticeCard(n, { major });
  }

  /** Pinned and critical notices lead; everything else follows in date order. */
  function newsSection(notices) {
    if (!notices.length) return null;
    const rank = (n) => (n.pinned ? 0 : 1) + (n.level === 'critical' ? -0.5 : 0) + (n.level === 'success' ? -0.25 : 0);
    const sorted = notices.slice().sort((a, b) => rank(a) - rank(b));
    const lead = sorted.slice(0, 2);
    const rest = sorted.slice(2, 6);
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, '📰 Important news'),
          h('p', { class: 'muted small', style: { margin: 0 } },
            'Certificate printing, distribution drives and zonal announcements from headquarters.')),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: CTP.showAllNews }, `All news (${notices.length})`)),
      h('div', { class: 'grid grid-2' }, ...lead.map((n) => noticeCard(n, true))),
      rest.length ? h('div', { class: 'grid grid-3', style: { marginTop: '.9rem' } }, ...rest.map((n) => noticeCard(n))) : null);
  }

  function zoneLeaderboard(zones) {
    const max = Math.max(1, ...zones.map((z) => z.centres));
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', null, 'Zonal coverage'),
        h('a', { class: 'small', href: '#/centres' }, 'Open directory →')),
      zones.length === 0 ? h('p', { class: 'muted small' }, 'No zones mapped yet.') : null,
      ...zones.map((z) => h('div', {
        class: `bar-row ${z.unassigned ? 'bar-row-warn' : ''}`,
        title: `${z.label}\n${z.sessions} sessions · ${fmt.num(z.learners)} learners${z.hqCoordinator ? `\nHQ: ${z.hqCoordinator}` : ''}`
      },
        h('span', null, z.unassigned ? `⚠ ${z.label}` : z.zone),
        h('span', { class: 'bar-track' },
          h('span', { class: 'bar-fill', style: { width: `${Math.round((z.centres / max) * 100)}%` } })),
        h('b', null, z.centres))),
      h('p', { class: 'tiny muted', style: { marginTop: '.6rem', marginBottom: 0 } },
        'Bar length = number of centres in the zone. Hover a zone for its states and HQ coordinator.'));
  }

  function programStrip(programs) {
    const online = programs.filter((p) => p.category === 'online').slice(0, 4);
    if (!online.length) return null;
    return h('section', { class: 'section' },
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, 'Online programs open for enrollment'),
          h('p', { class: 'muted small', style: { margin: 0 } }, 'Anyone across India can join these — no centre required.')),
        h('a', { class: 'btn', href: '#/programs' }, 'See all programs')),
      h('div', { class: 'grid grid-4' }, ...online.map(CTP.programCard)));
  }

  function readiness(stats) {
    const rows = stats.readyForDistribution || [];
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('h3', null, '🎓 Certificates awaiting distribution'),
        h('span', { class: 'chip' }, `${fmt.num(stats.totals.certificatesPending)} pending`)),
      rows.length === 0
        ? h('p', { class: 'muted small', style: { marginBottom: 0 } }, 'Every printed certificate has been distributed. 🎉')
        : h('div', { class: 'table-wrap', style: { border: 0 } },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Centre'), h('th', null, 'Session'), h('th', null, 'Pending'))),
            h('tbody', null, ...rows.slice(0, 6).map((r) => h('tr', null,
              h('td', null, h('a', { href: `#/centres/${r.centreId}` }, r.centreName), h('div', { class: 'tiny muted' }, r.zone)),
              h('td', null, r.title),
              h('td', null, h('b', null, fmt.num(r.pending)))))))));
  }

  function recent(stats) {
    const rows = stats.recentSessions || [];
    return h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, '🕒 Latest session activity')),
      rows.length === 0
        ? h('p', { class: 'muted small', style: { marginBottom: 0 } }, 'No sessions logged yet.')
        : h('div', { class: 'table-wrap', style: { border: 0 } },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Session'), h('th', null, 'Centre'), h('th', null, 'Status'), h('th', null, 'Learners'))),
            h('tbody', null, ...rows.map((s) => h('tr', null,
              h('td', null, s.title, h('div', { class: 'tiny muted' }, fmt.date(s.startDate))),
              h('td', null, s.centreName, h('div', { class: 'tiny muted' }, s.zone)),
              h('td', null, CTP.badge(s.status)),
              h('td', null, fmt.num(s.enrolledCount))))))));
  }

  CTP.pages = CTP.pages || {};
  CTP.pages.home = async function home() {
    const [stats, programsRes, noticesRes] = await Promise.all([
      CTP.get('stats/overview'),
      CTP.get('programs'),
      CTP.get('notices')
    ]);
    CTP.state.stats = stats;
    const settings = (CTP.state.meta && CTP.state.meta.settings) || {};
    const t = stats.totals;
    const programs = programsRes.items || [];
    const notices = noticesRes.items || [];

    return h('div', { class: 'page' },
      h('section', { class: 'hero' },
        h('h1', null, settings.orgName || 'Computer Training Program'),
        h('p', null, settings.tagline || 'One national repository for every CTP centre, session and certificate.'),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-light', href: '#/enroll' }, '🎯 Enroll in a program'),
          h('a', { class: 'btn btn-light', href: '#/centres' }, '📍 Find a centre'),
          CTP.state.user
            ? h('a', { class: 'btn btn-light', href: '#/dashboard' }, '📊 My dashboard')
            : h('a', { class: 'btn btn-light', href: '#/register' }, '➕ Register my centre')),
        h('div', { class: 'hero-chips' },
          h('span', { class: 'hero-chip' }, `${fmt.num(t.centres)} centres`),
          h('span', { class: 'hero-chip' }, `${fmt.num(t.states)} states & UTs`),
          h('span', { class: 'hero-chip' }, `${fmt.num(t.zones)} zones`),
          h('span', { class: 'hero-chip' }, `${fmt.num(t.learners)} learners reached`),
          h('span', { class: 'hero-chip' }, `${fmt.num(t.certificatesDistributed)} certificates distributed`))),

      newsSection(notices),

      h('section', { class: 'section' },
        h('div', { class: 'grid grid-4' },
          CTP.kpi('Centres', t.centres, `${fmt.num(t.activeCentres)} active`),
          CTP.kpi('Sessions ongoing', t.ongoingSessions, `${fmt.num(t.sessions)} total logged`, 'info'),
          CTP.kpi('Sessions completed', t.completedSessions, `${fmt.num(t.graduates)} learners completed`, 'ok'),
          CTP.kpi('Certificates distributed', t.certificatesDistributed, `${fmt.num(t.certificatesPending)} pending`, 'violet'),
          CTP.kpi('Online-enabled centres', t.onlineEnabledCentres, `${fmt.num(t.onlinePrograms)} online programs`, 'violet'),
          CTP.kpi('Volunteers listed', t.volunteers, 'Across all centres', 'ok'),
          CTP.kpi('Learners enrolled', t.learners, 'All sessions', 'info'),
          CTP.kpi('Enrollment requests', t.enrollments, `${fmt.num(t.newEnrollments)} new`, 'warn'))),

      h('section', { class: 'section' },
        h('div', { class: 'section-head' },
          h('div', null,
            h('h2', null, 'Where CTP is running'),
            h('p', { class: 'muted small', style: { margin: 0 } },
              'Each pin is a centre. Bigger pin = more sessions. Faded pins are approximate (state centroid) until exact coordinates are added.')),
          h('a', { class: 'btn btn-sm', href: '#/centres' }, 'Directory view')),
        h('div', { class: 'split' },
          CTP.indiaMap(stats.points),
          h('div', { class: 'grid' },
            zoneLeaderboard(stats.zones || []),
            readiness(stats)))),

      programStrip(programs),

      h('section', { class: 'section' },
        h('div', { class: 'grid grid-2' },
          recent(stats),
          h('div', { class: 'card' },
            h('h3', null, 'Top states by centre count'),
            (stats.states || []).length === 0
              ? h('p', { class: 'muted small' }, 'No state data yet.')
              : h('div', null, ...(stats.states || []).slice(0, 8).map((s) => {
                const max = Math.max(1, ...(stats.states || []).map((x) => x.centres));
                return h('div', { class: 'bar-row' },
                  h('span', { class: 'small', title: s.state }, s.state),
                  h('span', { class: 'bar-track' },
                    h('span', { class: 'bar-fill', style: { width: `${Math.round((s.centres / max) * 100)}%` } })),
                  h('b', null, s.centres));
              }))))),

      h('p', { class: 'tiny muted center', style: { marginTop: '1.6rem' } },
        `Snapshot generated ${fmt.dateTime(stats.generatedAt)}`));
  };
})();
