/* Session manager: log batches, flip status, and capture the completion reflection. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  function sessionFormBody(session, programs, centres, isAdmin) {
    const s = session || {};
    return h('div', null,
      h('div', { class: 'form-grid' },
        isAdmin && !s.id
          ? CTP.field('Centre *', CTP.select('centreId',
            [{ value: '', label: 'Select a centre…' }].concat(centres.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))),
            s.centreId || ''))
          : null,
        CTP.field('Session title *', CTP.input('title', { value: s.title || '', required: true, placeholder: 'e.g. Evening Batch - MS Office Essentials' })),
        CTP.field('Program', CTP.select('programId',
          [{ value: '', label: 'Not linked' }].concat(programs.map((p) => ({ value: p.id, label: p.name }))),
          s.programId || '')),
        CTP.field('Program name (free text)', CTP.input('programName', { value: s.programName || '' })),
        CTP.field('Batch code', CTP.input('batch', { value: s.batch || '', placeholder: 'B2026-1' })),
        CTP.field('Mode', CTP.select('mode', [
          { value: 'onsite', label: 'In-centre' },
          { value: 'online', label: 'Online' },
          { value: 'hybrid', label: 'Hybrid' }
        ], s.mode || 'onsite')),
        CTP.field('Trainer', CTP.input('trainer', { value: s.trainer || '' })),
        CTP.field('Start date', CTP.input('startDate', { type: 'date', value: s.startDate || '' })),
        CTP.field('End date', CTP.input('endDate', { type: 'date', value: s.endDate || '' })),
        CTP.field('Schedule', CTP.input('schedule', { value: s.schedule || '', placeholder: 'Twice a week, 2 hours' })),
        CTP.field('Total classes', CTP.input('totalClasses', { type: 'number', min: '0', value: s.totalClasses || 0 })),
        CTP.field('Learners enrolled', CTP.input('enrolledCount', { type: 'number', min: '0', value: s.enrolledCount || 0 })),
        CTP.field('Learners completed', CTP.input('completedCount', { type: 'number', min: '0', value: s.completedCount || 0 })),
        CTP.field('Status', CTP.select('status', [
          { value: 'planned', label: 'Planned' },
          { value: 'ongoing', label: 'Ongoing' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' }
        ], s.status || 'planned'), 'Mark "Completed" to unlock the reflection tab.')),
      h('div', { class: 'field', style: { marginTop: '.8rem' } },
        h('label', null, 'Notes'),
        h('textarea', { name: 'notes', rows: '3' }, s.notes || '')));
  }

  function openSessionModal(session, programs, centres, afterSave) {
    const isAdmin = CTP.state.user.role === 'admin';
    const form = h('form', { onSubmit: (e) => e.preventDefault() }, sessionFormBody(session, programs, centres, isAdmin));
    const m = CTP.modal({
      title: session ? 'Edit session' : 'Add a session',
      body: form,
      actions: [
        h('button', { class: 'btn', onClick: () => CTP.closeModal() }, 'Cancel'),
        h('button', {
          class: 'btn btn-primary',
          onClick: async (e) => {
            const btn = e.currentTarget;
            if (!form.reportValidity()) return;
            btn.disabled = true;
            try {
              const values = CTP.formValues(form);
              if (session) await CTP.put(`sessions/${session.id}`, values);
              else await CTP.post('sessions', values);
              CTP.closeModal();
              CTP.toast(session ? 'Session updated.' : 'Session added.', 'ok');
              await afterSave();
            } catch (err) {
              CTP.notifyError(err);
            } finally {
              btn.disabled = false;
            }
          }
        }, session ? 'Save changes' : 'Add session')
      ]
    });
    return m;
  }

  CTP.pages.sessions = async function sessionsPage(params, query) {
    const isAdmin = CTP.state.user.role === 'admin';
    const status = query.get('status') || '';
    const centreId = query.get('centreId') || '';
    const q = query.get('q') || '';

    const search = new URLSearchParams();
    if (status) search.set('status', status);
    if (centreId) search.set('centreId', centreId);
    if (q) search.set('q', q);

    const [res, programsRes, centresRes] = await Promise.all([
      CTP.get(`sessions?${search.toString()}`),
      CTP.get('programs'),
      isAdmin ? CTP.get('centres/public/options') : Promise.resolve({ items: [] })
    ]);
    const items = res.items || [];
    const programs = programsRes.items || [];
    const centres = centresRes.items || [];

    const reload = () => CTP.refresh();

    const filterForm = h('form', {
      class: 'filters',
      onSubmit: (e) => {
        e.preventDefault();
        const next = new URLSearchParams();
        ['q', 'status', 'centreId'].forEach((k) => {
          const el = filterForm.elements[k];
          if (el && el.value) next.set(k, el.value);
        });
        CTP.navigate(`/sessions${next.toString() ? `?${next.toString()}` : ''}`);
      }
    },
      CTP.field('Search', CTP.input('q', { value: q, placeholder: 'Title, batch, trainer…' })),
      CTP.field('Status', CTP.select('status', [
        { value: '', label: 'All statuses' },
        { value: 'planned', label: 'Planned' },
        { value: 'ongoing', label: 'Ongoing' },
        { value: 'completed', label: 'Completed' },
        { value: 'cancelled', label: 'Cancelled' }
      ], status)),
      isAdmin ? CTP.field('Centre', CTP.select('centreId',
        [{ value: '', label: 'All centres' }].concat(centres.map((c) => ({ value: c.id, label: c.name }))), centreId)) : null,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'Apply'),
      h('a', { class: 'btn btn-ghost', href: '#/sessions' }, 'Reset'));

    const counts = ['planned', 'ongoing', 'completed', 'cancelled']
      .map((st) => ({ st, n: items.filter((x) => x.status === st).length }));

    const rows = items.map((s) => {
      const r = s.reflection || {};
      const pending = Math.max(0, (r.certificatesPrinted || 0) - (r.certificatesDistributed || 0));
      return h('tr', null,
        h('td', null,
          h('a', { href: `#/sessions/${s.id}`, style: { fontWeight: '700' } }, s.title),
          h('div', { class: 'tiny muted' }, [s.batch, s.programName].filter(Boolean).join(' · '))),
        isAdmin ? h('td', { class: 'tiny' }, s.centreName, h('div', { class: 'muted' }, s.zone || '')) : null,
        h('td', { class: 'tiny nowrap' }, fmt.date(s.startDate), h('div', { class: 'muted' }, s.endDate ? `→ ${fmt.date(s.endDate)}` : '')),
        h('td', null, CTP.badge(s.status)),
        h('td', null, fmt.num(s.enrolledCount), h('div', { class: 'tiny muted' }, `${fmt.num(s.completedCount)} completed`)),
        h('td', null,
          s.status === 'completed'
            ? h('div', null, `${fmt.num(r.certificatesDistributed || 0)} / ${fmt.num(r.certificatesPrinted || 0)}`,
              pending ? h('div', { class: 'tiny', style: { color: 'var(--warn)' } }, `${pending} pending`) : null)
            : h('span', { class: 'tiny muted' }, '—')),
        h('td', { class: 'actions' },
          h('a', { class: 'btn btn-sm', href: `#/sessions/${s.id}` }, s.status === 'completed' ? '🪞 Reflection' : 'Open'),
          ' ',
          h('button', { class: 'btn btn-sm', onClick: () => openSessionModal(s, programs, centres, reload) }, '✏️'),
          ' ',
          h('button', {
            class: 'btn btn-sm btn-ghost',
            onClick: async () => {
              if (!await CTP.confirm(`Delete "${s.title}"? This also removes its reflection and uploaded files.`, 'Delete session')) return;
              try {
                await CTP.del(`sessions/${s.id}`);
                CTP.toast('Session deleted.', 'ok');
                reload();
              } catch (err) { CTP.notifyError(err); }
            }
          }, '🗑')));
    });

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Session manager'),
          h('p', { class: 'muted' },
            `${fmt.num(items.length)} session(s) · `,
            counts.map((c) => `${c.n} ${c.st}`).join(' · '))),
        h('div', { class: 'row' },
          h('a', { class: 'btn', href: `/api/sessions/export.csv?${search.toString()}` }, '⬇ Export CSV'),
          h('button', {
            class: 'btn btn-primary',
            onClick: () => openSessionModal(null, programs, centres, reload)
          }, '＋ Add session'))),
      h('div', { class: 'card', style: { marginBottom: '1rem' } }, filterForm),
      items.length === 0
        ? CTP.empty('📚', 'No sessions yet',
          'Add your first batch to start tracking attendance and certificates.',
          h('button', { class: 'btn btn-primary', onClick: () => openSessionModal(null, programs, centres, reload) }, '＋ Add session'))
        : h('div', { class: 'table-wrap' },
          h('table', null,
            h('thead', null, h('tr', null,
              h('th', null, 'Session'),
              isAdmin ? h('th', null, 'Centre') : null,
              h('th', null, 'Dates'), h('th', null, 'Status'), h('th', null, 'Learners'),
              h('th', null, 'Certificates'), h('th', null, ''))),
            h('tbody', null, ...rows))));
  };

  /* ---------------- Session detail + reflection ---------------- */

  function attachmentRow(session, a, reload) {
    return h('tr', null,
      h('td', null, h('b', null, a.originalName),
        h('div', { class: 'tiny muted' }, `${fmt.bytes(a.size)} · ${fmt.dateTime(a.uploadedAt)}`),
        a.parseError ? h('div', { class: 'tiny', style: { color: 'var(--danger)' } }, a.parseError) : null),
      h('td', null, a.rows ? `${fmt.num(a.rows)} rows` : '—',
        a.columns && a.columns.length ? h('div', { class: 'tiny muted' }, a.columns.slice(0, 4).join(', ')) : null),
      h('td', { class: 'actions' },
        a.preview && a.preview.length
          ? h('button', {
            class: 'btn btn-sm',
            onClick: () => CTP.modal({
              title: `Preview — ${a.originalName}`,
              body: h('div', { class: 'table-wrap' },
                h('table', null,
                  h('thead', null, h('tr', null, ...a.columns.map((c) => h('th', null, c)))),
                  h('tbody', null, ...a.preview.map((row) => h('tr', null,
                    ...a.columns.map((c) => h('td', null, row[c]))))))),
              actions: [h('button', { class: 'btn', onClick: () => CTP.closeModal() }, 'Close')]
            })
          }, '👁 Preview')
          : null,
        ' ',
        h('a', { class: 'btn btn-sm', href: `/api/sessions/${session.id}/reflection/attachments/${a.id}` }, '⬇'),
        ' ',
        h('button', {
          class: 'btn btn-sm btn-ghost',
          onClick: async () => {
            if (!await CTP.confirm(`Remove ${a.originalName}?`, 'Remove file')) return;
            try {
              await CTP.del(`sessions/${session.id}/reflection/attachments/${a.id}`);
              CTP.toast('File removed.', 'ok');
              reload();
            } catch (err) { CTP.notifyError(err); }
          }
        }, '🗑')));
  }

  function reflectionPanel(session, reload) {
    if (session.status !== 'completed') {
      return h('div', { class: 'card' },
        CTP.empty('🔒', 'Reflection unlocks after completion',
          'Change the session status to "Completed" to record certificates, highlights and upload the certificate sheet.',
          h('button', {
            class: 'btn btn-primary',
            onClick: async () => {
              if (!await CTP.confirm('Mark this session as completed?', 'Mark completed')) return;
              try {
                await CTP.put(`sessions/${session.id}`, Object.assign({}, session, { status: 'completed' }));
                CTP.toast('Session marked completed.', 'ok');
                reload();
              } catch (err) { CTP.notifyError(err); }
            }
          }, '✅ Mark as completed')));
    }

    const r = session.reflection || {};
    const form = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          await CTP.put(`sessions/${session.id}/reflection`, CTP.formValues(form));
          CTP.toast('Reflection saved.', 'ok');
          reload();
        } catch (err) {
          CTP.notifyError(err);
        } finally { btn.disabled = false; }
      }
    },
      h('div', { class: 'form-grid' },
        CTP.field('Certificates printed', CTP.input('certificatesPrinted', { type: 'number', min: '0', value: r.certificatesPrinted || 0 })),
        CTP.field('Certificates distributed', CTP.input('certificatesDistributed', { type: 'number', min: '0', value: r.certificatesDistributed || 0 })),
        CTP.field('Distributed on', CTP.input('distributedOn', { type: 'date', value: r.distributedOn || '' })),
        CTP.field('Distribution mode', CTP.input('distributionMode', { value: r.distributionMode || '', placeholder: 'In-centre ceremony / courier / email' })),
        CTP.field('Average feedback (0–5)', CTP.input('feedbackScore', { type: 'number', min: '0', max: '5', step: '0.1', value: r.feedbackScore === null || r.feedbackScore === undefined ? '' : r.feedbackScore }))),
      h('div', { class: 'grid', style: { marginTop: '.8rem' } },
        h('label', { class: 'field' }, h('span', null, 'Highlights'),
          h('textarea', { name: 'highlights', rows: '3', placeholder: 'What went well?' }, r.highlights || '')),
        h('label', { class: 'field' }, h('span', null, 'Challenges'),
          h('textarea', { name: 'challenges', rows: '3', placeholder: 'What was difficult?' }, r.challenges || '')),
        h('label', { class: 'field' }, h('span', null, 'Next steps'),
          h('textarea', { name: 'nextSteps', rows: '2', placeholder: 'Follow-up actions' }, r.nextSteps || ''))),
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save reflection')));

    const fileInput = h('input', { type: 'file', name: 'file', accept: '.xlsx,.xls,.csv,.pdf' });
    const uploadForm = h('form', {
      onSubmit: async (e) => {
        e.preventDefault();
        if (!fileInput.files || !fileInput.files[0]) { CTP.toast('Choose a file first.', 'warn'); return; }
        const fd = new FormData();
        fd.append('file', fileInput.files[0]);
        const btn = uploadForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          const res = await CTP.api(`/api/sessions/${session.id}/reflection/attachments`, { method: 'POST', body: fd });
          CTP.toast(`Uploaded — ${res.attachment.rows ? `${res.attachment.rows} rows detected` : 'file stored'}.`, 'ok');
          reload();
        } catch (err) {
          CTP.notifyError(err);
        } finally { btn.disabled = false; }
      }
    },
      h('div', { class: 'row' }, fileInput,
        h('button', { class: 'btn btn-primary', type: 'submit' }, '⬆ Upload')),
      h('p', { class: 'tiny muted', style: { marginTop: '.4rem', marginBottom: 0 } },
        'Accepted: .xlsx, .xls, .csv, .pdf (max 10 MB). Row count from the first sheet pre-fills "certificates printed".'));

    const pending = Math.max(0, (r.certificatesPrinted || 0) - (r.certificatesDistributed || 0));

    return h('div', { class: 'grid' },
      h('div', { class: 'grid grid-4' },
        CTP.kpi('Printed', r.certificatesPrinted || 0, 'Certificates'),
        CTP.kpi('Distributed', r.certificatesDistributed || 0, 'Handed over', 'ok'),
        CTP.kpi('Pending', pending, pending ? 'Still to distribute' : 'All done 🎉', pending ? 'warn' : 'ok'),
        CTP.kpi('Feedback', r.feedbackScore === null || r.feedbackScore === undefined ? '—' : `${r.feedbackScore} / 5`, 'Average rating', 'violet')),
      h('div', { class: 'card' }, h('h3', null, '🪞 Reflection'), form),
      h('div', { class: 'card' },
        h('h3', null, '📄 Certificate sheets'),
        h('p', { class: 'small muted' }, 'Upload the certificate list (Excel/CSV) so the zonal team can verify names and counts.'),
        uploadForm,
        (r.attachments || []).length
          ? h('div', { class: 'table-wrap', style: { marginTop: '.9rem' } },
            h('table', null,
              h('thead', null, h('tr', null, h('th', null, 'File'), h('th', null, 'Contents'), h('th', null, ''))),
              h('tbody', null, ...(r.attachments || []).map((a) => attachmentRow(session, a, reload)))))
          : h('p', { class: 'small muted', style: { marginTop: '.8rem', marginBottom: 0 } }, 'No files uploaded yet.')));
  }

  CTP.pages.sessionDetail = async function sessionDetail(params) {
    const [res, programsRes] = await Promise.all([
      CTP.get(`sessions/${encodeURIComponent(params.id)}`),
      CTP.get('programs')
    ]);
    const s = res.session;
    const programs = programsRes.items || [];
    const reload = () => CTP.refresh();

    const tabs = ['Overview', 'Reflection'];
    let active = (CTP.queryParams().get('tab') === 'reflection' || s.status === 'completed') ? 'Reflection' : 'Overview';
    const panel = h('div');

    function overview() {
      return h('div', { class: 'grid grid-2' },
        h('div', { class: 'card' },
          h('h3', null, 'Session details'),
          h('dl', { class: 'dl' },
            h('dt', null, 'Centre'), h('dd', null, h('a', { href: `#/centres/${s.centreId}` }, s.centreName)),
            h('dt', null, 'Program'), h('dd', null, s.programName || '—'),
            h('dt', null, 'Batch'), h('dd', null, s.batch || '—'),
            h('dt', null, 'Mode'), h('dd', null, fmt.title(s.mode)),
            h('dt', null, 'Trainer'), h('dd', null, s.trainer || '—'),
            h('dt', null, 'Start'), h('dd', null, fmt.date(s.startDate)),
            h('dt', null, 'End'), h('dd', null, fmt.date(s.endDate)),
            h('dt', null, 'Schedule'), h('dd', null, s.schedule || '—'),
            h('dt', null, 'Total classes'), h('dd', null, s.totalClasses || '—'),
            h('dt', null, 'Enrolled'), h('dd', null, fmt.num(s.enrolledCount)),
            h('dt', null, 'Completed'), h('dd', null, fmt.num(s.completedCount)),
            h('dt', null, 'Created'), h('dd', null, fmt.dateTime(s.createdAt)),
            h('dt', null, 'Last updated'), h('dd', null, fmt.dateTime(s.updatedAt)))),
        h('div', { class: 'card' },
          h('h3', null, 'Notes'),
          h('p', { class: 'small' }, s.notes || 'No notes recorded.'),
          h('h3', { style: { marginTop: '1rem' } }, 'Quick status change'),
          h('div', { class: 'row' },
            ...['planned', 'ongoing', 'completed', 'cancelled'].map((st) => h('button', {
              class: `btn btn-sm ${s.status === st ? 'btn-primary' : ''}`,
              disabled: s.status === st,
              onClick: async () => {
                try {
                  await CTP.put(`sessions/${s.id}`, Object.assign({}, s, { status: st }));
                  CTP.toast(`Status set to ${st}.`, 'ok');
                  reload();
                } catch (err) { CTP.notifyError(err); }
              }
            }, fmt.title(st)))),
          h('p', { class: 'tiny muted', style: { marginTop: '.6rem' } },
            'Ongoing sessions show no reflection. Once completed, the reflection tab records certificate distribution.')));
    }

    function draw() {
      CTP.clear(panel);
      panel.append(active === 'Overview' ? overview() : reflectionPanel(s, reload));
    }

    const tabBar = h('div', { class: 'tabs' }, ...tabs.map((t) => {
      const btn = h('button', {
        class: `tab ${active === t ? 'active' : ''}`,
        onClick: () => {
          active = t;
          CTP.qsa('.tab', tabBar).forEach((x) => x.classList.toggle('active', x.textContent.startsWith(active)));
          draw();
        }
      }, t, t === 'Reflection' && s.status !== 'completed' ? h('span', { class: 'count' }, '🔒') : null);
      return btn;
    }));

    draw();

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'small muted', style: { margin: 0 } }, h('a', { href: '#/sessions' }, '← All sessions')),
          h('h1', null, s.title),
          h('div', { class: 'row' },
            CTP.badge(s.status),
            h('span', { class: 'chip' }, s.centreName),
            s.batch ? h('span', { class: 'chip' }, s.batch) : null,
            h('span', { class: 'chip' }, `${fmt.num(s.enrolledCount)} learners`))),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn',
            onClick: () => openSessionModal(s, programs, [], reload)
          }, '✏️ Edit session'))),
      tabBar,
      panel);
  };
})();
