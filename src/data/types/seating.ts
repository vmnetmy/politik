export type SeatingPosition = {
  seatCode: string;
  sourceConstituency: string;
  x: number;
  y: number;
};

export type SeatingData = {
  version: number;
  sourceFile: string;
  sourceUpdatedAt: string;
  viewBox: { width: number; height: number };
  mappedSeatCount: number;
  unmappedSeatCodes: string[];
  positions: SeatingPosition[];
};

export type SeatingView = "current" | "election";
