import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type { AffiliationEvent, AllianceCatalogItem, CandidateChange, ConstituencyRegistry, DataChange, ElectionData, GeographyData, PartyCatalogItem, PollingPlacesData, ScoresheetIndex, SeatingData } from "./types";
import { Icon } from "./components/ui/Icon";
import { AtlasIntro } from "./components/maps/AtlasIntro";
import { AppShell, BrandMark } from "./components/layout/AppShell";
import { NotFound } from "./components/ui/NotFound";
import { AsyncState } from "./components/ui/AsyncState";
import { ElectionProvider } from "./ElectionContext";
import { DEFAULT_ELECTION_NUMBER, electionEdition, electionNumberForLocation } from "./elections";
import { ATLAS_BASE, electionBase, PRN_BASE, PRU_BASE, PRU_COMPARISON_BASE } from "./routes";
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
  scopedAffiliationsKey,
  scopedCandidateChangesKey,
  scopedChangesKey,
  parseAllianceCatalogFile,
  parseAffiliationFile,
  parseCandidateChangeFile,
  parseChangeFile,
  parsePartyCatalogFile,
} from "./dataChanges";
import { normalise } from "./utils";

const VoterAgePage = lazy(() => import("./pages/VoterAgePage").then((module) => ({ default: module.VoterAgePage })));
const VoterEthnicityPage = lazy(() => import("./pages/VoterEthnicityPage").then((module) => ({ default: module.VoterEthnicityPage })));
const VoterOverviewPage = lazy(() => import("./pages/VoterRollPages").then((module) => ({ default: module.VoterOverviewPage })));
const VoterAreaPage = lazy(() => import("./pages/VoterRollPages").then((module) => ({ default: module.VoterAreaPage })));
const ElectionPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.ElectionPage })));
const FederalElectionIndexPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.FederalElectionIndexPage })));
const OverviewPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.OverviewPage })));
const ParliamentIndexPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.ParliamentIndexPage })));
const ParliamentPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.ParliamentPage })));
const StatePage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.StatePage })));
const WinnersPage = lazy(() => import("./pages/PublicPages").then((module) => ({ default: module.WinnersPage })));
const DunPage = lazy(() => import("./pages/GeographyPages").then((module) => ({ default: module.DunPage })));
const LocalityPage = lazy(() => import("./pages/GeographyPages").then((module) => ({ default: module.LocalityPage })));
const PdmPage = lazy(() => import("./pages/GeographyPages").then((module) => ({ default: module.PdmPage })));
const SettingsAffiliationPage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsAffiliationPage })));
const SettingsAlliancePage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsAlliancePage })));
const SettingsCandidatePage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsCandidatePage })));
const SettingsDataPage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsDataPage })));
const SettingsPartyPage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsPartyPage })));
const SettingsOperationsPage = lazy(() => import("./pages/SettingsPages").then((module) => ({ default: module.SettingsOperationsPage })));
const SettingsCoveragePage = lazy(() => import("./pages/SettingsCoveragePage").then((module) => ({ default: module.SettingsCoveragePage })));
const Pru14AuditPage = lazy(() => import("./pages/Pru14AuditPage").then((module) => ({ default: module.Pru14AuditPage })));
const FederalElectionComparisonPage = lazy(() => import("./pages/FederalElectionComparisonPage").then((module) => ({ default: module.FederalElectionComparisonPage })));
const StateElectionIndexPage = lazy(() => import("./pages/StateElectionPages").then((module) => ({ default: module.StateElectionIndexPage })));
const StateElectionSegmentPage = lazy(() => import("./pages/StateElectionPages").then((module) => ({ default: module.StateElectionSegmentPage })));
const StateElectionPage = lazy(() => import("./pages/StateElectionPages").then((module) => ({ default: module.StateElectionPage })));
const StateDunResultPage = lazy(() => import("./pages/StateElectionPages").then((module) => ({ default: module.StateDunResultPage })));
const StateElectionMapPage = lazy(() => import("./pages/StateElectionMapPage").then((module) => ({ default: module.StateElectionMapPage })));
const StateElectionComparisonPage = lazy(() => import("./pages/StateElectionComparisonPage").then((module) => ({ default: module.StateElectionComparisonPage })));
const StateElectionComparisonShortcut = lazy(() => import("./pages/StateElectionComparisonPage").then((module) => ({ default: module.StateElectionComparisonShortcut })));
const loadNationalElectionAtlasPage = () => import("./pages/NationalElectionAtlasPage");
const NationalElectionAtlasPage = lazy(() => loadNationalElectionAtlasPage().then((module) => ({ default: module.NationalElectionAtlasPage })));

const emptySeating = { version: 0, sourceFile: "", sourceSha256: "", sourceUpdatedAt: "", viewBox: { width: 1190, height: 842 }, layout: { strategy: "svg-source-rect-v3", geometryFile: "SeatingDR.svg", geometrySha256: "", rasterFile: "SeatingDR-1.png", rasterSha256: "", physicalSeatCount: 280 }, mappedSeatCount: 0, unmappedSeatCodes: [], positions: [], emptyPositions: [] } as SeatingData;
const emptyScoresheets = { version: 0, metadata: {}, seats: [] } as unknown as ScoresheetIndex;
const emptyGeography = { version: 0, metadata: {}, pdms: [], localities: [] } as unknown as GeographyData;
const emptyConstituencies = { version: 0, sourceFile: "", sourceSha256: "", states: [], parliaments: [], duns: [] } as ConstituencyRegistry;
const emptyPollingPlaces = { version: 0, metadata: { sourceCount: 0, coveredSeats: 0 }, pollingDistricts: [], pollingCentres: [] } as PollingPlacesData;

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

function removeMisfiledMembershipChanges(changes: CandidateChange[]) {
  return changes.filter((change) => !(
    (
      change.seatCode === "P.056"
      && change.candidateIndex === 0
      && change.effectiveDate >= "2026-02-13"
      && normalise(change.party) !== normalise("PARTI PRIBUMI BERSATU MALAYSIA (BERSATU)")
    )
    || (
      change.seatCode === "P.100"
      && change.candidateIndex === 0
      && (
        normalise(change.party) === normalise("PARTI BERSAMA MALAYSIA")
        || normalise(change.alliance) === normalise("LAIN-LAIN / BEBAS")
      )
    )
  ));
}

function LoadingScreen() {
  return <main className="loading-screen"><BrandMark/><p>Memuatkan data pilihan raya…</p></main>;
}

function ErrorScreen({ message }: { message: string }) {
  return <main className="loading-screen error-screen"><Icon name="info" size={32}/><h1>Data tidak dapat dimuatkan</h1><p>{message}</p></main>;
}

function FeatureUnavailable({ label }: { label: string }) {
  return <AsyncState kind="empty" title={`${label} belum tersedia`} description="Dataset ini tidak diterbitkan untuk edisi pilihan raya yang sedang dibuka."/>;
}

function Dashboard() {
  const location = useLocation();
  const isAtlasRoute = location.pathname === ATLAS_BASE || location.pathname === `${ATLAS_BASE}/`;
  const activeElectionNumber = electionNumberForLocation(location.pathname, location.search);
  const edition = electionEdition(activeElectionNumber);
  const [data, setData] = useState<ElectionData | null>(null);
  const [seating, setSeating] = useState<SeatingData | null>(null);
  const [scoresheetIndex, setScoresheetIndex] = useState<ScoresheetIndex | null>(null);
  const [geography, setGeography] = useState<GeographyData | null>(null);
  const [constituencies, setConstituencies] = useState<ConstituencyRegistry | null>(null);
  const [pollingPlaces, setPollingPlaces] = useState<PollingPlacesData | null>(null);
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
    if (isAtlasRoute) void loadNationalElectionAtlasPage();
  }, [isAtlasRoute]);
  useEffect(() => {
    if (!edition) {
      setError(`PRU-${activeElectionNumber} belum didaftarkan dalam katalog data.`);
      return;
    }
    setError("");
    setData(null);
    setSeating(null);
    setScoresheetIndex(null);
    setGeography(null);
    setConstituencies(null);
    setPollingPlaces(null);
    setChangesLoaded(false);
    setAffiliationsLoaded(false);
    setCandidateChangesLoaded(false);
    setCatalogsLoaded(false);
    if (isAtlasRoute) return;
    const base = edition.dataPath;
    Promise.all([
      fetch(`${base}/election.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      edition.capabilities.seating && !isAtlasRoute ? fetch(`${base}/seating.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }) : Promise.resolve(emptySeating),
      isAtlasRoute ? Promise.resolve({ electionId: edition.id, changes: [] }) : fetch(`${base}/changes.json`).then((response) => response.ok ? response.json() : { electionId: edition.id, changes: [] }),
      isAtlasRoute ? Promise.resolve({ electionId: edition.id, termId: edition.termId, affiliations: [] }) : fetch(`${base}/affiliations.json`).then((response) => response.ok ? response.json() : { electionId: edition.id, termId: edition.termId, affiliations: [] }),
      isAtlasRoute ? Promise.resolve({ electionId: edition.id, candidateChanges: [] }) : fetch(`${base}/candidate-changes.json`).then((response) => response.ok ? response.json() : { electionId: edition.id, candidateChanges: [] }),
      isAtlasRoute ? Promise.resolve({ parties: [] }) : fetch("/data/reference/parties.json").then((response) => response.ok ? response.json() : { parties: [] }),
      isAtlasRoute ? Promise.resolve({ alliances: [] }) : fetch("/data/reference/alliances.json").then((response) => response.ok ? response.json() : { alliances: [] }),
      edition.capabilities.scoresheets && !isAtlasRoute ? fetch(`${base}/scoresheets/index.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }) : Promise.resolve(emptyScoresheets),
      edition.capabilities.geography && !isAtlasRoute ? fetch(`${base}/geography.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }) : Promise.resolve(emptyGeography),
      !isAtlasRoute && (edition.capabilities.geography || edition.capabilities.voterAge || edition.capabilities.voterEthnicity) ? fetch(`${base}/constituencies.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }) : Promise.resolve(emptyConstituencies),
      !isAtlasRoute && edition.capabilities.geography ? fetch(`${base}/polling-places.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }) : Promise.resolve(emptyPollingPlaces),
    ]).then(([election, seatingBaseline, baseline, affiliationBaseline, candidateBaseline, partyBaseline, allianceBaseline, scoresheetBaseline, geographyBaseline, constituencyBaseline, pollingPlacesBaseline]) => {
      if (election?.metadata?.electionId !== edition.id || election?.metadata?.electionNumber !== edition.number || election?.metadata?.termId !== edition.termId || election?.metadata?.boundaryVersion !== edition.boundaryVersion) {
        throw new Error(`Metadata dataset tidak sepadan dengan route ${edition.shortTitle}.`);
      }
      if (baseline?.electionId !== edition.id || candidateBaseline?.electionId !== edition.id) {
        throw new Error(`Fail pembetulan asas tidak sepadan dengan ${edition.shortTitle}.`);
      }
      if (affiliationBaseline?.electionId !== edition.id || affiliationBaseline?.termId !== edition.termId) {
        throw new Error(`Fail keahlian tidak sepadan dengan penggal ${edition.termId}.`);
      }
      setData(election);
      setSeating(seatingBaseline);
      setScoresheetIndex(scoresheetBaseline);
      setGeography(geographyBaseline);
      setConstituencies(constituencyBaseline);
      setPollingPlaces(pollingPlacesBaseline);
      try {
        const scopedKey = scopedChangesKey(edition.id);
        const local = localStorage.getItem(scopedKey) ?? (edition.number === DEFAULT_ELECTION_NUMBER ? localStorage.getItem(LOCAL_CHANGES_KEY) : null);
        setChanges((local ? parseChangeFile(JSON.parse(local)) : parseChangeFile(baseline)).filter((item) => !item.electionId || item.electionId === edition.id));
      } catch {
        setChanges(parseChangeFile(baseline));
      }
      try {
        const baselineRecords = parseAffiliationFile(affiliationBaseline);
        const local = localStorage.getItem(scopedAffiliationsKey(edition.termId)) ?? (edition.number === DEFAULT_ELECTION_NUMBER ? localStorage.getItem(LOCAL_AFFILIATIONS_KEY) : null);
        const localRecords = local ? parseAffiliationFile(JSON.parse(local)) : [];
        setAffiliations(mergeById(baselineRecords, localRecords).filter((item) => (!item.electionId || item.electionId === edition.id) && (!item.termId || item.termId === edition.termId)));
      } catch {
        setAffiliations(parseAffiliationFile(affiliationBaseline));
      }
      try {
        const local = localStorage.getItem(scopedCandidateChangesKey(edition.id)) ?? (edition.number === DEFAULT_ELECTION_NUMBER ? localStorage.getItem(LOCAL_CANDIDATE_CHANGES_KEY) : null);
        setCandidateChanges(removeMisfiledMembershipChanges(local ? parseCandidateChangeFile(JSON.parse(local)) : parseCandidateChangeFile(candidateBaseline)).filter((item) => !item.electionId || item.electionId === edition.id));
      } catch {
        setCandidateChanges(removeMisfiledMembershipChanges(parseCandidateChangeFile(candidateBaseline)));
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
  }, [activeElectionNumber, edition, isAtlasRoute]);
  useEffect(() => { if (changesLoaded && edition) localStorage.setItem(scopedChangesKey(edition.id), JSON.stringify({ version: 2, electionId: edition.id, changes })); }, [changes, changesLoaded, edition]);
  useEffect(() => { if (affiliationsLoaded && edition) localStorage.setItem(scopedAffiliationsKey(edition.termId), JSON.stringify({ version: 2, electionId: edition.id, termId: edition.termId, affiliations })); }, [affiliations, affiliationsLoaded, edition]);
  useEffect(() => { if (candidateChangesLoaded && edition) localStorage.setItem(scopedCandidateChangesKey(edition.id), JSON.stringify({ version: 2, electionId: edition.id, candidateChanges })); }, [candidateChanges, candidateChangesLoaded, edition]);
  useEffect(() => { if (catalogsLoaded) localStorage.setItem(LOCAL_PARTY_CATALOG_KEY, JSON.stringify({ version: 1, parties: partyCatalog })); }, [partyCatalog, catalogsLoaded]);
  useEffect(() => { if (catalogsLoaded) localStorage.setItem(LOCAL_ALLIANCE_CATALOG_KEY, JSON.stringify({ version: 1, alliances: allianceCatalog })); }, [allianceCatalog, catalogsLoaded]);
  const managedData = useMemo(() => {
    if (!data || !changesLoaded || !affiliationsLoaded || !candidateChangesLoaded || !catalogsLoaded) return null;
    const alliances = [...data.alliances, ...allianceCatalog.map(({ name, shortName, color }) => ({ name, shortName, color }))]
      .filter((alliance, index, items) => items.findIndex((item) => item.name === alliance.name) === index);
    const seats = applyReferenceCatalog(
      applyAffiliationEvents(
        applyDataChanges(applyCandidateChanges(data.seats, candidateChanges), edition?.isCurrentTerm ? changes : [], undefined, data.metadata),
        edition?.isCurrentTerm ? affiliations : [],
        partyCatalog,
        allianceCatalog,
      ),
      partyCatalog,
      allianceCatalog,
    );
    return { ...data, alliances, seats };
  }, [data, changes, affiliations, candidateChanges, partyCatalog, allianceCatalog, changesLoaded, affiliationsLoaded, candidateChangesLoaded, catalogsLoaded, edition]);
  if (error || !edition) return <ErrorScreen message={error || `PRU-${activeElectionNumber} belum tersedia.`}/>;
  if (!isAtlasRoute && (!managedData || !seating || !scoresheetIndex || !geography || !constituencies || !pollingPlaces)) return <LoadingScreen/>;
  const routeData = isAtlasRoute ? managedData : managedData!;
  const changedSeatCount = routeData?.seats.filter((seat) => seat.current?.isChanged).length ?? 0;
  const todayDate = new Date().toISOString().slice(0, 10);
  const changedCandidateCount = new Set(candidateChanges.filter((change) => change.effectiveDate <= todayDate).map((change) => `${change.seatCode}:${change.candidateIndex}`)).size;
  const electionPattern = "/pru/:electionNumber";
  return (
    <ElectionProvider edition={edition}>
      <Routes>
        <Route path="/" element={<Navigate to={electionBase(DEFAULT_ELECTION_NUMBER)} replace/>}/>
        <Route element={<AppShell data={routeData} search={search} setSearch={setSearch} changeCount={changedSeatCount} candidateChangeCount={changedCandidateCount}/> }>
          <Route path={PRU_BASE} element={<FederalElectionIndexPage/>}/>
          <Route path={PRU_COMPARISON_BASE} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan PRU…</div>}><FederalElectionComparisonPage/></Suspense>}/>
          <Route path={ATLAS_BASE} element={<Suspense fallback={<><AtlasIntro/><div className="route-loading atlas-route-loading">Membina atlas pilihan raya Malaysia…</div></>}><NationalElectionAtlasPage currentElectionData={routeData}/></Suspense>}/>
          <Route path={`${ATLAS_BASE}/embed`} element={<Suspense fallback={<><AtlasIntro/><div className="route-loading atlas-route-loading">Membina atlas pilihan raya Malaysia…</div></>}><NationalElectionAtlasPage currentElectionData={routeData} embed/></Suspense>}/>
          <Route path={electionPattern} element={<ElectionPage data={routeData!}/>}/>
          <Route path={`${electionPattern}/pemenang`} element={<WinnersPage data={routeData!}/>}/>
          <Route path="/pru/14/audit" element={<Suspense fallback={<div className="route-loading">Memuatkan audit PRU-14…</div>}><Pru14AuditPage/></Suspense>}/>
          <Route path={`${electionPattern}/pengundi`} element={edition.capabilities.voterRoll ? <Suspense fallback={<div className="route-loading">Memuatkan daftar pemilih…</div>}><VoterOverviewPage/></Suspense> : <FeatureUnavailable label="Daftar pemilih"/>}/>
          <Route path={`${electionPattern}/pengundi/kawasan`} element={edition.capabilities.voterRoll ? <Suspense fallback={<div className="route-loading">Memuatkan statistik kawasan…</div>}><VoterAreaPage/></Suspense> : <FeatureUnavailable label="Statistik kawasan pengundi"/>}/>
          <Route path={`${electionPattern}/pengundi/umur`} element={edition.capabilities.voterAge ? <Suspense fallback={<div className="route-loading">Memuatkan statistik umur…</div>}><VoterAgePage/></Suspense> : <FeatureUnavailable label="Statistik umur pengundi"/>}/>
          <Route path={`${electionPattern}/pengundi/kaum`} element={edition.capabilities.voterEthnicity ? <Suspense fallback={<div className="route-loading">Memuatkan semakan bangsa…</div>}><VoterEthnicityPage/></Suspense> : <FeatureUnavailable label="Statistik bangsa pengundi"/>}/>
          <Route path={PRN_BASE} element={<Suspense fallback={<div className="route-loading">Memuatkan pilihan raya negeri…</div>}><StateElectionIndexPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/perbandingan`} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan PRN…</div>}><StateElectionComparisonPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/perbandingan/negeri/:stateName`} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan negeri…</div>}><StateElectionComparisonPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/perbandingan/negeri/:stateName/dun/:dunName`} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan DUN…</div>}><StateElectionComparisonPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/perbandingan/parti/:partyName`} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan parti…</div>}><StateElectionComparisonPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/:assemblyNumber/perbandingan`} element={<Suspense fallback={<div className="route-loading">Menyusun perbandingan PRN…</div>}><StateElectionComparisonShortcut/></Suspense>}/>
          <Route path={`${PRN_BASE}/:segment`} element={<Suspense fallback={<div className="route-loading">Memuatkan pilihan raya negeri…</div>}><StateElectionSegmentPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/:assemblyNumber/:stateName`} element={<Suspense fallback={<div className="route-loading">Memuatkan pilihan raya negeri…</div>}><StateElectionPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/:assemblyNumber/:stateName/peta`} element={<Suspense fallback={<div className="route-loading">Memuatkan peta pilihan raya…</div>}><StateElectionMapPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/:assemblyNumber/:stateName/dun`} element={<Suspense fallback={<div className="route-loading">Memuatkan keputusan DUN…</div>}><StateElectionPage/></Suspense>}/>
          <Route path={`${PRN_BASE}/:assemblyNumber/:stateName/dun/:dunName`} element={<Suspense fallback={<div className="route-loading">Memuatkan keputusan DUN…</div>}><StateDunResultPage/></Suspense>}/>
          <Route path={`${electionPattern}/negeri`} element={<OverviewPage data={routeData!}/>}/>
          <Route path={`${electionPattern}/negeri/parlimen`} element={<ParliamentIndexPage data={routeData!} seating={seating!} search={search} setSearch={setSearch}/>}/>
          <Route path={`${electionPattern}/negeri/parlimen/:parliamentName`} element={<ParliamentPage data={routeData!} scoresheetIndex={scoresheetIndex!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName`} element={<StatePage data={routeData!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName`} element={<ParliamentPage data={routeData!} scoresheetIndex={scoresheetIndex!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName/dun/:dunName`} element={<DunPage data={routeData!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName/dun/:dunName/pdm/:pdmName`} element={<PdmPage data={routeData!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName/dun/:dunName/pdm/:pdmName/lokaliti/:localityName`} element={<LocalityPage data={routeData!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName/pdm/:pdmName`} element={<PdmPage data={routeData!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path={`${electionPattern}/negeri/:stateName/parlimen/:parliamentName/pdm/:pdmName/lokaliti/:localityName`} element={<LocalityPage data={routeData!} geography={geography!} constituencies={constituencies!} pollingPlaces={pollingPlaces!}/>}/>
          <Route path="/settings/data" element={edition.isCurrentTerm ? <SettingsDataPage data={routeData!} changes={changes} setChanges={setChanges}/> : <FeatureUnavailable label="Pengurusan status kerusi semasa"/>}/>
          <Route path="/settings/data/keahlian" element={<SettingsAffiliationPage data={routeData!} affiliations={affiliations} setAffiliations={setAffiliations} partyCatalog={partyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/calon" element={<SettingsCandidatePage data={routeData!} candidateChanges={candidateChanges} setCandidateChanges={setCandidateChanges} partyCatalog={partyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/parti" element={<SettingsPartyPage data={routeData!} partyCatalog={partyCatalog} setPartyCatalog={setPartyCatalog} allianceCatalog={allianceCatalog}/>}/>
          <Route path="/settings/data/gabungan" element={<SettingsAlliancePage data={routeData!} allianceCatalog={allianceCatalog} setAllianceCatalog={setAllianceCatalog}/>}/>
          <Route path="/settings/data/liputan" element={<SettingsCoveragePage geography={geography!} constituencies={constituencies!} scoresheets={scoresheetIndex!}/>}/>
          <Route path="/settings/data/operasi" element={<SettingsOperationsPage/>}/>
          <Route path="*" element={<NotFound/>}/>
        </Route>
      </Routes>
    </ElectionProvider>
  );
}

export default function App() {
  return <BrowserRouter><Dashboard/></BrowserRouter>;
}
