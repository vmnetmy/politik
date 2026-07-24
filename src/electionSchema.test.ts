import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import pru14 from "../public/data/elections/pru-14/election.json";
import pru15 from "../public/data/elections/pru-15/election.json";
import registry from "../public/data/elections/index.json";
import schema from "../schemas/election.schema.json";
import registrySchema from "../schemas/election-registry.schema.json";

describe("election schema", () => {
  it("validates every edition-scoped result", () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    for (const election of [pru15, pru14]) {
      expect(validate(election), JSON.stringify(validate.errors, null, 2)).toBe(true);
      expect(election.seats).toHaveLength(election.metadata.seatCount);
      expect(election.seats.flatMap((seat) => seat.candidates)).toHaveLength(election.metadata.candidateCount);
    }
  });

  it("validates the published edition registry", () => {
    const validate = new Ajv({ allErrors: true }).compile(registrySchema);
    expect(validate(registry), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(registry.elections.some((edition) => edition.id === registry.defaultElectionId)).toBe(true);
    expect(new Set(registry.elections.map((edition) => edition.id)).size).toBe(registry.elections.length);
    expect(new Set(registry.elections.map((edition) => edition.number)).size).toBe(registry.elections.length);
    expect(registry.elections.filter((edition) => edition.isCurrentTerm)).toHaveLength(1);
  });
});
