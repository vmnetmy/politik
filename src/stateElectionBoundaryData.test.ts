import { describe, expect, it } from "vitest";
import boundaries from "../public/data/boundaries/semenanjung-2018/negeri-sembilan-dun.json";
import results from "../public/data/state-elections.json";

describe("Negeri Sembilan state-election boundary joins", () => {
  const event = results.events.find((item) => item.id === "prn-negeri-sembilan-2023")!;
  const contests = results.contests.filter((item) => event.contestIds.includes(item.id));

  it("joins every PRN-15 contest to one official DUN geometry", () => {
    expect(boundaries.features).toHaveLength(36);
    expect(contests).toHaveLength(36);
    expect(new Set(boundaries.features.map((feature) => feature.id))).toEqual(new Set(contests.map((contest) => contest.dunId)));
  });

  it("reproduces the official assembly composition", () => {
    const seatCounts = contests.reduce<Record<string, number>>((counts, contest) => {
      const winner = contest.candidates.find((candidate) => candidate.id === contest.winnerCandidateId)!;
      counts[winner.shortName] = (counts[winner.shortName] ?? 0) + 1;
      return counts;
    }, {});
    expect(seatCounts).toEqual({ PH: 17, BN: 14, PN: 5 });
    expect(event.seatCounts).toEqual(seatCounts);
  });
});
