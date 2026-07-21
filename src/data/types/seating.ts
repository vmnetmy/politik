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
    strategy: "concentric-rect-v2";
    straightRows: number;
    straightColumns: number;
    curvedRings: number;
    curvedSlotsPerRing: number;
  };
  mappedSeatCount: number;
  unmappedSeatCodes: string[];
  positions: SeatingPosition[];
  emptyPositions: EmptySeatingPosition[];
};

export type SeatingView = "current" | "election";
