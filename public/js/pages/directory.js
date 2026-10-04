/* Centre directory: searchable list plus a public centre profile page. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  function personCard(role, p) {
    if (!p || (!p.name && !p.email && !p.phone)) return null;
    return h('div', { class: 'person-card' },
      h('div', { class: 'role' }, role),
      h('div', { class: 'name' }, p.name || '—'),
      h('div', { class: 'meta' },
        p.phone ? h('div', null, h('a', { href: `tel:${p.phone}` }, p.phone)) : null,
        p.email ? h('div', null, h('a', { href: `mailto:${p.email}` }, p.email)) : null));
  }
  CTP.personCard = personCard;

  CTP.pages.directory = async function directory(params, query) {
    const meta = CTP.state.meta || { zones: [], states: [] };
    const filters = {
      q: query.get('q') || '',
      zone: query.get('zone') || '',
      state: query.get('state') || '',
      mode: query.get('mode') || ''
    };

    const search = new URLSearchParams();
    Object.keys(filters).forEach((k) => { if (filters[k]) search.set(k, filters[k]); });
    const res = await CTP.get(`centres?${search.toString()}`);
    const items = res.items || [];

    function apply() {
      const next = new URLSearchParams();
      ['q', 'zone', 'state', 'mode'].forEach((k) => {
        const el = form.elements[k];
        if (el && el.value) next.set(k, el.value);
      });
      CTP.navigate(`/centres${next.toString() ? `?${next.toString()}` : ''}`);
    }

    const form = h('form', {
      class: 'filters',
      onSubmit: (e) => { e.preventDefault(); apply(); }
    },
      CTP.field('Search', CTP.input('q', { value: filters.q, placeholder: 'Centre, city, pincode, coordinator…' })),
      CTP.field('Zone', CTP.select('zone', CTP.zoneFilterOptions('All zones'), filters.zone)),
      CTP.field('State / UT', CTP.select('state', [{ value: '', label: 'All states' }].concat(meta.states.map((s) => ({ value: s.name, label: s.name }))), filters.state)),
      CTP.field('Mode', CTP.select('mode', [
        { value: '', label: 'All modes' },
        { value: 'onsite', label: 'In-centre' },
        { value: 'hybrid', label: 'Hybrid' },
        { value: 'online', label: 'Online enabled' }
      ], filters.mode)),
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Apply'),
      h('a', { class: 'btn btn-ghost', href: '#/centres' }, 'Reset'));
    form.querySelector('[name="q"]').classList.add('wide');

    const rows = items.map((c) => h('tr', null,
      h('td', null,
        h('div', { class: 'centre-cell' },
          c.coverPhotoUrl
            ? h('img', { class: 'centre-avatar', src: c.coverPhotoUrl, alt: '', loading: 'lazy' })
            : h('span', { class: 'centre-avatar is-empty' }, '🏫'),
          h('div', null,
            h('a', { href: `#/centres/${c.id}`, style: { fontWeight: '700' } }, c.name),
            h('div', { class: 'tiny muted mono' }, c.code)))),
      h('td', null, c.address.city || '—', h('div', { class: 'tiny muted' }, c.address.state || '')),
      h('td', null, c.zone || h('span', { class: 'muted' }, '⚠ unassigned'),
        c.zone ? h('div', { class: 'tiny muted' }, CTP.zoneDescription(c.zone)) : null),
      h('td', null, CTP.badge(c.mode === 'onsite' ? 'In-centre' : c.mode),
        c.offersOnline && c.mode === 'onsite' ? h('div', { class: 'tiny muted' }, '+ online') : null),
      h('td', null, (c.contacts.coordinator || {}).name || '—',
        (c.contacts.primaryPhone) ? h('div', { class: 'tiny muted' }, c.contacts.primaryPhone) : null),
      h('td', null, CTP.badge(c.status)),
      h('td', { class: 'actions' },
        h('a', { class: 'btn btn-sm', href: `#/centres/${c.id}` }, 'View'),
        ' ',
        h('a', { class: 'btn btn-sm', href: `#/enroll?centre=${c.id}` }, 'Enroll'))));

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Centre directory'),
          h('p', { class: 'muted' }, `${fmt.num(items.length)} centre(s) in the national repository.`)),
        h('div', { class: 'row' },
          CTP.state.user ? h('a', { class: 'btn', href: '/api/centres/export.csv' }, '⬇ Export CSV') : null,
          CTP.state.user && CTP.state.user.role === 'admin'
            ? h('a', { class: 'btn btn-primary', href: '#/admin?tab=centres' }, '＋ Add centre') : null)),
      h('div', { class: 'card', style: { marginBottom: '1rem' } }, form),
      items.length === 0
        ? CTP.empty('🔍', 'No centres match these filters', 'Try clearing the search or choosing another zone.')
        : h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Centre'), h('th', null, 'City / State'), h('th', null, 'Zone'),
              h('th', null, 'Mode'), h('th', null, 'Coordinator'), h('th', null, 'Status'), h('th', null, ''))),
            h('tbody', null, ...rows))));
  };

  CTP.pages.centreDetail = async function centreDetail(params) {
    const res = await CTP.get(`centres/${encodeURIComponent(params.id)}`);
    const c = res.centre;
    const s = res.stats;
    const canEdit = CTP.state.user && (CTP.state.user.role === 'admin' || CTP.state.user.centreId === c.id);
    const contacts = c.contacts || {};
    const zoneInfo = res.zoneInfo || { label: CTP.zoneLabel(c.zone), assigned: Boolean(c.zone), hqCoordinator: null };
    const hq = zoneInfo.hqCoordinator;
    const hasContacts = Boolean((contacts.coordinator || {}).phone || (contacts.coordinator || {}).email || contacts.primaryPhone);

    const mapPoint = c.point ? [Object.assign({}, c.point, {
      id: c.id, name: c.name, code: c.code, zone: c.zone, mode: c.mode, city: c.address.city,
      state: c.address.state, sessions: s.sessions, ongoing: s.ongoing, completed: s.completed,
      learners: s.learners, certificates: s.certificatesDistributed,
      coordinator: (contacts.coordinator || {}).name || '', offersOnline: c.offersOnline
    })] : [];

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'small muted', style: { margin: 0 } },
            h('a', { href: '#/centres' }, '← Back to directory')),
          h('h1', null, c.name),
          h('div', { class: 'row' },
            h('span', { class: 'chip mono' }, c.code),
            CTP.badge(c.status),
            CTP.badge(c.mode === 'onsite' ? 'In-centre' : c.mode),
            c.zone ? h('span', { class: 'chip', title: zoneInfo.description || '' }, `📌 ${c.zone}`) : h('span', { class: 'chip warn' }, '⚠ Zone not assigned'),
            c.offersOnline ? h('span', { class: 'chip' }, '🌐 Online services available') : null)),
        h('div', { class: 'row' },
          h('a', { class: 'btn btn-primary', href: `#/enroll?centre=${c.id}` }, 'Enroll at this centre'),
          canEdit ? h('a', { class: 'btn', href: '#/centre' }, '✏️ Edit centre') : null,
          h('button', { class: 'btn', onClick: () => window.print() }, '🖨 Print'))),

      h('div', { class: 'grid grid-4', style: { marginBottom: '1rem' } },
        CTP.kpi('Sessions', s.sessions, `${s.ongoing} ongoing`),
        CTP.kpi('Completed', s.completed, 'Batches finished', 'ok'),
        CTP.kpi('Learners', s.learners, 'Total enrolled', 'info'),
        CTP.kpi('Certificates', s.certificatesDistributed, 'Distributed', 'violet')),

      h('div', { class: 'split' },
        h('div', { class: 'grid' },
          (c.photos || []).length
            ? h('div', { class: 'card' },
              h('h3', null, `📷 Photos (${c.photos.length})`),
              CTP.photoGallery(c.photos, { alt: `Photograph of ${c.name}` }))
            : null,

          h('div', { class: 'card' },
            h('h3', null, '📍 Location & schedule'),
            h('dl', { class: 'dl' },
              h('dt', null, 'Address'), h('dd', null, fmt.address(c.address) || '—'),
              h('dt', null, 'Zone'), h('dd', null, zoneInfo.label || '—'),
              h('dt', null, 'Mode'), h('dd', null, fmt.title(c.mode)),
              h('dt', null, 'Weekly schedule'), h('dd', null, c.weeklySchedule || '—'),
              h('dt', null, 'Capacity'), h('dd', null, c.capacity ? `${c.capacity} learners per batch` : '—'),
              h('dt', null, 'Established'), h('dd', null, fmt.date(c.establishedOn)),
              h('dt', null, 'Facilities'), h('dd', null, (c.facilities || []).join(', ') || '—'),
              h('dt', null, 'Coordinates'), h('dd', { class: 'mono' },
                c.location && c.location.lat ? `${c.location.lat}, ${c.location.lng}` : 'Not pinned (plotted at state centroid)'))),

          h('div', { class: 'card' },
            h('h3', null, '👥 Coordination team'),
            hasContacts ? null : h('p', { class: 'small muted' },
              'Contact numbers are visible to signed-in coordinators and administrators.'),
            h('div', { class: 'grid grid-3' },
              personCard('Centre coordinator', contacts.coordinator),
              personCard('Trainer lead', contacts.trainerLead),
              personCard('Centre secretary', contacts.centreSecretary),
              personCard('Zone in-charge', contacts.zoneInCharge),
              contacts.primaryPhone || contacts.primaryEmail
                ? personCard('Primary contact', { name: 'Centre helpline', phone: contacts.primaryPhone, email: contacts.primaryEmail })
                : null)),

          h('div', { class: 'card' },
            h('h3', null, '🏛️ Headquarters zone coordinator'),
            zoneInfo.assigned
              ? h('p', { class: 'small muted', style: { marginTop: 0 } },
                `${zoneInfo.label}. Headquarters contact for escalations, certificate printing and zonal reviews.`)
              : h('p', { class: 'small muted', style: { marginTop: 0 } },
                'This centre has no zone yet, so no HQ coordinator can be shown. An administrator can assign a zone from the admin console.'),
            hq && hq.name
              ? h('div', { class: 'grid grid-2' }, personCard(hq.designation || 'HQ Zone Coordinator', hq))
              : (zoneInfo.assigned
                ? h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'Headquarters has not published a coordinator for this zone yet.')
                : null)),

          (c.volunteers || []).length
            ? h('div', { class: 'card' },
              h('h3', null, `🙌 Volunteers (${c.volunteers.length})`),
              h('div', { class: 'grid grid-3' }, ...c.volunteers.map((v) => personCard(v.role || 'Volunteer', v))))
            : (c.volunteerCount
              ? h('div', { class: 'card' }, h('h3', null, '🙌 Volunteers'),
                h('p', { class: 'small muted', style: { margin: 0 } }, `${c.volunteerCount} volunteer(s) registered at this centre.`))
              : null),

          c.notes ? h('div', { class: 'card' }, h('h3', null, '📝 Notes'), h('p', { class: 'small' }, c.notes)) : null),

        h('div', { class: 'grid' },
          mapPoint.length ? CTP.indiaMap(mapPoint) : null,
          h('div', { class: 'card' },
            h('h3', null, 'Share this centre'),
            h('p', { class: 'small muted' }, 'Copy the public link for WhatsApp or email.'),
            h('button', {
              class: 'btn btn-block',
              onClick: async () => {
                const url = `${window.location.origin}/#/centres/${c.id}`;
                try {
                  await navigator.clipboard.writeText(url);
                  CTP.toast('Link copied to clipboard.', 'ok');
                } catch (err) {
                  CTP.toast(url, 'info', 9000);
                }
              }
            }, '🔗 Copy centre link')))));
  };
})();
