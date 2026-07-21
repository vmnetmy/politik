export type SeatingPosition = {
  seatCode: string;
  physicalCode: string;
  sourceConstituency: string;
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  section: "straight-left" | "straight-right" | "curved";
};

export type EmptySeatingPosition = {
  id: string;
  physicalCode: string;
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  section: "straight-left" | "straight-right" | "curved";
};

export type SeatingData = {
  version: number;
  sourceFile: string;
  sourceSha256: string;
  sourceUpdatedAt: string;
  viewBox: { width: number; height: number };
  layout: {
    strategy: "svg-source-rect-v3";
    geometryFile: "SeatingDR.svg";
    geometrySha256: string;
    rasterFile: "SeatingDR-1.png";
    rasterSha256: string;
    physicalSeatCount: 280;
  };
  mappedSeatCount: number;
  unmappedSeatCodes: string[];
  positions: SeatingPosition[];
  emptyPositions: EmptySeatingPosition[];
};

export type SeatingView = "current" | "election";
