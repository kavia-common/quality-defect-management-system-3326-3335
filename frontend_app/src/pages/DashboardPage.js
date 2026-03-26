import React, { useEffect, useMemo, useState } from "react";
import { getDashboard, listActions, listDefects } from "../api/client";
import { StatusPill, OverduePill, formatDate } from "../components/ui";

// PUBLIC_INTERFACE
export default function DashboardPage() {
  /** Dashboard with key metrics and overdue alerts. */
  const [metrics, setMetrics] = useState(null);
  const [defects, setDefects] = useState([]);
  const [actions, setActions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([getDashboard(), listDefects(), listActions()])
      .then(([m, d, a]) => {
        if (!mounted) return;
        setMetrics(m);
        setDefects(d);
        setActions(a);
      })
      .catch((e) => mounted && setError(e?.message || String(e)));
    return () => {
      mounted = false;
    };
  }, []);

  const overdueDefects = useMemo(
    () => defects.filter((d) => d.overdue).slice(0, 5),
    [defects]
  );
  const overdueActions = useMemo(
    () => actions.filter((a) => a.overdue).slice(0, 5),
    [actions]
  );

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of defects, corrective actions, and overdue risks.</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      <div className="metricsRow">
        <div className="metric">
          <div className="metricLabel">Open defects</div>
          <div className="metricValue">{metrics?.openDefects ?? "—"}</div>
          <div className="metricHint">Items not yet closed/verified</div>
        </div>
        <div className="metric">
          <div className="metricLabel">Overdue defects</div>
          <div className="metricValue" style={{ color: (metrics?.overdueDefects ?? 0) > 0 ? "#991b1b" : undefined }}>
            {metrics?.overdueDefects ?? "—"}
          </div>
          <div className="metricHint">Past due date and still open</div>
        </div>
        <div className="metric">
          <div className="metricLabel">Open actions</div>
          <div className="metricValue">{metrics?.openActions ?? "—"}</div>
          <div className="metricHint">Corrective actions in progress</div>
        </div>
        <div className="metric">
          <div className="metricLabel">Overdue actions</div>
          <div className="metricValue" style={{ color: (metrics?.overdueActions ?? 0) > 0 ? "#991b1b" : undefined }}>
            {metrics?.overdueActions ?? "—"}
          </div>
          <div className="metricHint">Require escalation / attention</div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>Defects by status</strong>
          <div className="spacer" />
          <span className="note">Quick distribution (computed client-side if backend not available).</span>
        </div>
        <div className="row">
          {metrics?.defectsByStatus
            ? Object.entries(metrics.defectsByStatus).map(([k, v]) => (
                <span key={k} className="pill">
                  <StatusPill value={k} /> <span className="note">×</span> <strong>{v}</strong>
                </span>
              ))
            : <span className="note">—</span>}
        </div>
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
                  <th>Risk</th>
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
                      <td><StatusPill value={d.status} /></td>
                      <td>{formatDate(d.due_date)}</td>
                      <td><OverduePill dueDate={d.due_date} status={d.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <strong>Overdue actions</strong>
            <div className="spacer" />
            <span className="note">Top 5</span>
          </div>
          <div className="tableWrap" role="region" aria-label="Overdue actions table">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Due</th>
                  <th>Risk</th>
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
                      <td>{a.title}</td>
                      <td><StatusPill value={a.status} /></td>
                      <td>{formatDate(a.due_date)}</td>
                      <td><OverduePill dueDate={a.due_date} status={a.status} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
