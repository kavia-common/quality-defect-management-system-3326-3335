import React from "react";

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
export function StatusPill({ value }) {
  /** Render a pill for common workflow statuses. */
  const v = (value || "Unknown").toString();
  let cls = "pill";

  if (/open|new|triaged/i.test(v)) cls += " pillPrimary";
  else if (/analysis/i.test(v)) cls += " pillAmber";
  else if (/actions in progress|actions/i.test(v)) cls += " pillAmber";
  else if (/pending/i.test(v)) cls += " pillAmber";
  else if (/overdue/i.test(v)) cls += " pillRed";
  else if (/closed|done|verified/i.test(v)) cls += " pillGreen";

  return <span className={cls}>{v}</span>;
}

// PUBLIC_INTERFACE
export function OverduePill({ dueDate, status }) {
  /** Render an overdue indicator pill if dueDate has passed and item is not closed. */
  const overdueDays = daysOverdue(dueDate, status);
  if (overdueDays <= 0) return <span className="pill pillGreen">On track</span>;
  return (
    <span className="pill pillRed" title={`${overdueDays} day(s) overdue`}>
      Overdue • {overdueDays}d
    </span>
  );
}

// PUBLIC_INTERFACE
export function formatDate(isoOrDate) {
  /** Format a date string into YYYY-MM-DD (best-effort). */
  if (!isoOrDate) return "";
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return normalizeDateToYmd(String(isoOrDate));
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
