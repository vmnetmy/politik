import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ParliamentSeatingPlan } from "../components/seating/ParliamentSeatingPlan";
import { SeatCard } from "../components/SeatCard";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { currentAlliance, currentParty } from "../dataChanges";
import { useElection } from "../ElectionContext";
import type { ElectionData, SeatingData } from "../types";
import { normalise } from "../utils";

export function ParliamentIndexPage({ data, seating, search, setSearch }: { data: ElectionData; seating: SeatingData; search: string; setSearch: (value: string) => void }) {
  const { edition, paths } = useElection();
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
      <section className="route-hero directory-hero"><div className="breadcrumbs"><Link to={paths.states}>Negeri</Link><span>/</span><strong>Parlimen</strong></div><span className="overline">DIREKTORI PARLIMEN</span><h1>{data.metadata.seatCount} kerusi.<br/><em>Satu pandangan.</em></h1><p>Cari keputusan, pemenang dan pecahan undi untuk setiap kawasan Parlimen.</p></section>
      {edition.capabilities.seating && <ParliamentSeatingPlan data={data} seating={seating} search={search} stateFilter={stateFilter} allianceFilter={allianceFilter}/>}
      <section className="explorer-section directory-explorer"><div className="explorer-heading"><div><span className="eyebrow">PENEROKAAN DATA</span><h2>Telusuri setiap kerusi</h2></div><div className="result-count"><strong>{filtered.length}</strong><span>KERUSI DITEMUI</span></div></div>
        <div className="filter-bar"><label><span>NEGERI</span><div className="select-wrap"><select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}><option>SEMUA NEGERI</option>{states.map((state) => <option key={state}>{state}</option>)}</select><Icon name="chevron" size={16}/></div></label><SearchCombobox className="filter-combobox" label="GABUNGAN" value={allianceFilter} options={["SEMUA GABUNGAN", ...alliances]} onChange={setAllianceFilter} allowCustom={false}/><label className="filter-search"><span>CARIAN</span><div><Icon name="search" size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama kerusi atau calon"/></div></label>{(stateFilter !== "SEMUA NEGERI" || allianceFilter !== "SEMUA GABUNGAN" || search) && <button className="reset-button" onClick={() => { setStateFilter("SEMUA NEGERI"); setAllianceFilter("SEMUA GABUNGAN"); setSearch(""); }}>Set semula</button>}</div>
        {filtered.length ? <><div className="seat-grid">{filtered.slice(0, limit).map((seat) => <SeatCard key={seat.code} seat={seat} data={data}/>)}</div>{limit < filtered.length && <button className="load-more" onClick={() => setLimit((value) => value + 18)}>Muatkan lagi <span>{Math.min(18, filtered.length - limit)}</span></button>}</> : <div className="empty-state"><Icon name="search" size={30}/><h3>Tiada kerusi ditemui</h3><p>Cuba ubah tapisan atau istilah carian anda.</p></div>}
      </section>
    </>
  );
}
