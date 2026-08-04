import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/ui/PageTitle";
import { CoverageStatus } from "../components/ui/CoverageStatus";
import { Icon } from "../components/ui/Icon";
import { buildBoundaryCoverage, buildStateCoverage, coverageStatus } from "../data/coverage";
import { useAtlasBoundaryRegistry } from "../data/hooks/useElectionAtlas";
import type { ConstituencyRegistry, GeographyData, ScoresheetIndex } from "../types";
import { formatNumber } from "../utils";
import { SettingsTabs } from "./SettingsPages";

function pct(value: number) {
  const maximumFractionDigits = value > 99 && value < 100 ? 2 : value < 1 ? 2 : 1;
  return `${value.toLocaleString("ms-MY", { maximumFractionDigits })}%`;
}

export function SettingsCoveragePage({
  geography,
  constituencies,
  scoresheets,
}: {
  geography: GeographyData;
  constituencies: ConstituencyRegistry;
  scoresheets: ScoresheetIndex;
}) {
  const boundaryRegistry = useAtlasBoundaryRegistry();
  const stateRows = useMemo(() => buildStateCoverage(geography, constituencies), [constituencies, geography]);
  const boundaryRows = useMemo(
    () => boundaryRegistry.value ? buildBoundaryCoverage(boundaryRegistry.value) : [],
    [boundaryRegistry.value],
  );
  const localityStatus = coverageStatus(geography.metadata.localityPdmCount, geography.metadata.pdmCount);
  const scoresheetStatus = coverageStatus(scoresheets.metadata.coveredSeats, scoresheets.metadata.totalSeats);
  const exactSnapshots = boundaryRows.filter((row) => row.status === "exact").length;
  const snapshotRange = geography.metadata.localitySnapshotRange;

  return <>
    <PageTitle title="Liputan data"/>
    <SettingsTabs/>
    <section className="settings-hero coverage-hero">
      <div><span className="overline">TETAPAN / DATA / LIPUTAN</span><h1>Jejak kelengkapan data.</h1><p>Semak hierarki kawasan, scoresheet, lokaliti rasmi dan snapshot sempadan sebelum data diterbitkan.</p></div>
      <div className="coverage-hero-status"><strong>{geography.metadata.localityConflictCount}</strong><span>konflik lokaliti</span></div>
    </section>
    <section className="settings-kpis coverage-kpis">
      <article><span>PDM RASMI</span><strong>{formatNumber(geography.metadata.pdmCount)}</strong><small>{geography.metadata.stateCount} negeri dan wilayah</small></article>
      <article><span>PDM BERSCORESHEET</span><strong>{formatNumber(geography.metadata.scoresheetPdmCount)}</strong><small>{pct(geography.metadata.scoresheetPdmCount / Math.max(1, geography.metadata.pdmCount) * 100)}</small></article>
      <article><span>LOKALITI DISAHKAN</span><strong>{formatNumber(geography.metadata.localityCount)}</strong><small>{geography.metadata.localityPdmCount} PDM diliputi</small></article>
      <article><span>SNAPSHOT TEPAT</span><strong>{exactSnapshots}/{boundaryRows.length || "—"}</strong><small>manifest PRU dan PRN</small></article>
    </section>
    <section className="coverage-summary-grid">
      <article className="panel coverage-summary-panel">
        <div className="section-heading"><div><span className="eyebrow">KEPUTUSAN TERPERINCI</span><h2>Liputan scoresheet</h2></div></div>
        <CoverageStatus covered={scoresheets.metadata.coveredSeats} total={scoresheets.metadata.totalSeats} label="kerusi" status={scoresheetStatus}/>
        <p>{scoresheets.metadata.coveredSeats} daripada {scoresheets.metadata.totalSeats} kerusi Parlimen mempunyai keputusan saluran. Perbezaan bilangan PDM kekal eksplisit dan tidak diisi secara andaian.</p>
      </article>
      <article className="panel coverage-summary-panel">
        <div className="section-heading"><div><span className="eyebrow">DPT RASMI SPR</span><h2>Liputan lokaliti</h2></div></div>
        <CoverageStatus covered={geography.metadata.localityPdmCount} total={geography.metadata.pdmCount} label="PDM" status={localityStatus}/>
        <p>{geography.metadata.localitySourceCount} dokumen sumber · {snapshotRange.from ?? "—"} hingga {snapshotRange.to ?? "—"}. PDM tanpa sumber kekal ditanda belum tersedia.</p>
      </article>
    </section>
    {!!scoresheets.unavailableSeats?.length && <section className="panel coverage-table-panel">
      <div className="section-heading"><div><span className="eyebrow">JURANG SUMBER PRU-14</span><h2>Kerusi tanpa scoresheet diterbitkan</h2><p>Fail yang tiada dan fail yang gagal imbangan dilaporkan berasingan; tiada nilai saluran direka.</p></div><div><span className="route-count">{scoresheets.unavailableSeats.length} KERUSI</span><Link className="section-action" to="/pru/14/audit">Buka audit penuh <Icon name="arrow" size={15}/></Link></div></div>
      <div className="table-responsive"><table className="table coverage-table"><thead><tr><th>Kerusi</th><th>Negeri</th><th>Status</th><th>Sebab</th></tr></thead><tbody>{scoresheets.unavailableSeats.map((item) => <tr key={item.parliamentCode}><th scope="row">{item.parliamentCode} {item.parliamentName}</th><td>{item.state}</td><td>{item.category === "rejected-source" ? "DITOLAK AUDIT" : "TIADA SUMBER"}</td><td>{item.reason}</td></tr>)}</tbody></table></div>
    </section>}
    <section className="panel coverage-table-panel">
      <div className="section-heading"><div><span className="eyebrow">LIPUTAN MENGIKUT NEGERI</span><h2>Hierarki dan lokaliti</h2><p>Bilangan lokaliti hanya datang daripada dokumen DPT rasmi yang telah diarkibkan.</p></div><span className="route-count">{stateRows.length} negeri / wilayah</span></div>
      <div className="table-responsive">
        <table className="table coverage-table">
          <thead><tr><th>Negeri</th><th className="text-end">Parlimen</th><th className="text-end">DUN</th><th className="text-end">PDM</th><th className="text-end">Scoresheet</th><th className="text-end">Lokaliti</th><th>Liputan PDM</th></tr></thead>
          <tbody>{stateRows.map((row) => <tr key={row.id}>
            <th scope="row">{row.name}</th><td className="text-end">{row.parliamentCount}</td><td className="text-end">{row.dunCount}</td><td className="text-end">{formatNumber(row.pdmCount)}</td><td className="text-end">{formatNumber(row.scoresheetPdmCount)}</td><td className="text-end">{formatNumber(row.localityCount)}</td>
            <td><div className="coverage-row-meter"><span><i style={{ width: `${row.localityCoveragePct}%` }}/></span><strong>{pct(row.localityCoveragePct)}</strong></div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
    <section className="panel coverage-table-panel">
      <div className="section-heading"><div><span className="eyebrow">SNAPSHOT SEMPADAN</span><h2>Versi geometri yang dikunci</h2><p>Setiap rekod merujuk fail snapshot dan hash geometri negeri yang boleh disahkan semula.</p></div></div>
      {boundaryRegistry.error ? <p className="form-error">Registry sempadan tidak dapat dimuatkan: {boundaryRegistry.error}</p> : !boundaryRegistry.value ? <p>Memuatkan registry sempadan…</p> : <div className="boundary-coverage-grid">{boundaryRows.map((row) => <article key={row.id} className={`boundary-coverage-item is-${row.status}`}>
        <div><span>{row.scope}</span><strong>{row.label}</strong></div>
        <dl><div><dt>Status</dt><dd>{row.status === "exact" ? "Tepat" : row.status === "compatible" ? "Serasi" : row.status === "identity-only" ? "Identiti sahaja" : "Anggaran"}</dd></div><div><dt>Negeri</dt><dd>{row.stateCount}</dd></div><div><dt>Hash tepat</dt><dd>{row.exactStateCount}/{row.stateCount}</dd></div></dl>
        <code>{row.snapshotFile}</code>
      </article>)}</div>}
    </section>
  </>;
}
