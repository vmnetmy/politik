import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { TableShell } from "../components/ui/TableShell";
import { electionBase } from "../routes";
import { normalise } from "../utils";

type SourceGap = {
  category: "missing-source" | "rejected-source" | "resolved-conflict";
  scope: string;
  code: string;
  area: string;
  reason: string;
  sourcePath?: string;
  sha256?: string;
};

type AuditReport = {
  status: string;
  checkedAt: string;
  coverage: {
    totalSeats: number;
    publishedSeats: number;
    rejectedSources: number;
    missingSources: number;
    dun: {
      totalContests: number;
      publishedContests: number;
      rejectedSources: number;
      uncontested: number;
      sabahAssembly15: { totalContests: number; publishedContests: number; rejectedSources: number };
    };
  };
  checks: Array<{ id: string; status: "passed" | "failed"; message: string }>;
  missingSources: Array<{ parliamentCode: string; parliamentName: string; state: string; reason: string }>;
  rejectedSources: Array<{ parliamentCode: string; path: string; reason: string; sha256: string }>;
  dunRejectedSources: Array<{ contestId: string; stateId: string; dunCode: string; path: string; reason: string; sha256: string }>;
  sabahDunRejectedSources: Array<{ contestId: string; stateId: string; dunCode: string; path: string; reason: string; sha256: string }>;
  resolvedConflicts: Array<{ parliamentCode: string; candidate: string; reason: string }>;
  officialSourceSearch: {
    checkedAt: string;
    searchOutcome: string;
    publicationPolicy: string;
    officialLocationsChecked: Array<{ url: string; result: string }>;
  };
};

const FILTERS = ["SEMUA", "TIADA SUMBER", "DITOLAK", "KONFLIK DISELESAIKAN"] as const;

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function exportCsv(rows: SourceGap[]) {
  const header = ["kategori", "skop", "kod", "kawasan", "sebab", "fail_sumber", "sha256"];
  const body = rows.map((row) => [row.category, row.scope, row.code, row.area, row.reason, row.sourcePath ?? "", row.sha256 ?? ""]);
  const blob = new Blob([[header, ...body].map((row) => row.map((cell) => csvCell(String(cell))).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pru-14-audit-gaps.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function Pru14AuditPage() {
  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("SEMUA");

  useEffect(() => {
    fetch("/data/elections/pru-14/spr-audit.json")
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(setReport)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
  }, []);

  const gaps = useMemo<SourceGap[]>(() => report ? [
    ...report.missingSources.map((item) => ({ category: "missing-source" as const, scope: "PARLIMEN", code: item.parliamentCode, area: `${item.parliamentName} · ${item.state}`, reason: item.reason })),
    ...report.rejectedSources.map((item) => ({ category: "rejected-source" as const, scope: "PARLIMEN", code: item.parliamentCode, area: item.path, reason: item.reason, sourcePath: item.path, sha256: item.sha256 })),
    ...report.dunRejectedSources.map((item) => ({ category: "rejected-source" as const, scope: "DUN · DEWAN 14", code: item.dunCode, area: item.stateId, reason: item.reason, sourcePath: item.path, sha256: item.sha256 })),
    ...report.sabahDunRejectedSources.map((item) => ({ category: "rejected-source" as const, scope: "DUN SABAH · DEWAN 15", code: item.dunCode, area: item.stateId, reason: item.reason, sourcePath: item.path, sha256: item.sha256 })),
    ...report.resolvedConflicts.map((item) => ({ category: "resolved-conflict" as const, scope: "PARLIMEN", code: item.parliamentCode, area: item.candidate, reason: item.reason })),
  ] : [], [report]);

  const visible = useMemo(() => {
    const needle = normalise(query);
    return gaps.filter((item) => {
      const matchesFilter = filter === "SEMUA"
        || (filter === "TIADA SUMBER" && item.category === "missing-source")
        || (filter === "DITOLAK" && item.category === "rejected-source")
        || (filter === "KONFLIK DISELESAIKAN" && item.category === "resolved-conflict");
      return matchesFilter && (!needle || normalise([item.scope, item.code, item.area, item.reason, item.sourcePath].join(" ")).includes(needle));
    });
  }, [filter, gaps, query]);

  if (error) return <section className="scoresheet-unavailable is-error"><Icon name="info" size={20}/><div><strong>Audit PRU-14 tidak dapat dimuatkan</strong><p>{error}</p></div></section>;
  if (!report) return <section className="route-loading">Memuatkan audit sumber rasmi PRU-14…</section>;

  return <>
    <PageTitle title="Audit sumber PRU-14"/>
    <section className="route-hero audit-hero"><div className="breadcrumbs"><Link to={electionBase(14)}>PRU-14</Link><span>/</span><strong>Audit sumber</strong></div><span className="overline">SUMBER / IMBANGAN / KEPUTUSAN</span><h1>Jejak audit<br/><em>PRU‑14.</em></h1><p>Setiap sumber yang diterbitkan, ditolak atau masih tiada boleh diperiksa dan dieksport tanpa menyembunyikan jurang.</p><div className="audit-actions"><a className="ui-button ui-button-secondary" href="/data/elections/pru-14/spr-audit.json" download>Muat turun JSON</a><button className="ui-button ui-button-primary" onClick={() => exportCsv(gaps)}>Eksport jurang CSV</button></div></section>
    <section className="settings-kpis audit-kpis"><article><span>PARLIMEN DITERBITKAN</span><strong>{report.coverage.publishedSeats}/{report.coverage.totalSeats}</strong><small>{report.coverage.missingSources} tiada · {report.coverage.rejectedSources} ditolak</small></article><article><span>DUN DITERBITKAN</span><strong>{report.coverage.dun.publishedContests}/{report.coverage.dun.totalContests}</strong><small>termasuk Sabah Dewan 15</small></article><article><span>SABAH DEWAN 15</span><strong>{report.coverage.dun.sabahAssembly15.publishedContests}/60</strong><small>{report.coverage.dun.sabahAssembly15.rejectedSources} fail tidak lengkap</small></article><article><span>SEMAKAN LULUS</span><strong>{report.checks.filter((item) => item.status === "passed").length}/{report.checks.length}</strong><small>disemak {report.checkedAt}</small></article></section>
    <section className="panel audit-checks"><div className="section-heading"><div><span className="eyebrow">KAWALAN INTEGRITI</span><h2>Semakan automatik</h2></div><span className="scoresheet-source-status is-authoritative">LULUS DENGAN JURANG DIISYTIHAR</span></div><div className="audit-check-grid">{report.checks.map((check) => <article key={check.id}><Icon name={check.status === "passed" ? "vote" : "info"} size={18}/><div><strong>{check.id.replaceAll("-", " ")}</strong><p>{check.message}</p></div></article>)}</div></section>
    <section className="panel audit-gap-panel"><div className="section-heading"><div><span className="eyebrow">DAFTAR PENGECUALIAN</span><h2>Jurang dan keputusan sumber</h2><p>Carian dan eksport menggunakan daftar yang sama dengan laporan audit terbitan.</p></div><span className="route-count">{visible.length} REKOD</span></div><div className="audit-controls"><label><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kod, negeri, fail atau sebab"/></label><div className="scoresheet-section-filter">{FILTERS.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div></div><TableShell label="Jurang sumber PRU-14" className="table-responsive"><table className="table audit-table"><thead><tr><th>Status</th><th>Skop</th><th>Kod / kawasan</th><th>Sebab</th><th>Jejak sumber</th></tr></thead><tbody>{visible.map((item, index) => <tr key={`${item.scope}-${item.code}-${index}`}><td><span className={`audit-status is-${item.category}`}>{item.category === "missing-source" ? "TIADA" : item.category === "rejected-source" ? "DITOLAK" : "DISELESAIKAN"}</span></td><td>{item.scope}</td><th scope="row">{item.code}<small>{item.area}</small></th><td>{item.reason}</td><td>{item.sourcePath ? <><code>{item.sourcePath}</code><small>{item.sha256?.slice(0, 14)}…</small></> : "—"}</td></tr>)}</tbody></table></TableShell>{!visible.length && <div className="history-empty"><p>Tiada rekod sepadan dengan carian ini.</p></div>}</section>
    <section className="panel audit-source-panel"><div className="section-heading"><div><span className="eyebrow">USAHA PEMULIHAN SUMBER</span><h2>Lokasi rasmi yang diperiksa</h2><p>{report.officialSourceSearch.searchOutcome}</p></div></div><div className="audit-source-list">{report.officialSourceSearch.officialLocationsChecked.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><Icon name="database" size={18}/><div><strong>{source.url}</strong><span>{source.result}</span></div><Icon name="arrow" size={16}/></a>)}</div><aside className="storage-note"><Icon name="info" size={18}/><div><strong>Dasar penerbitan</strong><p>{report.officialSourceSearch.publicationPolicy}</p></div></aside></section>
  </>;
}
