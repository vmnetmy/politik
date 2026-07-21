import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import constituencies from "../public/data/constituencies.json";
import results from "../public/data/state-elections.json";
import schema from "../schemas/state-election.schema.json";

describe("official state-election data", () => {
  it("validates all latest state assemblies", () => {
    const validate = new Ajv2020({ allErrors: true, formats: { date: true } }).compile(schema);
    expect(validate(results), JSON.stringify(validate.errors, null, 2)).toBe(true);
    expect(new Set(results.contests.map((item) => item.dunId))).toEqual(new Set(constituencies.duns.map((item) => item.id)));
  });

  it("balances candidate votes and identifies exactly one winner", () => {
    results.contests.forEach((contest) => {
      expect(contest.candidates.reduce((sum, candidate) => sum + candidate.votes, 0)).toBe(contest.validVotes);
      expect(contest.candidates.filter((candidate) => candidate.status === "winner")).toHaveLength(1);
      expect(contest.candidates.some((candidate) => candidate.id === contest.winnerCandidateId && candidate.status === "winner")).toBe(true);
    });
  });

  it("includes Sabah 2025 and the delayed Tioman result", () => {
    const sabah = results.events.find((item) => item.id === "prn-sabah-2025");
    expect(sabah).toMatchObject({ electionDate: "2025-11-29", assemblyNumber: 17 });
    expect(sabah?.contestIds).toHaveLength(73);
    expect(results.contests.find((item) => item.eventId === "prn-sabah-2025")?.candidates.length).toBeGreaterThan(1);
    expect(results.contests.find((item) => item.eventId === "prn-pahang-2022" && item.dunId.endsWith(":N.42"))).toMatchObject({ electionDate: "2022-12-07", sourceDataset: "keputusan-prk" });
  });

  it("uses the final official Johor 2026 assembly result", () => {
    const johor = results.events.find((item) => item.id === "prn-johor-2026");
    expect(johor).toMatchObject({
      electionDate: "2026-07-11",
      assemblyNumber: 16,
      registeredVoters: 2727926,
      turnoutVotes: 1897668,
      turnoutPct: 0.6956449698415573,
      seatCounts: { BN: 48, PH: 8 },
    });
    expect(johor?.contestIds).toHaveLength(56);
    expect(results.metadata.sourceCitations).toContain("P.U. (B) 246, Warta Kerajaan Persekutuan, 20 Julai 2026");
    const johorContests = results.contests.filter((item) => item.eventId === johor?.id);
    expect(johorContests.flatMap((item) => item.candidates)).toHaveLength(172);
    expect(johorContests.find((item) => item.dunId.endsWith(":N.01"))).toMatchObject({
      sourceDataset: "pub-246-johor-2026",
      registeredVoters: 28973,
      turnoutVotes: 19771,
      rejectedVotes: 228,
      unreturnedVotes: 35,
      turnoutPct: 0.6823999999999999,
    });
  });
});
