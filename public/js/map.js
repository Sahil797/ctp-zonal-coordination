/* India map: Leaflet tile view with an offline SVG schematic fallback. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;

  /** Indicative outline of India used only for the offline schematic view. */
  const OUTLINE = [
    [68.2, 23.7], [68.9, 24.3], [70.0, 24.3], [70.6, 25.7], [71.0, 27.8], [72.3, 28.8],
    [73.9, 30.0], [74.5, 31.8], [75.2, 32.5], [74.0, 33.8], [74.2, 34.6], [76.0, 35.5],
    [78.0, 35.3], [78.9, 34.3], [79.2, 32.5], [80.0, 30.7], [81.0, 30.2], [82.5, 30.0],
    [84.0, 29.3], [85.8, 28.2], [88.0, 27.9], [88.2, 27.0], [89.0, 26.9], [89.7, 26.7],
    [90.4, 26.9], [92.0, 26.9], [93.5, 27.0], [95.3, 27.1], [96.5, 27.6], [97.4, 28.3],
    [97.1, 27.1], [96.2, 25.5], [95.1, 24.0], [94.6, 23.0], [93.3, 22.2], [92.6, 21.3],
    [92.2, 23.7], [91.0, 23.5], [89.1, 22.0], [88.1, 21.6], [87.0, 21.5], [86.5, 20.1],
    [85.1, 19.5], [83.5, 18.3], [82.3, 17.0], [80.9, 15.8], [80.3, 13.5], [79.9, 11.9],
    [79.3, 10.3], [78.2, 9.1], [77.5, 8.1], [77.1, 8.3], [76.5, 9.5], [75.8, 11.3],
    [74.8, 13.0], [73.8, 15.4], [72.9, 17.9], [72.7, 19.2], [72.6, 21.0], [72.0, 21.5],
    [70.0, 20.8], [69.0, 22.3]
  ];

  const BOUNDS = { minLng: 66.5, maxLng: 98.5, minLat: 5.5, maxLat: 37.5 };
  const W = 760;
  const HGT = 820;

  const colourFor = (p) => {
    if (p.offersOnline && p.mode === 'onsite') return '#0891b2';
    if (p.mode === 'online') return '#7c3aed';
    if (p.mode === 'hybrid') return '#0891b2';
    return '#2563eb';
  };

  function project(lat, lng) {
    return {
      x: ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * W,
      y: ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * HGT
    };
  }

  function popupHtml(p) {
    const esc = (s) => String(s === undefined || s === null ? '' : s)
      .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `
      <strong style="font-size:.95rem">${esc(p.name)}</strong><br>
      <span style="color:#64748b;font-size:.8rem">${esc(p.code)} · ${esc(p.city)}, ${esc(p.state)}</span>
      <div style="margin:.4rem 0;font-size:.82rem">
        Zone: <b>${esc(p.zone || 'Not assigned')}</b> · Mode: <b>${esc(p.mode)}</b><br>
        Sessions: <b>${p.sessions}</b> (${p.ongoing} ongoing) · Learners: <b>${p.learners}</b><br>
        Certificates distributed: <b>${p.certificates}</b>
        ${p.coordinator ? `<br>Coordinator: <b>${esc(p.coordinator)}</b>` : ''}
        ${p.approx ? '<br><i style="color:#b45309">Approximate pin (state centroid)</i>' : ''}
      </div>
      <a href="#/centres/${esc(p.id)}" style="font-weight:700">Open centre →</a>`;
  }

  function schematic(points, onSelect) {
    const outlinePoints = OUTLINE.map(([lng, lat]) => {
      const q = project(lat, lng);
      return `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    }).join(' ');

    const dots = points.map((p) => {
      const q = project(p.lat, p.lng);
      const size = Math.min(13, 5 + Math.sqrt(p.sessions || 0) * 2.2);
      return h('g', { class: 'schematic-pin', onClick: () => onSelect(p) },
        h('title', null, `${p.name} — ${p.city || ''} ${p.state || ''} · ${p.sessions} session(s)`),
        h('circle', {
          cx: q.x.toFixed(1), cy: q.y.toFixed(1), r: size.toFixed(1),
          fill: colourFor(p), 'fill-opacity': p.approx ? '0.55' : '0.85',
          stroke: '#ffffff', 'stroke-width': '1.5'
        }));
    });

    return h('svg', {
      class: 'map-schematic', viewBox: `0 0 ${W} ${HGT}`,
      preserveAspectRatio: 'xMidYMid meet', role: 'img',
      'aria-label': 'Schematic map of CTP centres across India'
    },
      h('polygon', {
        points: outlinePoints, fill: 'var(--accent-soft)',
        stroke: 'var(--border-strong)', 'stroke-width': '2', 'stroke-linejoin': 'round'
      }),
      ...dots,
      h('text', {
        x: 12, y: HGT - 12, 'font-size': '13', fill: 'var(--text-muted)'
      }, 'Schematic view — indicative outline, not to scale'));
  }

  /**
   * Builds the map panel.
   * points: array from /api/stats/overview
   */
  CTP.indiaMap = function indiaMap(points, options) {
    const opts = options || {};
    const list = (points || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const shell = h('div', { class: 'map-shell' });
    const canvas = h('div', { id: 'india-map' });
    const toolbar = h('div', { class: 'map-toolbar' });
    const legend = h('div', { class: 'map-legend' },
      h('span', null, h('i', { class: 'dot onsite' }), ' In-centre'),
      h('span', null, h('i', { class: 'dot hybrid' }), ' Hybrid / online enabled'),
      h('span', null, h('i', { class: 'dot online' }), ' Online only'),
      h('span', { class: 'muted' }, h('i', { class: 'dot approx' }), ' Faded = approximate pin'));

    const onSelect = (p) => CTP.navigate(`/centres/${p.id}`);

    let mode = localStorage.getItem('ctp-map-mode') || 'tiles';
    let leafletMap = null;

    const btnTiles = h('button', { class: 'btn btn-sm', onClick: () => setMode('tiles') }, '🗺️ Street map');
    const btnSchem = h('button', { class: 'btn btn-sm', onClick: () => setMode('schematic') }, '🧭 Schematic');
    toolbar.append(btnTiles, btnSchem);

    function renderBody() {
      CTP.clear(shell);
      shell.append(toolbar, legend);
      if (!list.length) {
        shell.append(h('div', { id: 'india-map' }),
          h('div', { class: 'map-empty' },
            h('div', null,
              h('div', { style: { fontSize: '2rem' } }, '📍'),
              h('h3', null, 'No centres plotted yet'),
              h('p', { class: 'muted' }, 'Add a centre with a state (or latitude/longitude) to see it on the map.'))));
        return;
      }
      if (mode === 'schematic') {
        shell.append(schematic(list, onSelect));
        return;
      }
      shell.append(canvas);
      setTimeout(initLeaflet, 0);
    }

    function initLeaflet() {
      if (!window.L) { mode = 'schematic'; renderBody(); return; }
      if (leafletMap) { leafletMap.remove(); leafletMap = null; }
      leafletMap = L.map(canvas, { scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25, zoomDelta: 0.5 });
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
      });
      let warned = false;
      tiles.on('tileerror', () => {
        if (warned) return;
        warned = true;
        CTP.toast('Map tiles could not be loaded (no internet?). Switch to the Schematic view for an offline map.', 'warn', 7000);
      });
      tiles.addTo(leafletMap);

      const group = L.featureGroup(list.map((p) => {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: Math.min(16, 6 + Math.sqrt(p.sessions || 0) * 2.4),
          color: '#ffffff',
          weight: 1.5,
          fillColor: colourFor(p),
          fillOpacity: p.approx ? 0.55 : 0.85,
          className: 'map-pin'
        });
        marker.bindPopup(popupHtml(p));
        return marker;
      })).addTo(leafletMap);

      function fit() {
        if (list.length === 1) leafletMap.setView([list[0].lat, list[0].lng], 9);
        else if (list.length) leafletMap.fitBounds(group.getBounds().pad(0.12), { maxZoom: 7 });
        else leafletMap.setView([22.6, 80.9], 4);
      }
      fit();
      setTimeout(() => { leafletMap.invalidateSize(); fit(); }, 120);
    }

    function setMode(next) {
      mode = next;
      localStorage.setItem('ctp-map-mode', next);
      btnTiles.classList.toggle('btn-primary', next === 'tiles');
      btnSchem.classList.toggle('btn-primary', next === 'schematic');
      renderBody();
    }

    btnTiles.classList.toggle('btn-primary', mode === 'tiles');
    btnSchem.classList.toggle('btn-primary', mode === 'schematic');
    renderBody();

    if (opts.height) {
      canvas.style.height = opts.height;
    }
    return shell;
  };
})();
