export type GeographyPdm = {
  id: string;
  code: string;
  name: string;
  slug: string;
  stateId: string;
  parliamentCode: string;
  dunId: string | null;
  registeredVoters: number;
  voterCategories: {
    ordinary: number;
    military: number;
    police: number;
    overseasAbsent: number;
    disabled: number;
  };
  ageGroups: Record<"18-20" | "21-30" | "31-45" | "46-59" | "60+", number>;
  gender: { male: number; female: number };
  hasScoresheet: boolean;
  pollingCentreIds: string[];
  localityIds: string[];
};

export type GeographyLocality = {
  id: string;
  code: string;
  name: string;
  slug: string;
  pdmId: string;
  stateId: string;
  parliamentCode: string;
  dunId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceRefs: Array<{
    id: string;
    url: string;
    label: string;
    publishedAt: string;
  }>;
};

export type GeographyData = {
  version: number;
  metadata: {
    title: string;
    snapshotYear: number;
    retrievedAt: string;
    sourceUrls: string[];
    sourceSha256: Record<string, string>;
    stateCount: number;
    parliamentCount: number;
    dunCount: number;
    pdmCount: number;
    scoresheetPdmCount: number;
    localityCount: number;
    localityPdmCount: number;
    localityCoveragePct: number;
    localityCoverage: "partial" | "complete";
    localitySourceCount: number;
    localitySnapshotRange: { from: string | null; to: string | null };
    localityConflictCount: number;
    localityCoverageByState: Record<string, { pdmCount: number; coveredPdmCount: number }>;
  };
  pdms: GeographyPdm[];
  localities: GeographyLocality[];
  localityConflicts: Array<{
    localityId: string;
    existingName: string;
    incomingName: string;
    sourceId: string;
  }>;
};
