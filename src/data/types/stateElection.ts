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
    stateCount: number;
    contestCount: number;
    candidateCount: number;
    coverage: "latest-complete";
    issues: Array<{ contestId: string; field: string; sourceValue: number; computedValue: number; message: string }>;
  };
  events: StateElectionEvent[];
  contests: StateElectionContest[];
};
