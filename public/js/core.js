/* Shared helpers: tiny hyperscript renderer, API client, router, toasts and modals. */
(function () {
  'use strict';

  const CTP = (window.CTP = window.CTP || {});
  CTP.pages = CTP.pages || {};

  CTP.state = {
    user: null,
    centre: null,
    meta: null,
    programs: [],
    notices: [],
    stats: null,
    ready: false
  };

  /* ---------------- DOM helpers ---------------- */

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'text', 'line', 'polygon', 'polyline', 'tspan', 'title']);

  function append(node, child) {
    if (child === null || child === undefined || child === false || child === true) return;
    if (Array.isArray(child)) { child.forEach((c) => append(node, c)); return; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function h(tag, props, ...children) {
    const isSvg = SVG_TAGS.has(tag);
    const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach((key) => {
      const value = p[key];
      if (value === null || value === undefined || value === false) return;
      if (key === 'class' || key === 'className') { el.setAttribute('class', value); return; }
      if (key === 'style' && typeof value === 'object') { Object.assign(el.style, value); return; }
      if (key === 'dataset') { Object.assign(el.dataset, value); return; }
      if (key === 'html') { el.innerHTML = value; return; }
      if (key.startsWith('on') && typeof value === 'function') { el.addEventListener(key.slice(2).toLowerCase(), value); return; }
      if (!isSvg && (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected')) { el[key] = value; return; }
      el.setAttribute(key, value === true ? '' : value);
    });
    children.forEach((c) => append(el, c));
    return el;
  }

  function frag(...children) {
    const f = document.createDocumentFragment();
    children.forEach((c) => append(f, c));
    return f;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  function mount(node) {
    const view = document.getElementById('view');
    clear(view);
    append(view, node);
    view.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'auto' : 'auto' });
    return view;
  }

  CTP.h = h;
  CTP.frag = frag;
  CTP.clear = clear;
  CTP.mount = mount;
  CTP.qs = (sel, root) => (root || document).querySelector(sel);
  CTP.qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- API ---------------- */

  async function api(path, options) {
    const opts = Object.assign({ method: 'GET', headers: {} }, options || {});
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    opts.credentials = 'same-origin';
    const res = await fetch(path.startsWith('/') ? path : `/api/${path}`, opts);
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res;
    }
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  CTP.api = api;
  CTP.get = (p) => api(p);
  CTP.post = (p, body) => api(p, { method: 'POST', body });
  CTP.put = (p, body) => api(p, { method: 'PUT', body });
  CTP.del = (p) => api(p, { method: 'DELETE' });

  /* ---------------- Formatting ---------------- */

  const fmt = {
    num(value) {
      const n = Number(value || 0);
      return n.toLocaleString('en-IN');
    },
    date(value) {
      if (!value) return '—';
      const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    },
    dateTime(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    relative(value) {
      if (!value) return '';
      const diff = Date.now() - new Date(value).getTime();
      const mins = Math.round(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins} min ago`;
      const hrs = Math.round(mins / 60);
      if (hrs < 24) return `${hrs} h ago`;
      const days = Math.round(hrs / 24);
      if (days < 31) return `${days} d ago`;
      return fmt.date(value);
    },
    title(value) {
      const v = String(value || '');
      return v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
    },
    bytes(value) {
      const n = Number(value || 0);
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },
    address(address) {
      if (!address) return '';
      return [address.line1, address.line2, address.landmark, address.city, address.district, address.state, address.pincode]
        .filter(Boolean).join(', ');
    }
  };
  CTP.fmt = fmt;

  /* ---------------- UI primitives ---------------- */

  function toast(message, kind, ms) {
    const host = document.getElementById('toasts');
    const node = h('div', { class: `toast ${kind || ''}` }, message);
    host.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .25s';
      setTimeout(() => node.remove(), 260);
    }, ms || 4200);
  }
  CTP.toast = toast;
  CTP.notifyError = (err) => toast(err && err.message ? err.message : 'Something went wrong.', 'error', 6000);

  function loader(label) {
    return h('div', { class: 'loader' }, h('span', { class: 'spinner' }), label || 'Loading…');
  }
  CTP.loader = loader;

  function empty(icon, title, detail, action) {
    return h('div', { class: 'empty' },
      h('span', { class: 'big' }, icon || '📭'),
      h('h3', null, title),
      detail ? h('p', { class: 'muted' }, detail) : null,
      action || null);
  }
  CTP.empty = empty;

  function badge(value, extraClass) {
    const v = String(value || '').toLowerCase().replace(/\s+/g, '-');
    return h('span', { class: `badge ${v} ${extraClass || ''}` }, fmt.title(value));
  }
  CTP.badge = badge;

  function kpi(label, value, sub, tone) {
    return h('div', { class: `kpi ${tone || ''}` },
      h('div', { class: 'kpi-label' }, label),
      h('div', { class: 'kpi-value' }, typeof value === 'number' ? fmt.num(value) : value),
      sub ? h('div', { class: 'kpi-sub' }, sub) : null);
  }
  CTP.kpi = kpi;

  /** A single announcement, rendered the same way on the home page and in the news modal. */
  function noticeCard(n, opts) {
    const o = opts || {};
    return h('article', { class: `notice ${n.level || 'info'} ${o.major ? 'major' : ''}` },
      h('h4', null, n.pinned ? '📌 ' : '', n.title),
      n.body ? h('p', null, n.body) : null,
      h('p', { class: 'tiny muted notice-meta' },
        `${fmt.relative(n.createdAt)} · ${n.createdBy || 'Administrator'}`,
        n.linkUrl ? ' · ' : '',
        n.linkUrl
          ? h('a', { href: n.linkUrl, target: n.linkUrl.startsWith('#') ? '_self' : '_blank', rel: 'noopener' }, 'Open link')
          : null));
  }
  CTP.noticeCard = noticeCard;

  /* ---------------- photo gallery ---------------- */

  /** Full-size viewer with keyboard paging; used by the public centre page. */
  function photoLightbox(photos, startIndex) {
    const list = photos || [];
    if (!list.length) return null;
    let index = Math.min(Math.max(0, startIndex || 0), list.length - 1);

    const img = h('img', { class: 'lightbox-img', alt: '' });
    const caption = h('p', { class: 'lightbox-caption' });
    const counter = h('span', { class: 'small muted', style: { margin: '0 .5rem' } });

    function show(next) {
      index = (next + list.length) % list.length;
      const p = list[index];
      img.src = p.url;
      img.alt = p.caption || 'Centre photograph';
      caption.textContent = p.caption || '';
      caption.style.display = p.caption ? '' : 'none';
      counter.textContent = `${index + 1} of ${list.length}`;
    }

    const actions = [];
    if (list.length > 1) {
      actions.push(h('button', { class: 'btn', onClick: () => show(index - 1) }, '← Previous'));
      actions.push(counter);
      actions.push(h('button', { class: 'btn', onClick: () => show(index + 1) }, 'Next →'));
    }
    actions.push(h('button', { class: 'btn btn-ghost', onClick: closeModal }, 'Close'));

    const m = modal({ title: 'Centre photos', body: h('div', { class: 'lightbox' }, img, caption), actions });
    show(index);

    const onKey = (e) => {
      if (!document.getElementById('modal-root').contains(img)) {
        document.removeEventListener('keydown', onKey);
        return;
      }
      if (e.key === 'ArrowRight') show(index + 1);
      if (e.key === 'ArrowLeft') show(index - 1);
    };
    document.addEventListener('keydown', onKey);
    return m;
  }

  function photoGallery(photos, opts) {
    const list = photos || [];
    const o = opts || {};
    if (!list.length) return null;
    return h('div', { class: 'gallery' }, ...list.map((p, i) => h('button', {
      class: 'gallery-item',
      type: 'button',
      title: p.caption || 'View full size',
      onClick: () => photoLightbox(list, i)
    },
      h('img', { src: p.url, alt: p.caption || o.alt || 'Centre photograph', loading: 'lazy' }),
      p.caption ? h('span', { class: 'gallery-cap' }, p.caption) : null)));
  }

  CTP.photoGallery = photoGallery;
  CTP.photoLightbox = photoLightbox;

  function field(label, control, hint) {
    return h('label', { class: 'field' },
      h('span', { style: { fontSize: '.8rem', fontWeight: '700', color: 'var(--text-muted)' } }, label),
      control,
      hint ? h('span', { class: 'hint' }, hint) : null);
  }
  CTP.field = field;

  function input(name, opts) {
    const o = opts || {};
    return h('input', Object.assign({ name, type: o.type || 'text' }, o));
  }
  CTP.input = input;

  function select(name, options, value, opts) {
    const el = h('select', Object.assign({ name }, opts || {}));
    options.forEach((opt) => {
      const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      const node = h('option', { value: o.value }, o.label);
      if (String(o.value) === String(value === undefined || value === null ? '' : value)) node.selected = true;
      el.appendChild(node);
    });
    return el;
  }
  CTP.select = select;

  /** Collects a form's values, coercing checkboxes to booleans and numbers to Number. */
  function formValues(form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') { out[el.name] = el.checked; return; }
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; return; }
      if (el.type === 'number') { out[el.name] = el.value === '' ? '' : Number(el.value); return; }
      out[el.name] = el.value;
    });
    return out;
  }
  CTP.formValues = formValues;

  /** Expands dotted field names (contacts.coordinator.name) into nested objects. */
  function expand(flat) {
    const out = {};
    Object.keys(flat).forEach((key) => {
      const parts = key.split('.');
      let node = out;
      parts.forEach((part, index) => {
        if (index === parts.length - 1) node[part] = flat[key];
        else node = (node[part] = node[part] || {});
      });
    });
    return out;
  }
  CTP.expand = expand;

  let openModal = null;
  function modal(opts) {
    closeModal();
    const o = opts || {};
    const body = o.body || h('div');
    const footer = h('div', { class: 'modal-foot' },
      ...(o.actions || [h('button', { class: 'btn', onClick: closeModal }, 'Close')]));
    const box = h('div', { class: `modal ${o.narrow ? 'narrow' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' },
        h('h3', null, o.title || ''),
        h('button', { class: 'icon-btn', onClick: closeModal, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'modal-body' }, body),
      o.hideFooter ? null : footer);
    const backdrop = h('div', {
      class: 'modal-backdrop',
      onClick: (e) => { if (e.target === backdrop) closeModal(); }
    }, box);
    document.getElementById('modal-root').appendChild(backdrop);
    openModal = backdrop;
    const focusable = box.querySelector('input, select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 30);
    return { close: closeModal, box, body };
  }

  function closeModal() {
    if (openModal) { openModal.remove(); openModal = null; }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  CTP.modal = modal;
  CTP.closeModal = closeModal;

  function confirmDialog(message, confirmLabel) {
    return new Promise((resolve) => {
      const m = modal({
        title: 'Please confirm',
        narrow: true,
        body: h('p', null, message),
        actions: [
          h('button', { class: 'btn', onClick: () => { closeModal(); resolve(false); } }, 'Cancel'),
          h('button', {
            class: 'btn btn-danger',
            onClick: () => { closeModal(); resolve(true); }
          }, confirmLabel || 'Confirm')
        ]
      });
      m.box.addEventListener('ctp:dismiss', () => resolve(false));
    });
  }
  CTP.confirm = confirmDialog;

  /* ---------------- Router ---------------- */

  const routes = [];
  CTP.route = (pattern, handler, opts) => {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ pattern, parts, handler, opts: opts || {} });
  };

  function matchRoute(path) {
    const segs = path.split('/').filter(Boolean);
    for (const route of routes) {
      if (route.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < segs.length; i += 1) {
        const p = route.parts[i];
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  CTP.navigate = (path, replace) => {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (replace) window.location.replace(target);
    else window.location.hash = target;
  };

  CTP.currentPath = () => {
    const raw = window.location.hash.replace(/^#/, '') || '/';
    return raw.split('?')[0];
  };

  CTP.queryParams = () => {
    const raw = window.location.hash.replace(/^#/, '');
    const idx = raw.indexOf('?');
    return new URLSearchParams(idx >= 0 ? raw.slice(idx + 1) : '');
  };

  async function renderRoute() {
    closeModal();
    const path = CTP.currentPath();
    const hit = matchRoute(path);
    highlightNav(path);

    if (!hit) {
      mount(h('div', { class: 'page' }, empty('🧭', 'Page not found',
        `No page matches ${path}.`,
        h('a', { class: 'btn btn-primary', href: '#/' }, 'Go to home'))));
      return;
    }

    const { route, params } = hit;
    if (route.opts.auth === 'user' && !CTP.state.user) {
      CTP.toast('Please sign in to continue.', 'warn');
      CTP.navigate(`/login?next=${encodeURIComponent(path)}`, true);
      return;
    }
    if (route.opts.auth === 'admin' && (!CTP.state.user || CTP.state.user.role !== 'admin')) {
      CTP.toast('Administrator access required.', 'error');
      CTP.navigate('/login', true);
      return;
    }

    mount(loader());
    try {
      const node = await route.handler(params, CTP.queryParams());
      if (node) mount(node);
    } catch (err) {
      console.error(err);
      mount(h('div', { class: 'page' },
        h('div', { class: 'alert danger' }, err.message || 'Failed to load this page.'),
        h('button', { class: 'btn', onClick: () => renderRoute() }, 'Retry')));
    }
  }

  CTP.refresh = renderRoute;

  function highlightNav(path) {
    CTP.qsa('.mainnav a').forEach((a) => {
      const target = a.getAttribute('data-route');
      const active = target === '/' ? path === '/' : path.startsWith(target);
      a.classList.toggle('active', active);
    });
    const nav = document.getElementById('mainnav');
    if (nav) nav.classList.remove('open');
  }

  window.addEventListener('hashchange', renderRoute);

  /* ---------------- Theme ---------------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctp-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
  CTP.applyTheme = applyTheme;
  CTP.initTheme = () => {
    const saved = localStorage.getItem('ctp-theme');
    const prefers = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefers ? 'dark' : 'light'));
  };
})();
