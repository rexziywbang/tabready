export function SeverityBadge({
  severity,
}: {
  severity: "error" | "warning";
}) {
  return <span className={`badge badge-${severity}`}>{severity}</span>;
}

export function StatusBadge({
  status,
}: {
  status: "open" | "acknowledged" | "resolved";
}) {
  return <span className={`badge status-${status}`}>{status}</span>;
}

export function CountBadge({
  value,
  tone,
}: {
  value: number;
  tone: "error" | "warning" | "neutral";
}) {
  return <span className={`count-badge count-${tone}`}>{value}</span>;
}
