/* Coordinator dashboard and the full centre profile editor. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  /**
   * Reusable centre editor.
   * onSave receives the assembled payload; the caller performs the API call.
   */
  CTP.centreForm = function centreForm(centre, options) {
    const opts = options || {};
    const meta = CTP.state.meta || { states: [], zones: [], centreModes: [], centreStatuses: [] };
    const c = centre || {};
    const address = c.address || {};
    const location = c.location || {};
    const contacts = c.contacts || {};
    const volunteers = JSON.parse(JSON.stringify(c.volunteers || []));
    const photos = JSON.parse(JSON.stringify(c.photos || []));
    const maxPhotos = meta.maxCentrePhotos || 5;
    const programs = opts.programs || [];
    const isAdmin = CTP.state.user && CTP.state.user.role === 'admin';

    const volunteerList = h('div', { class: 'grid grid-3' });

    function drawVolunteers() {
      CTP.clear(volunteerList);
      if (!volunteers.length) {
        volunteerList.append(h('p', { class: 'small muted' }, 'No volunteers added yet.'));
      }
      volunteers.forEach((v, index) => {
        volunteerList.append(h('div', { class: 'person-card' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } },
            h('div', { class: 'role' }, `Volunteer ${index + 1}`),
            h('button', {
              class: 'btn btn-sm btn-ghost', type: 'button',
              onClick: () => { volunteers.splice(index, 1); drawVolunteers(); }
            }, '✕')),
          h('input', { value: v.name || '', placeholder: 'Name', onInput: (e) => { v.name = e.target.value; } }),
          h('input', { value: v.role || '', placeholder: 'Role (e.g. Trainer)', style: { marginTop: '.3rem' }, onInput: (e) => { v.role = e.target.value; } }),
          h('input', { value: v.phone || '', placeholder: 'Phone', style: { marginTop: '.3rem' }, onInput: (e) => { v.phone = e.target.value; } }),
          h('input', { value: v.email || '', placeholder: 'Email', style: { marginTop: '.3rem' }, onInput: (e) => { v.email = e.target.value; } })));
      });
    }
    drawVolunteers();

    /* -------------------------------------------------- centre photographs */

    const photoGrid = h('div', { class: 'photo-grid' });
    const photoStatus = h('p', { class: 'small muted', style: { margin: '0' } });
    const photoInput = h('input', {
      type: 'file',
      accept: (meta.photoExtensions || ['.jpg', '.jpeg', '.png', '.webp', '.gif']).join(','),
      multiple: true
    });
    const photoButton = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, '⬆ Upload photos');

    function drawPhotos() {
      CTP.clear(photoGrid);
      photos.forEach((p, index) => {
        photoGrid.append(h('figure', { class: `photo-card${index === 0 ? ' is-cover' : ''}` },
          h('div', { class: 'photo-thumb' },
            h('img', { src: p.url, alt: p.caption || `Photo of ${c.name || 'the centre'}`, loading: 'lazy' }),
            index === 0 ? h('span', { class: 'photo-flag' }, '★ Cover') : null),
          h('figcaption', null,
            h('input', {
              value: p.caption || '',
              maxlength: '160',
              placeholder: 'Caption (optional)',
              onInput: (e) => { p.caption = e.target.value; }
            }),
            h('div', { class: 'photo-actions' },
              index === 0 ? null : h('button', {
                class: 'btn btn-sm btn-ghost', type: 'button', title: 'Use as the cover image',
                onClick: () => { photos.unshift(photos.splice(index, 1)[0]); drawPhotos(); }
              }, '★ Cover'),
              h('button', {
                class: 'btn btn-sm btn-ghost danger', type: 'button', title: 'Remove this photo',
                onClick: async () => {
                  if (!(await CTP.confirm('Remove this photo? This cannot be undone.', 'Remove'))) return;
                  try {
                    await CTP.del(`/api/centres/${c.id}/photos/${p.id}`);
                    photos.splice(index, 1);
                    drawPhotos();
                    CTP.toast('Photo removed.', 'ok');
                  } catch (err) { CTP.notifyError(err); }
                }
              }, '✕ Remove')))));
      });
      const left = maxPhotos - photos.length;
      if (!photos.length) {
        photoGrid.append(h('p', { class: 'small muted' },
          'No photos yet. Add up to ' + maxPhotos + ' pictures of the centre — the room, the lab, a session in progress.'));
      }
      photoStatus.textContent = `${photos.length} of ${maxPhotos} photos used.` + (left > 0 ? ` You can add ${left} more.` : ' Remove one to add another.');
      photoInput.disabled = left <= 0;
      photoButton.disabled = left <= 0;
    }

    async function uploadPhotos() {
      const chosen = Array.from(photoInput.files || []);
      if (!chosen.length) { CTP.toast('Choose one or more photos first.', 'warn'); return; }
      const room = maxPhotos - photos.length;
      if (chosen.length > room) {
        CTP.toast(`Only ${room} more photo${room === 1 ? '' : 's'} can be added.`, 'warn');
        return;
      }
      photoButton.disabled = true;
      photoInput.disabled = true;
      let added = 0;
      try {
        // Uploaded one at a time so a single rejected file does not discard the rest.
        for (const file of chosen) {
          const fd = new FormData();
          fd.append('photo', file);
          try {
            const res = await CTP.api(`/api/centres/${c.id}/photos`, { method: 'POST', body: fd });
            photos.push(res.photo);
            added += 1;
            drawPhotos();
          } catch (err) {
            CTP.toast(`${file.name}: ${err.message}`, 'error', 6000);
          }
        }
        photoInput.value = '';
        if (added) CTP.toast(`${added} photo${added === 1 ? '' : 's'} uploaded.`, 'ok');
      } finally {
        drawPhotos();
      }
    }
    photoButton.addEventListener('click', uploadPhotos);
    drawPhotos();

    const photoFieldset = h('fieldset', null,
      h('legend', null, 'Centre photos'),
      c.id
        ? h('div', null,
          photoGrid,
          h('div', { class: 'row', style: { marginTop: '.7rem', alignItems: 'center' } },
            photoInput, photoButton),
          h('div', { style: { marginTop: '.4rem' } }, photoStatus),
          h('p', { class: 'tiny muted', style: { marginTop: '.3rem', marginBottom: 0 } },
            `Accepted: ${(meta.photoExtensions || []).join(', ') || 'JPG, PNG, WEBP, GIF'} — up to `
            + `${Math.round((meta.maxPhotoBytes || 5242880) / 1048576)} MB each. The first photo is used as the cover `
            + 'in the directory. Captions and the cover order are saved with the form below.'))
        : h('p', { class: 'small muted', style: { margin: 0 } },
          'Save the centre first — photo uploads need a saved centre to attach to.'));

    function personFields(prefix, label) {
      const p = contacts[prefix] || {};
      return h('fieldset', null,
        h('legend', null, label),
        h('div', { class: 'form-grid' },
          CTP.field('Name', CTP.input(`contacts.${prefix}.name`, { value: p.name || '' })),
          CTP.field('Email', CTP.input(`contacts.${prefix}.email`, { type: 'email', value: p.email || '' })),
          CTP.field('Phone', CTP.input(`contacts.${prefix}.phone`, { value: p.phone || '' }))));
    }

    const programChecks = programs.filter((p) => p.category === 'online').map((p) => h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', name: `online:${p.id}`,
        checked: (c.onlineProgramIds || []).includes(p.id)
      }),
      `${p.icon || ''} ${p.name}`));

    const zonePicker = CTP.zonePicker({
      zoneField: 'zone',
      stateField: 'address.state',
      zone: c.zone || '',
      state: address.state || '',
      requireState: true
    });

    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        const flat = CTP.formValues(form);
        const onlineProgramIds = Object.keys(flat)
          .filter((k) => k.startsWith('online:') && flat[k])
          .map((k) => k.slice(7));
        Object.keys(flat).forEach((k) => { if (k.startsWith('online:')) delete flat[k]; });
        const payload = CTP.expand(flat);
        payload.onlineProgramIds = onlineProgramIds;
        payload.volunteers = volunteers.filter((v) => (v.name || '').trim());
        // Only ids and captions travel: the server keeps the stored file details and uses the
        // order given here, so dragging a photo to the front makes it the cover.
        payload.photos = photos.map((p) => ({ id: p.id, caption: p.caption || '' }));
        payload.facilities = String(flat.facilitiesText || '')
          .split(',').map((x) => x.trim()).filter(Boolean);
        delete payload.facilitiesText;
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          await opts.onSave(payload);
        } finally {
          btn.disabled = false;
        }
      }
    },
      h('fieldset', null,
        h('legend', null, 'Centre basics'),
        h('div', { class: 'form-grid' },
          CTP.field('Centre name *', CTP.input('name', { value: c.name || '', required: true })),
          isAdmin ? CTP.field('Centre code', CTP.input('code', { value: c.code || '' }), 'Leave blank to auto-generate.') : null,
          CTP.field('Status', CTP.select('status', (meta.centreStatuses || ['active']).map((s) => ({ value: s, label: fmt.title(s) })), c.status || 'active')),
          CTP.field('Delivery mode', CTP.select('mode', [
            { value: 'onsite', label: 'In-centre' },
            { value: 'hybrid', label: 'Hybrid' },
            { value: 'online', label: 'Online only' }
          ], c.mode || 'onsite')),
          CTP.field('Established on', CTP.input('establishedOn', { type: 'date', value: c.establishedOn || '' })),
          CTP.field('Batch capacity', CTP.input('capacity', { type: 'number', min: '0', value: c.capacity || 0 })),
          CTP.field('Weekly schedule', CTP.input('weeklySchedule', { value: c.weeklySchedule || '', placeholder: 'Mon/Wed/Fri 6–8 PM' })),
          CTP.field('Facilities', CTP.input('facilitiesText', { value: (c.facilities || []).join(', '), placeholder: 'Desktop lab, Projector, Broadband' }), 'Comma separated.'))),

      h('fieldset', null,
        h('legend', null, 'Zone & state'),
        zonePicker.node,
        h('div', { class: 'form-grid' },
          CTP.field('Address line 1', CTP.input('address.line1', { value: address.line1 || '' })),
          CTP.field('Address line 2', CTP.input('address.line2', { value: address.line2 || '' })),
          CTP.field('Landmark', CTP.input('address.landmark', { value: address.landmark || '' })),
          CTP.field('City / Town *', CTP.input('address.city', { value: address.city || '' })),
          CTP.field('District', CTP.input('address.district', { value: address.district || '' })),
          CTP.field('Pincode', CTP.input('address.pincode', { value: address.pincode || '', maxlength: '6', inputmode: 'numeric' })),
          CTP.field('Latitude', CTP.input('location.lat', { type: 'number', step: 'any', value: location.lat || '' }), 'Optional — exact pin on the map.'),
          CTP.field('Longitude', CTP.input('location.lng', { type: 'number', step: 'any', value: location.lng || '' })))),

      h('div', { class: 'grid grid-2' },
        personFields('coordinator', 'Centre coordinator'),
        personFields('trainerLead', 'Trainer lead'),
        personFields('centreSecretary', 'Centre secretary'),
        personFields('zoneInCharge', 'Zone in-charge')),

      h('fieldset', null,
        h('legend', null, 'Primary contact shown to learners'),
        h('div', { class: 'form-grid' },
          CTP.field('Primary phone', CTP.input('contacts.primaryPhone', { value: contacts.primaryPhone || '' })),
          CTP.field('Primary email', CTP.input('contacts.primaryEmail', { type: 'email', value: contacts.primaryEmail || '' })))),

      h('fieldset', null,
        h('legend', null, 'Volunteers'),
        volunteerList,
        h('button', {
          class: 'btn btn-sm', type: 'button', style: { marginTop: '.6rem' },
          onClick: () => { volunteers.push({ name: '', role: 'Volunteer', phone: '', email: '' }); drawVolunteers(); }
        }, '＋ Add volunteer')),

      photoFieldset,

      h('fieldset', null,
        h('legend', null, 'Online services offered from this centre'),
        h('label', { class: 'check', style: { marginBottom: '.6rem' } },
          h('input', { type: 'checkbox', name: 'offersOnline', checked: Boolean(c.offersOnline) }),
          'This centre also delivers online training'),
        programChecks.length ? h('div', { class: 'grid grid-3' }, ...programChecks)
          : h('p', { class: 'small muted' }, 'No online programs configured yet.')),

      h('fieldset', null,
        h('legend', null, 'Notes'),
        h('textarea', { name: 'notes', rows: '3', placeholder: 'Anything the zonal team should know.' }, c.notes || '')),

      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, opts.submitLabel || 'Save centre'),
        opts.onCancel ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: opts.onCancel }, 'Cancel') : null));

    return form;
  };

  CTP.pages.dashboard = async function dashboard() {
    const user = CTP.state.user;
    if (user.role === 'admin' && !user.centreId) {
      CTP.navigate('/admin', true);
      return null;
    }
    const centre = CTP.state.centre;
    if (!centre) {
      return h('div', { class: 'page' },
        CTP.empty('🏫', 'No centre linked to your account',
          'An administrator needs to link your account to a centre before you can manage sessions.',
          h('a', { class: 'btn btn-primary', href: '#/centres' }, 'Browse the directory')));
    }

    const [sessionsRes, noticesRes, enrollRes] = await Promise.all([
      CTP.get(`sessions?centreId=${centre.id}`),
      CTP.get('notices'),
      CTP.get(`enrollments?centreId=${centre.id}`).catch(() => ({ items: [] }))
    ]);
    const sessions = sessionsRes.items || [];
    const ongoing = sessions.filter((s) => s.status === 'ongoing');
    const completed = sessions.filter((s) => s.status === 'completed');
    const printed = completed.reduce((a, s) => a + ((s.reflection || {}).certificatesPrinted || 0), 0);
    const distributed = completed.reduce((a, s) => a + ((s.reflection || {}).certificatesDistributed || 0), 0);
    const learners = sessions.reduce((a, s) => a + (s.enrolledCount || 0), 0);
    const enrollments = enrollRes.items || [];

    const completeness = (() => {
      const checks = [
        ['Address', Boolean(centre.address.line1 && centre.address.city && centre.address.state)],
        ['Exact map pin', Boolean(centre.location && centre.location.lat)],
        ['Coordinator contact', Boolean((centre.contacts.coordinator || {}).phone || (centre.contacts.coordinator || {}).email)],
        ['Trainer lead', Boolean((centre.contacts.trainerLead || {}).name)],
        ['Centre secretary', Boolean((centre.contacts.centreSecretary || {}).name)],
        ['Zone in-charge', Boolean((centre.contacts.zoneInCharge || {}).name)],
        ['Primary contact number', Boolean(centre.contacts.primaryPhone)],
        ['At least one volunteer', (centre.volunteers || []).length > 0],
        ['At least one session', sessions.length > 0]
      ];
      const done = checks.filter((x) => x[1]).length;
      return { checks, done, pct: Math.round((done / checks.length) * 100) };
    })();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, centre.name),
          h('div', { class: 'row' },
            h('span', { class: 'chip mono' }, centre.code),
            CTP.badge(centre.status),
            centre.zone ? h('span', { class: 'chip' }, `${centre.zone} zone`) : null,
            h('span', { class: 'chip' }, fmt.address(centre.address) || 'Address not set'))),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: `#/centres/${centre.id}` }, '👁 Public view'),
          h('a', { class: 'btn', href: '#/centre' }, '✏️ Edit centre'),
          h('a', { class: 'btn btn-primary', href: '#/sessions' }, '📚 Manage sessions'))),

      user.mustChangePassword
        ? h('div', { class: 'alert warn' }, 'Your password was set by an administrator. ',
          h('a', { href: '#/account' }, 'Change it now'), '.')
        : null,

      h('div', { class: 'grid grid-4' },
        CTP.kpi('Sessions', sessions.length, `${ongoing.length} ongoing`),
        CTP.kpi('Completed batches', completed.length, 'Eligible for reflection', 'ok'),
        CTP.kpi('Learners enrolled', learners, 'All batches', 'info'),
        CTP.kpi('Certificates', distributed, `${Math.max(0, printed - distributed)} pending distribution`, 'violet')),

      h('div', { class: 'split section' },
        h('div', { class: 'grid' },
          h('div', { class: 'card' },
            h('div', { class: 'card-head' },
              h('h3', null, 'Sessions'),
              h('a', { class: 'btn btn-sm btn-primary', href: '#/sessions' }, 'Open session manager')),
            sessions.length === 0
              ? h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'No sessions logged yet. Add your first batch from the session manager.')
              : h('div', { class: 'table-wrap', style: { border: 0 } },
                h('table', null,
                  h('thead', null, h('tr', null,
                    h('th', null, 'Session'), h('th', null, 'Dates'), h('th', null, 'Status'),
                    h('th', null, 'Learners'), h('th', null, 'Certificates'))),
                  h('tbody', null, ...sessions.slice(0, 8).map((s) => h('tr', null,
                    h('td', null, h('a', { href: `#/sessions/${s.id}` }, s.title),
                      h('div', { class: 'tiny muted' }, s.batch || s.programName || '')),
                    h('td', { class: 'tiny' }, `${fmt.date(s.startDate)} → ${s.endDate ? fmt.date(s.endDate) : '—'}`),
                    h('td', null, CTP.badge(s.status)),
                    h('td', null, fmt.num(s.enrolledCount)),
                    h('td', null, fmt.num((s.reflection || {}).certificatesDistributed || 0),
                      h('span', { class: 'tiny muted' }, ` / ${fmt.num((s.reflection || {}).certificatesPrinted || 0)}`)))))))),

          enrollments.length
            ? h('div', { class: 'card' },
              h('div', { class: 'card-head' },
                h('h3', null, '📥 Enrollment requests for this centre'),
                h('span', { class: 'chip' }, `${enrollments.filter((e) => e.status === 'new').length} new`)),
              h('div', { class: 'table-wrap', style: { border: 0 } },
                h('table', null,
                  h('thead', null, h('tr', null,
                    h('th', null, 'Applicant'), h('th', null, 'Contact'), h('th', null, 'Program'), h('th', null, 'Status'))),
                  h('tbody', null, ...enrollments.slice(0, 10).map((e) => h('tr', null,
                    h('td', null, e.name, h('div', { class: 'tiny muted mono' }, e.reference)),
                    h('td', { class: 'tiny' }, [e.phone, e.email].filter(Boolean).join(' · ') || '—'),
                    h('td', { class: 'tiny' }, e.programName),
                    h('td', null, CTP.badge(e.status))))))))
            : null),

        h('div', { class: 'grid' },
          h('div', { class: 'card' },
            h('h3', null, 'Profile completeness'),
            h('div', { class: 'bar-track', style: { height: '12px', marginBottom: '.6rem' } },
              h('span', { class: 'bar-fill', style: { width: `${completeness.pct}%` } })),
            h('p', { class: 'small muted' }, `${completeness.done} of ${completeness.checks.length} items complete (${completeness.pct}%)`),
            h('ul', { class: 'small', style: { paddingLeft: '1.1rem', marginBottom: 0 } },
              ...completeness.checks.map(([label, done]) =>
                h('li', { style: { color: done ? 'var(--ok)' : 'var(--text-muted)' } }, done ? `✓ ${label}` : `○ ${label}`)))),

          h('div', { class: 'card' },
            h('h3', null, '📣 Announcements'),
            (noticesRes.items || []).length === 0
              ? h('p', { class: 'small muted', style: { marginBottom: 0 } }, 'No announcements right now.')
              : h('div', null, ...(noticesRes.items || []).slice(0, 5).map((n) => h('div', { class: `notice ${n.level}` },
                h('h4', null, n.title),
                n.body ? h('p', null, n.body) : null,
                h('p', { class: 'tiny muted', style: { marginTop: '.3rem' } }, fmt.relative(n.createdAt)))))))));
  };

  CTP.pages.centreEdit = async function centreEdit() {
    const user = CTP.state.user;
    const centre = CTP.state.centre;
    if (!centre) {
      return h('div', { class: 'page' }, CTP.empty('🏫', 'No centre linked to your account',
        'Ask an administrator to link your account to a centre.'));
    }
    const programsRes = await CTP.get('programs');

    const form = CTP.centreForm(centre, {
      programs: programsRes.items || [],
      submitLabel: 'Save centre details',
      onSave: async (payload) => {
        try {
          await CTP.put(`centres/${centre.id}`, payload);
          await CTP.loadSession();
          CTP.toast('Centre details saved.', 'ok');
          CTP.navigate('/dashboard');
        } catch (err) { CTP.notifyError(err); }
      }
    });

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Edit centre details'),
          h('p', { class: 'muted' }, 'Everything here feeds the public directory, the India map and the enrollment confirmation card.')),
        h('a', { class: 'btn', href: '#/dashboard' }, '← Back to dashboard')),
      h('div', { class: 'card' }, form),
      user.role === 'admin' ? null : h('p', { class: 'tiny muted center', style: { marginTop: '1rem' } },
        'Need to change your centre code or transfer ownership? Contact an administrator.'));
  };
})();
