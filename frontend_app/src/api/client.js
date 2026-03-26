/**
 * Lightweight REST client for the Quality Defect Management frontend.
 *
 * Requirements enforced:
 * - Connect React frontend to Django backend APIs.
 * - Remove mock data fallback completely (so seeded backend data is rendered and issues are visible).
 * - Log API base URL + responses in console for debugging/verification.
 *
 * Environment:
 * - Prefer REACT_APP_API_BASE (expected: https://<host>:3001/api)
 * - Else REACT_APP_BACKEND_URL + "/api"
 * - Else "/api" (only works if a reverse proxy routes /api -> backend)
 */

const DEFAULT_TIMEOUT_MS = 20000;

function getEnv(name, fallback = "") {
  const v = process.env[name];
  return (v ?? fallback).toString();
}

function resolveApiBase() {
  const apiBaseRaw = getEnv("REACT_APP_API_BASE").trim();
  if (apiBaseRaw) {
    const apiBase = apiBaseRaw.replace(/\/*$/, "");
    // Accept either:
    // - https://host:3001/api  (preferred)
    // - https://host:3001      (we will append /api to avoid broken routes)
    return /\/api$/i.test(apiBase) ? apiBase : `${apiBase}/api`;
  }

  const backendUrl = getEnv("REACT_APP_BACKEND_URL").trim();
  if (backendUrl) return `${backendUrl.replace(/\/*$/, "")}/api`;

  return "/api";
}

const API_BASE = resolveApiBase();

function debugLog(...args) {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.log("[qdm-api]", ...args);
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const url = `${API_BASE}${path}`;

  try {
    debugLog("request", { method, url, body });

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await parseJson(res);

    // Log a compact form of the response (for “Confirm data is received and rendered” requirement).
    debugLog("response", { method, url, status: res.status, ok: res.ok, data });

    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || res.statusText || "Request failed";
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeDateToYmd(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
}

function daysOverdue(dueDateStr, status) {
  if (!dueDateStr) return 0;
  const statusStr = (status || "").toString();
  if (/(closed|done|verified)/i.test(statusStr)) return 0;
  const due = new Date(`${normalizeDateToYmd(dueDateStr)}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diffMs = todayUtc.getTime() - due.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 86400000) : 0;
}

function isOverdue(dueDateStr, status) {
  return daysOverdue(dueDateStr, status) > 0;
}

function mapBackendDefect(d) {
  const statusCode = d?.status?.code || d?.status_code || d?.status || "";
  const statusName = d?.status?.name || d?.status_name || "";
  const displayStatus = statusName || statusCode || "Open";

  return {
    id: d.id,
    defect_key: d.defect_key ?? "",
    title: d.title ?? "",
    description: d.description ?? "",
    severity: d.severity ?? "",
    priority: d.priority ?? "",
    status_code: statusCode,
    status: displayStatus,

    // Acceptance criteria defect logging fields
    part_number: d.part_number ?? "",
    defect_type: d.defect_type ?? "",
    quantity_affected: d.quantity_affected ?? null,
    production_line: d.production_line ?? "",
    shift: d.shift ?? "",

    reported_by: d.reported_by ?? "",
    assigned_to: d.assigned_to ?? "",
    area: d.area ?? "",
    source: d.source ?? "",
    occurred_at: d.occurred_at ?? "",
    due_date: d.due_date ? normalizeDateToYmd(d.due_date) : "",
    closed_at: d.closed_at ?? "",
    created_at: d.created_at ?? "",
    updated_at: d.updated_at ?? "",
    five_why: d.five_why ?? null,
    actions: Array.isArray(d.actions) ? d.actions : [],
  };
}

function mapBackendAction(a) {
  return {
    id: a.id,
    defect_id: a.defect_id ?? a.defect ?? null,
    title: a.title ?? "",
    description: a.description ?? "",
    owner: a.owner ?? "",
    status: a.status ?? "open",
    due_date: a.due_date ? normalizeDateToYmd(a.due_date) : "",
    completed_at: a.completed_at ?? "",
    created_at: a.created_at ?? "",
    updated_at: a.updated_at ?? "",
    effectiveness_check: a.effectiveness_check ?? "",
  };
}

// PUBLIC_INTERFACE
export async function apiHealthCheck() {
  /** Returns backend health info (and exposes resolved apiBase). */
  try {
    const data = await requestJson("GET", "/health/", null);
    return { ok: true, data, apiBase: API_BASE };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), apiBase: API_BASE };
  }
}

// PUBLIC_INTERFACE
export async function listDefects() {
  /** List defects from backend (no mock fallback). */
  const data = await requestJson("GET", "/defects/", null);
  const items = Array.isArray(data) ? data : data?.results || [];
  return items.map(mapBackendDefect).map((d) => ({
    ...d,
    overdue: isOverdue(d.due_date, d.status),
    overdue_days: daysOverdue(d.due_date, d.status),
  }));
}

// PUBLIC_INTERFACE
export async function createDefect(payload) {
  /** Create a defect in backend. */
  const backendPayload = {
    title: payload.title,
    description: payload.description || "",
    severity: (payload.severity || "medium").toString().toLowerCase(),
    priority: "medium",
    assigned_to: payload.owner || "",
    due_date: payload.due_date ? `${normalizeDateToYmd(payload.due_date)}T00:00:00Z` : null,

    // Optional acceptance criteria logging fields (backend supports these)
    part_number: payload.part_number || "",
    defect_type: payload.defect_type || "",
    quantity_affected: payload.quantity_affected ?? null,
    production_line: payload.production_line || "",
    shift: payload.shift || "",
  };

  const data = await requestJson("POST", "/defects/", backendPayload);
  return mapBackendDefect(data);
}

// PUBLIC_INTERFACE
export async function updateDefect(defectId, patch) {
  /** Update a defect in backend. */
  const backendPatch = {};
  if (patch.title !== undefined) backendPatch.title = patch.title;
  if (patch.description !== undefined) backendPatch.description = patch.description;
  if (patch.owner !== undefined) backendPatch.assigned_to = patch.owner;
  if (patch.due_date !== undefined) {
    backendPatch.due_date = patch.due_date ? `${normalizeDateToYmd(patch.due_date)}T00:00:00Z` : null;
  }

  const data = await requestJson("PATCH", `/defects/${defectId}/`, backendPatch);
  return mapBackendDefect(data);
}

// PUBLIC_INTERFACE
export async function transitionDefect(defectId, toStatusCode, { actor = "", message = "" } = {}) {
  /** Transition a defect status using backend workflow rules. */
  const data = await requestJson("POST", `/defects/${defectId}/transition/`, {
    to_status_code: toStatusCode,
    actor,
    message,
  });
  return mapBackendDefect(data);
}

// PUBLIC_INTERFACE
export async function listActions() {
  /** List corrective actions from backend (no mock fallback). */
  const data = await requestJson("GET", "/actions/", null);
  const items = Array.isArray(data) ? data : data?.results || [];
  return items.map(mapBackendAction).map((a) => ({
    ...a,
    overdue: isOverdue(a.due_date, a.status),
    overdue_days: daysOverdue(a.due_date, a.status),
  }));
}

// PUBLIC_INTERFACE
export async function createAction(payload) {
  /** Create corrective action in backend. */
  const backendPayload = {
    defect: payload.defect_id, // backend uses FK field name `defect`
    title: payload.title,
    owner: payload.owner || "",
    due_date: payload.due_date ? `${normalizeDateToYmd(payload.due_date)}T00:00:00Z` : null,
    status: "open",
  };

  const data = await requestJson("POST", "/actions/", backendPayload);
  return mapBackendAction(data);
}

// PUBLIC_INTERFACE
export async function updateAction(actionId, patch) {
  /** Update corrective action in backend. */
  const backendPatch = {};
  if (patch.title !== undefined) backendPatch.title = patch.title;
  if (patch.owner !== undefined) backendPatch.owner = patch.owner;
  if (patch.status !== undefined) {
    const s = patch.status.toString().toLowerCase();
    const mapping = {
      open: "open",
      "in progress": "in_progress",
      in_progress: "in_progress",
      blocked: "blocked",
      done: "done",
      completed: "done",
      cancelled: "cancelled",
    };
    backendPatch.status = mapping[s] || s;
  }
  if (patch.due_date !== undefined) {
    backendPatch.due_date = patch.due_date ? `${normalizeDateToYmd(patch.due_date)}T00:00:00Z` : null;
  }

  const data = await requestJson("PATCH", `/actions/${actionId}/`, backendPatch);
  return mapBackendAction(data);
}

// PUBLIC_INTERFACE
export async function getAnalysisByDefect(defectId) {
  /** Get 5-Why analysis by defect from backend (via defect detail). */
  const data = await requestJson("GET", `/defects/${defectId}/`, null);
  const d = mapBackendDefect(data);
  const five = d.five_why;
  if (!five) return null;
  return {
    id: five.id,
    defect_id: defectId,
    whys: [five.why1, five.why2, five.why3, five.why4, five.why5].filter((x) => (x || "").trim() !== ""),
    root_cause: five.root_cause || "",
    containment: five.problem_statement || "",
    created_at: five.created_at,
    updated_at: five.updated_at,
  };
}

// PUBLIC_INTERFACE
export async function upsertAnalysis(defectId, payload) {
  /** Create or update 5-Why analysis in backend. */
  const backendPayload = {
    problem_statement: payload.containment || "",
    why1: payload.whys?.[0] || "",
    why2: payload.whys?.[1] || "",
    why3: payload.whys?.[2] || "",
    why4: payload.whys?.[3] || "",
    why5: payload.whys?.[4] || "",
    root_cause: payload.root_cause || "",
    created_by: payload.created_by || "",
  };

  const data = await requestJson("PUT", `/five-whys/by-defect/${defectId}/`, backendPayload);
  return data ?? payload;
}

// PUBLIC_INTERFACE
export async function getDashboard() {
  /** Returns dashboard metrics from backend (no mock fallback). */
  return requestJson("GET", "/dashboard/", null);
}

// PUBLIC_INTERFACE
export async function exportCsv() {
  /**
   * Export defects as CSV from backend (required).
   * Returns { filename, blob, source }.
   */
  const url = `${API_BASE}/defects/export-csv/`;
  debugLog("request", { method: "GET", url });

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const data = await parseJson(res);
    debugLog("response-error", { method: "GET", url, status: res.status, data });
    const msg = (data && (data.detail || data.error)) || res.statusText || "CSV export failed";
    throw new Error(msg);
  }
  const blob = await res.blob();
  return { filename: "defects.csv", blob, source: "backend" };
}

// PUBLIC_INTERFACE
export function computeActionProgressForDefect(defectId, actions) {
  /** Utility for UI: returns { done, total } for a given defect based on action list. */
  const related = actions.filter((a) => String(a.defect_id) === String(defectId));
  const total = related.length;
  const done = related.filter((a) => /(done)/i.test(a.status)).length;
  return { done, total };
}
