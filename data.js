// Data layer: Supabase REST if configured, else localStorage (demo mode).
// No external SDK dependency — uses fetch against PostgREST.
const cfg = window.MAHMONEY_CONFIG || {};
const hasSupabaseCfg = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const MODE = hasSupabaseCfg ? "supabase" : "local";
export const CURRENCY = cfg.CURRENCY || "₹";

const LS_PREFIX = "mahmoney_";
function lsKey(table) { return LS_PREFIX + table; }
function lsRead(table) {
  try { return JSON.parse(localStorage.getItem(lsKey(table)) || "[]"); }
  catch { return []; }
}
function lsWrite(table, rows) { localStorage.setItem(lsKey(table), JSON.stringify(rows)); }
function genId() { return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36); }

function sbHeaders(extra = {}) {
  return {
    "apikey": cfg.SUPABASE_ANON_KEY,
    "Authorization": "Bearer " + cfg.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    ...extra,
  };
}
function sbUrl(table, query = "") {
  return cfg.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + query;
}

async function sbList(table) {
  const r = await fetch(sbUrl(table, "?select=*&order=created_at.desc"), { headers: sbHeaders() });
  if (!r.ok) throw new Error("Supabase list failed: " + r.status + " " + await r.text());
  return r.json();
}
async function sbInsert(table, payload) {
  const r = await fetch(sbUrl(table), {
    method: "POST",
    headers: sbHeaders({ "Prefer": "return=representation" }),
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("Supabase insert failed: " + r.status + " " + await r.text());
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}
async function sbUpdate(table, id, patch) {
  const r = await fetch(sbUrl(table, "?id=eq." + encodeURIComponent(id)), {
    method: "PATCH",
    headers: sbHeaders({ "Prefer": "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Supabase update failed: " + r.status + " " + await r.text());
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}
async function sbDelete(table, id) {
  const r = await fetch(sbUrl(table, "?id=eq." + encodeURIComponent(id)), {
    method: "DELETE",
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error("Supabase delete failed: " + r.status + " " + await r.text());
  return true;
}
async function sbClear(table) {
  const r = await fetch(sbUrl(table, "?id=neq.00000000-0000-0000-0000-000000000000"), {
    method: "DELETE",
    headers: sbHeaders(),
  });
  if (!r.ok) throw new Error("Supabase clear failed: " + r.status + " " + await r.text());
  return true;
}

export async function list(table) {
  if (hasSupabaseCfg) return sbList(table);
  return lsRead(table).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
}

export async function insert(table, row) {
  const payload = { ...row };
  if (!payload.created_at) payload.created_at = new Date().toISOString();
  if (hasSupabaseCfg) {
    delete payload.id;
    return sbInsert(table, payload);
  }
  if (!payload.id) payload.id = genId();
  const rows = lsRead(table);
  rows.unshift(payload);
  lsWrite(table, rows);
  return payload;
}

export async function update(table, id, patch) {
  if (hasSupabaseCfg) return sbUpdate(table, id, patch);
  const rows = lsRead(table);
  const i = rows.findIndex((r) => r.id === id);
  if (i >= 0) { rows[i] = { ...rows[i], ...patch }; lsWrite(table, rows); return rows[i]; }
  return null;
}

export async function remove(table, id) {
  if (hasSupabaseCfg) return sbDelete(table, id);
  const rows = lsRead(table).filter((r) => r.id !== id);
  lsWrite(table, rows);
  return true;
}

export async function clearAll() {
  for (const t of ["transactions", "goals", "debts", "reminders"]) {
    if (hasSupabaseCfg) await sbClear(t);
    else localStorage.removeItem(lsKey(t));
  }
}

export function isSupabase() { return hasSupabaseCfg; }
