/* Application bootstrap: session, branding, navigation, Important News band and routes. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;

  CTP.loadMeta = async function loadMeta() {
    CTP.state.meta = await CTP.get('meta');
    return CTP.state.meta;
  };

  CTP.loadSession = async function loadSession() {
    try {
      const res = await CTP.get('auth/me');
      CTP.state.user = res.user;
      CTP.state.centre = res.centre;
    } catch (err) {
      CTP.state.user = null;
      CTP.state.centre = null;
    }
    renderAuth();
    return CTP.state.user;
  };

  CTP.loadNotices = async function loadNotices() {
    try {
      const res = await CTP.get('notices');
      CTP.state.notices = res.items || [];
    } catch (err) {
      CTP.state.notices = [];
    }
    renderNewsBar();
    return CTP.state.notices;
  };

  CTP.applyBranding = function applyBranding() {
    const s = (CTP.state.meta && CTP.state.meta.settings) || {};
    const title = document.getElementById('brand-title');
    const sub = document.getElementById('brand-sub');
    if (title) title.textContent = s.orgName || 'Computer Training Program';
    if (sub) sub.textContent = s.subtitle || 'Zonal Coordination';
    document.title = `${s.shortName || 'CTP'} — ${s.subtitle || 'Zonal Coordination'}`;
    if (s.accentColor) {
      document.documentElement.style.setProperty('--accent', s.accentColor);
      document.documentElement.style.setProperty('--accent-dark', s.accentColor);
    }
    const org = document.getElementById('footer-org');
    const tagline = document.getElementById('footer-tagline');
    const contact = document.getElementById('footer-contact');
    if (org) org.textContent = s.orgName || 'Computer Training Program';
    if (tagline) tagline.textContent = s.tagline || '';
    if (contact) {
      contact.textContent = [s.supportEmail, s.supportPhone].filter(Boolean).join(' · ');
    }
  };

  function renderAuth() {
    const slot = document.getElementById('auth-slot');
    CTP.clear(slot);
    const user = CTP.state.user;

    CTP.qsa('.mainnav a').forEach((a) => {
      const need = a.getAttribute('data-auth');
      if (!need) return;
      if (need === 'admin') a.hidden = !(user && user.role === 'admin');
      else a.hidden = !user;
    });

    if (!user) {
      slot.append(
        h('a', { class: 'btn btn-sm', href: '#/login' }, 'Sign in'),
        h('a', { class: 'btn btn-sm btn-primary', href: '#/register' }, 'Register centre'));
      return;
    }

    slot.append(
      h('a', { class: 'who', href: '#/account', title: 'My account' },
        h('strong', null, user.name),
        h('span', { class: 'tiny muted' },
          user.role === 'admin' ? 'Administrator' : (CTP.state.centre ? CTP.state.centre.name : 'Coordinator'))),
      h('button', {
        class: 'btn btn-sm',
        onClick: async () => {
          try {
            await CTP.post('auth/logout', {});
          } catch (err) { /* ignore */ }
          CTP.state.user = null;
          CTP.state.centre = null;
          renderAuth();
          CTP.toast('Signed out.', 'ok');
          CTP.navigate('/');
          CTP.refresh();
        }
      }, 'Sign out'));
  }

  const NEWS_ICON = { success: '🎓', critical: '⚠️', warning: '⚠️', info: '📣' };

  /** Notices important enough to sit in the top band. */
  CTP.importantNotices = function importantNotices() {
    return (CTP.state.notices || []).filter((n) => n.pinned || n.level === 'critical' || n.level === 'success');
  };

  CTP.showAllNews = function showAllNews() {
    const all = CTP.state.notices || [];
    CTP.modal({
      title: `📰 All announcements (${all.length})`,
      body: all.length
        ? h('div', { class: 'grid' }, ...all.map((n) => CTP.noticeCard(n)))
        : h('p', { class: 'muted' }, 'Nothing has been published yet.')
    });
  };

  /**
   * The news band is deliberately static - no marquee. Long notices wrap onto as many lines
   * as they need so nothing scrolls out of view, and multiple notices are paged manually.
   */
  let newsIndex = 0;
  function renderNewsBar() {
    const bar = document.getElementById('newsbar');
    if (!bar) return;
    const notices = CTP.importantNotices();
    CTP.clear(bar);
    if (!notices.length) {
      bar.hidden = true;
      return;
    }
    if (newsIndex >= notices.length) newsIndex = 0;
    const n = notices[newsIndex];
    bar.hidden = false;
    bar.setAttribute('data-level', n.level || 'info');

    const step = (delta) => {
      newsIndex = (newsIndex + delta + notices.length) % notices.length;
      renderNewsBar();
    };

    bar.append(h('div', { class: 'newsbar-inner' },
      h('span', { class: 'newsbar-tag' }, `${NEWS_ICON[n.level] || '📣'} Important news`),
      h('div', { class: 'newsbar-text' },
        h('strong', null, n.title),
        n.body ? h('span', { class: 'newsbar-body' }, n.body) : null,
        n.linkUrl
          ? h('a', {
            class: 'newsbar-link',
            href: n.linkUrl,
            target: n.linkUrl.startsWith('#') ? '_self' : '_blank',
            rel: 'noopener'
          }, 'Open link →')
          : null,
        h('span', { class: 'newsbar-meta' }, `${CTP.fmt.relative(n.createdAt)} · ${n.createdBy || 'Administrator'}`)),
      h('div', { class: 'newsbar-nav' },
        notices.length > 1
          ? h('button', { class: 'newsbar-btn', type: 'button', onClick: () => step(-1), 'aria-label': 'Previous news item' }, '‹')
          : null,
        notices.length > 1 ? h('span', { class: 'newsbar-count' }, `${newsIndex + 1} / ${notices.length}`) : null,
        notices.length > 1
          ? h('button', { class: 'newsbar-btn', type: 'button', onClick: () => step(1), 'aria-label': 'Next news item' }, '›')
          : null,
        h('button', { class: 'newsbar-btn wide', type: 'button', onClick: CTP.showAllNews }, 'All news'))));
  }

  CTP.renderNewsBar = renderNewsBar;

  /* ---------------- Routes ---------------- */

  CTP.route('/', () => CTP.pages.home());
  CTP.route('/centres', (p, q) => CTP.pages.directory(p, q));
  CTP.route('/centres/:id', (p) => CTP.pages.centreDetail(p));
  CTP.route('/programs', () => CTP.pages.programs());
  CTP.route('/enroll', (p, q) => CTP.pages.enroll(p, q));
  CTP.route('/login', (p, q) => CTP.pages.login(p, q));
  CTP.route('/register', () => CTP.pages.register());
  CTP.route('/account', () => CTP.pages.profile(), { auth: 'user' });
  CTP.route('/dashboard', () => CTP.pages.dashboard(), { auth: 'user' });
  CTP.route('/centre', () => CTP.pages.centreEdit(), { auth: 'user' });
  CTP.route('/sessions', (p, q) => CTP.pages.sessions(p, q), { auth: 'user' });
  CTP.route('/sessions/:id', (p) => CTP.pages.sessionDetail(p), { auth: 'user' });
  CTP.route('/admin', (p, q) => CTP.pages.admin(p, q), { auth: 'admin' });

  /* ---------------- Boot ---------------- */

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    CTP.applyTheme(next);
  });

  document.getElementById('nav-toggle').addEventListener('click', (e) => {
    const nav = document.getElementById('mainnav');
    const open = nav.classList.toggle('open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  (async function boot() {
    CTP.initTheme();
    try {
      await CTP.loadMeta();
      CTP.applyBranding();
    } catch (err) {
      console.error('Failed to load portal settings', err);
    }
    await CTP.loadSession();
    await CTP.loadNotices();
    CTP.state.ready = true;
    if (!window.location.hash) CTP.navigate('/', true);
    CTP.refresh();
  })();
})();
