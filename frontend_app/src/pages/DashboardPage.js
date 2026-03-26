import React, { useEffect, useMemo, useState } from "react";
import { getDashboard, listActions, listDefects } from "../api/client";
import { StatusPill, formatDate } from "../components/ui";

function normalizeMetrics(m) {
  if (!m) return null;
  // Backend uses snake_case; older fallback used camelCase.
  return {
    total_defects: m.total_defects ?? m.totalDefects ?? null,
    open_defects: m.open_defects ?? m.openDefects ?? null,
    closed_defects: m.closed_defects ?? m.closedDefects ?? null,
    overdue_defects: m.overdue_defects ?? m.overdueDefects ?? null,
    open_actions: m.open_actions ?? m.openActions ?? null,
    overdue_actions: m.overdue_actions ?? m.overdueActions ?? null,
    done_actions: m.done_actions ?? m.doneActions ?? null,
    actions_due_soon: m.actions_due_soon ?? m.actionsDueSoon ?? null,
    by_status: m.by_status ?? m.defectsByStatus ?? null,
    by_severity: m.by_severity ?? m.defectsBySeverity ?? null,
  };
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
  if (/(closed|done|verified)/i.test((status || "").toString())) return 0;
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

// PUBLIC_INTERFACE
export default function DashboardPage() {
  /** Dashboard with key metrics and overdue alerts. */
  const [metrics, setMetrics] = useState(null);
  const [defects, setDefects] = useState([]);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    setError("");
    try {
      const [m, d, a] = await Promise.all([getDashboard(), listDefects(), listActions()]);
      setMetrics(normalizeMetrics(m));
      setDefects(d);
      setActions(a);
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  // IMPORTANT:
  // Do not depend on backend supplying an `overdue` boolean. The backend returns due_date + status.
  // Compute overdue consistently so the list never silently empties.
  const overdueDefects = useMemo(
    () =>
      defects
        .map((d) => ({ ...d, overdue_days: d.overdue_days ?? daysOverdue(d.due_date, d.status) }))
        .filter((d) => (d.overdue_days ?? 0) > 0)
        .sort((a, b) => (b.overdue_days ?? 0) - (a.overdue_days ?? 0))
        .slice(0, 5),
    [defects]
  );

  const overdueActions = useMemo(
    () =>
      actions
        .map((a) => ({ ...a, overdue_days: a.overdue_days ?? daysOverdue(a.due_date, a.status) }))
        .filter((a) => (a.overdue_days ?? 0) > 0)
        .sort((a, b) => (b.overdue_days ?? 0) - (a.overdue_days ?? 0))
        .slice(0, 5),
    [actions]
  );

  const statusBars = useMemo(() => {
    const byStatus = metrics?.by_status;
    if (!byStatus) return [];
    const entries = Object.entries(byStatus);
    const max = Math.max(1, ...entries.map(([, v]) => Number(v) || 0));
    return entries
      .sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))
      .map(([k, v]) => ({
        k,
        v: Number(v) || 0,
        pct: Math.round(((Number(v) || 0) / max) * 100),
      }));
  }, [metrics]);

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of defects, corrective actions, and overdue risks.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={refresh} type="button">
            Refresh
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="metricsRow">
        <div className="metric">
          <div className="metricLabel">Open defects</div>
          <div className="metricValue">{metrics?.open_defects ?? "—"}</div>
          <div className="metricHint">Items not yet closed</div>
        </div>

        <div className="metric">
          <div className="metricLabel">Closed defects</div>
          <div className="metricValue">{metrics?.closed_defects ?? "—"}</div>
          <div className="metricHint">Completed lifecycle</div>
        </div>

        <div className="metric">
          <div className="metricLabel">Overdue actions</div>
          <div className="metricValue" style={{ color: (metrics?.overdue_actions ?? 0) > 0 ? "#991b1b" : undefined }}>
            {metrics?.overdue_actions ?? "—"}
          </div>
          <div className="metricHint">Red badge = needs attention</div>
        </div>

        <div className="metric">
          <div className="metricLabel">Done actions</div>
          <div className="metricValue">{metrics?.done_actions ?? "—"}</div>
          <div className="metricHint">Marked completed</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Defects distribution</strong>
          <div className="spacer" />
          <span className="note">Simple indicators for hackathon acceptance criteria.</span>
        </div>

        {!metrics?.by_status ? (
          <div className="note">—</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {statusBars.map((it) => (
              <div key={it.k} className="row" style={{ gap: 10 }}>
                <div style={{ minWidth: 190 }}>
                  <StatusPill value={it.k} /> <span className="note">×</span> <strong>{it.v}</strong>
                </div>
                <div style={{ flex: 1, height: 10, background: "rgba(17,24,39,0.08)", borderRadius: 999 }}>
                  <div
                    style={{
                      width: `${it.pct}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, rgba(37,99,235,0.85), rgba(245,158,11,0.65))",
                    }}
                    aria-label={`${it.k} bar`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>Overdue defects</strong>
            <div className="spacer" />
            <span className="note">Top 5</span>
          </div>
          <div className="tableWrap" role="region" aria-label="Overdue defects table">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Days overdue</th>
                </tr>
              </thead>
              <tbody>
                {overdueDefects.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="note">
                      No overdue defects.
                    </td>
                  </tr>
                ) : (
                  overdueDefects.map((d) => (
                    <tr key={d.id}>
                      <td>{d.id}</td>
                      <td>{d.title}</td>
                      <td>
                        <StatusPill value={d.status} />
                      </td>
                      <td>{formatDate(d.due_date)}</td>
                      <td>
                        <span className="pill pillRed">{d.overdue_days ?? 0}d</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ borderColor: overdueActions.length ? "rgba(239,68,68,0.35)" : undefined }}>
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>Overdue actions</strong>
            <div className="spacer" />
            <span className="pill pillRed" style={{ display: overdueActions.length ? "inline-flex" : "none" }}>
              {overdueActions.length} overdue
            </span>
          </div>
          <div className="tableWrap" role="region" aria-label="Overdue actions table">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Days overdue</th>
                </tr>
              </thead>
              <tbody>
                {overdueActions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="note">
                      No overdue actions.
                    </td>
                  </tr>
                ) : (
                  overdueActions.map((a) => (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{a.title}</div>
                        <div className="note">Defect #{a.defect_id ?? "—"}</div>
                      </td>
                      <td>
                        <StatusPill value={a.status} />
                      </td>
                      <td>{formatDate(a.due_date)}</td>
                      <td>
                        <span className="pill pillRed">{a.overdue_days ?? 0}d</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="note" style={{ marginTop: 10 }}>
            Overdue actions should always appear here. If this list is empty while metrics show overdue counts, verify that
            actions have due dates set and are not marked done.
          </div>
        </div>
      </div>
    </div>
  );
}
