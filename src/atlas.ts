import type { AtlasElectionType, AtlasMetric, AtlasUrlState } from "./data/types/atlas";

export const ATLAS_METRICS: Array<{ id: AtlasMetric; label: string }> = [
  { id: "pemenang", label: "Pemenang" },
  { id: "majoriti", label: "Majoriti" },
  { id: "keluar-mengundi", label: "Keluar mengundi" },
  { id: "bertukar", label: "Bertukar tangan" },
  { id: "perubahan-majoriti", label: "Δ Majoriti" },
  { id: "perubahan-turnout", label: "Δ Turnout" },
  { id: "swing", label: "Swing undi" },
];

export const ATLAS_COMPARISON_METRICS = new Set<AtlasMetric>(["bertukar", "perubahan-majoriti", "perubahan-turnout", "swing"]);

export function readAtlasUrlState(
  params: URLSearchParams,
  editions: Record<AtlasElectionType, number[]>,
): AtlasUrlState {
  const electionType: AtlasElectionType = params.get("jenis") === "prn" ? "prn" : "pru";
  const available = editions[electionType];
  const requestedEdition = Number(params.get("edisi"));
  const edition = available.includes(requestedEdition) ? requestedEdition : available[0];
  const requestedMetric = params.get("mod");
  const metric: AtlasMetric = ATLAS_METRICS.some((item) => item.id === requestedMetric)
    ? requestedMetric as AtlasMetric
    : "pemenang";
  const requestedCompareEdition = Number(params.get("banding"));
  const compareEdition = requestedCompareEdition !== edition && available.includes(requestedCompareEdition)
    ? requestedCompareEdition
    : available.find((number) => number !== edition) ?? null;
  return {
    electionType,
    edition,
    metric,
    stateId: params.get("negeri") ?? "",
    seatId: params.get("kerusi") ?? "",
    dunId: params.get("dun") ?? "",
    pdmId: params.get("pdm") ?? "",
    localityId: params.get("lokaliti") ?? "",
    compareEdition,
  };
}

export function atlasSearchParams(state: AtlasUrlState) {
  const params = new URLSearchParams();
  params.set("jenis", state.electionType);
  params.set("edisi", String(state.edition));
  params.set("mod", state.metric);
  if (state.stateId) params.set("negeri", state.stateId);
  if (state.seatId) params.set("kerusi", state.seatId);
  if (state.dunId) params.set("dun", state.dunId);
  if (state.pdmId) params.set("pdm", state.pdmId);
  if (state.localityId) params.set("lokaliti", state.localityId);
  if (ATLAS_COMPARISON_METRICS.has(state.metric) && state.compareEdition !== null) params.set("banding", String(state.compareEdition));
  return params;
}

export function atlasStateWith(
  state: AtlasUrlState,
  patch: Partial<AtlasUrlState>,
): AtlasUrlState {
  const next = { ...state, ...patch };
  if (
    (patch.electionType !== undefined && patch.electionType !== state.electionType)
    || (patch.edition !== undefined && patch.edition !== state.edition)
  ) {
    if (patch.stateId === undefined) next.stateId = "";
    if (patch.seatId === undefined) next.seatId = "";
    if (patch.dunId === undefined) next.dunId = "";
    if (patch.pdmId === undefined) next.pdmId = "";
    if (patch.localityId === undefined) next.localityId = "";
  } else if (patch.stateId !== undefined && patch.stateId !== state.stateId) {
    if (patch.seatId === undefined) next.seatId = "";
    if (patch.dunId === undefined) next.dunId = "";
    if (patch.pdmId === undefined) next.pdmId = "";
    if (patch.localityId === undefined) next.localityId = "";
  } else if (patch.seatId !== undefined && patch.seatId !== state.seatId) {
    if (patch.dunId === undefined) next.dunId = "";
    if (patch.pdmId === undefined) next.pdmId = "";
    if (patch.localityId === undefined) next.localityId = "";
  } else if (patch.dunId !== undefined && patch.dunId !== state.dunId) {
    if (patch.pdmId === undefined) next.pdmId = "";
    if (patch.localityId === undefined) next.localityId = "";
  } else if (patch.pdmId !== undefined && patch.pdmId !== state.pdmId) {
    if (patch.localityId === undefined) next.localityId = "";
  }
  return next;
}

export function quantileThresholds(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [0, 0, 0];
  return [0.25, 0.5, 0.75].map((position) => {
    const index = (sorted.length - 1) * position;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  });
}

export function thresholdIndex(value: number, thresholds: number[]) {
  return thresholds.findIndex((threshold) => value <= threshold) === -1
    ? thresholds.length
    : thresholds.findIndex((threshold) => value <= threshold);
}
