import { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import type { AffiliationEvent, AllianceCatalogItem, CandidateChange, DataChange, ElectionData, PartyCatalogItem, SeatingData } from "./types";
import { Icon } from "./components/ui/Icon";
import { NotFound } from "./components/ui/NotFound";
import { Badge } from "./components/ui/primitives";
import { ElectionPage, OverviewPage, ParliamentIndexPage, ParliamentPage, StatePage, WinnersPage } from "./pages/PublicPages";
import { SettingsAffiliationPage, SettingsAlliancePage, SettingsCandidatePage, SettingsDataPage, SettingsPartyPage } from "./pages/SettingsPages";
import { ELECTION_BASE, PARLIAMENT_BASE, STATE_BASE, WINNERS_BASE } from "./routes";
import {
  applyAffiliationEvents,
  applyCandidateChanges,
  applyDataChanges,
  applyReferenceCatalog,
  buildDefaultAllianceCatalog,
  buildDefaultPartyCatalog,
  LOCAL_AFFILIATIONS_KEY,
  LOCAL_ALLIANCE_CATALOG_KEY,
  LOCAL_CANDIDATE_CHANGES_KEY,
  LOCAL_CHANGES_KEY,
  LOCAL_PARTY_CATALOG_KEY,
  parseAllianceCatalogFile,
  parseAffiliationFile,
  parseCandidateChangeFile,
  parseChangeFile,
  parsePartyCatalogFile,
} from "./dataChanges";
import { normalise } from "./utils";

function mergeById<T extends { id: string }>(baseline: T[], local: T[]) {
  const merged = new Map(baseline.map((item) => [item.id, item]));
  local.forEach((item) => merged.set(item.id, item));
  return [...merged.values()];
}

function mergeReferenceCatalog<T extends { id: string; sourceName: string; name: string; aliases: string[] }>(defaults: T[], overrides: T[]) {
  const merged = [...defaults];
  overrides.forEach((override) => {
    const overrideNames = new Set([override.sourceName, override.name, ...override.aliases].map(normalise));
    const index = merged.findIndex((item) => [item.sourceName, item.name, ...item.aliases].some((name) => overrideNames.has(normalise(name))));
    if (index >= 0) merged[index] = override;
    else merged.push(override);
  });
  return merged;
}

function removeMisfiledHamzahMembership(changes: CandidateChange[]) {
  return changes.filter((change) => !(
    change.seatCode === "P.056"
    && change.candidateIndex === 0
    && change.effectiveDate >= "2026-02-13"
    && normalise(change.party) !== normalise("PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)")
  ));
}

function Mark() {
  return <div className="brand-mark" aria-hidden="true"><span/><span/><span/><i/></div>;
}

function LoadingScreen() {
  return <main className="loading-screen"><Mark/><p>Memuatkan data pilihan raya…</p></main>;
}

function ErrorScreen({ message }: { message: string }) {
  return <main className="loading-screen error-screen"><Icon name="info" size={32}/><h1>Data tidak dapat dimuatkan</h1><p>{message}</p></main>;
}

function DataFooter({ data }: { data: ElectionData }) {
  return (
    <footer>
      <div className="footer-brand"><Mark/><div><strong>Nadi Rakyat</strong><span>Data untuk demokrasi yang lebih jelas.</span></div></div>
      <div className="footer-data"><Icon name="database" size={18}/><div><span>SUMBER</span><strong>{data.metadata.sourceFile}</strong></div></div>
      <details><summary><Icon name="info" size={17}/> Nota data</summary><div className="data-note-popover"><strong>Catatan kualiti data</strong><p>Semua angka diproses terus daripada fail sumber dalam repositori.</p>{data.metadata.issues.map((issue) => <p key={`${issue.seat}-${issue.field}`}><b>{issue.seat}:</b> {issue.message}</p>)}</div></details>
    </footer>
  );
}

function Shell({ data, search, setSearch, changeCount, candidateChangeCount }: { data: ElectionData; search: string; setSearch: (value: string) => void; changeCount: number; candidateChangeCount: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to={ELECTION_BASE}><Mark/><div><strong>Nadi Rakyat</strong><span>Data pilihan raya</span></div></Link>
        <nav aria-label="Navigasi utama">
          <NavLink to={STATE_BASE} end className={() => location.pathname === STATE_BASE || (location.pathname.startsWith(`${STATE_BASE}/`) && !location.pathname.startsWith(PARLIAMENT_BASE)) ? "active" : ""}><Icon name="grid"/><span>Negeri</span></NavLink>
          <NavLink to={PARLIAMENT_BASE}><Icon name="seat"/><span>Parlimen</span></NavLink>
          <NavLink to={WINNERS_BASE}><Icon name="people"/><span>Pemenang</span></NavLink>
          <NavLink to={ELECTION_BASE} end><Icon name="vote"/><span>PRU</span></NavLink>
          <NavLink to="/settings/data"><Icon name="database"/><span>Data</span>{changeCount + candidateChangeCount > 0 && <b className="nav-count">{changeCount + candidateChangeCount}</b>}</NavLink>
        </nav>
        <div className="sidebar-source"><Icon name="database" size={18}/><div><span>Sumber data</span><strong>{data.metadata.sourceFile}</strong></div></div>
        <div className="sidebar-foot"><span>PRU-15</span><span>19 NOV 2022</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <Link className="mobile-brand" to={ELECTION_BASE}><Mark/><strong>Nadi Rakyat</strong></Link>
          <label className="global-search">
            <Icon name="search" size={18}/>
            <input value={search} onFocus={() => location.pathname !== PARLIAMENT_BASE && navigate(PARLIAMENT_BASE)} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kerusi, calon atau parti…"/>
            {search && <button onClick={() => setSearch("")} aria-label="Kosongkan carian">×</button>}
          </label>
          <Badge className="dataset-badge"><i/><span>{changeCount ? `${changeCount} KERUSI DIKEMAS KINI` : candidateChangeCount ? `${candidateChangeCount} CALON DIKEMAS KINI` : "DATA ASAL"}</span></Badge>
        </header>
        <div className="page-wrap"><Outlet/><DataFooter data={data}/></div>
      </main>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<ElectionData | null>(null);
  const [seating, setSeating] = useState<SeatingData | null>(null);
  const [changes, setChanges] = useState<DataChange[]>([]);
  const [affiliations, setAffiliations] = useState<AffiliationEvent[]>([]);
  const [candidateChanges, setCandidateChanges] = useState<CandidateChange[]>([]);
  const [partyCatalog, setPartyCatalog] = useState<PartyCatalogItem[]>([]);
  const [allianceCatalog, setAllianceCatalog] = useState<AllianceCatalogItem[]>([]);
  const [changesLoaded, setChangesLoaded] = useState(false);
  const [affiliationsLoaded, setAffiliationsLoaded] = useState(false);
  const [candidateChangesLoaded, setCandidateChangesLoaded] = useState(false);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    Promise.all([
      fetch("/data/election.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch("/data/seating.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch("/data/changes.json").then((response) => response.ok ? response.json() : { changes: [] }),
      fetch("/data/affiliations.json").then((response) => response.ok ? response.json() : { affiliations: [] }),
      fetch("/data/candidate-changes.json").then((response) => response.ok ? response.json() : { candidateChanges: [] }),
      fetch("/data/parties.json").then((response) => response.ok ? response.json() : { parties: [] }),
      fetch("/data/alliances.json").then((response) => response.ok ? response.json() : { alliances: [] }),
    ]).then(([election, seatingBaseline, baseline, affiliationBaseline, candidateBaseline, partyBaseline, allianceBaseline]) => {
      setData(election);
      setSeating(seatingBaseline);
      try {
        const local = localStorage.getItem(LOCAL_CHANGES_KEY);
        setChanges(local ? parseChangeFile(JSON.parse(local)) : parseChangeFile(baseline));
      } catch {
        setChanges(parseChangeFile(baseline));
      }
      try {
        const baselineRecords = parseAffiliationFile(affiliationBaseline);
        const local = localStorage.getItem(LOCAL_AFFILIATIONS_KEY);
        const localRecords = local ? parseAffiliationFile(JSON.parse(local)) : [];
        setAffiliations(mergeById(baselineRecords, localRecords));
      } catch {
        setAffiliations(parseAffiliationFile(affiliationBaseline));
      }
      try {
        const local = localStorage.getItem(LOCAL_CANDIDATE_CHANGES_KEY);
        setCandidateChanges(removeMisfiledHamzahMembership(local ? parseCandidateChangeFile(JSON.parse(local)) : parseCandidateChangeFile(candidateBaseline)));
      } catch {
        setCandidateChanges(removeMisfiledHamzahMembership(parseCandidateChangeFile(candidateBaseline)));
      }
      try {
        const local = localStorage.getItem(LOCAL_PARTY_CATALOG_KEY);
        const parsed = local ? parsePartyCatalogFile(JSON.parse(local)) : parsePartyCatalogFile(partyBaseline);
        setPartyCatalog(mergeReferenceCatalog(buildDefaultPartyCatalog(election), parsed));
      } catch {
        setPartyCatalog(buildDefaultPartyCatalog(election));
      }
      try {
        const local = localStorage.getItem(LOCAL_ALLIANCE_CATALOG_KEY);
        const parsed = local ? parseAllianceCatalogFile(JSON.parse(local)) : parseAllianceCatalogFile(allianceBaseline);
        setAllianceCatalog(mergeReferenceCatalog(buildDefaultAllianceCatalog(election), parsed));
      } catch {
        setAllianceCatalog(buildDefaultAllianceCatalog(election));
      }
      setChangesLoaded(true);
      setAffiliationsLoaded(true);
      setCandidateChangesLoaded(true);
      setCatalogsLoaded(true);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
  }, []);
  useEffect(() => { if (changesLoaded) localStorage.setItem(LOCAL_CHANGES_KEY, JSON.stringify({ version: 1, changes })); }, [changes, changesLoaded]);
  useEffect(() => { if (affiliationsLoaded) localStorage.setItem(LOCAL_AFFILIATIONS_KEY, JSON.stringify({ version: 1, affiliations })); }, [affiliations, affiliationsLoaded]);
  useEffect(() => { if (candidateChangesLoaded) localStorage.setItem(LOCAL_CANDIDATE_CHANGES_KEY, JSON.stringify({ version: 1, candidateChanges })); }, [candidateChanges, candidateChangesLoaded]);
  useEffect(() => { if (catalogsLoaded) localStorage.setItem(LOCAL_PARTY_CATALOG_KEY, JSON.stringify({ version: 1, parties: partyCatalog })); }, [partyCatalog, catalogsLoaded]);
  useEffect(() => { if (catalogsLoaded) localStorage.setItem(LOCAL_ALLIANCE_CATALOG_KEY, JSON.stringify({ version: 1, alliances: allianceCatalog })); }, [allianceCatalog, catalogsLoaded]);
  const managedData = useMemo(() => {
    if (!data || !changesLoaded || !affiliationsLoaded || !candidateChangesLoaded || !catalogsLoaded) return null;
    const alliances = [...data.alliances, ...allianceCatalog.map(({ name, shortName, color }) => ({ name, shortName, color }))]
      .filter((alliance, index, items) => items.findIndex((item) => item.name === alliance.name) === index);
    const seats = applyReferenceCatalog(
      applyAffiliationEvents(
        applyDataChanges(applyCandidateChanges(data.seats, candidateChanges), changes),
        affiliations,
        partyCatalog,
        allianceCatalog,
      ),
      partyCatalog,
      allianceCatalog,
    );
    return { ...data, alliances, seats };
  }, [data, changes, affiliations, candidateChanges, partyCatalog, allianceCatalog, changesLoaded, affiliationsLoaded, candidateChangesLoaded, catalogsLoaded]);
  if (error) return <ErrorScreen message={error}/>;
  if (!managedData || !seating) return <LoadingScreen/>;
  const changedSeatCount = managedData.seats.filter((seat) => seat.current?.isChanged).length;
  const todayDate = new Date().toISOString().slice(0, 10);
  const changedCandidateCount = new Set(candidateChanges.filter((change) => change.effectiveDate <= todayDate).map((change) => `${change.seatCode}:${change.candidateIndex}`)).size;
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={ELECTION_BASE} replace/>}/>
        <Route element={<Shell data={managedData} search={search} setSearch={setSearch} changeCount={changedSeatCount} candidateChangeCount={changedCandidateCount}/> }>
          <Route path="/pru" element={<Navigate to={ELECTION_BASE} replace/>}/>
          <Route path={ELECTION_BASE} element={<ElectionPage data={managedData}/>}/>
          <Route path={WINNERS_BASE} element={<WinnersPage data={managedData}/>}/>
          <Route path={STATE_BASE} element={<OverviewPage data={managedData}/>}/>
          <Route path={PARLIAMENT_BASE} element={<ParliamentIndexPage data={managedData} seating={seating} search={search} setSearch={setSearch}/>}/>
          <Route path={`${PARLIAMENT_BASE}/:parliamentName`} element={<ParliamentPage data={managedData}/>}/>
          <Route path={`${STATE_BASE}/:stateName`} element={<StatePage data={managedData}/>}/>
          <Route path="/settings/data" element={<SettingsDataPage data={managedData} changes={changes} setChanges={setChanges}/>}/>
          <Route path="/settings/data/keahlian" element={<SettingsAffiliationPage data={managedData} affiliations={affiliations} setAffiliations={setAffiliations} partyCatalog={partyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/calon" element={<SettingsCandidatePage data={managedData} candidateChanges={candidateChanges} setCandidateChanges={setCandidateChanges} partyCatalog={partyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/parti" element={<SettingsPartyPage data={managedData} partyCatalog={partyCatalog} setPartyCatalog={setPartyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/gabungan" element={<SettingsAlliancePage data={managedData} allianceCatalog={allianceCatalog} setAllianceCatalog={setAllianceCatalog}/>}/>
          <Route path="*" element={<NotFound/>}/>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
