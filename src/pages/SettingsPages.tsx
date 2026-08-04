import React, { useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AllianceLogo, AlliancePill, PartyLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { useElection } from "../ElectionContext";
import { ELECTION_EDITIONS } from "../elections";
import {
  currentAlliance,
  currentParty,
  currentStatus,
  INDEPENDENT_ALLIANCE,
  INDEPENDENT_PARTY,
  parseAffiliationFile,
  parseAllianceCatalogFile,
  parseCandidateChangeFile,
  parseChangeFile,
  parsePartyCatalogFile,
  personIdForSeat,
  resolveCatalogValue,
  VACANT_ALLIANCE,
} from "../dataChanges";
import type {
  AffiliationEvent,
  AffiliationStatus,
  AllianceCatalogItem,
  Candidate,
  CandidateChange,
  DataChange,
  ElectionData,
  PartyCatalogItem,
  Seat,
  SeatStatus,
} from "../types";
import { formatNumber, formatPct, formatShortDate, normalise } from "../utils";

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

export function SettingsTabs() {
  const { edition } = useElection();
  const location = useLocation();
  const suffix = `?election=${edition.number}`;
  return (
    <><div className="settings-edition-switcher" aria-label="Pilih dataset pilihan raya"><span>DATASET</span>{ELECTION_EDITIONS.map((item) => <Link key={item.id} className={item.id === edition.id ? "is-active" : ""} to={`${location.pathname}?election=${item.number}`}>{item.shortTitle}</Link>)}</div><nav className="settings-tabs" aria-label="Bahagian pengurusan data">
      <NavLink to={`/settings/data${suffix}`} end>Komposisi Parlimen</NavLink>
      <NavLink to={`/settings/data/keahlian${suffix}`}>Keahlian semasa</NavLink>
      <NavLink to={`/settings/data/calon${suffix}`}>Data calon</NavLink>
      <NavLink to={`/settings/data/parti${suffix}`}>Parti</NavLink>
      <NavLink to={`/settings/data/gabungan${suffix}`}>Gabungan</NavLink>
      <NavLink to={`/settings/data/liputan${suffix}`}>Liputan data</NavLink>
      <NavLink to={`/settings/data/operasi${suffix}`}>Penerbitan & operasi</NavLink>
    </nav></>
  );
}

type EditorialRevisionSummary = {
  id: string;
  election_id: string | null;
  data_kind: string;
  status: "draft" | "reviewed" | "published" | "superseded";
  reason: string;
  source_url?: string | null;
  created_by: string;
  reviewed_by?: string | null;
  published_by?: string | null;
  created_at: string;
};

type PlatformHealth = {
  database: string;
  telemetry: Array<{ kind: string; name: string; samples: number; average: number | null; poor: number }>;
  reconciliation: { release_id: string; status: string; summary: Record<string, unknown>; completed_at: string } | null;
  revisions: Record<string, number>;
};

export function SettingsOperationsPage() {
  const { edition } = useElection();
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [revisions, setRevisions] = useState<EditorialRevisionSummary[]>([]);
  const [token, setToken] = useState(() => sessionStorage.getItem("politik-editorial-token") ?? "");
  const [actor, setActor] = useState(() => sessionStorage.getItem("politik-editorial-actor") ?? "");
  const [dataKind, setDataKind] = useState("changes");
  const [reason, setReason] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [payload, setPayload] = useState("{}");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadHealth = async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("health_unavailable");
      setHealth(await response.json());
    } catch {
      setHealth({ database: "not-configured", telemetry: [], reconciliation: null, revisions: {} });
    }
  };
  const loadRevisions = async () => {
    if (!token) return setRevisions([]);
    const response = await fetch(`/api/editorial?electionId=${edition.id}`, { headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(response.status === 401 ? "Token editorial tidak sah." : "Revisi tidak dapat dimuatkan.");
    const value = await response.json();
    setRevisions(value.revisions ?? []);
  };
  React.useEffect(() => { void loadHealth(); }, []);
  React.useEffect(() => {
    sessionStorage.setItem("politik-editorial-token", token);
    sessionStorage.setItem("politik-editorial-actor", actor);
    if (token) void loadRevisions().catch((reasonValue) => setError(reasonValue.message));
  }, [actor, edition.id, token]);

  const request = async (body: Record<string, unknown>) => {
    setError("");
    const response = await fetch("/api/editorial", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Operasi editorial gagal.");
    await Promise.all([loadRevisions(), loadHealth()]);
    return value;
  };
  const createRevision = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await request({
        electionId: edition.id,
        dataKind,
        reason,
        sourceUrl: sourceUrl || undefined,
        actor,
        payload: JSON.parse(payload),
      });
      setReason("");
      setSourceUrl("");
      setPayload("{}");
      setNotice("Draf revisi dicipta. Semak kandungan sebelum menghantarnya untuk ulasan.");
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "JSON atau permintaan tidak sah.");
    }
  };
  const transition = async (revision: EditorialRevisionSummary, status: string) => {
    try {
      await request({ action: "transition", revisionId: revision.id, status, actor });
      setNotice(`Revisi kini berstatus ${status}.`);
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Peralihan status gagal.");
    }
  };
  const rollback = async (revision: EditorialRevisionSummary) => {
    if (!window.confirm(`Pulihkan read model ${revision.data_kind} kepada revisi ini?`)) return;
    try {
      await request({ action: "rollback", revisionId: revision.id, actor });
      setNotice("Read model dipulihkan kepada revisi dipilih.");
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : "Rollback gagal.");
    }
  };
  const importPayload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) setPayload(JSON.stringify(JSON.parse(await file.text()), null, 2));
    event.target.value = "";
  };

  return <>
    <PageTitle title="Penerbitan dan operasi data"/>
    <SettingsTabs/>
    <section className="settings-hero"><div><span className="overline">TETAPAN / OPERASI</span><h1>Terbit dengan jejak audit.</h1><p>Draf, ulas, terbit atau pulihkan read model tanpa mengubah keputusan sejarah yang dikunci.</p></div></section>
    {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name="info" size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
    <section className="settings-kpis">
      <article><span>PANGKALAN DATA</span><strong>{health?.database === "connected" ? "Aktif" : "Belum dikonfigurasi"}</strong></article>
      <article><span>DRAF</span><strong>{health?.revisions?.draft ?? 0}</strong></article>
      <article><span>MENUNGGU TERBIT</span><strong>{health?.revisions?.reviewed ?? 0}</strong></article>
      <article><span>REKONSILIASI</span><strong>{health?.reconciliation?.status ?? "Tempatan"}</strong></article>
    </section>
    <section className="settings-layout">
      <article className="panel data-manager operations-health">
        <div className="section-heading"><div><span className="eyebrow">KESIHATAN PLATFORM</span><h2>7 hari terakhir</h2></div><button onClick={() => void loadHealth()}>Muat semula</button></div>
        {health?.telemetry?.length ? <div className="history-table-wrap"><table><thead><tr><th>ISYARAT</th><th>SAMPEL</th><th>PURATA</th><th>LEMAH</th></tr></thead><tbody>{health.telemetry.map((metric) => <tr key={`${metric.kind}:${metric.name}`}><td><strong>{metric.name}</strong><small>{metric.kind}</small></td><td>{metric.samples}</td><td>{metric.average ?? "—"}</td><td>{metric.poor}</td></tr>)}</tbody></table></div> : <div className="history-empty"><p>{health?.database === "not-configured" ? "Tetapkan DATABASE_URL untuk mengaktifkan telemetri dan penerbitan berpusat." : "Belum ada sampel telemetri."}</p></div>}
        {health?.reconciliation && <aside className="storage-note"><Icon name="database" size={18}/><div><strong>{health.reconciliation.release_id}</strong><p>Status {health.reconciliation.status} · {formatShortDate(health.reconciliation.completed_at)}</p></div></aside>}
      </article>
      <aside className="panel change-editor">
        <div className="section-heading"><div><span className="eyebrow">AKSES EDITORIAL</span><h2>Cipta draf</h2></div></div>
        <form onSubmit={createRevision}>
          <label><span>Nama editor</span><input value={actor} onChange={(event) => setActor(event.target.value)} required/></label>
          <label><span>Token editorial</span><input type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="off" required/></label>
          <label><span>Jenis data</span><select value={dataKind} onChange={(event) => setDataKind(event.target.value)}><option value="changes">Status kerusi</option><option value="affiliations">Keahlian</option><option value="candidate-changes">Calon</option><option value="annotations">Anotasi Atlas</option></select></label>
          <label><span>Sebab revisi</span><textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} required/></label>
          <label><span>URL sumber</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)}/></label>
          <label><span>Payload JSON</span><textarea rows={8} value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false}/></label>
          <label className="settings-file-field">Muat payload JSON<input type="file" accept="application/json,.json" onChange={importPayload}/></label>
          <div className="editor-actions"><button type="button" onClick={() => setPayload("{}")}>Kosongkan</button><button className="primary" type="submit">Cipta draf</button></div>
        </form>
      </aside>
    </section>
    <section className="panel change-history">
      <div className="section-heading"><div><span className="eyebrow">KELULUSAN</span><h2>Revisi {edition.shortTitle}</h2></div></div>
      {revisions.length ? <div className="history-table-wrap"><table><thead><tr><th>DICIPTA</th><th>JENIS</th><th>STATUS</th><th>SEBAB</th><th>TINDAKAN</th></tr></thead><tbody>{revisions.map((revision) => <tr key={revision.id}><td>{formatShortDate(revision.created_at)}<small>{revision.created_by}</small></td><td>{revision.data_kind}</td><td><strong>{revision.status}</strong></td><td>{revision.reason}</td><td><div className="revision-actions">{revision.status === "draft" && <button onClick={() => void transition(revision, "reviewed")}>Hantar ulasan</button>}{revision.status === "reviewed" && <><button onClick={() => void transition(revision, "draft")}>Kembali ke draf</button><button className="primary" onClick={() => void transition(revision, "published")}>Terbitkan</button></>}{revision.status === "published" && <button onClick={() => void transition(revision, "superseded")}>Gantikan</button>}{["published", "superseded"].includes(revision.status) && <button onClick={() => void rollback(revision)}>Pulihkan</button>}</div></td></tr>)}</tbody></table></div> : <div className="history-empty"><p>Masukkan token editorial untuk memuatkan revisi.</p></div>}
    </section>
  </>;
}

function assertEditionFile(value: unknown, electionId: string, termId?: string) {
  if (!value || typeof value !== "object") throw new Error("Fail import tidak mempunyai metadata edisi.");
  const metadata = value as { electionId?: unknown; termId?: unknown };
  if (metadata.electionId !== electionId) throw new Error(`Fail ini untuk ${String(metadata.electionId ?? "edisi tidak diketahui")}, bukan ${electionId}.`);
  if (termId && metadata.termId !== termId) throw new Error(`Fail ini untuk penggal ${String(metadata.termId ?? "tidak diketahui")}, bukan ${termId}.`);
}
export function SettingsDataPage({ data, changes, setChanges }: { data: ElectionData; changes: DataChange[]; setChanges: React.Dispatch<React.SetStateAction<DataChange[]>> }) {
  const { edition } = useElection();
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
    const record: DataChange = { id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `change-${Date.now()}`), electionId: edition.id, seatCode: draft.seatCode, effectiveDate: draft.effectiveDate, status: draft.status, alliance: draft.alliance.trim(), party: draft.party.trim(), reason: draft.reason.trim(), sourceUrl: draft.sourceUrl.trim() || undefined, createdAt: editingId ? changes.find((item) => item.id === editingId)?.createdAt ?? now : now };
    setChanges((current) => editingId ? current.map((item) => item.id === editingId ? record : item) : [...current, record]);
    setNotice(editingId ? "Perubahan berjaya dikemas kini." : "Perubahan berjaya direkodkan.");
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const deleteChange = (change: DataChange) => {
    if (!window.confirm(`Padam perubahan ${change.seatCode} bertarikh ${formatShortDate(change.effectiveDate)}?`)) return;
    setChanges((current) => current.filter((item) => item.id !== change.id));
    setNotice("Perubahan dipadam dan jumlah kerusi dikira semula.");
  };

  const exportChanges = () => {
    const blob = new Blob([JSON.stringify({ version: 2, electionId: edition.id, exportedAt: new Date().toISOString(), changes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `politik-data-changes-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    URL.revokeObjectURL(url);
  };

  const importChanges = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      assertEditionFile(value, edition.id);
      const imported = parseChangeFile(value);
      const seatCodes = new Set(data.seats.map((seat) => seat.code));
      const unknown = imported.find((change) => !seatCodes.has(change.seatCode));
      if (unknown) throw new Error(`Kod kerusi ${unknown.seatCode} tidak wujud dalam data ${edition.shortTitle}.`);
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
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Sejarah perubahan</h2></div>{changes.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm(`Padam semua perubahan dan kembali kepada komposisi ${edition.shortTitle}?`)) { setChanges([]); setNotice("Semua perubahan dipadam."); } }}>Padam semua</button>}</div>{sortedChanges.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>KERUSI</th><th>STATUS / GABUNGAN</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedChanges.map((change) => { const seat = data.seats.find((item) => item.code === change.seatCode); return <tr key={change.id}><td>{formatShortDate(change.effectiveDate)}</td><td><strong>{change.seatCode} {seat?.name}</strong><small>{seat?.winner.name}</small></td><td><strong>{change.status === "vacant" ? "KERUSI KOSONG" : <AllianceLogo name={change.alliance} data={data}/>}</strong>{change.party && <small><PartyLogo name={change.party}/></small>}</td><td>{change.reason}</td><td>{change.sourceUrl ? <a href={change.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editChange(change)}>Edit</button><button className="delete" onClick={() => deleteChange(change)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada perubahan. Komposisi semasa masih sama dengan keputusan {edition.shortTitle}.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan perubahan</strong><p>Perubahan disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/elections/{edition.slug}/changes.json</code> untuk berkongsi perubahan dalam deployment.</p></div></aside>
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

export function SettingsAffiliationPage({ data, affiliations, setAffiliations, partyCatalog, allianceCatalog }: {
  data: ElectionData;
  affiliations: AffiliationEvent[];
  setAffiliations: React.Dispatch<React.SetStateAction<AffiliationEvent[]>>;
  partyCatalog: PartyCatalogItem[];
  allianceCatalog: AllianceCatalogItem[];
}) {
  const { edition } = useElection();
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
      electionId: edition.id,
      termId: edition.termId,
      personId: seat.winner.personId ?? personIdForSeat(seat.code, edition.id),
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
    if (!window.confirm(`Padam rekod keahlian ${event.seatCode} bertarikh ${formatShortDate(event.effectiveDate)}?`)) return;
    setAffiliations((items) => items.filter((item) => item.id !== event.id));
    setNotice("Rekod keahlian dipadam.");
  };

  const importEvents = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value: unknown = JSON.parse(await file.text());
      assertEditionFile(value, edition.id, edition.termId);
      const imported = parseAffiliationFile(value);
      const seatCodes = new Set(data.seats.map((seat) => seat.code));
      const unknown = imported.find((item) => !seatCodes.has(item.seatCode));
      if (unknown) throw new Error(`Kod kerusi ${unknown.seatCode} tidak wujud dalam data ${edition.shortTitle}.`);
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
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / KEAHLIAN</span><h1>Urus keahlian semasa.</h1><p>Keputusan parti semasa {edition.shortTitle} kekal sebagai rekod sejarah. Di sini, rekod parti dan gabungan yang disertai wakil rakyat sekarang.</p></div><div className="settings-actions"><button onClick={() => downloadJson(`politik-affiliations-${todayDate}.json`, { version: 2, electionId: edition.id, termId: edition.termId, exportedAt: new Date().toISOString(), affiliations })}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importEvents}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>WAKIL {edition.shortTitle}</span><strong>{data.seats.length}</strong></article><article><span>KEAHLIAN DIKEMAS KINI</span><strong>{changedSeatCodes.size}</strong></article><article><span>BEBAS SEMASA</span><strong>{independentSeatCodes.size}</strong></article><article><span>REKOD SEJARAH</span><strong>{affiliations.length}</strong></article></section>
      <section className="settings-layout"><article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">WAKIL RAKYAT</span><h2>Pilih wakil untuk dikemas kini</h2></div><span className="route-count">{filteredSeats.length} wakil</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, kerusi, parti atau gabungan"/></label><div className="settings-seat-list">{filteredSeats.slice(0, 60).map((seat) => <button key={seat.code} className={changedSeatCodes.has(seat.code) ? "is-changed" : ""} onClick={() => chooseSeat(seat)}><div><span>{seat.code} · {seat.name}</span><strong>{seat.winner.name}</strong><small>{edition.shortTitle}: {seat.winner.party}</small></div><div className="settings-current-identity"><PartyLogo name={currentParty(seat)}/><AllianceLogo name={currentAlliance(seat)} data={data}/>{changedSeatCodes.has(seat.code) && <small>Semasa</small>}</div><Icon name="arrow" size={16}/></button>)}</div>{filteredSeats.length > 60 && <p className="settings-list-note">Paparan dihadkan kepada 60 rekod. Gunakan carian untuk mencari wakil lain.</p>}</article>
        <aside id="affiliation-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{editingId ? "EDIT KEAHLIAN" : "PERUBAHAN KEAHLIAN"}</span><h2>{draft.seatCode ? data.seats.find((seat) => seat.code === draft.seatCode)?.winner.name : "Pilih wakil"}</h2></div></div>{draft.seatCode ? <form onSubmit={saveEvent}><div className="locked-data"><Icon name="vote" size={17}/><div><strong>Identiti {edition.shortTitle} dikunci</strong><span>{data.seats.find((seat) => seat.code === draft.seatCode)?.winner.party} · {data.seats.find((seat) => seat.code === draft.seatCode)?.winner.alliance}</span></div></div><label><span>Tarikh kuat kuasa</span><input type="date" value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}/></label><label><span>Status keahlian</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AffiliationStatus, party: event.target.value === "independent" ? INDEPENDENT_PARTY : draft.party, alliance: event.target.value === "independent" ? INDEPENDENT_ALLIANCE : draft.alliance })}><option value="party">Ahli parti</option><option value="independent">Bebas / tanpa parti</option></select></label><SearchCombobox label="Parti semasa" value={draft.party} options={partyOptions} allowCustom={false} disabled={draft.status === "independent"} onChange={selectParty}/><SearchCombobox label="Gabungan semasa" value={draft.alliance} options={allianceOptions} allowCustom={false} disabled={draft.status === "independent"} onChange={(alliance) => setDraft({ ...draft, alliance })}/><label><span>Sebab perubahan</span><textarea rows={4} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="Contoh: Keluar parti dan menjadi Ahli Parlimen Bebas"/></label><label><span>URL sumber (pilihan)</span><input type="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…"/></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={() => { setDraft(emptyAffiliationDraft()); setEditingId(null); }}>Batal</button><button className="primary" type="submit">{editingId ? "Simpan keahlian" : "Rekod keahlian"}</button></div></form> : <div className="editor-empty"><Icon name="people" size={30}/><p>Pilih wakil rakyat untuk merekodkan parti dan gabungan semasanya.</p></div>}</aside>
      </section>
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Sejarah keahlian</h2></div>{affiliations.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm("Padam semua rekod keahlian semasa?")) setAffiliations([]); }}>Padam semua</button>}</div>{sortedEvents.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>WAKIL / KERUSI</th><th>KEAHLIAN SEMASA</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedEvents.map((event) => { const seat = data.seats.find((item) => item.code === event.seatCode); const party = partyCatalog.find((item) => item.id === event.partyId)?.name ?? event.partyName; const alliance = allianceCatalog.find((item) => item.id === event.allianceId)?.name ?? event.allianceName; return <tr key={event.id}><td>{formatShortDate(event.effectiveDate)}</td><td><strong>{seat?.winner.name}</strong><small>{event.seatCode} {seat?.name}</small></td><td><span className="history-identities"><PartyLogo name={party}/><AllianceLogo name={alliance} data={data}/></span></td><td>{event.reason}</td><td>{event.sourceUrl ? <a href={event.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editEvent(event)}>Edit</button><button className="delete" onClick={() => deleteEvent(event)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada perubahan keahlian. Kedudukan semasa masih sama dengan rekod {edition.shortTitle}.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Dua lapisan data</strong><p>Rekod ini disimpan berasingan daripada keputusan {edition.shortTitle}. Eksport JSON dan gantikan <code>public/data/elections/{edition.slug}/affiliations.json</code> untuk menerbitkannya.</p></div></aside>
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

export function SettingsCandidatePage({ data, candidateChanges, setCandidateChanges, partyCatalog, allianceCatalog }: { data: ElectionData; candidateChanges: CandidateChange[]; setCandidateChanges: React.Dispatch<React.SetStateAction<CandidateChange[]>>; partyCatalog: PartyCatalogItem[]; allianceCatalog: AllianceCatalogItem[] }) {
  const { edition } = useElection();
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
      return setError(`Perubahan parti selepas ${edition.shortTitle} bukan pembetulan calon. Rekodkannya di Keahlian semasa; halaman ini hanya membetulkan identiti pada hari ${edition.shortTitle}.`);
    }
    const now = new Date().toISOString();
    const record: CandidateChange = {
      id: editingId ?? (globalThis.crypto?.randomUUID?.() ?? `candidate-change-${Date.now()}`),
      electionId: edition.id,
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
    const blob = new Blob([JSON.stringify({ version: 2, electionId: edition.id, exportedAt: new Date().toISOString(), candidateChanges }, null, 2)], { type: "application/json" });
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
      const value: unknown = JSON.parse(await file.text());
      assertEditionFile(value, edition.id);
      const imported = parseCandidateChangeFile(value);
      const invalid = imported.find((change) => !data.seats.find((seat) => seat.code === change.seatCode)?.candidates[change.candidateIndex]);
      if (invalid) throw new Error(`Calon #${invalid.candidateIndex + 1} bagi kerusi ${invalid.seatCode} tidak wujud dalam data ${edition.shortTitle}.`);
      const membershipChange = imported.find((change) => {
        const candidate = data.seats.find((seat) => seat.code === change.seatCode)?.candidates[change.candidateIndex];
        return candidate && change.effectiveDate > data.metadata.electionDate && (normalise(change.party) !== normalise(candidate.party) || normalise(change.alliance) !== normalise(candidate.alliance));
      });
      if (membershipChange) throw new Error(`${membershipChange.seatCode}: perubahan keahlian selepas ${edition.shortTitle} mesti diimport melalui halaman Keahlian semasa.`);
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
      <section className="settings-hero"><div><span className="overline">TETAPAN / DATA / CALON</span><h1>Betulkan rekod {edition.shortTitle}.</h1><p>Halaman ini hanya membetulkan snapshot calon pada hari pengundian. Pertukaran parti selepas {edition.shortTitle} mesti direkodkan dalam Keahlian semasa.</p></div><div className="settings-actions"><Link to={`/settings/data/keahlian?election=${edition.number}`}>Keahlian semasa</Link><button onClick={exportChanges}>Eksport JSON</button><label>Import JSON<input type="file" accept="application/json,.json" onChange={importChanges}/></label></div></section>
      {(notice || error) && <div className={`settings-notice ${error ? "is-error" : ""}`}><Icon name={error ? "info" : "database"} size={18}/><span>{error || notice}</span><button onClick={() => { setNotice(""); setError(""); }}>×</button></div>}
      <section className="settings-kpis"><article><span>CALON KESELURUHAN</span><strong>{candidateRecords.length}</strong></article><article><span>CALON DIKEMAS KINI</span><strong>{changedCandidateKeys.size}</strong></article><article><span>PARTI DIREKODKAN</span><strong>{partyCount}</strong></article><article><span>PEMENANG DIKEMAS KINI</span><strong>{winnerChangeCount}</strong></article></section>
      <section className="settings-layout">
        <article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">DIREKTORI CALON</span><h2>Pilih calon untuk dibetulkan</h2></div><span className="route-count">{filteredCandidates.length} calon</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari calon, kerusi, negeri atau parti"/></label><div className="settings-seat-list candidate-settings-list">{filteredCandidates.slice(0, 60).map((record) => { const key = `${record.seat.code}:${record.candidateIndex}`; return <button key={key} className={changedCandidateKeys.has(key) ? "is-changed" : ""} onClick={() => chooseCandidate(record)}><div><span>{record.seat.code} · {record.seat.name}</span><strong>{record.candidate.name}</strong><small><PartyLogo name={record.candidate.party}/></small></div><div><AlliancePill name={record.candidate.alliance} data={data}/><small>{record.candidateIndex === 0 ? "Pemenang" : `Calon #${record.candidateIndex + 1}`}</small></div><Icon name="arrow" size={16}/></button>; })}</div>{filteredCandidates.length > 60 && <p className="settings-list-note">Paparan dihadkan kepada 60 rekod. Gunakan carian untuk mencari calon lain.</p>}</article>
        <aside id="candidate-change-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{editingId ? "EDIT PEMBETULAN" : "PEMBETULAN BAHARU"}</span><h2>{selectedCandidate ? selectedCandidate.name : "Pilih calon"}</h2></div></div>{selectedCandidate ? <form onSubmit={saveChange}><div className="locked-data"><Icon name="info" size={17}/><div><strong>Keputusan undi dikunci</strong><span>{formatNumber(selectedCandidate.votes)} undi · {formatPct(selectedCandidate.share, 2)}</span></div></div><div className="membership-routing-note"><Icon name="people" size={17}/><div><strong>Adakah ini pertukaran parti selepas {edition.shortTitle}?</strong><Link to={`/settings/data/keahlian?election=${edition.number}`}>Rekod dalam Keahlian semasa →</Link></div></div><label><span>Tarikh rujukan {edition.shortTitle}</span><input type="date" max={data.metadata.electionDate} value={draft.effectiveDate} onChange={(event) => setDraft({ ...draft, effectiveDate: event.target.value })}/></label><label><span>Nama paparan</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><SearchCombobox label={`Gabungan semasa ${edition.shortTitle}`} value={draft.alliance} options={allianceOptions} onChange={(alliance) => setDraft({ ...draft, alliance })}/><SearchCombobox label={`Parti semasa ${edition.shortTitle}`} value={draft.party} options={partyOptions} onChange={(party) => setDraft({ ...draft, party })}/>{draft.candidateIndex === 0 && <div className="editor-field-pair"><SearchCombobox label="Jantina" value={draft.gender} options={genderOptions} onChange={(gender) => setDraft({ ...draft, gender })}/><SearchCombobox label="Bangsa" value={draft.ethnicity} options={raceOptions} onChange={(ethnicity) => setDraft({ ...draft, ethnicity })}/></div>}<label><span>Sebab pembetulan</span><textarea rows={4} value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder={`Contoh: Ejaan nama atau identiti dalam sumber ${edition.shortTitle} perlu dibetulkan`}/></label><label><span>URL sumber (pilihan)</span><input type="url" value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} placeholder="https://…"/></label>{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={() => { setDraft(emptyCandidateDraft()); setEditingId(null); }}>Batal</button><button className="primary" type="submit">{editingId ? "Simpan pembetulan" : "Rekod pembetulan"}</button></div></form> : <div className="editor-empty"><Icon name="people" size={30}/><p>Pilih seorang calon. Nama, gabungan dan parti pada hari {edition.shortTitle} boleh dibetulkan; angka undi kekal dikunci.</p></div>}</aside>
      </section>
      <section className="panel change-history"><div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL CALON</span><h2>Sejarah pembetulan</h2></div>{candidateChanges.length > 0 && <button className="danger-link" onClick={() => { if (window.confirm("Padam semua pembetulan calon dan kembali kepada data sumber?")) { setCandidateChanges([]); setNotice("Semua pembetulan calon dipadam."); } }}>Padam semua</button>}</div>{sortedChanges.length ? <div className="history-table-wrap"><table><thead><tr><th>TARIKH</th><th>CALON / KERUSI</th><th>GABUNGAN / PARTI</th><th>SEBAB</th><th>SUMBER</th><th></th></tr></thead><tbody>{sortedChanges.map((change) => { const seat = data.seats.find((item) => item.code === change.seatCode); return <tr key={change.id}><td>{formatShortDate(change.effectiveDate)}</td><td><strong>{change.name}</strong><small>{change.seatCode} {seat?.name} · Calon #{change.candidateIndex + 1}</small></td><td><strong><AllianceLogo name={change.alliance} data={data}/></strong><small><PartyLogo name={change.party}/></small></td><td>{change.reason}</td><td>{change.sourceUrl ? <a href={change.sourceUrl} target="_blank" rel="noreferrer">Sumber ↗</a> : "—"}</td><td><button onClick={() => editChange(change)}>Edit</button><button className="delete" onClick={() => deleteChange(change)}>Padam</button></td></tr>; })}</tbody></table></div> : <div className="history-empty"><p>Belum ada pembetulan calon. Semua maklumat masih menggunakan data sumber {edition.shortTitle}.</p></div>}</section>
      <aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan pembetulan calon</strong><p>Perubahan disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/elections/{edition.slug}/candidate-changes.json</code> untuk menerbitkannya kepada semua pengguna.</p></div></aside>
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

export function SettingsPartyPage({ data, partyCatalog, setPartyCatalog, allianceCatalog }: { data: ElectionData; partyCatalog: PartyCatalogItem[]; setPartyCatalog: React.Dispatch<React.SetStateAction<PartyCatalogItem[]>>; allianceCatalog: AllianceCatalogItem[] }) {
  const { edition } = useElection();
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
      <section className="settings-layout reference-layout"><article className="panel data-manager"><div className="section-heading"><div><span className="eyebrow">KATALOG PARTI</span><h2>Pilih parti untuk diurus</h2></div><span className="route-count">{filtered.length} parti</span></div><label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari nama, singkatan atau gabungan"/></label><div className="settings-seat-list reference-list">{filtered.map((item) => <button key={item.id} className={`${editingId === item.id ? "is-selected" : ""} ${!item.active ? "is-inactive" : ""}`} onClick={() => selectParty(item)}><div className="reference-identity"><div><PartyLogo name={item.name} shortName={item.shortName} size="md"/><AllianceLogo name={resolveCatalogValue(item.alliance, allianceCatalog)} data={data}/></div><small>{usage[item.name] ?? 0} pencalonan dalam {edition.shortTitle}</small></div><div><span className={`status-chip ${item.active ? "is-active" : ""}`}>{item.active ? "Aktif" : "Tidak aktif"}</span></div><Icon name="arrow" size={16}/></button>)}</div></article>
        <aside id="party-editor" className="panel change-editor"><div className="section-heading"><div><span className="eyebrow">{selected ? "EDIT PARTI" : "PARTI BAHARU"}</span><h2>{selected?.shortName || "Tambah parti"}</h2></div></div><form onSubmit={saveParty}><label><span>Nama parti</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Nama rasmi parti"/></label><label><span>Nama ringkas</span><input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} placeholder="Contoh: PKR"/></label><SearchCombobox label="Gabungan" value={draft.alliance} options={allianceOptions} allowCustom={false} onChange={(alliance) => setDraft({ ...draft, alliance })}/><label><span>Status</span><select value={draft.active ? "active" : "inactive"} onChange={(event) => setDraft({ ...draft, active: event.target.value === "active" })}><option value="active">Aktif</option><option value="inactive">Tidak aktif</option></select></label>{selected && <div className="locked-data"><Icon name="info" size={17}/><div><strong>Identiti sumber dikekalkan</strong><span>{selected.sourceName}</span></div></div>}{error && <p className="form-error">{error}</p>}<div className="editor-actions"><button type="button" onClick={startNew}>Set semula</button><button className="primary" type="submit">{selected ? "Simpan parti" : "Tambah parti"}</button></div></form></aside>
      </section><aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan katalog parti</strong><p>Rekod disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/reference/parties.json</code> untuk menerbitkannya.</p></div></aside>
    </>
  );
}

type AllianceDraft = { name: string; shortName: string; color: string; active: boolean };
const emptyAllianceDraft = (): AllianceDraft => ({ name: "", shortName: "", color: "#557c70", active: true });

export function SettingsAlliancePage({ data, allianceCatalog, setAllianceCatalog }: { data: ElectionData; allianceCatalog: AllianceCatalogItem[]; setAllianceCatalog: React.Dispatch<React.SetStateAction<AllianceCatalogItem[]>> }) {
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
      </section><aside className="storage-note"><Icon name="info" size={19}/><div><strong>Penyimpanan katalog gabungan</strong><p>Rekod disimpan dalam pelayar ini. Eksport JSON dan gantikan <code>public/data/reference/alliances.json</code> untuk menerbitkannya.</p></div></aside>
    </>
  );
}
