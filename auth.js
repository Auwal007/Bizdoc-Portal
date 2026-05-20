import jwt from "jsonwebtoken";

const COOKIE = "bd_session";
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
const PASSWORD = process.env.DASHBOARD_PASSWORD || "changeme";
const isProd = process.env.NODE_ENV === "production";

if (isProd && SECRET === "dev-only-insecure-secret-change-me") {
  console.warn("[auth] WARNING: SESSION_SECRET is not set. Set it in Railway variables.");
}
if (isProd && PASSWORD === "changeme") {
  console.warn("[auth] WARNING: DASHBOARD_PASSWORD is the default. Set it in Railway variables.");
}

export function checkPassword(input) {
  // constant-time-ish compare
  if (typeof input !== "string" || input.length !== PASSWORD.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ PASSWORD.charCodeAt(i);
  return diff === 0;
}

export function issueCookie(res) {
  const token = jwt.sign({ role: "team" }, SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function valid(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return false;
  try { jwt.verify(token, SECRET); return true; } catch { return false; }
}

// For API routes -> 401 JSON
export function requireApiAuth(req, res, next) {
  if (valid(req)) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// For page routes -> redirect to /login
export function requirePageAuth(req, res, next) {
  if (valid(req)) return next();
  return res.redirect("/login");
}
