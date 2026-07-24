export type EthnicityCategory = {
  id: string;
  label: string;
  sourceLabel: string;
};

export type VoterEthnicityData = {
  version: number;
  metadata: {
    title: string;
    availability: "taxonomy-only";
    aggregateStatus: "not-published";
    authority: string;
    checkedAt: string;
    totalRegistered: number;
    sourceDataset: string;
    sourceCatalogueUrl: string;
    sourceTaxonomyUrl: string;
    publishedDimensions: string[];
  };
  categories: EthnicityCategory[];
  records: never[];
};
