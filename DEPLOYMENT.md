# Hosting the CTP Zonal Coordination portal

This app is a **Node.js + Express server**, not a static website. It needs a running process to
handle logins, sessions, file uploads and the JSON database.

---

## Can I use Google Sites?

**No — Google Sites cannot host this app.** It is a static page builder:

| What the app needs | Google Sites |
|---|---|
| Run Node.js / Express | ✗ No server of any kind |
| Store `data/ctp-data.json` | ✗ No filesystem |
| Accept certificate uploads | ✗ Not possible |
| Serve `/js/*.js`, `/css/*.css` | ✗ You cannot upload code files |
| Session cookies for login | ✗ No server to issue them |

**Embedding it in a Sites iframe also fails.** The session cookie is `SameSite=Lax`, which browsers
refuse to send inside a cross-site frame, so nobody could sign in. Google Sites also strips and
sandboxes embedded code.

### What you *can* do with Google Sites

Use it as a **public front door**: a nice `sites.google.com` landing page with a button that opens
the real app in a new tab. See [Google Sites landing page](#google-sites-landing-page) below.

---

## Before you deploy

### 1. Put the project in a GitHub repository

Both hosts below deploy from GitHub. If the repository does not exist yet:

```powershell
cd C:\Users\sahilsharma\Projects\CTP-Zonal-Coordination
git init -b main
git add .
git commit -m "CTP Zonal Coordination portal"
gh repo create ctp-zonal-coordination --public --source . --push
```

`.gitignore` already excludes `node_modules/`, `data/*.json`, `data/backups/`, `uploads/` and
`.env`, so **no live data or credentials are committed**.

### 2. Choose where the data lives

The app keeps its entire database as **one JSON document**, plus the uploaded certificate
spreadsheets. There are two ways to persist that, and picking the right one is the single most
important deployment decision:

| Mode | When to use it | How |
|---|---|---|
| **File** (default) | Any host with a real disk or a mounted volume | Leave `DATABASE_URL` unset, point `CTP_DATA_DIR` / `CTP_UPLOAD_DIR` at the persistent path |
| **Postgres** | Any host with an **ephemeral filesystem** | Set `DATABASE_URL` — the directory, logins *and* uploaded sheets all move into the database |

> **The rule:** if the host wipes the filesystem when the app restarts — which includes Render's
> free plan, Cloud Run, Vercel and Fly machines without a volume — you **must** set `DATABASE_URL`.
> Otherwise every restart silently resets the portal to demo data.

In Postgres mode the app creates three tables on first boot: `ctp_state` (the document),
`ctp_blobs` (uploaded files) and `ctp_backups` (snapshots taken before destructive operations).
No migration step is needed.

### 3. Environment variables

See `.env.example` for the full list. The ones that matter in production:

| Variable | Set it to | Why |
|---|---|---|
| `NODE_ENV` | `production` | Masks internal errors, binds `0.0.0.0`, turns on `Secure` cookies |
| `DATABASE_URL` | a Postgres connection string | **Required on any host without a persistent disk** |
| `CTP_DATA_DIR` | a path on the persistent disk | File mode only — ignored when `DATABASE_URL` is set |
| `CTP_UPLOAD_DIR` | a path on the persistent disk | File mode only — ignored when `DATABASE_URL` is set |
| `CTP_ADMIN_EMAIL` | your real admin address | Seeds the first admin account |
| `CTP_ADMIN_PASSWORD` | a strong password | Seeds the first admin. **Never left at a default** — see below |

> **About the admin password.** The source is public, so there is deliberately *no* usable default
> in production. `Ctp@2026` only applies when `NODE_ENV` is not `production`. If you deploy without
> setting `CTP_ADMIN_PASSWORD`, the app generates a random one and prints it **once** to the startup
> log — read it from the host's log stream, sign in, and change it.
>
> It only ever applies **while the database is being seeded**. Once the admin account exists, the
> stored password governs and `CTP_ADMIN_PASSWORD` is ignored, so editing it in the dashboard later
> changes nothing — the startup banner will say the account already exists. To rotate it, sign in
> and change it from **Account**; if it has been lost, run the recovery command below.
>
> **Locked out?** Passwords are stored as salted scrypt hashes and cannot be read back, only
> replaced. From a machine with `DATABASE_URL` set to the same database:
>
> ```bash
> npm run set-admin-password            # prompts; nothing is echoed or kept in shell history
> npm run set-admin-password -- you@org.org
> ```
>
> It snapshots the database first, changes only that one account, and leaves centres, sessions and
> uploads untouched. A hosted instance caches the database in memory, so **restart the service
> afterwards** for the change to take effect.
>
> Take care pasting `CTP_ADMIN_EMAIL` into a hosting dashboard — a trailing space used to be stored
> as part of the address, which made every sign-in attempt fail regardless of the password. The app
> now trims it on seed, on load and on lookup.

`PORT` is injected by the host automatically — do not set it yourself.

---

## Which host? A cost comparison

| Host | Monthly cost | Persistent data | Custom domain | Catch |
|---|---|---|---|---|
| **Render free + Neon Postgres** | **₹0** | ✅ in Postgres | ✗ | Sleeps after 15 min idle (~50 s first load) |
| Azure App Service **F1 free** | **₹0** | ✅ `/home` | ✗ | 60 CPU-min/day; needs a pay-as-you-go account after 30 days |
| Render Starter + disk | ~$7 | ✅ on disk | ✅ | — |
| Azure App Service **B1** | ~₹1,000 | ✅ `/home` | ✅ | — |

**Render free + Neon is the only option that costs nothing and never asks for a card.** It is the
recommended starting point; you can move to a paid plan later without changing any code.

> **Careful with "free" Azure.** An Azure free account is disabled after its 30-day credit expires
> unless you convert it to pay-as-you-go. The F1 tier itself stays free forever, but you end up with
> a live billing account and a card on file.

---

## Option A — Render free + Neon Postgres (₹0)

Render's free plan runs the Node server; Neon stores the data. Neither needs a credit card, and
neither expires. `render.yaml` in this repo is already configured for exactly this.

**Limits to know:** the service sleeps after 15 minutes of inactivity, so the first visit afterwards
takes roughly 30–60 seconds to load. Neon's free database allows 0.5 GB, which is far more than the
directory needs — the practical limit is uploaded certificate sheets, at up to 10 MB each.

### 1. Create the database

1. Go to [neon.com](https://neon.com) and sign up — **Continue with GitHub** is quickest.
2. Create a project named `ctp-zonal-coordination` in region **AWS ap-southeast-1 (Singapore)**.
3. On the dashboard, copy the **Connection string** with **Pooled connection** switched on. It looks
   like `postgresql://user:password@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.

Keep that string secret — it grants full access to the database.

### 2. Test it locally first

```powershell
cd C:\Users\sahilsharma\Projects\CTP-Zonal-Coordination
Copy-Item .env.example .env       # .env is git-ignored
notepad .env                      # paste the string into DATABASE_URL, save
npm run local
```

The banner should print `Storage: Postgres (DATABASE_URL)`. Visit <http://127.0.0.1:5090>, add a
centre, stop the server, start it again — the centre should still be there.

### 3. Deploy

1. Sign up at [render.com](https://render.com) with the same GitHub account.
2. **New → Blueprint**, select the repository. Render reads `render.yaml`.
3. Fill in the values it asks for:
   - `DATABASE_URL` — the Neon string from step 1
   - `CTP_ADMIN_EMAIL` — your admin address
   - `CTP_ADMIN_PASSWORD` — a strong password (leave blank and a random one is printed to the log)
4. **Apply**. The build runs `npm ci`, then `npm start`.
5. Open `https://ctp-zonal-coordination.onrender.com`. HTTPS is automatic.

### 4. Confirm the data really survives

This is the whole point of the exercise, so verify it:

1. Sign in and add a centre.
2. Render dashboard → **Manual Deploy → Clear build cache & deploy**.
3. When it comes back, the centre is still listed.

### Redeploying

Push to your default branch — Render rebuilds automatically.

### Keeping it awake (optional)

A free [UptimeRobot](https://uptimerobot.com) monitor pinging `/api/health` every 5 minutes keeps
the service warm during the day and removes the cold start for visitors.

---

## Option B — Azure App Service

Best fit if you are already in the Microsoft ecosystem. `/home` is a persistent, backed-up share, so
you get durable storage with no extra add-on.

**Cost:** the B1 plan is roughly ₹1,000 / month and supports a custom domain. The **F1 free** plan
also works — `/home` is persistent on every tier — but it is capped at 60 CPU-minutes per day, has
no SLA and no custom domain, and an Azure free account must be converted to pay-as-you-go once its
30-day credit expires or the app is switched off.

### Steps

1. **Install the Azure CLI** and sign in:

   ```powershell
   winget install Microsoft.AzureCLI
   az login
   ```

2. **Create and deploy in one command** from the project folder:

   ```powershell
   cd C:\Users\sahilsharma\Projects\CTP-Zonal-Coordination
   az webapp up `
     --name ctp-zonal-coordination `
     --resource-group ctp-rg `
     --location centralindia `
     --runtime "NODE:20-lts" `
     --sku B1
   ```

   The name must be globally unique — you get `https://ctp-zonal-coordination.azurewebsites.net`.

3. **Set the application settings:**

   ```powershell
   az webapp config appsettings set `
     --name ctp-zonal-coordination --resource-group ctp-rg `
     --settings `
       NODE_ENV=production `
       CTP_DATA_DIR=/home/ctp/data `
       CTP_UPLOAD_DIR=/home/ctp/uploads `
       CTP_ADMIN_EMAIL=you@yourdomain.org `
       CTP_ADMIN_PASSWORD='<a-strong-password>' `
       SCM_DO_BUILD_DURING_DEPLOYMENT=true
   ```

   `/home` is the persistent share — anything written there survives restarts and redeploys.

4. **Set the startup command:**

   ```powershell
   az webapp config set --name ctp-zonal-coordination --resource-group ctp-rg `
     --startup-file "npm start"
   ```

5. **Force HTTPS** and restart:

   ```powershell
   az webapp update --name ctp-zonal-coordination --resource-group ctp-rg --https-only true
   az webapp restart --name ctp-zonal-coordination --resource-group ctp-rg
   ```

6. **Open it** at `https://ctp-zonal-coordination.azurewebsites.net`, sign in with the admin
   credentials you set, and change the password.

### Redeploying after changes

```powershell
az webapp up --name ctp-zonal-coordination --resource-group ctp-rg
```

### Backing up

Admin → **⬇ Backup** downloads the JSON. For the files on the server:

```powershell
az webapp ssh --name ctp-zonal-coordination --resource-group ctp-rg
# then inside:  ls -la /home/ctp/data /home/ctp/uploads
```

---

## Option C — Render on a paid plan (with a disk)

If you would rather keep the simple JSON-file storage and avoid Postgres entirely, pay for a
**Starter** instance (~$7/month) plus a **1 GB disk** (~$0.25/month). This also removes the
15-minute sleep.

To do this, edit `render.yaml`: change `plan: free` to `plan: starter`, drop `DATABASE_URL`, and add

```yaml
    disk:
      name: ctp-storage
      mountPath: /var/ctp
      sizeGB: 1
    envVars:
      - key: CTP_DATA_DIR
        value: /var/ctp/data
      - key: CTP_UPLOAD_DIR
        value: /var/ctp/uploads
```

### Steps

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. Click **New → Blueprint** and select your repository.
3. When prompted, fill in the two secret values:
   - `CTP_ADMIN_EMAIL` — your admin address
   - `CTP_ADMIN_PASSWORD` — a strong password
4. Click **Apply**. The first build runs `npm ci`, then `npm start`.
5. Render gives you `https://ctp-zonal-coordination.onrender.com`. HTTPS is automatic.

Health checks hit `/api/health`, which the app already serves.

### If you prefer the dashboard over the blueprint

Create a **Web Service** with:

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Disk | mount at `/var/ctp`, 1 GB |
| Env vars | `NODE_ENV=production`, `CTP_DATA_DIR=/var/ctp/data`, `CTP_UPLOAD_DIR=/var/ctp/uploads`, plus the two admin values |

### Redeploying

Push to your default branch — Render rebuilds automatically.

---

## Google Sites landing page

Once the app is live, use Google Sites for a friendly public page in front of it.

1. Go to [sites.google.com](https://sites.google.com) and click **Blank**.
2. Name it **Computer Training Program**.
3. Add a heading and a short description of the program.
4. **Insert → Button**:
   - *Name:* `Open the CTP Portal`
   - *Link:* your live URL, e.g. `https://ctp-zonal-coordination.azurewebsites.net`
5. Add more buttons that deep-link into the app:

   | Button | Link |
   |---|---|
   | Find a centre | `https://<your-app>/#/centres` |
   | Enroll in a program | `https://<your-app>/#/enroll` |
   | Online programs | `https://<your-app>/#/programs` |
   | Coordinator login | `https://<your-app>/#/login` |

6. Click **Publish**, choose a web address, and set *who can view* to **Anyone**.

### Why not embed it instead?

You can technically paste the URL into **Insert → Embed**, and the public pages will render. But
**anyone trying to sign in will fail**, because the session cookie is `SameSite=Lax` and browsers
block it inside a cross-site iframe. Linking out in a new tab avoids the problem entirely.

> If you ever genuinely need the app to work inside an iframe, the session cookie must become
> `SameSite=None; Secure` in `server/auth.js`. That weakens CSRF protection, so only do it with a
> deliberate decision.

---

## Custom domain

Both hosts support one, with a free managed certificate.

- **Azure:** App Service → *Custom domains* → *Add*, then create the `CNAME` and `TXT` records your
  registrar asks for, and bind a **managed certificate**.
- **Render:** Service → *Settings → Custom domains* → *Add*, then add the `CNAME` it shows you.

Point `ctp.yourdomain.org` at the app, and link to that from Google Sites instead of the
`azurewebsites.net` / `onrender.com` address.

---

## Production checklist

- [ ] `CTP_ADMIN_PASSWORD` set explicitly to a strong value (never the dev default `Ctp@2026`)
- [ ] `NODE_ENV=production` set
- [ ] Storage chosen deliberately: **either** `DATABASE_URL` **or** `CTP_DATA_DIR` + `CTP_UPLOAD_DIR` on a real disk
- [ ] **Verified data survives a redeploy** — add a centre, redeploy, confirm it is still there
- [ ] HTTPS enforced (Azure: `--https-only true`; Render: on by default)
- [ ] Signed in once and changed the admin password in the UI
- [ ] Demo data cleared via **Admin → Overview → Clear demo data** before going live
- [ ] A backup downloaded and stored somewhere safe (Admin → **⬇ Backup**)
- [ ] Decided whether **Settings → Show contact details publicly** should be on

---

## Hosts that will *not* work

| Host | Why |
|---|---|
| Google Sites | Static page builder, no server |
| GitHub Pages | Static files only |
| Netlify / Vercel (static hosting) | No long-running server process |

Hosts with an **ephemeral filesystem** — Render free, Google Cloud Run, Vercel functions, Fly
machines without a volume — *do* work, but only with `DATABASE_URL` set. Without it they will
appear to work and then quietly lose every change when the instance restarts.
