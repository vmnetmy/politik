export type SeatingPosition = {
  seatCode: string;
  sourceConstituency: string;
  sourceX: number;
  sourceY: number;
  x: number;
  y: number;
  section: "straight-left" | "straight-right" | "curved";
};

export type EmptySeatingPosition = {
  id: string;
  x: number;
  y: number;
  section: "curved";
};

export type SeatingData = {
  version: number;
  sourceFile: string;
  sourceUpdatedAt: string;
  viewBox: { width: number; height: number };
  layout: {
    strategy: "concentric-v1";
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
