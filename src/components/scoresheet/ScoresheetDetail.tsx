import { useEffect, useMemo, useState } from "react";
import type { ElectionData, PollingPlacesData, ScoresheetIndexEntry, ScoresheetResult, ScoresheetSection, Seat } from "../../types";
import { formatNumber, formatPct, normalise } from "../../utils";
import { Icon } from "../ui/Icon";
import { ScoresheetChart } from "./ScoresheetChart";

const SECTION_LABELS: Record<ScoresheetSection, string> = { postal: "Undi pos", early: "Undi awal", ordinary: "Undi biasa" };

export function ScoresheetDetail({ seat, data, indexEntry }: { seat: Seat; data: ElectionData; indexEntry?: ScoresheetIndexEntry }) {
  const [result, setResult] = useState<ScoresheetResult | null>(null);
  const [places, setPlaces] = useState<PollingPlacesData | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<"all" | ScoresheetSection>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!indexEntry) return;
    let active = true;
    Promise.all([
      fetch(`/data/scoresheets/${seat.code}.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch("/data/polling-places.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
    ]).then(([scoresheet, pollingPlaces]) => {
      if (!active) return;
      setResult(scoresheet);
      setPlaces(pollingPlaces);
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [indexEntry, seat.code]);

  const groups = useMemo(() => {
    if (!result || !places) return [];
    const districts = new Map(places.pollingDistricts.map((item) => [item.id, item]));
    const centres = new Map(places.pollingCentres.map((item) => [item.id, item]));
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
  }, [places, query, result, seat.code, section]);

  if (!indexEntry) return <section className="scoresheet-unavailable"><Icon name="info" size={20}/><div><strong>Helaian mata terperinci belum tersedia</strong><p>Keputusan agregat PRU-15 masih dipaparkan. Sumber mengikut daerah mengundi dan saluran belum ada dalam arkib untuk {seat.code}.</p></div></section>;
  if (error) return <section className="scoresheet-unavailable is-error"><Icon name="info" size={20}/><div><strong>Data terperinci tidak dapat dimuatkan</strong><p>{error}</p></div></section>;
  if (!result || !places) return <section className="scoresheet-loading"><span/><p>Memuatkan {formatNumber(indexEntry.rowCount)} rekod saluran…</p></section>;

  return <section className="scoresheet-section">
    <div className="scoresheet-heading"><div><span className="eyebrow">HELAIAN MATA SPR 760</span><h2>Keputusan mengikut saluran</h2><p>{formatNumber(result.totals.pollingStreams)} saluran daripada {formatNumber(indexEntry.pollingDistrictCount)} kumpulan daerah mengundi. Data ini dimuatkan hanya untuk kerusi yang sedang dilihat.</p></div><span className={`scoresheet-source-status is-${indexEntry.status}`}>{indexEntry.status === "matched" ? "SEPADAN" : "PERLU SEMAKAN"}</span></div>
    <div className="scoresheet-kpis"><article><span>KERTAS DALAM PETI</span><strong>{formatNumber(result.totals.ballotsInBox)}</strong></article><article><span>UNDI SAH</span><strong>{formatNumber(result.totals.validVotes)}</strong><small>{formatPct(result.totals.validVotes / result.registeredVoters)}</small></article><article><span>UNDI DITOLAK</span><strong>{formatNumber(result.totals.rejectedVotes)}</strong></article><article><span>TIDAK DIKEMBALIKAN</span><strong>{formatNumber(result.totals.unreturnedVotes)}</strong></article></div>
    <div className="scoresheet-dashboard"><article className="panel scoresheet-chart-panel"><div className="section-heading"><div><span className="eyebrow">CORAK PENGUNDIAN</span><h3>Pos, awal dan biasa</h3></div></div><ScoresheetChart result={result} data={data}/></article><aside className="panel scoresheet-accounting"><span className="eyebrow">IMBANGAN KERTAS UNDI</span><h3>A = B + C + D</h3><p>Setiap satu daripada {formatNumber(result.rows.length)} rekod melepasi semakan perakaunan automatik.</p><div><span>Undi sah (B)</span><strong>{formatNumber(result.totals.validVotes)}</strong></div><div><span>Ditolak (C)</span><strong>{formatNumber(result.totals.rejectedVotes)}</strong></div><div><span>Tidak kembali (D)</span><strong>{formatNumber(result.totals.unreturnedVotes)}</strong></div></aside></div>
    <article className="panel scoresheet-table-panel"><div className="scoresheet-controls"><div className="scoresheet-section-filter"><button className={section === "all" ? "active" : ""} onClick={() => setSection("all")}>Semua</button>{(["postal", "early", "ordinary"] as ScoresheetSection[]).map((item) => <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>{SECTION_LABELS[item]}</button>)}</div><label><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari daerah atau pusat mengundi"/></label></div>
      <div className="scoresheet-table-wrap"><table><thead><tr><th>DAERAH / PUSAT</th><th>SALURAN</th>{result.candidateColumns.map((column) => <th key={column.candidateId}>{column.candidateName}</th>)}<th>SAH</th><th>DITOLAK</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id}><td><span>{group.code} · {SECTION_LABELS[group.section]}</span><strong>{group.name}</strong><small>{[...group.centres].join(" · ") || "—"}</small></td><td>{group.streams}</td>{result.candidateColumns.map((column) => <td key={column.candidateId}>{formatNumber(group.candidateVotes[column.candidateId] ?? 0)}</td>)}<td><strong>{formatNumber(group.valid)}</strong></td><td>{formatNumber(group.rejected)}</td></tr>)}</tbody></table></div>
      {!groups.length && <div className="history-empty"><p>Tiada daerah mengundi sepadan dengan carian ini.</p></div>}
    </article>
    <aside className="storage-note scoresheet-provenance"><Icon name="database" size={19}/><div><strong>{result.metadata.sourceFile}</strong><p>Dicetak {result.metadata.printDate} · SHA-256 {result.metadata.sourceSha256}</p></div></aside>
  </section>;
}
