import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AgeDistributionChart } from "../components/charts/AgeDistributionChart";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import type { AgeBand, AgeRecord, ConstituencyRegistry, DunReference, ParliamentReference, VoterAgeData } from "../data/types/voterAge";
import { ELECTION_BASE } from "../routes";
import { formatCompact, formatNumber, formatPct } from "../utils";

const ALL_STATES = "SELURUH MALAYSIA";
const ALL_PARLIAMENTS = "SEMUA PARLIMEN";
const ALL_DUNS = "SEMUA DUN";

type LoadedData = { registry: ConstituencyRegistry; age: VoterAgeData };
type ComparisonRow = { id: string; code: string; name: string; record: AgeRecord };

function displayParliament(item: ParliamentReference) {
  return `${item.code} ${item.name}`;
}

function displayDun(item: DunReference) {
  return `${item.code} ${item.name}`;
}

function sumBands(record: AgeRecord, bands: AgeBand[]) {
  return bands.reduce((sum, band) => sum + record.counts[band], 0);
}

function AgePageLoading() {
  return <section className="panel age-loading"><span className="pulse-dot"/><p>Memuatkan statistik umur pemilih…</p></section>;
}

export function VoterAgePage() {
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState("");
  const [stateValue, setStateValue] = useState(ALL_STATES);
  const [parliamentValue, setParliamentValue] = useState(ALL_PARLIAMENTS);
  const [dunValue, setDunValue] = useState(ALL_DUNS);

  useEffect(() => {
    Promise.all([
      fetch("/data/constituencies.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch("/data/voter-age.json").then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
    ]).then(([registry, age]) => setLoaded({ registry, age })).catch((reason) => setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
  }, []);

  const model = useMemo(() => {
    if (!loaded) return null;
    const { registry, age } = loaded;
    const statesByName = new Map(registry.states.map((item) => [item.name, item]));
    const selectedState = statesByName.get(stateValue);
    const stateParliaments = selectedState
      ? selectedState.parliamentCodes.map((code) => registry.parliaments.find((item) => item.code === code)).filter((item): item is ParliamentReference => Boolean(item))
      : registry.parliaments;
    const parliamentByLabel = new Map(stateParliaments.map((item) => [displayParliament(item), item]));
    const selectedParliament = parliamentByLabel.get(parliamentValue);
    const availableDuns = selectedParliament
      ? selectedParliament.dunIds.map((id) => registry.duns.find((item) => item.id === id)).filter((item): item is DunReference => Boolean(item))
      : selectedState ? registry.duns.filter((item) => item.stateId === selectedState.id) : registry.duns;
    const dunByLabel = new Map(availableDuns.map((item) => [displayDun(item), item]));
    const selectedDun = dunByLabel.get(dunValue);

    const stateRecord = selectedState ? age.stateRecords.find((item) => item.stateId === selectedState.id) : undefined;
    const parliamentRecord = selectedParliament ? age.parliamentRecords.find((item) => item.parliamentCode === selectedParliament.code) : undefined;
    const dunRecord = selectedDun ? age.dunRecords.find((item) => item.dunId === selectedDun.id) : undefined;
    const record: AgeRecord = dunRecord ?? parliamentRecord ?? stateRecord ?? age.national;
    const label = selectedDun
      ? displayDun(selectedDun)
      : selectedParliament ? displayParliament(selectedParliament) : selectedState?.name ?? "MALAYSIA";
    const context = selectedDun
      ? `${displayParliament(registry.parliaments.find((item) => item.code === selectedDun.parliamentCode)!)} · ${selectedState?.name ?? ""}`
      : selectedParliament ? selectedState?.name ?? "" : selectedState ? `${selectedState.parliamentCodes.length} Parlimen` : "16 negeri / wilayah";

    let comparisonTitle = "Perbandingan negeri dan wilayah";
    let comparisons: ComparisonRow[] = registry.states.map((state) => ({
      id: state.id,
      code: `${state.parliamentCodes.length} P`,
      name: state.name,
      record: age.stateRecords.find((item) => item.stateId === state.id)!,
    }));
    if (selectedParliament) {
      comparisonTitle = selectedParliament.dunIds.length ? `DUN dalam ${selectedParliament.code} ${selectedParliament.name}` : `${selectedParliament.code} tidak mempunyai DUN`;
      comparisons = selectedParliament.dunIds.map((id) => {
        const dun = registry.duns.find((item) => item.id === id)!;
        return { id, code: dun.code, name: dun.name, record: age.dunRecords.find((item) => item.dunId === id)! };
      });
    } else if (selectedState) {
      comparisonTitle = `Parlimen dalam ${selectedState.name}`;
      comparisons = stateParliaments.map((parliament) => ({
        id: parliament.code,
        code: parliament.code,
        name: parliament.name,
        record: age.parliamentRecords.find((item) => item.parliamentCode === parliament.code)!,
      }));
    }
    return { selectedState, selectedParliament, selectedDun, stateParliaments, availableDuns, record, label, context, comparisonTitle, comparisons };
  }, [dunValue, loaded, parliamentValue, stateValue]);

  if (error) return <section className="panel age-loading age-error"><Icon name="info"/><div><h2>Data umur tidak dapat dimuatkan</h2><p>{error}</p></div></section>;
  if (!loaded || !model) return <AgePageLoading/>;

  const { registry, age } = loaded;
  const { record } = model;
  const largestBand = age.metadata.ageBands.reduce((largest, band) => record.counts[band] > record.counts[largest] ? band : largest, age.metadata.ageBands[0]);
  const under30 = sumBands(record, ["18-20", "21-29"]);
  const age60Plus = sumBands(record, ["60-69", "70-79", "80-89", "90+"]);
  const parliamentOptions = [ALL_PARLIAMENTS, ...model.stateParliaments.map(displayParliament)];
  const dunOptions = [ALL_DUNS, ...model.availableDuns.map(displayDun)];

  return <>
    <PageTitle title="Umur pengundi PRU-15"/>
    <section className="route-hero age-route-hero">
      <div className="breadcrumbs"><Link to={ELECTION_BASE}>PRU-15</Link><span>/</span><strong>Pengundi</strong><span>/</span><strong>Umur</strong></div>
      <span className="overline">DAFTAR PEMILIH · OGOS 2022</span>
      <h1>Siapa pengundi<br/><em>PRU-15?</em></h1>
      <p>Taburan umur pemilih berdaftar mengikut negeri, Parlimen dan DUN, dikemaskini SPR sehingga 9 Oktober 2022.</p>
      <div className="route-stat-row"><div><span>PEMILIH BERDAFTAR</span><strong>{formatCompact(age.national.total)}</strong></div><div><span>PARLIMEN</span><strong>{registry.parliaments.length}</strong></div><div><span>DUN</span><strong>{registry.duns.length}</strong></div><div><span>KUMPULAN UMUR</span><strong>{age.metadata.ageBands.length}</strong></div></div>
    </section>

    <section className="panel age-filter-panel" aria-label="Pilih kawasan statistik umur">
      <div><span className="eyebrow">PILIH KAWASAN</span><h2>Daripada Malaysia hingga DUN</h2><p>Nama dan kod kawasan datang terus daripada daftar rujukan yang sama.</p></div>
      <div className="age-filter-grid">
        <SearchCombobox label="NEGERI / WILAYAH" value={stateValue} options={[ALL_STATES, ...registry.states.map((item) => item.name)]} allowCustom={false} onChange={(value) => { setStateValue(value); setParliamentValue(ALL_PARLIAMENTS); setDunValue(ALL_DUNS); }}/>
        <SearchCombobox label="PARLIMEN" value={parliamentValue} options={parliamentOptions} allowCustom={false} onChange={(value) => { setParliamentValue(value); setDunValue(ALL_DUNS); }}/>
        <SearchCombobox label="DUN" value={dunValue} options={dunOptions} allowCustom={false} disabled={model.selectedParliament?.dunIds.length === 0} onChange={setDunValue}/>
      </div>
    </section>

    <section className="age-kpi-grid">
      <article><span>JUMLAH PEMILIH</span><strong>{formatNumber(record.total)}</strong><small>{model.label}</small></article>
      <article><span>KUMPULAN TERBESAR</span><strong>{largestBand === "90+" ? "90+" : largestBand}</strong><small>{formatNumber(record.counts[largestBand])} pemilih</small></article>
      <article><span>BAWAH 30 TAHUN</span><strong>{formatPct(under30 / record.total)}</strong><small>{formatNumber(under30)} pemilih</small></article>
      <article><span>60 TAHUN KE ATAS</span><strong>{formatPct(age60Plus / record.total)}</strong><small>{formatNumber(age60Plus)} pemilih</small></article>
    </section>

    <section className="age-dashboard-grid">
      <article className="panel age-chart-panel"><div className="section-heading"><div><span className="eyebrow">TABURAN UMUR</span><h2>{model.label}</h2><p>{model.context}</p></div><span className="route-count">{formatNumber(record.total)} pemilih</span></div><div className="age-chart"><AgeDistributionChart bands={age.metadata.ageBands} counts={record.counts} label={model.label}/></div></article>
      <article className="panel age-profile-panel"><span className="eyebrow">PROFIL TERPERINCI</span><h2>Bahagian setiap umur</h2><div className="age-profile-list">{age.metadata.ageBands.map((band) => <div key={band}><div><span>{band === "90+" ? "90 tahun ke atas" : `${band} tahun`}</span><strong>{formatPct(record.counts[band] / record.total)}</strong></div><div className="age-profile-track"><i style={{ width: `${(record.counts[band] / Math.max(...Object.values(record.counts))) * 100}%` }}/></div><small>{formatNumber(record.counts[band])}</small></div>)}</div></article>
    </section>

    <section className="panel age-comparison-panel"><div className="section-heading"><div><span className="eyebrow">PERBANDINGAN KAWASAN</span><h2>{model.comparisonTitle}</h2></div><span className="route-count">{model.comparisons.length} rekod</span></div>{model.comparisons.length ? <div className="age-comparison-table-wrap"><table className="age-comparison-table"><thead><tr><th>KAWASAN</th><th>PEMILIH</th><th>BAWAH 30</th><th>30-59</th><th>60+</th><th>KUMPULAN TERBESAR</th></tr></thead><tbody>{model.comparisons.map((item) => { const younger = sumBands(item.record, ["18-20", "21-29"]); const middle = sumBands(item.record, ["30-39", "40-49", "50-59"]); const older = sumBands(item.record, ["60-69", "70-79", "80-89", "90+"]); const largest = age.metadata.ageBands.reduce((current, band) => item.record.counts[band] > item.record.counts[current] ? band : current, age.metadata.ageBands[0]); return <tr key={item.id}><td><span>{item.code}</span><strong>{item.name}</strong></td><td><strong>{formatNumber(item.record.total)}</strong></td><td>{formatPct(younger / item.record.total)}</td><td>{formatPct(middle / item.record.total)}</td><td>{formatPct(older / item.record.total)}</td><td><span className="age-band-badge">{largest}</span></td></tr>; })}</tbody></table></div> : <div className="age-no-dun"><Icon name="info"/><div><strong>Tiada kawasan DUN</strong><p>Wilayah Persekutuan ini direkodkan pada peringkat Parlimen melalui baris N.00 dalam sumber SPR. Tiada nama DUN direka untuk paparan ini.</p></div></div>}</section>

    <section className="seating-source-note age-source-note"><Icon name="database" size={17}/><div><strong>Sumber: {age.metadata.sourceFile}</strong><span>Daftar pemilih sehingga Ogos 2022 · Statistik dikemaskini 9 Oktober 2022 · SHA-256 {age.metadata.sourceSha256.slice(0, 12)}…</span></div></section>
  </>;
}
