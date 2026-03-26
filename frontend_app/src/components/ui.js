import React from "react";

function isOverdue(dueDateStr, status) {
  if (!dueDateStr) return false;
  if (["Closed", "Done", "Verified"].includes(status)) return false;
  const today = new Date();
  const due = new Date(`${dueDateStr}T00:00:00`);
  return due.getTime() < new Date(today.toDateString()).getTime();
}

// PUBLIC_INTERFACE
export function StatusPill({ value }) {
  /** Render a pill for common workflow statuses. */
  const v = (value || "Unknown").toString();
  let cls = "pill";
  if (/open/i.test(v)) cls += " pillPrimary";
  else if (/analysis/i.test(v)) cls += " pillAmber";
  else if (/overdue/i.test(v)) cls += " pillRed";
  else if (/closed|done|verified/i.test(v)) cls += " pillGreen";
  return <span className={cls}>{v}</span>;
}

// PUBLIC_INTERFACE
export function OverduePill({ dueDate, status }) {
  /** Render an overdue indicator pill if dueDate has passed and item is not closed. */
  const overdue = isOverdue(dueDate, status);
  if (!overdue) return <span className="pill pillGreen">On track</span>;
  return <span className="pill pillRed">Overdue</span>;
}

// PUBLIC_INTERFACE
export function formatDate(isoOrDate) {
  /** Format a date string into YYYY-MM-DD (best-effort). */
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate);
  return d.toISOString().slice(0, 10);
}

// PUBLIC_INTERFACE
export function downloadBlob(filename, blob) {
  /** Trigger browser download for a Blob. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "export.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
