import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/ui/Icon";
import { NotFound } from "../components/ui/NotFound";
import { PageTitle } from "../components/ui/PageTitle";
import { useElection } from "../ElectionContext";
import type { ConstituencyRegistry, ElectionData, GeographyData, GeographyPdm, PollingPlacesData, ScoresheetResult } from "../types";
import { formatNumber, formatPct, toSlug } from "../utils";

type GeographyProps = {
  data: ElectionData;
  geography: GeographyData;
  constituencies: ConstituencyRegistry;
  pollingPlaces: PollingPlacesData;
};

export function ParliamentGeography({ seat, geography, constituencies }: { seat: ElectionData["seats"][number]; geography: GeographyData; constituencies: ConstituencyRegistry }) {
  const { paths } = useElection();
  const parliament = constituencies.parliaments.find((item) => item.code === seat.code);
  const duns = constituencies.duns.filter((item) => item.parliamentCode === seat.code);
  const pdms = geography.pdms.filter((item) => item.parliamentCode === seat.code);
  if (!parliament) return null;
  return <section className="explorer-section parliament-geography"><div className="explorer-heading"><div><span className="eyebrow">PECAHAN KAWASAN</span><h2>{duns.length ? `${duns.length} DUN dalam ${seat.name}` : `Daerah mengundi ${seat.name}`}</h2><p>Hierarki rasmi SPR daripada Parlimen kepada {duns.length ? "DUN dan " : ""}daerah mengundi.</p></div><div className="result-count"><strong>{pdms.length}</strong><span>PDM</span></div></div>
    <div className="geography-grid">{duns.length ? duns.map((dun) => {
      const children = pdms.filter((item) => item.dunId === dun.id);
      return <Link className="geography-card dun-card" key={dun.id} to={paths.dun(toSlug(seat.state), toSlug(seat.name), toSlug(dun.name))}><div className="geography-card-code"><span>{dun.code}</span><b>{children.length} PDM</b></div><h3>{dun.name}</h3><div className="geography-card-stats"><span><small>PEMILIH 2022</small><strong>{formatNumber(children.reduce((sum, item) => sum + item.registeredVoters, 0))}</strong></span><span><small>SCORESHEET</small><strong>{children.filter((item) => item.hasScoresheet).length}</strong></span></div><div className="open-seat">Terokai DUN <Icon name="arrow" size={16}/></div></Link>;
    }) : pdms.map((pdm) => <PdmCard key={pdm.id} pdm={pdm} stateName={seat.state} parliamentName={seat.name}/>)}</div>
  </section>;
}

function resolveContext(params: Readonly<Record<string, string | undefined>>, data: ElectionData, constituencies: ConstituencyRegistry) {
  const state = constituencies.states.find((item) => item.id === params.stateName || toSlug(item.name) === params.stateName);
  const parliament = constituencies.parliaments.find((item) => item.stateId === state?.id && toSlug(item.name) === params.parliamentName);
  const seat = data.seats.find((item) => item.code === parliament?.code);
  const dun = constituencies.duns.find((item) => item.parliamentCode === parliament?.code && toSlug(item.name) === params.dunName);
  return { state, parliament, seat, dun };
}

function HierarchyHeader({ stateName, parliamentName, dunName, title, code }: { stateName: string; parliamentName: string; dunName?: string; title: string; code: string }) {
  const { paths } = useElection();
  const parliamentUrl = paths.stateParliament(toSlug(stateName), toSlug(parliamentName));
  return <section className="route-hero geography-hero">
    <div className="breadcrumbs"><Link to={paths.states}>Negeri</Link><span>/</span><Link to={`${paths.states}/${toSlug(stateName)}`}>{stateName}</Link><span>/</span><Link to={parliamentUrl}>{parliamentName}</Link>{dunName && <><span>/</span><strong>{dunName}</strong></>}</div>
    <span className="overline">HIERARKI KAWASAN PILIHAN RAYA</span><h1>{title}</h1><p>{code} · {dunName ? `${dunName} · ` : ""}{parliamentName} · {stateName}</p>
  </section>;
}

function PdmCard({ pdm, stateName, parliamentName, dunName }: { pdm: GeographyPdm; stateName: string; parliamentName: string; dunName?: string }) {
  const { paths } = useElection();
  return <Link className="geography-card" to={paths.pdm(toSlug(stateName), toSlug(parliamentName), pdm.slug, dunName ? toSlug(dunName) : undefined)}>
    <div className="geography-card-code"><span>{pdm.code}</span>{pdm.hasScoresheet && <b>SKOR RASMI</b>}</div>
    <h3>{pdm.name}</h3><div className="geography-card-stats"><span><small>PEMILIH 2022</small><strong>{formatNumber(pdm.registeredVoters)}</strong></span><span><small>PUSAT MENGUNDI</small><strong>{pdm.pollingCentreIds.length || "—"}</strong></span><span><small>LOKALITI DIARKIB</small><strong>{pdm.localityIds.length}</strong></span></div>
    <div className="open-seat">Buka daerah mengundi <Icon name="arrow" size={16}/></div>
  </Link>;
}

export function DunPage(props: GeographyProps) {
  const params = useParams();
  const { state, parliament, dun } = resolveContext(params, props.data, props.constituencies);
  if (!state || !parliament || !dun) return <NotFound label="DUN"/>;
  const pdms = props.geography.pdms.filter((item) => item.dunId === dun.id);
  const registered = pdms.reduce((sum, item) => sum + item.registeredVoters, 0);
  return <>
    <PageTitle title={`${dun.code} ${dun.name}`}/>
    <HierarchyHeader stateName={state.name} parliamentName={parliament.name} dunName={dun.name} title={dun.name} code={dun.code}/>
    <section className="geography-summary"><article><span>DAERAH MENGUNDI</span><strong>{pdms.length}</strong></article><article><span>PEMILIH BERDAFTAR 2022</span><strong>{formatNumber(registered)}</strong></article><article><span>PDM DENGAN SCORESHEET</span><strong>{pdms.filter((item) => item.hasScoresheet).length}</strong></article></section>
    <section className="explorer-section"><div className="explorer-heading"><div><span className="eyebrow">DAERAH MENGUNDI</span><h2>PDM dalam {dun.name}</h2><p>Pilih satu PDM untuk melihat profil pengundi, pusat mengundi dan keputusan scoresheet yang tersedia.</p></div><div className="result-count"><strong>{pdms.length}</strong><span>PDM</span></div></div><div className="geography-grid">{pdms.map((pdm) => <PdmCard key={pdm.id} pdm={pdm} stateName={state.name} parliamentName={parliament.name} dunName={dun.name}/>)}</div></section>
  </>;
}

function usePdmScoresheet(pdm: GeographyPdm | undefined) {
  const { edition } = useElection();
  const [result, setResult] = useState<ScoresheetResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setResult(null); setError("");
    if (!pdm?.hasScoresheet) return;
    let active = true;
    fetch(`${edition.dataPath}/scoresheets/${pdm.parliamentCode}.json`).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((value) => active && setResult(value)).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Ralat tidak diketahui"));
    return () => { active = false; };
  }, [edition.dataPath, pdm]);
  return { result, error };
}

export function PdmPage(props: GeographyProps) {
  const { edition, paths } = useElection();
  const params = useParams();
  const { state, parliament, dun } = resolveContext(params, props.data, props.constituencies);
  const pdm = props.geography.pdms.find((item) => item.parliamentCode === parliament?.code && item.dunId === (dun?.id ?? null) && item.slug === params.pdmName);
  const { result, error } = usePdmScoresheet(pdm);
  const rows = useMemo(() => result?.rows.filter((row) => row.pollingDistrictId === pdm?.id) ?? [], [pdm?.id, result]);
  if (!state || !parliament || (!dun && parliament.dunIds.length) || !pdm) return <NotFound label="PDM"/>;
  const centres = props.pollingPlaces.pollingCentres.filter((item) => pdm.pollingCentreIds.includes(item.id));
  const localities = props.geography.localities.filter((item) => item.pdmId === pdm.id);
  const totals = rows.reduce((total, row) => {
    total.valid += row.validVotes; total.rejected += row.rejectedVotes; total.unreturned += row.unreturnedVotes;
    Object.entries(row.candidateVotes).forEach(([id, votes]) => { total.candidates[id] = (total.candidates[id] ?? 0) + votes; });
    return total;
  }, { valid: 0, rejected: 0, unreturned: 0, candidates: {} as Record<string, number> });
  return <>
    <PageTitle title={`${pdm.code} ${pdm.name}`}/>
    <HierarchyHeader stateName={state.name} parliamentName={parliament.name} dunName={dun?.name} title={pdm.name} code={pdm.code}/>
    <section className="pdm-layout"><article className="panel pdm-profile"><span className="eyebrow">PROFIL PENGUNDI 2022</span><h2>{formatNumber(pdm.registeredVoters)}</h2><p>pemilih berdaftar</p><div className="pdm-facts"><span><small>LELAKI</small><strong>{formatNumber(pdm.gender.male)}</strong></span><span><small>PEREMPUAN</small><strong>{formatNumber(pdm.gender.female)}</strong></span><span><small>18–30 TAHUN</small><strong>{formatNumber(pdm.ageGroups["18-20"] + pdm.ageGroups["21-30"])}</strong></span><span><small>60+ TAHUN</small><strong>{formatNumber(pdm.ageGroups["60+"])}</strong></span></div></article>
      <article className="panel pdm-result"><span className="eyebrow">KEPUTUSAN SCORESHEET {edition.shortTitle}</span>{pdm.hasScoresheet && !result && !error ? <p>Memuatkan keputusan PDM…</p> : error ? <p>Data tidak dapat dimuatkan: {error}</p> : result ? <><div className="pdm-result-kpis"><span><small>UNDI SAH</small><strong>{formatNumber(totals.valid)}</strong></span><span><small>DITOLAK</small><strong>{formatNumber(totals.rejected)}</strong></span><span><small>SALURAN</small><strong>{rows.length}</strong></span></div><div className="pdm-candidates">{result.candidateColumns.map((candidate) => <div key={candidate.candidateId}><span>{candidate.candidateName}</span><strong>{formatNumber(totals.candidates[candidate.candidateId] ?? 0)}</strong><small>{formatPct((totals.candidates[candidate.candidateId] ?? 0) / Math.max(1, totals.valid), 2)}</small></div>)}</div></> : <p>Scoresheet belum tersedia untuk PDM ini. Profil daftar pemilih rasmi masih boleh diterokai.</p>}</article>
    </section>
    <section className="pdm-directory-grid"><article className="panel geography-list"><div className="section-heading"><div><span className="eyebrow">PUSAT MENGUNDI</span><h2>{centres.length ? `${centres.length} pusat` : "Belum diarkib"}</h2></div></div>{centres.map((centre) => <div key={centre.id}><strong>{centre.name}</strong><span>{centre.streamCount} saluran</span></div>)}{!centres.length && <p>Maklumat pusat akan muncul apabila scoresheet Parlimen ini tersedia.</p>}</article>
      <article className="panel geography-list"><div className="section-heading"><div><span className="eyebrow">LOKALITI RASMI</span><h2>{localities.length ? `${localities.length} lokaliti` : "Liputan belum tersedia"}</h2></div></div>{localities.map((locality) => <Link key={locality.id} to={paths.locality(toSlug(state.name), toSlug(parliament.name), pdm.slug, locality.slug, dun ? toSlug(dun.name) : undefined)}><span>{locality.code}</span><strong>{locality.name}</strong><Icon name="arrow" size={15}/></Link>)}{!localities.length && <p>Tiada lokaliti direka atau disimpulkan. Ia hanya dipaparkan selepas sumber DPT rasmi diarkibkan.</p>}</article></section>
  </>;
}

export function LocalityPage(props: GeographyProps) {
  const params = useParams();
  const { state, parliament, dun } = resolveContext(params, props.data, props.constituencies);
  const pdm = props.geography.pdms.find((item) => item.parliamentCode === parliament?.code && item.dunId === (dun?.id ?? null) && item.slug === params.pdmName);
  const locality = props.geography.localities.find((item) => item.pdmId === pdm?.id && item.slug === params.localityName);
  if (!state || !parliament || !pdm || !locality) return <NotFound label="Lokaliti"/>;
  return <>
    <PageTitle title={locality.name}/>
    <HierarchyHeader stateName={state.name} parliamentName={parliament.name} dunName={dun?.name} title={locality.name} code={`Lokaliti ${locality.code}`}/>
    <section className="locality-panel panel"><span className="eyebrow">LOKALITI DALAM PDM {pdm.name}</span><h2>{locality.name}</h2><dl><div><dt>Kod lokaliti</dt><dd>{locality.code}</dd></div><div><dt>Daerah mengundi</dt><dd>{pdm.code} {pdm.name}</dd></div><div><dt>Sumber</dt><dd>{locality.sourceLabel}</dd></div><div><dt>Tarikh sumber</dt><dd>{locality.publishedAt}</dd></div></dl><a href={locality.sourceUrl} target="_blank" rel="noreferrer">Buka dokumen DPT rasmi SPR ↗</a><p>Maklumat lokaliti ini ialah lapisan DPT bertarikh {locality.publishedAt}; ia tidak digunakan untuk mengubah keputusan sejarah {props.data.metadata.shortTitle}.</p></section>
  </>;
}
