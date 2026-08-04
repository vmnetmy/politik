import type { PollingCentre, PollingDistrict, ScoresheetCandidateColumn, ScoresheetRow } from "./scoresheet";

export type StateScoresheetResult = {
  version: number;
  metadata: {
    title: string;
    sourceType: "spr-scoresheet-xlsx";
    sourceFile: string;
    sourceSha256: string;
    sourceUrl: string;
    sourceStatsUrl: string;
    electionDate: string;
  };
  contestId: string;
  eventId: string;
  stateId: string;
  dunId: string;
  dunCode: string;
  registeredVoters: number;
  candidateColumns: ScoresheetCandidateColumn[];
  rows: ScoresheetRow[];
  pollingDistricts: PollingDistrict[];
  pollingCentres: PollingCentre[];
  totals: {
    pollingStreams: number;
    ballotsInBox: number;
    candidateVotes: Record<string, number>;
    validVotes: number;
    rejectedVotes: number;
    unreturnedVotes: number;
  };
};

export type StateScoresheetIndex = {
  version: number;
  metadata: {
    title: string;
    electionDate: string;
    sourceCount: number;
    publishedContests: number;
    rejectedSourceCount: number;
    missingSourceCount: number;
    uncontestedCount: number;
    coveredContests: number;
    totalContests: number;
    coveragePct: number;
    totalRows: number;
  };
  contests: Array<{
    contestId: string;
    eventId: string;
    stateId: string;
    dunId: string;
    dunCode: string;
    resultFile: string;
    rowCount: number;
    pollingDistrictCount: number;
    pollingCentreCount: number;
    status: "authoritative";
  }>;
  unavailableContests: Array<{
    contestId: string;
    eventId: string;
    stateId: string;
    dunId: string;
    dunCode: string;
    category: "missing-source" | "rejected-source" | "uncontested";
    reason: string;
  }>;
};
