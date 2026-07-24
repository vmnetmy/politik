import { describe, expect, it } from "vitest";
import constituencies from "../public/data/elections/pru-15/constituencies.json";
import voterAge from "../public/data/elections/pru-15/voter-age.json";

describe("voter-age reference data", () => {
  it("keeps identities reusable and statistics normalized", () => {
    expect(constituencies.states).toHaveLength(16);
    expect(constituencies.parliaments).toHaveLength(222);
    expect(constituencies.duns).toHaveLength(600);
    expect(voterAge.parliamentRecords).toHaveLength(222);
    expect(voterAge.dunRecords).toHaveLength(600);
    expect(new Set(constituencies.duns.map((dun) => dun.id)).size).toBe(600);
    expect(voterAge.dunRecords.every((record) => constituencies.duns.some((dun) => dun.id === record.dunId))).toBe(true);
  });

  it("preserves the source hierarchy and totals", () => {
    expect(constituencies.parliaments.find((item) => item.code === "P.001")).toMatchObject({
      name: "PADANG BESAR",
      dunIds: ["P.001:N.01", "P.001:N.02", "P.001:N.03", "P.001:N.04", "P.001:N.05"],
    });
    expect(constituencies.duns.find((item) => item.id === "P.001:N.01")).toMatchObject({ code: "N.01", name: "TITI TINGGI" });
    expect(voterAge.dunRecords.find((item) => item.dunId === "P.001:N.01")).toMatchObject({ total: 13403 });
    expect(voterAge.national.total).toBe(21173638);
  });
});
