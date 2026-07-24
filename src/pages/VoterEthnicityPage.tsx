import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { VoterDimensionNav } from "../components/voters/VoterDimensionNav";
import type { ConstituencyRegistry, DunReference, ParliamentReference, VoterAgeData } from "../data/types/voterAge";
import type { VoterEthnicityData } from "../data/types/voterEthnicity";
import { useElection } from "../ElectionContext";
import { formatNumber } from "../utils";

const ALL_STATES = "SELURUH MALAYSIA";
const ALL_PARLIAMENTS = "SEMUA PARLIMEN";
const ALL_DUNS = "SEMUA DUN";

type LoadedData = {
  registry: ConstituencyRegistry;
  age: VoterAgeData;
  ethnicity: VoterEthnicityData;
};

function displayParliament(item: ParliamentReference) {
  return `${item.code} ${item.name}`;
}

function displayDun(item: DunReference) {
  return `${item.code} ${item.name}`;
}

export function VoterEthnicityPage() {
  const { edition, paths } = useElection();
  const [loaded, setLoaded] = useState<LoadedData | null>(null);
  const [error, setError] = useState("");
  const [stateValue, setStateValue] = useState(ALL_STATES);
  const [parliamentValue, setParliamentValue] = useState(ALL_PARLIAMENTS);
  const [dunValue, setDunValue] = useState(ALL_DUNS);

  useEffect(() => {
    Promise.all([
      fetch(`${edition.dataPath}/constituencies.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch(`${edition.dataPath}/voter-age.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
      fetch(`${edition.dataPath}/voter-ethnicity.json`).then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }),
    ]).then(([registry, age, ethnicity]) => setLoaded({ registry, age, ethnicity })).catch((reason) => setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
  }, [edition.dataPath]);

  const model = useMemo(() => {
    if (!loaded) return null;
    const { registry, age } = loaded;
    const selectedState = registry.states.find((item) => item.name === stateValue);
    const stateParliaments = selectedState
      ? selectedState.parliamentCodes.map((code) => registry.parliaments.find((item) => item.code === code)).filter((item): item is ParliamentReference => Boolean(item))
      : registry.parliaments;
    const selectedParliament = stateParliaments.find((item) => displayParliament(item) === parliamentValue);
    const availableDuns = selectedParliament
      ? selectedParliament.dunIds.map((id) => registry.duns.find((item) => item.id === id)).filter((item): item is DunReference => Boolean(item))
      : selectedState ? registry.duns.filter((item) => item.stateId === selectedState.id) : registry.duns;
    const selectedDun = availableDuns.find((item) => displayDun(item) === dunValue);
    const record = selectedDun
      ? age.dunRecords.find((item) => item.dunId === selectedDun.id)
      : selectedParliament
        ? age.parliamentRecords.find((item) => item.parliamentCode === selectedParliament.code)
        : selectedState
          ? age.stateRecords.find((item) => item.stateId === selectedState.id)
          : age.national;
    const label = selectedDun
      ? displayDun(selectedDun)
      : selectedParliament
        ? displayParliament(selectedParliament)
        : selectedState?.name ?? "MALAYSIA";
    const level = selectedDun ? "DUN" : selectedParliament ? "PARLIMEN" : selectedState ? "NEGERI / WILAYAH" : "NASIONAL";
    return { selectedState, selectedParliament, stateParliaments, availableDuns, record, label, level };
  }, [dunValue, loaded, parliamentValue, stateValue]);

  if (error) return <section className="panel age-loading age-error"><Icon name="info"/><div><h2>Data bangsa tidak dapat dimuatkan</h2><p>{error}</p></div></section>;
  if (!loaded || !model) return <section className="panel age-loading"><span className="pulse-dot"/><p>Memuatkan semakan data bangsa pemilih…</p></section>;

  const { registry, ethnicity } = loaded;
  const total = model.record?.total ?? ethnicity.metadata.totalRegistered;

  return <>
    <PageTitle title={`Bangsa pengundi ${edition.shortTitle}`}/>
    <section className="route-hero age-route-hero ethnicity-route-hero">
      <div className="breadcrumbs"><Link to={paths.election}>{edition.shortTitle}</Link><span>/</span><strong>Pengundi</strong><span>/</span><strong>Kaum</strong></div>
      <span className="overline">SUMBER RASMI SPR · SEMAKAN 22 JULAI 2026</span>
      <h1>Bangsa pengundi<br/><em>{edition.shortTitle}</em></h1>
      <p>SPR merekod sembilan kategori Bangsa dalam MySPR. Portal data terbukanya belum menerbitkan bilangan agregat kategori itu mengikut kawasan.</p>
      <div className="route-stat-row"><div><span>KATEGORI RASMI</span><strong>{ethnicity.categories.length}</strong></div><div><span>REKOD AGREGAT</span><strong>0</strong></div><div><span>PARLIMEN</span><strong>{registry.parliaments.length}</strong></div><div><span>STATUS</span><strong>BELUM TERBIT</strong></div></div>
    </section>

    <VoterDimensionNav/>

    <section className="panel age-filter-panel" aria-label="Pilih kawasan semakan bangsa">
      <div><span className="eyebrow">PILIH KAWASAN</span><h2>Semak liputan data rasmi</h2><p>Nama dan kod kawasan menggunakan registry PRU-15 yang sama dengan halaman umur.</p></div>
      <div className="age-filter-grid">
        <SearchCombobox label="NEGERI / WILAYAH" value={stateValue} options={[ALL_STATES, ...registry.states.map((item) => item.name)]} allowCustom={false} onChange={(value) => { setStateValue(value); setParliamentValue(ALL_PARLIAMENTS); setDunValue(ALL_DUNS); }}/>
        <SearchCombobox label="PARLIMEN" value={parliamentValue} options={[ALL_PARLIAMENTS, ...model.stateParliaments.map(displayParliament)]} allowCustom={false} onChange={(value) => { setParliamentValue(value); setDunValue(ALL_DUNS); }}/>
        <SearchCombobox label="DUN" value={dunValue} options={[ALL_DUNS, ...model.availableDuns.map(displayDun)]} allowCustom={false} disabled={model.selectedParliament?.dunIds.length === 0} onChange={setDunValue}/>
      </div>
    </section>

    <section className="age-kpi-grid ethnicity-kpi-grid">
      <article><span>KAWASAN DIPILIH</span><strong>{model.label}</strong><small>{model.level}</small></article>
      <article><span>PEMILIH BERDAFTAR</span><strong>{formatNumber(total)}</strong><small>Jumlah rasmi, bukan pecahan bangsa</small></article>
      <article><span>KATEGORI BANGSA</span><strong>{ethnicity.categories.length}</strong><small>Taksonomi borang MySPR</small></article>
      <article><span>ANGKA KAUM</span><strong>TIADA</strong><small>Tidak diterbitkan secara agregat</small></article>
    </section>

    <section className="ethnicity-content-grid">
      <article className="panel ethnicity-status-panel">
        <span className="eyebrow">STATUS DATA RASMI</span>
        <div className="ethnicity-status-callout"><Icon name="info" size={24}/><div><h2>Tiada angka agregat rasmi untuk dipaparkan</h2><p>Dataset pendaftaran pemilih SPR yang diterbitkan mengandungi negeri, Parlimen, DUN, jantina, umur dan jenis pemilih—tetapi tiada medan Bangsa. Politik.my tidak akan mengira atau menganggar bangsa daripada nama, lokasi atau data penduduk.</p></div></div>
        <dl className="ethnicity-coverage-list">
          {ethnicity.metadata.publishedDimensions.map((dimension) => <div key={dimension}><dt>{dimension}</dt><dd>DITERBITKAN</dd></div>)}
          <div className="is-missing"><dt>bangsa / kaum</dt><dd>BELUM DITERBITKAN</dd></div>
        </dl>
      </article>

      <article className="panel ethnicity-taxonomy-panel">
        <span className="eyebrow">TAKSONOMI MYSPR</span>
        <h2>Kategori Bangsa rasmi</h2>
        <p>Label di bawah mengikuti manual pengguna MySPR; ia bukan nilai atau peratus bagi kawasan yang dipilih.</p>
        <ol>{ethnicity.categories.map((category, index) => <li key={category.id}><span>{String(index + 1).padStart(2, "0")}</span><strong>{category.label}</strong></li>)}</ol>
      </article>
    </section>

    <section className="seating-source-note age-source-note ethnicity-source-note"><Icon name="database" size={17}/><div><strong>Sumber rasmi SPR · disemak {ethnicity.metadata.checkedAt}</strong><span><a href={ethnicity.metadata.sourceCatalogueUrl} target="_blank" rel="noreferrer">Katalog Pendaftaran Pemilih</a> · <a href={ethnicity.metadata.sourceTaxonomyUrl} target="_blank" rel="noreferrer">Manual Pengguna MySPR</a></span></div></section>
  </>;
}
