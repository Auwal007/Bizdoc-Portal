// Storage layer.
// If DATABASE_URL is set (Railway Postgres) -> Postgres.
// Otherwise -> local JSON file (for local testing only; not persistent on Railway).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const usePg = !!process.env.DATABASE_URL;

let pool = null;

// ---- fields that live inside the JSON "data" column ----
const DATA_FIELDS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "name", "phone"];

function splitEntry(entry) {
  const data = {};
  for (const k of DATA_FIELDS) data[k] = entry[k] ?? (Array.isArray(entry[k]) ? [] : "");
  return { id: entry.id, created_at: entry.createdAt, status: entry.status, data };
}
function mergeRow(row) {
  const d = typeof row.data === "string" ? JSON.parse(row.data) : row.data || {};
  return { id: row.id, createdAt: row.created_at, status: row.status, ...d };
}

// ---------------- Postgres ----------------
async function initPg() {
  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS responses (
      id          TEXT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      status      TEXT NOT NULL DEFAULT 'New',
      data        JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);
}

// ---------------- JSON file ----------------
const FILE = path.join(__dirname, "public", "data", "responses.json");
function readFile() {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function writeFile(arr) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
}

// ---------------- public API ----------------
export async function init() {
  if (usePg) { await initPg(); console.log("[db] using Postgres"); }
  else { console.log("[db] using local JSON file (ephemeral). Add a Postgres DATABASE_URL for persistence."); }
}

export async function listResponses() {
  if (usePg) {
    const { rows } = await pool.query("SELECT * FROM responses ORDER BY created_at DESC");
    return rows.map(mergeRow);
  }
  return readFile().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function insertResponse(entry) {
  if (usePg) {
    const r = splitEntry(entry);
    await pool.query(
      "INSERT INTO responses (id, created_at, status, data) VALUES ($1,$2,$3,$4)",
      [r.id, r.created_at, r.status, r.data]
    );
    return entry;
  }
  const arr = readFile();
  arr.push(entry);
  writeFile(arr);
  return entry;
}

export async function updateStatus(id, status) {
  if (usePg) {
    await pool.query("UPDATE responses SET status=$1 WHERE id=$2", [status, id]);
    return true;
  }
  const arr = readFile();
  const i = arr.findIndex((x) => x.id === id);
  if (i >= 0) { arr[i].status = status; writeFile(arr); }
  return i >= 0;
}
