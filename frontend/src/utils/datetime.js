// Centralised date formatting — day/month/year (not US month/day/year).
// Uses en-GB locale which renders as DD/MM/YYYY.

const DATE_OPTS = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DATETIME_OPTS = {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
};

// Date + time, e.g. "21/09/2026, 11:33:19"
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', DATETIME_OPTS);
}

// Date only, e.g. "21/09/2026"
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', DATE_OPTS);
}
