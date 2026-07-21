import { describe, expect, it } from "vitest";
import election from "../public/data/election.json";
import reconciliation from "../public/data/result-reconciliation.json";
import { applyApprovedReconciliation, parseReconciliationFile } from "./resultReconciliation";

describe("result reconciliation", () => {
  it("keeps every source conflict pending until reviewed", () => {
    const parsed = parseReconciliationFile(reconciliation);
    expect(parsed.conflicts).toHaveLength(7);
    expect(parsed.conflicts.every((item) => item.decision === "pending")).toBe(true);
  });

  it("applies an approved correction atomically", () => {
    const parsed = parseReconciliationFile(reconciliation);
    const target = parsed.conflicts.find((item) => item.parliamentCode === "P.028")!;
    const seats = applyApprovedReconciliation(election.seats, [{ ...target, decision: "approved" }]);
    const seat = seats.find((item) => item.code === "P.028")!;
    expect(seat.turnout).toBe(81175);
    expect(seat.candidates.reduce((sum, candidate) => sum + candidate.votes, 0)).toBe(81175);
    expect(seat.winner.votes).toBe(53108);
    expect(seat.marginVotes).toBe(29264);
  });
});
