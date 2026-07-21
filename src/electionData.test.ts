import { describe, expect, it } from "vitest";
import election from "../public/data/election.json";

describe("governed election data", () => {
  it("uses the confirmed P.201 registered-voter total", () => {
    const batangLupar = election.seats.find((seat) => seat.code === "P.201");
    expect(batangLupar?.registered).toBe(43072);
    expect(batangLupar?.turnout).toBe(27559);
    expect(batangLupar?.turnoutPct).toBe(0.639836);
  });

  it("has no unresolved quality issues", () => {
    expect(election.metadata.issues).toEqual([]);
  });
});
