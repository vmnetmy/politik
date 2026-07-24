import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import kangar from "../public/data/elections/pru-15/scoresheets/P.002.json";
import batu from "../public/data/elections/pru-15/scoresheets/P.115.json";
import padangBesar from "../public/data/elections/pru-15/scoresheets/P.001.json";
import index from "../public/data/elections/pru-15/scoresheets/index.json";
import places from "../public/data/elections/pru-15/polling-places.json";
import schema from "../schemas/scoresheet.schema.json";

describe("scoresheet data", () => {
  it("validates ordinary and dense candidate layouts", () => {
    const validate = new Ajv2020({ allErrors: true, formats: { date: true, uri: true } }).compile(schema);
    expect(validate(kangar), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(validate(batu), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(validate(padangBesar), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(kangar.candidateColumns).toHaveLength(5);
    expect(batu.candidateColumns).toHaveLength(10);
  });

  it("publishes complete coverage with explicit source tiers", () => {
    expect(index.metadata).toMatchObject({ sourceCount: 58, coveredSeats: 222, totalSeats: 222, coveragePct: 1, authoritativeSeats: 56, supplementarySeats: 166, totalRows: 39540, syntheticPollingDistrictCount: 19 });
    expect(index.seats.filter((item) => item.status === "authoritative")).toHaveLength(56);
    expect(index.seats.filter((item) => item.status === "supplementary")).toHaveLength(166);
    expect(places.pollingDistricts).toHaveLength(8278);
  });

  it("balances every Kangar polling stream", () => {
    kangar.rows.forEach((row) => {
      expect(Object.values(row.candidateVotes).reduce((sum, value) => sum + value, 0)).toBe(row.validVotes);
      expect(row.validVotes + row.rejectedVotes + row.unreturnedVotes).toBe(row.ballotsInBox);
    });
  });

  it("balances every supplementary open-data stream", () => {
    padangBesar.rows.forEach((row) => {
      expect(Object.values(row.candidateVotes).reduce((sum, value) => sum + value, 0)).toBe(row.validVotes);
      expect(row.validVotes + row.rejectedVotes + row.unreturnedVotes).toBe(row.ballotsInBox);
    });
  });
});
