'use strict';

/**
 * CTP zonal map.
 *
 * Zones are numbered 1-12 exactly as published by the national coordination office.
 * Uttar Pradesh is split across three zones (5 North West, 6 East, 11 South East), so a
 * state alone is not always enough to derive a zone - the zone selected on the registration
 * form is authoritative, and `zoneForState` only auto-fills when the mapping is unambiguous.
 * States and UTs that are not in the published table stay unzoned until an administrator
 * assigns one manually.
 */

const UNZONED_LABEL = 'Zone not assigned';

/** region.state must match a STATE_REF entry; region.label is what the picker shows. */
const ZONE_DEFS = [
  { number: 1, regions: [{ state: 'Delhi' }] },
  { number: 2, regions: [{ state: 'Punjab' }, { state: 'Himachal Pradesh' }, { state: 'Jammu and Kashmir', label: 'Jammu & Kashmir' }] },
  { number: 3, regions: [{ state: 'Haryana' }] },
  { number: 4, regions: [{ state: 'Madhya Pradesh' }, { state: 'Chhattisgarh' }] },
  { number: 5, regions: [{ state: 'Uttar Pradesh', label: 'Uttar Pradesh (North West)', lat: 28.00, lng: 78.10 }, { state: 'Uttarakhand' }] },
  { number: 6, regions: [{ state: 'Uttar Pradesh', label: 'Uttar Pradesh (East)', lat: 26.35, lng: 83.00 }] },
  { number: 7, regions: [{ state: 'Rajasthan' }] },
  { number: 8, regions: [{ state: 'Maharashtra' }, { state: 'Goa' }] },
  { number: 9, regions: [{ state: 'Andhra Pradesh' }, { state: 'Karnataka' }, { state: 'Kerala' }, { state: 'Odisha' }, { state: 'Tamil Nadu' }] },
  { number: 10, regions: [{ state: 'Bihar' }, { state: 'Jharkhand' }, { state: 'West Bengal' }] },
  { number: 11, regions: [{ state: 'Uttar Pradesh', label: 'Uttar Pradesh (South East)', lat: 25.60, lng: 81.60 }] },
  { number: 12, regions: [{ state: 'Gujarat' }] }
];

/** State / UT reference data: approximate centroid used when a centre has no precise pin. */
const STATE_REF = [
  { name: 'Andaman and Nicobar Islands', type: 'UT', lat: 11.74, lng: 92.66 },
  { name: 'Andhra Pradesh', type: 'State', lat: 15.91, lng: 79.74 },
  { name: 'Arunachal Pradesh', type: 'State', lat: 28.22, lng: 94.73 },
  { name: 'Assam', type: 'State', lat: 26.20, lng: 92.94 },
  { name: 'Bihar', type: 'State', lat: 25.10, lng: 85.31 },
  { name: 'Chandigarh', type: 'UT', lat: 30.73, lng: 76.78 },
  { name: 'Chhattisgarh', type: 'State', lat: 21.28, lng: 81.87 },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', type: 'UT', lat: 20.40, lng: 72.83 },
  { name: 'Delhi', type: 'UT', lat: 28.70, lng: 77.10 },
  { name: 'Goa', type: 'State', lat: 15.30, lng: 74.12 },
  { name: 'Gujarat', type: 'State', lat: 22.26, lng: 71.19 },
  { name: 'Haryana', type: 'State', lat: 29.06, lng: 76.09 },
  { name: 'Himachal Pradesh', type: 'State', lat: 31.10, lng: 77.17 },
  { name: 'Jammu and Kashmir', type: 'UT', lat: 33.78, lng: 76.58 },
  { name: 'Jharkhand', type: 'State', lat: 23.61, lng: 85.28 },
  { name: 'Karnataka', type: 'State', lat: 15.32, lng: 75.71 },
  { name: 'Kerala', type: 'State', lat: 10.85, lng: 76.27 },
  { name: 'Ladakh', type: 'UT', lat: 34.15, lng: 77.58 },
  { name: 'Lakshadweep', type: 'UT', lat: 10.57, lng: 72.64 },
  { name: 'Madhya Pradesh', type: 'State', lat: 22.97, lng: 78.66 },
  { name: 'Maharashtra', type: 'State', lat: 19.75, lng: 75.71 },
  { name: 'Manipur', type: 'State', lat: 24.66, lng: 93.91 },
  { name: 'Meghalaya', type: 'State', lat: 25.47, lng: 91.37 },
  { name: 'Mizoram', type: 'State', lat: 23.16, lng: 92.94 },
  { name: 'Nagaland', type: 'State', lat: 26.16, lng: 94.56 },
  { name: 'Odisha', type: 'State', lat: 20.95, lng: 85.10 },
  { name: 'Puducherry', type: 'UT', lat: 11.94, lng: 79.81 },
  { name: 'Punjab', type: 'State', lat: 31.15, lng: 75.34 },
  { name: 'Rajasthan', type: 'State', lat: 27.02, lng: 74.22 },
  { name: 'Sikkim', type: 'State', lat: 27.53, lng: 88.51 },
  { name: 'Tamil Nadu', type: 'State', lat: 11.13, lng: 78.66 },
  { name: 'Telangana', type: 'State', lat: 18.11, lng: 79.02 },
  { name: 'Tripura', type: 'State', lat: 23.94, lng: 91.99 },
  { name: 'Uttar Pradesh', type: 'State', lat: 26.85, lng: 80.95 },
  { name: 'Uttarakhand', type: 'State', lat: 30.07, lng: 79.02 },
  { name: 'West Bengal', type: 'State', lat: 22.99, lng: 87.85 }
];

const REF_BY_NAME = new Map(STATE_REF.map((s) => [s.name.toLowerCase(), s]));

const ZONES = ZONE_DEFS.map((def) => {
  const regions = def.regions.map((r) => {
    const ref = REF_BY_NAME.get(r.state.toLowerCase());
    return {
      state: ref ? ref.name : r.state,
      label: r.label || r.state,
      lat: r.lat !== undefined ? r.lat : (ref ? ref.lat : 0),
      lng: r.lng !== undefined ? r.lng : (ref ? ref.lng : 0)
    };
  });
  const description = regions.map((r) => r.label).join(', ');
  return {
    number: def.number,
    name: `Zone ${def.number}`,
    description,
    label: `Zone ${def.number} — ${description}`,
    regions,
    states: regions.map((r) => r.state)
  };
});

const ZONE_NAMES = ZONES.map((z) => z.name);
const ZONE_BY_NAME = new Map(ZONES.map((z) => [z.name.toLowerCase(), z]));
const ZONE_BY_NUMBER = new Map(ZONES.map((z) => [z.number, z]));

/** state name (lowercase) -> [zone, ...]. Uttar Pradesh maps to three zones. */
const ZONES_BY_STATE = new Map();
ZONES.forEach((z) => {
  z.states.forEach((state) => {
    const key = state.toLowerCase();
    if (!ZONES_BY_STATE.has(key)) ZONES_BY_STATE.set(key, []);
    ZONES_BY_STATE.get(key).push(z);
  });
});

/** Public state list: every state/UT, annotated with the zone(s) it belongs to. */
const STATES = STATE_REF.map((s) => {
  const zones = ZONES_BY_STATE.get(s.name.toLowerCase()) || [];
  return {
    name: s.name,
    type: s.type,
    lat: s.lat,
    lng: s.lng,
    zone: zones.length === 1 ? zones[0].name : '',
    zones: zones.map((z) => z.name)
  };
});

const BY_NAME = new Map(STATES.map((s) => [s.name.toLowerCase(), s]));

function findState(name) {
  if (!name) return null;
  return BY_NAME.get(String(name).trim().toLowerCase()) || null;
}

/** Accepts "Zone 7", "zone 7", "7" or 7. Returns the zone object or null. */
function findZone(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim();
  if (ZONE_BY_NAME.has(raw.toLowerCase())) return ZONE_BY_NAME.get(raw.toLowerCase());
  const digits = raw.match(/^\d+$/) || raw.match(/zone\s*(\d+)/i);
  if (digits) return ZONE_BY_NUMBER.get(Number(digits[1] !== undefined ? digits[1] : digits[0])) || null;
  return null;
}

/** Canonical zone name, or '' when the value is not a known zone. */
function normaliseZone(value) {
  const z = findZone(value);
  return z ? z.name : '';
}

/** Zones a state can belong to (3 for Uttar Pradesh, 1 for most, 0 when unlisted). */
function zonesForState(name) {
  const s = findState(name);
  if (!s) return [];
  return s.zones.map((n) => ZONE_BY_NAME.get(n.toLowerCase())).filter(Boolean);
}

/** Auto-derived zone - only returns a value when the state maps to exactly one zone. */
function zoneForState(name) {
  const zones = zonesForState(name);
  return zones.length === 1 ? zones[0].name : '';
}

function zoneLabel(value) {
  const z = findZone(value);
  return z ? z.label : UNZONED_LABEL;
}

/** Resolve a map pin: explicit coordinates win, then the zone region, then the state centroid. */
function resolvePoint(centre) {
  const lat = Number(centre && centre.location && centre.location.lat);
  const lng = Number(centre && centre.location && centre.location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return { lat, lng, approx: false };
  }
  const stateName = centre && centre.address && centre.address.state;
  const zone = findZone(centre && centre.zone);
  if (zone && stateName) {
    const region = zone.regions.find((r) => r.state.toLowerCase() === String(stateName).trim().toLowerCase());
    if (region && region.lat && region.lng) return { lat: region.lat, lng: region.lng, approx: true };
  }
  const s = findState(stateName);
  if (s) return { lat: s.lat, lng: s.lng, approx: true };
  return null;
}

module.exports = {
  UNZONED_LABEL,
  ZONES,
  ZONE_NAMES,
  STATES,
  findState,
  findZone,
  normaliseZone,
  zonesForState,
  zoneForState,
  zoneLabel,
  resolvePoint
};
