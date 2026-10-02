/* Zone reference helpers and the linked Zone + State picker used by every centre form. */
(function () {
  'use strict';
  const CTP = window.CTP;
  const h = CTP.h;

  function meta() {
    return CTP.state.meta || {};
  }

  CTP.zoneList = () => meta().zones || [];
  CTP.stateList = () => meta().states || [];
  CTP.unzonedLabel = () => meta().unzonedLabel || 'Zone not assigned';
  CTP.zoneByName = (name) => CTP.zoneList().find((z) => z.name === name) || null;

  /** "Zone 9 — Andhra Pradesh, Karnataka, …" or the unassigned label. */
  CTP.zoneLabel = function zoneLabel(name) {
    const z = CTP.zoneByName(name);
    return z ? z.label : CTP.unzonedLabel();
  };

  /** Short form for tables and chips: "Zone 9" or the unassigned label. */
  CTP.zoneShort = function zoneShort(name) {
    return name || CTP.unzonedLabel();
  };

  CTP.zoneDescription = function zoneDescription(name) {
    const z = CTP.zoneByName(name);
    return z ? z.description : '';
  };

  /** Zone names a state may belong to. Uttar Pradesh returns three. */
  function zonesForState(stateName) {
    if (!stateName) return [];
    const s = CTP.stateList().find((x) => x.name === stateName);
    return s && Array.isArray(s.zones) ? s.zones.slice() : [];
  }
  CTP.zonesForState = zonesForState;

  /** Options for a zone filter dropdown. */
  CTP.zoneFilterOptions = function zoneFilterOptions(allLabel) {
    return [{ value: '', label: allLabel || 'All zones' }]
      .concat(CTP.zoneList().map((z) => ({ value: z.name, label: z.label })))
      .concat([{ value: 'unzoned', label: `⚠ ${CTP.unzonedLabel()}` }]);
  };

  /**
   * Linked Zone + State controls.
   *
   * Picking a zone narrows the state list to the states that zone covers; picking a state
   * fills the zone in automatically when the mapping is unambiguous. Uttar Pradesh belongs to
   * zones 5, 6 and 11, so for UP the zone dropdown is what decides, and states outside the
   * published table stay unzoned until an administrator assigns one.
   */
  /** Read-only reference rendering of the published Zone → State table. */
  CTP.zoneTable = function zoneTable() {
    return h('div', { class: 'table-wrap', style: { marginTop: '.6rem' } },
      h('table', { class: 'zone-table' },
        h('thead', null, h('tr', null, h('th', null, 'Zone'), h('th', null, 'States / UTs covered'))),
        h('tbody', null, ...CTP.zoneList().map((z) => h('tr', null,
          h('td', null, h('b', null, z.name)),
          h('td', null, z.description))))));
  };

  CTP.zonePicker = function zonePicker(options) {
    const o = options || {};
    const zoneField = o.zoneField || 'zone';
    const stateField = o.stateField || 'address.state';
    let zone = o.zone || '';
    let state = o.state || '';

    const zoneSelect = h('select', { name: zoneField });
    const stateSelect = h('select', Object.assign({ name: stateField }, o.requireState ? { required: true } : {}));
    const hint = h('p', { class: 'zone-hint' });

    function buildZoneOptions() {
      CTP.clear(zoneSelect);
      zoneSelect.appendChild(h('option', { value: '' }, `⚠ ${CTP.unzonedLabel()}`));
      CTP.zoneList().forEach((z) => zoneSelect.appendChild(h('option', { value: z.name }, z.label)));
      zoneSelect.value = zone;
    }

    function buildStateOptions() {
      CTP.clear(stateSelect);
      stateSelect.appendChild(h('option', { value: '' }, 'Select state / UT…'));
      const z = CTP.zoneByName(zone);
      if (z) {
        (z.regions || []).forEach((r) => stateSelect.appendChild(h('option', { value: r.state }, r.label)));
        // Manual assignment: keep a state the zone does not normally cover so it is not silently cleared.
        if (state && !(z.regions || []).some((r) => r.state === state)) {
          stateSelect.appendChild(h('optgroup', { label: 'Manually assigned to this zone' },
            h('option', { value: state }, state)));
        }
      } else {
        CTP.zoneList().forEach((zz) => {
          const group = h('optgroup', { label: zz.label });
          (zz.regions || []).forEach((r) => group.appendChild(h('option', { value: r.state }, r.label)));
          stateSelect.appendChild(group);
        });
        const unlisted = CTP.stateList().filter((s) => !s.zones || s.zones.length === 0);
        if (unlisted.length) {
          const group = h('optgroup', { label: CTP.unzonedLabel() });
          unlisted.forEach((s) => group.appendChild(h('option', { value: s.name }, s.name)));
          stateSelect.appendChild(group);
        }
      }
      const stillValid = Array.from(stateSelect.querySelectorAll('option')).some((op) => op.value === state);
      stateSelect.value = stillValid ? state : '';
      state = stateSelect.value;
    }

    function drawHint() {
      CTP.clear(hint);
      hint.className = 'zone-hint';
      const z = CTP.zoneByName(zone);
      if (z) {
        const covered = (z.regions || []).some((r) => r.state === state);
        if (state && !covered) {
          hint.classList.add('warn');
          hint.appendChild(h('span', null,
            `⚠ ${state} is not in ${z.name}'s published states (${z.description}). Saving this keeps it as a manual assignment.`));
          return;
        }
        hint.classList.add('ok');
        hint.appendChild(h('span', null, `✅ ${z.name} covers ${z.description}.`));
        return;
      }
      const candidates = zonesForState(state);
      if (candidates.length > 1) {
        hint.classList.add('warn');
        hint.appendChild(h('span', null,
          `⚠ ${state} is split across ${candidates.join(', ')}. Choose the zone your centre reports to.`));
        return;
      }
      if (state && candidates.length === 0) {
        hint.classList.add('warn');
        hint.appendChild(h('span', null,
          `ℹ ${state} is not in the published zone table. An administrator can assign a zone manually later.`));
        return;
      }
      hint.appendChild(h('span', null,
        'Pick a zone to narrow the state list, or pick a state and the zone fills in automatically.'));
    }

    function emit() {
      drawHint();
      if (o.onChange) o.onChange({ zone, state });
    }

    zoneSelect.addEventListener('change', () => {
      zone = zoneSelect.value;
      buildStateOptions();
      emit();
    });

    stateSelect.addEventListener('change', () => {
      state = stateSelect.value;
      const candidates = zonesForState(state);
      if (candidates.length === 1 && zone !== candidates[0]) {
        zone = candidates[0];
        zoneSelect.value = zone;
        buildStateOptions();
      } else if (candidates.length > 1 && candidates.indexOf(zone) < 0) {
        zone = '';
        zoneSelect.value = '';
      }
      // A state with no published zone keeps whatever zone an administrator chose manually.
      emit();
    });

    buildZoneOptions();
    buildStateOptions();
    drawHint();

    const node = h('div', { class: 'zone-picker' },
      CTP.field(o.zoneLabel || 'Zone *', zoneSelect, 'The 12 national CTP zones.'),
      CTP.field(o.stateLabel || 'State / UT *', stateSelect, 'Filtered by the selected zone.'),
      hint);

    return {
      node,
      zoneSelect,
      stateSelect,
      hint,
      get: () => ({ zone, state })
    };
  };
})();
