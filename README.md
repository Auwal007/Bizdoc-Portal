# BizDoc Client Portal

A small, self-contained app for **Hamzury Business Institute — BizDoc**:

- **Public form** at `/` — "Your Business Roadmap" (the 10-question intake).
- **Secured dashboard** at `/dashboard` — password-protected, where your team views and manages client responses.

No build step. One Node/Express server. Responses are stored in Postgres.

---

## What "secured" means here

- The dashboard page and its data API (`/api/responses`) require a valid login.
- Login is a single shared **team password** (you set it). On success the server issues a **signed, httpOnly cookie** that lasts 7 days. httpOnly means browser scripts can't read it; signed means it can't be forged without your secret.
- Cookies are sent only over HTTPS in production (Railway gives you HTTPS automatically).
- The public form can submit, but cannot read any responses.

This is right for a small team behind one shared password. If you later need individual logins per staff member, that's a straightforward extension — ask and I'll add it.

**Also hardened:**
- **Brute-force protection** — login is rate-limited to 10 attempts per 15 min per IP; the public form to 30 submissions/hour per IP.
- **Security headers** via Helmet — Content-Security-Policy, HSTS, anti-clickjacking (`X-Frame-Options`), and MIME-sniffing protection.
- **XSS-safe dashboard** — every client-entered value is HTML-escaped before display.
- A hidden honeypot field quietly drops spam bots.

---

## Deploy to Railway (step by step)

1. **Put this folder in a GitHub repo** (or use the Railway CLI). Easiest: create a new repo, upload these files, commit.

2. Go to **railway.app → New Project → Deploy from GitHub repo**, and pick the repo. Railway auto-detects Node and runs `npm start`.

3. **Add a database:** in the same project click **New → Database → Add PostgreSQL**. Railway creates it and exposes a `DATABASE_URL`.

4. **Connect the database to the app:** open your app service → **Variables** → **New Variable** → add:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`  *(Railway's reference syntax — pick it from the dropdown)*

5. **Add your other variables** (same Variables tab):
   - `DASHBOARD_PASSWORD` = the password your team will use
   - `SESSION_SECRET` = a long random string. Generate one locally with:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `NODE_ENV` = `production`

6. **Deploy.** When it's live, Railway gives you a public URL (Settings → Networking → Generate Domain).
   - Form: `https://YOUR-APP.up.railway.app/`
   - Dashboard: `https://YOUR-APP.up.railway.app/dashboard` (you'll be asked for the password)

The `responses` table is created automatically on first start. Done.

---

## Run locally (optional, to preview)

```
npm install
npm start
```

Visit `http://localhost:3000`. Without a `DATABASE_URL` it saves to a local JSON file
(`public/data/responses.json`) — fine for testing, but **not** for production. The default
local password is `changeme` until you set `DASHBOARD_PASSWORD`.

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express routes (form, submit, login, dashboard, responses API) |
| `auth.js` | Password check, signed cookie, route guards |
| `db.js` | Postgres storage (JSON-file fallback for local) |
| `public/form.html` | The public intake form |
| `public/dashboard.html` | The secured dashboard |
| `public/login.html` | Password gate |
| `public/assets/brand.css` | BizDoc brand styles |

## Notes
- A hidden honeypot field quietly drops spam bots.
- To change the form questions, edit `public/form.html` (`OPTS` for checkbox groups) and the
  `Q_META` labels in `public/dashboard.html` so the dashboard labels match.
