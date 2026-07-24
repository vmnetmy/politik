import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { ElectionComparisonChart, type ComparisonChartMetric, type ComparisonChartSeries } from "../components/charts/ElectionComparisonChart";
import { ComparisonEditionPicker, comparisonEditionColor, ComparisonMetricTabs } from "../components/comparison/ComparisonControls";
import { AllianceLogo } from "../components/identity";
import { Icon } from "../components/ui/Icon";
import { PageTitle } from "../components/ui/PageTitle";
import { SearchCombobox } from "../components/ui/SearchCombobox";
import { summarizeElectionSeats } from "../data/electionAnalysis";
import { useFederalElectionComparisonData, type PublishedFederalElection } from "../data/hooks/useFederalElectionComparisonData";
import { electionBase, stateBase } from "../routes";
import type { Seat } from "../types";
import { allianceColor, formatCompact, formatNumber, formatPct, shortAlliance, toSlug } from "../utils";

const ALL_METRICS: Array<{ id: ComparisonChartMetric; label: string }> = [
  { id: "kerusi", label: "Kerusi" },
  { id: "turnout", label: "Keluar mengundi" },
  { id: "pemilih", label: "Pemilih" },
  { id: "calon", label: "Calon" },
  { id: "undi", label: "Undi sah" },
];

const ALLIANCE_METRICS: Array<{ id: ComparisonChartMetric; label: string }> = [
  { id: "kerusi", label: "Kerusi" },
  { id: "undi", label: "Undi" },
  { id: "bahagian", label: "Bahagian undi" },
  { id: "calon", label: "Calon" },
];

type FederalComparisonModel = {
  record: PublishedFederalElection;
  seats: Seat[];
  seatCounts: Map<string, number>;
  registered: number;
  turnoutPct: number;
  validVotes: number;
  candidates: number;
  allianceSeats: number;
  allianceVotes: number;
  allianceShare: number;
  allianceCandidates: number;
};

function formatSigned(value: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}${suffix}`;
}

function formatSignedDecimal(value: number, digits: number, suffix = "") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function metricTitle(metric: ComparisonChartMetric, alliance?: string) {
  if (metric === "kerusi") return alliance ? `Kerusi dimenangi ${alliance}` : "Perubahan komposisi Dewan Rakyat";
  if (metric === "turnout") return "Perubahan kadar keluar mengundi";
  if (metric === "pemilih") return "Pertumbuhan daftar pemilih";
  if (metric === "calon") return alliance ? `Calon bertanding atas tiket ${alliance}` : "Bilangan calon bertanding";
  if (metric === "bahagian") return `Bahagian undi ${alliance}`;
  return alliance ? `Undi untuk tiket ${alliance}` : "Jumlah undi sah";
}

function modelValue(model: FederalComparisonModel, metric: ComparisonChartMetric, allianceMode: boolean) {
  if (metric === "kerusi") return allianceMode ? model.allianceSeats : model.seats.length;
  if (metric === "turnout") return model.turnoutPct * 100;
  if (metric === "pemilih") return model.registered;
  if (metric === "calon") return allianceMode ? model.allianceCandidates : model.candidates;
  if (metric === "bahagian") return model.allianceShare * 100;
  return allianceMode ? model.allianceVotes : model.validVotes;
}

function resolveAllianceName(record: PublishedFederalElection, shortName: string) {
  return record.data.alliances.find((alliance) => alliance.shortName === shortName)?.name;
}

function FederalEditionCard({
  model,
  color,
  state,
  alliance,
}: {
  model: FederalComparisonModel;
  color: string;
  state?: string;
  alliance?: string;
}) {
  const { data, edition } = model.record;
  const href = state ? `${stateBase(edition.number)}/${toSlug(state)}` : electionBase(edition.number);
  const leading = [...model.seatCounts.entries()].sort((first, second) => second[1] - first[1]).slice(0, 4);
  return <motion.article
    layout
    className="comparison-edition-card federal-comparison-card"
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, scale: .97 }}
    transition={{ type: "spring", stiffness: 330, damping: 31 }}
  >
    <div className="comparison-edition-card-head"><span>{edition.shortTitle}</span><i style={{ background: color }}/></div>
    <div className="comparison-edition-logos">{leading.map(([shortName, seats]) => {
      const name = resolveAllianceName(model.record, shortName) ?? shortName;
      return <span key={shortName}><AllianceLogo name={name} data={data}/><b>{seats}</b></span>;
    })}</div>
    <dl>
      <div><dt>{alliance ? "Kerusi dimenangi" : "Kerusi Parlimen"}</dt><dd>{formatNumber(alliance ? model.allianceSeats : model.seats.length)}</dd></div>
      <div><dt>{alliance ? "Bahagian undi" : "Pemilih"}</dt><dd>{alliance ? formatPct(model.allianceShare, 1) : formatCompact(model.registered)}</dd></div>
      <div><dt>{alliance ? "Undi" : "Keluar mengundi"}</dt><dd>{alliance ? formatCompact(model.allianceVotes) : formatPct(model.turnoutPct, 1)}</dd></div>
      <div><dt>Calon</dt><dd>{formatNumber(alliance ? model.allianceCandidates : model.candidates)}</dd></div>
    </dl>
    <Link to={href}>Lihat keputusan <Icon name="arrow" size={15}/></Link>
  </motion.article>;
}

export function FederalElectionComparisonPage() {
  const { value, error } = useFederalElectionComparisonData();
  const [searchParams, setSearchParams] = useSearchParams();
  if (error) return <section className="scoresheet-unavailable is-error"><Icon name="info" size={20}/><div><strong>Data perbandingan PRU tidak dapat dimuatkan</strong><p>{error}</p></div></section>;
  if (!value) return <section className="route-loading">Menyusun perbandingan pilihan raya umum…</section>;
  if (value.length < 2) return <section className="panel empty-state"><Icon name="info" size={28}/><h2>Perbandingan memerlukan dua edisi</h2><p>Terbitkan sekurang-kurangnya dua dataset PRU dalam katalog pilihan raya.</p></section>;

  const availableNumbers = value.map((record) => record.edition.number);
  const requestedNumbers = (searchParams.get("edisi") ?? availableNumbers.join(","))
    .split(",")
    .map(Number)
    .filter((number) => availableNumbers.includes(number));
  const uniqueRequestedNumbers = new Set(requestedNumbers);
  const selectedNumbers = uniqueRequestedNumbers.size >= 2
    ? [...uniqueRequestedNumbers].sort((first, second) => first - second)
    : availableNumbers;
  const selectedRecords = value.filter((record) => selectedNumbers.includes(record.edition.number));
  const editionColors = new Map(availableNumbers.map((number) => [number, comparisonEditionColor(number, availableNumbers)]));

  const states = [...new Set(value.flatMap((record) => record.data.seats.map((seat) => seat.state)))].sort();
  const requestedState = searchParams.get("negeri") ?? "";
  const selectedState = states.find((state) => toSlug(state) === requestedState);
  const allianceCodes = [...new Set(value.flatMap((record) => record.data.alliances.map((alliance) => alliance.shortName)))].sort();
  const requestedAlliance = searchParams.get("gabungan") ?? "";
  const selectedAlliance = allianceCodes.find((alliance) => toSlug(alliance) === requestedAlliance);
  const metricOptions = selectedAlliance ? ALLIANCE_METRICS : ALL_METRICS;
  const requestedMetric = searchParams.get("metrik") as ComparisonChartMetric | null;
  const metric = metricOptions.some((option) => option.id === requestedMetric) ? requestedMetric! : "kerusi";

  const models = selectedRecords.map((record): FederalComparisonModel => {
    const seats = selectedState ? record.data.seats.filter((seat) => seat.state === selectedState) : record.data.seats;
    const summary = summarizeElectionSeats(seats, "historical");
    const seatCounts = Object.entries(summary.seatCounts).reduce((counts, [name, count]) => {
      const code = shortAlliance(name, record.data.alliances);
      counts.set(code, (counts.get(code) ?? 0) + count);
      return counts;
    }, new Map<string, number>());
    const allianceName = selectedAlliance ? resolveAllianceName(record, selectedAlliance) : undefined;
    const allianceCandidates = allianceName
      ? seats.flatMap((seat) => seat.candidates).filter((candidate) => candidate.alliance === allianceName)
      : [];
    const allianceVotes = allianceCandidates.reduce((sum, candidate) => sum + candidate.votes, 0);
    return {
      record,
      seats,
      seatCounts,
      registered: summary.registered,
      turnoutPct: summary.turnoutPct,
      validVotes: summary.validVotes,
      candidates: summary.candidateCount,
      allianceSeats: allianceName ? seats.filter((seat) => seat.winner.alliance === allianceName).length : 0,
      allianceVotes,
      allianceShare: summary.validVotes ? allianceVotes / summary.validVotes : 0,
      allianceCandidates: allianceCandidates.length,
    };
  });

  const chart = (() => {
    if (metric === "kerusi" && !selectedAlliance) {
      const codes = [...new Set(models.flatMap((model) => [...model.seatCounts.keys()]))];
      const series: ComparisonChartSeries[] = codes
        .map((code) => {
          const source = models.find((model) => resolveAllianceName(model.record, code));
          const name = source ? resolveAllianceName(source.record, code)! : code;
          return {
            label: code,
            data: models.map((model) => model.seatCounts.get(code) ?? 0),
            color: source ? allianceColor(name, source.record.data.alliances) : "#7b8580",
            stack: "mandat",
          };
        })
        .sort((first, second) => second.data.reduce((sum, count) => sum + (count ?? 0), 0) - first.data.reduce((sum, count) => sum + (count ?? 0), 0));
      return { series, stacked: true, horizontal: true };
    }
    return {
      series: [{
        label: selectedAlliance ?? selectedState ?? "Malaysia",
        data: models.map((model) => modelValue(model, metric, Boolean(selectedAlliance))),
        color: selectedAlliance
          ? (() => {
              const source = models.find((model) => resolveAllianceName(model.record, selectedAlliance));
              const name = source ? resolveAllianceName(source.record, selectedAlliance)! : selectedAlliance;
              return source ? allianceColor(name, source.record.data.alliances) : "#2f69a3";
            })()
          : "#2f69a3",
      }],
      stacked: false,
      horizontal: false,
    };
  })();

  const toggleEdition = (edition: number) => {
    const nextNumbers = selectedNumbers.includes(edition)
      ? selectedNumbers.filter((number) => number !== edition)
      : [...selectedNumbers, edition].sort((first, second) => first - second);
    if (nextNumbers.length < 2) return;
    const next = new URLSearchParams(searchParams);
    next.set("edisi", nextNumbers.join(","));
    setSearchParams(next, { replace: true });
  };
  const updateParam = (key: string, nextValue: string) => {
    const next = new URLSearchParams(searchParams);
    if (nextValue) next.set(key, nextValue);
    else next.delete(key);
    if (key === "gabungan") next.delete("metrik");
    setSearchParams(next, { replace: true });
  };

  const firstModel = models[0];
  const lastModel = models.at(-1)!;
  const voterGrowth = firstModel.registered ? ((lastModel.registered / firstModel.registered) - 1) * 100 : 0;
  const scopeTitle = selectedAlliance ? `Tiket ${selectedAlliance}` : selectedState ?? "Malaysia";
  const chartTitle = metricTitle(metric, selectedAlliance);

  return <MotionConfig reducedMotion="user">
    <PageTitle title={`Perbandingan PRU · ${scopeTitle}`}/>
    <section className="route-hero comparison-hero federal-comparison-hero">
      <div className="breadcrumbs"><Link to="/pru">PRU</Link><span>/</span><strong>Perbandingan</strong></div>
      <span className="overline">ANALISIS RENTAS PILIHAN RAYA</span>
      <h1>Bandingkan PRU.<br/><em>{selectedRecords.length} edisi.</em></h1>
      <p>Snapshot keputusan pada hari mengundi dibandingkan secara terus, tanpa memasukkan pertukaran parti atau kedudukan semasa.</p>
      <div className="route-stat-row"><div><span>EDISI</span><strong>{selectedRecords.length}</strong></div><div><span>SKOP</span><strong>{scopeTitle}</strong></div><div><span>REKOD KERUSI</span><strong>{formatNumber(models.reduce((sum, model) => sum + model.seats.length, 0))}</strong></div><div><span>CALON</span><strong>{formatNumber(models.reduce((sum, model) => sum + model.candidates, 0))}</strong></div></div>
    </section>

    <section className="panel comparison-controls">
      <ComparisonEditionPicker
        editions={value.map((record) => ({ id: record.edition.number, label: record.edition.shortTitle, color: editionColors.get(record.edition.number) }))}
        selected={selectedNumbers}
        onToggle={toggleEdition}
      />
      <div className="comparison-scope-filters federal-comparison-filters">
        <SearchCombobox label="NEGERI / WILAYAH" value={selectedState ?? "SEMUA NEGERI / WILAYAH"} options={["SEMUA NEGERI / WILAYAH", ...states]} onChange={(state) => updateParam("negeri", state === "SEMUA NEGERI / WILAYAH" ? "" : toSlug(state))} allowCustom={false}/>
        <SearchCombobox label="GABUNGAN / TIKET" value={selectedAlliance ?? "SEMUA GABUNGAN / TIKET"} options={["SEMUA GABUNGAN / TIKET", ...allianceCodes]} onChange={(alliance) => updateParam("gabungan", alliance === "SEMUA GABUNGAN / TIKET" ? "" : toSlug(alliance))} allowCustom={false}/>
      </div>
    </section>

    <section className="panel federal-comparison-shift" aria-label={`Perubahan daripada ${firstModel.record.edition.shortTitle} kepada ${lastModel.record.edition.shortTitle}`}>
      <div><span>PERUBAHAN</span><strong>{firstModel.record.edition.shortTitle} → {lastModel.record.edition.shortTitle}</strong></div>
      <motion.article layout><span>PERTUMBUHAN PEMILIH</span><strong>{voterGrowth > 0 ? "+" : ""}{voterGrowth.toFixed(1)}%</strong><small>{formatSigned(lastModel.registered - firstModel.registered)} orang</small></motion.article>
      <motion.article layout><span>KELUAR MENGUNDI</span><strong>{formatSignedDecimal((lastModel.turnoutPct - firstModel.turnoutPct) * 100, 1, " mata")}</strong><small>{formatPct(firstModel.turnoutPct, 1)} → {formatPct(lastModel.turnoutPct, 1)}</small></motion.article>
      <motion.article layout><span>CALON</span><strong>{formatSigned(lastModel.candidates - firstModel.candidates)}</strong><small>{formatNumber(firstModel.candidates)} → {formatNumber(lastModel.candidates)}</small></motion.article>
    </section>

    <section className="panel comparison-chart-panel">
      <div className="section-heading comparison-chart-heading"><div><span className="eyebrow">CARTA PERBANDINGAN</span><h2>{chartTitle}</h2><p>Pilih metrik untuk melihat perubahan skala, penyertaan dan mandat antara edisi.</p></div><ComparisonMetricTabs options={metricOptions} selected={metric} layoutId="pru-comparison-metric-active" onChange={(nextMetric) => updateParam("metrik", nextMetric)}/></div>
      <AnimatePresence mode="wait"><motion.div key={`${metric}-${selectedNumbers.join("-")}-${scopeTitle}`} className="comparison-chart" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .22 }}>
        <ElectionComparisonChart labels={models.map((model) => model.record.edition.shortTitle)} series={chart.series} metric={metric} stacked={chart.stacked} horizontal={chart.horizontal} ariaLabel={`${chartTitle} bagi ${scopeTitle}`}/>
      </motion.div></AnimatePresence>
    </section>

    <section className="comparison-edition-grid federal-comparison-edition-grid" aria-label="Ringkasan setiap PRU">
      <AnimatePresence initial={false}>{models.map((model) => <FederalEditionCard key={model.record.edition.id} model={model} color={editionColors.get(model.record.edition.number)!} state={selectedState} alliance={selectedAlliance}/>)}</AnimatePresence>
    </section>

    {!selectedState && !selectedAlliance && <section className="panel comparison-matrix">
      <div className="section-heading"><div><span className="eyebrow">PERUBAHAN NEGERI</span><h2>Pendahulu mengikut edisi</h2><p>Agihan menggunakan gabungan yang direkodkan ketika setiap PRU.</p></div></div>
      <div className="comparison-matrix-scroll"><div className="comparison-matrix-grid" style={{ "--edition-count": models.length } as React.CSSProperties}>
        <div className="comparison-matrix-head"><span>NEGERI / WILAYAH</span>{models.map((model) => <strong key={model.record.edition.id}>{model.record.edition.shortTitle}</strong>)}</div>
        {states.map((state) => <div className="comparison-matrix-row" key={state}><button type="button" onClick={() => updateParam("negeri", toSlug(state))}>{state}</button>{models.map((model) => {
          const seats = model.record.data.seats.filter((seat) => seat.state === state);
          if (!seats.length) return <div className="comparison-matrix-na" key={model.record.edition.id}><span>Tiada kawasan</span></div>;
          const summary = summarizeElectionSeats(seats, "historical");
          const [leader, count] = Object.entries(summary.seatCounts).sort((first, second) => second[1] - first[1])[0];
          return <motion.div layout className="comparison-matrix-value" key={model.record.edition.id}><AllianceLogo name={leader} data={model.record.data}/><strong>{count} / {seats.length}</strong><span>{formatPct(summary.turnoutPct, 1)}</span></motion.div>;
        })}</div>)}
      </div></div>
    </section>}

    <aside className="storage-note comparison-note"><Icon name="info" size={19}/><div><strong>Snapshot sejarah yang terasing</strong><p>Setiap lajur menggunakan keputusan dan gabungan pada tarikh PRU tersebut. Pembetulan status kerusi serta keahlian semasa tidak mengubah perbandingan sejarah.</p></div></aside>
  </MotionConfig>;
}
