'use strict';
const { str, num, int, bool, oneOf, email, phone, dateOnly, person, id, now } = require('./util');
const geo = require('./geo');

const CENTRE_MODES = ['onsite', 'online', 'hybrid'];
const CENTRE_STATUS = ['active', 'paused', 'closed'];
const SESSION_STATUS = ['planned', 'ongoing', 'completed', 'cancelled'];
const ENROLL_STATUS = ['new', 'contacted', 'enrolled', 'declined'];
const NOTICE_LEVELS = ['info', 'success', 'warning', 'critical'];

function centreCode(name, state) {
  const a = str(name).replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CTP';
  const b = str(state).replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'IN';
  return `${b}-${a}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normaliseCentre(input, existing) {
  const src = input && typeof input === 'object' ? input : {};
  const base = existing || {};
  const addrIn = src.address && typeof src.address === 'object' ? src.address : {};
  const baseAddr = base.address || {};
  const contactsIn = src.contacts && typeof src.contacts === 'object' ? src.contacts : {};
  const baseContacts = base.contacts || {};

  const address = {
    line1: str(addrIn.line1 !== undefined ? addrIn.line1 : baseAddr.line1, 160),
    line2: str(addrIn.line2 !== undefined ? addrIn.line2 : baseAddr.line2, 160),
    landmark: str(addrIn.landmark !== undefined ? addrIn.landmark : baseAddr.landmark, 120),
    city: str(addrIn.city !== undefined ? addrIn.city : baseAddr.city, 80),
    district: str(addrIn.district !== undefined ? addrIn.district : baseAddr.district, 80),
    state: str(addrIn.state !== undefined ? addrIn.state : baseAddr.state, 80),
    pincode: str(addrIn.pincode !== undefined ? addrIn.pincode : baseAddr.pincode, 10).replace(/[^\d]/g, '')
  };

  const stateRef = geo.findState(address.state);
  if (stateRef) address.state = stateRef.name;

  const locIn = src.location && typeof src.location === 'object' ? src.location : {};
  const baseLoc = base.location || {};
  const location = {
    lat: num(locIn.lat !== undefined ? locIn.lat : baseLoc.lat, 0),
    lng: num(locIn.lng !== undefined ? locIn.lng : baseLoc.lng, 0)
  };
  if (Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
    location.lat = 0;
    location.lng = 0;
  }

  const contacts = {
    coordinator: person(contactsIn.coordinator !== undefined ? contactsIn.coordinator : baseContacts.coordinator),
    trainerLead: person(contactsIn.trainerLead !== undefined ? contactsIn.trainerLead : baseContacts.trainerLead),
    centreSecretary: person(contactsIn.centreSecretary !== undefined ? contactsIn.centreSecretary : baseContacts.centreSecretary),
    zoneInCharge: person(contactsIn.zoneInCharge !== undefined ? contactsIn.zoneInCharge : baseContacts.zoneInCharge),
    primaryPhone: phone(contactsIn.primaryPhone !== undefined ? contactsIn.primaryPhone : baseContacts.primaryPhone),
    primaryEmail: email(contactsIn.primaryEmail !== undefined ? contactsIn.primaryEmail : baseContacts.primaryEmail)
  };

  const volunteersIn = Array.isArray(src.volunteers) ? src.volunteers : base.volunteers;
  const volunteers = (Array.isArray(volunteersIn) ? volunteersIn : [])
    .filter((v) => v && str(v.name))
    .slice(0, 100)
    .map((v) => Object.assign(person(v), {
      id: str(v.id) || id('vol'),
      role: str(v.role, 80) || 'Volunteer'
    }));

  const name = str(src.name !== undefined ? src.name : base.name, 140);
  const zoneInput = src.zone !== undefined ? src.zone : base.zone;
  // An explicit zone always wins (it is the only way to place a Uttar Pradesh centre, and the
  // only way to zone a state that is outside the published table). Otherwise derive it.
  const zone = geo.normaliseZone(zoneInput) || geo.zoneForState(address.state);

  return {
    id: base.id || id('ctr'),
    code: str(src.code !== undefined ? src.code : base.code, 24) || centreCode(name, address.state),
    name,
    status: oneOf(src.status !== undefined ? src.status : base.status, CENTRE_STATUS, 'active'),
    mode: oneOf(src.mode !== undefined ? src.mode : base.mode, CENTRE_MODES, 'onsite'),
    zone,
    address,
    location,
    establishedOn: dateOnly(src.establishedOn !== undefined ? src.establishedOn : base.establishedOn),
    capacity: int(src.capacity !== undefined ? src.capacity : base.capacity, 0),
    weeklySchedule: str(src.weeklySchedule !== undefined ? src.weeklySchedule : base.weeklySchedule, 200),
    facilities: (Array.isArray(src.facilities) ? src.facilities : (base.facilities || []))
      .map((f) => str(f, 60)).filter(Boolean).slice(0, 25),
    offersOnline: bool(src.offersOnline !== undefined ? src.offersOnline : base.offersOnline),
    onlineProgramIds: (Array.isArray(src.onlineProgramIds) ? src.onlineProgramIds : (base.onlineProgramIds || []))
      .map((p) => str(p, 60)).filter(Boolean).slice(0, 50),
    notes: str(src.notes !== undefined ? src.notes : base.notes, 1500),
    contacts,
    volunteers,
    ownerUserId: base.ownerUserId || str(src.ownerUserId) || null,
    createdAt: base.createdAt || now(),
    updatedAt: now()
  };
}

/** One record per zone: the headquarters coordinator who owns that zone nationally. */
function normaliseZoneRecord(input, existing) {
  const src = input && typeof input === 'object' ? input : {};
  const base = existing || {};
  const hqIn = src.hqCoordinator && typeof src.hqCoordinator === 'object' ? src.hqCoordinator : {};
  const baseHq = base.hqCoordinator || {};
  return {
    zone: geo.normaliseZone(src.zone !== undefined ? src.zone : base.zone),
    hqCoordinator: Object.assign(person({
      name: hqIn.name !== undefined ? hqIn.name : baseHq.name,
      email: hqIn.email !== undefined ? hqIn.email : baseHq.email,
      phone: hqIn.phone !== undefined ? hqIn.phone : baseHq.phone
    }), {
      designation: str(hqIn.designation !== undefined ? hqIn.designation : baseHq.designation, 80)
        || 'HQ Zone Coordinator'
    }),
    notes: str(src.notes !== undefined ? src.notes : base.notes, 600),
    updatedAt: now()
  };
}

/** Zone record shaped for an API response, with contacts masked for anonymous visitors. */
function publicZone(record, zoneRef, opts) {
  const o = opts || {};
  const hq = (record && record.hqCoordinator) || {};
  return {
    zone: zoneRef.name,
    number: zoneRef.number,
    label: zoneRef.label,
    description: zoneRef.description,
    states: zoneRef.states,
    regions: zoneRef.regions,
    hqCoordinator: {
      name: hq.name || '',
      designation: hq.designation || 'HQ Zone Coordinator',
      email: o.showContacts ? (hq.email || '') : '',
      phone: o.showContacts ? (hq.phone || '') : ''
    },
    notes: (record && record.notes) || '',
    updatedAt: (record && record.updatedAt) || null
  };
}

function emptyReflection() {
  return {
    certificatesPrinted: 0,
    certificatesDistributed: 0,
    distributedOn: '',
    distributionMode: '',
    feedbackScore: null,
    highlights: '',
    challenges: '',
    nextSteps: '',
    attachments: [],
    updatedAt: null
  };
}

function normaliseReflection(input, existing) {
  const src = input && typeof input === 'object' ? input : {};
  const base = Object.assign(emptyReflection(), existing || {});
  const score = src.feedbackScore !== undefined ? src.feedbackScore : base.feedbackScore;
  const parsedScore = score === '' || score === null || score === undefined ? null
    : Math.max(0, Math.min(5, num(score, 0)));
  return {
    certificatesPrinted: Math.max(0, int(src.certificatesPrinted !== undefined ? src.certificatesPrinted : base.certificatesPrinted, 0)),
    certificatesDistributed: Math.max(0, int(src.certificatesDistributed !== undefined ? src.certificatesDistributed : base.certificatesDistributed, 0)),
    distributedOn: dateOnly(src.distributedOn !== undefined ? src.distributedOn : base.distributedOn),
    distributionMode: str(src.distributionMode !== undefined ? src.distributionMode : base.distributionMode, 80),
    feedbackScore: parsedScore,
    highlights: str(src.highlights !== undefined ? src.highlights : base.highlights, 2000),
    challenges: str(src.challenges !== undefined ? src.challenges : base.challenges, 2000),
    nextSteps: str(src.nextSteps !== undefined ? src.nextSteps : base.nextSteps, 2000),
    attachments: Array.isArray(base.attachments) ? base.attachments : [],
    updatedAt: now()
  };
}

function normaliseSession(input, existing, centreId) {
  const src = input && typeof input === 'object' ? input : {};
  const base = existing || {};
  const status = oneOf(src.status !== undefined ? src.status : base.status, SESSION_STATUS, 'planned');
  const wasCompleted = base.status === 'completed';

  const record = {
    id: base.id || id('ses'),
    centreId: base.centreId || centreId,
    title: str(src.title !== undefined ? src.title : base.title, 160),
    programId: str(src.programId !== undefined ? src.programId : base.programId, 60),
    programName: str(src.programName !== undefined ? src.programName : base.programName, 160),
    batch: str(src.batch !== undefined ? src.batch : base.batch, 80),
    mode: oneOf(src.mode !== undefined ? src.mode : base.mode, ['onsite', 'online', 'hybrid'], 'onsite'),
    trainer: str(src.trainer !== undefined ? src.trainer : base.trainer, 140),
    startDate: dateOnly(src.startDate !== undefined ? src.startDate : base.startDate),
    endDate: dateOnly(src.endDate !== undefined ? src.endDate : base.endDate),
    schedule: str(src.schedule !== undefined ? src.schedule : base.schedule, 200),
    totalClasses: Math.max(0, int(src.totalClasses !== undefined ? src.totalClasses : base.totalClasses, 0)),
    enrolledCount: Math.max(0, int(src.enrolledCount !== undefined ? src.enrolledCount : base.enrolledCount, 0)),
    completedCount: Math.max(0, int(src.completedCount !== undefined ? src.completedCount : base.completedCount, 0)),
    status,
    notes: str(src.notes !== undefined ? src.notes : base.notes, 2000),
    reflection: Object.assign(emptyReflection(), base.reflection || {}),
    createdAt: base.createdAt || now(),
    updatedAt: now(),
    completedAt: base.completedAt || null
  };

  if (status === 'completed' && !wasCompleted) record.completedAt = now();
  if (status !== 'completed') record.completedAt = null;
  return record;
}

function normaliseProgram(input, existing) {
  const src = input && typeof input === 'object' ? input : {};
  const base = existing || {};
  const url = str(src.enrollUrl !== undefined ? src.enrollUrl : base.enrollUrl, 600);
  const safeUrl = /^https?:\/\//i.test(url) ? url : '';
  return {
    id: base.id || id('prg'),
    name: str(src.name !== undefined ? src.name : base.name, 140),
    category: oneOf(src.category !== undefined ? src.category : base.category, ['online', 'basic'], 'online'),
    description: str(src.description !== undefined ? src.description : base.description, 1200),
    level: str(src.level !== undefined ? src.level : base.level, 60),
    mode: str(src.mode !== undefined ? src.mode : base.mode, 80),
    durationWeeks: Math.max(0, int(src.durationWeeks !== undefined ? src.durationWeeks : base.durationWeeks, 0)),
    enrollUrl: safeUrl,
    buttonLabel: str(src.buttonLabel !== undefined ? src.buttonLabel : base.buttonLabel, 60) || 'Enroll now',
    buttonColor: colour(src.buttonColor !== undefined ? src.buttonColor : base.buttonColor, '#2563eb'),
    textColor: colour(src.textColor !== undefined ? src.textColor : base.textColor, '#ffffff'),
    icon: str(src.icon !== undefined ? src.icon : base.icon, 8) || '💡',
    active: src.active !== undefined ? bool(src.active) : (base.active !== undefined ? bool(base.active) : true),
    seats: Math.max(0, int(src.seats !== undefined ? src.seats : base.seats, 0)),
    startsOn: dateOnly(src.startsOn !== undefined ? src.startsOn : base.startsOn),
    order: int(src.order !== undefined ? src.order : base.order, 0),
    createdAt: base.createdAt || now(),
    updatedAt: now()
  };
}

function colour(value, fallback) {
  const v = str(value, 32);
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
}

function normaliseNotice(input, existing, author) {
  const src = input && typeof input === 'object' ? input : {};
  const base = existing || {};
  return {
    id: base.id || id('ntc'),
    title: str(src.title !== undefined ? src.title : base.title, 160),
    body: str(src.body !== undefined ? src.body : base.body, 2000),
    level: oneOf(src.level !== undefined ? src.level : base.level, NOTICE_LEVELS, 'info'),
    pinned: src.pinned !== undefined ? bool(src.pinned) : bool(base.pinned),
    active: src.active !== undefined ? bool(src.active) : (base.active !== undefined ? bool(base.active) : true),
    centreId: str(src.centreId !== undefined ? src.centreId : base.centreId) || null,
    linkUrl: (() => {
      const u = str(src.linkUrl !== undefined ? src.linkUrl : base.linkUrl, 600);
      return /^https?:\/\//i.test(u) || u.startsWith('#/') ? u : '';
    })(),
    expiresAt: dateOnly(src.expiresAt !== undefined ? src.expiresAt : base.expiresAt),
    createdBy: base.createdBy || author || 'Administrator',
    createdAt: base.createdAt || now(),
    updatedAt: now()
  };
}

/** Strips private contact details unless the viewer is allowed to see them. */
function publicCentre(centre, opts) {
  const o = opts || {};
  const point = geo.resolvePoint(centre);
  const base = {
    id: centre.id,
    code: centre.code,
    name: centre.name,
    status: centre.status,
    mode: centre.mode,
    zone: centre.zone,
    address: centre.address,
    location: centre.location,
    point,
    establishedOn: centre.establishedOn,
    capacity: centre.capacity,
    weeklySchedule: centre.weeklySchedule,
    facilities: centre.facilities,
    offersOnline: centre.offersOnline,
    onlineProgramIds: centre.onlineProgramIds,
    volunteerCount: (centre.volunteers || []).length,
    createdAt: centre.createdAt,
    updatedAt: centre.updatedAt
  };

  if (o.full) {
    return Object.assign(base, {
      contacts: centre.contacts,
      volunteers: centre.volunteers,
      notes: centre.notes,
      ownerUserId: centre.ownerUserId
    });
  }

  const c = centre.contacts || {};
  return Object.assign(base, {
    contacts: {
      coordinator: { name: (c.coordinator || {}).name || '', email: '', phone: '' },
      trainerLead: { name: (c.trainerLead || {}).name || '', email: '', phone: '' },
      centreSecretary: { name: (c.centreSecretary || {}).name || '', email: '', phone: '' },
      zoneInCharge: { name: (c.zoneInCharge || {}).name || '', email: '', phone: '' },
      primaryPhone: o.showContacts ? (c.primaryPhone || '') : '',
      primaryEmail: o.showContacts ? (c.primaryEmail || '') : ''
    },
    volunteers: []
  });
}

module.exports = {
  CENTRE_MODES, CENTRE_STATUS, SESSION_STATUS, ENROLL_STATUS, NOTICE_LEVELS,
  normaliseCentre, normaliseSession, normaliseReflection, emptyReflection,
  normaliseProgram, normaliseNotice, publicCentre, centreCode, colour,
  normaliseZoneRecord, publicZone
};
