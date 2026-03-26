import React, { useState } from "react";
import { exportCsv } from "../api/client";
import { downloadBlob } from "../components/ui";

// PUBLIC_INTERFACE
export default function ExportPage() {
  /** Export defects to CSV using backend if available; otherwise client-side generation. */
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const onExport = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { filename, blob, source } = await exportCsv();

      // Must download immediately (acceptance criteria).
      downloadBlob(filename, blob);

      setNote(`Downloaded ${filename} (${source === "backend" ? "from backend" : "generated on frontend fallback"})`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="pageHeader">
        <div>
          <h1>Export (CSV)</h1>
          <p>Download a CSV snapshot for reporting, audits, and sharing with stakeholders.</p>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}
      {note ? (
        <div className="card" style={{ borderColor: "rgba(37,99,235,0.22)", background: "rgba(37,99,235,0.06)" }}>
          {note}
        </div>
      ) : null}

      <div className="card">
        <div className="row">
          <button className="btn btnPrimary" onClick={onExport} disabled={busy} type="button">
            {busy ? "Preparing…" : "Export defects to CSV"}
          </button>
          <span className="note">
            If the backend export endpoint is unavailable, the app generates CSV from the current dataset so download still works.
          </span>
        </div>

        <div className="card" style={{ marginTop: 12, background: "rgba(249,250,251,0.8)", boxShadow: "none" }}>
          <div className="note">
            Backend wiring: uses <code>REACT_APP_API_BASE</code> (or <code>REACT_APP_BACKEND_URL</code> + <code>/api</code>).
            The CSV endpoint is <code>/api/defects/export-csv/</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
