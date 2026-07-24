import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon, type IconName } from "../components/ui/Icon";
import { AsyncState } from "../components/ui/AsyncState";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { TableShell } from "../components/ui/TableShell";
import { VoterDimensionNav } from "../components/voters/VoterDimensionNav";
import type { VoterRollData, VoterRollMetrics } from "../data/types/voterRoll";
import { useElection } from "../ElectionContext";
import { formatCompact, formatNumber, formatPct } from "../utils";

const ALL_STATES = "SELURUH MALAYSIA";
const ALL_PARLIAMENTS = "SEMUA PARLIMEN";
const ALL_DUNS = "SEMUA DUN";
const ALL_PDMS = "SEMUA PDM";

type AreaLevel = "state" | "parliament" | "dun" | "pdm";
type AreaRow = {
  id: string;
  code: string;
  name: string;
  level: AreaLevel;
  metrics: VoterRollMetrics;
  query: Record<string, string>;
};

function useVoterRoll() {
  const { edition } = useElection();
  const [data, setData] = useState<VoterRollData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    fetch(`${edition.dataPath}/voter-roll.json`)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
  }, [edition.dataPath]);
  return { data, error };
}

function VoterRollLoading({ error }: { error?: string }) {
  return <AsyncState kind={error ? "error" : "loading"} title={error ? "Data pengundi tidak dapat dimuatkan" : "Memuatkan daftar pemilih"} description={error || "Menyusun statistik rasmi mengikut kawasan…"} className="age-loading"/>;
}

function specialVoters(record: VoterRollMetrics) {
  return record.military + record.police + record.overseas;
}

function SnapshotNotice({ data }: { data: VoterRollData }) {
  const difference = data.metadata.denominatorDifference;
  return <section className="voter-snapshot-notice"><Icon name="info" size={19}/><div><strong>Snapshot daftar {data.metadata.snapshotYear}, bukan denominator hari mengundi</strong><p>Dataset ini merekodkan {formatNumber(data.metadata.snapshotRegistered)} pemilih. Keputusan {data.metadata.electionId.toUpperCase()} menggunakan {formatNumber(data.metadata.electionRegistered)} pemilih, perbezaan {difference > 0 ? "+" : ""}{formatNumber(difference)} kerana tarikh rujukannya berlainan.</p></div></section>;
}

function SourceNote({ data }: { data: VoterRollData }) {
  return <section className="seating-source-note age-source-note"><Icon name="database" size={17}/><div><strong>Sumber: Daftar Pemilih Induk SPR {data.metadata.snapshotYear}</strong><span>{data.metadata.sourceRowCount.toLocaleString("ms-MY")} rekod PDM · SHA-256 {data.metadata.sourceSha256.slice(0, 12)}…</span></div></section>;
}

export function VoterOverviewPage() {
  const { edition, paths } = useElection();
  const { data, error } = useVoterRoll();
  if (error) return <VoterRollLoading error={error}/>;
  if (!data) return <VoterRollLoading/>;
  const national = data.national;
  const genderTotal = Math.max(1, national.male + national.female);
  const categories: Array<{ label: string; value: number; icon: IconName }> = [
    { label: "Pengundi biasa", value: national.ordinary, icon: "people" },
    { label: "Tentera & pasangan", value: national.military, icon: "seat" },
    { label: "Polis & pasangan PGA", value: national.police, icon: "vote" },
    { label: "Tidak hadir luar negara", value: national.overseas, icon: "arrow" },
  ];
  return <>
    <PageTitle title={`Pengundi ${edition.shortTitle}`}/>
    <section className="route-hero voter-roll-hero">
      <div className="breadcrumbs"><Link to={paths.election}>{edition.shortTitle}</Link><span>/</span><strong>Pengundi</strong></div>
      <span className="overline">DAFTAR PEMILIH INDUK · {data.metadata.snapshotYear}</span>
      <h1>Pengundi dalam<br/><em>setiap angka.</em></h1>
      <p>Profil rasmi daftar pemilih mengikut jantina, kategori dan kawasan pilihan raya.</p>
      <div className="route-stat-row"><div><span>SNAPSHOT DAFTAR</span><strong>{formatCompact(national.registered)}</strong></div><div><span>PEMILIH {edition.shortTitle}</span><strong>{formatCompact(data.metadata.electionRegistered)}</strong></div><div><span>PARLIMEN</span><strong>{data.parliaments.length}</strong></div><div><span>PDM</span><strong>{formatNumber(data.pdms.length)}</strong></div></div>
    </section>

    <VoterDimensionNav/>
    <SnapshotNotice data={data}/>

    <section className="voter-profile-grid">
      <article className="panel voter-gender-panel"><div className="section-heading"><div><span className="eyebrow">JANTINA</span><h2>Hampir seimbang</h2></div><span className="route-count">{formatNumber(national.registered)} pemilih</span></div><div className="voter-gender-numbers"><div><span>LELAKI</span><strong>{formatNumber(national.male)}</strong><small>{formatPct(national.male / genderTotal)}</small></div><div><span>PEREMPUAN</span><strong>{formatNumber(national.female)}</strong><small>{formatPct(national.female / genderTotal)}</small></div></div><div className="voter-gender-bar" aria-label={`Lelaki ${formatPct(national.male / genderTotal)}, perempuan ${formatPct(national.female / genderTotal)}`}><i style={{ width: `${(national.male / genderTotal) * 100}%` }}/><b/></div></article>
      <article className="panel voter-category-panel"><div className="section-heading"><div><span className="eyebrow">KATEGORI PEMILIH</span><h2>Cara pendaftaran</h2></div></div><div className="voter-category-list">{categories.map((category) => <div key={category.label}><span className="voter-category-icon"><Icon name={category.icon} size={18}/></span><div><span>{category.label}</span><strong>{formatNumber(category.value)}</strong></div><small>{formatPct(category.value / national.registered, 2)}</small></div>)}</div></article>
    </section>

    <section className="panel voter-state-panel"><div className="section-heading"><div><span className="eyebrow">TABURAN KAWASAN</span><h2>Negeri dan wilayah</h2><p>Bandingkan saiz daftar dan teruskan hingga peringkat PDM.</p></div><Link className="section-action" to={paths.voterArea}>Terokai semua kawasan <Icon name="arrow" size={16}/></Link></div><TableShell label="Daftar pemilih mengikut negeri dan wilayah" className="voter-state-table-wrap"><table className="voter-state-table"><thead><tr><th>NEGERI / WILAYAH</th><th>PEMILIH</th><th>BAHAGIAN NASIONAL</th><th>LELAKI</th><th>PEREMPUAN</th><th/></tr></thead><tbody>{data.states.map((state) => <tr key={state.id}><td><strong>{state.name}</strong><span>{state.parliamentCodes.length} Parlimen</span></td><td><strong>{formatNumber(state.registered)}</strong></td><td>{formatPct(state.registered / national.registered)}</td><td>{formatPct(state.male / state.registered)}</td><td>{formatPct(state.female / state.registered)}</td><td><Link aria-label={`Buka ${state.name}`} to={`${paths.voterArea}?negeri=${state.id}`}><Icon name="arrow" size={16}/></Link></td></tr>)}</tbody></table></TableShell></section>

    <section className="voter-overview-actions"><Link to={paths.voterArea}><Icon name="grid"/><div><strong>Terokai mengikut kawasan</strong><span>Negeri → Parlimen → DUN → PDM</span></div><Icon name="arrow"/></Link>{edition.capabilities.voterAge && <Link to={paths.voterAge}><Icon name="chart"/><div><strong>Lihat taburan umur</strong><span>Profil umur pemilih {edition.shortTitle}</span></div><Icon name="arrow"/></Link>}</section>
    <SourceNote data={data}/>
  </>;
}

function areaHref(base: string, query: Record<string, string>) {
  return `${base}?${new URLSearchParams(query).toString()}`;
}

export function VoterAreaPage() {
  const { edition, paths } = useElection();
  const { data, error } = useVoterRoll();
  const [searchParams, setSearchParams] = useSearchParams();

  const model = useMemo(() => {
    if (!data) return null;
    const requestedParliament = data.parliaments.find((item) => item.code === searchParams.get("parlimen"));
    const state = data.states.find((item) => item.id === searchParams.get("negeri"))
      ?? data.states.find((item) => item.id === requestedParliament?.stateId);
    const stateParliaments = state ? data.parliaments.filter((item) => item.stateId === state.id) : data.parliaments;
    const parliament = stateParliaments.find((item) => item.code === searchParams.get("parlimen"));
    const duns = parliament ? data.duns.filter((item) => item.parliamentCode === parliament.code) : [];
    const dun = duns.find((item) => item.id === searchParams.get("dun"));
    const pdms = parliament ? data.pdms.filter((item) => item.parliamentCode === parliament.code && (!dun || item.dunId === dun.id)) : [];
    const pdm = pdms.find((item) => item.id === searchParams.get("pdm"));
    const record: VoterRollMetrics = pdm ?? dun ?? parliament ?? state ?? data.national;
    const label = pdm?.name ?? dun?.name ?? parliament?.name ?? state?.name ?? "MALAYSIA";
    const code = pdm?.code ?? dun?.code ?? parliament?.code ?? "NASIONAL";

    let rows: AreaRow[] = data.states.map((item) => ({ id: item.id, code: `${item.parliamentCodes.length} P`, name: item.name, level: "state", metrics: item, query: { negeri: item.id } }));
    let title = "Negeri dan wilayah";
    if (state) {
      rows = stateParliaments.map((item) => ({ id: item.code, code: item.code, name: item.name, level: "parliament", metrics: item, query: { negeri: state.id, parlimen: item.code } }));
      title = `Parlimen dalam ${state.name}`;
    }
    if (parliament) {
      rows = duns.length
        ? duns.map((item) => ({ id: item.id, code: item.code, name: item.name, level: "dun", metrics: item, query: { negeri: state!.id, parlimen: parliament.code, dun: item.id } }))
        : pdms.map((item) => ({ id: item.id, code: item.code, name: item.name, level: "pdm", metrics: item, query: { negeri: state!.id, parlimen: parliament.code, pdm: item.id } }));
      title = duns.length ? `DUN dalam ${parliament.code} ${parliament.name}` : `PDM dalam ${parliament.code} ${parliament.name}`;
    }
    if (dun) {
      rows = pdms.map((item) => ({ id: item.id, code: item.code, name: item.name, level: "pdm", metrics: item, query: { negeri: state!.id, parlimen: parliament!.code, dun: dun.id, pdm: item.id } }));
      title = `PDM dalam ${dun.code} ${dun.name}`;
    }
    if (pdm) {
      rows = [];
      title = "Peringkat paling terperinci";
    }
    return { state, stateParliaments, parliament, duns, dun, pdms, pdm, record, label, code, rows, title };
  }, [data, searchParams]);

  if (error) return <VoterRollLoading error={error}/>;
  if (!data || !model) return <VoterRollLoading/>;

  const stateLabels = new Map(data.states.map((item) => [item.name, item]));
  const parliamentLabels = new Map(model.stateParliaments.map((item) => [`${item.code} ${item.name}`, item]));
  const dunLabels = new Map(model.duns.map((item) => [`${item.code} ${item.name}`, item]));
  const pdmLabels = new Map(model.pdms.map((item) => [`${item.code} ${item.name}`, item]));
  const updateQuery = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); });
    setSearchParams(next);
  };
  const selectedStateLabel = model.state?.name ?? ALL_STATES;
  const selectedParliamentLabel = model.parliament ? `${model.parliament.code} ${model.parliament.name}` : ALL_PARLIAMENTS;
  const selectedDunLabel = model.dun ? `${model.dun.code} ${model.dun.name}` : ALL_DUNS;
  const selectedPdmLabel = model.pdm ? `${model.pdm.code} ${model.pdm.name}` : ALL_PDMS;
  const special = specialVoters(model.record);

  return <>
    <PageTitle title={`Kawasan pengundi ${edition.shortTitle}`}/>
    <section className="route-hero voter-area-hero"><div className="breadcrumbs"><Link to={paths.election}>{edition.shortTitle}</Link><span>/</span><Link to={paths.voters}>Pengundi</Link><span>/</span><strong>Kawasan</strong></div><span className="overline">GEOGRAFI DAFTAR PEMILIH · {data.metadata.snapshotYear}</span><h1>Daripada negeri<br/><em>hingga PDM.</em></h1><p>Gunakan kod dan nama rasmi SPR untuk membandingkan setiap lapisan kawasan pilihan raya.</p><div className="route-stat-row"><div><span>NEGERI / WILAYAH</span><strong>{data.states.length}</strong></div><div><span>PARLIMEN</span><strong>{data.parliaments.length}</strong></div><div><span>DUN</span><strong>{data.duns.length}</strong></div><div><span>PDM</span><strong>{formatNumber(data.pdms.length)}</strong></div></div></section>

    <VoterDimensionNav/>
    <SnapshotNotice data={data}/>

    <section className="panel voter-area-filter"><div><span className="eyebrow">PILIH KAWASAN</span><h2>Empat aras geografi</h2><p>Pilihan seterusnya diselaraskan secara automatik mengikut kawasan induk.</p></div><div className="voter-area-filter-grid"><SearchCombobox label="NEGERI / WILAYAH" value={selectedStateLabel} options={[ALL_STATES, ...stateLabels.keys()]} allowCustom={false} onChange={(value) => { const item = stateLabels.get(value); updateQuery({ negeri: item?.id }); }}/><SearchCombobox label="PARLIMEN" value={selectedParliamentLabel} options={[ALL_PARLIAMENTS, ...parliamentLabels.keys()]} allowCustom={false} disabled={!model.state} onChange={(value) => { const item = parliamentLabels.get(value); updateQuery({ negeri: model.state?.id, parlimen: item?.code }); }}/><SearchCombobox label="DUN" value={selectedDunLabel} options={[ALL_DUNS, ...dunLabels.keys()]} allowCustom={false} disabled={!model.parliament || model.duns.length === 0} onChange={(value) => { const item = dunLabels.get(value); updateQuery({ negeri: model.state?.id, parlimen: model.parliament?.code, dun: item?.id }); }}/><SearchCombobox label="PDM" value={selectedPdmLabel} options={[ALL_PDMS, ...pdmLabels.keys()]} allowCustom={false} disabled={!model.parliament} onChange={(value) => { const item = pdmLabels.get(value); updateQuery({ negeri: model.state?.id, parlimen: model.parliament?.code, dun: model.dun?.id, pdm: item?.id }); }}/></div></section>

    <section className="voter-area-heading"><div><span className="eyebrow">PROFIL KAWASAN</span><h2><small>{model.code}</small>{model.label}</h2></div><Link to={paths.voterArea}>Set semula</Link></section>
    <section className="age-kpi-grid voter-area-kpis"><article><span>PEMILIH BERDAFTAR</span><strong>{formatNumber(model.record.registered)}</strong><small>{formatPct(model.record.registered / Math.max(1, data.national.registered))} daripada nasional</small></article><article><span>LELAKI</span><strong>{formatPct(model.record.male / Math.max(1, model.record.registered))}</strong><small>{formatNumber(model.record.male)} pemilih</small></article><article><span>PEREMPUAN</span><strong>{formatPct(model.record.female / Math.max(1, model.record.registered))}</strong><small>{formatNumber(model.record.female)} pemilih</small></article><article><span>PENGUNDI KHAS</span><strong>{formatNumber(special)}</strong><small>Tentera, polis dan luar negara</small></article></section>

    <section className="panel voter-area-table-panel"><div className="section-heading"><div><span className="eyebrow">ARAS SETERUSNYA</span><h2>{model.title}</h2></div><span className="route-count">{model.rows.length} rekod</span></div>{model.rows.length ? <TableShell label={`Rekod kawasan di bawah ${model.label}`} className="voter-area-table-wrap"><table className="voter-area-table"><thead><tr><th>KAWASAN</th><th>PEMILIH</th><th>LELAKI</th><th>PEREMPUAN</th><th>BIASA</th><th>KHAS</th><th/></tr></thead><tbody>{model.rows.map((row) => <tr key={row.id}><td><span>{row.code}</span><strong>{row.name}</strong></td><td><strong>{formatNumber(row.metrics.registered)}</strong></td><td>{formatPct(row.metrics.male / Math.max(1, row.metrics.registered))}</td><td>{formatPct(row.metrics.female / Math.max(1, row.metrics.registered))}</td><td>{formatNumber(row.metrics.ordinary)}</td><td>{formatNumber(specialVoters(row.metrics))}</td><td><Link aria-label={`Buka ${row.name}`} to={areaHref(paths.voterArea, row.query)}><Icon name="arrow" size={16}/></Link></td></tr>)}</tbody></table></TableShell> : <div className="voter-area-leaf"><Icon name="grid" size={25}/><div><strong>{model.label}</strong><p>PDM ialah aras paling terperinci dalam dataset Daftar Pemilih Induk ini.</p></div></div>}</section>
    <SourceNote data={data}/>
  </>;
}
