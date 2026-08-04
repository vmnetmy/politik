import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { AppShell } from "./components/layout/AppShell";
import { ElectionProvider } from "./ElectionContext";
import { DEFAULT_ELECTION_NUMBER, electionEdition } from "./elections";
import { NationalElectionAtlasPage } from "./pages/NationalElectionAtlasPage";
import { ATLAS_BASE } from "./routes";

function FullDocumentNavigation() {
  const location = useLocation();
  useEffect(() => {
    window.location.assign(`${location.pathname}${location.search}${location.hash}`);
  }, [location.hash, location.pathname, location.search]);
  return <div className="route-loading">Membuka paparan…</div>;
}

function AtlasRoutes() {
  const [search, setSearch] = useState("");
  const edition = electionEdition(DEFAULT_ELECTION_NUMBER);
  if (!edition) return null;
  return (
    <ElectionProvider edition={edition}>
      <Routes>
        <Route element={<AppShell data={null} search={search} setSearch={setSearch} changeCount={0} candidateChangeCount={0}/>}>
          <Route path={ATLAS_BASE} element={<NationalElectionAtlasPage currentElectionData={null}/>}/>
          <Route path={`${ATLAS_BASE}/embed`} element={<NationalElectionAtlasPage currentElectionData={null} embed/>}/>
          <Route path="*" element={<FullDocumentNavigation/>}/>
        </Route>
      </Routes>
    </ElectionProvider>
  );
}

export default function AtlasApp() {
  return <BrowserRouter><AtlasRoutes/></BrowserRouter>;
}
