import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { init, listResponses, insertResponse, updateStatus } from "./db.js";
import { checkPassword, issueCookie, clearCookie, requireApiAuth, requirePageAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1); // Railway sits behind a proxy (needed for secure cookies)

// security headers. CSP allows the inline page scripts/styles these pages use,
// the Google Fonts stylesheet, and same-origin API calls only.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// rate limiters: throttle brute-force on login and spam on the public form
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many submissions. Please try again later." },
});

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// public static assets (brand.css only — no protected content here)
app.use("/assets", express.static(path.join(__dirname, "public", "assets")));

const send = (file) => (req, res) => res.sendFile(path.join(__dirname, "public", file));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------- public pages ----------
app.get("/", send("form.html"));
app.get("/login", send("login.html"));
app.get("/healthz", (req, res) => res.send("ok"));

// ---------- public submit ----------
app.post("/api/submit", submitLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot: silently drop bots
    if (!String(b.q4 || "").trim() || !String(b.name || "").trim() || !String(b.phone || "").trim()) {
      return res.status(400).json({ error: "Name, phone and your problem are required." });
    }
    const entry = {
      id: uid(),
      createdAt: new Date().toISOString(),
      status: "New",
      q1: b.q1 || "", q2: b.q2 || "", q3: b.q3 || [], q4: String(b.q4).slice(0, 5000),
      q5: b.q5 || [], q6: b.q6 || "", q7: b.q7 || [], q8: b.q8 || [],
      name: String(b.name).slice(0, 200), phone: String(b.phone).slice(0, 60),
    };
    await insertResponse(entry);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------- auth ----------
app.post("/api/login", loginLimiter, (req, res) => {
  if (checkPassword(req.body?.password)) { issueCookie(res); return res.json({ ok: true }); }
  res.status(401).json({ error: "Incorrect password." });
});
app.post("/api/logout", (req, res) => { clearCookie(res); res.json({ ok: true }); });

// ---------- secured dashboard ----------
app.get("/dashboard", requirePageAuth, send("dashboard.html"));

app.get("/api/responses", requireApiAuth, async (req, res) => {
  try { res.json(await listResponses()); }
  catch (e) { console.error(e); res.status(500).json({ error: "load failed" }); }
});

app.post("/api/responses/:id/status", requireApiAuth, async (req, res) => {
  const allowed = ["New", "In Review", "In Progress", "Completed"];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: "bad status" });
  try { await updateStatus(req.params.id, req.body.status); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "update failed" }); }
});

init()
  .then(() => app.listen(PORT, () => console.log(`BizDoc portal running on :${PORT}`)))
  .catch((e) => { console.error("Startup failed:", e); process.exit(1); });
