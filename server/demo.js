'use strict';
const store = require('./store');
const models = require('./models');
const seed = require('./seed');
const { now } = require('./util');

const CENTRES = [
  { name: 'Dadar Digital Literacy Centre', city: 'Mumbai', district: 'Mumbai Suburban', state: 'Maharashtra', zone: 'Zone 8', pincode: '400028', lat: 19.0176, lng: 72.8562, mode: 'hybrid', online: true, coordinator: 'Meera Kulkarni', trainer: 'Rohit Shelke', secretary: 'Anil Joshi', zic: 'Sandeep Rane' },
  { name: 'Koramangala Community Lab', city: 'Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', zone: 'Zone 9', pincode: '560034', lat: 12.9352, lng: 77.6245, mode: 'hybrid', online: true, coordinator: 'Deepa Raghavan', trainer: 'Vikram Nair', secretary: 'Shruti Bhat', zic: 'Lakshmi Iyer' },
  { name: 'Rohini Skill Hub', city: 'New Delhi', district: 'North West Delhi', state: 'Delhi', zone: 'Zone 1', pincode: '110085', lat: 28.7365, lng: 77.1174, mode: 'onsite', online: false, coordinator: 'Harpreet Kaur', trainer: 'Ankit Sharma', secretary: 'Rakesh Gupta', zic: 'Naveen Chauhan' },
  { name: 'Salt Lake Learning Centre', city: 'Kolkata', district: 'North 24 Parganas', state: 'West Bengal', zone: 'Zone 10', pincode: '700091', lat: 22.5802, lng: 88.4178, mode: 'onsite', online: false, coordinator: 'Sutapa Ghosh', trainer: 'Arnab Dutta', secretary: 'Partha Sen', zic: 'Debjani Roy' },
  { name: 'Gomti Nagar CTP Centre', city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', zone: 'Zone 11', pincode: '226010', lat: 26.8520, lng: 81.0010, mode: 'onsite', online: false, coordinator: 'Ritu Verma', trainer: 'Saurabh Mishra', secretary: 'Alok Tripathi', zic: 'Naveen Chauhan' },
  { name: 'Meerut Shastri Nagar Centre', city: 'Meerut', district: 'Meerut', state: 'Uttar Pradesh', zone: 'Zone 5', pincode: '250004', lat: 28.9845, lng: 77.7064, mode: 'onsite', online: false, coordinator: 'Shivani Goel', trainer: 'Deepak Tyagi', secretary: 'Mahesh Sharma', zic: 'Naveen Chauhan' },
  { name: 'Varanasi Sigra Centre', city: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh', zone: 'Zone 6', pincode: '221010', lat: 25.3176, lng: 82.9739, mode: 'hybrid', online: true, coordinator: 'Neha Pandey', trainer: 'Abhishek Singh', secretary: 'Ram Nath Dubey', zic: 'Naveen Chauhan' },
  { name: 'Guwahati Riverfront Centre', city: 'Guwahati', district: 'Kamrup Metropolitan', state: 'Assam', zone: '', pincode: '781005', lat: 26.1445, lng: 91.7362, mode: 'hybrid', online: true, coordinator: 'Bhaskar Das', trainer: 'Rupali Bora', secretary: 'Nabin Hazarika', zic: 'Jayanta Saikia' },
  { name: 'Bhopal Lake View Centre', city: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh', zone: 'Zone 4', pincode: '462003', lat: 23.2599, lng: 77.4126, mode: 'onsite', online: false, coordinator: 'Pooja Sahu', trainer: 'Mukesh Yadav', secretary: 'Devendra Patel', zic: 'Sunita Rathore' },
  { name: 'Ahmedabad Navrangpura Centre', city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', zone: 'Zone 12', pincode: '380009', lat: 23.0330, lng: 72.5600, mode: 'hybrid', online: true, coordinator: 'Nilam Shah', trainer: 'Jigar Mehta', secretary: 'Kiran Desai', zic: 'Sandeep Rane' },
  { name: 'Chennai Adyar Centre', city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu', zone: 'Zone 9', pincode: '600020', lat: 13.0067, lng: 80.2570, mode: 'onsite', online: false, coordinator: 'Kavitha Subramanian', trainer: 'Prakash Raman', secretary: 'Devi Ananth', zic: 'Lakshmi Iyer' },
  { name: 'Patna Kankarbagh Centre', city: 'Patna', district: 'Patna', state: 'Bihar', zone: 'Zone 10', pincode: '800020', lat: 25.5941, lng: 85.1376, mode: 'onsite', online: false, coordinator: 'Amrita Kumari', trainer: 'Ravi Ranjan', secretary: 'Shyam Prasad', zic: 'Debjani Roy' },
  { name: 'Jaipur Malviya Nagar Centre', city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan', zone: 'Zone 7', pincode: '302017', lat: 26.8505, lng: 75.8060, mode: 'hybrid', online: true, coordinator: 'Shalini Rathore', trainer: 'Mohit Agarwal', secretary: 'Gopal Singh', zic: 'Naveen Chauhan' },
  { name: 'Ludhiana Model Town Centre', city: 'Ludhiana', district: 'Ludhiana', state: 'Punjab', zone: 'Zone 2', pincode: '141002', lat: 30.9010, lng: 75.8573, mode: 'onsite', online: false, coordinator: 'Gurpreet Singh', trainer: 'Simran Kaur', secretary: 'Balwinder Sidhu', zic: 'Harjit Bajwa' },
  { name: 'Gurugram Sector 14 Centre', city: 'Gurugram', district: 'Gurugram', state: 'Haryana', zone: 'Zone 3', pincode: '122001', lat: 28.4595, lng: 77.0266, mode: 'hybrid', online: true, coordinator: 'Anjali Yadav', trainer: 'Vikas Malik', secretary: 'Suresh Dahiya', zic: 'Naveen Chauhan' },
  { name: 'Kochi Kakkanad Centre', city: 'Kochi', district: 'Ernakulam', state: 'Kerala', zone: 'Zone 9', pincode: '682030', lat: 10.0150, lng: 76.3418, mode: 'online', online: true, coordinator: 'Anu Thomas', trainer: 'Jithin Varghese', secretary: 'Mary Joseph', zic: 'Lakshmi Iyer' }
];

/** Headquarters coordinator for each zone, used by the sample dataset. */
const HQ_COORDINATORS = {
  'Zone 1': { name: 'Naveen Chauhan', phone: '+91 9811002201', email: 'hq.zone1@ctp.org' },
  'Zone 2': { name: 'Harjit Bajwa', phone: '+91 9811002202', email: 'hq.zone2@ctp.org' },
  'Zone 3': { name: 'Rekha Dahiya', phone: '+91 9811002203', email: 'hq.zone3@ctp.org' },
  'Zone 4': { name: 'Sunita Rathore', phone: '+91 9811002204', email: 'hq.zone4@ctp.org' },
  'Zone 5': { name: 'Praveen Tyagi', phone: '+91 9811002205', email: 'hq.zone5@ctp.org' },
  'Zone 6': { name: 'Alka Pandey', phone: '+91 9811002206', email: 'hq.zone6@ctp.org' },
  'Zone 7': { name: 'Mahendra Shekhawat', phone: '+91 9811002207', email: 'hq.zone7@ctp.org' },
  'Zone 8': { name: 'Sandeep Rane', phone: '+91 9811002208', email: 'hq.zone8@ctp.org' },
  'Zone 9': { name: 'Lakshmi Iyer', phone: '+91 9811002209', email: 'hq.zone9@ctp.org' },
  'Zone 10': { name: 'Debjani Roy', phone: '+91 9811002210', email: 'hq.zone10@ctp.org' },
  'Zone 11': { name: 'Ashutosh Tripathi', phone: '+91 9811002211', email: 'hq.zone11@ctp.org' },
  'Zone 12': { name: 'Nilam Shah', phone: '+91 9811002212', email: 'hq.zone12@ctp.org' }
};

const SESSION_TEMPLATES = [
  { title: 'Foundation Batch - Computer Basics', programName: 'Basic Computer Training Program', status: 'completed', enrolled: 32, completed: 29, printed: 29, distributed: 29, weeks: 12 },
  { title: 'Evening Batch - MS Office Essentials', programName: 'Basic Computer Training Program', status: 'completed', enrolled: 28, completed: 24, printed: 24, distributed: 11, weeks: 10 },
  { title: 'Weekend Batch - Advanced Excel', programName: 'Online Advanced Excel Program', status: 'ongoing', enrolled: 22, completed: 0, printed: 0, distributed: 0, weeks: 6 },
  { title: 'Youth Batch - Python & Vibe Coding', programName: 'Online Python & Vibe Coding Program', status: 'ongoing', enrolled: 18, completed: 0, printed: 0, distributed: 0, weeks: 10 },
  { title: 'Women Empowerment Batch - Digital Skills', programName: 'Basic Computer Training Program', status: 'planned', enrolled: 25, completed: 0, printed: 0, distributed: 0, weeks: 12 },
  { title: 'AI Bootcamp Cohort', programName: 'Online AI Bootcamp', status: 'completed', enrolled: 40, completed: 36, printed: 36, distributed: 20, weeks: 4 }
];

function dateShift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function install(actor) {
  const data = store.db();
  const existing = new Set(data.centres.map((c) => c.name));
  let centresAdded = 0;
  let sessionsAdded = 0;

  store.update((d) => {
    CENTRES.forEach((spec, index) => {
      if (existing.has(spec.name)) return;
      const centre = models.normaliseCentre({
        name: spec.name,
        mode: spec.mode,
        status: 'active',
        zone: spec.zone,
        offersOnline: spec.online,
        capacity: 20 + ((index % 4) * 10),
        weeklySchedule: index % 2 ? 'Mon/Wed/Fri 6:00 PM - 8:00 PM' : 'Tue/Thu/Sat 10:00 AM - 12:30 PM',
        facilities: ['Desktop lab', 'Broadband', 'Projector'].slice(0, 2 + (index % 2)),
        establishedOn: dateShift(-(400 + index * 37)),
        address: {
          line1: `${10 + index} Community Hall`,
          line2: spec.city,
          city: spec.city,
          district: spec.district,
          state: spec.state,
          pincode: spec.pincode
        },
        location: { lat: spec.lat, lng: spec.lng },
        contacts: {
          coordinator: { name: spec.coordinator, email: `${spec.coordinator.split(' ')[0].toLowerCase()}@ctp.org`, phone: `+91 9${String(800000000 + index * 1234567).slice(0, 9)}` },
          trainerLead: { name: spec.trainer, email: `${spec.trainer.split(' ')[0].toLowerCase()}@ctp.org`, phone: `+91 9${String(810000000 + index * 2345678).slice(0, 9)}` },
          centreSecretary: { name: spec.secretary, email: `${spec.secretary.split(' ')[0].toLowerCase()}@ctp.org`, phone: `+91 9${String(820000000 + index * 3456789).slice(0, 9)}` },
          zoneInCharge: { name: spec.zic, email: `${spec.zic.split(' ')[0].toLowerCase()}@ctp.org`, phone: `+91 9${String(830000000 + index * 4567891).slice(0, 9)}` },
          primaryPhone: `+91 9${String(800000000 + index * 1234567).slice(0, 9)}`,
          primaryEmail: `${spec.city.toLowerCase().replace(/\s/g, '')}@ctp.org`
        },
        volunteers: [
          { name: `Volunteer A${index + 1}`, role: 'Lab assistant', phone: '', email: '' },
          { name: `Volunteer B${index + 1}`, role: 'Trainer', phone: '', email: '' }
        ],
        notes: 'Demo record created by the sample data generator.'
      });
      centre.isDemo = true;
      d.centres.push(centre);
      centresAdded += 1;

      const picks = SESSION_TEMPLATES.slice(index % 3, (index % 3) + 3);
      picks.forEach((tpl, k) => {
        const start = dateShift(-(60 + k * 45));
        const session = models.normaliseSession({
          title: tpl.title,
          programName: tpl.programName,
          batch: `B${2024 + ((index + k) % 3)}-${k + 1}`,
          mode: spec.mode === 'online' ? 'online' : (k % 2 ? 'online' : 'onsite'),
          trainer: spec.trainer,
          startDate: start,
          endDate: tpl.status === 'completed' ? dateShift(-(60 + k * 45) + tpl.weeks * 7) : '',
          schedule: 'Twice a week, 2 hours per class',
          totalClasses: tpl.weeks * 2,
          enrolledCount: tpl.enrolled,
          completedCount: tpl.completed,
          status: tpl.status,
          notes: 'Demo session.'
        }, null, centre.id);
        if (tpl.status === 'completed') {
          session.reflection = models.normaliseReflection({
            certificatesPrinted: tpl.printed,
            certificatesDistributed: tpl.distributed,
            distributedOn: tpl.distributed ? dateShift(-(20 + k * 10)) : '',
            distributionMode: 'In-centre ceremony',
            feedbackScore: 4 + ((index + k) % 2) * 0.5,
            highlights: 'Strong attendance and good practical scores.',
            challenges: 'A few learners needed extra typing practice.',
            nextSteps: 'Start the next batch and follow up on pending certificates.'
          }, null);
        }
        session.isDemo = true;
        d.sessions.push(session);
        sessionsAdded += 1;
      });
    });

    if (centresAdded) {
      d.zones = (d.zones || []).map((z) => {
        const hq = HQ_COORDINATORS[z.zone];
        if (!hq || (z.hqCoordinator && z.hqCoordinator.name)) return z;
        return models.normaliseZoneRecord({
          zone: z.zone,
          hqCoordinator: Object.assign({ designation: 'HQ Zone Coordinator' }, hq),
          notes: 'Demo record created by the sample data generator.'
        }, z);
      });

      d.notices.unshift(models.normaliseNotice({
        title: 'Zone 5 & Zone 11 coordinators meet on 12 October',
        body: 'The quarterly review for the Uttar Pradesh zones is at the Lucknow HQ, 11:00 AM. Please carry your session registers and pending certificate counts.',
        level: 'info',
        pinned: true,
        active: true
      }, null, actor ? actor.name : 'Administrator'));

      d.notices.unshift(models.normaliseNotice({
        title: 'Certificates printed for the 2026 foundation batches',
        body: 'Certificates for all completed foundation batches have been printed and dispatched to zonal offices. Coordinators may collect them and update the distribution count under each session reflection.',
        level: 'success',
        pinned: true,
        active: true
      }, null, actor ? actor.name : 'Administrator'));
    }
  });

  store.logActivity(actor ? actor.email : 'system', 'demo.installed',
    `${centresAdded} centres, ${sessionsAdded} sessions`);
  return { centresAdded, sessionsAdded, at: now() };
}

function clear() {
  let removed = 0;
  store.update((d) => {
    const demoIds = new Set(d.centres.filter((c) => c.isDemo).map((c) => c.id));
    removed = demoIds.size;
    d.centres = d.centres.filter((c) => !c.isDemo);
    d.sessions = d.sessions.filter((s) => !s.isDemo && !demoIds.has(s.centreId));
    d.zones = (d.zones || []).map((z) => (
      z.notes === 'Demo record created by the sample data generator.' ? seed.zoneRecord(z.zone) : z
    ));
  });
  store.logActivity('system', 'demo.cleared', `${removed} centres removed`);
  return removed;
}

module.exports = { install, clear };
