import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
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
  useParams,
} from "react-router-dom";
import type { AffiliationEvent, AffiliationStatus, AllianceCatalogItem, Candidate, CandidateChange, DataChange, ElectionData, PartyCatalogItem, Seat, SeatingData, SeatingPosition, SeatStatus } from "./types";
import {
  applyAffiliationEvents,
  applyCandidateChanges,
  applyDataChanges,
  applyReferenceCatalog,
  buildDefaultAllianceCatalog,
  buildDefaultPartyCatalog,
  currentAlliance,
  currentParty,
  currentStatus,
  INDEPENDENT_ALLIANCE,
  INDEPENDENT_PARTY,
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
  personIdForSeat,
  resolveCatalogValue,
  VACANT_ALLIANCE,
} from "./dataChanges";
import {
  allianceColor,
  buildStateSummaries,
  formatCompact,
  formatNumber,
  formatPct,
  normalise,
  shortAlliance,
  toSlug,
} from "./utils";

type IconName = "grid" | "seat" | "people" | "chart" | "search" | "arrow" | "chevron" | "database" | "info" | "vote";

const ELECTION_BASE = "/pru/15";
const WINNERS_BASE = `${ELECTION_BASE}/pemenang`;
const STATE_BASE = `${ELECTION_BASE}/negeri`;
const PARLIAMENT_BASE = `${STATE_BASE}/parlimen`;

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

const allianceImageModules = import.meta.glob("../Gabungan/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const partyImageModules = import.meta.glob("../Parties/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const allianceImage = (filename: string) => allianceImageModules[`../Gabungan/${filename}`];
const partyImage = (filename: string) => partyImageModules[`../Parties/${filename}`];

const ALLIANCE_IMAGES: Record<string, string | undefined> = {
  PH: allianceImage("01-pakatan-harapan.png"),
  PN: allianceImage("02-perikatan-nasional.png"),
  BN: allianceImage("03-barisan-nasional.png"),
  PEJUANG: allianceImage("04-gerakan-tanah-air-gta.png"),
  PUTRA: allianceImage("04-gerakan-tanah-air-gta.png"),
  GTA: allianceImage("04-gerakan-tanah-air-gta.png"),
  "LAIN-LAIN": allianceImage("05-bebas.png"),
  BEBAS: allianceImage("05-bebas.png"),
};

const PARTY_IMAGES: Record<string, string | undefined> = {
  UMNO: partyImage("01-umno.png"),
  PAS: partyImage("02-pas.png"),
  PKR: partyImage("03-pkr.png"),
  DAP: partyImage("04-dap.png"),
  AMANAH: partyImage("05-amanah.png"),
  BERSATU: partyImage("06-bersatu.png"),
  PEJUANG: partyImage("07-pejuang.png"),
  WARISAN: partyImage("08-warisan.png"),
  MUDA: partyImage("09-muda.png"),
  GERAKAN: partyImage("10-gerakan.png"),
  MCA: partyImage("11-mca.png"),
  MIC: partyImage("12-mic.png"),
  PBM: partyImage("13-parti-bangsa-malaysia-pbm.png"),
  PRM: partyImage("14-parti-rakyat-malaysia-prm.png"),
  PCM: partyImage("15-parti-cinta-malaysia-pcm.png"),
  PBS: partyImage("16-parti-bersatu-sabah-pbs.png"),
  STARSABAH: partyImage("17-star-sabah.png"),
  STAR: partyImage("17-star-sabah.png"),
  SAPP: partyImage("18-sapp.png"),
  PBB: partyImage("19-parti-pesaka-bumiputera-bersatu-pbb.png"),
  SUPP: partyImage("20-sarawak-united-peoples-party-supp.png"),
  PBK: partyImage("21-parti-bumi-kenyalang-pbk.png"),
  KDM: partyImage("23-parti-kesejahteraan-demokratik-masyarakat-kdm.png"),
  PSB: partyImage("24-parti-sarawak-bersatu-psb.png"),
  PWN: partyImage("25-parti-wawasan-negara.png"),
  "PARTI WAWASAN NEGARA": partyImage("25-parti-wawasan-negara.png"),
  BEBAS: allianceImage("05-bebas.png"),
};

type IdentityMarkSize = "sm" | "md" | "lg";

function identityCode(name: string, explicitShortName?: string) {
  const inferred = explicitShortName || name.match(/\(([^)]+)\)\s*$/)?.[1] || name;
  const upper = inferred.trim().toUpperCase();
  if (upper === "PAS-DHPP") return "PAS";
  if (upper === "BERSATU-BERSEKUTU") return "BERSATU";
  if (upper === "KERUSI KOSONG") return "KOSONG";
  return upper;
}

function compactIdentityLabel(code: string) {
  if (code.length <= 12) return code;
  return code.split(/[^A-Z0-9]+/).filter(Boolean).map((word) => word[0]).join("").slice(0, 8) || code.slice(0, 8);
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    seat: <><path d="M7 11V5a2 2 0 0 1 4 0v6"/><path d="M13 11V7a2 2 0 0 1 4 0v5"/><path d="M5 11h14v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M8 19v2m8-2v2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.2"/><path d="M16 14.5a4.5 4.5 0 0 1 4.5 4.5"/></>,
    chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
    vote: <><path d="M7 3h10l2 8H5z"/><path d="M4 11h16v10H4z"/><path d="m9 7 2 2 4-4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Mark() {
  return <div className="brand-mark" aria-hidden="true"><span/><span/><span/><i/></div>;
}

function AllianceLogo({ name, data, size = "sm", className = "" }: { name: string; data: ElectionData; size?: IdentityMarkSize; className?: string }) {
  const shortName = shortAlliance(name, data.alliances);
  const src = ALLIANCE_IMAGES[identityCode(name, shortName)];
  const classes = `identity-mark alliance-mark identity-mark-${size} ${className}`.trim();
  return src
    ? <span className={classes} title={name}><img src={src} alt={name} decoding="async"/></span>
    : <span className={`${classes} identity-mark-fallback`} title={name} style={{ "--identity-color": allianceColor(name, data.alliances) } as React.CSSProperties}><i/>{shortName}</span>;
}

function PartyLogo({ name, shortName, size = "sm", className = "" }: { name: string; shortName?: string; size?: IdentityMarkSize; className?: string }) {
  const code = identityCode(name, shortName);
  const src = PARTY_IMAGES[code];
  const classes = `identity-mark party-mark identity-mark-${size} ${className}`.trim();
  return src
    ? <span className={classes} title={name}><img src={src} alt={name} loading="lazy" decoding="async"/></span>
    : <span className={`${classes} identity-mark-fallback`} title={name}>{compactIdentityLabel(code)}</span>;
}

function AlliancePill({ name, data }: { name: string; data: ElectionData }) {
  return <AllianceLogo name={name} data={data} className="alliance-pill"/>;
}

function PageTitle({ title }: { title: string }) {
  useEffect(() => { document.title = `${title} — Nadi Rakyat`; }, [title]);
  return null;
}

type SearchComboboxProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
};

function SearchCombobox({ label, value, options, onChange, placeholder = "Cari atau pilih…", disabled = false, allowCustom = true, className = "" }: SearchComboboxProps) {
  const generatedId = useId();
  const inputId = `combobox-${generatedId.replace(/:/g, "")}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const uniqueOptions = useMemo(() => [...new Set(options.filter(Boolean))], [options]);
  const filteredOptions = useMemo(() => uniqueOptions.filter((option) => !searchTerm || normalise(option).includes(normalise(searchTerm))).slice(0, 60), [uniqueOptions, searchTerm]);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [value]);

  const choose = (option: string) => {
    onChange(option);
    setQuery(option);
    setSearchTerm("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredOptions.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
      setSearchTerm("");
    }
  };

  return (
    <div className={`search-combobox ${className}`} ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`combobox-control ${open ? "is-open" : ""}`}>
        <Icon name="search" size={16}/>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={(event) => { setOpen(true); setSearchTerm(""); setActiveIndex(Math.max(0, uniqueOptions.indexOf(value))); event.currentTarget.select(); }}
          onChange={(event) => { const next = event.target.value; setQuery(next); setSearchTerm(next); setActiveIndex(0); setOpen(true); if (allowCustom) onChange(next); }}
          onKeyDown={onKeyDown}
        />
        <button type="button" disabled={disabled} aria-label={`${open ? "Tutup" : "Buka"} pilihan ${label}`} onClick={() => { setOpen((current) => !current); setSearchTerm(""); inputRef.current?.focus(); }}><Icon name="chevron" size={16}/></button>
      </div>
      {open && !disabled && <div className="combobox-menu" id={listId} role="listbox">{filteredOptions.length ? filteredOptions.map((option, index) => <button type="button" role="option" id={`${inputId}-option-${index}`} aria-selected={option === value} className={`combobox-option ${index === activeIndex ? "is-active" : ""}`} key={option} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><span>{option}</span>{option === value && <b>Dipilih</b>}</button>) : <div className="combobox-empty">Tiada pilihan ditemui{allowCustom && query ? ". Nilai baharu boleh digunakan." : "."}</div>}</div>}
    </div>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><Mark/><p>Memuatkan data pilihan raya…</p></main>;
}

function ErrorScreen({ message }: { message: string }) {
  return <main className="loading-screen error-screen"><Icon name="info" size={32}/><h1>Data tidak dapat dimuatkan</h1><p>{message}</p></main>;
}

function NotFound({ label = "Halaman" }: { label?: string }) {
  return (
    <section className="not-found"><PageTitle title="Tidak ditemui"/>
      <Icon name="search" size={34}/><span className="eyebrow">404</span><h1>{label} tidak ditemui</h1>
      <p>Semak semula alamat atau kembali ke senarai data.</p>
      <Link to={STATE_BASE}>Kembali ke negeri <Icon name="arrow" size={16}/></Link>
    </section>
  );
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
          <div className="dataset-badge"><i/><span>{changeCount ? `${changeCount} KERUSI DIKEMAS KINI` : candidateChangeCount ? `${candidateChangeCount} CALON DIKEMAS KINI` : "DATA ASAL"}</span></div>
        </header>
        <div className="page-wrap"><Outlet/><DataFooter data={data}/></div>
      </main>
    </div>
  );
}

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
        {threshold && <i className="majority-marker" style={{ left: `${(threshold / seats.length) * 100}%` }}/>} 
      </div>
      <div className="composition-list">
        {composition.map(([name, count]) => <div key={name} className="composition-row"><AllianceLogo name={name} data={data} size="md"/><strong className="seat-number">{count}</strong><span className="seat-label">KERUSI</span></div>)}
      </div>
    </article>
  );
}

function OverviewPage({ data }: { data: ElectionData }) {
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

function ElectionPage({ data }: { data: ElectionData }) {
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

function WinnersPage({ data }: { data: ElectionData }) {
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

function SeatCard({ seat, data }: { seat: Seat; data: ElectionData }) {
  const alliance = currentAlliance(seat);
  const party = currentParty(seat);
  const changed = seat.current?.isChanged;
  return (
    <Link className="seat-card" to={`${PARLIAMENT_BASE}/${toSlug(seat.name)}`}>
      <div className="seat-card-top"><span>{seat.state}</span><span>{seat.code}</span></div><h3>{seat.name}</h3>
      <div className="winner-line"><span className="party-dot" style={{ background: allianceColor(alliance, data.alliances) }}/><div><span>WAKIL RAKYAT</span><strong>{seat.winner.name}</strong></div>{changed && <b className="changed-badge">DIKEMAS KINI</b>}</div>
      <div className="seat-card-stats"><div><span>KEDUDUKAN SEMASA</span><strong className="identity-pair">{currentStatus(seat) === "vacant" ? "KOSONG" : <><PartyLogo name={party}/><AllianceLogo name={alliance} data={data}/></>}</strong></div><div><span>MAJORITI PRU-15</span><strong>{formatNumber(seat.marginVotes)}</strong></div><div><span>TURNOUT</span><strong>{formatPct(seat.turnoutPct)}</strong></div></div>
      <div className="open-seat">Lihat keputusan <Icon name="arrow" size={16}/></div>
    </Link>
  );
}

function StatePage({ data }: { data: ElectionData }) {
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
      <section className="state-detail-grid"><SeatComposition seats={seats} data={data} title={`Agihan kerusi ${state}`}/><article className="panel state-context"><span className="eyebrow">RINGKASAN NEGERI</span><h2>{formatCompact(summary.registered)}</h2><p>pemilih berdaftar</p><div><span>Jumlah keluar mengundi</span><strong>{formatNumber(summary.turnout)}</strong></div><div><span>Purata calon / kerusi</span><strong>{(seats.reduce((n,s)=>n+s.candidateCount,0)/seats.length).toFixed(1)}</strong></div><Link to={PARLIAMENT_BASE}>Terokai semua Parlimen <Icon name="arrow" size={16}/></Link></article></section>
      <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">PARLIMEN DI {state}</span><h2>{seats.length} kerusi untuk diterokai</h2></div><div className="result-count"><strong>{seats.length}</strong><span>KERUSI</span></div></div><div className="seat-grid route-seat-grid">{seats.map((seat) => <SeatCard key={seat.code} seat={seat} data={data}/>)}</div></section>
    </>
  );
}

type SeatingView = "current" | "election";

function ParliamentSeatingPlan({ data, seating, search, stateFilter, allianceFilter }: {
  data: ElectionData;
  seating: SeatingData;
  search: string;
  stateFilter: string;
  allianceFilter: string;
}) {
  const [view, setView] = useState<SeatingView>("current");
  const [selectedCode, setSelectedCode] = useState(seating.positions[0]?.seatCode ?? "");
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const seatByCode = useMemo(() => new Map(data.seats.map((seat) => [seat.code, seat])), [data]);
  const positionByCode = useMemo(() => new Map(seating.positions.map((position) => [position.seatCode, position])), [seating]);
  const selectedSeat = seatByCode.get(selectedCode) ?? data.seats[0];
  const hoveredSeat = hoveredCode ? seatByCode.get(hoveredCode) : undefined;
  const hoveredPosition = hoveredCode ? positionByCode.get(hoveredCode) : undefined;
  const identityAlliance = (seat: Seat) => view === "current" ? currentAlliance(seat) : seat.winner.alliance;
  const normalisedQuery = normalise(search.trim());
  const matchesFilters = (seat: Seat) => (stateFilter === "SEMUA NEGERI" || seat.state === stateFilter)
    && (allianceFilter === "SEMUA GABUNGAN" || currentAlliance(seat) === allianceFilter)
    && (!normalisedQuery || [seat.code, seat.name, seat.state, seat.winner.name, seat.winner.party, currentParty(seat)].some((value) => normalise(value).includes(normalisedQuery)));
  const alliances = [...new Set(seating.positions.map((position) => seatByCode.get(position.seatCode)).filter((seat): seat is Seat => Boolean(seat)).map(identityAlliance))].sort();
  const unmappedSeats = seating.unmappedSeatCodes.map((code) => seatByCode.get(code)).filter((seat): seat is Seat => Boolean(seat));
  const activeParty = selectedSeat ? currentParty(selectedSeat) : "";
  const activeAlliance = selectedSeat ? currentAlliance(selectedSeat) : "";
  const selectedPosition = selectedSeat ? positionByCode.get(selectedSeat.code) : undefined;

  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 380, damping: 32 }}>
      <section className="panel seating-plan-panel" aria-labelledby="seating-plan-title">
        <div className="seating-plan-heading"><div><span className="eyebrow">PELAN TEMPAT DUDUK DEWAN RAKYAT</span><h2 id="seating-plan-title">Kedudukan dalam dewan</h2><p>Disusun semula daripada pelan rasmi bertarikh 13 Julai 2026. Pilih satu titik untuk melihat wakil dan keputusan PRU-15.</p></div><div className="seating-plan-controls" aria-label="Lapisan identiti"><button className={view === "current" ? "is-active" : ""} aria-pressed={view === "current"} onClick={() => setView("current")}>Semasa</button><button className={view === "election" ? "is-active" : ""} aria-pressed={view === "election"} onClick={() => setView("election")}>PRU-15</button></div></div>
        <div className="seating-plan-layout">
          <div className="seating-map-wrap">
            <div className="seating-map" role="group" aria-label={`Pelan ${seating.mappedSeatCount} kerusi Parlimen yang dipetakan daripada PDF`}>
              <svg className="seating-chamber" viewBox={`0 0 ${seating.viewBox.width} ${seating.viewBox.height}`} aria-hidden="true">
                <path d="M130 770V545C72 472 66 318 116 192C163 75 265 28 395 28H795C925 28 1027 75 1074 192C1124 318 1118 472 1060 545V770"/>
                <path d="M130 545H488L540 430H650L702 545H1060M488 545V780M702 545V780M540 430L404 226M650 430L786 226"/>
                <rect x="552" y="635" width="86" height="38" rx="8"/>
                <rect x="532" y="690" width="126" height="44" rx="8"/>
                <text x="595" y="660">BENTARA</text><text x="595" y="718">SPEAKER</text>
              </svg>
              {seating.positions.map((position: SeatingPosition) => {
                const seat = seatByCode.get(position.seatCode);
                if (!seat) return null;
                const selected = seat.code === selectedCode;
                const visible = matchesFilters(seat);
                const status = currentStatus(seat);
                return <motion.button
                  key={seat.code}
                  className={`seating-dot ${selected ? "is-selected" : ""} status-${status}`}
                  style={{ left: `${(position.x / seating.viewBox.width) * 100}%`, top: `${(position.y / seating.viewBox.height) * 100}%`, "--seat-color": allianceColor(identityAlliance(seat), data.alliances) } as React.CSSProperties}
                  aria-label={`${seat.code} ${seat.name}, ${seat.winner.name}, ${identityAlliance(seat)}`}
                  aria-pressed={selected}
                  animate={{ opacity: visible ? 1 : 0.12, scale: selected ? 1.35 : 1 }}
                  whileHover={{ scale: 1.7 }}
                  whileFocus={{ scale: 1.7 }}
                  onMouseEnter={() => setHoveredCode(seat.code)}
                  onMouseLeave={() => setHoveredCode(null)}
                  onFocus={() => setHoveredCode(seat.code)}
                  onBlur={() => setHoveredCode(null)}
                  onClick={() => setSelectedCode(seat.code)}
                >{selected && <motion.span layoutId="seating-selection-ring"/>}</motion.button>;
              })}
              <AnimatePresence initial={false}>{hoveredSeat && hoveredPosition && <motion.div className="seating-hover-label" key={hoveredSeat.code} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} style={{ left: `${(hoveredPosition.x / seating.viewBox.width) * 100}%`, top: `${(hoveredPosition.y / seating.viewBox.height) * 100}%` }}><strong>{hoveredSeat.code} {hoveredSeat.name}</strong><span>{hoveredSeat.winner.name}</span></motion.div>}</AnimatePresence>
            </div>
            <div className="seating-legend"><span className="seating-legend-label">{view === "current" ? "GABUNGAN SEMASA" : "GABUNGAN PRU-15"}</span>{alliances.map((alliance) => <span key={alliance}><i style={{ background: allianceColor(alliance, data.alliances) }}/><AllianceLogo name={alliance} data={data}/></span>)}</div>
          </div>
          {selectedSeat && <AnimatePresence mode="wait" initial={false}><motion.article className="seating-selection-detail" key={selectedSeat.code} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}><div className="seating-selection-top"><span>{selectedSeat.state}</span><strong>{selectedSeat.code}</strong></div><h3>{selectedSeat.name}</h3><p>{selectedSeat.winner.name}</p><div className="seating-identity-row"><span>PRU-15</span><strong><PartyLogo name={selectedSeat.winner.party}/><AllianceLogo name={selectedSeat.winner.alliance} data={data}/></strong></div><div className="seating-identity-row is-current"><span>SEMASA</span><strong>{currentStatus(selectedSeat) === "vacant" ? "KERUSI KOSONG" : <><PartyLogo name={activeParty}/><AllianceLogo name={activeAlliance} data={data}/></>}</strong></div><dl><div><dt>Majoriti PRU-15</dt><dd>{formatNumber(selectedSeat.marginVotes)}</dd></div><div><dt>Bahagian undi</dt><dd>{formatPct(selectedSeat.winner.share, 2)}</dd></div><div><dt>Status kerusi</dt><dd>{currentStatus(selectedSeat) === "active" ? "Aktif" : currentStatus(selectedSeat) === "vacant" ? "Kosong" : "Digantung"}</dd></div><div><dt>Pemetaan PDF</dt><dd>{selectedPosition?.sourceConstituency ?? "Tiada label"}</dd></div></dl><Link to={`${PARLIAMENT_BASE}/${toSlug(selectedSeat.name)}`}>Lihat keputusan penuh <Icon name="arrow" size={16}/></Link></motion.article></AnimatePresence>}
        </div>
        {unmappedSeats.length > 0 && <div className="seating-source-note"><Icon name="info" size={17}/><div><strong>{seating.mappedSeatCount} daripada {data.seats.length} kerusi mempunyai label kedudukan dalam PDF.</strong><span>{unmappedSeats.map((seat, index) => <span key={seat.code}>{index > 0 && " · "}<button onClick={() => setSelectedCode(seat.code)}>{seat.code} {seat.name}</button></span>)} tidak berlabel dalam sumber, tetapi maklumat PRU-15 masih boleh dipilih di sini.</span></div></div>}
      </section>
    </MotionConfig>
  );
}

function ParliamentIndexPage({ data, seating, search, setSearch }: { data: ElectionData; seating: SeatingData; search: string; setSearch: (value: string) => void }) {
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

function ParliamentPage({ data }: { data: ElectionData }) {
  const { parliamentName = "" } = useParams();
  const seat = data.seats.find((item) => toSlug(item.name) === parliamentName);
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
      <nav className="adjacent-seats" aria-label="Kerusi bersebelahan">{previous ? <Link to={`${PARLIAMENT_BASE}/${toSlug(previous.name)}`}><span>← SEBELUMNYA</span><strong>{previous.code} {previous.name}</strong></Link> : <i/>}{next && <Link to={`${PARLIAMENT_BASE}/${toSlug(next.name)}`}><span>SETERUSNYA →</span><strong>{next.code} {next.name}</strong></Link>}</nav>
    </>
  );
}

type ChangeDraft = {
  seatCode: string;
  effectiveDate: string;
  status: SeatStatus;
  alliance: string;
  party: string;
  reason: string;
  sourceUrl: string;
};

const emptyDraft = (): ChangeDraft => ({ seatCode: "", effectiveDate: new Date().toISOString().slice(0, 10), status: "active", alliance: "", party: "", reason: "", sourceUrl: "" });

function SettingsTabs() {
  return (
    <nav className="settings-tabs" aria-label="Bahagian pengurusan data">
      <NavLink to="/settings/data" end>Komposisi Parlimen</NavLink>
      <NavLink to="/settings/data/keahlian">Keahlian semasa</NavLink>
      <NavLink to="/settings/data/calon">Data calon</NavLink>
      <NavLink to="/settings/data/parti">Parti</NavLink>
      <NavLink to="/settings/data/gabungan">Gabungan</NavLink>
    </nav>
  );
}

function SettingsDataPage({ data, changes, setChanges }: { data: ElectionData; changes: DataChange[]; setChanges: React.Dispatch<React.SetStateAction<DataChange[]>> }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ChangeDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const todayDate = new Date().toISOString().slice(0, 10);
  const changedSeatCodes = new Set(changes.filter((change) => change.effectiveDate <= todayDate).map((change) => change.seatCode));
  const changedSeats = data.seats.filter((seat) => changedSeatCodes.has(seat.code));
  const filteredSeats = data.seats.filter((seat) => !query || [seat.code, seat.name, seat.state, seat.winner.name, currentAlliance(seat), currentParty(seat)].some((value) => normalise(value).includes(normalise(query))));
  const sortedChanges = [...changes].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt));

  const chooseSeat = (seat: Seat) => {
    setEditingId(null);
    setDraft({ seatCode: seat.code, effectiveDate: new Date().toISOString().slice(0, 10), status: currentStatus(seat), alliance: currentStatus(seat) === "vacant" ? seat.winner.alliance : currentAlliance(seat), party: currentStatus(seat) === "vacant" ? seat.winner.party : currentParty(seat), reason: "", sourceUrl: "" });
    setError("");
    document.getElementById("change-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editChange = (change: DataChange) => {
    setEditingId(change.id);
    setDraft({ seatCode: change.seatCode, effectiveDate: change.effectiveDate, status: change.status, alliance: change.alliance, party: change.party, reason: change.reason, sourceUrl: change.sourceUrl ?? "" });
    setError("");
    document.getElementById("change-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveChange = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const seat = data.seats.find((item) => item.code === draft.seatCode);
    if (!seat || !draft.effectiveDate || !draft.reason.trim()) return setError("Pilih kerusi, tarikh kuat kuasa dan masukkan sebab perubahan.");
    const now = new Date().toISOString();
    const record: DataChange = { id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `change-${Date.now()}`), seatCode: draft.seatCode, effectiveDate: draft.effectiveDate, status: draft.status, alliance: draft.alliance.trim(), party: draft.party.trim(), reason: draft.reason.trim(), sourceUrl: draft.sourceUrl.trim() || undefined, createdAt: editingId ? changes.find((item) => item.id === editingId)?.createdAt ?? now : now };
    setChanges((current) => editingId ? current.map((item) => item.id === editingId ? record : item) : [...current, record]);
    setNotice(editingId ? "Perubahan berjaya dikemas kini." : "Perubahan berjaya direkodkan.");
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const deleteChange = (change: DataChange) => {
    if (!window.confirm(`Padam perubahan ${change.seatCode} bertarikh ${change.effectiveDate}?`)) return;
    setChanges((current) => current.filter((item) => item.id !== change.id));
    setNotice("Perubahan dipadam dan jumlah kerusi dikira semula.");
  };

  const exportChanges = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), changes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `politik-data-changes-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const importChanges = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseChangeFile(JSON.parse(await file.text()));
      const seatCodes = new Set(data.seats.map((seat) => seat.code));
      const unknown = imported.find((change) => !seatCodes.has(change.seatCode));
      if (unknown) throw new Error(`Kod kerusi ${unknown.seatCode} tidak wujud dalam data PRU-15.`);
      if (!window.confirm(`Gantikan ${changes.length} rekod semasa dengan ${imported.length} rekod daripada fail ini?`)) return;
      setChanges(imported);
      setNotice(`${imported.length} perubahan berjaya diimport.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fail perubahan tidak sah.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <PageTitle title="Tetapan data"/>
      <SettingsTabs/>
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA</span><h1>Urus status kerusi.</h1><p>Rekod kerusi aktif, kosong atau digantung. Perubahan parti wakil rakyat diurus berasingan dalam Keahlian semasa.</p></div><div className="settings-actions"><button onClick={exportChanges}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importChanges}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>KERUSI KESELURUHAN</span><strong>{data.seats.length}</strong></article><article><span>KERUSI DIKEMAS KINI</span><strong>{changedSeats.length}</strong></article><article><span>REKOD SEJARAH</span><strong>{changes.length}</strong></article><article><span>KERUSI KOSONG</span><strong>{data.seats.filter((seat) => currentStatus(seat) === "vacant").length}</strong></article></section>
      <section className="settings-layout">
        <article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">STATUS KERUSI</span><h2>Pilih kerusi untuk dikemas kini</h2></div><span className="route-count">{filteredSeats.length} kerusi</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kod, kerusi, negeri atau Ahli Parlimen"/></label><div className="settings-seat-list">{filteredSeats.slice(0, 60).map((seat) => <button key={seat.code} className={changedSeatCodes.has(seat.code) ? "is-changed" : ""} onClick={() => chooseSeat(seat)}><div><span>{seat.code} · {seat.state}</span><strong>{seat.name}</strong><small>{seat.winner.name}</small></div><div><span className={`status-chip ${currentStatus(seat) === "active" ? "is-active" : ""}`}>{currentStatus(seat) === "active" ? "Aktif" : currentStatus(seat) === "vacant" ? "Kosong" : "Digantung"}</span></div><Icon name="arrow" size={16}/></button>)}</div>{filteredSeats.length > 60 && <p className="settings-list-note">Paparan dihadkan kepada 60 rekod. Gunakan carian untuk mencari kerusi lain.</p>}</article>
        <aside id="change-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{editingId ? "EDIT STATUS" : "STATUS BAHARU"}</span><h2>{draft.seatCode ? `${draft.seatCode} ${data.seats.find((seat) => seat.code === draft.seatCode)?.name}` : "Pilih kerusi"}</h2></div></div>{draft.seatCode ? <form onSubmit={saveChange}><label><span>Tarikh kuat kuasa</span><input type="date" value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}/></label><label><span>Status kerusi</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as SeatStatus })}><option value="active">Aktif</option><option value="vacant">Kosong</option><option value="suspended">Digantung</option></select></label><label><span>Sebab perubahan</span><textarea rows={4} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Contoh: Kerusi dikosongkan atau Ahli Parlimen digantung"/></label><label><span>URL sumber (pilihan)</span><input type="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…"/></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={() => { setDraft(emptyDraft()); setEditingId(null); }}>Batal</button><button className="primary" type="submit">{editingId ? "Simpan status" : "Rekod status"}</button></div></form> : <div className="editor-empty"><Icon name="database" size={30}/><p>Pilih satu kerusi untuk merekodkan status semasanya.</p></div>}</aside>
      </section>
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Sejarah perubahan</h2></div>{changes.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm("Padam semua perubahan dan kembali kepada komposisi PRU-15?")) { setChanges([]); setNotice("Semua perubahan dipadam."); } }}>Padam semua</button>}</div>{sortedChanges.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>KERUSI</th><th>STATUS / GABUNGAN</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedChanges.map((change) => { const seat = data.seats.find((item) => item.code === change.seatCode); return <tr key={change.id}><td>{change.effectiveDate}</td><td><strong>{change.seatCode} {seat?.name}</strong><small>{seat?.winner.name}</small></td><td><strong>{change.status === "vacant" ? "KERUSI KOSONG" : <AllianceLogo name={change.alliance} data={data}/>}</strong>{change.party && <small><PartyLogo name={change.party}/></small>}</td><td>{change.reason}</td><td>{change.sourceUrl ? <a href={change.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editChange(change)}>Edit</button><button className="delete" onClick={() => deleteChange(change)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada perubahan. Komposisi semasa masih sama dengan keputusan PRU-15.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan perubahan</strong><p>Perubahan disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/changes.json</code> untuk berkongsi perubahan dalam deployment.</p></div></aside>
    </>
  );
}

type AffiliationDraft = {
  seatCode: string;
  effectiveDate: string;
  status: AffiliationStatus;
  party: string;
  alliance: string;
  reason: string;
  sourceUrl: string;
};

const emptyAffiliationDraft = (): AffiliationDraft => ({
  seatCode: "",
  effectiveDate: new Date().toISOString().slice(0, 10),
  status: "party",
  party: "",
  alliance: "",
  reason: "",
  sourceUrl: "",
});

function SettingsAffiliationPage({ data, affiliations, setAffiliations, partyCatalog, allianceCatalog }: {
  data: ElectionData;
  affiliations: AffiliationEvent[];
  setAffiliations: React.Dispatch<React.SetStateAction<AffiliationEvent[]>>;
  partyCatalog: PartyCatalogItem[];
  allianceCatalog: AllianceCatalogItem[];
}) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<AffiliationDraft>(emptyAffiliationDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const todayDate = new Date().toISOString().slice(0, 10);
  const currentEvents = affiliations.filter((event) => event.effectiveDate <= todayDate);
  const changedSeatCodes = new Set(currentEvents.map((event) => event.seatCode));
  const independentSeatCodes = new Set(currentEvents.filter((event) => event.status === "independent").map((event) => event.seatCode));
  const partyOptions = useMemo(() => partyCatalog.filter((item) => item.active).map((item) => item.name).sort(), [partyCatalog]);
  const allianceOptions = useMemo(() => allianceCatalog.filter((item) => item.active).map((item) => item.name).sort(), [allianceCatalog]);
  const filteredSeats = data.seats.filter((seat) => !query || [seat.code, seat.name, seat.state, seat.winner.name, seat.winner.party, currentParty(seat), currentAlliance(seat)].some((value) => normalise(value).includes(normalise(query))));
  const sortedEvents = [...affiliations].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt));
  const matchCatalog = <T extends { id: string; sourceName: string; aliases: string[]; name: string }>(value: string, items: T[]) => items.find((item) => [item.name, item.sourceName, ...item.aliases].some((name) => normalise(name) === normalise(value)));

  const chooseSeat = (seat: Seat) => {
    setEditingId(null);
    setDraft({ seatCode: seat.code, effectiveDate: todayDate, status: seat.current?.affiliation?.status ?? "party", party: currentParty(seat) === "—" ? seat.winner.party : currentParty(seat), alliance: currentAlliance(seat) === VACANT_ALLIANCE ? seat.winner.alliance : currentAlliance(seat), reason: "", sourceUrl: "" });
    setError("");
    document.getElementById("affiliation-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editEvent = (event: AffiliationEvent) => {
    setEditingId(event.id);
    setDraft({ seatCode: event.seatCode, effectiveDate: event.effectiveDate, status: event.status, party: partyCatalog.find((item) => item.id === event.partyId)?.name ?? event.partyName, alliance: allianceCatalog.find((item) => item.id === event.allianceId)?.name ?? event.allianceName, reason: event.reason, sourceUrl: event.sourceUrl ?? "" });
    setError("");
    document.getElementById("affiliation-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectParty = (party: string) => {
    const catalogParty = matchCatalog(party, partyCatalog);
    const alliance = catalogParty ? resolveCatalogValue(catalogParty.alliance, allianceCatalog) : draft.alliance;
    setDraft((current) => ({ ...current, party, alliance }));
  };

  const saveEvent = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const seat = data.seats.find((item) => item.code === draft.seatCode);
    if (!seat || !draft.effectiveDate || !draft.reason.trim()) return setError("Pilih wakil rakyat, tarikh kuat kuasa dan masukkan sebab perubahan.");
    if (draft.status === "party" && (!draft.party.trim() || !draft.alliance.trim())) return setError("Parti dan gabungan semasa diperlukan.");
    const party = draft.status === "party" ? matchCatalog(draft.party, partyCatalog) : undefined;
    const alliance = draft.status === "party" ? matchCatalog(draft.alliance, allianceCatalog) : undefined;
    if (draft.status === "party" && (!party || !alliance)) return setError("Pilih parti dan gabungan daripada katalog yang tersedia.");
    const now = new Date().toISOString();
    const record: AffiliationEvent = {
      id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `affiliation-${Date.now()}`),
      personId: personIdForSeat(seat.code),
      seatCode: seat.code,
      effectiveDate: draft.effectiveDate,
      status: draft.status,
      partyId: party?.id ?? null,
      partyName: party?.name ?? INDEPENDENT_PARTY,
      allianceId: alliance?.id ?? null,
      allianceName: alliance?.name ?? INDEPENDENT_ALLIANCE,
      reason: draft.reason.trim(),
      sourceUrl: draft.sourceUrl.trim() || undefined,
      createdAt: editingId ? affiliations.find((item) => item.id === editingId)?.createdAt ?? now : now,
    };
    setAffiliations((items) => editingId ? items.map((item) => item.id === editingId ? record : item) : [...items, record]);
    setNotice(editingId ? "Rekod keahlian berjaya dikemas kini." : "Perubahan keahlian berjaya direkodkan.");
    setEditingId(null);
    setDraft(emptyAffiliationDraft());
  };

  const deleteEvent = (event: AffiliationEvent) => {
    if (!window.confirm(`Padam rekod keahlian ${event.seatCode} bertarikh ${event.effectiveDate}?`)) return;
    setAffiliations((items) => items.filter((item) => item.id !== event.id));
    setNotice("Rekod keahlian dipadam.");
  };

  const importEvents = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseAffiliationFile(JSON.parse(await file.text()));
      const seatCodes = new Set(data.seats.map((seat) => seat.code));
      const unknown = imported.find((item) => !seatCodes.has(item.seatCode));
      if (unknown) throw new Error(`Kod kerusi ${unknown.seatCode} tidak wujud dalam data PRU-15.`);
      if (!window.confirm(`Gantikan ${affiliations.length} rekod keahlian dengan ${imported.length} rekod daripada fail ini?`)) return;
      setAffiliations(imported);
      setEditingId(null);
      setNotice(`${imported.length} rekod keahlian berjaya diimport.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fail keahlian tidak sah.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <PageTitle title="Tetapan keahlian semasa"/><SettingsTabs/>
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / KEAHLIAN</span><h1>Urus keahlian semasa.</h1><p>Keputusan parti semasa PRU-15 kekal sebagai rekod sejarah. Di sini, rekod parti dan gabungan yang disertai wakil rakyat sekarang.</p></div><div className="settings-actions"><button onClick={() => downloadJson(`politik-affiliations-${todayDate}.json`, { version: 1, exportedAt: new Date().toISOString(), affiliations })}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importEvents}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>WAKIL PRU-15</span><strong>{data.seats.length}</strong></article><article><span>KEAHLIAN DIKEMAS KINI</span><strong>{changedSeatCodes.size}</strong></article><article><span>BEBAS SEMASA</span><strong>{independentSeatCodes.size}</strong></article><article><span>REKOD SEJARAH</span><strong>{affiliations.length}</strong></article></section>
      <section className="settings-layout"><article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">WAKIL RAKYAT</span><h2>Pilih wakil untuk dikemas kini</h2></div><span className="route-count">{filteredSeats.length} wakil</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kerusi, parti atau gabungan"/></label><div className="settings-seat-list">{filteredSeats.slice(0, 60).map((seat) => <button key={seat.code} className={changedSeatCodes.has(seat.code) ? "is-changed" : ""} onClick={() => chooseSeat(seat)}><div><span>{seat.code} · {seat.name}</span><strong>{seat.winner.name}</strong><small>PRU-15: {seat.winner.party}</small></div><div className="settings-current-identity"><PartyLogo name={currentParty(seat)}/><AllianceLogo name={currentAlliance(seat)} data={data}/>{changedSeatCodes.has(seat.code) && <small>Semasa</small>}</div><Icon name="arrow" size={16}/></button>)}</div>{filteredSeats.length > 60 && <p className="settings-list-note">Paparan dihadkan kepada 60 rekod. Gunakan carian untuk mencari wakil lain.</p>}</article>
        <aside id="affiliation-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{editingId ? "EDIT KEAHLIAN" : "PERUBAHAN KEAHLIAN"}</span><h2>{draft.seatCode ? data.seats.find((seat) => seat.code === draft.seatCode)?.winner.name : "Pilih wakil"}</h2></div></div>{draft.seatCode ? <form onSubmit={saveEvent}><div className="locked-data"><Icon name="vote" size={17}/><div><strong>Identiti PRU-15 dikunci</strong><span>{data.seats.find((seat) => seat.code === draft.seatCode)?.winner.party} · {data.seats.find((seat) => seat.code === draft.seatCode)?.winner.alliance}</span></div></div><label><span>Tarikh kuat kuasa</span><input type="date" value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}/></label><label><span>Status keahlian</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AffiliationStatus, party: event.target.value === "independent" ? INDEPENDENT_PARTY : draft.party, alliance: event.target.value === "independent" ? INDEPENDENT_ALLIANCE : draft.alliance })}><option value="party">Ahli parti</option><option value="independent">Bebas / tanpa parti</option></select></label><SearchCombobox label="Parti semasa" value={draft.party} options={partyOptions} allowCustom={false} disabled={draft.status === "independent"} onChange={selectParty}/><SearchCombobox label="Gabungan semasa" value={draft.alliance} options={allianceOptions} allowCustom={false} disabled={draft.status === "independent"} onChange={(alliance) => setDraft({ ...draft, alliance })}/><label><span>Sebab perubahan</span><textarea rows={4} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Contoh: Keluar parti dan menjadi Ahli Parlimen Bebas"/></label><label><span>URL sumber (pilihan)</span><input type="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…"/></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={() => { setDraft(emptyAffiliationDraft()); setEditingId(null); }}>Batal</button><button className="primary" type="submit">{editingId ? "Simpan keahlian" : "Rekod keahlian"}</button></div></form> : <div className="editor-empty"><Icon name="people" size={30}/><p>Pilih wakil rakyat untuk merekodkan parti dan gabungan semasanya.</p></div>}</aside>
      </section>
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Sejarah keahlian</h2></div>{affiliations.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm("Padam semua rekod keahlian semasa?")) setAffiliations([]); }}>Padam semua</button>}</div>{sortedEvents.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>WAKIL / KERUSI</th><th>KEAHLIAN SEMASA</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedEvents.map((event) => { const seat = data.seats.find((item) => item.code === event.seatCode); const party = partyCatalog.find((item) => item.id === event.partyId)?.name ?? event.partyName; const alliance = allianceCatalog.find((item) => item.id === event.allianceId)?.name ?? event.allianceName; return <tr key={event.id}><td>{event.effectiveDate}</td><td><strong>{seat?.winner.name}</strong><small>{event.seatCode} {seat?.name}</small></td><td><span className="history-identities"><PartyLogo name={party}/><AllianceLogo name={alliance} data={data}/></span></td><td>{event.reason}</td><td>{event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editEvent(event)}>Edit</button><button className="delete" onClick={() => deleteEvent(event)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada perubahan keahlian. Kedudukan semasa masih sama dengan rekod PRU-15.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Dua lapisan data</strong><p>Rekod ini disimpan berasingan daripada keputusan PRU-15. Eksport JSON dan gantikan <code>public/data/affiliations.json</code> untuk menerbitkannya.</p></div></aside>
    </>
  );
}

type CandidateRecord = {
  seat: Seat;
  candidate: Candidate;
  candidateIndex: number;
};

type CandidateDraft = {
  seatCode: string;
  candidateIndex: number;
  effectiveDate: string;
  name: string;
  alliance: string;
  party: string;
  gender: string;
  ethnicity: string;
  reason: string;
  sourceUrl: string;
};

const emptyCandidateDraft = (): CandidateDraft => ({ seatCode: "", candidateIndex: -1, effectiveDate: new Date().toISOString().slice(0, 10), name: "", alliance: "", party: "", gender: "", ethnicity: "", reason: "", sourceUrl: "" });

function SettingsCandidatePage({ data, candidateChanges, setCandidateChanges, partyCatalog, allianceCatalog }: { data: ElectionData; candidateChanges: CandidateChange[]; setCandidateChanges: React.Dispatch<React.SetStateAction<CandidateChange[]>>; partyCatalog: PartyCatalogItem[]; allianceCatalog: AllianceCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CandidateDraft>(emptyCandidateDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const candidateRecords = useMemo<CandidateRecord[]>(() => data.seats.flatMap((seat) => seat.candidates.map((candidate, candidateIndex) => ({ seat, candidate, candidateIndex }))), [data]);
  const todayDate = new Date().toISOString().slice(0, 10);
  const changedCandidateKeys = new Set(candidateChanges.filter((change) => change.effectiveDate <= todayDate).map((change) => `${change.seatCode}:${change.candidateIndex}`));
  const filteredCandidates = candidateRecords.filter(({ seat, candidate }) => !query || [seat.code, seat.name, seat.state, candidate.name, candidate.alliance, candidate.party].some((value) => normalise(value).includes(normalise(query))));
  const sortedChanges = [...candidateChanges].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt));
  const winnerChangeCount = [...changedCandidateKeys].filter((key) => key.endsWith(":0")).length;
  const partyCount = new Set(candidateRecords.map(({ candidate }) => candidate.party).filter(Boolean)).size;
  const allianceOptions = useMemo(() => allianceCatalog.filter((item) => item.active).map((item) => item.name).sort(), [allianceCatalog]);
  const partyOptions = useMemo(() => partyCatalog.filter((item) => item.active).map((item) => item.name).sort(), [partyCatalog]);
  const genderOptions = useMemo(() => [...new Set([...data.seats.map((seat) => seat.winner.gender), ...candidateChanges.map((change) => change.gender)].filter((value): value is string => Boolean(value)))].sort(), [data, candidateChanges]);
  const raceOptions = useMemo(() => [...new Set([...data.seats.map((seat) => seat.winner.ethnicity), ...candidateChanges.map((change) => change.ethnicity)].filter((value): value is string => Boolean(value)))].sort(), [data, candidateChanges]);

  const chooseCandidate = ({ seat, candidate, candidateIndex }: CandidateRecord) => {
    setEditingId(null);
    setDraft({
      seatCode: seat.code,
      candidateIndex,
      effectiveDate: data.metadata.electionDate,
      name: candidate.name,
      alliance: candidate.alliance,
      party: candidate.party,
      gender: candidateIndex === 0 ? seat.winner.gender : "",
      ethnicity: candidateIndex === 0 ? seat.winner.ethnicity : "",
      reason: "",
      sourceUrl: "",
    });
    setError("");
    document.getElementById("candidate-change-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const editChange = (change: CandidateChange) => {
    setEditingId(change.id);
    setDraft({ seatCode: change.seatCode, candidateIndex: change.candidateIndex, effectiveDate: change.effectiveDate, name: change.name, alliance: change.alliance, party: change.party, gender: change.gender ?? "", ethnicity: change.ethnicity ?? "", reason: change.reason, sourceUrl: change.sourceUrl ?? "" });
    setError("");
    document.getElementById("candidate-change-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveChange = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const seat = data.seats.find((item) => item.code === draft.seatCode);
    const candidate = seat?.candidates[draft.candidateIndex];
    if (!seat || !candidate || !draft.effectiveDate || !draft.name.trim() || !draft.alliance.trim() || !draft.party.trim() || !draft.reason.trim()) {
      return setError("Nama, gabungan, parti, tarikh kuat kuasa dan sebab perubahan diperlukan.");
    }
    const changesElectionAffiliation = normalise(draft.alliance) !== normalise(candidate.alliance) || normalise(draft.party) !== normalise(candidate.party);
    if (changesElectionAffiliation && draft.effectiveDate > data.metadata.electionDate) {
      return setError("Perubahan parti selepas PRU-15 bukan pembetulan calon. Rekodkannya di Keahlian semasa; halaman ini hanya membetulkan identiti pada hari PRU-15.");
    }
    const now = new Date().toISOString();
    const record: CandidateChange = {
      id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `candidate-change-${Date.now()}`),
      seatCode: draft.seatCode,
      candidateIndex: draft.candidateIndex,
      effectiveDate: draft.effectiveDate,
      name: draft.name.trim(),
      alliance: draft.alliance.trim(),
      party: draft.party.trim(),
      gender: draft.candidateIndex === 0 ? draft.gender.trim() || undefined : undefined,
      ethnicity: draft.candidateIndex === 0 ? draft.ethnicity.trim() || undefined : undefined,
      reason: draft.reason.trim(),
      sourceUrl: draft.sourceUrl.trim() || undefined,
      createdAt: editingId ? candidateChanges.find((item) => item.id === editingId)?.createdAt ?? now : now,
    };
    setCandidateChanges((current) => editingId ? current.map((item) => item.id === editingId ? record : item) : [...current, record]);
    setNotice(editingId ? "Pembetulan calon berjaya dikemas kini." : "Pembetulan calon berjaya direkodkan.");
    setEditingId(null);
    setDraft(emptyCandidateDraft());
  };

  const deleteChange = (change: CandidateChange) => {
    if (!window.confirm(`Padam pembetulan calon ${change.name} di ${change.seatCode}?`)) return;
    setCandidateChanges((current) => current.filter((item) => item.id !== change.id));
    setNotice("Pembetulan calon dipadam dan paparan awam dipulihkan.");
  };

  const exportChanges = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), candidateChanges }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `politik-candidate-changes-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importChanges = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseCandidateChangeFile(JSON.parse(await file.text()));
      const invalid = imported.find((change) => !data.seats.find((seat) => seat.code === change.seatCode)?.candidates[change.candidateIndex]);
      if (invalid) throw new Error(`Calon #${invalid.candidateIndex + 1} bagi kerusi ${invalid.seatCode} tidak wujud dalam data PRU-15.`);
      const membershipChange = imported.find((change) => {
        const candidate = data.seats.find((seat) => seat.code === change.seatCode)?.candidates[change.candidateIndex];
        return candidate && change.effectiveDate > data.metadata.electionDate && (normalise(change.party) !== normalise(candidate.party) || normalise(change.alliance) !== normalise(candidate.alliance));
      });
      if (membershipChange) throw new Error(`${membershipChange.seatCode}: perubahan keahlian selepas PRU-15 mesti diimport melalui halaman Keahlian semasa.`);
      if (!window.confirm(`Gantikan ${candidateChanges.length} rekod semasa dengan ${imported.length} rekod daripada fail ini?`)) return;
      setCandidateChanges(imported);
      setNotice(`${imported.length} pembetulan calon berjaya diimport.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fail perubahan calon tidak sah.");
    } finally {
      event.target.value = "";
    }
  };

  const selectedSeat = data.seats.find((seat) => seat.code === draft.seatCode);
  const selectedCandidate = selectedSeat?.candidates[draft.candidateIndex];

  return (
    <>
      <PageTitle title="Tetapan data calon"/>
      <SettingsTabs/>
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / CALON</span><h1>Betulkan rekod PRU-15.</h1><p>Halaman ini hanya membetulkan snapshot calon pada hari pengundian. Pertukaran parti selepas PRU-15 mesti direkodkan dalam Keahlian semasa.</p></div><div className="settings-actions"><Link to="/settings/data/keahlian">Keahlian semasa</Link><button onClick={exportChanges}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importChanges}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>CALON KESELURUHAN</span><strong>{candidateRecords.length}</strong></article><article><span>CALON DIKEMAS KINI</span><strong>{changedCandidateKeys.size}</strong></article><article><span>PARTI DIREKODKAN</span><strong>{partyCount}</strong></article><article><span>PEMENANG DIKEMAS KINI</span><strong>{winnerChangeCount}</strong></article></section>
      <section className="settings-layout">
        <article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">DIREKTORI CALON</span><h2>Pilih calon untuk dibetulkan</h2></div><span className="route-count">{filteredCandidates.length} calon</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari calon, kerusi, negeri atau parti"/></label><div className="settings-seat-list candidate-settings-list">{filteredCandidates.slice(0, 60).map((record) => { const key = `${record.seat.code}:${record.candidateIndex}`; return <button key={key} className={changedCandidateKeys.has(key) ? "is-changed" : ""} onClick={() => chooseCandidate(record)}><div><span>{record.seat.code} · {record.seat.name}</span><strong>{record.candidate.name}</strong><small><PartyLogo name={record.candidate.party}/></small></div><div><AlliancePill name={record.candidate.alliance} data={data}/><small>{record.candidateIndex === 0 ? "Pemenang" : `Calon #${record.candidateIndex + 1}`}</small></div><Icon name="arrow" size={16}/></button>; })}</div>{filteredCandidates.length > 60 && <p className="settings-list-note">Paparan dihadkan kepada 60 rekod. Gunakan carian untuk mencari calon lain.</p>}</article>
        <aside id="candidate-change-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{editingId ? "EDIT PEMBETULAN" : "PEMBETULAN BAHARU"}</span><h2>{selectedCandidate ? selectedCandidate.name : "Pilih calon"}</h2></div></div>{selectedCandidate ? <form onSubmit={saveChange}><div className="locked-data"><Icon name="info" size={17}/><div><strong>Keputusan undi dikunci</strong><span>{formatNumber(selectedCandidate.votes)} undi · {formatPct(selectedCandidate.share, 2)}</span></div></div><div className="membership-routing-note"><Icon name="people" size={17}/><div><strong>Adakah ini pertukaran parti selepas PRU-15?</strong><Link to="/settings/data/keahlian">Rekod dalam Keahlian semasa →</Link></div></div><label><span>Tarikh rujukan PRU-15</span><input type="date" max={data.metadata.electionDate} value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}/></label><label><span>Nama paparan</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><SearchCombobox label="Gabungan semasa PRU-15" value={draft.alliance} options={allianceOptions} onChange={(alliance) => setDraft({ ...draft, alliance })}/><SearchCombobox label="Parti semasa PRU-15" value={draft.party} options={partyOptions} onChange={(party) => setDraft({ ...draft, party })}/>{draft.candidateIndex === 0 && <div className="editor-field-pair"><SearchCombobox label="Jantina" value={draft.gender} options={genderOptions} onChange={(gender) => setDraft({ ...draft, gender })}/><SearchCombobox label="Bangsa" value={draft.ethnicity} options={raceOptions} onChange={(ethnicity) => setDraft({ ...draft, ethnicity })}/></div>}<label><span>Sebab pembetulan</span><textarea rows={4} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Contoh: Ejaan nama atau identiti dalam sumber PRU-15 perlu dibetulkan"/></label><label><span>URL sumber (pilihan)</span><input type="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…"/></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={() => { setDraft(emptyCandidateDraft()); setEditingId(null); }}>Batal</button><button className="primary" type="submit">{editingId ? "Simpan pembetulan" : "Rekod pembetulan"}</button></div></form> : <div className="editor-empty"><Icon name="people" size={30}/><p>Pilih seorang calon. Nama, gabungan dan parti pada hari PRU-15 boleh dibetulkan; angka undi kekal dikunci.</p></div>}</aside>
      </section>
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL CALON</span><h2>Sejarah pembetulan</h2></div>{candidateChanges.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm("Padam semua pembetulan calon dan kembali kepada data sumber?")) { setCandidateChanges([]); setNotice("Semua pembetulan calon dipadam."); } }}>Padam semua</button>}</div>{sortedChanges.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>CALON / KERUSI</th><th>GABUNGAN / PARTI</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedChanges.map((change) => { const seat = data.seats.find((item) => item.code === change.seatCode); return <tr key={change.id}><td>{change.effectiveDate}</td><td><strong>{change.name}</strong><small>{change.seatCode} {seat?.name} · Calon #{change.candidateIndex + 1}</small></td><td><strong><AllianceLogo name={change.alliance} data={data}/></strong><small><PartyLogo name={change.party}/></small></td><td>{change.reason}</td><td>{change.sourceUrl ? <a href={change.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editChange(change)}>Edit</button><button className="delete" onClick={() => deleteChange(change)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada pembetulan calon. Semua maklumat masih menggunakan data sumber PRU-15.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan pembetulan calon</strong><p>Perubahan disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/candidate-changes.json</code> untuk menerbitkannya kepada semua pengguna.</p></div></aside>
    </>
  );
}

const newRecordId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}`;

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type PartyDraft = { name: string; shortName: string; alliance: string; active: boolean };
const emptyPartyDraft = (alliance = ""): PartyDraft => ({ name: "", shortName: "", alliance, active: true });

function SettingsPartyPage({ data, partyCatalog, setPartyCatalog, allianceCatalog }: { data: ElectionData; partyCatalog: PartyCatalogItem[]; setPartyCatalog: React.Dispatch<React.SetStateAction<PartyCatalogItem[]>>; allianceCatalog: AllianceCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PartyDraft>(() => emptyPartyDraft(allianceCatalog.find((item) => item.active)?.name));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const allianceOptions = allianceCatalog.filter((item) => item.active).map((item) => item.name).sort();
  const usage = useMemo(() => data.seats.flatMap((seat) => seat.candidates).reduce<Record<string, number>>((counts, candidate) => ({ ...counts, [candidate.party]: (counts[candidate.party] ?? 0) + 1 }), {}), [data]);
  const filtered = partyCatalog.filter((item) => !query || [item.name, item.shortName, item.alliance, ...item.aliases].some((value) => normalise(value).includes(normalise(query)))).sort((a, b) => a.name.localeCompare(b.name));
  const selected = editingId ? partyCatalog.find((item) => item.id === editingId) : undefined;

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyPartyDraft(allianceOptions[0]));
    setError("");
    document.getElementById("party-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const selectParty = (item: PartyCatalogItem) => {
    setEditingId(item.id);
    setDraft({ name: item.name, shortName: item.shortName, alliance: resolveCatalogValue(item.alliance, allianceCatalog), active: item.active });
    setError("");
    document.getElementById("party-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveParty = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const name = draft.name.trim();
    const shortName = draft.shortName.trim();
    const alliance = draft.alliance.trim();
    if (!name || !shortName || !alliance) return setError("Nama parti, nama ringkas dan gabungan diperlukan.");
    if (!allianceOptions.includes(alliance)) return setError("Pilih gabungan aktif daripada senarai.");
    if (partyCatalog.some((item) => item.id !== editingId && normalise(item.name) === normalise(name))) return setError("Nama parti ini sudah wujud.");
    const now = new Date().toISOString();
    if (selected) {
      const aliases = selected.name !== name ? [...new Set([...selected.aliases, selected.name])] : selected.aliases;
      setPartyCatalog((items) => items.map((item) => item.id === selected.id ? { ...item, aliases, name, shortName, alliance, active: draft.active, updatedAt: now } : item));
      setNotice("Maklumat parti berjaya dikemas kini.");
    } else {
      const record: PartyCatalogItem = { id: newRecordId("party"), sourceName: name, aliases: [], name, shortName, alliance, active: draft.active, createdAt: now, updatedAt: now };
      setPartyCatalog((items) => [...items, record]);
      setEditingId(record.id);
      setNotice("Parti baharu berjaya ditambah.");
    }
  };

  const importCatalog = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parsePartyCatalogFile(JSON.parse(await file.text()));
      if (!window.confirm(`Gantikan ${partyCatalog.length} rekod parti dengan ${imported.length} rekod daripada fail ini?`)) return;
      setPartyCatalog(imported);
      setEditingId(null);
      setNotice(`${imported.length} parti berjaya diimport.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fail parti tidak sah.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <PageTitle title="Tetapan parti"/><SettingsTabs/>
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / PARTI</span><h1>Urus senarai parti.</h1><p>Selenggara nama, singkatan, gabungan dan status pilihan parti di seluruh dashboard.</p></div><div className="settings-actions"><button onClick={startNew}>Tambah parti</button><button onClick={() => downloadJson(`politik-parties-${new Date().toISOString().slice(0, 10)}.json`, { version: 1, exportedAt: new Date().toISOString(), parties: partyCatalog })}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importCatalog}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>JUMLAH PARTI</span><strong>{partyCatalog.length}</strong></article><article><span>PARTI AKTIF</span><strong>{partyCatalog.filter((item) => item.active).length}</strong></article><article><span>PARTI TIDAK AKTIF</span><strong>{partyCatalog.filter((item) => !item.active).length}</strong></article><article><span>DIGUNAKAN DALAM DATA</span><strong>{Object.keys(usage).length}</strong></article></section>
      <section className="settings-layout reference-layout"><article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">KATALOG PARTI</span><h2>Pilih parti untuk diurus</h2></div><span className="route-count">{filtered.length} parti</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, singkatan atau gabungan"/></label><div className="settings-seat-list reference-list">{filtered.map((item) => <button key={item.id} className={`${editingId === item.id ? "is-selected" : ""} ${!item.active ? "is-inactive" : ""}`} onClick={() => selectParty(item)}><div className="reference-identity"><div><PartyLogo name={item.name} shortName={item.shortName} size="md"/><AllianceLogo name={resolveCatalogValue(item.alliance, allianceCatalog)} data={data}/></div><small>{usage[item.name] ?? 0} pencalonan dalam PRU-15</small></div><div><span className={`status-chip ${item.active ? "is-active" : ""}`}>{item.active ? "Aktif" : "Tidak aktif"}</span></div><Icon name="arrow" size={16}/></button>)}</div></article>
        <aside id="party-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{selected ? "EDIT PARTI" : "PARTI BAHARU"}</span><h2>{selected?.shortName || "Tambah parti"}</h2></div></div><form onSubmit={saveParty}><label><span>Nama parti</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nama rasmi parti"/></label><label><span>Nama ringkas</span><input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} placeholder="Contoh: PKR"/></label><SearchCombobox label="Gabungan" value={draft.alliance} options={allianceOptions} allowCustom={false} onChange={(alliance) => setDraft({ ...draft, alliance })}/><label><span>Status</span><select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">Aktif</option><option value="inactive">Tidak aktif</option></select></label>{selected && <div className="locked-data"><Icon name="info" size={17}/><div><strong>Identiti sumber dikekalkan</strong><span>{selected.sourceName}</span></div></div>}{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={startNew}>Set semula</button><button className="primary" type="submit">{selected ? "Simpan parti" : "Tambah parti"}</button></div></form></aside>
      </section><aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan katalog parti</strong><p>Rekod disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/parties.json</code> untuk menerbitkannya.</p></div></aside>
    </>
  );
}

type AllianceDraft = { name: string; shortName: string; color: string; active: boolean };
const emptyAllianceDraft = (): AllianceDraft => ({ name: "", shortName: "", color: "#557c70", active: true });

function SettingsAlliancePage({ data, allianceCatalog, setAllianceCatalog }: { data: ElectionData; allianceCatalog: AllianceCatalogItem[]; setAllianceCatalog: React.Dispatch<React.SetStateAction<AllianceCatalogItem[]>> }) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AllianceDraft>(emptyAllianceDraft);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const usage = useMemo(() => data.seats.reduce<Record<string, number>>((counts, seat) => ({ ...counts, [currentAlliance(seat)]: (counts[currentAlliance(seat)] ?? 0) + 1 }), {}), [data]);
  const filtered = allianceCatalog.filter((item) => !query || [item.name, item.shortName, ...item.aliases].some((value) => normalise(value).includes(normalise(query)))).sort((a, b) => a.name.localeCompare(b.name));
  const selected = editingId ? allianceCatalog.find((item) => item.id === editingId) : undefined;

  const startNew = () => { setEditingId(null); setDraft(emptyAllianceDraft()); setError(""); document.getElementById("alliance-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const selectAlliance = (item: AllianceCatalogItem) => { setEditingId(item.id); setDraft({ name: item.name, shortName: item.shortName, color: item.color, active: item.active }); setError(""); document.getElementById("alliance-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const saveAlliance = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const name = draft.name.trim();
    const shortName = draft.shortName.trim();
    const color = draft.color.trim();
    if (!name || !shortName || !/^#[0-9a-f]{6}$/i.test(color)) return setError("Nama gabungan, nama ringkas dan warna heksadesimal yang sah diperlukan.");
    if (allianceCatalog.some((item) => item.id !== editingId && normalise(item.name) === normalise(name))) return setError("Nama gabungan ini sudah wujud.");
    const now = new Date().toISOString();
    if (selected) {
      const aliases = selected.name !== name ? [...new Set([...selected.aliases, selected.name])] : selected.aliases;
      setAllianceCatalog((items) => items.map((item) => item.id === selected.id ? { ...item, aliases, name, shortName, color, active: draft.active, updatedAt: now } : item));
      setNotice("Maklumat gabungan berjaya dikemas kini.");
    } else {
      const record: AllianceCatalogItem = { id: newRecordId("alliance"), sourceName: name, aliases: [], name, shortName, color, active: draft.active, createdAt: now, updatedAt: now };
      setAllianceCatalog((items) => [...items, record]);
      setEditingId(record.id);
      setNotice("Gabungan baharu berjaya ditambah.");
    }
  };

  const importCatalog = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = parseAllianceCatalogFile(JSON.parse(await file.text()));
      if (!window.confirm(`Gantikan ${allianceCatalog.length} rekod gabungan dengan ${imported.length} rekod daripada fail ini?`)) return;
      setAllianceCatalog(imported);
      setEditingId(null);
      setNotice(`${imported.length} gabungan berjaya diimport.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Fail gabungan tidak sah.");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <>
      <PageTitle title="Tetapan gabungan"/><SettingsTabs/>
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / GABUNGAN</span><h1>Urus senarai gabungan.</h1><p>Selenggara nama, singkatan, warna dan status gabungan yang digunakan di seluruh dashboard.</p></div><div className="settings-actions"><button onClick={startNew}>Tambah gabungan</button><button onClick={() => downloadJson(`politik-alliances-${new Date().toISOString().slice(0, 10)}.json`, { version: 1, exportedAt: new Date().toISOString(), alliances: allianceCatalog })}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importCatalog}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>JUMLAH GABUNGAN</span><strong>{allianceCatalog.length}</strong></article><article><span>GABUNGAN AKTIF</span><strong>{allianceCatalog.filter((item) => item.active).length}</strong></article><article><span>TIDAK AKTIF</span><strong>{allianceCatalog.filter((item) => !item.active).length}</strong></article><article><span>KERUSI DIPETAKAN</span><strong>{Object.values(usage).reduce((sum, count) => sum + count, 0)}</strong></article></section>
      <section className="settings-layout reference-layout"><article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">KATALOG GABUNGAN</span><h2>Pilih gabungan untuk diurus</h2></div><span className="route-count">{filtered.length} gabungan</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama atau singkatan"/></label><div className="settings-seat-list reference-list alliance-reference-list">{filtered.map((item) => <button key={item.id} className={`${editingId === item.id ? "is-selected" : ""} ${!item.active ? "is-inactive" : ""}`} onClick={() => selectAlliance(item)}><div className="reference-identity"><AllianceLogo name={item.name} data={data} size="md"/><small>{usage[item.name] ?? 0} kerusi semasa</small></div><div><span className={`status-chip ${item.active ? "is-active" : ""}`}>{item.active ? "Aktif" : "Tidak aktif"}</span></div><Icon name="arrow" size={16}/></button>)}</div></article>
        <aside id="alliance-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{selected ? "EDIT GABUNGAN" : "GABUNGAN BAHARU"}</span><h2>{selected?.shortName || "Tambah gabungan"}</h2></div></div><form onSubmit={saveAlliance}><label><span>Nama gabungan</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nama rasmi gabungan"/></label><label><span>Nama ringkas</span><input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} placeholder="Contoh: PH"/></label><label><span>Warna</span><div className="color-field"><input type="color" value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })}/><input value={draft.color} onChange={(event) => setDraft({ ...draft, color: event.target.value })} placeholder="#123c32"/></div></label><label><span>Status</span><select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">Aktif</option><option value="inactive">Tidak aktif</option></select></label>{selected && <div className="locked-data"><Icon name="info" size={17}/><div><strong>Identiti sumber dikekalkan</strong><span>{selected.sourceName}</span></div></div>}{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={startNew}>Set semula</button><button className="primary" type="submit">{selected ? "Simpan gabungan" : "Tambah gabungan"}</button></div></form></aside>
      </section><aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan katalog gabungan</strong><p>Rekod disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/alliances.json</code> untuk menerbitkannya.</p></div></aside>
    </>
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
