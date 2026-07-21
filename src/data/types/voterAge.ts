export type AgeBand = "18-20" | "21-29" | "30-39" | "40-49" | "50-59" | "60-69" | "70-79" | "80-89" | "90+";

export type AgeCounts = Record<AgeBand, number>;

export type ConstituencyState = {
  id: string;
  name: string;
  parliamentCodes: string[];
};

export type ParliamentReference = {
  code: string;
  name: string;
  stateId: string;
  dunIds: string[];
};

export type DunReference = {
  id: string;
  code: string;
  name: string;
  stateId: string;
  parliamentCode: string;
};

export type ConstituencyRegistry = {
  version: number;
  sourceFile: string;
  sourceSha256: string;
  states: ConstituencyState[];
  parliaments: ParliamentReference[];
  duns: DunReference[];
};

export type AgeRecord = {
  total: number;
  counts: AgeCounts;
};

export type VoterAgeData = {
  version: number;
  metadata: {
    title: string;
    sourceFile: string;
    sourceSha256: string;
    sourceUpdatedAt: string;
    electoralRollThrough: string;
    ageBands: AgeBand[];
    totalRegistered: number;
  };
  national: AgeRecord;
  stateRecords: Array<AgeRecord & { stateId: string }>;
  parliamentRecords: Array<AgeRecord & { parliamentCode: string }>;
  dunRecords: Array<AgeRecord & { dunId: string }>;
};
