import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Link, useParams } from "react-router";
import { StateElectionMap, type StateElectionMapSeat } from "../components/maps/StateElectionMap";
import { StateElectionViewNav } from "../components/maps/StateElectionViewNav";
import { TicketLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { useAtlasBoundaryRegistry, useAtlasStateBoundaries } from "../data/hooks/useElectionAtlas";
import { useStateElectionData } from "../data/hooks/useStateElectionData";
import { projectAtlasStateBoundaries } from "../data/stateElectionBoundaryUtils";
import { contestWinner, ticketColor } from "../data/stateElectionUtils";
import type { StateElectionEvent } from "../data/types/stateElection";
import { PRN_BASE, stateDunResultPath, stateElectionEditionPath } from "../routes";
import { formatDatesInText, formatNumber, formatPct, formatShortDate, toSlug } from "../utils";

function BoundaryLoading({ error }: { error?: string }) {
  return <section className={`route-loading ${error ? "age-error" : ""}`}>{error ? `Peta tidak dapat dimuatkan: ${error}` : "Memuatkan sempadan rasmi SPR…"}</section>;
}

function SelectedAreaDetail({ selected, event }: { selected: StateElectionMapSeat; event: StateElectionEvent }) {
  const winner = contestWinner(selected.contest);
  return <>
    <div className="prn-map-detail-code"><span>{selected.feature.code}</span><span>{selected.feature.parliamentCode}</span></div>
    <h2>{selected.feature.name}</h2>
    <div className="prn-map-detail-winner"><TicketLogo name={winner.party} shortName={winner.shortName}/><div><span>PEMENANG PRN-{event.assemblyNumber}</span><strong>{winner.name}</strong></div></div>
    <div className="prn-map-detail-stats">
      <div><span>UNDI</span><strong>{formatNumber(winner.votes)}</strong></div>
      <div><span>BAHAGIAN UNDI</span><strong>{formatPct(winner.share, 2)}</strong></div>
      <div><span>MAJORITI</span><strong>{formatNumber(selected.contest.majorityVotes)}</strong></div>
      <div><span>KELUAR MENGUNDI</span><strong>{selected.contest.turnoutPct === null ? "—" : formatPct(selected.contest.turnoutPct, 2)}</strong></div>
    </div>
    <dl>
      <div><dt>Pemilih berdaftar</dt><dd>{selected.contest.registeredVoters === null ? "—" : formatNumber(selected.contest.registeredVoters)}</dd></div>
      <div><dt>Keluasan</dt><dd>{selected.feature.areaKm2 === null ? "—" : `${formatNumber(Math.round(selected.feature.areaKm2))} km²`}</dd></div>
    </dl>
    <Link to={stateDunResultPath(event.stateId, event.assemblyNumber, toSlug(selected.dun.name))}>Lihat keputusan penuh <Icon name="arrow" size={17}/></Link>
  </>;
}

export function StateElectionMapPage() {
  const { assemblyNumber, stateName } = useParams();
  const { value, error } = useStateElectionData();
  const { value: boundaryRegistry, error: registryError } = useAtlasBoundaryRegistry();
  const registryEntry = assemblyNumber ? boundaryRegistry?.stateAssemblies[String(Number(assemblyNumber))] : undefined;
  const boundaryContext = stateName ? registryEntry?.states?.[stateName] : undefined;
  const boundaryFile = stateName ? boundaryContext?.stateFile ?? registryEntry?.stateFiles[stateName] : undefined;
  const { value: atlasBoundaries, error: boundaryError } = useAtlasStateBoundaries(stateName ?? "", boundaryFile);
  const boundaries = useMemo(() => atlasBoundaries ? projectAtlasStateBoundaries(atlasBoundaries) : null, [atlasBoundaries]);
  const [selectedId, setSelectedId] = useState("");
  const [ticketFilter, setTicketFilter] = useState("SEMUA");

  const event = value?.results.events.find((item) => item.stateId === stateName && item.assemblyNumber === Number(assemblyNumber));
  const state = value?.constituencies.states.find((item) => item.id === stateName);
  const seats = useMemo<StateElectionMapSeat[]>(() => {
    if (!value || !event || !boundaries) return [];
    const featureById = new Map(boundaries.features.map((feature) => [feature.id, feature]));
    return event.contestIds.map((contestId) => {
      const contest = value.results.contests.find((item) => item.id === contestId)!;
      return {
        contest,
        feature: featureById.get(contest.dunId)!,
        dun: value.constituencies.duns.find((item) => item.id === contest.dunId)!,
      };
    }).filter((item) => item.feature && item.dun);
  }, [boundaries, event, value]);

  useEffect(() => {
    if (seats.length && !seats.some((seat) => seat.feature.id === selectedId)) setSelectedId(seats[0].feature.id);
  }, [seats, selectedId]);

  if (error || registryError) return <BoundaryLoading error={error || registryError}/>;
  if (!value || !boundaryRegistry) return <BoundaryLoading/>;
  if (!event || !state) return <NotFound label="Peta pilihan raya negeri"/>;
  if (boundaryContext?.status === "identity-only") return <>
    <PageTitle title={`Peta ${state.name} PRN-${event.assemblyNumber}`}/>
    <section className="route-hero prn-map-hero"><div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><Link to={stateElectionEditionPath(event.assemblyNumber)}>PRN-{event.assemblyNumber}</Link><span>/</span><Link to={`/prn/${event.assemblyNumber}/${event.stateId}/`}>{state.name}</Link><span>/</span><strong>Peta</strong></div><span className="overline">REGISTRY SEJARAH · {boundaryContext.constituencyCount} DUN</span><h1>{state.name}<br/><em>sempadan pra-2019.</em></h1><p>{formatShortDate(event.electionDate)} · Identiti semua kawasan telah disahkan, tetapi geometri digital rasmi bagi sempadan 60 DUN belum ditemui.</p></section>
    <aside className="atlas-boundary-warning"><Icon name="info" size={17}/><span><strong>Peta tidak diterbitkan sebagai anggaran.</strong> {formatDatesInText(boundaryContext.note)}</span></aside>
    <StateElectionViewNav event={event} mode="map"/>
  </>;
  if (!boundaryFile) return <NotFound label="Peta pilihan raya negeri"/>;
  if (boundaryError) return <BoundaryLoading error={boundaryError}/>;
  if (!boundaries || !seats.length) return <BoundaryLoading/>;

  const selected = seats.find((seat) => seat.feature.id === selectedId) ?? seats[0];
  const winner = contestWinner(selected.contest);
  const ticketOptions = ["SEMUA", ...Object.keys(event.seatCounts)];
  const dunOptions = new Map(seats.map((seat) => [`${seat.feature.code} ${seat.feature.name}`, seat]));
  const selectedLabel = `${selected.feature.code} ${selected.feature.name}`;
  const selectTicket = (ticket: string) => {
    setTicketFilter(ticket);
    if (ticket === "SEMUA" || contestWinner(selected.contest).shortName === ticket) return;
    const firstMatch = seats.find((seat) => contestWinner(seat.contest).shortName === ticket);
    if (firstMatch) setSelectedId(firstMatch.feature.id);
  };

  return <>
    <PageTitle title={`Peta ${state.name} PRN-${event.assemblyNumber}`}/>
    <section className="route-hero prn-map-hero">
      <div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><Link to={stateElectionEditionPath(event.assemblyNumber)}>PRN-{event.assemblyNumber}</Link><span>/</span><Link to={`/prn/${event.assemblyNumber}/${event.stateId}/`}>{state.name}</Link><span>/</span><strong>Peta</strong></div>
      <span className="overline">PETA MANDAT · PRN KE-{event.assemblyNumber}</span>
      <h1>{state.name}<br/><em>dalam {event.contestIds.length} kawasan.</em></h1>
      <p>{formatShortDate(event.electionDate)} · Sempadan DUN rasmi dipadankan terus dengan keputusan pilihan raya.</p>
      <div className="route-stat-row"><div><span>DUN</span><strong>{event.contestIds.length}</strong></div>{Object.entries(event.seatCounts).map(([ticket, count]) => <div key={ticket}><span>{ticket}</span><strong>{count}</strong></div>)}</div>
    </section>

    {boundaryContext?.status !== "exact" && <aside className="atlas-boundary-warning"><Icon name="info" size={17}/><span><strong>Sempadan serasi, bukan snapshot warta khusus edisi.</strong> {formatDatesInText(boundaryContext?.note ?? registryEntry?.note ?? "")}</span></aside>}

    <StateElectionViewNav event={event} mode="map"/>

    <section className="panel prn-map-controls">
      <SearchCombobox label="CARI DUN" value={selectedLabel} options={[...dunOptions.keys()]} allowCustom={false} onChange={(label) => {
        const seat = dunOptions.get(label);
        if (seat) {
          setTicketFilter("SEMUA");
          setSelectedId(seat.feature.id);
        }
      }}/>
      <div className="prn-map-ticket-filter" aria-label="Tapis pemenang">
        <span>PEMENANG</span>
        <div>{ticketOptions.map((ticket) => <button key={ticket} className={ticketFilter === ticket ? "is-active" : ""} onClick={() => selectTicket(ticket)}>
          {ticketFilter === ticket && <motion.i layoutId="prn-map-filter-active" transition={{ type: "spring", stiffness: 420, damping: 34 }}/>}
          <b>{ticket === "SEMUA" ? "Semua" : ticket}</b>
          <small>{ticket === "SEMUA" ? event.contestIds.length : event.seatCounts[ticket]}</small>
        </button>)}</div>
      </div>
    </section>

    <section className="prn-map-layout">
      <article className="panel prn-map-panel">
        <StateElectionMap
          boundaries={boundaries}
          seats={seats}
          selectedId={selected.feature.id}
          ticketFilter={ticketFilter}
          onSelect={setSelectedId}
          fullscreenDetail={<SelectedAreaDetail selected={selected} event={event}/>}
          fullscreenDetailKey={selected.feature.id}
          fullscreenDetailColor={ticketColor(winner.shortName)}
        />
        <div className="prn-map-legend" aria-label="Petunjuk keputusan">
          <strong>PEMENANG DUN</strong>
          {Object.entries(event.seatCounts).map(([ticket, count]) => <span key={ticket}><i style={{ background: ticketColor(ticket) }}/><b>{ticket}</b><small>{count} kerusi</small></span>)}
        </div>
      </article>

      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait" initial={false}>
          <motion.aside
            className="prn-map-detail"
            key={selected.feature.id}
            layoutId="prn-map-selected-card"
            initial={{ opacity: 0, clipPath: "inset(0 0 100% 0)", y: 18 }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)", y: 0 }}
            exit={{ opacity: 0, clipPath: "inset(100% 0 0 0)", y: -12 }}
            transition={{ duration: .32, ease: [0.22, 1, 0.36, 1] }}
            style={{ "--map-ticket": ticketColor(winner.shortName) } as React.CSSProperties}
          >
            <SelectedAreaDetail selected={selected} event={event}/>
          </motion.aside>
        </AnimatePresence>
      </MotionConfig>
    </section>

    <aside className="storage-note prn-map-source-note"><Icon name="database" size={18}/><div><strong>Sempadan rasmi SPR · {boundaries.metadata.boundaryVersion}</strong><p>{boundaries.metadata.featureCount} geometri DUN · SHA-256 {boundaries.metadata.sourceSha256.slice(0, 12)}… · Gunakan kekunci anak panah untuk bergerak antara kawasan.</p></div></aside>
  </>;
}
