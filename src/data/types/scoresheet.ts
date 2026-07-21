export type ScoresheetSection = "postal" | "early" | "ordinary";

export type ScoresheetCandidateColumn = {
  candidateId: string;
  candidateName: string;
  column: number;
  scoresheetVotes: number;
};

export type ScoresheetRow = {
  id: string;
  section: ScoresheetSection;
  sequence: number;
  pollingDistrictId: string | null;
  pollingCentreId: string | null;
  streamNumber: number | null;
  ballotsInBox: number;
  candidateVotes: Record<string, number>;
  validVotes: number;
  rejectedVotes: number;
  unreturnedVotes: number;
};

export type ScoresheetResult = {
  version: number;
  metadata: {
    title: string;
    sourceFile: string;
    sourceSha256: string;
    sourcePages: number;
    printDate: string;
  };
  parliamentCode: string;
  registeredVoters: number;
  candidateColumns: ScoresheetCandidateColumn[];
  rows: ScoresheetRow[];
  totals: {
    pollingStreams: number;
    ballotsInBox: number;
    candidateVotes: Record<string, number>;
    validVotes: number;
    rejectedVotes: number;
    unreturnedVotes: number;
  };
};

export type ScoresheetIndexEntry = {
  parliamentCode: string;
  parliamentName: string;
  state: string;
  sourceFile: string;
  sourceSha256: string;
  pages: number;
  rowCount: number;
  pollingDistrictCount: number;
  pollingCentreCount: number;
  status: "authoritative";
};

export type ScoresheetIndex = {
  version: number;
  metadata: {
    title: string;
    electionDate: string;
    printDate: string;
    sourceCount: number;
    coveredSeats: number;
    totalSeats: number;
    coveragePct: number;
    totalPages: number;
    totalRows: number;
    pollingDistrictCount: number;
    printedPollingDistrictCount: number;
    syntheticPollingDistrictCount: number;
    pollingCentreCount: number;
    ballotsInBox: number;
    validVotes: number;
    rejectedVotes: number;
    unreturnedVotes: number;
  };
  seats: ScoresheetIndexEntry[];
};

export type PollingDistrict = {
  id: string;
  code: string;
  name: string;
  parliamentCode: string;
  section: Exclude<ScoresheetSection, "postal">;
  pollingCentreIds: string[];
};

export type PollingCentre = {
  id: string;
  name: string;
  parliamentCode: string;
  pollingDistrictId: string;
  streamCount: number;
};

export type PollingPlacesData = {
  version: number;
  metadata: {
    sourceCount: number;
    coveredSeats: number;
  };
  pollingDistricts: PollingDistrict[];
  pollingCentres: PollingCentre[];
};
