import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import constituencies from "../public/data/elections/pru-15/constituencies.json";
import results from "../public/data/state-elections.json";
import schema from "../schemas/state-election.schema.json";

describe("official state-election data", () => {
  it("validates all latest state assemblies", () => {
    const validate = new Ajv2020({ allErrors: true, formats: { date: true } }).compile(schema);
    expect(validate(results), JSON.stringify(validate.errors, null, 2)).toBe(true);
    const latestEventIds = new Set(results.events.filter((item) => item.coverage === "latest").map((item) => item.id));
    const historicalEventIds = new Set(results.events.filter((item) => item.coverage === "historical").map((item) => item.id));
    const latestContests = results.contests.filter((item) => latestEventIds.has(item.eventId));
    const historicalContests = results.contests.filter((item) => historicalEventIds.has(item.eventId));
    expect(latestContests).toHaveLength(600);
    expect(new Set(latestContests.map((item) => item.dunId))).toEqual(new Set(constituencies.duns.map((item) => item.id)));
    expect(results.metadata).toMatchObject({
      eventCount: results.events.length,
      latestEventCount: latestEventIds.size,
      historicalEventCount: historicalEventIds.size,
      contestCount: results.contests.length,
      historicalContestCount: historicalContests.length,
      candidateCount: results.contests.reduce((total, contest) => total + contest.candidates.length, 0),
    });
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

  it("publishes the complete Johor PRN-15 result from SPR Open Data", () => {
    const johor = results.events.find((item) => item.id === "prn-johor-2022");
    expect(johor).toMatchObject({
      electionDate: "2022-03-12",
      assemblyNumber: 15,
      coverage: "historical",
      registeredVoters: 2597742,
      turnoutVotes: 1417115,
      seatCounts: { BN: 40, PH: 11, PN: 3, MUDA: 1, PKR: 1 },
    });
    expect(johor?.contestIds).toHaveLength(56);
    const johorContests = results.contests.filter((item) => item.eventId === johor?.id);
    expect(johorContests.flatMap((item) => item.candidates)).toHaveLength(239);
    expect(johorContests.find((item) => item.dunId.endsWith(":N.01"))).toMatchObject({
      registeredVoters: 28481,
      turnoutVotes: 16188,
      rejectedVotes: 464,
      unreturnedVotes: 67,
      turnoutPct: 0.5710000000000001,
      majorityVotes: 5377,
    });
  });

  it("publishes every PRN-14 contest with its gazetted electorate", () => {
    const events = results.events.filter((item) => item.assemblyNumber === 14);
    const eventIds = new Set(events.map((item) => item.id));
    const contests = results.contests.filter((item) => eventIds.has(item.eventId));
    expect(events).toHaveLength(11);
    expect(contests).toHaveLength(445);
    expect(contests.every((item) => item.registeredVoters && item.registeredVoters > 0)).toBe(true);
    expect(events.reduce((sum, event) => sum + event.registeredVoters, 0)).toBe(11698872);
    expect(events.find((item) => item.id === "prn-johor-2018")).toMatchObject({
      contestIds: expect.arrayContaining([expect.stringContaining("P.140:N.01")]),
      seatCounts: { PKR: 36, BN: 19, PAS: 1 },
    });
  });
});
