import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ElectionComparisonChart, type ComparisonChartMetric, type ComparisonChartSeries } from "../components/charts/ElectionComparisonChart";
import { ComparisonEditionPicker, comparisonEditionColor, ComparisonMetricTabs } from "../components/comparison/ComparisonControls";
import { TicketLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { useStateElectionData } from "../data/hooks/useStateElectionData";
import { contestWinner, eventWinner, ticketColor } from "../data/stateElectionUtils";
import {
  PRN_BASE,
  stateDunResultPath,
  stateElectionComparisonPath,
  stateElectionDunComparisonPath,
  stateElectionEditionPath,
  stateElectionPartyComparisonPath,
  stateElectionPath,
  stateElectionStateComparisonPath,
} from "../routes";
import type { StateElectionContest, StateElectionEvent } from "../data/types/stateElection";
import { formatCompact, formatNumber, formatPct, toSlug } from "../utils";

const STANDARD_METRICS: Array<{ id: ComparisonChartMetric; label: string }> = [
  { id: "kerusi", label: "Kerusi" },
  { id: "turnout", label: "Keluar mengundi" },
  { id: "pemilih", label: "Pemilih" },
  { id: "calon", label: "Calon" },
];
const PARTY_METRICS: Array<{ id: ComparisonChartMetric; label: string }> = [
  { id: "kerusi", label: "Kerusi" },
  { id: "undi", label: "Undi" },
  { id: "calon", label: "Calon" },
];

type EditionModel = {
  edition: number;
  events: StateElectionEvent[];
  contests: StateElectionContest[];
  applicable: boolean;
  seats: number;
  candidates: number;
  registeredVoters: number;
  turnoutVotes: number;
  turnoutPct: number | null;
  composition: Map<string, number>;
  partyVotes: number;
  partyShare: number | null;
};

function appendQuery(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function modelValue(model: EditionModel, metric: ComparisonChartMetric, partyMode: boolean) {
  if (!model.applicable) return null;
  if (metric === "kerusi") return model.seats;
  if (metric === "calon") return model.candidates;
  if (metric === "undi") return model.partyVotes;
  if (metric === "pemilih") return model.registeredVoters;
  return partyMode ? (model.partyShare === null ? null : model.partyShare * 100) : (model.turnoutPct === null ? null : model.turnoutPct * 100);
}

function metricTitle(metric: ComparisonChartMetric, partyTicket?: string) {
  if (metric === "kerusi") return "Perubahan komposisi kerusi";
  if (metric === "turnout") return "Kadar keluar mengundi";
  if (metric === "pemilih") return "Saiz daftar pemilih";
  if (metric === "undi") return `Undi untuk tiket ${partyTicket}`;
  return "Bilangan calon bertanding";
}

function EditionCard({
  model,
  stateId,
  dunSlug,
  partyTicket,
  editionColor,
  query,
}: {
  model: EditionModel;
  stateId?: string;
  dunSlug?: string;
  partyTicket?: string;
  editionColor: string;
  query: URLSearchParams;
}) {
  const event = model.events[0];
  const href = event
    ? dunSlug && stateId
      ? stateDunResultPath(stateId, model.edition, dunSlug)
      : stateId
        ? stateElectionPath(stateId, model.edition)
        : stateElectionEditionPath(model.edition)
    : "";
  return <motion.article
    layout
    className={`comparison-edition-card ${model.applicable ? "" : "is-na"}`}
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: .97 }}
    transition={{ type: "spring", stiffness: 330, damping: 31 }}
  >
    <div className="comparison-edition-card-head"><span>PRN-{model.edition}</span><i style={{ background: editionColor }}/></div>
    {!model.applicable ? <div className="comparison-na"><strong>Tidak berkenaan</strong><span>Skop ini tidak menggunakan nombor Dewan ke-{model.edition}.</span></div> : <>
      <div className="comparison-edition-logos">{[...model.composition.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([ticket, seats]) => <span key={ticket}><TicketLogo name={ticket} shortName={ticket}/><b>{seats}</b></span>)}</div>
      <dl>
        <div><dt>{partyTicket ? "Kerusi dimenangi" : dunSlug ? "Kerusi" : "Kerusi DUN"}</dt><dd>{formatNumber(model.seats)}</dd></div>
        {partyTicket
          ? <><div><dt>Undi</dt><dd>{formatCompact(model.partyVotes)}</dd></div><div><dt>Bahagian undi</dt><dd>{model.partyShare === null ? "—" : formatPct(model.partyShare, 1)}</dd></div><div><dt>Calon</dt><dd>{formatNumber(model.candidates)}</dd></div></>
          : <><div><dt>Pemilih</dt><dd>{formatCompact(model.registeredVoters)}</dd></div><div><dt>Keluar mengundi</dt><dd>{model.turnoutPct === null ? "—" : formatPct(model.turnoutPct, 1)}</dd></div><div><dt>Calon</dt><dd>{formatNumber(model.candidates)}</dd></div></>}
      </dl>
      {href && <Link to={appendQuery(href, query)}>Lihat keputusan <Icon name="arrow" size={15}/></Link>}
    </>}
  </motion.article>;
}

export function StateElectionComparisonShortcut() {
  const { assemblyNumber } = useParams();
  const [params] = useSearchParams();
  const editions = [assemblyNumber, ...(params.get("dengan") ?? "").split(",")].filter(Boolean);
  const target = new URLSearchParams(params);
  target.delete("dengan");
  target.set("edisi", [...new Set(editions)].join(","));
  return <Navigate replace to={appendQuery(stateElectionComparisonPath(), target)}/>;
}

export function StateElectionComparisonPage() {
  const { stateName, dunName, partyName } = useParams();
  const { value, error } = useStateElectionData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  if (error) return <section className="scoresheet-unavailable is-error"><Icon name="info" size={20}/><div><strong>Data perbandingan tidak dapat dimuatkan</strong><p>{error}</p></div></section>;
  if (!value) return <section className="route-loading">Menyusun perbandingan rentas edisi…</section>;

  const availableEditions = [...new Set(value.results.events.map((event) => event.assemblyNumber).filter((number) => number >= 14 && number <= 16))].sort((a, b) => a - b);
  const requestedEditions = (searchParams.get("edisi") ?? availableEditions.join(",")).split(",").map(Number).filter((number) => availableEditions.includes(number));
  const uniqueRequestedEditions = new Set(requestedEditions);
  const selectedEditions = uniqueRequestedEditions.size >= 2 ? [...uniqueRequestedEditions].sort((a, b) => a - b) : availableEditions;
  const state = stateName ? value.constituencies.states.find((item) => item.id === stateName) : undefined;
  if (stateName && !state) return <NotFound label="Negeri untuk perbandingan PRN"/>;
  const dun = dunName && state ? value.constituencies.duns.find((item) => item.stateId === state.id && toSlug(item.name) === dunName) : undefined;
  if (dunName && !dun) return <NotFound label="DUN untuk perbandingan PRN"/>;

  const allTickets = [...new Set(value.results.contests.flatMap((contest) => contest.candidates.map((candidate) => candidate.shortName)))].sort();
  const partyTicket = partyName ? allTickets.find((ticket) => toSlug(ticket) === partyName) : undefined;
  if (partyName && !partyTicket) return <NotFound label="Parti atau tiket untuk perbandingan PRN"/>;
  const metricOptions = partyTicket ? PARTY_METRICS : STANDARD_METRICS;
  const requestedMetric = searchParams.get("metrik") as ComparisonChartMetric | null;
  const metric = metricOptions.some((item) => item.id === requestedMetric) ? requestedMetric! : "kerusi";

  const models = selectedEditions.map((edition): EditionModel => {
    const editionEvents = value.results.events.filter((event) => event.assemblyNumber === edition && (!state || event.stateId === state.id));
    const eventIds = new Set(editionEvents.map((event) => event.id));
    let contests = value.results.contests.filter((contest) => eventIds.has(contest.eventId));
    if (dun) contests = contests.filter((contest) => contest.dunId === dun.id);
    const scopeHasEvent = editionEvents.length > 0 && (!dun || contests.length > 0);
    if (partyTicket) {
      const partyContests = contests.filter((contest) => contest.candidates.some((candidate) => candidate.shortName === partyTicket));
      const partyCandidates = partyContests.flatMap((contest) => contest.candidates.filter((candidate) => candidate.shortName === partyTicket));
      const partyVotes = partyCandidates.reduce((sum, candidate) => sum + candidate.votes, 0);
      const validVotes = partyContests.reduce((sum, contest) => sum + contest.validVotes, 0);
      const won = partyContests.filter((contest) => contestWinner(contest).shortName === partyTicket).length;
      return {
        edition,
        events: editionEvents,
        contests: partyContests,
        applicable: editionEvents.length > 0,
        seats: won,
        candidates: partyCandidates.length,
        registeredVoters: partyContests.reduce((sum, contest) => sum + (contest.registeredVoters ?? 0), 0),
        turnoutVotes: partyContests.reduce((sum, contest) => sum + (contest.turnoutVotes ?? 0), 0),
        turnoutPct: null,
        composition: new Map([[partyTicket, won]]),
        partyVotes,
        partyShare: validVotes ? partyVotes / validVotes : null,
      };
    }
    const composition = contests.reduce((totals, contest) => {
      const ticket = contestWinner(contest).shortName;
      totals.set(ticket, (totals.get(ticket) ?? 0) + 1);
      return totals;
    }, new Map<string, number>());
    const registeredVoters = contests.reduce((sum, contest) => sum + (contest.registeredVoters ?? 0), 0);
    const turnoutVotes = contests.reduce((sum, contest) => sum + (contest.turnoutVotes ?? 0), 0);
    return {
      edition,
      events: editionEvents,
      contests,
      applicable: scopeHasEvent,
      seats: contests.length,
      candidates: contests.reduce((sum, contest) => sum + contest.candidates.length, 0),
      registeredVoters,
      turnoutVotes,
      turnoutPct: registeredVoters && contests.every((contest) => contest.turnoutVotes !== null) ? turnoutVotes / registeredVoters : null,
      composition,
      partyVotes: 0,
      partyShare: null,
    };
  });

  const statesInScope = value.constituencies.states
    .filter((item) => value.results.events.some((event) => selectedEditions.includes(event.assemblyNumber) && event.stateId === item.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const editionColors = new Map(availableEditions.map((edition) => [edition, comparisonEditionColor(edition, availableEditions)]));

  const chart = (() => {
    if (metric === "kerusi") {
      const tickets = [...new Set(models.flatMap((model) => [...model.composition.keys()]))];
      const series: ComparisonChartSeries[] = tickets.map((ticket) => ({
        label: ticket,
        data: models.map((model) => model.applicable ? (model.composition.get(ticket) ?? 0) : null),
        color: ticketColor(ticket),
        stack: "mandat",
      }));
      return { labels: models.map((model) => `PRN-${model.edition}`), series, stacked: true, horizontal: true };
    }
    if (!state && !partyTicket) {
      const series: ComparisonChartSeries[] = selectedEditions.map((edition) => ({
        label: `PRN-${edition}`,
        color: editionColors.get(edition)!,
        data: statesInScope.map((stateItem) => {
          const event = value.results.events.find((item) => item.assemblyNumber === edition && item.stateId === stateItem.id);
          if (!event) return null;
          const contests = event.contestIds.map((id) => value.results.contests.find((contest) => contest.id === id)!).filter(Boolean);
          if (metric === "turnout") return event.turnoutPct === null ? null : event.turnoutPct * 100;
          if (metric === "pemilih") return event.registeredVoters;
          return contests.reduce((sum, contest) => sum + contest.candidates.length, 0);
        }),
      }));
      return { labels: statesInScope.map((item) => item.name), series, stacked: false, horizontal: false };
    }
    return {
      labels: models.map((model) => `PRN-${model.edition}`),
      series: [{ label: partyTicket ?? dun?.name ?? state?.name ?? "Semua negeri", color: partyTicket ? ticketColor(partyTicket) : "#2f69a3", data: models.map((model) => modelValue(model, metric, Boolean(partyTicket))) }],
      stacked: false,
      horizontal: false,
    };
  })();

  const updateMetric = (nextMetric: ComparisonChartMetric) => {
    const next = new URLSearchParams(searchParams);
    next.set("metrik", nextMetric);
    setSearchParams(next, { replace: true });
  };
  const toggleEdition = (edition: number) => {
    const nextEditions = selectedEditions.includes(edition)
      ? selectedEditions.filter((item) => item !== edition)
      : [...selectedEditions, edition].sort((a, b) => a - b);
    if (nextEditions.length < 2) return;
    const next = new URLSearchParams(searchParams);
    next.set("edisi", nextEditions.join(","));
    setSearchParams(next, { replace: true });
  };
  const navigateScope = (path: string) => navigate(appendQuery(path, searchParams));
  const scopeTitle = partyTicket ? `Tiket ${partyTicket}` : dun ? `${dun.code} ${dun.name}` : state ? state.name : "Semua negeri";
  const scopeCopy = partyTicket
    ? "Prestasi tiket pada kertas undi dibandingkan tanpa menganggap singkatan berlainan sebagai parti yang sama."
    : dun
      ? `Kerusi yang sama dalam ${state!.name}, dengan edisi yang tidak berkenaan ditandakan secara eksplisit.`
      : state
        ? `Perubahan mandat ${state.name} mengikut nombor Dewan yang tersedia.`
        : "Komposisi, keluar mengundi dan skala pertandingan dibandingkan tanpa menukar ketiadaan data menjadi angka sifar.";
  const totalRecords = models.reduce((sum, model) => sum + model.contests.length, 0);
  const totalCandidates = models.reduce((sum, model) => sum + model.candidates, 0);

  return <MotionConfig reducedMotion="user">
    <PageTitle title={`Perbandingan PRN · ${scopeTitle}`}/>
    <section className="route-hero comparison-hero">
      <div className="breadcrumbs"><Link to={PRN_BASE}>PRN</Link><span>/</span><strong>Perbandingan</strong>{state && <><span>/</span><strong>{state.name}</strong></>}{dun && <><span>/</span><strong>{dun.code}</strong></>}</div>
      <span className="overline">ANALISIS RENTAS EDISI</span>
      <h1>Bandingkan PRN.<br/><em>{selectedEditions.length} edisi.</em></h1>
      <p>{scopeCopy}</p>
      <div className="route-stat-row"><div><span>EDISI</span><strong>{selectedEditions.length}</strong></div><div><span>SKOP</span><strong>{scopeTitle}</strong></div><div><span>REKOD DUN</span><strong>{formatNumber(totalRecords)}</strong></div><div><span>CALON</span><strong>{formatNumber(totalCandidates)}</strong></div></div>
    </section>

    <section className="panel comparison-controls">
      <ComparisonEditionPicker editions={availableEditions.map((edition) => ({ id: edition, label: `PRN-${edition}`, color: editionColors.get(edition) }))} selected={selectedEditions} onToggle={toggleEdition}/>
      <div className="comparison-scope-filters">
        <SearchCombobox label="NEGERI" value={state?.name ?? "SEMUA NEGERI"} options={["SEMUA NEGERI", ...statesInScope.map((item) => item.name)]} onChange={(name) => {
          const selected = value.constituencies.states.find((item) => item.name === name);
          navigateScope(selected ? stateElectionStateComparisonPath(selected.id) : stateElectionComparisonPath());
        }} allowCustom={false}/>
        {state && <SearchCombobox label="DUN" value={dun ? `${dun.code} ${dun.name}` : "SEMUA DUN"} options={["SEMUA DUN", ...value.constituencies.duns.filter((item) => item.stateId === state.id).map((item) => `${item.code} ${item.name}`)]} onChange={(name) => {
          const selected = value.constituencies.duns.find((item) => item.stateId === state.id && `${item.code} ${item.name}` === name);
          navigateScope(selected ? stateElectionDunComparisonPath(state.id, toSlug(selected.name)) : stateElectionStateComparisonPath(state.id));
        }} allowCustom={false}/>}
        <SearchCombobox label="PARTI / TIKET" value={partyTicket ?? "SEMUA PARTI / TIKET"} options={["SEMUA PARTI / TIKET", ...allTickets]} onChange={(ticket) => navigateScope(ticket === "SEMUA PARTI / TIKET" ? stateElectionComparisonPath() : stateElectionPartyComparisonPath(toSlug(ticket)))} allowCustom={false}/>
      </div>
    </section>

    <section className="panel comparison-chart-panel">
      <div className="section-heading comparison-chart-heading"><div><span className="eyebrow">CARTA PERBANDINGAN</span><h2>{metricTitle(metric, partyTicket)}</h2><p>Nilai “Tidak berkenaan” kekal kosong dan tidak diplot sebagai sifar.</p></div><ComparisonMetricTabs options={metricOptions} selected={metric} layoutId="prn-comparison-metric-active" onChange={updateMetric}/></div>
      <AnimatePresence mode="wait"><motion.div key={`${metric}-${selectedEditions.join("-")}-${scopeTitle}`} className="comparison-chart" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .22 }}>
        <ElectionComparisonChart labels={chart.labels} series={chart.series} metric={metric} stacked={chart.stacked} horizontal={chart.horizontal} ariaLabel={`${metricTitle(metric, partyTicket)} bagi ${scopeTitle}, ${selectedEditions.map((edition) => `PRN-${edition}`).join(", ")}`}/>
      </motion.div></AnimatePresence>
    </section>

    <section className="comparison-edition-grid" aria-label="Ringkasan setiap edisi">
      <AnimatePresence initial={false}>{models.map((model) => <EditionCard key={model.edition} model={model} stateId={state?.id} dunSlug={dun ? toSlug(dun.name) : undefined} partyTicket={partyTicket} editionColor={editionColors.get(model.edition)!} query={searchParams}/>)}</AnimatePresence>
    </section>

    {!state && !partyTicket && <section className="panel comparison-matrix">
      <div className="section-heading"><div><span className="eyebrow">LIPUTAN NEGERI</span><h2>Ada, tiada dan tidak berkenaan</h2><p>Setiap sel mewakili satu negeri dalam satu nombor Dewan.</p></div></div>
      <div className="comparison-matrix-scroll"><div className="comparison-matrix-grid" style={{ "--edition-count": selectedEditions.length } as React.CSSProperties}>
        <div className="comparison-matrix-head"><span>NEGERI</span>{selectedEditions.map((edition) => <strong key={edition}>PRN-{edition}</strong>)}</div>
        {statesInScope.map((stateItem) => <div className="comparison-matrix-row" key={stateItem.id}><Link to={appendQuery(stateElectionStateComparisonPath(stateItem.id), searchParams)}>{stateItem.name}</Link>{selectedEditions.map((edition) => {
          const event = value.results.events.find((item) => item.assemblyNumber === edition && item.stateId === stateItem.id);
          if (!event) return <motion.div layout className="comparison-matrix-na" key={edition}><span>Tidak berkenaan</span></motion.div>;
          const leader = eventWinner(event);
          return <motion.div layout className="comparison-matrix-value" key={edition}><TicketLogo name={leader[0]} shortName={leader[0]}/><strong>{leader[1]} / {event.contestIds.length}</strong><span>{event.turnoutPct === null ? "—" : formatPct(event.turnoutPct, 1)}</span></motion.div>;
        })}</div>)}
      </div></div>
    </section>}

    <aside className="storage-note comparison-note"><Icon name="info" size={19}/><div><strong>Perbandingan berdasarkan nombor Dewan</strong><p>Sabah, Sarawak dan negeri lain boleh mempunyai urutan Dewan yang berbeza. “Tidak berkenaan” bermaksud negeri tersebut tidak mempunyai acara bagi nombor Dewan yang dipilih—bukan keputusan sifar.</p></div></aside>
  </MotionConfig>;
}
