/* Public enrollment: pick a centre or an online program and get the contact card back. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  function confirmationCard(result) {
    const c = result.centre;
    return h('div', { class: 'card', style: { borderColor: 'var(--ok)' } },
      h('h2', null, '✅ Registration received'),
      h('p', { class: 'small' },
        'Your reference number is ', h('b', { class: 'mono' }, result.reference),
        '. Please save it — quote it when you contact the centre.'),
      h('p', { class: 'small muted' }, `Program: ${result.programName}`),
      c ? h('div', null,
        h('hr', { style: { border: 0, borderTop: '1px solid var(--border)', margin: '.9rem 0' } }),
        h('h3', null, '🏫 Your centre'),
        h('dl', { class: 'dl' },
          h('dt', null, 'Centre'), h('dd', null, h('b', null, c.centreName), ' ', h('span', { class: 'mono tiny' }, c.centreCode)),
          h('dt', null, 'Address'), h('dd', null, c.address || '—'),
          h('dt', null, 'Coordinator'), h('dd', null, c.coordinator || '—'),
          h('dt', null, 'Primary contact'), h('dd', null,
            c.primaryPhone ? h('a', { href: `tel:${c.primaryPhone}` }, c.primaryPhone) : '—',
            c.primaryEmail ? h('span', null, ' · ', h('a', { href: `mailto:${c.primaryEmail}` }, c.primaryEmail)) : null),
          h('dt', null, 'Zone'), h('dd', null, `${c.zoneLabel || c.zone || '—'}${c.zoneInCharge ? ` (in-charge: ${c.zoneInCharge})` : ''}`),
          c.hqCoordinator && c.hqCoordinator.name ? h('dt', null, 'HQ zone coordinator') : null,
          c.hqCoordinator && c.hqCoordinator.name
            ? h('dd', null, c.hqCoordinator.name,
              c.hqCoordinator.phone ? h('span', null, ' · ', h('a', { href: `tel:${c.hqCoordinator.phone}` }, c.hqCoordinator.phone)) : null,
              c.hqCoordinator.email ? h('span', null, ' · ', h('a', { href: `mailto:${c.hqCoordinator.email}` }, c.hqCoordinator.email)) : null)
            : null,
          c.weeklySchedule ? h('dt', null, 'Usual timings') : null,
          c.weeklySchedule ? h('dd', null, c.weeklySchedule) : null))
        : h('p', { class: 'small muted' }, 'The program team will contact you with joining details.'),
      result.enrollUrl
        ? h('p', { class: 'small', style: { marginTop: '.8rem' } },
          'Complete the external registration form here: ',
          h('a', { href: result.enrollUrl, target: '_blank', rel: 'noopener' }, 'Open form ↗'))
        : null,
      h('div', { class: 'row', style: { marginTop: '1rem' } },
        h('button', { class: 'btn', onClick: () => window.print() }, '🖨 Print / save as PDF'),
        h('a', { class: 'btn', href: '#/enroll' }, 'Register someone else'),
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Back to home')));
  }

  CTP.pages.enroll = async function enroll(params, query) {
    const [optionsRes, programsRes] = await Promise.all([
      CTP.get('centres/public/options'),
      CTP.get('programs')
    ]);
    const meta = CTP.state.meta || { states: [] };
    const centres = optionsRes.items || [];
    const programs = programsRes.items || [];
    const settings = (meta.settings) || {};

    const preCentre = query.get('centre') || '';
    const preProgram = query.get('program') || '';
    const preselected = programs.find((p) => p.id === preProgram);
    let type = preselected ? preselected.category : 'basic';

    const page = h('div', { class: 'page' });

    function centreOptions(state) {
      const list = state ? centres.filter((c) => c.state === state) : centres;
      return [{ value: '', label: list.length ? 'Select a centre…' : 'No centre listed for this state yet' }]
        .concat(list.map((c) => ({ value: c.id, label: `${c.name} — ${c.city || c.state} (${c.code})` })));
    }

    function build() {
      const typeField = CTP.select('type', [
        { value: 'basic', label: 'Centre-based program (in person)' },
        { value: 'online', label: 'Online program (join from anywhere)' }
      ], type, {
        onChange: (e) => { type = e.target.value; render(); }
      });

      const relevantPrograms = programs.filter((p) => p.category === type);
      const stateOfCentre = (centres.find((c) => c.id === preCentre) || {}).state || '';

      const stateSelect = CTP.select('state',
        [{ value: '', label: 'All states' }].concat(meta.states.map((s) => ({ value: s.name, label: s.name }))),
        stateOfCentre,
        { onChange: (e) => { centreSelect.replaceChildren(...centreOptions(e.target.value).map(optionNode)); } });

      function optionNode(o) {
        return h('option', { value: o.value }, o.label);
      }

      const centreSelect = CTP.select('centreId', centreOptions(stateOfCentre), preCentre);

      const form = h('form', {
        class: 'card',
        onSubmit: async (e) => {
          e.preventDefault();
          const btn = form.querySelector('button[type="submit"]');
          btn.disabled = true;
          try {
            const values = CTP.formValues(form);
            const result = await CTP.post('enrollments', values);
            CTP.clear(page);
            page.append(h('div', { class: 'page-head' }, h('h1', null, 'Enrollment confirmed')), confirmationCard(result));
            CTP.toast('Enrollment submitted.', 'ok');
          } catch (err) {
            CTP.notifyError(err);
          } finally {
            btn.disabled = false;
          }
        }
      },
        h('fieldset', null,
          h('legend', null, 'What do you want to join?'),
          h('div', { class: 'form-grid' },
            CTP.field('Program type', typeField),
            CTP.field('Program', CTP.select('programId',
              [{ value: '', label: relevantPrograms.length ? 'Select a program…' : 'No program available' }]
                .concat(relevantPrograms.map((p) => ({ value: p.id, label: p.name }))),
              preProgram || (relevantPrograms.length === 1 ? relevantPrograms[0].id : ''))),
            type === 'basic' ? CTP.field('State / UT', stateSelect) : null,
            type === 'basic' ? CTP.field('Nearest CTP centre', centreSelect, 'You will receive this centre\'s address and contact details.') : null,
            type === 'online' ? CTP.field('Preferred mode', CTP.select('preferredMode', [
              { value: 'online', label: 'Online' }, { value: 'hybrid', label: 'Hybrid' }
            ], 'online')) : null)),

        h('fieldset', null,
          h('legend', null, 'Your details'),
          h('div', { class: 'form-grid' },
            CTP.field('Full name *', CTP.input('name', { required: true, placeholder: 'e.g. Asha Verma' })),
            CTP.field('Email', CTP.input('email', { type: 'email', placeholder: 'you@example.com' })),
            CTP.field('Phone', CTP.input('phone', { placeholder: '+91 ...' })),
            CTP.field('Age', CTP.input('age', { type: 'number', min: '0', max: '120' })),
            CTP.field('Gender', CTP.select('gender', ['', 'Female', 'Male', 'Other', 'Prefer not to say'], '')),
            CTP.field('City', CTP.input('city')),
            type === 'online' ? CTP.field('State / UT', CTP.select('state',
              [{ value: '', label: 'Select…' }].concat(meta.states.map((s) => ({ value: s.name, label: s.name }))), '')) : null,
            CTP.field('Preferred timing', CTP.select('preferredTiming',
              ['', 'Morning', 'Afternoon', 'Evening', 'Weekend'], '')),
            h('div', { class: 'field span-2' },
              h('label', null, 'Anything we should know?'),
              h('textarea', { name: 'message', rows: '3', placeholder: 'Current skill level, accessibility needs, etc.' })))),

        h('p', { class: 'tiny muted' },
          'Your details are stored only in this CTP coordination system and shared with the centre coordinator who will contact you.'),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'submit' }, 'Submit enrollment'),
          h('a', { class: 'btn btn-ghost', href: '#/programs' }, 'Browse programs')));

      return form;
    }

    function render() {
      CTP.clear(page);
      [
        h('div', { class: 'page-head' },
          h('div', null,
            h('h1', null, 'Enroll in a CTP program'),
            h('p', { class: 'muted' },
              'Register once — we will connect you to the right centre or online batch.')),
          h('a', { class: 'btn', href: '#/centres' }, '📍 Browse centres')),
        settings.basicProgramFormUrl
          ? h('div', { class: 'alert info' },
            'Prefer the official Google/Microsoft form? ',
            h('a', { href: settings.basicProgramFormUrl, target: '_blank', rel: 'noopener' }, 'Open the external enrollment form ↗'))
          : null,
        build(),
        h('div', { class: 'section' },
          h('h2', null, 'Centres currently accepting enrollment'),
          centres.length === 0
            ? h('p', { class: 'muted small' }, 'No active centres yet.')
            : h('div', { class: 'table-wrap' },
              h('table', null,
                h('thead', null, h('tr', null,
                  h('th', null, 'Centre'), h('th', null, 'City'), h('th', null, 'State'),
                  h('th', null, 'Zone'), h('th', null, 'Mode'), h('th', null, ''))),
                h('tbody', null, ...centres.slice(0, 50).map((c) => h('tr', null,
                  h('td', null, c.name, h('div', { class: 'tiny muted mono' }, c.code)),
                  h('td', null, c.city || '—'),
                  h('td', null, c.state || '—'),
                  h('td', null, c.zone || '—'),
                  h('td', null, CTP.badge(c.mode === 'onsite' ? 'In-centre' : c.mode)),
                  h('td', { class: 'actions' },
                    h('a', { class: 'btn btn-sm', href: `#/enroll?centre=${c.id}` }, 'Choose'))))))))
      ].filter(Boolean).forEach((node) => page.append(node));
    }

    render();
    return page;
  };
})();
