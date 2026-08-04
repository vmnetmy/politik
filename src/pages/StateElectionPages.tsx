import { useEffect, useMemo, useState } from "react";
import { motion, MotionConfig } from "motion/react";
import { Link, Navigate, useParams } from "react-router-dom";
import { TicketLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { StateElectionMap, type StateElectionMapSeat } from "../components/maps/StateElectionMap";
import { StateElectionViewNav } from "../components/maps/StateElectionViewNav";
import { useAtlasBoundaryRegistry, useAtlasStateBoundaries } from "../data/hooks/useElectionAtlas";
import { useStateElectionData } from "../data/hooks/useStateElectionData";
import { projectAtlasStateBoundaries } from "../data/stateElectionBoundaryUtils";
import { contestWinner, eventWinner, ticketColor } from "../data/stateElectionUtils";
import { StateScoresheetDetail } from "../components/scoresheet/StateScoresheetDetail";
import { dunPath, PRN_BASE, stateDunResultPath, stateElectionComparisonPath, stateElectionEditionPath, stateElectionPath } from "../routes";
import { DEFAULT_ELECTION_NUMBER } from "../elections";
import type { ConstituencyRegistry, DunReference, StateElectionContest, StateElectionData, StateElectionEvent } from "../types";
import { formatCompact, formatNumber, formatPct, formatShortDate, normalise, toSlug } from "../utils";

function formatOptionalPct(value: number | null, digits = 1) {
  return value === null ? "—" : formatPct(value, digits);
}

function formatOptionalNumber(value: number | null) {
  return value === null ? "—" : formatNumber(value);
}

function LoadingStateElections() {
  return <section className="route-loading">Memuatkan keputusan rasmi pilihan raya negeri…</section>;
}

function ErrorStateElections({ message }: { message: string }) {
  return <section className="scoresheet-unavailable is-error"><Icon name="info" size={20}/><div><strong>Data PRN tidak dapat dimuatkan</strong><p>{message}</p></div></section>;
}

function EventCard({ event, registry }: { event: StateElectionEvent; registry: ConstituencyRegistry }) {
  const state = registry.states.find((item) => item.id === event.stateId)!;
  const leader = eventWinner(event);
  return <Link className="prn-event-card" to={stateElectionPath(event.stateId, event.assemblyNumber)}>
    <div className="prn-card-top"><span>{formatShortDate(event.electionDate)}</span><b>PRN KE-{event.assemblyNumber}</b></div><h2>{state.name}</h2>
    <div className="prn-card-leader"><span style={{ background: ticketColor(leader[0]) }}/><div><small>KERUSI TERBANYAK</small><TicketLogo name={leader[0]} shortName={leader[0]}/></div><strong>{leader[1]}<small> / {event.contestIds.length}</small></strong></div>
    <div className="prn-card-meta"><span><small>KELUAR MENGUNDI</small><strong>{formatOptionalPct(event.turnoutPct)}</strong></span><span><small>PEMILIH</small><strong>{formatCompact(event.registeredVoters)}</strong></span></div>
    <div className="open-seat">Lihat keputusan negeri <Icon name="arrow" size={16}/></div>
  </Link>;
}

const PUBLISHED_PRN_EDITIONS = [14, 15, 16] as const;

function StateElectionEditionNav({ activeNumber }: { activeNumber?: number }) {
  return <MotionConfig reducedMotion="user">
    <nav className="prn-edition-tabs" aria-label="Edisi pilihan raya negeri">
      <span>EDISI PRN</span>
      <div>{PUBLISHED_PRN_EDITIONS.map((number) => <Link key={number} to={stateElectionEditionPath(number)} className={activeNumber === number ? "is-active" : ""} aria-current={activeNumber === number ? "page" : undefined}>
        {activeNumber === number && <motion.i layoutId="prn-edition-active" transition={{ type: "spring", stiffness: 430, damping: 35 }}/>}
        <b>PRN-{number}</b>
      </Link>)}<Link className="is-comparison" to={stateElectionComparisonPath()}><Icon name="chart" size={16}/><b>Bandingkan</b></Link></div>
    </nav>
  </MotionConfig>;
}

export function StateElectionIndexPage() {
  const { value, error } = useStateElectionData();
  if (error) return <ErrorStateElections message={error}/>;
  if (!value) return <LoadingStateElections/>;
  const latestEvents = value.results.events.filter((event) => event.coverage === "latest");
  const latest = latestEvents[0];
  const latestContestIds = new Set(latestEvents.flatMap((event) => event.contestIds));
  const latestContests = value.results.contests.filter((contest) => latestContestIds.has(contest.id));
  const latestCandidateCount = latestContests.reduce((sum, contest) => sum + contest.candidates.length, 0);
  return <>
    <PageTitle title="Pilihan Raya Negeri"/>
    <section className="route-hero prn-index-hero"><div className="breadcrumbs"><strong>Pilihan raya negeri</strong></div><span className="overline">13 DEWAN UNDANGAN NEGERI</span><h1>Mandat negeri.<br/><em>600 kawasan.</em></h1><p>Keputusan rasmi pilihan raya terkini bagi setiap negeri, daripada calon hingga komposisi Dewan.</p><div className="route-stat-row"><div><span>NEGERI</span><strong>{value.results.metadata.stateCount}</strong></div><div><span>KERUSI DUN</span><strong>{latestContests.length}</strong></div><div><span>CALON</span><strong>{formatNumber(latestCandidateCount)}</strong></div><div><span>TERKINI</span><strong>{latest.year}</strong></div></div></section>
    <StateElectionEditionNav/>
    <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">DIREKTORI PRN</span><h2>Keputusan terkini setiap negeri</h2><p>Setiap kad merujuk acara pilihan raya yang membentuk Dewan Negeri semasa.</p></div><div className="result-count"><strong>{latestEvents.length}</strong><span>ACARA</span></div></div><div className="prn-event-grid">{latestEvents.map((event) => <EventCard key={event.id} event={event} registry={value.constituencies}/>)}</div></section>
    <aside className="storage-note prn-source-note"><Icon name="database" size={19}/><div><strong>Keputusan rasmi SPR</strong><p>Warta Kerajaan, Data Terbuka SPR, MySPR Semak dan keputusan tertangguh N.42 Tioman digabungkan secara deterministik.</p></div></aside>
  </>;
}

export function StateElectionEditionPage({ assemblyNumberOverride }: { assemblyNumberOverride?: string }) {
  const params = useParams();
  const { value, error } = useStateElectionData();
  const assemblyNumber = Number(assemblyNumberOverride ?? params.assemblyNumber);
  if (error) return <ErrorStateElections message={error}/>;
  if (!value) return <LoadingStateElections/>;
  if (!Number.isInteger(assemblyNumber) || assemblyNumber < 1) return <NotFound label="Edisi pilihan raya negeri"/>;
  const events = value.results.events
    .filter((event) => event.assemblyNumber === assemblyNumber)
    .sort((first, second) => second.electionDate.localeCompare(first.electionDate) || first.stateId.localeCompare(second.stateId));
  const eventIds = new Set(events.map((event) => event.id));
  const contests = value.results.contests.filter((contest) => eventIds.has(contest.eventId));
  const seatCount = events.reduce((total, event) => total + event.contestIds.length, 0);
  const registeredVoters = events.reduce((total, event) => total + event.registeredVoters, 0);
  const turnoutVotes = events.reduce((total, event) => total + (event.turnoutVotes ?? 0), 0);
  const turnoutPct = registeredVoters && events.every((event) => event.turnoutVotes !== null) ? turnoutVotes / registeredVoters : null;
  const composition = [...events.reduce((totals, event) => {
    Object.entries(event.seatCounts).forEach(([ticket, count]) => totals.set(ticket, (totals.get(ticket) ?? 0) + count));
    return totals;
  }, new Map<string, number>())].sort((first, second) => second[1] - first[1]);
  const dates = events.map((event) => event.electionDate).sort();
  const dateLabel = dates.length ? dates[0] === dates.at(-1) ? formatShortDate(dates[0]) : `${formatShortDate(dates[0])} – ${formatShortDate(dates.at(-1)!)}` : "";
  return <>
    <PageTitle title={`PRN-${assemblyNumber}`}/>
    <section className="route-hero prn-edition-hero">
      <div className="breadcrumbs"><Link to={PRN_BASE}>Pilihan raya negeri</Link><span>/</span><strong>PRN-{assemblyNumber}</strong></div>
      <span className="overline">ARKIB MENGIKUT NOMBOR DEWAN</span>
      <h1>PRN ke-{assemblyNumber}.<br/><em>{events.length ? `${events.length} negeri.` : "Menunggu data."}</em></h1>
      <p>{events.length ? `${dateLabel} · Semua keputusan negeri yang menggunakan nombor Dewan ke-${assemblyNumber}.` : `Struktur edisi PRN ke-${assemblyNumber} telah tersedia. Keputusan negeri belum diterbitkan dalam dataset semasa.`}</p>
      <div className="route-stat-row"><div><span>NEGERI</span><strong>{events.length}</strong></div><div><span>KERUSI DUN</span><strong>{seatCount}</strong></div><div><span>CALON</span><strong>{formatNumber(contests.reduce((total, contest) => total + contest.candidates.length, 0))}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatOptionalPct(turnoutPct)}</strong></div></div>
    </section>
    <StateElectionEditionNav activeNumber={assemblyNumber}/>
    {events.length ? <>
      <section className="prn-composition prn-edition-composition panel">
        <div className="section-heading"><div><span className="eyebrow">AGREGAT EDISI</span><h2>Mandat yang telah diterbitkan</h2></div><span className="route-count">{seatCount} kerusi</span></div>
        <div className="prn-composition-bar">{composition.map(([ticket, count]) => <span key={ticket} style={{ flex: count, background: ticketColor(ticket) }} title={`${ticket}: ${count}`}/>)}</div>
        <div className="prn-composition-list">{composition.map(([ticket, count]) => <div key={ticket}><TicketLogo name={ticket} shortName={ticket}/><strong>{count}</strong><span>KERUSI</span></div>)}</div>
      </section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">NEGERI DALAM EDISI</span><h2>Keputusan mengikut negeri</h2><p>Setiap negeri mengekalkan tarikh, calon dan komposisi Dewannya sendiri.</p></div><div className="result-count"><strong>{events.length}</strong><span>NEGERI</span></div></div><div className="prn-event-grid">{events.map((event) => <EventCard key={event.id} event={event} registry={value.constituencies}/>)}</div></section>
    </> : <section className="panel prn-edition-empty"><Icon name="info" size={26}/><div><span className="eyebrow">DATA BELUM TERSEDIA</span><h2>PRN ke-{assemblyNumber} sedia untuk backfill</h2><p>Halaman dan kontrak laluan telah diwujudkan tanpa mereka-reka keputusan. Rekod negeri akan muncul di sini apabila sumber rasmi dimasukkan.</p></div></section>}
    <aside className="storage-note prn-source-note"><Icon name="database" size={19}/><div><strong>Snapshot mengikut edisi Dewan</strong><p>Setiap negeri ditapis menggunakan `assemblyNumber`; keputusan daripada Dewan lain tidak dicampurkan ke dalam agregat ini.</p></div></aside>
  </>;
}

export function StateElectionSegmentPage() {
  const { segment } = useParams();
  return segment && /^\d+$/.test(segment)
    ? <StateElectionEditionPage assemblyNumberOverride={segment}/>
    : <StateElectionPage stateNameOverride={segment}/>;
}

function resolveEventRoute(results: StateElectionData, assemblyNumber?: string, stateName?: string) {
  const legacy = Boolean(assemblyNumber && !/^\d+$/.test(assemblyNumber) && stateName && /^\d+$/.test(stateName));
  const stateId = legacy ? assemblyNumber : stateName;
  const matching = results.events.filter((item) => item.stateId === stateId).sort((a, b) => b.electionDate.localeCompare(a.electionDate));
  const event = legacy
    ? matching.find((item) => item.year === Number(stateName))
    : assemblyNumber ? matching.find((item) => item.assemblyNumber === Number(assemblyNumber)) : matching[0];
  return { event, redirect: Boolean(event && (legacy || !assemblyNumber)) };
}

function DunResultCard({ event, contest, dun }: { event: StateElectionEvent; contest: StateElectionContest; dun: DunReference }) {
  const winner = contestWinner(contest);
  return <Link className="prn-dun-card" to={stateDunResultPath(event.stateId, event.assemblyNumber, toSlug(dun.name))}>
    <div className="prn-dun-code"><span>{dun.code}</span><span>{contest.parliamentCode}</span></div><h3>{dun.name}</h3><div className="prn-dun-winner"><TicketLogo name={winner.party} shortName={winner.shortName}/><div><small>PEMENANG</small><strong>{winner.name}</strong></div></div>
    <div className="prn-dun-stats"><span><small>UNDI</small><strong>{formatNumber(winner.votes)}</strong></span><span><small>MAJORITI</small><strong>{formatNumber(contest.majorityVotes)}</strong></span><span><small>KELUAR MENGUNDI</small><strong>{formatOptionalPct(contest.turnoutPct)}</strong></span></div><div className="open-seat">Keputusan penuh <Icon name="arrow" size={16}/></div>
  </Link>;
}

function StateElectionResultsMap({
  event,
  contests,
  visibleContests,
  registry,
}: {
  event: StateElectionEvent;
  contests: StateElectionContest[];
  visibleContests: StateElectionContest[];
  registry: ConstituencyRegistry;
}) {
  const { value: boundaryRegistry, error: registryError } = useAtlasBoundaryRegistry();
  const registryEntry = boundaryRegistry?.stateAssemblies[String(event.assemblyNumber)];
  const boundaryFile = registryEntry?.states?.[event.stateId]?.stateFile ?? registryEntry?.stateFiles[event.stateId];
  const { value: atlasBoundaries, error: boundaryError } = useAtlasStateBoundaries(event.stateId, boundaryFile);
  const boundaries = useMemo(() => atlasBoundaries ? projectAtlasStateBoundaries(atlasBoundaries) : null, [atlasBoundaries]);
  const seats = useMemo<StateElectionMapSeat[]>(() => {
    if (!boundaries) return [];
    const featureById = new Map(boundaries.features.map((feature) => [feature.id, feature]));
    return contests.map((contest) => ({
      contest,
      feature: featureById.get(contest.dunId)!,
      dun: registry.duns.find((dun) => dun.id === contest.dunId)!,
    })).filter((seat) => seat.feature && seat.dun);
  }, [boundaries, contests, registry.duns]);
  const visibleSeatIds = useMemo(() => new Set(visibleContests.map((contest) => contest.dunId)), [visibleContests]);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (visibleSeatIds.has(selectedId)) return;
    setSelectedId(visibleContests[0]?.dunId ?? "");
  }, [selectedId, visibleContests, visibleSeatIds]);

  if (registryError || boundaryError) {
    return <section className="panel prn-results-inline-map is-error"><Icon name="info" size={19}/><p>Peta tidak dapat dimuatkan: {registryError || boundaryError}</p></section>;
  }
  if (!boundaries || !seats.length) {
    return <section className="panel prn-results-inline-map is-loading">Memuatkan peta keputusan…</section>;
  }

  const visibleSeatCounts = visibleContests.reduce((counts, contest) => {
    const ticket = contestWinner(contest).shortName;
    counts.set(ticket, (counts.get(ticket) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  return <article className="panel prn-results-inline-map">
    <div className="section-heading prn-results-map-heading"><div><span className="eyebrow">PETA KEPUTUSAN</span><h3>Kawasan sepadan dengan carian</h3></div><span className="route-count">{visibleContests.length} / {contests.length} DUN</span></div>
    <StateElectionMap
      boundaries={boundaries}
      seats={seats}
      selectedId={selectedId}
      ticketFilter="SEMUA"
      visibleSeatIds={visibleSeatIds}
      onSelect={setSelectedId}
    />
    <div className="prn-map-legend" aria-label="Petunjuk keputusan ditapis">
      <strong>PEMENANG DUN</strong>
      {[...visibleSeatCounts].map(([name, count]) => <span key={name}><i style={{ background: ticketColor(name) }}/><b>{name}</b><small>{count} kerusi</small></span>)}
      {!visibleContests.length && <small>Tiada kawasan sepadan. Ubah atau kosongkan carian.</small>}
    </div>
  </article>;
}

export function StateElectionPage({ stateNameOverride }: { stateNameOverride?: string } = {}) {
  const { assemblyNumber, stateName: stateNameParam } = useParams();
  const stateName = stateNameOverride ?? stateNameParam;
  const { value, error } = useStateElectionData();
  const [query, setQuery] = useState("");
  const [ticket, setTicket] = useState("SEMUA PARTI / GABUNGAN");
  const [limit, setLimit] = useState(30);
  const route = value ? resolveEventRoute(value.results, assemblyNumber, stateName) : undefined;
  const event = route?.event;
  const state = value?.constituencies.states.find((item) => item.id === event?.stateId);
  const contests = useMemo(() => event && value ? event.contestIds.map((id) => value.results.contests.find((item) => item.id === id)!).filter(Boolean) : [], [event, value]);
  const ticketOptions = useMemo(() => [...new Set(contests.map((item) => contestWinner(item).shortName))].sort(), [contests]);
  const filtered = useMemo(() => {
    if (!value) return [];
    const needle = normalise(query);
    return contests.filter((contest) => {
      const dun = value.constituencies.duns.find((item) => item.id === contest.dunId)!;
      const winner = contestWinner(contest);
      return (ticket === "SEMUA PARTI / GABUNGAN" || winner.shortName === ticket) && (!needle || [dun.code, dun.name, contest.parliamentCode, winner.name, winner.party, winner.shortName].some((item) => normalise(item).includes(needle)));
    });
  }, [contests, query, ticket, value]);
  useEffect(() => setLimit(30), [query, ticket]);
  if (error) return <ErrorStateElections message={error}/>;
  if (!value) return <LoadingStateElections/>;
  if (!event || !state) return <NotFound label="Pilihan raya negeri"/>;
  if (route?.redirect) return <Navigate replace to={stateElectionPath(event.stateId, event.assemblyNumber)}/>;
  const leader = eventWinner(event);
  return <>
    <PageTitle title={`${state.name} ${event.year}`}/>
    <section className="route-hero prn-state-hero"><div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><Link to={stateElectionEditionPath(event.assemblyNumber)}>PRN-{event.assemblyNumber}</Link><span>/</span><strong>{state.name}</strong></div><span className="overline">PILIHAN RAYA NEGERI KE-{event.assemblyNumber}</span><h1>{state.name}</h1><p>{formatShortDate(event.electionDate)} · {event.contestIds.length} kerusi Dewan Undangan Negeri</p><div className="route-stat-row"><div><span>KERUSI</span><strong>{event.contestIds.length}</strong></div><div><span>PEMILIH</span><strong>{formatCompact(event.registeredVoters)}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatOptionalPct(event.turnoutPct)}</strong></div><div><span>TERBANYAK</span><strong><TicketLogo name={leader[0]} shortName={leader[0]}/></strong></div></div></section>
    {event.stateId === "negeri-sembilan" && event.assemblyNumber === 15 && <StateElectionViewNav event={event} mode="results"/>}
    <section className="prn-composition panel"><div className="section-heading"><div><span className="eyebrow">KOMPOSISI DEWAN</span><h2>Mandat mengikut parti / gabungan</h2></div><span className="route-count">{event.contestIds.length} kerusi</span></div><div className="prn-composition-bar">{Object.entries(event.seatCounts).map(([name, count]) => <span key={name} style={{ flex: count, background: ticketColor(name) }} title={`${name}: ${count}`}/>)}</div><div className="prn-composition-list">{Object.entries(event.seatCounts).map(([name, count]) => <div key={name}><TicketLogo name={name} shortName={name}/><strong>{count}</strong><span>KERUSI</span></div>)}</div></section>
    <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">KEPUTUSAN DUN</span><h2>Telusuri setiap kawasan</h2><p>Cari DUN, calon pemenang atau parti berdasarkan keputusan rasmi SPR.</p></div><div className="result-count"><strong>{filtered.length}</strong><span>DUN DITEMUI</span></div></div><div className="filter-bar prn-filter-bar"><SearchCombobox label="PARTI / GABUNGAN" value={ticket} options={["SEMUA PARTI / GABUNGAN", ...ticketOptions]} onChange={setTicket} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={query} onChange={(event_) => setQuery(event_.target.value)} placeholder="DUN atau calon"/></div></label>{(query || ticket !== "SEMUA PARTI / GABUNGAN") && <button className="reset-button" onClick={() => { setQuery(""); setTicket("SEMUA PARTI / GABUNGAN"); }}>Set semula</button>}</div>
      {event.stateId === "negeri-sembilan" && event.assemblyNumber === 16 && <StateElectionResultsMap event={event} contests={contests} visibleContests={filtered} registry={value.constituencies}/>}
      <div className="prn-dun-grid">{filtered.slice(0, limit).map((contest) => <DunResultCard key={contest.id} event={event} contest={contest} dun={value.constituencies.duns.find((item) => item.id === contest.dunId)!}/>)}</div>{limit < filtered.length && <button className="load-more" onClick={() => setLimit((current) => current + 30)}>Muatkan lagi <span>{Math.min(30, filtered.length - limit)}</span></button>}</section>
  </>;
}

export function StateDunResultPage() {
  const { assemblyNumber, stateName, dunName } = useParams();
  const { value, error } = useStateElectionData();
  if (error) return <ErrorStateElections message={error}/>;
  if (!value) return <LoadingStateElections/>;
  const route = resolveEventRoute(value.results, assemblyNumber, stateName);
  const event = route.event;
  const state = value.constituencies.states.find((item) => item.id === event?.stateId);
  const eventContests = event?.contestIds.map((id) => value.results.contests.find((item) => item.id === id)!).filter(Boolean) ?? [];
  const eventDunIds = new Set(eventContests.map((item) => item.dunId));
  const dun = value.constituencies.duns.find((item) => item.stateId === state?.id && eventDunIds.has(item.id) && toSlug(item.name) === dunName);
  const contest = eventContests.find((item) => item.dunId === dun?.id);
  if (!event || !state || !dun || !contest) return <NotFound label="Keputusan DUN"/>;
  if (route.redirect) return <Navigate replace to={stateDunResultPath(event.stateId, event.assemblyNumber, toSlug(dun.name))}/>;
  const parliament = value.constituencies.parliaments.find((item) => item.code === contest.parliamentCode)!;
  const ranked = [...contest.candidates].sort((a, b) => b.votes - a.votes);
  const winner = contestWinner(contest);
  const uncontested = contest.validVotes === 0 && contest.candidates.length === 1;
  const index = eventContests.findIndex((item) => item.id === contest.id);
  const adjacent = (offset: number) => { const item = eventContests[index + offset]; return item ? value.constituencies.duns.find((entry) => entry.id === item.dunId) : undefined; };
  const previous = adjacent(-1); const next = adjacent(1);
  return <>
    <PageTitle title={`${dun.code} ${dun.name}`}/>
    <section className="route-hero prn-dun-hero"><div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><Link to={stateElectionEditionPath(event.assemblyNumber)}>PRN-{event.assemblyNumber}</Link><span>/</span><Link to={stateElectionPath(state.id, event.assemblyNumber)}>{state.name}</Link><span>/</span><strong>{dun.code}</strong></div><span className="overline">KEPUTUSAN PILIHAN RAYA NEGERI</span><h1>{dun.name}</h1><p>{dun.code} · {parliament.code} {parliament.name} · {formatShortDate(contest.electionDate)}</p></section>
    <section className="parliament-detail-grid prn-result-layout"><article className="panel candidate-detail"><div className="section-heading"><div><span className="eyebrow">KEPUTUSAN PENUH</span><h2>Semua calon</h2></div><span className="route-count">{uncontested ? "Tanpa pertandingan" : `${formatNumber(contest.validVotes)} undi sah`}</span></div><div className="candidate-list">{ranked.map((candidate, candidateIndex) => <div className={`candidate-row ${candidate.status === "winner" ? "is-winner" : ""}`} key={candidate.id}><div className="candidate-rank">{String(candidateIndex + 1).padStart(2, "0")}</div><div className="candidate-copy"><div className="candidate-name-line"><strong>{candidate.name}</strong><span>{uncontested ? "MTB" : formatNumber(candidate.votes)}</span></div><div className="candidate-meta"><span className="candidate-identities"><TicketLogo name={candidate.party} shortName={candidate.shortName}/></span><span>{uncontested ? "MENANG TANPA BERTANDING" : formatPct(candidate.share, 2)}</span></div><div className="result-track"><span style={{ width: `${uncontested ? 100 : candidate.share * 100}%`, background: ticketColor(candidate.shortName) }}/></div></div></div>)}</div></article>
      <aside className="detail-sidebar"><section className="winner-card prn-winner-card" style={{ "--winner": ticketColor(winner.shortName) } as React.CSSProperties}><div className="winner-label"><span>PEMENANG PRN</span><TicketLogo name={winner.party} shortName={winner.shortName}/></div><h3>{winner.name}</h3><div className="winner-stats"><div><strong>{uncontested ? "MTB" : formatNumber(winner.votes)}</strong><span>{uncontested ? "status" : "undi"}</span></div><div><strong>{uncontested ? "—" : formatPct(winner.share, 2)}</strong><span>bahagian undi</span></div><div><strong>{uncontested ? "—" : formatNumber(contest.majorityVotes)}</strong><span>majoriti</span></div></div></section><div className="detail-facts">{uncontested && <div className="is-wide"><span>Kaedah kemenangan</span><strong>Tanpa pertandingan</strong></div>}<div><span>Pemilih berdaftar</span><strong>{formatOptionalNumber(contest.registeredVoters)}</strong></div><div><span>Kertas undi dikeluarkan</span><strong>{formatOptionalNumber(contest.turnoutVotes)}</strong></div><div><span>Keluar mengundi</span><strong>{formatOptionalPct(contest.turnoutPct, 2)}</strong></div><div><span>Calon bertanding</span><strong>{contest.candidates.length}</strong></div><div><span>Undi ditolak</span><strong>{formatOptionalNumber(contest.rejectedVotes)}</strong></div><div><span>Tidak dikembalikan</span><strong>{formatOptionalNumber(contest.unreturnedVotes)}</strong></div></div>{!dun.id.startsWith("sabah-2018:") && <Link className="prn-geography-link" to={dunPath(DEFAULT_ELECTION_NUMBER, state.id, toSlug(parliament.name), toSlug(dun.name))}><div><span>HIERARKI KAWASAN</span><strong>DUN → PDM → lokaliti</strong></div><Icon name="arrow" size={17}/></Link>}</aside>
    </section>
    {(event.assemblyNumber === 14 || event.id === "prn-sabah-2018") && <StateScoresheetDetail contest={contest} assemblyNumber={event.assemblyNumber}/>}
    <nav className="adjacent-seats" aria-label="DUN bersebelahan">{previous ? <Link to={stateDunResultPath(state.id, event.assemblyNumber, toSlug(previous.name))}><span>← SEBELUMNYA</span><strong>{previous.code} {previous.name}</strong></Link> : <i/>}{next && <Link to={stateDunResultPath(state.id, event.assemblyNumber, toSlug(next.name))}><span>SETERUSNYA →</span><strong>{next.code} {next.name}</strong></Link>}</nav>
  </>;
}
