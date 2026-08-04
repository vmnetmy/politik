import { useEffect, useMemo, useState } from "react";
import type { StateElectionContest, StateScoresheetIndex, StateScoresheetResult } from "../../types";
import { formatNumber, formatShortDate, normalise } from "../../utils";
import { AsyncState } from "../ui/AsyncState";
import { Icon } from "../ui/Icon";
import { TableShell } from "../ui/TableShell";

export function StateScoresheetDetail({ contest, assemblyNumber }: { contest: StateElectionContest; assemblyNumber: number }) {
  const [index, setIndex] = useState<StateScoresheetIndex | null>(null);
  const [result, setResult] = useState<StateScoresheetResult | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const base = `/data/state-election-scoresheets/prn-${assemblyNumber}`;
    fetch(`${base}/index.json`)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(async (loadedIndex: StateScoresheetIndex) => {
        if (!active) return;
        setIndex(loadedIndex);
        const entry = loadedIndex.contests.find((item) => item.contestId === contest.id);
        if (!entry) return;
        const response = await fetch(`${base}/${entry.resultFile}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const loadedResult = await response.json();
        if (active) setResult(loadedResult);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [assemblyNumber, contest.id]);

  const groups = useMemo(() => {
    if (!result) return [];
    const districts = new Map(result.pollingDistricts.map((item) => [item.id, item]));
    const centres = new Map(result.pollingCentres.map((item) => [item.id, item]));
    const grouped = new Map<string, {
      id: string;
      code: string;
      name: string;
      centres: Set<string>;
      streams: number;
      valid: number;
      rejected: number;
      candidateVotes: Record<string, number>;
    }>();
    result.rows.forEach((row) => {
      const district = row.pollingDistrictId ? districts.get(row.pollingDistrictId) : undefined;
      const centre = row.pollingCentreId ? centres.get(row.pollingCentreId) : undefined;
      const id = row.pollingDistrictId ?? `${contest.id}:postal`;
      const record = grouped.get(id) ?? {
        id,
        code: district?.code ?? "POS",
        name: district?.name ?? "UNDI POS",
        centres: new Set<string>(),
        streams: 0,
        valid: 0,
        rejected: 0,
        candidateVotes: {},
      };
      if (centre) record.centres.add(centre.name);
      record.streams += 1;
      record.valid += row.validVotes;
      record.rejected += row.rejectedVotes;
      Object.entries(row.candidateVotes).forEach(([candidateId, votes]) => {
        record.candidateVotes[candidateId] = (record.candidateVotes[candidateId] ?? 0) + votes;
      });
      grouped.set(id, record);
    });
    const needle = normalise(query);
    return [...grouped.values()].filter((item) => !needle || [item.code, item.name, ...item.centres].some((value) => normalise(value).includes(needle)));
  }, [contest.id, query, result]);

  if (error) return <AsyncState kind="error" title="Data saluran DUN tidak dapat dimuatkan" description={error} className="scoresheet-unavailable is-error"/>;
  if (!index) return <AsyncState kind="loading" title="Memuatkan indeks helaian mata DUN" className="scoresheet-loading"/>;
  if (!result) {
    const unavailable = index.unavailableContests.find((item) => item.contestId === contest.id);
    return <AsyncState kind="empty" title="Helaian mata DUN tidak tersedia" description={unavailable?.reason ?? "Tiada sumber saluran yang disahkan untuk pertandingan ini."} className="scoresheet-unavailable"/>;
  }

  return <section className="scoresheet-section state-scoresheet-section">
    <div className="scoresheet-heading"><div><span className="eyebrow">HELAIAN MATA SPR · DUN</span><h2>Keputusan mengikut saluran</h2><p>{formatNumber(result.totals.pollingStreams)} saluran daripada {formatNumber(result.pollingDistricts.length)} daerah mengundi yang melepasi semakan imbangan automatik.</p></div><span className="scoresheet-source-status is-authoritative">SUMBER RASMI</span></div>
    <div className="scoresheet-kpis"><article><span>KERTAS DALAM PETI</span><strong>{formatNumber(result.totals.ballotsInBox)}</strong></article><article><span>UNDI SAH</span><strong>{formatNumber(result.totals.validVotes)}</strong></article><article><span>UNDI DITOLAK</span><strong>{formatNumber(result.totals.rejectedVotes)}</strong></article><article><span>TIDAK DIKEMBALIKAN</span><strong>{formatNumber(result.totals.unreturnedVotes)}</strong></article></div>
    <article className="panel scoresheet-table-panel"><div className="scoresheet-controls"><div><span className="eyebrow">DAERAH MENGUNDI</span></div><label><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari daerah atau pusat mengundi"/></label></div>
      <TableShell label="Keputusan DUN mengikut daerah mengundi" className="scoresheet-table-wrap"><table><thead><tr><th>DAERAH / PUSAT</th><th>SALURAN</th>{result.candidateColumns.map((column) => <th key={column.candidateId}>{column.candidateName}</th>)}<th>SAH</th><th>DITOLAK</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id}><td><span>{group.code}</span><strong>{group.name}</strong><small>{[...group.centres].join(" · ") || "—"}</small></td><td>{group.streams}</td>{result.candidateColumns.map((column) => <td key={column.candidateId}>{formatNumber(group.candidateVotes[column.candidateId] ?? 0)}</td>)}<td><strong>{formatNumber(group.valid)}</strong></td><td>{formatNumber(group.rejected)}</td></tr>)}</tbody></table></TableShell>
      {!groups.length && <div className="history-empty"><p>Tiada daerah mengundi sepadan dengan carian ini.</p></div>}
    </article>
    <aside className="storage-note scoresheet-provenance"><Icon name="database" size={19}/><div><strong>{result.metadata.sourceFile}</strong><p>Tarikh pilihan raya {formatShortDate(result.metadata.electionDate)} · SHA-256 {result.metadata.sourceSha256}</p></div></aside>
  </section>;
}
