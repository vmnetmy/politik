import type { CoverageStatus as CoverageStatusValue } from "../../data/coverage";

export function CoverageStatus({
  covered,
  total,
  label,
  status,
  dark = false,
}: {
  covered: number;
  total: number;
  label: string;
  status: CoverageStatusValue;
  dark?: boolean;
}) {
  const value = total > 0 ? Math.min(100, covered / total * 100) : 0;
  const statusLabel = status === "complete" ? "Lengkap" : status === "partial" ? "Separa" : "Belum tersedia";
  return <span className={`data-coverage-status is-${status} ${dark ? "is-dark" : ""}`} aria-label={`${label}: ${covered} daripada ${total}, ${statusLabel}`}>
    <i aria-hidden="true"/>
    <span>{label}</span>
    <strong>{covered}/{total}</strong>
    <small>{statusLabel}</small>
    <span className="data-coverage-meter" aria-hidden="true"><i style={{ width: `${value}%` }}/></span>
  </span>;
}
