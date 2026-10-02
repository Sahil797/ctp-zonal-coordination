/* Online programs: public catalogue with admin-configurable enrollment buttons. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;
  const fmt = CTP.fmt;

  function enrollAction(p) {
    if (p.enrollUrl) {
      return h('a', {
        class: 'enroll-btn', href: p.enrollUrl, target: '_blank', rel: 'noopener noreferrer',
        style: { background: p.buttonColor, color: p.textColor }
      }, p.buttonLabel || 'Enroll now', ' ↗');
    }
    return h('a', {
      class: 'enroll-btn', href: `#/enroll?program=${encodeURIComponent(p.id)}`,
      style: { background: p.buttonColor, color: p.textColor }
    }, p.buttonLabel || 'Enroll now');
  }

  CTP.programCard = function programCard(p) {
    return h('div', { class: 'card program-card' },
      h('div', { class: 'pc-icon' }, p.icon || '💡'),
      h('h3', null, p.name),
      h('div', { class: 'pc-meta' },
        CTP.badge(p.category === 'online' ? 'Online' : 'Centre based'),
        p.level ? h('span', { class: 'chip' }, p.level) : null,
        p.durationWeeks ? h('span', { class: 'chip' }, `${p.durationWeeks} weeks`) : null,
        p.seats ? h('span', { class: 'chip' }, `${p.seats} seats`) : null),
      h('p', { class: 'small muted pc-body' }, p.description || ''),
      p.startsOn ? h('p', { class: 'tiny muted', style: { margin: 0 } }, `Next batch starts ${fmt.date(p.startsOn)}`) : null,
      enrollAction(p));
  };

  CTP.pages = CTP.pages || {};
  CTP.pages.programs = async function programs() {
    const res = await CTP.get('programs');
    const items = res.items || [];
    const online = items.filter((p) => p.category === 'online');
    const basic = items.filter((p) => p.category === 'basic');
    const settings = (CTP.state.meta && CTP.state.meta.settings) || {};
    const isAdmin = CTP.state.user && CTP.state.user.role === 'admin';

    return h('div', { class: 'page' },
      h('div', { class: 'page-head' },
        h('div', null,
          h('h1', null, 'Programs & enrollment'),
          h('p', { class: 'muted' }, 'Join an online program from anywhere in India, or enroll at your nearest CTP centre.')),
        isAdmin ? h('a', { class: 'btn btn-primary', href: '#/admin?tab=programs' }, '⚙️ Manage programs') : null),

      online.length
        ? h('section', { class: 'section' },
          h('div', { class: 'section-head' },
            h('h2', null, '🌐 Online offerings'),
            h('span', { class: 'chip' }, `${online.length} open`)),
          h('div', { class: 'grid grid-3' }, ...online.map(CTP.programCard)))
        : CTP.empty('🌐', 'No online programs published yet',
          'An administrator can add online offerings from the admin console.'),

      h('section', { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', null, '🏫 Centre-based program')),
        h('div', { class: 'grid grid-2' },
          ...basic.map(CTP.programCard),
          h('div', { class: 'card' },
            h('h3', null, 'How centre enrollment works'),
            h('ol', { class: 'small muted', style: { paddingLeft: '1.1rem' } },
              h('li', null, 'Pick your state and the nearest CTP centre.'),
              h('li', null, 'Submit the short enrollment form.'),
              h('li', null, 'You instantly receive the centre name, address, coordinator and primary contact number.'),
              h('li', null, 'The centre coordinator follows up with your batch timing.')),
            h('a', { class: 'btn btn-primary', href: '#/enroll' },
              `Enroll for ${settings.basicProgramName || 'the basic program'}`),
            settings.basicProgramFormUrl
              ? h('p', { class: 'tiny muted', style: { marginTop: '.6rem', marginBottom: 0 } },
                'Prefer the external form? ',
                h('a', { href: settings.basicProgramFormUrl, target: '_blank', rel: 'noopener' }, 'Open it here ↗'))
              : null))));
  };
})();
