import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import kangar from "../public/data/scoresheets/P.002.json";
import batu from "../public/data/scoresheets/P.115.json";
import index from "../public/data/scoresheets/index.json";
import places from "../public/data/polling-places.json";
import schema from "../schemas/scoresheet.schema.json";

describe("scoresheet data", () => {
  it("validates ordinary and dense candidate layouts", () => {
    const validate = new Ajv2020({ allErrors: true, formats: { date: true } }).compile(schema);
    expect(validate(kangar), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(validate(batu), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(kangar.candidateColumns).toHaveLength(5);
    expect(batu.candidateColumns).toHaveLength(10);
  });

  it("publishes complete partial-coverage metadata", () => {
    expect(index.metadata).toMatchObject({ sourceCount: 56, coveredSeats: 56, totalSeats: 222, totalRows: 10136, printedPollingDistrictCount: 2255, syntheticPollingDistrictCount: 19 });
    expect(index.seats.every((item) => item.status === "authoritative")).toBe(true);
    expect(places.pollingDistricts).toHaveLength(2274);
  });

  it("balances every Kangar polling stream", () => {
    kangar.rows.forEach((row) => {
      expect(Object.values(row.candidateVotes).reduce((sum, value) => sum + value, 0)).toBe(row.validVotes);
      expect(row.validVotes + row.rejectedVotes + row.unreturnedVotes).toBe(row.ballotsInBox);
    });
  });
});
