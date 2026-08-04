import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { ATLAS_COMPARISON_METRICS, ATLAS_METRICS, atlasSearchParams, atlasStateWith, quantileThresholds, readAtlasUrlState, thresholdIndex } from "../atlas";
import { TicketLogo } from "../components/identity";
import { AtlasIntro } from "../components/maps/AtlasIntro";
import { AtlasMapViewport } from "../components/maps/AtlasMapViewport";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { CoverageStatus } from "../components/ui/CoverageStatus";
import { coverageStatus } from "../data/coverage";
import { ELECTION_EDITIONS } from "../elections";
import { useAtlasBoundaries, useAtlasBoundaryRegistry, useAtlasHierarchy, useAtlasStateBoundaries, useFederalAtlasEdition } from "../data/hooks/useElectionAtlas";
import { useFederalElectionComparisonData } from "../data/hooks/useFederalElectionComparisonData";
import { useStateElectionData, type LoadedStateElectionData } from "../data/hooks/useStateElectionData";
import { contestWinner, ticketColor } from "../data/stateElectionUtils";
import type { AtlasBoundaryCollection, AtlasBoundaryFeature, AtlasElectionType, AtlasMetric, AtlasUrlState, BoundaryRegistryEntry, BoundaryRegistryStateEntry } from "../data/types/atlas";
import { stateDunResultPath, stateParliamentPath } from "../routes";
import { recordInteraction } from "../telemetry";
import type { ElectionData } from "../types";
import { allianceColor, formatDatesInText, formatNumber, formatPct, shortAlliance, toSlug } from "../utils";

const MAP_WIDTH = 1200;
const MAP_HEIGHT = 700;
const MAJORITY_COLORS = ["#dce5eb", "#9eb5c5", "#587f9f", "#20364b"];
const TURNOUT_COLORS = ["#ece2c7", "#d7bd72", "#83999e", "#29586a"];
const NEGATIVE_COLORS = ["#f0cbc5", "#df7d72", "#b7443c"];
const POSITIVE_COLORS = ["#c9d9e5", "#789fbd", "#295f87"];
const NO_DATA_COLOR = "#dcd9d0";

type AtlasResult = {
  featureId: string;
  code: string;
  name: string;
  stateId: string;
  stateName: string;
  winnerLabel: string;
  winnerName: string;
  winnerVotes: number;
  winnerShare: number;
  majority: number;
  turnoutPct: number | null;
  registered: number | null;
  candidateCount: number;
  color: string;
  resultPath: string;
  ticketShares: Record<string, number>;
  searchTerms: string[];
  previousWinnerLabel?: string;
  comparisonValue?: number | null;
  changed?: boolean;
};

type SearchEntry = { label: string; stateId: string; seatId: string };
type SortKey = "code" | "state" | "winner" | "majority" | "turnout";
type PublishedAtlasAnnotation = { constituencyId: string; title: string; body: string };

function viewBoxForBounds(bounds: [[number, number], [number, number]]) {
  const [[minX, minY], [maxX, maxY]] = bounds;
  const rawWidth = Math.max(maxX - minX, 22);
  const rawHeight = Math.max(maxY - minY, 22);
  const padding = Math.max(rawWidth, rawHeight) * .1;
  let width = rawWidth + padding * 2;
  let height = rawHeight + padding * 2;
  const targetRatio = MAP_WIDTH / MAP_HEIGHT;
  if (width / height > targetRatio) height = width / targetRatio;
  else width = height * targetRatio;
  return `${(minX + maxX) / 2 - width / 2} ${(minY + maxY) / 2 - height / 2} ${width} ${height}`;
}

function formatMetricValue(metric: AtlasMetric, value: number) {
  if (metric === "keluar-mengundi" || metric === "perubahan-turnout" || metric === "swing") {
    return `${value >= 0 && ATLAS_COMPARISON_METRICS.has(metric) ? "+" : ""}${(value * 100).toFixed(1)}%`;
  }
  return formatNumber(Math.round(value));
}

function ticketShares(values: Array<{ label: string; votes: number }>) {
  const total = values.reduce((sum, value) => sum + value.votes, 0);
  const grouped: Record<string, number> = {};
  values.forEach((value) => { grouped[value.label] = (grouped[value.label] ?? 0) + value.votes; });
  Object.keys(grouped).forEach((label) => { grouped[label] = total ? grouped[label] / total : 0; });
  return grouped;
}

function buildFederalResults(data: ElectionData, edition: number): AtlasResult[] {
  return data.seats.map((seat) => {
    const winnerLabel = shortAlliance(seat.winner.alliance, data.alliances);
    return {
      featureId: seat.code,
      code: seat.code,
      name: seat.name,
      stateId: toSlug(seat.state),
      stateName: seat.state,
      winnerLabel,
      winnerName: seat.winner.name,
      winnerVotes: seat.winner.votes,
      winnerShare: seat.winner.share,
      majority: seat.marginVotes,
      turnoutPct: seat.turnoutPct,
      registered: seat.registered,
      candidateCount: seat.candidateCount,
      color: allianceColor(seat.winner.alliance, data.alliances),
      resultPath: stateParliamentPath(edition, toSlug(seat.state), toSlug(seat.name)),
      ticketShares: ticketShares(seat.candidates.map((candidate) => ({ label: shortAlliance(candidate.alliance, data.alliances), votes: candidate.votes }))),
      searchTerms: seat.candidates.flatMap((candidate) => [candidate.name, candidate.party, shortAlliance(candidate.alliance, data.alliances)]),
    };
  });
}

function buildStateResults(value: LoadedStateElectionData, edition: number): AtlasResult[] {
  const events = value.results.events.filter((event) => event.assemblyNumber === edition);
  const eventIds = new Set(events.map((event) => event.id));
  const duns = new Map(value.constituencies.duns.map((dun) => [dun.id, dun]));
  const states = new Map(value.constituencies.states.map((state) => [state.id, state.name]));
  return value.results.contests.filter((contest) => eventIds.has(contest.eventId)).map((contest) => {
    const dun = duns.get(contest.dunId)!;
    const winner = contestWinner(contest);
    return {
      featureId: contest.dunId,
      code: dun.code,
      name: dun.name,
      stateId: contest.stateId,
      stateName: states.get(contest.stateId) ?? contest.stateId,
      winnerLabel: winner.shortName,
      winnerName: winner.name,
      winnerVotes: winner.votes,
      winnerShare: winner.share,
      majority: contest.majorityVotes,
      turnoutPct: contest.turnoutPct,
      registered: contest.registeredVoters,
      candidateCount: contest.candidates.length,
      color: ticketColor(winner.shortName),
      resultPath: stateDunResultPath(contest.stateId, edition, toSlug(dun.name)),
      ticketShares: ticketShares(contest.candidates.map((candidate) => ({ label: candidate.shortName, votes: candidate.votes }))),
      searchTerms: contest.candidates.flatMap((candidate) => [candidate.name, candidate.party, candidate.shortName]),
    };
  });
}

function withComparison(current: AtlasResult[], baseline: AtlasResult[], metric: AtlasMetric) {
  const previous = new Map(baseline.map((result) => [result.featureId, result]));
  return current.map((result) => {
    const before = previous.get(result.featureId);
    let comparisonValue: number | null = null;
    if (before) {
      if (metric === "perubahan-majoriti") comparisonValue = result.majority - before.majority;
      else if (metric === "perubahan-turnout") comparisonValue = result.turnoutPct === null || before.turnoutPct === null ? null : result.turnoutPct - before.turnoutPct;
      else if (metric === "swing") comparisonValue = result.ticketShares[result.winnerLabel] - (before.ticketShares[result.winnerLabel] ?? 0);
    }
    return {
      ...result,
      previousWinnerLabel: before?.winnerLabel,
      changed: Boolean(before && before.winnerLabel !== result.winnerLabel),
      comparisonValue,
    };
  });
}

function AtlasLoading({ error }: { error?: string }) {
  return <>
    <PageTitle title="Atlas Pilihan Raya Malaysia"/>
    {!document.getElementById("atlas-static-intro") && <AtlasIntro/>}
    <section className={`route-loading atlas-route-loading ${error ? "age-error" : ""}`}>{error ? `Atlas tidak dapat dimuatkan: ${error}` : "Membina atlas pilihan raya Malaysia…"}</section>
  </>;
}

function MetricLegend({ metric, results }: { metric: AtlasMetric; results: AtlasResult[] }) {
  if (metric === "pemenang") {
    const categories = new Map<string, { count: number; color: string }>();
    results.forEach((result) => {
      const current = categories.get(result.winnerLabel) ?? { count: 0, color: result.color };
      current.count += 1;
      categories.set(result.winnerLabel, current);
    });
    const ranked = [...categories.entries()].sort((a, b) => b[1].count - a[1].count);
    return <div className="atlas-category-legend" aria-label="Petunjuk pemenang">
      {ranked.slice(0, 9).map(([label, item]) => <span key={label}><i style={{ background: item.color }}/><b>{label}</b><small>{item.count}</small></span>)}
      {ranked.length > 9 && <span className="atlas-other-legend"><i/><b>Lain-lain</b><small>{ranked.slice(9).reduce((sum, [, item]) => sum + item.count, 0)}</small></span>}
      <span className="atlas-no-data-legend"><i/><b>Tiada data</b></span>
    </div>;
  }
  if (metric === "bertukar") {
    const changed = results.filter((result) => result.changed).length;
    return <div className="atlas-category-legend" aria-label="Petunjuk pertukaran kerusi"><span><i style={{ background: "#d5a62e" }}/><b>Bertukar</b><small>{changed}</small></span><span><i style={{ background: "#435f77" }}/><b>Kekal</b><small>{results.length - changed}</small></span><span className="atlas-no-data-legend"><i/><b>Tiada padanan</b></span></div>;
  }
  const comparison = ATLAS_COMPARISON_METRICS.has(metric);
  const values = results.map((result) => comparison ? result.comparisonValue : metric === "majoriti" ? result.majority : result.turnoutPct).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (comparison) return <div className="atlas-diverging-legend"><span>Menurun</span><div>{[...NEGATIVE_COLORS].reverse().map((color) => <i key={color} style={{ background: color }}/>)}<i style={{ background: "#e7e4dc" }}/>{POSITIVE_COLORS.map((color) => <i key={color} style={{ background: color }}/>)}</div><span>Meningkat</span></div>;
  const thresholds = quantileThresholds(values);
  const colors = metric === "majoriti" ? MAJORITY_COLORS : TURNOUT_COLORS;
  return <div className="atlas-scale-legend" aria-label={`Skala ${metric}`}><span>Rendah</span><div>{colors.map((color) => <i key={color} style={{ background: color }}/>)}</div><span>Tinggi</span><small>Kuartil: {thresholds.map((value) => formatMetricValue(metric, value)).join(" · ")}</small></div>;
}

function ResultDetail({ result, electionType, edition, compareEdition, annotations = [] }: { result: AtlasResult; electionType: AtlasElectionType; edition: number; compareEdition: number | null; annotations?: PublishedAtlasAnnotation[] }) {
  const rankedShares = Object.entries(result.ticketShares).sort((left, right) => right[1] - left[1]);
  const marginShare = (rankedShares[0]?.[1] ?? 0) - (rankedShares[1]?.[1] ?? 0);
  const insights = [
    marginShare <= .05 ? `Pertandingan sengit: jurang dua tiket teratas hanya ${(marginShare * 100).toFixed(1)} mata.` : "",
    result.changed && result.previousWinnerLabel ? `Kerusi bertukar daripada ${result.previousWinnerLabel} kepada ${result.winnerLabel}.` : "",
    result.turnoutPct !== null && result.turnoutPct >= .8 ? `Keluar mengundi tinggi pada ${(result.turnoutPct * 100).toFixed(1)}%.` : "",
    result.turnoutPct !== null && result.turnoutPct < .6 ? `Keluar mengundi di bawah 60%, pada ${(result.turnoutPct * 100).toFixed(1)}%.` : "",
    result.comparisonValue !== null && result.comparisonValue !== undefined && Math.abs(result.comparisonValue) >= .08 ? `Perubahan ketara berbanding edisi perbandingan: ${result.comparisonValue > 0 ? "+" : ""}${(result.comparisonValue * 100).toFixed(1)} mata.` : "",
  ].filter(Boolean);
  return <>
    <div className="atlas-detail-code"><span>{result.code}</span><span>{result.stateName}</span></div>
    <h2>{result.name}</h2>
    <div className="atlas-detail-winner"><TicketLogo name={result.winnerLabel} shortName={result.winnerLabel}/><div><span>PEMENANG {electionType.toUpperCase()}-{edition}</span><strong>{result.winnerName}</strong><small>{result.winnerLabel}</small></div></div>
    {result.previousWinnerLabel && compareEdition !== null && <div className="atlas-comparison-note"><span>{electionType.toUpperCase()}-{compareEdition}</span><strong>{result.previousWinnerLabel} → {result.winnerLabel}</strong></div>}
    <dl className="atlas-detail-stats">
      <div><dt>Undi</dt><dd>{formatNumber(result.winnerVotes)}</dd></div>
      <div><dt>Bahagian undi</dt><dd>{formatPct(result.winnerShare, 2)}</dd></div>
      <div><dt>Majoriti</dt><dd>{formatNumber(result.majority)}</dd></div>
      <div><dt>Keluar mengundi</dt><dd>{result.turnoutPct === null ? "—" : formatPct(result.turnoutPct, 2)}</dd></div>
    </dl>
    <div className="atlas-detail-meta"><span>{result.registered === null ? "—" : formatNumber(result.registered)} pemilih</span><span>{result.candidateCount} calon</span></div>
    <Link to={result.resultPath}>Lihat keputusan penuh <Icon name="arrow" size={17}/></Link>
    {(annotations.length > 0 || insights.length > 0) && <div className="atlas-editorial-insights"><span>CATATAN ATLAS</span>{annotations.map((annotation) => <p key={`${annotation.constituencyId}:${annotation.title}`}><strong>{annotation.title}</strong>{annotation.body}</p>)}{insights.map((insight) => <p key={insight}>{insight}</p>)}</div>}
  </>;
}

function ScopeDetail({ electionType, stateName, results }: { electionType: AtlasElectionType; stateName: string; results: AtlasResult[] }) {
  const leaders = new Map<string, { count: number; color: string }>();
  results.forEach((result) => {
    const current = leaders.get(result.winnerLabel) ?? { count: 0, color: result.color };
    current.count += 1;
    leaders.set(result.winnerLabel, current);
  });
  const leader = [...leaders.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  const registered = results.reduce((sum, result) => sum + (result.registered ?? 0), 0);
  const turnoutBase = results.filter((result) => result.registered !== null && result.turnoutPct !== null);
  const turnoutRegistered = turnoutBase.reduce((sum, result) => sum + result.registered!, 0);
  const weightedTurnout = turnoutBase.reduce((sum, result) => sum + result.registered! * result.turnoutPct!, 0);
  return <>
    <span className="overline">{stateName ? "RINGKASAN NEGERI" : "ATLAS NASIONAL"}</span>
    <h2>{stateName || "Malaysia"}</h2>
    <p>{stateName ? "Pilih sebuah kawasan pada peta untuk membuka keputusan penuh." : "Pilih mana-mana negeri untuk meneliti kerusi satu demi satu."}</p>
    <dl className="atlas-detail-stats">
      <div><dt>{electionType === "pru" ? "Parlimen" : "DUN"}</dt><dd>{results.length}</dd></div>
      <div><dt>Pendahulu</dt><dd>{leader ? `${leader[0]} · ${leader[1].count}` : "—"}</dd></div>
      <div><dt>Pemilih</dt><dd>{registered ? formatNumber(registered) : "—"}</dd></div>
      <div><dt>Turnout</dt><dd>{turnoutRegistered ? formatPct(weightedTurnout / turnoutRegistered, 1) : "—"}</dd></div>
    </dl>
    {leader && <div className="atlas-leader-rule"><i style={{ background: leader[1].color }}/><span>{leader[0]} memenangi bahagian terbesar dalam paparan ini.</span></div>}
  </>;
}

function HierarchyExplorer({ urlState, commit, result, hierarchy }: { urlState: AtlasUrlState; commit: (state: AtlasUrlState) => void; result: AtlasResult; hierarchy: ReturnType<typeof useAtlasHierarchy>["value"] }) {
  const [hierarchySearchLabel, setHierarchySearchLabel] = useState("Cari DUN, PDM atau lokaliti");
  if (!hierarchy) return <div className="atlas-hierarchy-loading">Memuatkan DUN, PDM dan lokaliti…</div>;
  const parliamentCode = urlState.electionType === "pru" ? result.code : hierarchy.constituencies.duns.find((dun) => dun.id === result.featureId)?.parliamentCode;
  const childDuns = hierarchy.constituencies.duns.filter((dun) => dun.parliamentCode === parliamentCode);
  const effectiveDunId = urlState.electionType === "prn" ? result.featureId : urlState.dunId;
  const pdms = hierarchy.geography.pdms.filter((pdm) => effectiveDunId ? pdm.dunId === effectiveDunId : pdm.parliamentCode === parliamentCode);
  const selectedPdm = pdms.find((pdm) => pdm.id === urlState.pdmId);
  const localities = hierarchy.geography.localities.filter((locality) => locality.pdmId === selectedPdm?.id);
  const searchablePdms = hierarchy.geography.pdms.filter((pdm) => pdm.parliamentCode === parliamentCode && (!effectiveDunId || pdm.dunId === effectiveDunId));
  const searchablePdmIds = new Set(searchablePdms.map((pdm) => pdm.id));
  const searchableLocalities = hierarchy.geography.localities.filter((locality) => searchablePdmIds.has(locality.pdmId));
  const hierarchyEntries = [
    ...childDuns.map((dun) => ({ label: `DUN · ${dun.code} ${dun.name}`, dunId: dun.id, pdmId: "", localityId: "" })),
    ...searchablePdms.map((pdm) => ({ label: `PDM · ${pdm.code} ${pdm.name}`, dunId: pdm.dunId ?? "", pdmId: pdm.id, localityId: "" })),
    ...searchableLocalities.map((locality) => ({ label: `LOKALITI · ${locality.code} ${locality.name}`, dunId: locality.dunId, pdmId: locality.pdmId, localityId: locality.id })),
  ];
  const hierarchyEntryByLabel = new Map(hierarchyEntries.map((entry) => [entry.label, entry]));
  return <details className="atlas-hierarchy" open>
    <summary>Teroka hierarki kawasan</summary>
    <SearchCombobox className="atlas-hierarchy-search" label="CARI DALAM KAWASAN" value={hierarchySearchLabel} options={hierarchyEntries.map((entry) => entry.label)} allowCustom={false} onChange={(label) => {
      const entry = hierarchyEntryByLabel.get(label);
      setHierarchySearchLabel(label);
      if (entry) commit(atlasStateWith(urlState, entry));
    }}/>
    {urlState.electionType === "pru" && <div><span>DUN</span><div>{childDuns.map((dun) => <button type="button" className={urlState.dunId === dun.id ? "is-active" : ""} key={dun.id} onClick={() => commit(atlasStateWith(urlState, { dunId: dun.id }))}>{dun.code} {dun.name}</button>)}</div></div>}
    <div><span>PDM</span><div>{pdms.slice(0, 80).map((pdm) => <button type="button" className={urlState.pdmId === pdm.id ? "is-active" : ""} key={pdm.id} onClick={() => commit(atlasStateWith(urlState, { pdmId: pdm.id }))}>{pdm.code} {pdm.name}</button>)}</div></div>
    {selectedPdm && <div><span>Lokaliti</span><CoverageStatus covered={localities.length ? 1 : 0} total={1} label="Sumber PDM" status={coverageStatus(localities.length ? 1 : 0, 1)} dark/><div>{localities.length ? localities.map((locality) => <button type="button" className={urlState.localityId === locality.id ? "is-active" : ""} key={locality.id} onClick={() => commit(atlasStateWith(urlState, { localityId: locality.id }))}>{locality.name}</button>) : <small>Liputan lokaliti SPR masih separa; tiada rekod sumber yang disahkan untuk PDM ini.</small>}</div></div>}
  </details>;
}

function ResultsTable({ results, onSelect }: { results: AtlasResult[]; onSelect: (result: AtlasResult) => void }) {
  const [sort, setSort] = useState<SortKey>("code");
  const [descending, setDescending] = useState(false);
  const sorted = [...results].sort((first, second) => {
    const values: Record<SortKey, [string | number, string | number]> = {
      code: [first.featureId, second.featureId],
      state: [first.stateName, second.stateName],
      winner: [first.winnerLabel, second.winnerLabel],
      majority: [first.majority, second.majority],
      turnout: [first.turnoutPct ?? -1, second.turnoutPct ?? -1],
    };
    const [a, b] = values[sort];
    const order = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b));
    return descending ? -order : order;
  });
  const sortBy = (key: SortKey) => {
    if (sort === key) setDescending((value) => !value);
    else { setSort(key); setDescending(false); }
  };
  return <details className="panel atlas-results-table">
    <summary>Jadual keputusan setara · {results.length} kawasan</summary>
    <div className="table-responsive" role="region" aria-label="Jadual alternatif Atlas" tabIndex={0}>
      <table className="table table-sm"><thead><tr>
        <th><button onClick={() => sortBy("code")}>Kawasan</button></th>
        <th><button onClick={() => sortBy("state")}>Negeri</button></th>
        <th><button onClick={() => sortBy("winner")}>Pemenang</button></th>
        <th className="text-end"><button onClick={() => sortBy("majority")}>Majoriti</button></th>
        <th className="text-end"><button onClick={() => sortBy("turnout")}>Turnout</button></th>
      </tr></thead><tbody>{sorted.map((result) => <tr key={result.featureId}><td><button className="atlas-table-seat" onClick={() => onSelect(result)}>{result.code} {result.name}</button></td><td>{result.stateName}</td><td>{result.winnerLabel}</td><td className="text-end">{formatNumber(result.majority)}</td><td className="text-end">{result.turnoutPct === null ? "—" : formatPct(result.turnoutPct, 1)}</td></tr>)}</tbody></table>
    </div>
  </details>;
}

export function NationalElectionAtlasPage({ currentElectionData, embed = false }: { currentElectionData: ElectionData | null; embed?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { value: boundaries, error: boundaryError } = useAtlasBoundaries();
  const { value: boundaryRegistry, error: registryError } = useAtlasBoundaryRegistry();
  const requestedType: AtlasElectionType = searchParams.get("jenis") === "prn" ? "prn" : "pru";
  const requestedMetric = searchParams.get("mod") as AtlasMetric | null;
  const comparisonRequested = requestedMetric !== null && ATLAS_COMPARISON_METRICS.has(requestedMetric);
  const { value: stateElectionValue, error: stateElectionError } = useStateElectionData(requestedType === "prn");
  const { value: federalComparison, error: federalComparisonError } = useFederalElectionComparisonData(requestedType === "pru" && comparisonRequested);
  const prnEditions = useMemo(() => stateElectionValue ? [...new Set(stateElectionValue.results.events.map((event) => event.assemblyNumber))].sort((a, b) => b - a) : [], [stateElectionValue]);
  const editions = useMemo(() => ({ pru: ELECTION_EDITIONS.map((edition) => edition.number).sort((a, b) => b - a), prn: prnEditions }), [prnEditions]);
  const urlState: AtlasUrlState = requestedType === "prn" && !prnEditions.length ? {
    electionType: requestedType,
    edition: Number(searchParams.get("edisi")) || 0,
    metric: "pemenang",
    stateId: "",
    seatId: "",
    dunId: "",
    pdmId: "",
    localityId: "",
    compareEdition: null,
  } : readAtlasUrlState(searchParams, editions);
  const editionStateIds = useMemo(() => new Set(
    urlState.electionType === "prn" && stateElectionValue
      ? stateElectionValue.results.events
        .filter((event) => event.assemblyNumber === urlState.edition)
        .map((event) => event.stateId)
      : [],
  ), [stateElectionValue, urlState.edition, urlState.electionType]);
  const federal = useFederalAtlasEdition(
    urlState.edition,
    currentElectionData,
    urlState.electionType === "pru",
  );
  const validStateId = boundaries?.states.some((state) => state.id === urlState.stateId)
    && (urlState.electionType === "pru" || editionStateIds.has(urlState.stateId))
    ? urlState.stateId
    : "";
  const registryEntry: BoundaryRegistryEntry | undefined = boundaryRegistry
    ? (urlState.electionType === "pru" ? boundaryRegistry.federal[`pru-${urlState.edition}`] : boundaryRegistry.stateAssemblies[String(urlState.edition)])
    : undefined;
  const boundaryContext: BoundaryRegistryEntry | BoundaryRegistryStateEntry | undefined =
    urlState.electionType === "prn" && validStateId
      ? registryEntry?.states?.[validStateId] ?? registryEntry
      : registryEntry;
  const stateBoundaries = useAtlasStateBoundaries(validStateId, validStateId ? registryEntry?.stateFiles[validStateId] : undefined);
  const hierarchy = useAtlasHierarchy(Boolean(urlState.seatId));
  const [hoveredId, setHoveredId] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [searchLabel, setSearchLabel] = useState("Cari negeri, kawasan, calon atau parti");
  const [publishedAnnotations, setPublishedAnnotations] = useState<PublishedAtlasAnnotation[]>([]);
  const pathRefs = useRef(new Map<string, SVGPathElement>());
  useEffect(() => {
    document.body.classList.toggle("atlas-embed", embed);
    return () => document.body.classList.remove("atlas-embed");
  }, [embed]);
  useEffect(() => {
    if (urlState.electionType !== "pru") {
      setPublishedAnnotations([]);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/published-data?electionId=pru-${urlState.edition}&dataKind=annotations`, { signal: controller.signal })
      .then(async (response) => response.ok && response.headers.get("content-type")?.includes("application/json") ? response.json() : null)
      .then((value) => {
        const records = Array.isArray(value?.payload) ? value.payload : value?.payload?.annotations;
        setPublishedAnnotations(Array.isArray(records) ? records.filter((item): item is PublishedAtlasAnnotation =>
          typeof item?.constituencyId === "string" && typeof item?.title === "string" && typeof item?.body === "string",
        ) : []);
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setPublishedAnnotations([]);
      });
    return () => controller.abort();
  }, [urlState.edition, urlState.electionType]);

  const commit = (state: AtlasUrlState, replace = false, eventName = "atlas-state-change") => {
    setSearchParams(atlasSearchParams(state), { replace });
    recordInteraction(eventName);
  };
  const switchElection = (type: AtlasElectionType) => {
    if (!editions[type].length) {
      const params = new URLSearchParams();
      params.set("jenis", type);
      setSearchParams(params);
      recordInteraction("atlas-election-type");
      return;
    }
    commit(atlasStateWith(urlState, { electionType: type, edition: editions[type][0] }), false, "atlas-election-type");
  };

  const currentRawResults = useMemo(() => {
    if (urlState.electionType === "pru") return federal.value ? buildFederalResults(federal.value, urlState.edition) : [];
    return stateElectionValue ? buildStateResults(stateElectionValue, urlState.edition) : [];
  }, [federal.value, stateElectionValue, urlState.edition, urlState.electionType]);
  const baselineRawResults = useMemo(() => {
    if (urlState.compareEdition === null) return [];
    if (urlState.electionType === "pru") {
      const record = federalComparison?.find((item) => item.edition.number === urlState.compareEdition);
      return record ? buildFederalResults(record.data, urlState.compareEdition) : [];
    }
    return stateElectionValue ? buildStateResults(stateElectionValue, urlState.compareEdition) : [];
  }, [federalComparison, stateElectionValue, urlState.compareEdition, urlState.electionType]);
  const results = useMemo(() => withComparison(currentRawResults, baselineRawResults, urlState.metric), [baselineRawResults, currentRawResults, urlState.metric]);
  const resultById = useMemo(() => new Map(results.map((result) => [result.featureId, result])), [results]);
  const stateResults = results.filter((result) => result.stateId === validStateId);
  const selectedResult = resultById.get(urlState.seatId);
  const selectedState = boundaries?.states.find((state) => state.id === validStateId);

  useEffect(() => {
    if (!boundaries || !stateElectionValue || !prnEditions.length) return;
    const requestedStateIsValid = boundaries.states.some((state) => state.id === urlState.stateId)
      && (urlState.electionType === "pru" || editionStateIds.has(urlState.stateId));
    const onlyAvailableState = urlState.electionType === "prn" && editionStateIds.size === 1
      ? [...editionStateIds][0]
      : "";
    const stateId = requestedStateIsValid ? urlState.stateId : urlState.stateId ? onlyAvailableState : "";
    const seat = results.find((result) => result.featureId === urlState.seatId && result.stateId === stateId);
    const next = { ...urlState, stateId, seatId: seat?.featureId ?? "", dunId: seat ? urlState.dunId : "", pdmId: seat ? urlState.pdmId : "", localityId: seat ? urlState.localityId : "" };
    const canonical = atlasSearchParams(next).toString();
    if (canonical !== searchParams.toString()) setSearchParams(canonical, { replace: true });
  }, [boundaries, editionStateIds, prnEditions.length, results, searchParams, setSearchParams, stateElectionValue, urlState]);

  useEffect(() => {
    if (stateBoundaries.value) recordInteraction("atlas-state-geometry-ready", stateBoundaries.value.metadata.parliamentFeatureCount + stateBoundaries.value.metadata.dunFeatureCount);
  }, [stateBoundaries.value]);

  const displayLayer = validStateId
    ? stateBoundaries.value?.layers[urlState.electionType === "pru" ? "parliament" : "dun"]
    : boundaries?.layers.parliament;
  const stateAggregates = useMemo(() => {
    const aggregates = new Map<string, AtlasResult>();
    boundaries?.states.forEach((state) => {
      const scoped = results.filter((result) => result.stateId === state.id);
      if (!scoped.length) return;
      const leaders = new Map<string, AtlasResult[]>();
      scoped.forEach((result) => leaders.set(result.winnerLabel, [...(leaders.get(result.winnerLabel) ?? []), result]));
      const leader = [...leaders.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      const turnout = scoped.filter((result) => result.turnoutPct !== null);
      const comparisons = scoped.map((result) => result.comparisonValue).filter((value): value is number => value !== null && value !== undefined);
      aggregates.set(state.id, {
        ...leader[1][0],
        featureId: `state:${state.id}`,
        code: state.name,
        name: state.name,
        winnerLabel: leader[0],
        winnerName: leader[0],
        majority: scoped.reduce((sum, result) => sum + result.majority, 0) / scoped.length,
        turnoutPct: turnout.length ? turnout.reduce((sum, result) => sum + result.turnoutPct!, 0) / turnout.length : null,
        registered: scoped.reduce((sum, result) => sum + (result.registered ?? 0), 0),
        candidateCount: scoped.reduce((sum, result) => sum + result.candidateCount, 0),
        color: leader[1][0].color,
        changed: scoped.some((result) => result.changed),
        comparisonValue: comparisons.length ? comparisons.reduce((sum, value) => sum + value, 0) / comparisons.length : null,
      });
    });
    return aggregates;
  }, [boundaries?.states, results]);

  const geometry = useMemo(() => {
    if (!boundaries || !displayLayer) return null;
    const projection = geoMercator().fitExtent([[24, 24], [MAP_WIDTH - 24, MAP_HEIGHT - 24]], boundaries.layers.parliament as AtlasBoundaryCollection);
    const path = geoPath(projection);
    const paths = new Map(displayLayer.features.map((feature) => [feature.properties.id, path(feature) ?? ""]));
    const centroids = new Map(displayLayer.features.map((feature) => [feature.properties.id, path.centroid(feature)]));
    const stateCollections = new Map<string, AtlasBoundaryCollection>();
    boundaries.states.forEach((state) => stateCollections.set(state.id, { type: "FeatureCollection", features: boundaries.layers.parliament.features.filter((feature) => feature.properties.stateId === state.id) }));
    const stateCentroids = new Map([...stateCollections].map(([stateId, collection]) => [stateId, path.centroid(collection)]));
    const viewBox = validStateId ? viewBoxForBounds(path.bounds(displayLayer)) : `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`;
    return { paths, centroids, stateCentroids, viewBox };
  }, [boundaries, displayLayer, validStateId]);

  const searchEntries = useMemo<SearchEntry[]>(() => {
    const entries: SearchEntry[] = [];
    boundaries?.states
      .filter((state) => urlState.electionType === "pru" || editionStateIds.has(state.id))
      .forEach((state) => entries.push({ label: `NEGERI · ${state.name}`, stateId: state.id, seatId: "" }));
    results.forEach((result) => {
      entries.push({ label: `${result.code} ${result.name} · ${result.winnerLabel}`, stateId: result.stateId, seatId: result.featureId });
      [...new Set(result.searchTerms)].forEach((term) => entries.push({ label: `${term} · ${result.code} ${result.name}`, stateId: result.stateId, seatId: result.featureId }));
    });
    return [...new Map(entries.map((entry) => [entry.label, entry])).values()];
  }, [boundaries?.states, editionStateIds, results, urlState.electionType]);
  const searchByLabel = new Map(searchEntries.map((entry) => [entry.label, entry]));

  const scopedResults = validStateId ? stateResults : results;
  const metricValues = scopedResults.map((result) => ATLAS_COMPARISON_METRICS.has(urlState.metric) ? result.comparisonValue : urlState.metric === "majoriti" ? result.majority : result.turnoutPct).filter((value): value is number => value !== null && value !== undefined);
  const thresholds = quantileThresholds(metricValues);
  const comparisonMagnitude = quantileThresholds(metricValues.map(Math.abs))[1] || 1;
  const featureDisplayResult = (feature?: AtlasBoundaryFeature) => {
    if (!feature) return undefined;
    return validStateId
      ? resultById.get(feature.properties.id)
      : urlState.electionType === "pru"
        ? resultById.get(feature.properties.id)
        : stateAggregates.get(feature.properties.stateId);
  };
  const featureFill = (feature: AtlasBoundaryFeature) => {
    const result = featureDisplayResult(feature);
    if (!result) return NO_DATA_COLOR;
    if (urlState.metric === "pemenang") return result.color;
    if (urlState.metric === "bertukar") return result.previousWinnerLabel === undefined && validStateId ? NO_DATA_COLOR : result.changed ? "#d5a62e" : "#435f77";
    if (ATLAS_COMPARISON_METRICS.has(urlState.metric)) {
      const value = result.comparisonValue;
      if (value === null || value === undefined) return NO_DATA_COLOR;
      if (Math.abs(value) < comparisonMagnitude * .12) return "#e7e4dc";
      const index = Math.min(2, Math.floor(Math.abs(value) / comparisonMagnitude));
      return value < 0 ? NEGATIVE_COLORS[index] : POSITIVE_COLORS[index];
    }
    const value = urlState.metric === "majoriti" ? result.majority : result.turnoutPct;
    if (value === null) return NO_DATA_COLOR;
    return (urlState.metric === "majoriti" ? MAJORITY_COLORS : TURNOUT_COLORS)[thresholdIndex(value, thresholds)];
  };

  const keyboardFeatures = useMemo(() => {
    if (!displayLayer || !geometry) return [];
    if (validStateId) return displayLayer.features.filter((feature) => resultById.has(feature.properties.id));
    const seen = new Set<string>();
    return displayLayer.features.filter((feature) => {
      if (!stateAggregates.has(feature.properties.stateId)) return false;
      if (seen.has(feature.properties.stateId)) return false;
      seen.add(feature.properties.stateId);
      return true;
    });
  }, [displayLayer, geometry, resultById, stateAggregates, validStateId]);
  const selectedKeyboardId = validStateId ? selectedResult?.featureId ?? keyboardFeatures[0]?.properties.id : keyboardFeatures.find((feature) => feature.properties.stateId === validStateId)?.properties.id ?? keyboardFeatures[0]?.properties.id;

  const selectFeature = (feature: AtlasBoundaryFeature) => {
    if (!validStateId && stateAggregates.has(feature.properties.stateId)) commit(atlasStateWith(urlState, { stateId: feature.properties.stateId }), false, "atlas-drill-state");
    else if (resultById.has(feature.properties.id)) commit(atlasStateWith(urlState, { seatId: feature.properties.id }), false, "atlas-drill-seat");
  };
  const moveSpatially = (feature: AtlasBoundaryFeature, key: string) => {
    if (!geometry || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
    const currentPoint = validStateId ? geometry.centroids.get(feature.properties.id) : geometry.stateCentroids.get(feature.properties.stateId);
    if (!currentPoint) return;
    const vector = key === "ArrowLeft" ? [-1, 0] : key === "ArrowRight" ? [1, 0] : key === "ArrowUp" ? [0, -1] : [0, 1];
    const next = keyboardFeatures.map((candidate) => {
      const point = validStateId ? geometry.centroids.get(candidate.properties.id) : geometry.stateCentroids.get(candidate.properties.stateId);
      if (!point || candidate.properties.id === feature.properties.id) return null;
      const dx = point[0] - currentPoint[0];
      const dy = point[1] - currentPoint[1];
      const distance = Math.hypot(dx, dy);
      const progress = (dx * vector[0] + dy * vector[1]) / Math.max(1, distance);
      return progress > .18 ? { candidate, score: distance / Math.max(.08, progress ** 3) } : null;
    }).filter((item): item is { candidate: AtlasBoundaryFeature; score: number } => item !== null).sort((a, b) => a.score - b.score)[0]?.candidate;
    if (next) {
      if (validStateId) commit(atlasStateWith(urlState, { seatId: next.properties.id }), true, "atlas-keyboard-spatial");
      pathRefs.current.get(next.properties.id)?.focus();
    }
  };

  const relevantDataError = boundaryError
    || registryError
    || federal.error
    || stateBoundaries.error
    || hierarchy.error
    || (urlState.electionType === "prn" ? stateElectionError : "")
    || (urlState.electionType === "pru" && comparisonRequested ? federalComparisonError : "");
  if (relevantDataError) return <AtlasLoading error={relevantDataError}/>;
  if (
    !boundaries
    || !boundaryRegistry
    || !displayLayer
    || !geometry
    || (urlState.electionType === "pru" && !federal.value)
    || (urlState.electionType === "prn" && (!stateElectionValue || !prnEditions.length))
    || (urlState.electionType === "pru" && comparisonRequested && !federalComparison)
  ) return <AtlasLoading/>;

  const currentLabel = selectedResult ? `${selectedResult.code} ${selectedResult.name}` : selectedState?.name ?? "Malaysia";
  const effectiveResults = validStateId ? stateResults : results;
  const fullscreenDetail: ReactNode = selectedResult
    ? <ResultDetail result={selectedResult} electionType={urlState.electionType} edition={urlState.edition} compareEdition={urlState.compareEdition} annotations={publishedAnnotations.filter((annotation) => annotation.constituencyId === selectedResult.featureId || annotation.constituencyId === selectedResult.code)}/>
    : <ScopeDetail electionType={urlState.electionType} stateName={selectedState?.name ?? ""} results={effectiveResults}/>;
  const share = async () => {
    const hasNativeShare = typeof navigator.share === "function";
    try {
      if (hasNativeShare) await navigator.share({ title: `Atlas Pilihan Raya · ${currentLabel}`, url: window.location.href });
      else await navigator.clipboard.writeText(window.location.href);
      setShareStatus(hasNativeShare ? "Dikongsi" : "Pautan disalin");
      recordInteraction("atlas-share");
    } catch (reason) {
      if ((reason as DOMException)?.name !== "AbortError") setShareStatus("Tidak dapat menyalin");
    }
    window.setTimeout(() => setShareStatus(""), 2200);
  };
  const copyEmbed = async () => {
    const url = new URL(window.location.href);
    url.pathname = "/peta/embed";
    const iframe = `<iframe src="${url.toString()}" title="Atlas Pilihan Raya Politik.my" loading="lazy" width="100%" height="720"></iframe>`;
    try {
      await navigator.clipboard.writeText(iframe);
      setShareStatus("Kod benam disalin");
      recordInteraction("atlas-copy-embed");
    } catch {
      setShareStatus("Tidak dapat menyalin");
    }
    window.setTimeout(() => setShareStatus(""), 2200);
  };
  const selectResult = (result: AtlasResult) => commit(atlasStateWith(urlState, { stateId: result.stateId, seatId: result.featureId }), false, "atlas-table-select");

  return <>
    <PageTitle title="Atlas Pilihan Raya Malaysia"/>
    {!document.getElementById("atlas-static-intro") && <AtlasIntro/>}
    <div className="sr-only" role="status" aria-live="polite">{currentLabel}, mod {ATLAS_METRICS.find((metric) => metric.id === urlState.metric)?.label}</div>

    <section className="panel atlas-control-deck" aria-label="Kawalan atlas">
      <div className="atlas-election-switch" aria-label="Jenis pilihan raya">{(["pru", "prn"] as AtlasElectionType[]).map((type) => <button key={type} className={urlState.electionType === type ? "is-active" : ""} onClick={() => switchElection(type)} aria-pressed={urlState.electionType === type}>{urlState.electionType === type && <motion.i layoutId="atlas-election-active"/>}<span>{type.toUpperCase()}</span><small>{type === "pru" ? "Parlimen" : "DUN"}</small></button>)}</div>
      <label className="atlas-edition-select"><span>EDISI B</span><select value={urlState.edition} onChange={(event) => commit(atlasStateWith(urlState, { edition: Number(event.target.value) }), false, "atlas-edition")}>{editions[urlState.electionType].map((edition) => <option value={edition} key={edition}>{urlState.electionType.toUpperCase()}-{edition}</option>)}</select></label>
      <SearchCombobox className="atlas-search" label="CARI ATLAS" value={searchLabel} options={searchEntries.map((entry) => entry.label)} allowCustom={false} onChange={(label) => { const entry = searchByLabel.get(label); setSearchLabel(label); if (entry) commit(atlasStateWith(urlState, { stateId: entry.stateId, seatId: entry.seatId }), false, "atlas-search"); }}/>
      <button className="atlas-share-button" onClick={share}><Icon name="share" size={18}/><span>{shareStatus || "Kongsi paparan"}</span></button>
      {!embed && <button className="atlas-embed-button" onClick={copyEmbed}><Icon name="code" size={18}/><span>Benamkan atlas</span></button>}
      <div className="atlas-metric-switch" aria-label="Paparan peta">{ATLAS_METRICS.map((metric) => <button key={metric.id} className={urlState.metric === metric.id ? "is-active" : ""} onClick={() => commit(atlasStateWith(urlState, { metric: metric.id }), false, "atlas-metric")} aria-pressed={urlState.metric === metric.id}>{urlState.metric === metric.id && <motion.i layoutId="atlas-metric-active"/>}<span>{metric.label}</span></button>)}</div>
      {ATLAS_COMPARISON_METRICS.has(urlState.metric) && <label className="atlas-edition-select atlas-compare-select"><span>EDISI A</span><select value={urlState.compareEdition ?? ""} onChange={(event) => commit({ ...urlState, compareEdition: Number(event.target.value) }, false, "atlas-compare-edition")}>{editions[urlState.electionType].filter((edition) => edition !== urlState.edition).map((edition) => <option value={edition} key={edition}>{urlState.electionType.toUpperCase()}-{edition}</option>)}</select></label>}
    </section>

    <nav className="atlas-breadcrumbs" aria-label="Tahap geografi">
      <button className={!validStateId ? "is-current" : ""} onClick={() => commit(atlasStateWith(urlState, { stateId: "", seatId: "" }))}>Malaysia</button>
      {selectedState && <><span>/</span><button className={!selectedResult ? "is-current" : ""} onClick={() => commit(atlasStateWith(urlState, { seatId: "" }))}>{selectedState.name}</button></>}
      {selectedResult && <><span>/</span><strong>{selectedResult.code} {selectedResult.name}</strong></>}
      {urlState.dunId && <><span>/</span><strong>{hierarchy.value?.constituencies.duns.find((dun) => dun.id === urlState.dunId)?.name}</strong></>}
      {urlState.pdmId && <><span>/</span><strong>{hierarchy.value?.geography.pdms.find((pdm) => pdm.id === urlState.pdmId)?.name}</strong></>}
    </nav>

    {boundaryContext?.status !== "exact" && <aside className="atlas-boundary-warning"><Icon name="info" size={17}/><span><strong>Sempadan serasi, bukan snapshot warta khusus edisi.</strong> {formatDatesInText(boundaryContext?.note ?? "")}</span></aside>}

    <section className="atlas-workspace">
      <article className="panel atlas-map-panel">
        {validStateId && !stateBoundaries.value && <div className="atlas-map-chunk-loading">Memuatkan geometri terperinci {selectedState?.name}…</div>}
        <AtlasMapViewport
          viewBox={geometry.viewBox}
          label={`Peta ${urlState.electionType.toUpperCase()}-${urlState.edition}, mod ${urlState.metric}, ${currentLabel}`}
          detailKey={(selectedResult?.featureId ?? validStateId) || "malaysia"}
          detailColor={selectedResult?.color ?? "#d5a62e"}
          exportName={`politik-my-${urlState.electionType}-${urlState.edition}-${validStateId || "malaysia"}-${urlState.metric}`}
          fullscreenDetail={fullscreenDetail}
          status={<div className="atlas-map-status"><span>{urlState.electionType.toUpperCase()}-{urlState.edition}</span><strong>{hoveredId ? featureDisplayResult(displayLayer.features.find((feature) => feature.properties.id === hoveredId))?.name ?? selectedState?.name : currentLabel}</strong>{validStateId && <button onClick={() => commit(atlasStateWith(urlState, { stateId: "", seatId: "" }))}>← Seluruh Malaysia</button>}</div>}
        >
          <g className="atlas-map-geography">{displayLayer.features.map((feature) => {
            const result = featureDisplayResult(feature);
            const keyboardTarget = keyboardFeatures.some((item) => item.properties.id === feature.properties.id);
            const isSelected = selectedResult?.featureId === feature.properties.id;
            return <motion.path
              key={feature.properties.id}
              ref={(element) => { if (element) pathRefs.current.set(feature.properties.id, element); else pathRefs.current.delete(feature.properties.id); }}
              d={geometry.paths.get(feature.properties.id)}
              fill={featureFill(feature)}
              className={`${result ? "has-result" : "has-no-result"} ${isSelected ? "is-selected" : ""}`}
              onClick={() => selectFeature(feature)}
              onPointerEnter={() => setHoveredId(feature.properties.id)}
              onPointerLeave={() => setHoveredId("")}
              tabIndex={keyboardTarget && feature.properties.id === selectedKeyboardId ? 0 : -1}
              role={keyboardTarget ? "button" : undefined}
              aria-hidden={!keyboardTarget}
              aria-pressed={isSelected}
              aria-label={keyboardTarget ? validStateId ? `${feature.properties.code} ${feature.properties.name}, ${result?.winnerLabel ?? "tiada keputusan"}` : `Buka ${feature.properties.stateName}` : undefined}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); moveSpatially(feature, event.key); }
                else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectFeature(feature); }
              }}
            />;
          })}</g>
          {!validStateId && <g className="atlas-state-labels" aria-hidden="true">{boundaries.states.map((state) => { const centroid = geometry.stateCentroids.get(state.id); return centroid && Number.isFinite(centroid[0]) ? <text key={state.id} x={centroid[0]} y={centroid[1]}>{state.name.replace("W.P ", "")}</text> : null; })}</g>}
        </AtlasMapViewport>
        <MetricLegend metric={urlState.metric} results={effectiveResults}/>
      </article>

      <MotionConfig reducedMotion="user"><AnimatePresence mode="wait" initial={false}><motion.aside key={(selectedResult?.featureId ?? validStateId) || "malaysia"} className="atlas-detail-panel" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} style={{ "--atlas-ticket": selectedResult?.color ?? "#d5a62e" } as React.CSSProperties}>
        {fullscreenDetail}
        {selectedResult && <HierarchyExplorer urlState={urlState} commit={commit} result={selectedResult} hierarchy={hierarchy.value}/>}
      </motion.aside></AnimatePresence></MotionConfig>
    </section>

    <ResultsTable results={effectiveResults} onSelect={selectResult}/>
    <aside className="storage-note atlas-source-note"><Icon name="database" size={18}/><div><strong>Sempadan rasmi SPR · {boundaryContext?.boundaryVersion ?? boundaries.metadata.boundaryVersion}</strong><p>{boundaryContext?.status === "exact" ? "Snapshot sempadan tepat dan dikunci SHA-256 bagi edisi dipilih" : "Snapshot sempadan serasi"} · {registryEntry?.snapshotFile ?? "manifest belum tersedia"} · indeks nasional {Math.round(JSON.stringify(boundaries).length / 1024)} KB · geometri negeri dimuatkan apabila dipilih.</p></div></aside>
  </>;
}
