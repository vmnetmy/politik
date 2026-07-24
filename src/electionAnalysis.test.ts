import { describe, expect, it } from "vitest";
import pru14 from "../public/data/elections/pru-14/election.json";
import pru15 from "../public/data/elections/pru-15/election.json";
import { summarizeElectionSeats } from "./data/electionAnalysis";
import type { ElectionData } from "./types";

describe("federal election analysis", () => {
  it.each([pru14, pru15])("derives historical totals without current-term overlays", (election) => {
    const data = election as ElectionData;
    const summary = summarizeElectionSeats(data.seats, "historical");
    expect(Object.values(summary.seatCounts).reduce((sum, count) => sum + count, 0)).toBe(data.metadata.seatCount);
    expect(summary.candidateCount).toBe(data.metadata.candidateCount);
    expect(summary.registered).toBeGreaterThan(0);
    expect(summary.validVotes).toBeGreaterThan(0);
    expect(summary.turnoutPct).toBeGreaterThan(0);
  });

  it("keeps federal editions independently comparable", () => {
    const earlier = summarizeElectionSeats((pru14 as ElectionData).seats, "historical");
    const later = summarizeElectionSeats((pru15 as ElectionData).seats, "historical");
    expect(earlier.occupiedSeats).toBe(222);
    expect(later.occupiedSeats).toBe(222);
    expect(later.registered).toBeGreaterThan(earlier.registered);
    expect(later.candidateCount).toBeGreaterThan(earlier.candidateCount);
  });
});
