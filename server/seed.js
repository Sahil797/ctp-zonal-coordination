'use strict';
const crypto = require('crypto');
const config = require('./config');
const geo = require('./geo');

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 64).toString('hex');
  return { salt: s, hash };
}

function defaultSettings() {
  return {
    orgName: 'Computer Training Program',
    shortName: 'CTP',
    subtitle: 'Zonal Coordination Portal',
    tagline: 'One national repository for every CTP centre, session and certificate.',
    mission: 'Bridging the digital divide by taking structured computer training to every zone of India through volunteer-run centres.',
    supportEmail: 'support@ctp.org',
    supportPhone: '',
    basicProgramFormUrl: '',
    basicProgramName: 'Basic Computer Training Program',
    showDirectoryPublicly: true,
    showContactsPublicly: false,
    certificateNoticeEnabled: true,
    accentColor: '#2563eb'
  };
}

function programSeed() {
  const base = (over) => Object.assign({
    id: uid('prg'),
    category: 'online',
    description: '',
    level: 'Beginner',
    durationWeeks: 6,
    mode: 'Online - live sessions',
    enrollUrl: '',
    buttonLabel: 'Enroll now',
    buttonColor: '#2563eb',
    textColor: '#ffffff',
    icon: '💻',
    active: true,
    seats: 0,
    startsOn: '',
    order: 0,
    createdAt: new Date().toISOString()
  }, over);

  return [
    base({
      name: 'Online Advanced Excel Program',
      description: 'Formulas, pivot tables, Power Query, dashboards and data clean-up for day-to-day office productivity.',
      level: 'Intermediate',
      durationWeeks: 6,
      icon: '📊',
      buttonColor: '#16a34a',
      order: 1
    }),
    base({
      name: 'Online Power BI Program',
      description: 'Data modelling, DAX basics and interactive report building for volunteers and working professionals.',
      level: 'Intermediate',
      durationWeeks: 8,
      icon: '📈',
      buttonColor: '#f59e0b',
      textColor: '#1f2937',
      order: 2
    }),
    base({
      name: 'Online AI Bootcamp',
      description: 'Hands-on bootcamp covering generative AI, prompt craft, responsible use and practical AI assistants.',
      level: 'Beginner',
      durationWeeks: 4,
      icon: '🤖',
      buttonColor: '#7c3aed',
      order: 3
    }),
    base({
      name: 'Online Python & Vibe Coding Program',
      description: 'Python fundamentals plus AI-assisted "vibe coding" to build small working projects end to end.',
      level: 'Beginner',
      durationWeeks: 10,
      icon: '🐍',
      buttonColor: '#0ea5e9',
      order: 4
    }),
    base({
      name: 'Basic Computer Training Program',
      category: 'basic',
      description: 'Centre-based foundation course: computer basics, typing, internet, email, documents and digital safety.',
      level: 'Foundation',
      durationWeeks: 12,
      mode: 'In-centre',
      icon: '🖥️',
      buttonLabel: 'Find a centre & enroll',
      buttonColor: '#be123c',
      order: 5
    })
  ];
}

/** An empty HQ coordinator record for one zone. Administrators fill these in. */
function zoneRecord(zoneName) {
  return {
    zone: zoneName,
    hqCoordinator: { name: '', email: '', phone: '', designation: 'HQ Zone Coordinator' },
    notes: '',
    updatedAt: null
  };
}

function zoneSeed() {
  return geo.ZONES.map((z) => zoneRecord(z.name));
}

function initialData() {
  const nowIso = new Date().toISOString();
  const { salt, hash } = hashPassword(config.DEFAULT_ADMIN.password);
  const admin = {
    id: uid('usr'),
    name: config.DEFAULT_ADMIN.name,
    email: config.DEFAULT_ADMIN.email,
    phone: '',
    passwordSalt: salt,
    passwordHash: hash,
    role: 'admin',
    status: 'active',
    centreId: null,
    designation: 'National Administrator',
    zone: '',
    createdAt: nowIso,
    lastLoginAt: null,
    mustChangePassword: true
  };

  return {
    meta: { version: 2, createdAt: nowIso },
    settings: defaultSettings(),
    users: [admin],
    sessionsAuth: [],
    centres: [],
    sessions: [],
    programs: programSeed(),
    enrollments: [],
    zones: zoneSeed(),
    notices: [{
      id: uid('ntc'),
      title: 'Welcome to the CTP Zonal Coordination portal',
      body: 'Centre coordinators can register, publish their centre details, log training sessions and record certificate distribution here.',
      level: 'info',
      pinned: true,
      active: true,
      centreId: null,
      createdAt: nowIso,
      expiresAt: '',
      createdBy: config.DEFAULT_ADMIN.name
    }],
    activity: [{
      id: uid('act'),
      at: nowIso,
      actor: 'system',
      action: 'database.seeded',
      detail: 'Initial CTP database created'
    }]
  };
}

module.exports = { initialData, defaultSettings, programSeed, zoneSeed, zoneRecord, hashPassword, uid };
