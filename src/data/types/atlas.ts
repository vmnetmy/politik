import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type AtlasElectionType = "pru" | "prn";
export type AtlasMetric = "pemenang" | "majoriti" | "keluar-mengundi" | "bertukar" | "perubahan-majoriti" | "perubahan-turnout" | "swing";

export type AtlasBoundaryProperties = {
  id: string;
  code: string;
  name: string;
  stateId: string;
  stateName: string;
  parliamentCode: string | null;
  areaKm2: number | null;
};

export type AtlasBoundaryFeature = Feature<Polygon | MultiPolygon, AtlasBoundaryProperties>;
export type AtlasBoundaryCollection = FeatureCollection<Polygon | MultiPolygon, AtlasBoundaryProperties>;

export type ElectionAtlasBoundaries = {
  version: number;
  metadata: {
    title: string;
    boundaryVersion: string;
    coordinateReference: string;
    sourceUrl: string;
    sourceSha256: string;
    retrievedAt: string;
    simplificationToleranceDegrees: number;
    parliamentFeatureCount: number;
    dunFeatureCount: number;
  };
  states: Array<{ id: string; name: string }>;
  stateFiles?: Record<string, string>;
  layers: {
    parliament: AtlasBoundaryCollection;
    dun: AtlasBoundaryCollection;
  };
};

export type ElectionAtlasStateBoundaries = Omit<ElectionAtlasBoundaries, "states" | "stateFiles"> & {
  state: { id: string; name: string };
};

export type BoundaryRegistryEntry = {
  boundaryVersion: string;
  effectiveFrom: string;
  status: "exact" | "compatible" | "approximate" | "identity-only";
  note: string;
  snapshotFile: string;
  stateFiles: Record<string, string>;
  states?: Record<string, BoundaryRegistryStateEntry>;
};

export type BoundaryRegistryStateEntry = {
  boundaryVersion: string;
  effectiveFrom: string;
  status: "exact" | "compatible" | "approximate" | "identity-only";
  note: string;
  orderReference: string;
  evidenceUrl: string;
  stateFile?: string;
  geometrySha256?: string;
  constituencyCount?: number;
};

export type ElectionBoundaryRegistry = {
  version: number;
  defaultBoundaryVersion: string;
  indexFile: string;
  federal: Record<string, BoundaryRegistryEntry>;
  stateAssemblies: Record<string, BoundaryRegistryEntry>;
};

export type AtlasUrlState = {
  electionType: AtlasElectionType;
  edition: number;
  metric: AtlasMetric;
  stateId: string;
  seatId: string;
  dunId: string;
  pdmId: string;
  localityId: string;
  compareEdition: number | null;
};
