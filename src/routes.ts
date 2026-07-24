import { DEFAULT_ELECTION_NUMBER } from "./elections";

export const PRU_BASE = "/pru";
export const PRU_COMPARISON_BASE = `${PRU_BASE}/perbandingan`;
export const PRN_BASE = "/prn";
export const PRN_COMPARISON_BASE = `${PRN_BASE}/perbandingan`;
export const ATLAS_BASE = "/peta";

export const stateElectionEditionPath = (assemblyNumber: number | string) => `${PRN_BASE}/${assemblyNumber}`;
export const stateElectionComparisonPath = () => PRN_COMPARISON_BASE;
export const stateElectionStateComparisonPath = (stateSlug: string) => `${PRN_COMPARISON_BASE}/negeri/${stateSlug}`;
export const stateElectionDunComparisonPath = (stateSlug: string, dunSlug: string) => `${stateElectionStateComparisonPath(stateSlug)}/dun/${dunSlug}`;
export const stateElectionPartyComparisonPath = (partySlug: string) => `${PRN_COMPARISON_BASE}/parti/${partySlug}`;

export const federalElectionComparisonPath = () => PRU_COMPARISON_BASE;
export const electionBase = (electionNumber: number | string) => `${PRU_BASE}/${electionNumber}`;
export const winnersBase = (electionNumber: number | string) => `${electionBase(electionNumber)}/pemenang`;
export const stateBase = (electionNumber: number | string) => `${electionBase(electionNumber)}/negeri`;
export const parliamentBase = (electionNumber: number | string) => `${stateBase(electionNumber)}/parlimen`;
export const votersBase = (electionNumber: number | string) => `${electionBase(electionNumber)}/pengundi`;
export const voterAreaBase = (electionNumber: number | string) => `${votersBase(electionNumber)}/kawasan`;
export const voterAgeBase = (electionNumber: number | string) => `${electionBase(electionNumber)}/pengundi/umur`;
export const voterEthnicityBase = (electionNumber: number | string) => `${electionBase(electionNumber)}/pengundi/kaum`;

// Backwards-compatible defaults for non-election modules while routes migrate to the context helpers.
export const ELECTION_BASE = electionBase(DEFAULT_ELECTION_NUMBER);
export const WINNERS_BASE = winnersBase(DEFAULT_ELECTION_NUMBER);
export const STATE_BASE = stateBase(DEFAULT_ELECTION_NUMBER);
export const PARLIAMENT_BASE = parliamentBase(DEFAULT_ELECTION_NUMBER);
export const VOTERS_BASE = votersBase(DEFAULT_ELECTION_NUMBER);
export const VOTER_AREA_BASE = voterAreaBase(DEFAULT_ELECTION_NUMBER);
export const VOTER_AGE_BASE = voterAgeBase(DEFAULT_ELECTION_NUMBER);
export const VOTER_ETHNICITY_BASE = voterEthnicityBase(DEFAULT_ELECTION_NUMBER);

export function stateElectionPath(stateSlug: string, assemblyNumber: number | string) {
  return `${stateElectionEditionPath(assemblyNumber)}/${stateSlug}/`;
}

export function stateElectionMapPath(stateSlug: string, assemblyNumber: number | string) {
  return `${stateElectionPath(stateSlug, assemblyNumber)}peta`;
}

export function stateDunResultPath(stateSlug: string, assemblyNumber: number | string, dunSlug: string) {
  return `${stateElectionPath(stateSlug, assemblyNumber)}dun/${dunSlug}`;
}

export function stateParliamentPath(electionNumber: number | string, stateSlug: string, parliamentSlug: string) {
  return `${stateBase(electionNumber)}/${stateSlug}/parlimen/${parliamentSlug}`;
}

export function dunPath(electionNumber: number | string, stateSlug: string, parliamentSlug: string, dunSlug: string) {
  return `${stateParliamentPath(electionNumber, stateSlug, parliamentSlug)}/dun/${dunSlug}`;
}

export function pdmPath(electionNumber: number | string, stateSlug: string, parliamentSlug: string, pdmSlug: string, dunSlug?: string) {
  const parent = dunSlug ? dunPath(electionNumber, stateSlug, parliamentSlug, dunSlug) : stateParliamentPath(electionNumber, stateSlug, parliamentSlug);
  return `${parent}/pdm/${pdmSlug}`;
}

export function localityPath(electionNumber: number | string, stateSlug: string, parliamentSlug: string, pdmSlug: string, localitySlug: string, dunSlug?: string) {
  return `${pdmPath(electionNumber, stateSlug, parliamentSlug, pdmSlug, dunSlug)}/lokaliti/${localitySlug}`;
}
