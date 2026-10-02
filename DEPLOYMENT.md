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

Both hosts below deploy from GitHub.

```powershell
cd C:\Users\sahilsharma\Projects\CTP-Zonal-Coordination
git init
git add .
git commit -m "CTP Zonal Coordination portal"
gh repo create ctp-zonal-coordination --private --source . --push
```

`.gitignore` already excludes `node_modules/`, `data/*.json`, `data/backups/`, `uploads/` and
`.env`, so **no live data or credentials are committed**.

### 2. Understand the storage rule

The app keeps everything in two folders:

- `data/ctp-data.json` — every centre, session, user and notice
- `uploads/` — the certificate spreadsheets

On both hosts the application folder is **wiped on every deploy and restart**. You must point the
app at a persistent disk using these environment variables, or you will lose all your data:

| Variable | Purpose |
|---|---|
| `CTP_DATA_DIR` | Where `ctp-data.json` and `backups/` live |
| `CTP_UPLOAD_DIR` | Where uploaded certificate sheets live |

### 3. Environment variables

See `.env.example` for the full list. The ones that matter in production:

| Variable | Set it to | Why |
|---|---|---|
| `NODE_ENV` | `production` | Masks internal errors, binds `0.0.0.0`, turns on `Secure` cookies |
| `CTP_DATA_DIR` | a path on the persistent disk | Survives restarts |
| `CTP_UPLOAD_DIR` | a path on the persistent disk | Survives restarts |
| `CTP_ADMIN_EMAIL` | your real admin address | Seeds the first admin account |
| `CTP_ADMIN_PASSWORD` | a strong password | Seeds the first admin. **Never left at a default** — see below |

> **About the admin password.** The source is public, so there is deliberately *no* usable default
> in production. `Ctp@2026` only applies when `NODE_ENV` is not `production`. If you deploy without
> setting `CTP_ADMIN_PASSWORD`, the app generates a random one and prints it **once** to the startup
> log — read it from the host's log stream, sign in, and change it.

`PORT` is injected by the host automatically — do not set it yourself.

---

## Option A — Azure App Service

Best fit if you are already in the Microsoft ecosystem. `/home` is a persistent, backed-up share, so
you get durable storage with no extra add-on.

**Cost:** the B1 plan is roughly ₹1,000 / month. The F1 free plan technically runs but sleeps, has a
60-minute daily CPU quota and is not suitable for a real portal.

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

## Option B — Render

The quickest route. `render.yaml` in this repo is a ready-made blueprint.

**Cost:** the free plan works for a demo but **has no disk** — the database resets on every restart
and free services sleep after 15 minutes of inactivity. For real use pick the **Starter** instance
(~$7/month) plus a **1 GB disk** (~$0.25/month).

### Steps

1. Sign up at [render.com](https://render.com) and connect your GitHub account.
2. Click **New → Blueprint** and select your repository. Render reads `render.yaml` and proposes a
   web service with a 1 GB disk mounted at `/var/ctp`.
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
- [ ] `CTP_DATA_DIR` and `CTP_UPLOAD_DIR` point at a persistent disk
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
| Netlify / Vercel (static) | No long-running server or writable disk |
| Google Cloud Run / AWS Lambda | Filesystem is ephemeral and per-instance — the JSON store would be lost or diverge between instances |

The last row is fixable, but only by replacing the JSON file store with a real database.
