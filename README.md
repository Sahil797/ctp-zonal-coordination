# CTP Zonal Coordination Portal

A self-contained web app for a non-profit's **Computer Training Program (CTP)** — a single national
repository of training centres, their coordination teams, their training sessions, certificate
distribution and public enrollment.

Runs entirely on your machine. No build step, no database server, no cloud account.

---

## Quick start

```powershell
cd C:\Users\sahilsharma\Projects\CTP-Zonal-Coordination
npm install        # first time only
npm start
```

Open <http://127.0.0.1:5090>

**Default administrator** (local development only)

| | |
|---|---|
| Email | `admin@ctp.org` |
| Password | `Ctp@2026` |

> Change this password immediately from **My account → Change password**.
>
> This fixed default applies **only when `NODE_ENV` is not `production`**. In production the app
> refuses to use a published password: set `CTP_ADMIN_PASSWORD`, or the app generates a random one
> and prints it to the startup log on first boot. See [`DEPLOYMENT.md`](DEPLOYMENT.md).

To run on a different port: `set CTP_PORT=6000` (PowerShell: `$env:CTP_PORT=6000`) before `npm start`.

---

## What the app does

### 1. Home page — national status
- Live KPIs: centres, ongoing/completed sessions, learners, certificates distributed and pending,
  volunteers, online-enabled centres, enrollment requests.
- **India map** showing every centre. Pin size = number of sessions; pin colour = delivery mode
  (in-centre / hybrid / online). Faded pins are approximate (plotted at the state centroid because
  the centre has not entered exact coordinates yet).
  - **Street map** mode uses OpenStreetMap tiles (needs internet).
  - **Schematic** mode is a built-in offline outline — works with no internet at all.
- Zone leaderboard, top states, certificate-readiness panel, recent sessions, important news and the
  online program strip.

### 2. Important News band
Admins publish announcements (Admin → Announcements). Anything **pinned**, or marked
*success*/*critical*, appears in the fixed **Important News** band under the header on every page —
e.g. *"Certificates printed and ready — collect them from the zonal office."*

The band is static (nothing scrolls away), shows the headline **and** the full message, and pages
through items with ‹ / › plus a `1 / 3` counter. **All news** opens every current notice in a modal.
The same notices are repeated in full in the 📰 *Important news* section of the home page.

### 3. Logins
| Role | How they get an account | What they can do |
|---|---|---|
| **Administrator** | Seeded; can create more admins | Everything, across all centres |
| **Centre coordinator** | Self-registers at `#/register`, then an admin approves | Only their own centre, its sessions, reflections and enrollment requests |

Pending accounts cannot sign in until approved. Admins can flip
**Settings → Auto-approve new coordinators** to skip approval.

### 4. Centre directory
Each centre records:
- Name, auto-generated code, status, delivery mode, capacity, weekly schedule, facilities,
  established date
- Full address (line 1/2, city, district, **state**, pincode) and optional exact lat/lng
- **Zone and state are chosen together** with a linked picker (see *Zones* below)
- Coordination team — **Centre coordinator, Trainer lead, Centre secretary, Zone in-charge**, each
  with name, email and phone
- A **primary contact** phone/email for the public
- An unlimited **volunteer** roster (name, role, phone, email)
- Which online programs the centre promotes

Public visitors see the centre, its address and the coordinator's *name*. Phone numbers, emails and
the volunteer roster stay private unless the admin enables
**Settings → Show contact details publicly**.

### 5. The 12 national zones
Every centre belongs to one of the **12 numbered CTP zones**:

| Zone | States / UTs |
|---|---|
| Zone 1 | Delhi |
| Zone 2 | Punjab, Himachal Pradesh, Jammu & Kashmir |
| Zone 3 | Haryana |
| Zone 4 | Madhya Pradesh, Chhattisgarh |
| Zone 5 | Uttar Pradesh (North West), Uttarakhand |
| Zone 6 | Uttar Pradesh (East) |
| Zone 7 | Rajasthan |
| Zone 8 | Maharashtra, Goa |
| Zone 9 | Andhra Pradesh, Karnataka, Kerala, Odisha, Tamil Nadu |
| Zone 10 | Bihar, Jharkhand, West Bengal |
| Zone 11 | Uttar Pradesh (South East) |
| Zone 12 | Gujarat |

**Linked Zone + State picker.** Registration, the centre form and the admin assign dialog all use
the same control:

- Pick a **zone** and the **state** list narrows to that zone's states.
- Pick a **state** that belongs to exactly one zone (e.g. *Kerala*) and the **zone fills in
  automatically**.
- **Uttar Pradesh spans Zone 5, Zone 6 and Zone 11**, so choose the zone first — the picker warns
  you and the three UP zones map to three separate pins.
- States and UTs outside the published table (e.g. *Assam*) stay selectable under **"Zone not
  assigned"**; they are listed on the home page, filterable in the directory via
  **⚠ Zone not assigned**, and flagged to admins.
- A collapsible **"Show the 12-zone reference table"** sits next to the picker.

**Manual assignment.** Admin → Centres shows a banner listing every centre with no zone and an
**⚠ Assign** button. The dialog lets an administrator place a centre in any zone *even when its
state is outside that zone's published list* — the state is preserved under *"Manually assigned to
this zone"* and the picker explains that it is a manual override.

**HQ Zone Coordinators.** **Admin → Zones** lists all 12 zones with their states, live centre /
session / learner / certificate counts and a **headquarters zone coordinator** (name, designation,
phone, email, notes) that admins can edit inline and export to CSV. The HQ coordinator is shown on
every centre page (🏛️ *Headquarters zone coordinator*) and on every enrollment confirmation, under
the same privacy rule as other contacts.

### 6. Sessions and the reflection tab
A centre logs each training batch: title, batch code, program, trainer, dates, schedule, class
count, learners enrolled/completed.

Status flows **planned → ongoing → completed** (or cancelled).

- While a session is *planned* or *ongoing*, the **Reflection** tab is locked (🔒) — nothing to
  record yet.
- The moment it is marked **completed**, Reflection unlocks:
  - certificates **printed** and **distributed**, distribution date and mode
  - average feedback score (0–5)
  - highlights, challenges, next steps
  - **upload the certificate sheet** (`.xlsx`, `.xls`, `.csv`, `.pdf`, max 10 MB)

Uploaded spreadsheets are parsed server-side: the app shows the row count, the detected columns and
a 20-row preview, and pre-fills "certificates printed" from the row count. Files can be previewed,
downloaded or deleted.

The gap between printed and distributed is surfaced as **pending distribution** on the home page,
the dashboard and the zone tables.

### 7. Online programs with admin-controlled buttons
Seeded: **Online Advanced Excel**, **Online Power BI**, **Online AI Bootcamp**,
**Online Python & Vibe Coding**, plus the centre-based **Basic Computer Training Program**.

In **Admin → Programs** an administrator can, per program, set the:
- enrollment **hyperlink** (e.g. a Microsoft Form or Google Form)
- **button label**
- **button background colour** and **text colour**, with a live preview
- icon, level, delivery mode, duration, seats, next batch date, display order
- published / hidden state

Leave the hyperlink blank and the button uses the app's own built-in enrollment form instead.
`javascript:` and other unsafe URLs are rejected.

### 8. Public enrollment
`#/enroll` — pick *centre-based* or *online*, choose the program, pick your state and the app
filters to the centres in that state.

On submit the applicant immediately gets a confirmation card with a **reference number** plus the
**centre name, full address, coordinator name, primary contact phone/email, zone and zone in-charge,
the HQ zone coordinator, and the usual class timings** — printable / saveable as PDF.

The request lands in the coordinator's dashboard and in Admin → Enrollments, where it can be moved
through *new → contacted → enrolled / declined*.

### 9. Extras
- Light and dark themes (🌙 in the header)
- CSV export for centres, sessions and enrollments
- One-click JSON backup (passwords stripped)
- Activity log of every change
- Demo dataset: 16 centres spread across the 12 zones (plus one deliberately unzoned centre in
  Assam) with sessions, reflections and certificates — load or clear it from **Admin → Overview**
- Printable centre pages and enrollment confirmations
- Keyboard-accessible, responsive down to phone width

---

## Project layout

```
CTP-Zonal-Coordination/
├── server.js              Express entry point
├── server/
│   ├── config.js          port, paths, limits, default admin
│   ├── store.js           JSON persistence (atomic writes + backups)
│   ├── seed.js            first-run data and password hashing
│   ├── auth.js            scrypt passwords, cookie sessions
│   ├── models.js          validation / normalisation / public projections
│   ├── geo.js             36 states & UTs, the 12 zones, centroids
│   ├── demo.js            demo dataset install / clear
│   ├── reset.js           npm run reset
│   └── routes/            auth, centres, sessions, programs, zones,
│                          enrollments, notices, meta, admin
├── public/
│   ├── index.html         single-page shell
│   ├── css/styles.css     design system (light + dark)
│   └── js/
│       ├── core.js        hyperscript, API client, router, modals, toasts
│       ├── map.js         India map (Leaflet tiles + offline schematic)
│       ├── zones.js       12-zone helpers, linked Zone+State picker
│       ├── app.js         bootstrap, session, Important News band, routes
│       └── pages/         home, directory, programs, enroll,
│                          account, dashboard, sessions, admin
├── data/                  ctp-data.json  (your live data)  + backups/
├── uploads/               certificate sheets
├── render.yaml            Render deployment blueprint (with persistent disk)
├── .env.example           every supported environment variable
├── DEPLOYMENT.md          Azure / Render / Google Sites hosting guide
├── LICENSE                MIT
└── smoke-test.ps1         123-assertion end-to-end test
```

---

## Data, backup and reset

Everything lives in **`data/ctp-data.json`**; uploaded certificate sheets live in **`uploads/`**.
Writes are atomic (temp file + rename) and serialised, so the file is never left half-written.

| Task | How |
|---|---|
| Back up | Admin → **⬇ Backup**, or just copy `data/` and `uploads/` |
| Restore | Stop the server, put the file back as `data/ctp-data.json`, start again |
| Start over | `npm run reset` (the old file is moved to `data/backups/` first) |

A corrupt `data/ctp-data.json` is automatically quarantined into `data/backups/` and re-seeded, so
the app always starts.

---

## Testing

```powershell
.\smoke-test.ps1
```

Starts nothing — run it while `npm start` is running. It exercises 123 assertions across health,
auth, approval flow, centre editing, permission scoping, the 12-zone model, HQ zone coordinators and
manual zone assignment, the full session lifecycle, reflection gating, certificate
upload/parse/download, public enrollment, program buttons, announcements, CSV exports, settings and
sign-out.

---

## Hosting it online

**See [`DEPLOYMENT.md`](DEPLOYMENT.md) for complete, step-by-step instructions.**

Short version:

- **Google Sites cannot host this app** — it is a static page builder with no server, no filesystem
  and no way to run Node. Use it as a landing page that *links* to the live app instead.
- Recommended hosts: **Azure App Service** (persistent `/home`, ~₹1,000/mo) or **Render**
  (`render.yaml` blueprint included; needs a paid disk for durable data).
- Set `NODE_ENV=production`, point `CTP_DATA_DIR` / `CTP_UPLOAD_DIR` at a **persistent disk**, and
  change `CTP_ADMIN_PASSWORD`. See [`.env.example`](.env.example) for every variable.
- `PORT` is injected by the host and takes precedence over `CTP_PORT`; in production the app binds
  `0.0.0.0` and sets `Secure` on the session cookie automatically.
- If you later outgrow the JSON file, `server/store.js` is the single place that touches storage —
  swap it for SQLite or Postgres without changing any route.

---

## Notes

- Map tiles come from OpenStreetMap and need internet. The **Schematic** mode is fully offline.
- The schematic outline is **indicative only** and is not an authoritative depiction of boundaries.
- Centres without exact coordinates are plotted at their state centroid and drawn faded.

---

## License

Released under the [MIT License](LICENSE) — free to use, modify and redistribute, including
commercially, provided the copyright notice is retained.

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
[Leaflet](https://leafletjs.com/) is BSD-2-Clause.
