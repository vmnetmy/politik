import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { TicketLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { dunPath, PRN_BASE, stateDunResultPath, stateElectionPath } from "../routes";
import type { ConstituencyRegistry, DunReference, StateElectionContest, StateElectionData, StateElectionEvent } from "../types";
import { formatCompact, formatNumber, formatPct, normalise, toSlug } from "../utils";

type LoadedStateElectionData = { results: StateElectionData; constituencies: ConstituencyRegistry };
let dataPromise: Promise<LoadedStateElectionData> | null = null;

function loadData() {
  dataPromise ??= Promise.all([
    fetch("/data/state-elections.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
    fetch("/data/constituencies.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
  ]).then(([results, constituencies]) => ({ results, constituencies }));
  return dataPromise;
}

function useStateElectionData() {
  const [value, setValue] = useState<LoadedStateElectionData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; loadData().then((loaded) => active && setValue(loaded)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui")); return () => { active = false; }; }, []);
  return { value, error };
}

const TICKET_COLORS: Record<string, string> = {
  PH: "#e64b43", PN: "#08725d", BN: "#2162a3", GPS: "#e4a321", GRS: "#65afc1", PAS: "#08725d",
  WARISAN: "#55a8bf", BEBAS: "#818b86", PSB: "#dd7853", DAP: "#dc4039", PKR: "#48a8c9", MUDA: "#202b42",
};

function ticketColor(shortName: string) {
  if (TICKET_COLORS[shortName]) return TICKET_COLORS[shortName];
  let hash = 0;
  for (const character of shortName) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 38% 45%)`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

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

function eventWinner(event: StateElectionEvent) {
  return Object.entries(event.seatCounts).sort((a, b) => b[1] - a[1])[0];
}

function EventCard({ event, registry }: { event: StateElectionEvent; registry: ConstituencyRegistry }) {
  const state = registry.states.find((item) => item.id === event.stateId)!;
  const leader = eventWinner(event);
  return <Link className="prn-event-card" to={stateElectionPath(event.stateId, event.assemblyNumber)}>
    <div className="prn-card-top"><span>{formatDate(event.electionDate)}</span><b>PRN KE-{event.assemblyNumber}</b></div><h2>{state.name}</h2>
    <div className="prn-card-leader"><span style={{ background: ticketColor(leader[0]) }}/><div><small>KERUSI TERBANYAK</small><TicketLogo name={leader[0]} shortName={leader[0]}/></div><strong>{leader[1]}<small> / {event.contestIds.length}</small></strong></div>
    <div className="prn-card-meta"><span><small>TURNOUT</small><strong>{formatOptionalPct(event.turnoutPct)}</strong></span><span><small>PEMILIH</small><strong>{formatCompact(event.registeredVoters)}</strong></span></div>
    <div className="open-seat">Lihat keputusan negeri <Icon name="arrow" size={16}/></div>
  </Link>;
}

export function StateElectionIndexPage() {
  const { value, error } = useStateElectionData();
  if (error) return <ErrorStateElections message={error}/>;
  if (!value) return <LoadingStateElections/>;
  const latest = value.results.events[0];
  return <>
    <PageTitle title="Pilihan Raya Negeri"/>
    <section className="route-hero prn-index-hero"><div className="breadcrumbs"><strong>Pilihan raya negeri</strong></div><span className="overline">13 DEWAN UNDANGAN NEGERI</span><h1>Mandat negeri.<br/><em>600 kawasan.</em></h1><p>Keputusan rasmi pilihan raya terkini bagi setiap negeri, daripada calon hingga komposisi Dewan.</p><div className="route-stat-row"><div><span>NEGERI</span><strong>{value.results.metadata.stateCount}</strong></div><div><span>KERUSI DUN</span><strong>{value.results.metadata.contestCount}</strong></div><div><span>CALON</span><strong>{formatNumber(value.results.metadata.candidateCount)}</strong></div><div><span>TERKINI</span><strong>{latest.year}</strong></div></div></section>
    <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">DIREKTORI PRN</span><h2>Keputusan terkini setiap negeri</h2><p>Setiap kad merujuk acara pilihan raya yang membentuk Dewan Negeri semasa.</p></div><div className="result-count"><strong>{value.results.events.length}</strong><span>ACARA</span></div></div><div className="prn-event-grid">{value.results.events.map((event) => <EventCard key={event.id} event={event} registry={value.constituencies}/>)}</div></section>
    <aside className="storage-note prn-source-note"><Icon name="database" size={19}/><div><strong>Keputusan rasmi SPR</strong><p>Warta Kerajaan, Data Terbuka SPR, MySPR Semak dan keputusan tertangguh N.42 Tioman digabungkan secara deterministik.</p></div></aside>
  </>;
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

function contestWinner(contest: StateElectionContest) {
  return contest.candidates.find((candidate) => candidate.id === contest.winnerCandidateId)!;
}

function DunResultCard({ event, contest, dun }: { event: StateElectionEvent; contest: StateElectionContest; dun: DunReference }) {
  const winner = contestWinner(contest);
  return <Link className="prn-dun-card" to={stateDunResultPath(event.stateId, event.assemblyNumber, toSlug(dun.name))}>
    <div className="prn-dun-code"><span>{dun.code}</span><span>{contest.parliamentCode}</span></div><h3>{dun.name}</h3><div className="prn-dun-winner"><TicketLogo name={winner.party} shortName={winner.shortName}/><div><small>PEMENANG</small><strong>{winner.name}</strong></div></div>
    <div className="prn-dun-stats"><span><small>UNDI</small><strong>{formatNumber(winner.votes)}</strong></span><span><small>MAJORITI</small><strong>{formatNumber(contest.majorityVotes)}</strong></span><span><small>TURNOUT</small><strong>{formatOptionalPct(contest.turnoutPct)}</strong></span></div><div className="open-seat">Keputusan penuh <Icon name="arrow" size={16}/></div>
  </Link>;
}

export function StateElectionPage() {
  const { assemblyNumber, stateName } = useParams();
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
    <section className="route-hero prn-state-hero"><div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><strong>{state.name}</strong></div><span className="overline">PILIHAN RAYA NEGERI KE-{event.assemblyNumber}</span><h1>{state.name}</h1><p>{formatDate(event.electionDate)} · {event.contestIds.length} kerusi Dewan Undangan Negeri</p><div className="route-stat-row"><div><span>KERUSI</span><strong>{event.contestIds.length}</strong></div><div><span>PEMILIH</span><strong>{formatCompact(event.registeredVoters)}</strong></div><div><span>TURNOUT</span><strong>{formatOptionalPct(event.turnoutPct)}</strong></div><div><span>TERBANYAK</span><strong><TicketLogo name={leader[0]} shortName={leader[0]}/></strong></div></div></section>
    <section className="prn-composition panel"><div className="section-heading"><div><span className="eyebrow">KOMPOSISI DEWAN</span><h2>Mandat mengikut parti / gabungan</h2></div><span className="route-count">{event.contestIds.length} kerusi</span></div><div className="prn-composition-bar">{Object.entries(event.seatCounts).map(([name, count]) => <span key={name} style={{ flex: count, background: ticketColor(name) }} title={`${name}: ${count}`}/>)}</div><div className="prn-composition-list">{Object.entries(event.seatCounts).map(([name, count]) => <div key={name}><TicketLogo name={name} shortName={name}/><strong>{count}</strong><span>KERUSI</span></div>)}</div></section>
    <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">KEPUTUSAN DUN</span><h2>Telusuri setiap kawasan</h2><p>Cari DUN, calon pemenang atau parti berdasarkan keputusan rasmi SPR.</p></div><div className="result-count"><strong>{filtered.length}</strong><span>DUN DITEMUI</span></div></div><div className="filter-bar prn-filter-bar"><SearchCombobox label="PARTI / GABUNGAN" value={ticket} options={["SEMUA PARTI / GABUNGAN", ...ticketOptions]} onChange={setTicket} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={query} onChange={(event_) => setQuery(event_.target.value)} placeholder="DUN atau calon"/></div></label>{(query || ticket !== "SEMUA PARTI / GABUNGAN") && <button className="reset-button" onClick={() => { setQuery(""); setTicket("SEMUA PARTI / GABUNGAN"); }}>Set semula</button>}</div>
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
  const dun = value.constituencies.duns.find((item) => item.stateId === state?.id && toSlug(item.name) === dunName);
  const contest = value.results.contests.find((item) => item.eventId === event?.id && item.dunId === dun?.id);
  if (!event || !state || !dun || !contest) return <NotFound label="Keputusan DUN"/>;
  if (route.redirect) return <Navigate replace to={stateDunResultPath(event.stateId, event.assemblyNumber, toSlug(dun.name))}/>;
  const parliament = value.constituencies.parliaments.find((item) => item.code === contest.parliamentCode)!;
  const ranked = [...contest.candidates].sort((a, b) => b.votes - a.votes);
  const winner = contestWinner(contest);
  const eventContests = event.contestIds.map((id) => value.results.contests.find((item) => item.id === id)!).filter(Boolean);
  const index = eventContests.findIndex((item) => item.id === contest.id);
  const adjacent = (offset: number) => { const item = eventContests[index + offset]; return item ? value.constituencies.duns.find((entry) => entry.id === item.dunId) : undefined; };
  const previous = adjacent(-1); const next = adjacent(1);
  return <>
    <PageTitle title={`${dun.code} ${dun.name}`}/>
    <section className="route-hero prn-dun-hero"><div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><Link to={stateElectionPath(state.id, event.assemblyNumber)}>{state.name} PRN-{event.assemblyNumber}</Link><span>/</span><strong>{dun.code}</strong></div><span className="overline">KEPUTUSAN PILIHAN RAYA NEGERI</span><h1>{dun.name}</h1><p>{dun.code} · {parliament.code} {parliament.name} · {formatDate(contest.electionDate)}</p></section>
    <section className="parliament-detail-grid prn-result-layout"><article className="panel candidate-detail"><div className="section-heading"><div><span className="eyebrow">KEPUTUSAN PENUH</span><h2>Semua calon</h2></div><span className="route-count">{formatNumber(contest.validVotes)} undi sah</span></div><div className="candidate-list">{ranked.map((candidate, candidateIndex) => <div className={`candidate-row ${candidate.status === "winner" ? "is-winner" : ""}`} key={candidate.id}><div className="candidate-rank">{String(candidateIndex + 1).padStart(2, "0")}</div><div className="candidate-copy"><div className="candidate-name-line"><strong>{candidate.name}</strong><span>{formatNumber(candidate.votes)}</span></div><div className="candidate-meta"><span className="candidate-identities"><TicketLogo name={candidate.party} shortName={candidate.shortName}/></span><span>{formatPct(candidate.share, 2)}</span></div><div className="result-track"><span style={{ width: `${candidate.share * 100}%`, background: ticketColor(candidate.shortName) }}/></div></div></div>)}</div></article>
      <aside className="detail-sidebar"><section className="winner-card prn-winner-card" style={{ "--winner": ticketColor(winner.shortName) } as React.CSSProperties}><div className="winner-label"><span>PEMENANG PRN</span><TicketLogo name={winner.party} shortName={winner.shortName}/></div><h3>{winner.name}</h3><div className="winner-stats"><div><strong>{formatNumber(winner.votes)}</strong><span>undi</span></div><div><strong>{formatPct(winner.share, 2)}</strong><span>bahagian undi</span></div><div><strong>{formatNumber(contest.majorityVotes)}</strong><span>majoriti</span></div></div></section><div className="detail-facts"><div><span>Pemilih berdaftar</span><strong>{formatOptionalNumber(contest.registeredVoters)}</strong></div><div><span>Kertas undi dikeluarkan</span><strong>{formatOptionalNumber(contest.turnoutVotes)}</strong></div><div><span>Keluar mengundi</span><strong>{formatOptionalPct(contest.turnoutPct, 2)}</strong></div><div><span>Calon bertanding</span><strong>{contest.candidates.length}</strong></div><div><span>Undi ditolak</span><strong>{formatOptionalNumber(contest.rejectedVotes)}</strong></div><div><span>Tidak dikembalikan</span><strong>{formatOptionalNumber(contest.unreturnedVotes)}</strong></div></div><Link className="prn-geography-link" to={dunPath(state.id, toSlug(parliament.name), toSlug(dun.name))}><div><span>HIERARKI KAWASAN</span><strong>DUN → PDM → lokaliti</strong></div><Icon name="arrow" size={17}/></Link></aside>
    </section>
    <nav className="adjacent-seats" aria-label="DUN bersebelahan">{previous ? <Link to={stateDunResultPath(state.id, event.assemblyNumber, toSlug(previous.name))}><span>← SEBELUMNYA</span><strong>{previous.code} {previous.name}</strong></Link> : <i/>}{next && <Link to={stateDunResultPath(state.id, event.assemblyNumber, toSlug(next.name))}><span>SETERUSNYA →</span><strong>{next.code} {next.name}</strong></Link>}</nav>
  </>;
}
