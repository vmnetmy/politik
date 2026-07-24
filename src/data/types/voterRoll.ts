export type VoterRollMetrics = {
  registered: number;
  ordinary: number;
  military: number;
  police: number;
  overseas: number;
  disabled: number;
  age18: number;
  age18To20: number;
  age21To30: number;
  age31To45: number;
  age46To59: number;
  age60Plus: number;
  male: number;
  female: number;
};

export type VoterRollState = VoterRollMetrics & {
  id: string;
  name: string;
  parliamentCodes: string[];
};

export type VoterRollParliament = VoterRollMetrics & {
  code: string;
  name: string;
  stateId: string;
  dunIds: string[];
  pdmIds: string[];
};

export type VoterRollDun = VoterRollMetrics & {
  id: string;
  code: string;
  name: string;
  stateId: string;
  parliamentCode: string;
  pdmIds: string[];
};

export type VoterRollPdm = VoterRollMetrics & {
  id: string;
  code: string;
  name: string;
  stateId: string;
  parliamentCode: string;
  dunId: string | null;
};

export type VoterRollData = {
  version: number;
  metadata: {
    title: string;
    electionId: string;
    snapshotYear: number;
    sourceUrl: string;
    sourceSha256: string;
    sourceRowCount: number;
    snapshotRegistered: number;
    electionRegistered: number;
    denominatorDifference: number;
    note: string;
  };
  national: VoterRollMetrics;
  states: VoterRollState[];
  parliaments: VoterRollParliament[];
  duns: VoterRollDun[];
  pdms: VoterRollPdm[];
};
