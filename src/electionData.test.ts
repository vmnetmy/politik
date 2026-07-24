import { describe, expect, it } from "vitest";
import election from "../public/data/elections/pru-15/election.json";

describe("governed election data", () => {
  it("uses the confirmed P.201 registered-voter total", () => {
    const batangLupar = election.seats.find((seat) => seat.code === "P.201");
    expect(batangLupar?.registered).toBe(43072);
    expect(batangLupar?.validVotes).toBe(27559);
    expect(batangLupar?.turnout).toBe(28118);
    expect(batangLupar?.turnoutPct).toBe(0.652814);
  });

  it("has no unresolved quality issues", () => {
    expect(election.metadata.issues).toEqual([]);
  });

  it("namespaces every contest and candidacy to PRU-15", () => {
    expect(election.seats.every((seat) => seat.electionId === election.metadata.electionId && seat.contestId === `pru-15:${seat.code}`)).toBe(true);
    expect(election.seats.every((seat) => seat.candidates.every((candidate) => candidate.electionId === "pru-15" && candidate.candidacyId.startsWith(`pru-15:${seat.code}:`) && candidate.personId.startsWith("person:")))).toBe(true);
  });
});
