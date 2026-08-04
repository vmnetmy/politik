export type Candidate = {
  id: string;
  electionId: string;
  candidacyId: string;
  personId: string;
  name: string;
  alliance: string;
  party: string;
  votes: number;
  share: number;
};

export type Winner = Candidate & {
  gender: string;
  ethnicity: string;
};

export type SeatStatus = "active" | "vacant" | "suspended";

export type AffiliationStatus = "party" | "independent";

export type AffiliationEvent = {
  id: string;
  electionId?: string;
  termId?: string;
  personId: string;
  seatCode: string;
  effectiveDate: string;
  status: AffiliationStatus;
  partyId: string | null;
  partyName: string;
  allianceId: string | null;
  allianceName: string;
  reason: string;
  sourceUrl?: string;
  createdAt: string;
};

export type CurrentAffiliation = {
  status: AffiliationStatus;
  partyId: string | null;
  party: string;
  allianceId: string | null;
  alliance: string;
  effectiveDate: string;
  reason: string;
  sourceUrl?: string;
  eventId?: string;
  isChanged: boolean;
};

export type DataChange = {
  id: string;
  electionId?: string;
  seatCode: string;
  effectiveDate: string;
  status: SeatStatus;
  alliance: string;
  party: string;
  reason: string;
  sourceUrl?: string;
  createdAt: string;
};

export type CandidateChange = {
  id: string;
  electionId?: string;
  seatCode: string;
  candidateIndex: number;
  effectiveDate: string;
  name: string;
  alliance: string;
  party: string;
  gender?: string;
  ethnicity?: string;
  reason: string;
  sourceUrl?: string;
  createdAt: string;
};

export type CurrentSeatState = {
  status: SeatStatus;
  alliance: string;
  party: string;
  effectiveDate: string;
  reason: string;
  sourceUrl?: string;
  changeId?: string;
  isChanged: boolean;
  affiliation?: CurrentAffiliation;
};

export type Seat = {
  electionId: string;
  contestId: string;
  code: string;
  state: string;
  name: string;
  registered: number;
  validVotes?: number;
  rejectedVotes?: number;
  unreturnedVotes?: number;
  turnout: number;
  turnoutPct: number;
  candidateCount: number;
  marginVotes: number;
  marginShare: number;
  winner: Winner;
  candidates: Candidate[];
  current?: CurrentSeatState;
};

export type Alliance = {
  name: string;
  shortName: string;
  color: string;
};

export type AllianceCatalogItem = Alliance & {
  id: string;
  sourceName: string;
  aliases: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PartyCatalogItem = {
  id: string;
  sourceName: string;
  aliases: string[];
  name: string;
  shortName: string;
  alliance: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ElectionData = {
  metadata: {
    electionId: string;
    electionNumber: number;
    termId: string;
    boundaryVersion: string;
    title: string;
    shortTitle: string;
    electionDate: string;
    sourceFile: string;
    seatCount: number;
    candidateCount: number;
    stateCount: number;
    issues: Array<{ seat: string; field: string; message: string }>;
  };
  alliances: Alliance[];
  seats: Seat[];
};

export type { SeatingData, SeatingPosition } from "./data/types/seating";
export type { PollingCentre, PollingDistrict, PollingPlacesData, ScoresheetCandidateColumn, ScoresheetIndex, ScoresheetIndexEntry, ScoresheetResult, ScoresheetRow, ScoresheetSection } from "./data/types/scoresheet";
export type { AgeBand, AgeCounts, AgeRecord, ConstituencyRegistry, ConstituencyState, DunReference, ParliamentReference, VoterAgeData } from "./data/types/voterAge";
export type { EthnicityCategory, VoterEthnicityData } from "./data/types/voterEthnicity";
export type { GeographyData, GeographyLocality, GeographyPdm } from "./data/types/geography";
export type { DunBoundaryData, DunBoundaryFeature, StateElectionCandidate, StateElectionContest, StateElectionData, StateElectionEvent } from "./data/types/stateElection";
export type { StateScoresheetIndex, StateScoresheetResult } from "./data/types/stateScoresheet";

export type StateSummary = {
  state: string;
  seats: number;
  registered: number;
  validVotes: number;
  turnout: number;
  turnoutPct: number;
  leader: string;
  leaderSeats: number;
  seatCounts: Record<string, number>;
};
