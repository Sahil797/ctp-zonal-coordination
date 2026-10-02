/* Admin console: centres, users, programs, enrollments, notices, settings and activity. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  const TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'centres', label: 'Centres' },
    { key: 'zones', label: 'Zones' },
    { key: 'users', label: 'Users' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'programs', label: 'Programs' },
    { key: 'enrollments', label: 'Enrollments' },
    { key: 'notices', label: 'Announcements' },
    { key: 'settings', label: 'Settings' },
    { key: 'activity', label: 'Activity' }
  ];

  /* ---------------- Overview ---------------- */

  async function overviewTab() {
    const stats = await CTP.get('stats/overview');
    const t = stats.totals;
    return h('div', null,
      h('div', { class: 'grid grid-4' },
        CTP.kpi('Centres', t.centres, `${t.activeCentres} active · ${t.states} states`),
        CTP.kpi('Sessions', t.sessions, `${t.ongoingSessions} ongoing · ${t.completedSessions} completed`, 'info'),
        CTP.kpi('Learners', t.learners, `${t.graduates} completed`, 'ok'),
        CTP.kpi('Certificates', t.certificatesDistributed, `${t.certificatesPending} pending`, 'violet'),
        CTP.kpi('Volunteers', t.volunteers, 'Across all centres'),
        CTP.kpi('Online programs', t.onlinePrograms, 'Published', 'violet'),
        CTP.kpi('Enrollment requests', t.enrollments, `${t.newEnrollments} new`, 'warn'),
        CTP.kpi('Online-enabled centres', t.onlineEnabledCentres, 'Hybrid or online', 'info')),

      h('div', { class: 'section split' },
        CTP.indiaMap(stats.points),
        h('div', { class: 'card' },
          h('h3', null, 'Zone performance'),
          h('div', { class: 'table-wrap', style: { border: 0 } },
            h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'Zone'), h('th', null, 'Centres'), h('th', null, 'Sessions'), h('th', null, 'Certificates'))),
              h('tbody', null, ...(stats.zones || []).map((z) => h('tr', { class: z.unassigned ? 'row-warn' : '' },
                h('td', null, z.unassigned ? `⚠ ${z.label}` : z.zone,
                  h('div', { class: 'tiny muted' }, z.hqCoordinator ? `HQ: ${z.hqCoordinator}` : z.description)),
                h('td', null, fmt.num(z.centres)),
                h('td', null, fmt.num(z.sessions), h('div', { class: 'tiny muted' }, `${z.ongoing} ongoing`)),
                h('td', null, fmt.num(z.certificates))))))))),

      h('div', { class: 'section card' },
        h('h3', null, 'State-wise coverage'),
        (stats.states || []).length === 0
          ? h('p', { class: 'small muted' }, 'No centres recorded yet.')
          : h('div', { class: 'table-wrap', style: { border: 0 } },
            h('table', null,
              h('thead', null, h('tr', null,
                h('th', null, 'State / UT'), h('th', null, 'Zone'), h('th', null, 'Centres'),
                h('th', null, 'Sessions'), h('th', null, 'Learners'), h('th', null, 'Certificates'))),
              h('tbody', null, ...(stats.states || []).map((s) => h('tr', null,
                h('td', null, s.state), h('td', null, s.zone || '—'),
                h('td', null, fmt.num(s.centres)), h('td', null, fmt.num(s.sessions)),
                h('td', null, fmt.num(s.learners)), h('td', null, fmt.num(s.certificates)))))))),

      h('div', { class: 'section card' },
        h('h3', null, 'Sample data'),
        h('p', { class: 'small muted' },
          'Load a realistic demo dataset (12 centres across all zones with sessions and certificate records) to explore the portal, then clear it before going live.'),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn btn-primary',
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              try {
                const res = await CTP.post('admin/demo-data', {});
                CTP.toast(`Added ${res.centresAdded} centres and ${res.sessionsAdded} sessions.`, 'ok');
                CTP.refresh();
              } catch (err) { CTP.notifyError(err); }
            }
          }, '🌱 Load demo data'),
          h('button', {
            class: 'btn btn-danger',
            onClick: async () => {
              if (!await CTP.confirm('Remove all demo centres and their sessions?', 'Remove demo data')) return;
              try {
                const res = await CTP.post('admin/demo-data/clear', {});
                CTP.toast(`Removed ${res.removed} demo centres.`, 'ok');
                CTP.refresh();
              } catch (err) { CTP.notifyError(err); }
            }
          }, '🧹 Clear demo data'),
          h('a', { class: 'btn', href: '/api/admin/backup' }, '⬇ Download backup (JSON)'))));
  }

  /* ---------------- Centres ---------------- */

  async function centresTab() {
    const [res, programsRes] = await Promise.all([CTP.get('centres'), CTP.get('programs?all=1')]);
    const items = res.items || [];
    const programs = programsRes.items || [];

    function openEditor(centre) {
      const form = CTP.centreForm(centre, {
        programs,
        submitLabel: centre ? 'Save changes' : 'Create centre',
        onSave: async (payload) => {
          try {
            if (centre) await CTP.put(`centres/${centre.id}`, payload);
            else await CTP.post('centres', payload);
            CTP.closeModal();
            CTP.toast(centre ? 'Centre updated.' : 'Centre created.', 'ok');
            CTP.refresh();
          } catch (err) { CTP.notifyError(err); }
        },
        onCancel: () => CTP.closeModal()
      });
      CTP.modal({ title: centre ? `Edit ${centre.name}` : 'Add a centre', body: form, hideFooter: true });
    }

    function openZoneAssign(centre) {
      const picker = CTP.zonePicker({
        zone: centre.zone || '',
        state: centre.address.state || '',
        zoneLabel: 'Assign zone',
        stateLabel: 'Confirm state / UT'
      });
      const form = h('form', { onSubmit: (e) => e.preventDefault() },
        h('p', { class: 'small muted', style: { marginTop: 0 } },
          `${centre.name} — ${centre.address.city || 'city not set'}, ${centre.address.state || 'state not set'}. `
          + 'States outside the published table have no automatic zone, so assign one manually here.'),
        picker.node);
      const save = h('button', { class: 'btn btn-primary' }, 'Save zone');
      save.addEventListener('click', async () => {
        const v = picker.get();
        if (!v.zone) { CTP.toast('Pick a zone first.', 'error'); return; }
        save.disabled = true;
        try {
          await CTP.put(`centres/${centre.id}`, {
            zone: v.zone,
            address: Object.assign({}, centre.address, { state: v.state })
          });
          CTP.closeModal();
          CTP.toast(`${centre.name} assigned to ${v.zone}.`, 'ok');
          CTP.refresh();
        } catch (err) {
          CTP.notifyError(err);
          save.disabled = false;
        }
      });
      CTP.modal({
        title: `Assign a zone to ${centre.name}`,
        body: form,
        actions: [h('button', { class: 'btn', onClick: CTP.closeModal }, 'Cancel'), save]
      });
    }

    const unzoned = items.filter((c) => !c.zone);

    return h('div', null,
      h('div', { class: 'section-head' },
        h('h2', null, `Centres (${items.length})`),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: '/api/centres/export.csv' }, '⬇ Export CSV'),
          h('button', { class: 'btn btn-primary', onClick: () => openEditor(null) }, '＋ Add centre'))),

      unzoned.length
        ? h('div', { class: 'callout warn' },
          h('h4', null, `⚠ ${unzoned.length} centre(s) need a zone assignment`),
          h('p', { class: 'small' },
            'These centres are in states that the published zone table does not cover, so they cannot be rolled up into zonal reporting until you assign a zone manually.'),
          h('div', { class: 'row' }, ...unzoned.map((c) => h('button', {
            class: 'btn btn-sm',
            onClick: () => openZoneAssign(c)
          }, `${c.name} (${c.address.state || 'no state'}) →`))))
        : null,
      items.length === 0
        ? CTP.empty('🏫', 'No centres yet', 'Create the first centre or load the demo dataset from the Overview tab.')
        : h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Centre'), h('th', null, 'Location'), h('th', null, 'Zone'),
              h('th', null, 'Coordinator'), h('th', null, 'Mode'), h('th', null, 'Status'), h('th', null, ''))),
            h('tbody', null, ...items.map((c) => h('tr', null,
              h('td', null, h('a', { href: `#/centres/${c.id}` }, c.name), h('div', { class: 'tiny muted mono' }, c.code)),
              h('td', { class: 'tiny' }, c.address.city || '—', h('div', { class: 'muted' }, c.address.state || '')),
              h('td', null, c.zone || h('button', {
                class: 'btn btn-sm btn-ghost',
                onClick: () => openZoneAssign(c)
              }, '⚠ Assign')),
              h('td', { class: 'tiny' }, (c.contacts.coordinator || {}).name || '—',
                h('div', { class: 'muted' }, c.contacts.primaryPhone || '')),
              h('td', null, CTP.badge(c.mode === 'onsite' ? 'In-centre' : c.mode)),
              h('td', null, CTP.badge(c.status)),
              h('td', { class: 'actions' },
                h('button', { class: 'btn btn-sm', onClick: () => openEditor(c) }, '✏️'),
                ' ',
                h('button', {
                  class: 'btn btn-sm btn-ghost',
                  onClick: async () => {
                    if (!await CTP.confirm(`Delete "${c.name}" and all of its sessions?`, 'Delete centre')) return;
                    try {
                      await CTP.del(`centres/${c.id}`);
                      CTP.toast('Centre deleted.', 'ok');
                      CTP.refresh();
                    } catch (err) { CTP.notifyError(err); }
                  }
                }, '🗑'))))))));
  }

  /* ---------------- Zones ---------------- */

  async function zonesTab() {
    const res = await CTP.get('zones');
    const items = res.items || [];
    const unzoned = res.unzoned || { centres: 0, list: [] };

    function openHqModal(z) {
      const hq = z.hqCoordinator || {};
      const form = h('form', { onSubmit: (e) => e.preventDefault() },
        h('p', { class: 'small muted', style: { marginTop: 0 } },
          `${z.label}. This person is shown to every centre and applicant in the zone as the headquarters point of contact.`),
        h('div', { class: 'form-grid' },
          CTP.field('Name', CTP.input('hqCoordinator.name', { value: hq.name || '' })),
          CTP.field('Designation', CTP.input('hqCoordinator.designation', { value: hq.designation || 'HQ Zone Coordinator' })),
          CTP.field('Phone', CTP.input('hqCoordinator.phone', { value: hq.phone || '' })),
          CTP.field('Email', CTP.input('hqCoordinator.email', { type: 'email', value: hq.email || '' }))),
        CTP.field('Zone notes',
          h('textarea', { name: 'notes', rows: '3', placeholder: 'Review cadence, focus districts, anything the zone should know.' }, z.notes || '')));

      const save = h('button', { class: 'btn btn-primary' }, 'Save coordinator');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await CTP.put(`zones/${encodeURIComponent(z.zone)}`, CTP.expand(CTP.formValues(form)));
          CTP.closeModal();
          CTP.toast(`${z.zone} HQ coordinator updated.`, 'ok');
          CTP.refresh();
        } catch (err) { CTP.notifyError(err); save.disabled = false; }
      });
      CTP.modal({
        title: `HQ coordinator — ${z.zone}`,
        body: form,
        actions: [h('button', { class: 'btn', onClick: CTP.closeModal }, 'Cancel'), save]
      });
    }

    return h('div', null,
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, 'The 12 CTP zones'),
          h('p', { class: 'muted small', style: { margin: 0 } },
            'The published zone → state table drives every centre form. Assign a headquarters coordinator to each zone.')),
        h('a', { class: 'btn', href: '/api/zones/export.csv' }, '⬇ Export CSV')),

      unzoned.centres
        ? h('div', { class: 'callout warn' },
          h('h4', null, `⚠ ${unzoned.centres} centre(s) outside the published zone table`),
          h('p', { class: 'small' },
            `${(unzoned.list || []).map((c) => `${c.name} (${c.state || 'no state'})`).join(', ')} — open the Centres tab to assign a zone manually.`),
          h('a', { class: 'btn btn-sm', href: '#/admin?tab=centres' }, 'Go to Centres →'))
        : null,

      h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'Zone'), h('th', null, 'States / UTs covered'), h('th', null, 'HQ zone coordinator'),
            h('th', null, 'Centres'), h('th', null, 'Sessions'), h('th', null, 'Learners'),
            h('th', null, 'Certificates'), h('th', null, ''))),
          h('tbody', null, ...items.map((z) => {
            const hq = z.hqCoordinator || {};
            return h('tr', null,
              h('td', null, h('b', null, z.zone)),
              h('td', { class: 'tiny' }, z.description),
              h('td', { class: 'tiny' },
                hq.name ? h('b', null, hq.name) : h('span', { class: 'muted' }, 'Not set'),
                hq.name ? h('div', { class: 'muted' }, hq.designation || 'HQ Zone Coordinator') : null,
                hq.phone ? h('div', { class: 'muted' }, hq.phone) : null,
                hq.email ? h('div', { class: 'muted' }, hq.email) : null),
              h('td', null, fmt.num(z.stats.centres)),
              h('td', null, fmt.num(z.stats.sessions), h('div', { class: 'tiny muted' }, `${z.stats.ongoing} ongoing`)),
              h('td', null, fmt.num(z.stats.learners)),
              h('td', null, fmt.num(z.stats.certificates)),
              h('td', { class: 'actions' },
                h('button', { class: 'btn btn-sm', onClick: () => openHqModal(z) }, '✏️ HQ')));
          })))));
  }

  /* ---------------- Users ---------------- */

  async function usersTab() {
    const [res, centresRes] = await Promise.all([CTP.get('admin/users'), CTP.get('centres/public/options')]);
    const items = res.items || [];
    const centres = centresRes.items || [];

    function openUserModal(user) {
      const form = h('form', { onSubmit: (e) => e.preventDefault() },
        h('div', { class: 'form-grid' },
          CTP.field('Full name *', CTP.input('name', { value: user ? user.name : '', required: true })),
          user ? null : CTP.field('Email *', CTP.input('email', { type: 'email', required: true })),
          CTP.field('Phone', CTP.input('phone', { value: user ? user.phone : '' })),
          CTP.field('Designation', CTP.input('designation', { value: user ? user.designation : '' })),
          CTP.field('Role', CTP.select('role', [
            { value: 'coordinator', label: 'Centre coordinator' },
            { value: 'admin', label: 'Administrator' }
          ], user ? user.role : 'coordinator')),
          CTP.field('Status', CTP.select('status', [
            { value: 'pending', label: 'Pending approval' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' }
          ], user ? user.status : 'active')),
          CTP.field('Linked centre', CTP.select('centreId',
            [{ value: '', label: 'No centre' }].concat(centres.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))),
            user ? (user.centreId || '') : '')),
          CTP.field(user ? 'Reset password' : 'Password *',
            CTP.input(user ? 'newPassword' : 'password', { type: 'password', minlength: '8', required: !user }),
            'Minimum 8 characters.')));

      CTP.modal({
        title: user ? `Edit ${user.name}` : 'Add a user',
        narrow: false,
        body: form,
        actions: [
          h('button', { class: 'btn', onClick: () => CTP.closeModal() }, 'Cancel'),
          h('button', {
            class: 'btn btn-primary',
            onClick: async (e) => {
              if (!form.reportValidity()) return;
              e.currentTarget.disabled = true;
              try {
                const values = CTP.formValues(form);
                if (!values.newPassword) delete values.newPassword;
                if (user) await CTP.put(`admin/users/${user.id}`, values);
                else await CTP.post('admin/users', values);
                CTP.closeModal();
                CTP.toast(user ? 'User updated.' : 'User created.', 'ok');
                CTP.refresh();
              } catch (err) {
                CTP.notifyError(err);
                e.currentTarget.disabled = false;
              }
            }
          }, user ? 'Save changes' : 'Create user')
        ]
      });
    }

    async function setStatus(user, status) {
      try {
        await CTP.put(`admin/users/${user.id}`, { status });
        CTP.toast(`${user.name} ${status === 'active' ? 'approved' : status}.`, 'ok');
        CTP.refresh();
      } catch (err) { CTP.notifyError(err); }
    }

    return h('div', null,
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, `Users (${items.length})`),
          res.pending ? h('p', { class: 'small', style: { color: 'var(--warn)', margin: 0 } },
            `${res.pending} account(s) waiting for approval`) : null),
        h('button', { class: 'btn btn-primary', onClick: () => openUserModal(null) }, '＋ Add user')),
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('thead', null, h('tr', null,
            h('th', null, 'User'), h('th', null, 'Role'), h('th', null, 'Centre'),
            h('th', null, 'Status'), h('th', null, 'Last login'), h('th', null, ''))),
          h('tbody', null, ...items.map((u) => h('tr', null,
            h('td', null, h('b', null, u.name),
              h('div', { class: 'tiny muted' }, u.email),
              u.designation ? h('div', { class: 'tiny muted' }, u.designation) : null),
            h('td', null, CTP.badge(u.role)),
            h('td', { class: 'tiny' }, u.centreName || '—'),
            h('td', null, CTP.badge(u.status)),
            h('td', { class: 'tiny muted' }, u.lastLoginAt ? fmt.relative(u.lastLoginAt) : 'never'),
            h('td', { class: 'actions' },
              u.status === 'pending'
                ? h('button', { class: 'btn btn-sm btn-primary', onClick: () => setStatus(u, 'active') }, '✓ Approve')
                : null,
              ' ',
              u.status === 'active' && u.id !== CTP.state.user.id
                ? h('button', { class: 'btn btn-sm', onClick: () => setStatus(u, 'suspended') }, 'Suspend')
                : null,
              ' ',
              h('button', { class: 'btn btn-sm', onClick: () => openUserModal(u) }, '✏️'),
              ' ',
              u.id === CTP.state.user.id ? null : h('button', {
                class: 'btn btn-sm btn-ghost',
                onClick: async () => {
                  if (!await CTP.confirm(`Delete the account for ${u.name}?`, 'Delete user')) return;
                  try {
                    await CTP.del(`admin/users/${u.id}`);
                    CTP.toast('User deleted.', 'ok');
                    CTP.refresh();
                  } catch (err) { CTP.notifyError(err); }
                }
              }, '🗑'))))))));
  }

  /* ---------------- Programs ---------------- */

  async function programsTab() {
    const res = await CTP.get('programs?all=1');
    const items = res.items || [];

    function openProgramModal(program) {
      const p = program || {};
      const preview = h('a', {
        class: 'enroll-btn',
        style: { background: p.buttonColor || '#2563eb', color: p.textColor || '#ffffff', marginTop: '.5rem' }
      }, p.buttonLabel || 'Enroll now');

      const form = h('form', {
        onSubmit: (e) => e.preventDefault(),
        onInput: () => {
          const v = CTP.formValues(form);
          preview.style.background = v.buttonColor;
          preview.style.color = v.textColor;
          preview.textContent = v.buttonLabel || 'Enroll now';
        }
      },
        h('div', { class: 'form-grid' },
          CTP.field('Program name *', CTP.input('name', { value: p.name || '', required: true })),
          CTP.field('Category', CTP.select('category', [
            { value: 'online', label: 'Online offering' },
            { value: 'basic', label: 'Centre-based program' }
          ], p.category || 'online')),
          CTP.field('Icon (emoji)', CTP.input('icon', { value: p.icon || '💡', maxlength: '4' })),
          CTP.field('Level', CTP.input('level', { value: p.level || '', placeholder: 'Beginner / Intermediate' })),
          CTP.field('Delivery mode', CTP.input('mode', { value: p.mode || '', placeholder: 'Online - live sessions' })),
          CTP.field('Duration (weeks)', CTP.input('durationWeeks', { type: 'number', min: '0', value: p.durationWeeks || 0 })),
          CTP.field('Seats', CTP.input('seats', { type: 'number', min: '0', value: p.seats || 0 })),
          CTP.field('Next batch starts', CTP.input('startsOn', { type: 'date', value: p.startsOn || '' })),
          CTP.field('Display order', CTP.input('order', { type: 'number', value: p.order || 0 }))),
        h('div', { class: 'field', style: { marginTop: '.8rem' } },
          h('label', null, 'Description'),
          h('textarea', { name: 'description', rows: '3' }, p.description || '')),
        h('fieldset', { style: { marginTop: '.9rem' } },
          h('legend', null, 'Enrollment button'),
          h('div', { class: 'form-grid' },
            CTP.field('Enrollment form URL', CTP.input('enrollUrl', { value: p.enrollUrl || '', placeholder: 'https://forms.office.com/...' }),
              'Leave blank to use the built-in enrollment form.'),
            CTP.field('Button label', CTP.input('buttonLabel', { value: p.buttonLabel || 'Enroll now' })),
            CTP.field('Button background', CTP.input('buttonColor', { type: 'color', value: p.buttonColor || '#2563eb' })),
            CTP.field('Button text colour', CTP.input('textColor', { type: 'color', value: p.textColor || '#ffffff' }))),
          h('div', null, h('span', { class: 'tiny muted' }, 'Live preview:'), preview)),
        h('label', { class: 'check', style: { marginTop: '.8rem' } },
          h('input', { type: 'checkbox', name: 'active', checked: p.active !== false }),
          'Published (visible to the public)'));

      CTP.modal({
        title: program ? `Edit ${program.name}` : 'Add a program',
        body: form,
        actions: [
          h('button', { class: 'btn', onClick: () => CTP.closeModal() }, 'Cancel'),
          h('button', {
            class: 'btn btn-primary',
            onClick: async (e) => {
              if (!form.reportValidity()) return;
              e.currentTarget.disabled = true;
              try {
                const values = CTP.formValues(form);
                if (program) await CTP.put(`programs/${program.id}`, values);
                else await CTP.post('programs', values);
                CTP.closeModal();
                CTP.toast(program ? 'Program updated.' : 'Program added.', 'ok');
                CTP.refresh();
              } catch (err) {
                CTP.notifyError(err);
                e.currentTarget.disabled = false;
              }
            }
          }, program ? 'Save changes' : 'Add program')
        ]
      });
    }

    return h('div', null,
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, `Programs (${items.length})`),
          h('p', { class: 'small muted', style: { margin: 0 } },
            'Each program gets a hyperlink button on the public page — you control the label, colour and target form.')),
        h('button', { class: 'btn btn-primary', onClick: () => openProgramModal(null) }, '＋ Add program')),
      h('div', { class: 'grid grid-3' }, ...items.map((p) => h('div', { class: 'card program-card' },
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('span', { class: 'pc-icon' }, p.icon || '💡'),
          p.active === false ? CTP.badge('Hidden', 'warning') : CTP.badge('Published', 'success')),
        h('h3', null, p.name),
        h('div', { class: 'pc-meta' },
          CTP.badge(p.category === 'online' ? 'Online' : 'Centre based'),
          p.level ? h('span', { class: 'chip' }, p.level) : null,
          p.durationWeeks ? h('span', { class: 'chip' }, `${p.durationWeeks}w`) : null),
        h('p', { class: 'small muted pc-body' }, p.description || ''),
        h('p', { class: 'tiny muted', style: { wordBreak: 'break-all', margin: 0 } },
          p.enrollUrl ? `🔗 ${p.enrollUrl}` : '🔗 Uses the built-in enrollment form'),
        h('div', {
          class: 'enroll-btn',
          style: { background: p.buttonColor, color: p.textColor, marginTop: '.4rem' }
        }, p.buttonLabel),
        h('div', { class: 'row', style: { marginTop: '.5rem' } },
          h('button', { class: 'btn btn-sm', onClick: () => openProgramModal(p) }, '✏️ Edit'),
          h('button', {
            class: 'btn btn-sm',
            onClick: async () => {
              try {
                await CTP.put(`programs/${p.id}`, Object.assign({}, p, { active: p.active === false }));
                CTP.toast(p.active === false ? 'Program published.' : 'Program hidden.', 'ok');
                CTP.refresh();
              } catch (err) { CTP.notifyError(err); }
            }
          }, p.active === false ? '👁 Publish' : '🙈 Hide'),
          h('button', {
            class: 'btn btn-sm btn-ghost',
            onClick: async () => {
              if (!await CTP.confirm(`Delete "${p.name}"?`, 'Delete program')) return;
              try {
                await CTP.del(`programs/${p.id}`);
                CTP.toast('Program deleted.', 'ok');
                CTP.refresh();
              } catch (err) { CTP.notifyError(err); }
            }
          }, '🗑'))))));
  }

  /* ---------------- Enrollments ---------------- */

  async function enrollmentsTab() {
    const res = await CTP.get('enrollments');
    const items = res.items || [];
    const statuses = ['new', 'contacted', 'enrolled', 'declined'];

    return h('div', null,
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, `Enrollment requests (${items.length})`),
          h('p', { class: 'small muted', style: { margin: 0 } },
            statuses.map((s) => `${items.filter((x) => x.status === s).length} ${s}`).join(' · '))),
        h('a', { class: 'btn', href: '/api/enrollments/export.csv' }, '⬇ Export CSV')),
      items.length === 0
        ? CTP.empty('📥', 'No enrollment requests yet', 'Requests submitted from the public form appear here.')
        : h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Reference'), h('th', null, 'Applicant'), h('th', null, 'Program'),
              h('th', null, 'Centre'), h('th', null, 'Received'), h('th', null, 'Status'), h('th', null, ''))),
            h('tbody', null, ...items.map((e) => h('tr', null,
              h('td', { class: 'mono tiny' }, e.reference),
              h('td', null, h('b', null, e.name),
                h('div', { class: 'tiny muted' }, [e.phone, e.email].filter(Boolean).join(' · ')),
                h('div', { class: 'tiny muted' }, [e.city, e.state].filter(Boolean).join(', '))),
              h('td', { class: 'tiny' }, e.programName, h('div', { class: 'muted' }, fmt.title(e.type))),
              h('td', { class: 'tiny' }, e.centreName || '—'),
              h('td', { class: 'tiny muted' }, fmt.relative(e.createdAt)),
              h('td', null, CTP.badge(e.status)),
              h('td', { class: 'actions' },
                CTP.select('', statuses.map((s) => ({ value: s, label: fmt.title(s) })), e.status, {
                  onChange: async (ev) => {
                    try {
                      await CTP.put(`enrollments/${e.id}`, { status: ev.target.value });
                      CTP.toast('Status updated.', 'ok');
                    } catch (err) { CTP.notifyError(err); }
                  }
                }),
                ' ',
                h('button', {
                  class: 'btn btn-sm btn-ghost',
                  onClick: async () => {
                    if (!await CTP.confirm(`Delete enrollment ${e.reference}?`, 'Delete')) return;
                    try {
                      await CTP.del(`enrollments/${e.id}`);
                      CTP.toast('Deleted.', 'ok');
                      CTP.refresh();
                    } catch (err) { CTP.notifyError(err); }
                  }
                }, '🗑'))))))));
  }

  /* ---------------- Notices ---------------- */

  async function noticesTab() {
    const [res, centresRes] = await Promise.all([CTP.get('notices?all=1'), CTP.get('centres/public/options')]);
    const items = res.items || [];
    const centres = centresRes.items || [];

    function openNoticeModal(notice) {
      const n = notice || {};
      const form = h('form', { onSubmit: (e) => e.preventDefault() },
        h('div', { class: 'form-grid' },
          CTP.field('Title *', CTP.input('title', { value: n.title || '', required: true })),
          CTP.field('Level', CTP.select('level', [
            { value: 'info', label: 'Information' },
            { value: 'success', label: 'Good news (e.g. certificates ready)' },
            { value: 'warning', label: 'Action needed' },
            { value: 'critical', label: 'Urgent' }
          ], n.level || 'info')),
          CTP.field('Target centre', CTP.select('centreId',
            [{ value: '', label: 'All centres (public)' }].concat(centres.map((c) => ({ value: c.id, label: c.name }))),
            n.centreId || '')),
          CTP.field('Link (optional)', CTP.input('linkUrl', { value: n.linkUrl || '', placeholder: 'https://… or #/sessions' })),
          CTP.field('Expires on', CTP.input('expiresAt', { type: 'date', value: n.expiresAt || '' }), 'Leave blank to keep it until removed.')),
        h('div', { class: 'field', style: { marginTop: '.8rem' } },
          h('label', null, 'Message'),
          h('textarea', { name: 'body', rows: '4', placeholder: 'e.g. Certificates for the June batches have been printed and are ready for distribution.' }, n.body || '')),
        h('div', { class: 'row', style: { marginTop: '.8rem' } },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'pinned', checked: Boolean(n.pinned) }), 'Pin to the top & scrolling bar'),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: n.active !== false }), 'Active')));

      CTP.modal({
        title: notice ? 'Edit announcement' : 'Publish an announcement',
        body: form,
        actions: [
          h('button', { class: 'btn', onClick: () => CTP.closeModal() }, 'Cancel'),
          h('button', {
            class: 'btn btn-primary',
            onClick: async (e) => {
              if (!form.reportValidity()) return;
              e.currentTarget.disabled = true;
              try {
                const values = CTP.formValues(form);
                if (notice) await CTP.put(`notices/${notice.id}`, values);
                else await CTP.post('notices', values);
                CTP.closeModal();
                CTP.toast('Announcement saved.', 'ok');
                await CTP.loadNotices();
                CTP.refresh();
              } catch (err) {
                CTP.notifyError(err);
                e.currentTarget.disabled = false;
              }
            }
          }, 'Publish')
        ]
      });
    }

    return h('div', null,
      h('div', { class: 'section-head' },
        h('div', null,
          h('h2', null, `Announcements (${items.length})`),
          h('p', { class: 'small muted', style: { margin: 0 } },
            'Pinned announcements also appear in the scrolling notification bar at the top of every page.')),
        h('button', { class: 'btn btn-primary', onClick: () => openNoticeModal(null) }, '＋ New announcement')),
      items.length === 0
        ? CTP.empty('📣', 'No announcements', 'Publish one to tell centres that certificates are printed and ready.')
        : h('div', { class: 'grid grid-2' }, ...items.map((n) => h('div', { class: `notice ${n.level}` },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } },
            h('h4', null, n.pinned ? '📌 ' : '', n.title),
            h('div', { class: 'row' },
              n.active === false ? CTP.badge('Inactive', 'warning') : CTP.badge('Live', 'success'))),
          n.body ? h('p', null, n.body) : null,
          h('p', { class: 'tiny muted', style: { marginTop: '.4rem' } },
            `${fmt.dateTime(n.createdAt)} · ${n.createdBy}`,
            n.expiresAt ? ` · expires ${fmt.date(n.expiresAt)}` : '',
            n.centreId ? ' · centre-specific' : ''),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn-sm', onClick: () => openNoticeModal(n) }, '✏️ Edit'),
            h('button', {
              class: 'btn btn-sm btn-ghost',
              onClick: async () => {
                if (!await CTP.confirm(`Delete "${n.title}"?`, 'Delete')) return;
                try {
                  await CTP.del(`notices/${n.id}`);
                  CTP.toast('Deleted.', 'ok');
                  await CTP.loadNotices();
                  CTP.refresh();
                } catch (err) { CTP.notifyError(err); }
              }
            }, '🗑')))))); 
  }

  /* ---------------- Settings ---------------- */

  async function settingsTab() {
    const res = await CTP.get('admin/settings');
    const s = res.settings || {};
    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        try {
          await CTP.put('admin/settings', CTP.formValues(form));
          await CTP.loadMeta();
          CTP.applyBranding();
          CTP.toast('Settings saved.', 'ok');
        } catch (err) { CTP.notifyError(err); }
      }
    },
      h('fieldset', null,
        h('legend', null, 'Branding'),
        h('div', { class: 'form-grid' },
          CTP.field('Organisation name', CTP.input('orgName', { value: s.orgName || '' })),
          CTP.field('Short name', CTP.input('shortName', { value: s.shortName || '' })),
          CTP.field('Subtitle', CTP.input('subtitle', { value: s.subtitle || '' })),
          CTP.field('Support email', CTP.input('supportEmail', { type: 'email', value: s.supportEmail || '' })),
          CTP.field('Support phone', CTP.input('supportPhone', { value: s.supportPhone || '' })),
          CTP.field('Accent colour', CTP.input('accentColor', { type: 'color', value: s.accentColor || '#2563eb' }))),
        h('div', { class: 'field', style: { marginTop: '.6rem' } },
          h('label', null, 'Tagline (home hero)'),
          h('textarea', { name: 'tagline', rows: '2' }, s.tagline || '')),
        h('div', { class: 'field', style: { marginTop: '.6rem' } },
          h('label', null, 'Mission statement'),
          h('textarea', { name: 'mission', rows: '3' }, s.mission || ''))),

      h('fieldset', null,
        h('legend', null, 'Enrollment'),
        h('div', { class: 'form-grid' },
          CTP.field('Basic program name', CTP.input('basicProgramName', { value: s.basicProgramName || '' })),
          CTP.field('External basic-program form URL', CTP.input('basicProgramFormUrl', { value: s.basicProgramFormUrl || '', placeholder: 'https://forms.office.com/...' }),
            'Shown as an extra link on the enrollment page.'))),

      h('fieldset', null,
        h('legend', null, 'Privacy & access'),
        h('div', { class: 'grid' },
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', name: 'showDirectoryPublicly', checked: s.showDirectoryPublicly !== false }),
            'Show the centre directory to visitors who are not signed in'),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', name: 'showContactsPublicly', checked: s.showContactsPublicly === true }),
            'Show centre phone/email to signed-in coordinators from other centres'),
          h('label', { class: 'check' },
            h('input', { type: 'checkbox', name: 'autoApproveUsers', checked: s.autoApproveUsers === true }),
            'Automatically approve new coordinator registrations (no admin approval step)'))),

      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save settings')));

    return h('div', null,
      h('h2', null, 'Portal settings'),
      h('div', { class: 'card' }, form));
  }

  /* ---------------- Activity ---------------- */

  async function activityTab() {
    const res = await CTP.get('admin/activity');
    const items = res.items || [];
    return h('div', null,
      h('h2', null, 'Activity log'),
      items.length === 0
        ? CTP.empty('🧾', 'Nothing logged yet')
        : h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null, h('th', null, 'When'), h('th', null, 'Actor'), h('th', null, 'Action'), h('th', null, 'Detail'))),
            h('tbody', null, ...items.map((a) => h('tr', null,
              h('td', { class: 'tiny nowrap' }, fmt.dateTime(a.at)),
              h('td', { class: 'tiny' }, a.actor),
              h('td', null, h('span', { class: 'chip' }, a.action)),
              h('td', { class: 'tiny muted' }, a.detail || '')))))));
  }

  const RENDERERS = {
    overview: overviewTab,
    centres: centresTab,
    zones: zonesTab,
    users: usersTab,
    sessions: null,
    programs: programsTab,
    enrollments: enrollmentsTab,
    notices: noticesTab,
    settings: settingsTab,
    activity: activityTab
  };

  CTP.pages.admin = async function admin(params, query) {
    const requested = query.get('tab') || 'overview';
    if (requested === 'sessions') {
      CTP.navigate('/sessions', true);
      return null;
    }
    const key = RENDERERS[requested] ? requested : 'overview';

    const panel = h('div');
    const tabBar = h('div', { class: 'tabs' }, ...TABS.map((t) => h('a', {
      class: `tab ${t.key === key ? 'active' : ''}`,
      href: `#/admin?tab=${t.key}`
    }, t.label)));

    panel.append(CTP.loader());
    RENDERERS[key]()
      .then((node) => { CTP.clear(panel); panel.append(node); })
      .catch((err) => {
        CTP.clear(panel);
        panel.append(h('div', { class: 'alert danger' }, err.message || 'Failed to load this tab.'));
      });

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Admin console'),
          h('p', { class: 'muted' }, `Signed in as ${CTP.state.user.name}`)),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: '#/' }, 'View public site'),
          h('a', { class: 'btn', href: '/api/admin/backup' }, '⬇ Backup'))),
      tabBar,
      panel);
  };
})();
