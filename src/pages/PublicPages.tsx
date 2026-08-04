import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AllianceLogo, AlliancePill, PartyLogo } from "../components/identity";
import { SeatCard } from "../components/SeatCard";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { TableShell } from "../components/ui/TableShell";
import { ParliamentGeography } from "./GeographyPages";
import { currentAlliance, currentParty, currentStatus } from "../dataChanges";
import { summarizeElectionSeats } from "../data/electionAnalysis";
import { useElection } from "../ElectionContext";
import { ELECTION_EDITIONS, formatElectionDate } from "../elections";
import { federalElectionComparisonPath, PRN_BASE } from "../routes";
import type { ConstituencyRegistry, ElectionData, GeographyData, PollingPlacesData, ScoresheetIndex, Seat } from "../types";
import { allianceColor, buildStateSummaries, formatCompact, formatNumber, formatPct, formatShortDate, normalise, shortAlliance, toSlug } from "../utils";

const ScoresheetDetail = lazy(() => import("../components/scoresheet/ScoresheetDetail").then((module) => ({ default: module.ScoresheetDetail })));

export function FederalElectionIndexPage() {
  const editions = [...ELECTION_EDITIONS].sort((first, second) => first.electionDate.localeCompare(second.electionDate));
  const currentEdition = editions.find((edition) => edition.isCurrentTerm);
  const firstYear = editions[0]?.electionDate.slice(0, 4);
  const lastYear = editions.at(-1)?.electionDate.slice(0, 4);
  const yearRange = firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;
  return (
    <>
      <PageTitle title="Pilihan Raya Umum"/>
      <section className="route-hero election-detail-hero">
        <div className="breadcrumbs"><strong>Pilihan Raya Umum</strong></div>
        <span className="overline">ARKIB PILIHAN RAYA PARLIMEN</span>
        <h1>Mandat Malaysia.<br/><em>Setiap penggal.</em></h1>
        <p>Bandingkan keputusan rasmi Parlimen tanpa mencampurkan calon, parti atau perubahan semasa antara edisi.</p>
        <div className="route-stat-row"><div><span>EDISI DITERBITKAN</span><strong>{editions.length}</strong></div><div><span>TERKINI</span><strong>{currentEdition?.shortTitle ?? "—"}</strong></div><div><span>ARKIB</span><strong>{editions.filter((edition) => !edition.isCurrentTerm).length}</strong></div><div><span>JULAT DATA</span><strong>{yearRange}</strong></div></div>
      </section>
      <section className="explorer-section">
        <div className="explorer-heading"><div><span className="eyebrow">EDISI PRU</span><h2>Pilih pilihan raya</h2><p>Setiap kad membuka snapshot keputusan pada tarikh pilihan raya tersebut.</p></div></div>
        <div className="election-state-grid">
          {editions.map((edition) => <Link key={edition.id} to={`/pru/${edition.number}`}><div><span>{formatElectionDate(edition.electionDate)}</span><strong>{edition.shortTitle}</strong><small className="election-state-meta"><span>{edition.isCurrentTerm ? "Penggal semasa" : `Arkib ${edition.termId.toUpperCase()}`}</span></small></div><Icon name="arrow" size={17}/></Link>)}
          <Link className="election-comparison-entry" to={federalElectionComparisonPath()}><div><span>ANALISIS RENTAS EDISI</span><strong>Bandingkan PRU</strong><small>Kerusi, keluar mengundi, pemilih dan undi</small></div><Icon name="chart" size={19}/></Link>
        </div>
      </section>
    </>
  );
}

function SeatComposition({ seats, data, title, threshold }: { seats: Seat[]; data: ElectionData; title: string; threshold?: number }) {
  const summary = summarizeElectionSeats(seats);
  const composition = Object.entries(summary.seatCounts).sort((a, b) => b[1] - a[1]);
  return (
    <article className="panel composition-panel">
      <div className="section-heading"><div><span className="eyebrow">KOMPOSISI KERUSI</span><h2>{title}</h2></div>{threshold && <div className="majority-note"><span>Majoriti mudah</span><strong>{threshold}</strong></div>}</div>
      <div className="seat-bar" aria-label="Agihan kerusi mengikut gabungan">
        {composition.map(([name, count]) => <span key={name} title={`${shortAlliance(name, data.alliances)}: ${count}`} style={{ flex: count, background: allianceColor(name, data.alliances) }}/>) }
        {threshold && (
          <i className="majority-marker" style={{ left: `${(threshold / seats.length) * 100}%` }}/>
        )}
      </div>
      <div className="composition-list">
        {composition.map(([name, count]) => <div key={name} className="composition-row"><AllianceLogo name={name} data={data} size="md"/><strong className="seat-number">{count}</strong><span className="seat-label">KERUSI</span></div>)}
      </div>
    </article>
  );
}

export function OverviewPage({ data }: { data: ElectionData }) {
  const { paths } = useElection();
  const summary = useMemo(() => summarizeElectionSeats(data.seats), [data]);
  const states = useMemo(() => buildStateSummaries(data.seats), [data]);
  const closest = useMemo(() => [...data.seats].filter((seat) => seat.candidateCount > 1).sort((a, b) => a.marginVotes - b.marginVotes).slice(0, 5), [data]);
  return (
    <>
      <PageTitle title="Negeri"/>
      <section className="hero-section">
        <div className="hero-copy"><span className="overline">PILIHAN RAYA UMUM MALAYSIA</span><h1>{data.metadata.shortTitle}<br/><em>dalam angka.</em></h1><p>Gambaran menyeluruh keputusan Parlimen Malaysia—daripada komposisi kerusi hingga persaingan di setiap negeri.</p><div className="hero-meta"><span>{formatElectionDate(data.metadata.electionDate)}</span><i/><span>{data.metadata.stateCount} negeri / wilayah</span></div></div>
        <div className="hero-visual" aria-label={`${formatPct(summary.turnoutPct)} keluar mengundi`}><svg viewBox="0 0 220 220"><circle className="gauge-bg" cx="110" cy="110" r="88"/><circle className="gauge-value" cx="110" cy="110" r="88" pathLength="100" strokeDasharray={`${summary.turnoutPct * 100} 100`}/></svg><div><strong>{formatPct(summary.turnoutPct)}</strong><span>KELUAR<br/>MENGUNDI</span></div></div>
      </section>
      <section className="kpi-grid">
        <article><div className="kpi-icon"><Icon name="seat"/></div><div><span>KERUSI DIPERTANDINGKAN</span><strong>{data.metadata.seatCount}</strong><small>seluruh Malaysia</small></div></article>
        <article><div className="kpi-icon"><Icon name="vote"/></div><div><span>UNDI SAH</span><strong>{formatCompact(summary.validVotes)}</strong><small>{formatNumber(summary.validVotes)} undi</small></div></article>
        <article><div className="kpi-icon"><Icon name="people"/></div><div><span>PEMILIH BERDAFTAR</span><strong>{formatCompact(summary.registered)}</strong><small>di {data.metadata.stateCount} negeri / wilayah</small></div></article>
        <article><div className="kpi-icon"><Icon name="chart"/></div><div><span>CALON BERTANDING</span><strong>{data.metadata.candidateCount}</strong><small>{(data.metadata.candidateCount / data.metadata.seatCount).toFixed(1)} calon purata / kerusi</small></div></article>
      </section>
      <section className="dashboard-grid">
        <SeatComposition seats={data.seats} data={data} title="Siapa menguasai kerusi?" threshold={112}/>
        <article className="panel people-panel"><div className="section-heading"><div><span className="eyebrow">WAJAH PARLIMEN</span><h2>Profil pemenang</h2></div><div className="outline-icon"><Icon name="people"/></div></div><div className="gender-chart"><div className="gender-figure"><span className="figure-head"/><span className="figure-body"/><span className="figure-leg left"/><span className="figure-leg right"/></div><div className="gender-copy"><strong>{summary.genderCounts["PEREMPUAN"] ?? 0}</strong><span>WAKIL RAKYAT<br/>PEREMPUAN</span><small>{formatPct((summary.genderCounts["PEREMPUAN"] ?? 0) / Math.max(1, summary.occupiedSeats))} daripada kerusi berisi</small></div></div><div className="gender-breakdown">{["LELAKI", "PEREMPUAN", "TIDAK DINYATAKAN"].map((gender) => { const count = summary.genderCounts[gender] ?? 0; return <div key={gender}><div><span>{gender === "TIDAK DINYATAKAN" ? "Tiada data" : gender.toLowerCase()}</span><strong>{count}</strong></div><div className="mini-track"><i style={{ width: `${(count / Math.max(1, summary.occupiedSeats)) * 100}%` }}/></div></div>; })}</div></article>
      </section>
      <section className="split-section">
        <article className="panel state-panel"><div className="section-heading"><div><span className="eyebrow">SEMUA NEGERI</span><h2>Landskap mengikut negeri</h2></div><span className="route-count">{states.length} negeri</span></div><TableShell label="Keputusan Parlimen mengikut negeri" className="state-table-wrap"><table className="state-table"><thead><tr><th>NEGERI</th><th>KERUSI</th><th>PENDAHULU</th><th>KELUAR MENGUNDI</th><th>AGIHAN</th></tr></thead><tbody>{states.map((state) => <tr key={state.state}><td><Link className="state-link" to={`${paths.states}/${toSlug(state.state)}`}><strong>{state.state}</strong><Icon name="arrow" size={14}/></Link></td><td>{state.seats}</td><td><AlliancePill name={state.leader} data={data}/><small>{state.leaderSeats} kerusi</small></td><td><strong>{formatPct(state.turnoutPct)}</strong><small>{formatCompact(state.turnout)} kertas</small></td><td><div className="tiny-composition">{Object.entries(state.seatCounts).sort((a,b) => b[1]-a[1]).map(([name,count]) => <i key={name} style={{ flex: count, background: allianceColor(name, data.alliances) }}/>)}</div></td></tr>)}</tbody></table></TableShell></article>
        <article className="panel close-races-panel"><div className="section-heading"><div><span className="eyebrow">KERUSI TUMPUAN</span><h2>Saingan paling sengit</h2></div><span className="pulse-dot"/></div><div className="race-list">{closest.map((seat, index) => <Link key={seat.code} to={`${paths.parliament}/${toSlug(seat.name)}`}><span className="race-rank">0{index + 1}</span><div><strong>{seat.name}</strong><span>{seat.state} · {seat.code}</span></div><div className="race-margin"><strong>{formatNumber(seat.marginVotes)}</strong><span>majoriti</span></div><Icon name="arrow" size={17}/></Link>)}</div></article>
      </section>
    </>
  );
}

export function ElectionPage({ data }: { data: ElectionData }) {
  const { edition, paths } = useElection();
  const summary = useMemo(() => summarizeElectionSeats(data.seats), [data]);
  const states = useMemo(() => buildStateSummaries(data.seats), [data]);
  const leading = Object.entries(summary.seatCounts).sort((a, b) => b[1] - a[1])[0];
  return (
    <>
      <PageTitle title={data.metadata.shortTitle}/>
      <section className="route-hero election-detail-hero"><div className="breadcrumbs"><strong>{data.metadata.shortTitle}</strong></div><span className="overline">PILIHAN RAYA UMUM MALAYSIA</span><h1>{data.metadata.shortTitle}</h1><p>Pilihan Raya Umum ke-{data.metadata.electionNumber} · {formatElectionDate(data.metadata.electionDate)}</p><div className="route-stat-row"><div><span>KERUSI PARLIMEN</span><strong>{data.metadata.seatCount}</strong></div><div><span>PEMILIH BERDAFTAR</span><strong>{formatCompact(summary.registered)}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatPct(summary.turnoutPct)}</strong></div><div><span>CALON</span><strong>{data.metadata.candidateCount}</strong></div></div></section>
      <section className="election-overview-grid"><SeatComposition seats={data.seats} data={data} title={edition.isCurrentTerm ? "Komposisi Parlimen semasa" : `Keputusan ${edition.shortTitle}`} threshold={Math.floor(data.metadata.seatCount / 2) + 1}/><article className="panel election-context"><span className="eyebrow">RINGKASAN {data.metadata.shortTitle}</span><h2><AllianceLogo name={leading[0]} data={data} size="lg"/></h2><p>gabungan dengan kerusi terbanyak</p><div><span>Jumlah kerusi</span><strong>{leading[1]}</strong></div><div><span>Undi sah</span><strong>{formatCompact(summary.validVotes)}</strong></div><div><span>Purata calon / kerusi</span><strong>{(data.metadata.candidateCount / data.metadata.seatCount).toFixed(1)}</strong></div><Link to={paths.states}>Buka dashboard nasional <Icon name="arrow" size={16}/></Link></article></section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">PENEROKAAN {data.metadata.shortTitle}</span><h2>Terokai mengikut negeri</h2><p>Pilih negeri atau wilayah untuk melihat komposisi dan semua keputusan Parlimennya.</p></div><div className="result-count"><strong>{states.length}</strong><span>NEGERI / WILAYAH</span></div></div><div className="election-state-grid">{states.map((state) => <Link key={state.state} to={`${paths.states}/${toSlug(state.state)}`}><div><span>{state.seats} KERUSI</span><strong>{state.state}</strong><small className="election-state-meta"><AllianceLogo name={state.leader} data={data}/><span>mendahului · {formatPct(state.turnoutPct)} keluar mengundi</span></small></div><Icon name="arrow" size={17}/></Link>)}</div><div className="election-directory-link"><div><Icon name="seat" size={23}/><div><strong>Semua {data.metadata.seatCount} kerusi Parlimen</strong><span>Cari calon, parti dan keputusan penuh setiap kawasan.</span></div></div><div className="election-directory-actions">{data.metadata.electionNumber === 14 && <Link to="/pru/14/audit">Audit sumber <Icon name="database" size={16}/></Link>}<Link to={paths.winners}>Lihat pemenang <Icon name="people" size={16}/></Link><Link to={paths.parliament}>Buka direktori <Icon name="arrow" size={16}/></Link></div></div></section>
    </>
  );
}

function WinnerDirectoryCard({ seat, data }: { seat: Seat; data: ElectionData }) {
  const { edition, paths } = useElection();
  const winner = seat.winner;
  const activeParty = currentParty(seat);
  const activeAlliance = currentAlliance(seat);
  const changed = seat.current?.affiliation?.isChanged || currentStatus(seat) !== "active";
  return (
    <Link className="winner-directory-card" to={`${paths.parliament}/${toSlug(seat.name)}`}>
      <div className="winner-directory-top"><span>{seat.code} · {seat.name}</span><span>{seat.state}</span></div>
      <div className="winner-directory-heading"><div><h3>{winner.name}</h3></div>{edition.isCurrentTerm && changed && <b className="changed-badge">DIKEMAS KINI</b>}</div>
      <div className="affiliation-comparison"><div><span>{data.metadata.shortTitle}</span><strong><PartyLogo name={winner.party}/><AllianceLogo name={winner.alliance} data={data}/></strong></div>{edition.isCurrentTerm && <div className={changed ? "is-current" : ""}><span>SEMASA</span><strong>{currentStatus(seat) === "vacant" ? "KERUSI KOSONG" : <><PartyLogo name={activeParty}/><AllianceLogo name={activeAlliance} data={data}/></>}</strong></div>}</div>
      <div className="winner-directory-stats"><div><span>UNDI</span><strong>{formatNumber(winner.votes)}</strong></div><div><span>BAHAGIAN UNDI</span><strong>{formatPct(winner.share, 2)}</strong></div><div><span>MAJORITI</span><strong>{formatNumber(seat.marginVotes)}</strong></div></div>
      <div className="winner-directory-meta"><span>Jantina <strong>{winner.gender}</strong></span><span>Bangsa <strong>{winner.ethnicity}</strong></span></div>
      <div className="winner-directory-link">Lihat keputusan penuh <Icon name="arrow" size={17}/></div>
    </Link>
  );
}

export function WinnersPage({ data }: { data: ElectionData }) {
  const { paths } = useElection();
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("SEMUA NEGERI");
  const [allianceFilter, setAllianceFilter] = useState("SEMUA GABUNGAN");
  const [genderFilter, setGenderFilter] = useState("SEMUA JANTINA");
  const [ethnicityFilter, setEthnicityFilter] = useState("SEMUA BANGSA");
  const [limit, setLimit] = useState(24);
  const states = useMemo(() => [...new Set(data.seats.map((seat) => seat.state))].sort(), [data]);
  const alliances = useMemo(() => [...new Set(data.seats.map((seat) => seat.winner.alliance))].sort(), [data]);
  const genders = useMemo(() => [...new Set(data.seats.map((seat) => seat.winner.gender))].sort(), [data]);
  const ethnicities = useMemo(() => [...new Set(data.seats.map((seat) => seat.winner.ethnicity))].sort(), [data]);
  const femaleWinners = data.seats.filter((seat) => seat.winner.gender === "PEREMPUAN").length;
  const allianceCounts = data.seats.reduce<Record<string, number>>((counts, seat) => ({ ...counts, [seat.winner.alliance]: (counts[seat.winner.alliance] ?? 0) + 1 }), {});
  const leadingAlliance = Object.entries(allianceCounts).sort((a, b) => b[1] - a[1])[0];
  const filtered = useMemo(() => {
    const normalisedQuery = normalise(query.trim());
    return data.seats.filter((seat) => {
      const winner = seat.winner;
      return (stateFilter === "SEMUA NEGERI" || seat.state === stateFilter)
        && (allianceFilter === "SEMUA GABUNGAN" || winner.alliance === allianceFilter)
        && (genderFilter === "SEMUA JANTINA" || winner.gender === genderFilter)
        && (ethnicityFilter === "SEMUA BANGSA" || winner.ethnicity === ethnicityFilter)
        && (!normalisedQuery || [winner.name, winner.party, winner.alliance, seat.code, seat.name, seat.state].some((value) => normalise(value).includes(normalisedQuery)));
    });
  }, [allianceFilter, data, ethnicityFilter, genderFilter, query, stateFilter]);
  useEffect(() => setLimit(24), [allianceFilter, ethnicityFilter, genderFilter, query, stateFilter]);
  const hasFilters = query || stateFilter !== "SEMUA NEGERI" || allianceFilter !== "SEMUA GABUNGAN" || genderFilter !== "SEMUA JANTINA" || ethnicityFilter !== "SEMUA BANGSA";
  const resetFilters = () => { setQuery(""); setStateFilter("SEMUA NEGERI"); setAllianceFilter("SEMUA GABUNGAN"); setGenderFilter("SEMUA JANTINA"); setEthnicityFilter("SEMUA BANGSA"); };
  return (
    <>
      <PageTitle title={`Pemenang ${data.metadata.shortTitle}`}/>
      <section className="route-hero winners-hero"><div className="breadcrumbs"><Link to={paths.election}>{data.metadata.shortTitle}</Link><span>/</span><strong>Pemenang</strong></div><span className="overline">WAKIL RAKYAT DIPILIH</span><h1>{data.seats.length} pemenang.<br/><em>Satu mandat.</em></h1><p>Kenali pemenang setiap kerusi Parlimen dalam Pilihan Raya Umum ke-{data.metadata.electionNumber}.</p><div className="route-stat-row"><div><span>JUMLAH PEMENANG</span><strong>{data.seats.length}</strong></div><div><span>PEMENANG WANITA</span><strong>{femaleWinners}</strong></div><div><span>GABUNGAN TERBESAR</span><strong><AllianceLogo name={leadingAlliance[0]} data={data}/></strong></div><div><span>KERUSI GABUNGAN</span><strong>{leadingAlliance[1]}</strong></div></div></section>
      <section className="explorer-section directory-explorer"><div className="explorer-heading"><div><span className="eyebrow">DIREKTORI PEMENANG</span><h2>Telusuri wakil rakyat {data.metadata.shortTitle}</h2><p>Cari mengikut nama, kawasan, parti atau tapis profil pemenang.</p></div><div className="result-count"><strong>{filtered.length}</strong><span>PEMENANG DITEMUI</span></div></div>
        <div className="filter-bar winner-filter-bar"><label><span>NEGERI</span><div className="select-wrap"><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>SEMUA NEGERI</option>{states.map((state) => <option key={state}>{state}</option>)}</select><Icon name="chevron" size={16}/></div></label><SearchCombobox className="filter-combobox" label="GABUNGAN" value={allianceFilter} options={["SEMUA GABUNGAN", ...alliances]} onChange={setAllianceFilter} allowCustom={false}/><SearchCombobox className="filter-combobox" label="JANTINA" value={genderFilter} options={["SEMUA JANTINA", ...genders]} onChange={setGenderFilter} allowCustom={false}/><SearchCombobox className="filter-combobox" label="BANGSA" value={ethnicityFilter} options={["SEMUA BANGSA", ...ethnicities]} onChange={setEthnicityFilter} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau kawasan"/></div></label>{hasFilters && <button className="reset-button" onClick={resetFilters}>Set semula</button>}</div>
        {filtered.length ? <><div className="winner-directory-grid">{filtered.slice(0, limit).map((seat) => <WinnerDirectoryCard key={seat.code} seat={seat} data={data}/>)}</div>{limit < filtered.length && <button className="load-more" onClick={() => setLimit((value) => value + 24)}>Muatkan lagi <span>{Math.min(24, filtered.length - limit)}</span></button>}</> : <div className="empty-state"><Icon name="search" size={30}/><h3>Tiada pemenang ditemui</h3><p>Cuba ubah tapisan atau istilah carian anda.</p></div>}
      </section>
    </>
  );
}

export function StatePage({ data }: { data: ElectionData }) {
  const { paths } = useElection();
  const { stateName = "" } = useParams();
  const state = [...new Set(data.seats.map((seat) => seat.state))].find((name) => toSlug(name) === stateName);
  if (!state) return <NotFound label="Negeri"/>;
  const seats = data.seats.filter((seat) => seat.state === state);
  const summary = summarizeElectionSeats(seats);
  const leading = Object.entries(summary.seatCounts).sort((a,b) => b[1] - a[1])[0];
  return (
    <>
      <PageTitle title={state}/>
      <section className="route-hero state-route-hero"><div className="breadcrumbs"><Link to={paths.states}>Semua negeri</Link><span>/</span><strong>{state}</strong></div><span className="overline">KEPUTUSAN MENGIKUT NEGERI</span><h1>{state}</h1><p>{seats.length} kerusi Parlimen · {formatNumber(summary.validVotes)} undi sah</p><div className="route-stat-row"><div><span>KERUSI</span><strong>{seats.length}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatPct(summary.turnoutPct)}</strong></div><div><span>PENDAHULU</span><strong><AllianceLogo name={leading[0]} data={data}/></strong></div><div><span>KERUSI PENDAHULU</span><strong>{leading[1]}</strong></div></div></section>
      <section className="state-detail-grid"><SeatComposition seats={seats} data={data} title={`Agihan kerusi ${state}`}/><article className="panel state-context"><span className="eyebrow">RINGKASAN NEGERI</span><h2>{formatCompact(summary.registered)}</h2><p>pemilih berdaftar</p><div><span>Kertas undi dikeluarkan</span><strong>{formatNumber(summary.turnout)}</strong></div><div><span>Purata calon / kerusi</span><strong>{(seats.reduce((n,s)=>n+s.candidateCount,0)/seats.length).toFixed(1)}</strong></div>{!state.startsWith("W.P") && <Link to={`${PRN_BASE}/${toSlug(state)}`}>Buka keputusan PRN <Icon name="vote" size={16}/></Link>}<Link to={paths.parliament}>Terokai semua Parlimen <Icon name="arrow" size={16}/></Link></article></section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">PARLIMEN DI {state}</span><h2>{seats.length} kerusi untuk diterokai</h2></div><div className="result-count"><strong>{seats.length}</strong><span>KERUSI</span></div></div><div className="seat-grid route-seat-grid">{seats.map((seat) => <SeatCard key={seat.code} seat={seat} data={data} nested/>)}</div></section>
    </>
  );
}

export function ParliamentPage({ data, scoresheetIndex, geography, constituencies, pollingPlaces }: { data: ElectionData; scoresheetIndex: ScoresheetIndex; geography: GeographyData; constituencies: ConstituencyRegistry; pollingPlaces: PollingPlacesData }) {
  const { edition, paths } = useElection();
  const { parliamentName = "", stateName } = useParams();
  const seat = data.seats.find((item) => toSlug(item.name) === parliamentName && (!stateName || toSlug(item.state) === stateName));
  if (!seat) return <NotFound label="Parlimen"/>;
  const index = data.seats.findIndex((item) => item.code === seat.code);
  const previous = data.seats[index - 1];
  const next = data.seats[index + 1];
  const activeAlliance = currentAlliance(seat);
  const activeParty = currentParty(seat);
  const status = currentStatus(seat);
  const currentRecord = status !== "active" && seat.current?.changeId ? seat.current : seat.current?.affiliation;
  return (
    <>
      <PageTitle title={`${seat.code} ${seat.name}`}/>
      <section className="route-hero parliament-hero"><div className="breadcrumbs"><Link to={paths.states}>Negeri</Link><span>/</span><Link to={`${paths.states}/${toSlug(seat.state)}`}>{seat.state}</Link><span>/</span><strong>{seat.code}</strong></div><div className="parliament-hero-line"><div><span className="overline">KEPUTUSAN PARLIMEN</span><h1>{seat.name}</h1><p>{seat.code} · {seat.state}</p></div><AlliancePill name={activeAlliance} data={data}/></div></section>
      <section className="parliament-detail-grid">
        <article className="panel candidate-detail"><div className="section-heading"><div><span className="eyebrow">KEPUTUSAN PENUH</span><h2>Semua calon</h2></div><span className="route-count">{formatNumber(seat.validVotes ?? seat.candidates.reduce((sum, candidate) => sum + candidate.votes, 0))} undi sah</span></div><div className="candidate-list">{seat.candidates.map((candidate, candidateIndex) => <div className={`candidate-row ${candidateIndex === 0 ? "is-winner" : ""}`} key={`${candidateIndex}-${candidate.name}`}><div className="candidate-rank">{String(candidateIndex + 1).padStart(2,"0")}</div><div className="candidate-copy"><div className="candidate-name-line"><strong>{candidate.name}</strong><span>{formatNumber(candidate.votes)}</span></div><div className="candidate-meta"><span className="candidate-identities"><AllianceLogo name={candidate.alliance} data={data}/><PartyLogo name={candidate.party}/></span><span>{formatPct(candidate.share, 2)}</span></div><div className="result-track"><span style={{ width: `${candidate.share * 100}%`, background: allianceColor(candidate.alliance, data.alliances) }}/></div></div></div>)}</div></article>
        <aside className="detail-sidebar">{edition.isCurrentTerm && <section className={`current-status-card status-${status}`}><div><span>KEDUDUKAN SEMASA</span><strong>{status === "vacant" ? "Kerusi kosong" : <span className="identity-pair"><PartyLogo name={activeParty} size="md"/><AllianceLogo name={activeAlliance} data={data} size="md"/></span>}</strong></div>{currentRecord ? <><small>Berkuat kuasa {formatShortDate(currentRecord.effectiveDate)}</small><p>{currentRecord.reason}</p>{currentRecord.sourceUrl && <a href={currentRecord.sourceUrl} target="_blank" rel="noreferrer">Lihat sumber ↗</a>}</> : <p>Tiada perubahan keahlian direkodkan sejak {data.metadata.shortTitle}.</p>}</section>}<section className="winner-card" style={{ "--winner": allianceColor(seat.winner.alliance, data.alliances) } as React.CSSProperties}><div className="winner-label"><span>KEPUTUSAN {data.metadata.shortTitle}</span><AlliancePill name={seat.winner.alliance} data={data}/></div><h3>{seat.winner.name}</h3><div className="historical-party"><span>PARTI KETIKA {data.metadata.shortTitle}</span><PartyLogo name={seat.winner.party} size="md"/></div><div className="winner-stats"><div><strong>{formatNumber(seat.winner.votes)}</strong><span>undi</span></div><div><strong>{formatPct(seat.winner.share, 2)}</strong><span>bahagian undi</span></div><div><strong>{formatNumber(seat.marginVotes)}</strong><span>majoriti</span></div></div></section><div className="detail-facts"><div><span>Pemilih berdaftar</span><strong>{formatNumber(seat.registered)}</strong></div><div><span>Kertas undi dikeluarkan</span><strong>{formatNumber(seat.turnout)}</strong></div><div><span>Keluar mengundi</span><strong>{formatPct(seat.turnoutPct)}</strong></div><div><span>Undi ditolak</span><strong>{formatNumber(seat.rejectedVotes ?? 0)}</strong></div><div><span>Tidak dikembalikan</span><strong>{formatNumber(seat.unreturnedVotes ?? 0)}</strong></div><div><span>Calon bertanding</span><strong>{seat.candidateCount}</strong></div><div><span>Jantina</span><strong>{seat.winner.gender}</strong></div><div><span>Bangsa</span><strong>{seat.winner.ethnicity}</strong></div></div></aside>
      </section>
      {edition.capabilities.geography && <ParliamentGeography seat={seat} geography={geography} constituencies={constituencies}/>}
      {edition.capabilities.scoresheets && <Suspense fallback={<section className="scoresheet-loading"><span/><p>Memuatkan modul helaian mata…</p></section>}><ScoresheetDetail seat={seat} data={data} indexEntry={scoresheetIndex.seats.find((item) => item.parliamentCode === seat.code)} unavailableReason={scoresheetIndex.unavailableSeats?.find((item) => item.parliamentCode === seat.code)?.reason} pollingPlaces={pollingPlaces}/></Suspense>}
      <nav className="adjacent-seats" aria-label="Kerusi bersebelahan">{previous ? <Link to={`${paths.parliament}/${toSlug(previous.name)}`}><span>← SEBELUMNYA</span><strong>{previous.code} {previous.name}</strong></Link> : <i/>}{next && <Link to={`${paths.parliament}/${toSlug(next.name)}`}><span>SETERUSNYA →</span><strong>{next.code} {next.name}</strong></Link>}</nav>
    </>
  );
}
