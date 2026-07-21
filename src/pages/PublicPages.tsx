import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AllianceLogo, AlliancePill, PartyLogo } from "../components/identity";
import { ParliamentSeatingPlan } from "../components/seating/ParliamentSeatingPlan";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { ParliamentGeography } from "./GeographyPages";
import { currentAlliance, currentParty, currentStatus } from "../dataChanges";
import { ELECTION_BASE, PARLIAMENT_BASE, PRN_BASE, STATE_BASE, WINNERS_BASE, stateParliamentPath } from "../routes";
import type { ConstituencyRegistry, ElectionData, GeographyData, PollingPlacesData, ScoresheetIndex, Seat, SeatingData } from "../types";
import { allianceColor, buildStateSummaries, formatCompact, formatNumber, formatPct, normalise, shortAlliance, toSlug } from "../utils";

const ScoresheetDetail = lazy(() => import("../components/scoresheet/ScoresheetDetail").then((module) => ({ default: module.ScoresheetDetail })));

function getSummary(seats: Seat[]) {
  const seatCounts: Record<string, number> = {};
  const genderCounts: Record<string, number> = {};
  let occupiedSeats = 0;
  seats.forEach((seat) => {
    const alliance = currentAlliance(seat);
    seatCounts[alliance] = (seatCounts[alliance] ?? 0) + 1;
    if (currentStatus(seat) !== "vacant") {
      occupiedSeats += 1;
      genderCounts[seat.winner.gender] = (genderCounts[seat.winner.gender] ?? 0) + 1;
    }
  });
  const registered = seats.reduce((sum, seat) => sum + seat.registered, 0);
  const turnout = seats.reduce((sum, seat) => sum + seat.turnout, 0);
  return { seatCounts, genderCounts, occupiedSeats, registered, turnout, turnoutPct: registered ? turnout / registered : 0 };
}

function SeatComposition({ seats, data, title, threshold }: { seats: Seat[]; data: ElectionData; title: string; threshold?: number }) {
  const summary = getSummary(seats);
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
  const summary = useMemo(() => getSummary(data.seats), [data]);
  const states = useMemo(() => buildStateSummaries(data.seats), [data]);
  const closest = useMemo(() => [...data.seats].filter((seat) => seat.candidateCount > 1).sort((a, b) => a.marginVotes - b.marginVotes).slice(0, 5), [data]);
  return (
    <>
      <PageTitle title="Negeri"/>
      <section className="hero-section">
        <div className="hero-copy"><span className="overline">PILIHAN RAYA UMUM MALAYSIA</span><h1>PRU-15<br/><em>dalam angka.</em></h1><p>Gambaran menyeluruh keputusan Parlimen Malaysia—daripada komposisi kerusi hingga persaingan di setiap negeri.</p><div className="hero-meta"><span>19 November 2022</span><i/><span>15 negeri / wilayah</span></div></div>
        <div className="hero-visual" aria-label={`${formatPct(summary.turnoutPct)} keluar mengundi`}><svg viewBox="0 0 220 220"><circle className="gauge-bg" cx="110" cy="110" r="88"/><circle className="gauge-value" cx="110" cy="110" r="88" pathLength="100" strokeDasharray={`${summary.turnoutPct * 100} 100`}/></svg><div><strong>{formatPct(summary.turnoutPct)}</strong><span>KELUAR<br/>MENGUNDI</span></div></div>
      </section>
      <section className="kpi-grid">
        <article><div className="kpi-icon"><Icon name="seat"/></div><div><span>KERUSI DIPERTANDINGKAN</span><strong>{data.metadata.seatCount}</strong><small>seluruh Malaysia</small></div></article>
        <article><div className="kpi-icon"><Icon name="vote"/></div><div><span>UNDI DIREKODKAN</span><strong>{formatCompact(summary.turnout)}</strong><small>{formatNumber(summary.turnout)} undi</small></div></article>
        <article><div className="kpi-icon"><Icon name="people"/></div><div><span>PEMILIH BERDAFTAR</span><strong>{formatCompact(summary.registered)}</strong><small>di 15 negeri / wilayah</small></div></article>
        <article><div className="kpi-icon"><Icon name="chart"/></div><div><span>CALON BERTANDING</span><strong>{data.metadata.candidateCount}</strong><small>{(data.metadata.candidateCount / data.metadata.seatCount).toFixed(1)} calon purata / kerusi</small></div></article>
      </section>
      <section className="dashboard-grid">
        <SeatComposition seats={data.seats} data={data} title="Siapa menguasai kerusi?" threshold={112}/>
        <article className="panel people-panel"><div className="section-heading"><div><span className="eyebrow">WAJAH PARLIMEN</span><h2>Profil pemenang</h2></div><div className="outline-icon"><Icon name="people"/></div></div><div className="gender-chart"><div className="gender-figure"><span className="figure-head"/><span className="figure-body"/><span className="figure-leg left"/><span className="figure-leg right"/></div><div className="gender-copy"><strong>{summary.genderCounts["PEREMPUAN"] ?? 0}</strong><span>WAKIL RAKYAT<br/>PEREMPUAN</span><small>{formatPct((summary.genderCounts["PEREMPUAN"] ?? 0) / Math.max(1, summary.occupiedSeats))} daripada kerusi berisi</small></div></div><div className="gender-breakdown">{["LELAKI", "PEREMPUAN", "TIDAK DINYATAKAN"].map((gender) => { const count = summary.genderCounts[gender] ?? 0; return <div key={gender}><div><span>{gender === "TIDAK DINYATAKAN" ? "Tiada data" : gender.toLowerCase()}</span><strong>{count}</strong></div><div className="mini-track"><i style={{ width: `${(count / Math.max(1, summary.occupiedSeats)) * 100}%` }}/></div></div>; })}</div></article>
      </section>
      <section className="split-section">
        <article className="panel state-panel"><div className="section-heading"><div><span className="eyebrow">SEMUA NEGERI</span><h2>Landskap mengikut negeri</h2></div><span className="route-count">{states.length} negeri</span></div><div className="state-table-wrap"><table className="state-table"><thead><tr><th>NEGERI</th><th>KERUSI</th><th>PENDAHULU</th><th>KELUAR MENGUNDI</th><th>AGIHAN</th></tr></thead><tbody>{states.map((state) => <tr key={state.state}><td><Link className="state-link" to={`${STATE_BASE}/${toSlug(state.state)}`}><strong>{state.state}</strong><Icon name="arrow" size={14}/></Link></td><td>{state.seats}</td><td><AlliancePill name={state.leader} data={data}/><small>{state.leaderSeats} kerusi</small></td><td><strong>{formatPct(state.turnoutPct)}</strong><small>{formatCompact(state.turnout)} undi</small></td><td><div className="tiny-composition">{Object.entries(state.seatCounts).sort((a,b) => b[1]-a[1]).map(([name,count]) => <i key={name} style={{ flex: count, background: allianceColor(name, data.alliances) }}/>)}</div></td></tr>)}</tbody></table></div></article>
        <article className="panel close-races-panel"><div className="section-heading"><div><span className="eyebrow">KERUSI TUMPUAN</span><h2>Saingan paling sengit</h2></div><span className="pulse-dot"/></div><div className="race-list">{closest.map((seat, index) => <Link key={seat.code} to={`${PARLIAMENT_BASE}/${toSlug(seat.name)}`}><span className="race-rank">0{index + 1}</span><div><strong>{seat.name}</strong><span>{seat.state} · {seat.code}</span></div><div className="race-margin"><strong>{formatNumber(seat.marginVotes)}</strong><span>majoriti</span></div><Icon name="arrow" size={17}/></Link>)}</div></article>
      </section>
    </>
  );
}

export function ElectionPage({ data }: { data: ElectionData }) {
  const summary = useMemo(() => getSummary(data.seats), [data]);
  const states = useMemo(() => buildStateSummaries(data.seats), [data]);
  const leading = Object.entries(summary.seatCounts).sort((a, b) => b[1] - a[1])[0];
  return (
    <>
      <PageTitle title="PRU-15"/>
      <section className="route-hero election-detail-hero"><div className="breadcrumbs"><strong>PRU-15</strong></div><span className="overline">PILIHAN RAYA UMUM MALAYSIA</span><h1>PRU-15</h1><p>Pilihan Raya Umum ke-15 · 19 November 2022</p><div className="route-stat-row"><div><span>KERUSI PARLIMEN</span><strong>{data.metadata.seatCount}</strong></div><div><span>PEMILIH BERDAFTAR</span><strong>{formatCompact(summary.registered)}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatPct(summary.turnoutPct)}</strong></div><div><span>CALON</span><strong>{data.metadata.candidateCount}</strong></div></div></section>
      <section className="election-overview-grid"><SeatComposition seats={data.seats} data={data} title="Komposisi Parlimen semasa" threshold={112}/><article className="panel election-context"><span className="eyebrow">RINGKASAN PRU-15</span><h2><AllianceLogo name={leading[0]} data={data} size="lg"/></h2><p>gabungan dengan kerusi terbanyak</p><div><span>Jumlah kerusi</span><strong>{leading[1]}</strong></div><div><span>Undi direkodkan</span><strong>{formatCompact(summary.turnout)}</strong></div><div><span>Purata calon / kerusi</span><strong>{(data.metadata.candidateCount / data.metadata.seatCount).toFixed(1)}</strong></div><Link to={STATE_BASE}>Buka dashboard nasional <Icon name="arrow" size={16}/></Link></article></section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">PENEROKAAN PRU-15</span><h2>Terokai mengikut negeri</h2><p>Pilih negeri atau wilayah untuk melihat komposisi dan semua keputusan Parlimennya.</p></div><div className="result-count"><strong>{states.length}</strong><span>NEGERI / WILAYAH</span></div></div><div className="election-state-grid">{states.map((state) => <Link key={state.state} to={`${STATE_BASE}/${toSlug(state.state)}`}><div><span>{state.seats} KERUSI</span><strong>{state.state}</strong><small className="election-state-meta"><AllianceLogo name={state.leader} data={data}/><span>mendahului · {formatPct(state.turnoutPct)} turnout</span></small></div><Icon name="arrow" size={17}/></Link>)}</div><div className="election-directory-link"><div><Icon name="seat" size={23}/><div><strong>Semua {data.metadata.seatCount} kerusi Parlimen</strong><span>Cari calon, parti dan keputusan penuh setiap kawasan.</span></div></div><div className="election-directory-actions"><Link to={WINNERS_BASE}>Lihat pemenang <Icon name="people" size={16}/></Link><Link to={PARLIAMENT_BASE}>Buka direktori <Icon name="arrow" size={16}/></Link></div></div></section>
    </>
  );
}

function WinnerDirectoryCard({ seat, data }: { seat: Seat; data: ElectionData }) {
  const winner = seat.winner;
  const activeParty = currentParty(seat);
  const activeAlliance = currentAlliance(seat);
  const changed = seat.current?.affiliation?.isChanged || currentStatus(seat) !== "active";
  return (
    <Link className="winner-directory-card" to={`${PARLIAMENT_BASE}/${toSlug(seat.name)}`}>
      <div className="winner-directory-top"><span>{seat.code} · {seat.name}</span><span>{seat.state}</span></div>
      <div className="winner-directory-heading"><div><h3>{winner.name}</h3></div>{changed && <b className="changed-badge">DIKEMAS KINI</b>}</div>
      <div className="affiliation-comparison"><div><span>PRU-15</span><strong><PartyLogo name={winner.party}/><AllianceLogo name={winner.alliance} data={data}/></strong></div><div className={changed ? "is-current" : ""}><span>SEMASA</span><strong>{currentStatus(seat) === "vacant" ? "KERUSI KOSONG" : <><PartyLogo name={activeParty}/><AllianceLogo name={activeAlliance} data={data}/></>}</strong></div></div>
      <div className="winner-directory-stats"><div><span>UNDI</span><strong>{formatNumber(winner.votes)}</strong></div><div><span>BAHAGIAN UNDI</span><strong>{formatPct(winner.share, 2)}</strong></div><div><span>MAJORITI</span><strong>{formatNumber(seat.marginVotes)}</strong></div></div>
      <div className="winner-directory-meta"><span>Jantina <strong>{winner.gender}</strong></span><span>Bangsa <strong>{winner.ethnicity}</strong></span></div>
      <div className="winner-directory-link">Lihat keputusan penuh <Icon name="arrow" size={17}/></div>
    </Link>
  );
}

export function WinnersPage({ data }: { data: ElectionData }) {
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
      <PageTitle title="Pemenang PRU-15"/>
      <section className="route-hero winners-hero"><div className="breadcrumbs"><Link to={ELECTION_BASE}>PRU-15</Link><span>/</span><strong>Pemenang</strong></div><span className="overline">WAKIL RAKYAT DIPILIH</span><h1>222 pemenang.<br/><em>Satu mandat.</em></h1><p>Kenali pemenang setiap kerusi Parlimen dalam Pilihan Raya Umum ke-15.</p><div className="route-stat-row"><div><span>JUMLAH PEMENANG</span><strong>{data.seats.length}</strong></div><div><span>PEMENANG WANITA</span><strong>{femaleWinners}</strong></div><div><span>GABUNGAN TERBESAR</span><strong><AllianceLogo name={leadingAlliance[0]} data={data}/></strong></div><div><span>KERUSI GABUNGAN</span><strong>{leadingAlliance[1]}</strong></div></div></section>
      <section className="explorer-section directory-explorer"><div className="explorer-heading"><div><span className="eyebrow">DIREKTORI PEMENANG</span><h2>Telusuri wakil rakyat PRU-15</h2><p>Cari mengikut nama, kawasan, parti atau tapis profil pemenang.</p></div><div className="result-count"><strong>{filtered.length}</strong><span>PEMENANG DITEMUI</span></div></div>
        <div className="filter-bar winner-filter-bar"><label><span>NEGERI</span><div className="select-wrap"><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>SEMUA NEGERI</option>{states.map((state) => <option key={state}>{state}</option>)}</select><Icon name="chevron" size={16}/></div></label><SearchCombobox className="filter-combobox" label="GABUNGAN" value={allianceFilter} options={["SEMUA GABUNGAN", ...alliances]} onChange={setAllianceFilter} allowCustom={false}/><SearchCombobox className="filter-combobox" label="JANTINA" value={genderFilter} options={["SEMUA JANTINA", ...genders]} onChange={setGenderFilter} allowCustom={false}/><SearchCombobox className="filter-combobox" label="BANGSA" value={ethnicityFilter} options={["SEMUA BANGSA", ...ethnicities]} onChange={setEthnicityFilter} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nama atau kawasan"/></div></label>{hasFilters && <button className="reset-button" onClick={resetFilters}>Set semula</button>}</div>
        {filtered.length ? <><div className="winner-directory-grid">{filtered.slice(0, limit).map((seat) => <WinnerDirectoryCard key={seat.code} seat={seat} data={data}/>)}</div>{limit < filtered.length && <button className="load-more" onClick={() => setLimit((value) => value + 24)}>Muatkan lagi <span>{Math.min(24, filtered.length - limit)}</span></button>}</> : <div className="empty-state"><Icon name="search" size={30}/><h3>Tiada pemenang ditemui</h3><p>Cuba ubah tapisan atau istilah carian anda.</p></div>}
      </section>
    </>
  );
}

function SeatCard({ seat, data, nested = false }: { seat: Seat; data: ElectionData; nested?: boolean }) {
  const alliance = currentAlliance(seat);
  const party = currentParty(seat);
  const changed = seat.current?.isChanged;
  return (
    <Link className="seat-card" to={nested ? stateParliamentPath(toSlug(seat.state), toSlug(seat.name)) : `${PARLIAMENT_BASE}/${toSlug(seat.name)}`}>
      <div className="seat-card-top"><span>{seat.state}</span><span>{seat.code}</span></div><h3>{seat.name}</h3>
      <div className="winner-line"><span className="party-dot" style={{ background: allianceColor(alliance, data.alliances) }}/><div><span>WAKIL RAKYAT</span><strong>{seat.winner.name}</strong></div>{changed && <b className="changed-badge">DIKEMAS KINI</b>}</div>
      <div className="seat-card-stats"><div><span>KEDUDUKAN SEMASA</span><strong className="identity-pair">{currentStatus(seat) === "vacant" ? "KOSONG" : <><PartyLogo name={party}/><AllianceLogo name={alliance} data={data}/></>}</strong></div><div><span>MAJORITI PRU-15</span><strong>{formatNumber(seat.marginVotes)}</strong></div><div><span>TURNOUT</span><strong>{formatPct(seat.turnoutPct)}</strong></div></div>
      <div className="open-seat">Lihat keputusan <Icon name="arrow" size={16}/></div>
    </Link>
  );
}

export function StatePage({ data }: { data: ElectionData }) {
  const { stateName = "" } = useParams();
  const state = [...new Set(data.seats.map((seat) => seat.state))].find((name) => toSlug(name) === stateName);
  if (!state) return <NotFound label="Negeri"/>;
  const seats = data.seats.filter((seat) => seat.state === state);
  const summary = getSummary(seats);
  const leading = Object.entries(summary.seatCounts).sort((a,b) => b[1] - a[1])[0];
  return (
    <>
      <PageTitle title={state}/>
      <section className="route-hero state-route-hero"><div className="breadcrumbs"><Link to={STATE_BASE}>Semua negeri</Link><span>/</span><strong>{state}</strong></div><span className="overline">KEPUTUSAN MENGIKUT NEGERI</span><h1>{state}</h1><p>{seats.length} kerusi Parlimen · {formatNumber(summary.turnout)} undi direkodkan</p><div className="route-stat-row"><div><span>KERUSI</span><strong>{seats.length}</strong></div><div><span>KELUAR MENGUNDI</span><strong>{formatPct(summary.turnoutPct)}</strong></div><div><span>PENDAHULU</span><strong><AllianceLogo name={leading[0]} data={data}/></strong></div><div><span>KERUSI PENDAHULU</span><strong>{leading[1]}</strong></div></div></section>
      <section className="state-detail-grid"><SeatComposition seats={seats} data={data} title={`Agihan kerusi ${state}`}/><article className="panel state-context"><span className="eyebrow">RINGKASAN NEGERI</span><h2>{formatCompact(summary.registered)}</h2><p>pemilih berdaftar</p><div><span>Jumlah keluar mengundi</span><strong>{formatNumber(summary.turnout)}</strong></div><div><span>Purata calon / kerusi</span><strong>{(seats.reduce((n,s)=>n+s.candidateCount,0)/seats.length).toFixed(1)}</strong></div>{!state.startsWith("W.P") && <Link to={`${PRN_BASE}/${toSlug(state)}`}>Buka keputusan PRN <Icon name="vote" size={16}/></Link>}<Link to={PARLIAMENT_BASE}>Terokai semua Parlimen <Icon name="arrow" size={16}/></Link></article></section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">PARLIMEN DI {state}</span><h2>{seats.length} kerusi untuk diterokai</h2></div><div className="result-count"><strong>{seats.length}</strong><span>KERUSI</span></div></div><div className="seat-grid route-seat-grid">{seats.map((seat) => <SeatCard key={seat.code} seat={seat} data={data} nested/>)}</div></section>
    </>
  );
}

export function ParliamentIndexPage({ data, seating, search, setSearch }: { data: ElectionData; seating: SeatingData; search: string; setSearch: (value: string) => void }) {
  const [stateFilter, setStateFilter] = useState("SEMUA NEGERI");
  const [allianceFilter, setAllianceFilter] = useState("SEMUA GABUNGAN");
  const [limit, setLimit] = useState(18);
  const states = [...new Set(data.seats.map((seat) => seat.state))].sort();
  const alliances = [...new Set(data.seats.map(currentAlliance))].sort();
  const filtered = useMemo(() => {
    const query = normalise(search.trim());
    return data.seats.filter((seat) => (stateFilter === "SEMUA NEGERI" || seat.state === stateFilter) && (allianceFilter === "SEMUA GABUNGAN" || currentAlliance(seat) === allianceFilter) && (!query || [seat.code, seat.name, seat.state, seat.winner.name, seat.winner.party, currentParty(seat)].some((value) => normalise(value).includes(query))));
  }, [data, search, stateFilter, allianceFilter]);
  useEffect(() => setLimit(18), [search, stateFilter, allianceFilter]);
  return (
    <>
      <PageTitle title="Parlimen"/>
      <section className="route-hero directory-hero"><div className="breadcrumbs"><Link to={STATE_BASE}>Negeri</Link><span>/</span><strong>Parlimen</strong></div><span className="overline">DIREKTORI PARLIMEN</span><h1>222 kerusi.<br/><em>Satu pandangan.</em></h1><p>Cari keputusan, pemenang dan pecahan undi untuk setiap kawasan Parlimen.</p></section>
      <ParliamentSeatingPlan data={data} seating={seating} search={search} stateFilter={stateFilter} allianceFilter={allianceFilter}/>
      <section className="explorer-section directory-explorer"><div className="explorer-heading"><div><span className="eyebrow">PENEROKAAN DATA</span><h2>Telusuri setiap kerusi</h2></div><div className="result-count"><strong>{filtered.length}</strong><span>KERUSI DITEMUI</span></div></div>
        <div className="filter-bar"><label><span>NEGERI</span><div className="select-wrap"><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>SEMUA NEGERI</option>{states.map((state) => <option key={state}>{state}</option>)}</select><Icon name="chevron" size={16}/></div></label><SearchCombobox className="filter-combobox" label="GABUNGAN" value={allianceFilter} options={["SEMUA GABUNGAN", ...alliances]} onChange={setAllianceFilter} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama kerusi atau calon"/></div></label>{(stateFilter !== "SEMUA NEGERI" || allianceFilter !== "SEMUA GABUNGAN" || search) && <button className="reset-button" onClick={() => { setStateFilter("SEMUA NEGERI"); setAllianceFilter("SEMUA GABUNGAN"); setSearch(""); }}>Set semula</button>}</div>
        {filtered.length ? <><div className="seat-grid">{filtered.slice(0, limit).map((seat) => <SeatCard key={seat.code} seat={seat} data={data}/>)}</div>{limit < filtered.length && <button className="load-more" onClick={() => setLimit((value) => value + 18)}>Muatkan lagi <span>{Math.min(18, filtered.length - limit)}</span></button>}</> : <div className="empty-state"><Icon name="search" size={30}/><h3>Tiada kerusi ditemui</h3><p>Cuba ubah tapisan atau istilah carian anda.</p></div>}
      </section>
    </>
  );
}

export function ParliamentPage({ data, scoresheetIndex, geography, constituencies, pollingPlaces }: { data: ElectionData; scoresheetIndex: ScoresheetIndex; geography: GeographyData; constituencies: ConstituencyRegistry; pollingPlaces: PollingPlacesData }) {
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
      <section className="route-hero parliament-hero"><div className="breadcrumbs"><Link to={STATE_BASE}>Negeri</Link><span>/</span><Link to={`${STATE_BASE}/${toSlug(seat.state)}`}>{seat.state}</Link><span>/</span><strong>{seat.code}</strong></div><div className="parliament-hero-line"><div><span className="overline">KEPUTUSAN PARLIMEN</span><h1>{seat.name}</h1><p>{seat.code} · {seat.state}</p></div><AlliancePill name={activeAlliance} data={data}/></div></section>
      <section className="parliament-detail-grid">
        <article className="panel candidate-detail"><div className="section-heading"><div><span className="eyebrow">KEPUTUSAN PENUH</span><h2>Semua calon</h2></div><span className="route-count">{formatNumber(seat.turnout)} undi</span></div><div className="candidate-list">{seat.candidates.map((candidate, candidateIndex) => <div className={`candidate-row ${candidateIndex === 0 ? "is-winner" : ""}`} key={`${candidateIndex}-${candidate.name}`}><div className="candidate-rank">{String(candidateIndex + 1).padStart(2,"0")}</div><div className="candidate-copy"><div className="candidate-name-line"><strong>{candidate.name}</strong><span>{formatNumber(candidate.votes)}</span></div><div className="candidate-meta"><span className="candidate-identities"><AllianceLogo name={candidate.alliance} data={data}/><PartyLogo name={candidate.party}/></span><span>{formatPct(candidate.share, 2)}</span></div><div className="result-track"><span style={{ width: `${candidate.share * 100}%`, background: allianceColor(candidate.alliance, data.alliances) }}/></div></div></div>)}</div></article>
        <aside className="detail-sidebar"><section className={`current-status-card status-${status}`}><div><span>KEDUDUKAN SEMASA</span><strong>{status === "vacant" ? "Kerusi kosong" : <span className="identity-pair"><PartyLogo name={activeParty} size="md"/><AllianceLogo name={activeAlliance} data={data} size="md"/></span>}</strong></div>{currentRecord ? <><small>Berkuat kuasa {currentRecord.effectiveDate}</small><p>{currentRecord.reason}</p>{currentRecord.sourceUrl && <a href={currentRecord.sourceUrl} target="_blank" rel="noreferrer">Lihat sumber ↗</a>}</> : <p>Tiada perubahan keahlian direkodkan sejak PRU-15.</p>}</section><section className="winner-card" style={{ "--winner": allianceColor(seat.winner.alliance, data.alliances) } as React.CSSProperties}><div className="winner-label"><span>KEPUTUSAN PRU-15</span><AlliancePill name={seat.winner.alliance} data={data}/></div><h3>{seat.winner.name}</h3><div className="historical-party"><span>PARTI SEMASA PRU-15</span><PartyLogo name={seat.winner.party} size="md"/></div><div className="winner-stats"><div><strong>{formatNumber(seat.winner.votes)}</strong><span>undi</span></div><div><strong>{formatPct(seat.winner.share, 2)}</strong><span>bahagian undi</span></div><div><strong>{formatNumber(seat.marginVotes)}</strong><span>majoriti</span></div></div></section><div className="detail-facts"><div><span>Pemilih berdaftar</span><strong>{formatNumber(seat.registered)}</strong></div><div><span>Keluar mengundi</span><strong>{formatPct(seat.turnoutPct)}</strong></div><div><span>Calon bertanding</span><strong>{seat.candidateCount}</strong></div><div><span>Jantina</span><strong>{seat.winner.gender}</strong></div><div><span>Bangsa</span><strong>{seat.winner.ethnicity}</strong></div></div></aside>
      </section>
      <ParliamentGeography seat={seat} geography={geography} constituencies={constituencies}/>
      <Suspense fallback={<section className="scoresheet-loading"><span/><p>Memuatkan modul helaian mata…</p></section>}><ScoresheetDetail seat={seat} data={data} indexEntry={scoresheetIndex.seats.find((item) => item.parliamentCode === seat.code)} pollingPlaces={pollingPlaces}/></Suspense>
      <nav className="adjacent-seats" aria-label="Kerusi bersebelahan">{previous ? <Link to={`${PARLIAMENT_BASE}/${toSlug(previous.name)}`}><span>← SEBELUMNYA</span><strong>{previous.code} {previous.name}</strong></Link> : <i/>}{next && <Link to={`${PARLIAMENT_BASE}/${toSlug(next.name)}`}><span>SETERUSNYA →</span><strong>{next.code} {next.name}</strong></Link>}</nav>
    </>
  );
}
