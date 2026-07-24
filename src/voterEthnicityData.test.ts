import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import voterEthnicity from "../public/data/elections/pru-15/voter-ethnicity.json";
import schema from "../schemas/voter-ethnicity.schema.json";

describe("official SPR voter ethnicity coverage", () => {
  it("matches the publication-status contract", () => {
    const validate = new Ajv({ allErrors: true }).compile(schema);
    expect(validate(voterEthnicity), JSON.stringify(validate.errors)).toBe(true);
  });

  it("publishes the MySPR taxonomy without fabricating aggregate records", () => {
    expect(voterEthnicity.metadata.availability).toBe("taxonomy-only");
    expect(voterEthnicity.metadata.aggregateStatus).toBe("not-published");
    expect(voterEthnicity.categories).toHaveLength(9);
    expect(new Set(voterEthnicity.categories.map((item) => item.id)).size).toBe(9);
    expect(voterEthnicity.categories.map((item) => item.label)).toEqual(expect.arrayContaining([
      "MELAYU",
      "CINA",
      "INDIA",
      "BUMIPUTRA SABAH",
      "BUMIPUTRA SARAWAK",
      "ORANG ASLI (SEMENANJUNG)",
    ]));
    expect(voterEthnicity.records).toEqual([]);
  });
});
