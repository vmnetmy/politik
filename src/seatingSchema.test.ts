import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import seating from "../public/data/seating.json";
import schema from "../schemas/seating.schema.json";

describe("seating schema", () => {
  it("validates the published seating artifact", () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    expect(validate(seating), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(seating.positions.length + seating.unmappedSeatCodes.length).toBe(222);
    expect(seating.emptyPositions).toHaveLength(60);
    expect(new Set([...seating.positions, ...seating.emptyPositions].map((position) => position.physicalCode)).size).toBe(280);
    expect(seating.layout.strategy).toBe("svg-source-rect-v3");
    expect(seating.layout.physicalSeatCount).toBe(280);
    expect(seating.positions.find((position) => position.seatCode === "P.056")).toMatchObject({ physicalCode: "G1", x: 443, y: 805 });
    expect(seating.positions.find((position) => position.seatCode === "P.173")).toMatchObject({ physicalCode: "C22", x: 861, y: 339 });
  });
});
