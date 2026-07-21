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
    expect(new Set(seating.positions.filter((position) => position.section === "straight-left").map((position) => position.x)).size).toBe(5);
    expect(new Set(seating.positions.filter((position) => position.section === "straight-left").map((position) => position.y)).size).toBe(10);
  });
});
