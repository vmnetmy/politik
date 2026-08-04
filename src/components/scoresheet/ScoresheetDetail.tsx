import { useEffect, useMemo, useState } from "react";
import type { ElectionData, PollingPlacesData, ScoresheetIndexEntry, ScoresheetResult, ScoresheetSection, Seat } from "../../types";
import { formatNumber, formatPct, formatShortDate, normalise } from "../../utils";
import { Icon } from "../ui/Icon";
import { TableShell } from "../ui/TableShell";
import { AsyncState } from "../ui/AsyncState";
import { ScoresheetChart } from "./ScoresheetChart";
import { useElection } from "../../ElectionContext";

const SECTION_LABELS: Record<ScoresheetSection, string> = { postal: "Undi pos", early: "Undi awal", ordinary: "Undi biasa" };

export function ScoresheetDetail({ seat, data, indexEntry, unavailableReason, pollingPlaces }: { seat: Seat; data: ElectionData; indexEntry?: ScoresheetIndexEntry; unavailableReason?: string; pollingPlaces: PollingPlacesData }) {
  const { edition } = useElection();
  const [result, setResult] = useState<ScoresheetResult | null>(null);
  const [error, setError] = useState("");
  const [resolvedPollingPlaces, setResolvedPollingPlaces] = useState(pollingPlaces);
  const [section, setSection] = useState<"all" | ScoresheetSection>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!indexEntry) return;
    let active = true;
    fetch(`${edition.dataPath}/scoresheets/${seat.code}.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then((scoresheet) => {
      if (!active) return;
      setResult(scoresheet);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [edition.dataPath, indexEntry, seat.code]);

  useEffect(() => {
    if (!indexEntry?.pollingPlacesFile) {
      setResolvedPollingPlaces(pollingPlaces);
      return;
    }
    let active = true;
    fetch(`${edition.dataPath}/${indexEntry.pollingPlacesFile}`)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((places) => active && setResolvedPollingPlaces(places))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [edition.dataPath, indexEntry?.pollingPlacesFile, pollingPlaces]);

  const groups = useMemo(() => {
    if (!result) return [];
    const districts = new Map(resolvedPollingPlaces.pollingDistricts.map((item) => [item.id, item]));
    const centres = new Map(resolvedPollingPlaces.pollingCentres.map((item) => [item.id, item]));
    const grouped = new Map<string, {
      id: string;
      code: string;
      name: string;
      section: ScoresheetSection;
      centres: Set<string>;
      streams: number;
      valid: number;
      rejected: number;
      unreturned: number;
      candidateVotes: Record<string, number>;
    }>();
    result.rows.forEach((row) => {
      if (section !== "all" && row.section !== section) return;
      const district = row.pollingDistrictId ? districts.get(row.pollingDistrictId) : undefined;
      const centre = row.pollingCentreId ? centres.get(row.pollingCentreId) : undefined;
      const id = row.pollingDistrictId ?? `${seat.code}:postal`;
      const record = grouped.get(id) ?? {
        id,
        code: district?.code ?? "POS",
        name: district?.name ?? "UNDI POS",
        section: row.section,
        centres: new Set<string>(),
        streams: 0,
        valid: 0,
        rejected: 0,
        unreturned: 0,
        candidateVotes: {},
      };
      if (centre) record.centres.add(centre.name);
      record.streams += 1;
      record.valid += row.validVotes;
      record.rejected += row.rejectedVotes;
      record.unreturned += row.unreturnedVotes;
      Object.entries(row.candidateVotes).forEach(([candidateId, votes]) => { record.candidateVotes[candidateId] = (record.candidateVotes[candidateId] ?? 0) + votes; });
      grouped.set(id, record);
    });
    return [...grouped.values()].filter((record) => !query || [record.code, record.name, ...record.centres].some((value) => normalise(value).includes(normalise(query))));
  }, [query, resolvedPollingPlaces, result, seat.code, section]);

  if (!indexEntry) return <AsyncState kind="empty" title="Helaian mata terperinci belum tersedia" description={unavailableReason ?? `Keputusan agregat ${edition.shortTitle} masih dipaparkan. Sumber mengikut daerah mengundi dan saluran belum ada dalam arkib untuk ${seat.code}.`} className="scoresheet-unavailable"/>;
  if (error) return <AsyncState kind="error" title="Data terperinci tidak dapat dimuatkan" description={error} className="scoresheet-unavailable is-error"/>;
  if (!result) return <AsyncState kind="loading" title={`Memuatkan ${formatNumber(indexEntry.rowCount)} rekod saluran`} className="scoresheet-loading"/>;

  const isOfficialScoresheet = indexEntry.sourceType.startsWith("spr-");
  const officialSourceLabel = indexEntry.sourceType === "spr-760" ? "HELAIAN MATA SPR 760" : "HELAIAN MATA SPR";
  const sourceDateLabel = indexEntry.sourceType === "spr-760" ? "Dicetak" : "Tarikh pilihan raya";

  return <section className="scoresheet-section">
    <div className="scoresheet-heading"><div><span className="eyebrow">{isOfficialScoresheet ? officialSourceLabel : `DATA SALURAN ${edition.shortTitle}`}</span><h2>Keputusan mengikut saluran</h2><p>{formatNumber(result.totals.pollingStreams)} saluran daripada {formatNumber(indexEntry.pollingDistrictCount)} kumpulan daerah mengundi. {isOfficialScoresheet ? "Angka bersumber terus daripada scoresheet SPR yang diarkibkan." : "Kerusi tanpa scoresheet SPR dilengkapkan daripada dataset undi calon dan statistik saluran terbuka."}</p></div><span className={`scoresheet-source-status${isOfficialScoresheet ? " is-authoritative" : ""}`}>{isOfficialScoresheet ? "SUMBER RASMI" : "DATA TERBUKA · CC0"}</span></div>
    <div className="scoresheet-kpis"><article><span>KERTAS DALAM PETI</span><strong>{formatNumber(result.totals.ballotsInBox)}</strong></article><article><span>UNDI SAH</span><strong>{formatNumber(result.totals.validVotes)}</strong><small>{formatPct(result.totals.validVotes / result.registeredVoters)}</small></article><article><span>UNDI DITOLAK</span><strong>{formatNumber(result.totals.rejectedVotes)}</strong></article><article><span>TIDAK DIKEMBALIKAN</span><strong>{formatNumber(result.totals.unreturnedVotes)}</strong></article></div>
    <div className="scoresheet-dashboard"><article className="panel scoresheet-chart-panel"><div className="section-heading"><div><span className="eyebrow">CORAK PENGUNDIAN</span><h3>Pos, awal dan biasa</h3></div></div><ScoresheetChart result={result} data={data}/></article><aside className="panel scoresheet-accounting"><span className="eyebrow">IMBANGAN KERTAS UNDI</span><h3>A = B + C + D</h3><p>Setiap satu daripada {formatNumber(result.rows.length)} rekod melepasi semakan perakaunan automatik.</p><div><span>Undi sah (B)</span><strong>{formatNumber(result.totals.validVotes)}</strong></div><div><span>Ditolak (C)</span><strong>{formatNumber(result.totals.rejectedVotes)}</strong></div><div><span>Tidak kembali (D)</span><strong>{formatNumber(result.totals.unreturnedVotes)}</strong></div></aside></div>
    <article className="panel scoresheet-table-panel"><div className="scoresheet-controls"><div className="scoresheet-section-filter"><button className={section === "all" ? "active" : ""} onClick={() => setSection("all")}>Semua</button>{(["postal", "early", "ordinary"] as ScoresheetSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{SECTION_LABELS[item]}</button>)}</div><label><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari daerah atau pusat mengundi"/></label></div>
      <TableShell label="Keputusan mengikut daerah dan pusat mengundi" className="scoresheet-table-wrap"><table><thead><tr><th>DAERAH / PUSAT</th><th>SALURAN</th>{result.candidateColumns.map((column) => <th key={column.candidateId}>{column.candidateName}</th>)}<th>SAH</th><th>DITOLAK</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id}><td><span>{group.code} · {SECTION_LABELS[group.section]}</span><strong>{group.name}</strong><small>{[...group.centres].join(" · ") || "—"}</small></td><td>{group.streams}</td>{result.candidateColumns.map((column) => <td key={column.candidateId}>{formatNumber(group.candidateVotes[column.candidateId] ?? 0)}</td>)}<td><strong>{formatNumber(group.valid)}</strong></td><td>{formatNumber(group.rejected)}</td></tr>)}</tbody></table></TableShell>
      {!groups.length && <div className="history-empty"><p>Tiada daerah mengundi sepadan dengan carian ini.</p></div>}
    </article>
    <aside className="storage-note scoresheet-provenance"><Icon name="database" size={19}/><div><strong>{result.metadata.sourceFile}</strong><p>{isOfficialScoresheet ? sourceDateLabel : "Tarikh data"} {formatShortDate(result.metadata.printDate)} · SHA-256 {result.metadata.sourceSha256}</p></div></aside>
  </section>;
}
