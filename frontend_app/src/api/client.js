/**
 * Lightweight REST client for the Quality Defect Management frontend.
 * Uses REACT_APP_* environment variables for configuration and supports a
 * safe fallback mode (mock data) when the backend does not yet expose endpoints.
 */

const DEFAULT_TIMEOUT_MS = 20000;

function getEnv(name, fallback = "") {
  const v = process.env[name];
  return (v ?? fallback).toString();
}

function resolveApiBase() {
  // Prefer explicit API base; otherwise fall back to backend URL + "/api"
  const apiBase = getEnv("REACT_APP_API_BASE").trim();
  if (apiBase) return apiBase.replace(/\/+$/, "");

  const backendUrl = getEnv("REACT_APP_BACKEND_URL").trim();
  if (backendUrl) return `${backendUrl.replace(/\/+$/, "")}/api`;

  // Same-origin fallback (useful if proxied)
  return "/api";
}

const API_BASE = resolveApiBase();

/**
 * Try candidate endpoints in order until one responds with 2xx.
 * Useful because backend routes may differ slightly across templates.
 */
async function tryFirstOk(paths, init) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const res = await fetch(`${API_BASE}${p}`, init);
      if (res.ok) return { res, path: p };
      lastErr = new Error(`HTTP ${res.status} for ${p}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No endpoint responded");
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

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const data = await parseJson(res);
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
  // If it's already YYYY-MM-DD, keep it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Try parsing; fallback to raw string.
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

/**
 * Domain helpers.
 * We prefer the Django backend endpoints, but keep fallback mocks so the UI still works
 * if the backend is unavailable.
 */

const mockStore = {
  defects: [
    {
      id: 1,
      title: "Scratch on painted panel",
      severity: "Major",
      status: "Open",
      owner: "Quality",
      due_date: normalizeDateToYmd(new Date(Date.now() + 3 * 86400000).toISOString()),
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      description: "Visible scratch found during final inspection.",
    },
    {
      id: 2,
      title: "Incorrect label applied",
      severity: "Minor",
      status: "In Analysis",
      owner: "Packaging",
      due_date: normalizeDateToYmd(new Date(Date.now() - 1 * 86400000).toISOString()),
      created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      description: "Wrong SKU label applied to carton batch.",
    },
  ],
  actions: [
    {
      id: 1,
      defect_id: 2,
      title: "Add label verification step",
      owner: "Ops",
      status: "Open",
      due_date: normalizeDateToYmd(new Date(Date.now() + 5 * 86400000).toISOString()),
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
  analyses: [
    {
      id: 1,
      defect_id: 2,
      whys: [
        "Label printed with wrong template",
        "Template selection not controlled",
        "Work instruction unclear",
        "Training incomplete",
        "No audit for labeling process",
      ],
      root_cause: "Labeling work instruction and controls insufficient",
      containment: "Quarantine affected cartons and re-label",
      created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    },
  ],
};

function nextId(items) {
  return items.reduce((m, it) => Math.max(m, Number(it.id) || 0), 0) + 1;
}

function mapBackendDefect(d) {
  // Backend defect schema uses: severity/priority values like "medium/high", status is nested object.
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
  /** Returns backend health info if available. */
  try {
    const data = await requestJson("GET", "/health/", null);
    return { ok: true, data, apiBase: API_BASE };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), apiBase: API_BASE };
  }
}

// PUBLIC_INTERFACE
export async function listDefects() {
  /** List defects (backend if available, otherwise mock). */
  const candidates = ["/defects/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    const items = Array.isArray(data) ? data : data?.results || [];
    return items.map(mapBackendDefect).map((d) => ({
      ...d,
      overdue: isOverdue(d.due_date, d.status),
      overdue_days: daysOverdue(d.due_date, d.status),
    }));
  } catch {
    return mockStore.defects.map((d) => ({
      ...d,
      due_date: normalizeDateToYmd(d.due_date),
      overdue: isOverdue(d.due_date, d.status),
      overdue_days: daysOverdue(d.due_date, d.status),
    }));
  }
}

// PUBLIC_INTERFACE
export async function createDefect(payload) {
  /** Create a defect (backend if available, otherwise mock). */
  // Backend uses: title, description, severity, priority, assigned_to, due_date (datetime), etc.
  const backendPayload = {
    title: payload.title,
    description: payload.description || "",
    severity: (payload.severity || "medium").toString().toLowerCase(),
    priority: "medium",
    assigned_to: payload.owner || "",
    due_date: payload.due_date ? `${normalizeDateToYmd(payload.due_date)}T00:00:00Z` : null,
  };

  try {
    const data = await requestJson("POST", "/defects/", backendPayload);
    return mapBackendDefect(data);
  } catch {
    const now = new Date().toISOString();
    const item = {
      id: nextId(mockStore.defects),
      created_at: now,
      status: "Open",
      ...payload,
      due_date: normalizeDateToYmd(payload.due_date),
    };
    mockStore.defects.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function updateDefect(defectId, patch) {
  /** Update a defect (backend if available, otherwise mock). */
  // Frontend patch may send { owner, due_date, ... }.
  // Backend expects assigned_to and due_date as datetime (or null).
  const backendPatch = {};
  if (patch.title !== undefined) backendPatch.title = patch.title;
  if (patch.description !== undefined) backendPatch.description = patch.description;
  if (patch.owner !== undefined) backendPatch.assigned_to = patch.owner;
  if (patch.due_date !== undefined) {
    backendPatch.due_date = patch.due_date ? `${normalizeDateToYmd(patch.due_date)}T00:00:00Z` : null;
  }

  try {
    const data = await requestJson("PATCH", `/defects/${defectId}/`, backendPatch);
    return mapBackendDefect(data);
  } catch {
    const idx = mockStore.defects.findIndex((d) => String(d.id) === String(defectId));
    if (idx >= 0) {
      mockStore.defects[idx] = { ...mockStore.defects[idx], ...patch, due_date: normalizeDateToYmd(patch.due_date) };
      return mockStore.defects[idx];
    }
    throw new Error("Defect not found");
  }
}

// PUBLIC_INTERFACE
export async function transitionDefect(defectId, toStatusCode, { actor = "", message = "" } = {}) {
  /** Transition a defect status using backend workflow rules; fallback updates mock status string. */
  try {
    const data = await requestJson("POST", `/defects/${defectId}/transition/`, {
      to_status_code: toStatusCode,
      actor,
      message,
    });
    return mapBackendDefect(data);
  } catch (e) {
    // Fallback: update mock based on a simple mapping.
    const codeToLabel = {
      NEW: "Open",
      IN_ANALYSIS: "In Analysis",
      ACTIONS_IN_PROGRESS: "Actions In Progress",
      CLOSED: "Closed",
      VERIFIED: "Verified",
      PENDING_VERIFICATION: "Pending Verification",
      TRIAGED: "Open",
    };
    const idx = mockStore.defects.findIndex((d) => String(d.id) === String(defectId));
    if (idx >= 0) {
      mockStore.defects[idx] = { ...mockStore.defects[idx], status: codeToLabel[toStatusCode] || toStatusCode };
      return mockStore.defects[idx];
    }
    throw e;
  }
}

// PUBLIC_INTERFACE
export async function listActions() {
  /** List corrective actions (backend if available, otherwise mock). */
  const candidates = ["/actions/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    const items = Array.isArray(data) ? data : data?.results || [];
    return items.map(mapBackendAction).map((a) => ({
      ...a,
      overdue: isOverdue(a.due_date, a.status),
      overdue_days: daysOverdue(a.due_date, a.status),
    }));
  } catch {
    return mockStore.actions.map((a) => ({
      ...a,
      due_date: normalizeDateToYmd(a.due_date),
      overdue: isOverdue(a.due_date, a.status),
      overdue_days: daysOverdue(a.due_date, a.status),
    }));
  }
}

// PUBLIC_INTERFACE
export async function createAction(payload) {
  /** Create corrective action (backend if available, otherwise mock). */
  const backendPayload = {
    defect: payload.defect_id, // backend uses FK field name `defect`
    title: payload.title,
    owner: payload.owner || "",
    due_date: payload.due_date ? `${normalizeDateToYmd(payload.due_date)}T00:00:00Z` : null,
    status: "open",
  };

  try {
    const data = await requestJson("POST", "/actions/", backendPayload);
    return mapBackendAction(data);
  } catch {
    const now = new Date().toISOString();
    const item = {
      id: nextId(mockStore.actions),
      created_at: now,
      status: "Open",
      ...payload,
      due_date: normalizeDateToYmd(payload.due_date),
    };
    mockStore.actions.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function updateAction(actionId, patch) {
  /** Update corrective action (backend if available, otherwise mock). */
  const backendPatch = {};
  if (patch.title !== undefined) backendPatch.title = patch.title;
  if (patch.owner !== undefined) backendPatch.owner = patch.owner;
  if (patch.status !== undefined) {
    const s = patch.status.toString().toLowerCase();
    // Normalize common UI statuses into backend enum values.
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

  try {
    const data = await requestJson("PATCH", `/actions/${actionId}/`, backendPatch);
    return mapBackendAction(data);
  } catch {
    const idx = mockStore.actions.findIndex((a) => String(a.id) === String(actionId));
    if (idx >= 0) {
      mockStore.actions[idx] = { ...mockStore.actions[idx], ...patch, due_date: normalizeDateToYmd(patch.due_date) };
      return mockStore.actions[idx];
    }
    throw new Error("Action not found");
  }
}

// PUBLIC_INTERFACE
export async function getAnalysisByDefect(defectId) {
  /** Get 5-Why analysis by defect (backend if available, otherwise mock). */
  try {
    const data = await requestJson("GET", `/defects/${defectId}/`, null);
    const d = mapBackendDefect(data);
    const five = d.five_why;
    if (!five) return null;
    return {
      id: five.id,
      defect_id: defectId,
      whys: [five.why1, five.why2, five.why3, five.why4, five.why5].filter((x) => (x || "").trim() !== ""),
      root_cause: five.root_cause || "",
      containment: five.problem_statement || "", // older UI used containment; backend has problem_statement.
      created_at: five.created_at,
      updated_at: five.updated_at,
    };
  } catch {
    return mockStore.analyses.find((a) => String(a.defect_id) === String(defectId)) ?? null;
  }
}

// PUBLIC_INTERFACE
export async function upsertAnalysis(defectId, payload) {
  /** Create or update 5-Why analysis (backend if available, otherwise mock). */
  // Backend endpoint is PUT /five-whys/by-defect/{defect_id}/
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

  try {
    const data = await requestJson("PUT", `/five-whys/by-defect/${defectId}/`, backendPayload);
    return data ?? payload;
  } catch {
    const existingIdx = mockStore.analyses.findIndex((a) => String(a.defect_id) === String(defectId));
    const now = new Date().toISOString();
    const item = {
      id: existingIdx >= 0 ? mockStore.analyses[existingIdx].id : nextId(mockStore.analyses),
      defect_id: Number(defectId),
      created_at: existingIdx >= 0 ? mockStore.analyses[existingIdx].created_at : now,
      ...payload,
    };
    if (existingIdx >= 0) mockStore.analyses[existingIdx] = item;
    else mockStore.analyses.unshift(item);
    return item;
  }
}

// PUBLIC_INTERFACE
export async function getDashboard() {
  /** Returns dashboard metrics (backend if available, otherwise computed from defects/actions). */
  const candidates = ["/dashboard/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const data = await parseJson(res);
    if (data) return data;
  } catch {
    // ignore
  }

  const defects = await listDefects();
  const actions = await listActions();

  const closedDefects = defects.filter((d) => /(closed|verified)/i.test(d.status)).length;
  const openDefects = defects.length - closedDefects;
  const overdueDefects = defects.filter((d) => isOverdue(d.due_date, d.status)).length;

  const doneActions = actions.filter((a) => /(done|closed|verified)/i.test(a.status)).length;
  const openActions = actions.length - doneActions;
  const overdueActions = actions.filter((a) => isOverdue(a.due_date, a.status)).length;

  const byStatus = defects.reduce((acc, d) => {
    const k = d.status || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const bySeverity = defects.reduce((acc, d) => {
    const k = d.severity || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return {
    total_defects: defects.length,
    open_defects: openDefects,
    closed_defects: closedDefects,
    overdue_defects: overdueDefects,
    open_actions: openActions,
    overdue_actions: overdueActions,
    done_actions: doneActions,
    actions_due_soon: 0,
    by_status: byStatus,
    by_severity: bySeverity,
  };
}

// PUBLIC_INTERFACE
export async function exportCsv() {
  /**
   * Export CSV from backend if available; otherwise generate CSV on client.
   * Returns { filename, blob, source }.
   */
  const candidates = ["/defects/export-csv/"];
  try {
    const { res } = await tryFirstOk(candidates, { method: "GET" });
    const blob = await res.blob();
    // Backend provides filename=defects.csv but browsers don't reliably expose it; use a deterministic name.
    return { filename: "defects.csv", blob, source: "backend" };
  } catch {
    // Frontend fallback generation from current data
    const defects = await listDefects();
    const header = [
      "id",
      "title",
      "severity",
      "priority",
      "status",
      "owner",
      "due_date",
      "overdue_days",
      "description",
    ];
    const escape = (v) => {
      const s = (v ?? "").toString();
      const needs = /[",\n]/.test(s);
      const inner = s.replace(/"/g, '""');
      return needs ? `"${inner}"` : inner;
    };
    const rows = defects.map((d) =>
      header
        .map((h) => {
          if (h === "owner") return escape(d.assigned_to || d.owner || "");
          if (h === "status") return escape(d.status || "");
          return escape(d[h]);
        })
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    return {
      filename: "defects.csv",
      blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
      source: "frontend",
    };
  }
}

// PUBLIC_INTERFACE
export function computeActionProgressForDefect(defectId, actions) {
  /** Utility for UI: returns { done, total } for a given defect based on action list. */
  const related = actions.filter((a) => String(a.defect_id) === String(defectId));
  const total = related.length;
  const done = related.filter((a) => /(done)/i.test(a.status)).length;
  return { done, total };
}
