import { Suspense, useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { useElection } from "../../ElectionContext";
import { formatElectionDate } from "../../elections";
import { ATLAS_BASE, PRN_BASE, PRU_BASE, PRU_COMPARISON_BASE } from "../../routes";
import type { ElectionData } from "../../types";
import { Icon } from "../ui/Icon";
import { Badge } from "../ui/primitives";

export function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><span/><span/><span/><i/></div>;
}

export function DataFooter({ data }: { data: ElectionData | null }) {
  return (
    <footer>
      <div className="footer-brand"><BrandMark/><div><strong>Politik.my</strong><span>Data untuk demokrasi yang lebih jelas.</span></div></div>
      <div className="footer-data"><Icon name="database" size={18}/><div><span>SUMBER</span><strong>{data?.metadata.sourceFile ?? "SPR OPEN DATA"}</strong></div></div>
    </footer>
  );
}

type AppShellProps = {
  data: ElectionData | null;
  search: string;
  setSearch: (value: string) => void;
  changeCount: number;
  candidateChangeCount: number;
  children?: ReactNode;
};

export function AppShell({ data, search, setSearch, changeCount, candidateChangeCount, children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { edition, paths } = useElection();
  useEffect(() => {
    if (!window.matchMedia("(max-width: 820px)").matches) return;
    const activeItem = document.querySelector<HTMLElement>(".sidebar nav a.active");
    activeItem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to={paths.election}><BrandMark/><div><strong>Politik.my</strong><span>Data pilihan raya</span></div></Link>
        <nav aria-label="Navigasi utama">
          <NavLink to={paths.states} end className={() => location.pathname === paths.states || new RegExp(`^${paths.states}/[^/]+$`).test(location.pathname) ? "active" : ""}><Icon name="grid"/><span>Negeri</span></NavLink>
          <NavLink to={paths.parliament} className={() => location.pathname === paths.parliament || location.pathname.includes("/parlimen/") ? "active" : ""}><Icon name="seat"/><span>Parlimen</span></NavLink>
          <NavLink to={paths.winners}><Icon name="people"/><span>Pemenang</span></NavLink>
          <a href={ATLAS_BASE} className={location.pathname === ATLAS_BASE || location.pathname === `${ATLAS_BASE}/` ? "active" : ""}><Icon name="map"/><span>Atlas</span></a>
          {edition.capabilities.voterRoll && <NavLink to={paths.voters} className={() => location.pathname === paths.voters || location.pathname.startsWith(`${paths.voters}/`) ? "active" : ""}><Icon name="chart"/><span>Pengundi</span></NavLink>}
          <NavLink to={PRN_BASE}><Icon name="vote"/><span>PRN</span></NavLink>
          <NavLink to={PRU_BASE} end className={() => location.pathname === PRU_BASE || location.pathname === PRU_COMPARISON_BASE || /^\/pru\/\d+$/.test(location.pathname) ? "active" : ""}><Icon name="vote"/><span>PRU</span></NavLink>
          <NavLink to={`/settings/data?election=${edition.number}`}><Icon name="database"/><span>Data</span>{changeCount + candidateChangeCount > 0 && <b className="nav-count">{changeCount + candidateChangeCount}</b>}</NavLink>
        </nav>
        <div className="sidebar-source"><Icon name="database" size={18}/><div><span>Sumber data</span><strong>{data?.metadata.sourceFile ?? "SPR OPEN DATA"}</strong></div></div>
        <div className="sidebar-foot"><span>{edition.shortTitle}</span><span>{formatElectionDate(edition.electionDate)}</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <Link className="mobile-brand" to={paths.election} aria-label="Politik.my — halaman utama pilihan raya"><BrandMark/><strong>Politik.my</strong></Link>
          <label className="global-search">
            <Icon name="search" size={18}/>
            <input value={search} onFocus={() => location.pathname !== paths.parliament && navigate(paths.parliament)} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kerusi, calon atau parti…"/>
            {search && <button onClick={() => setSearch("")} aria-label="Kosongkan carian">×</button>}
          </label>
          <Badge className="dataset-badge"><i/><span>{changeCount ? `${changeCount} KERUSI DIKEMAS KINI` : candidateChangeCount ? `${candidateChangeCount} CALON DIKEMAS KINI` : "DATA ASAL"}</span></Badge>
        </header>
        <div className="page-wrap">
          <Suspense fallback={<div className="route-loading">Memuatkan paparan…</div>}>{children ?? <Outlet/>}</Suspense>
          <DataFooter data={data}/>
        </div>
      </main>
    </div>
  );
}
