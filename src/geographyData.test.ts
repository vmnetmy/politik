import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import constituencies from "../public/data/elections/pru-15/constituencies.json";
import geography from "../public/data/elections/pru-15/geography.json";
import schema from "../schemas/geography.schema.json";

describe("SPR geography hierarchy", () => {
  it("validates the normalized publication", () => {
    const validate = new Ajv2020({ allErrors: true, formats: { date: true } }).compile(schema);
    expect(validate(geography), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it("reuses every Parliament and DUN identity without inventing federal DUNs", () => {
    expect(new Set(geography.pdms.map((item) => item.parliamentCode)).size).toBe(222);
    expect(new Set(geography.pdms.flatMap((item) => item.dunId ? [item.dunId] : [])).size).toBe(600);
    expect(geography.pdms.every((item) => constituencies.parliaments.some((parliament) => parliament.code === item.parliamentCode))).toBe(true);
    expect(geography.pdms.filter((item) => item.stateId === "wp-kuala-lumpur").every((item) => item.dunId === null)).toBe(true);
  });

  it("keeps locality coverage explicit and source-backed", () => {
    expect(geography.metadata.localityCoverage).toBe("partial");
    expect(geography.metadata.localityCoveragePct).toBeCloseTo(0.0258, 4);
    expect(geography.localities).toHaveLength(13);
    expect(geography.localities.every((item) => item.sourceRefs.every((source) => source.url.startsWith("https://sprinfo.spr.gov.my/")))).toBe(true);
    expect(geography.metadata.localityConflictCount).toBe(0);
  });
});
