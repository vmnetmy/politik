export const ELECTION_BASE = "/pru/15";
export const WINNERS_BASE = `${ELECTION_BASE}/pemenang`;
export const STATE_BASE = `${ELECTION_BASE}/negeri`;
export const PARLIAMENT_BASE = `${STATE_BASE}/parlimen`;
export const VOTER_AGE_BASE = `${ELECTION_BASE}/pengundi/umur`;
export const PRN_BASE = "/prn";

export function stateElectionPath(stateSlug: string, assemblyNumber: number | string) {
  return `${PRN_BASE}/${assemblyNumber}/${stateSlug}/`;
}

export function stateDunResultPath(stateSlug: string, assemblyNumber: number | string, dunSlug: string) {
  return `${stateElectionPath(stateSlug, assemblyNumber)}dun/${dunSlug}`;
}

export function stateParliamentPath(stateSlug: string, parliamentSlug: string) {
  return `${STATE_BASE}/${stateSlug}/parlimen/${parliamentSlug}`;
}

export function dunPath(stateSlug: string, parliamentSlug: string, dunSlug: string) {
  return `${stateParliamentPath(stateSlug, parliamentSlug)}/dun/${dunSlug}`;
}

export function pdmPath(stateSlug: string, parliamentSlug: string, pdmSlug: string, dunSlug?: string) {
  const parent = dunSlug ? dunPath(stateSlug, parliamentSlug, dunSlug) : stateParliamentPath(stateSlug, parliamentSlug);
  return `${parent}/pdm/${pdmSlug}`;
}

export function localityPath(stateSlug: string, parliamentSlug: string, pdmSlug: string, localitySlug: string, dunSlug?: string) {
  return `${pdmPath(stateSlug, parliamentSlug, pdmSlug, dunSlug)}/lokaliti/${localitySlug}`;
}
