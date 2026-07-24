export type StateElectionCandidate = {
  id: string;
  name: string;
  fullName: string;
  party: string;
  shortName: string;
  votes: number;
  status: "winner" | "runner-up" | "lost-deposit";
  share: number;
};

export type StateElectionContest = {
  id: string;
  eventId: string;
  stateId: string;
  dunId: string;
  parliamentCode: string;
  electionDate: string;
  registeredVoters: number | null;
  turnoutVotes: number | null;
  turnoutPct: number | null;
  validVotes: number;
  rejectedVotes: number | null;
  unreturnedVotes: number | null;
  majorityVotes: number;
  sourceMajorityVotes: number;
  winnerCandidateId: string;
  sourceDataset: "keputusan-pru-dun" | "keputusan-pru" | "keputusan-prk" | "mysemak-johor-2026" | "pub-246-johor-2026";
  candidates: StateElectionCandidate[];
};

export type StateElectionEvent = {
  id: string;
  type: "state";
  stateId: string;
  name: string;
  year: number;
  assemblyNumber: number;
  coverage: "latest" | "historical";
  electionDate: string;
  contestIds: string[];
  seatCounts: Record<string, number>;
  registeredVoters: number;
  turnoutVotes: number | null;
  turnoutPct: number | null;
};

export type StateElectionData = {
  version: number;
  metadata: {
    title: string;
    retrievedAt: string;
    sourceUrls: string[];
    sourceCitations: string[];
    sourceSha256: Record<string, string>;
    eventCount: number;
    latestEventCount: number;
    historicalEventCount: number;
    stateCount: number;
    contestCount: number;
    historicalContestCount: number;
    candidateCount: number;
    coverage: "latest-complete-plus-archive";
    issues: Array<{ contestId: string; field: string; sourceValue: number; computedValue: number; message: string }>;
  };
  events: StateElectionEvent[];
  contests: StateElectionContest[];
};

export type DunBoundaryFeature = {
  id: string;
  code: string;
  name: string;
  parliamentCode: string;
  path: string;
  centroid: [number, number];
  bounds: [number, number, number, number];
  areaKm2: number | null;
};

export type DunBoundaryData = {
  version: number;
  metadata: {
    title: string;
    stateId: string;
    boundaryVersion: string;
    coordinateReference: string;
    sourceUrl: string;
    sourceSha256: string;
    retrievedAt: string;
    featureCount: number;
    viewBox: { width: number; height: number };
    simplificationTolerancePx: number;
  };
  features: DunBoundaryFeature[];
};
